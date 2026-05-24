/* ============================================================
   ESSENSPLANER – Mahlzeitenplan (14 Tage, Mo–So)
   - Meal Prep: ein Gericht für X Portionen am Kochtag, Folgetage
     "aufgewärmt".
   - Frühstück & Snack werden in Mehrtagesblöcken geplant
     (prepBatchDays), damit nur einmal vorbereitet werden muss.
   - Einkaufstage werden im Plan angezeigt.
   - Geschätzte Kosten + Budget-Abgleich.
   ============================================================ */

let curPlanWeek = 1;
const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const SLOTS = [
  { k: 'breakfast', ic: '🌅', lb: 'Früh' },
  { k: 'lunch', ic: '☀️', lb: 'Mittag' },
  { k: 'dinner', ic: '🌙', lb: 'Abend' },
  { k: 'snack', ic: '🥜', lb: 'Snack' },
];
// Fallback falls keine Snack-Rezepte in der DB vorhanden (sollte selten sein)
const SNACKS = [
  { name: 'Skyr mit Beeren (150 g)', protein: 16, kcal: 170, cost: 1.5 },
  { name: 'Protein-Shake', protein: 25, kcal: 200, cost: 1.5 },
  { name: 'Edamame mit Meersalz (200 g)', protein: 16, kcal: 190, cost: 1.7 },
  { name: 'Hartgekochte Eier (2 Stück)', protein: 13, kcal: 155, cost: 0.8 },
  { name: 'Magerquark-Bowl mit Kakao & Banane', protein: 18, kcal: 185, cost: 1.0 },
];

/* Welche Tage sind Einkaufstage? */
function shoppingDays() {
  const iv = DB.settings.shopInterval || 14;
  const days = { 1: 'big' };
  if (iv <= 7) days[8] = 'big';
  else if (DB.groceries.some((g) => isPerishable(g.n))) days[8] = 'fresh'; // Nachkauf nur wenn nötig
  return days;
}

function renderMealPlan() {
  const el = document.getElementById('page-mealplan');
  DB.mealplan.forEach(recalcDay);
  el.innerHTML = `
    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
      <div class="tabs" id="plan-week-tabs">
        <div class="tab ${curPlanWeek === 1 ? 'active' : ''}" onclick="switchPlanWeek(1)">Woche 1 · Tag 1–7</div>
        <div class="tab ${curPlanWeek === 2 ? 'active' : ''}" onclick="switchPlanWeek(2)">Woche 2 · Tag 8–14</div>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-sm" onclick="autoGeneratePlan()">⚡ Auto-Plan</button>
        <button class="btn btn-sm btn-primary" onclick="openAddMealModal()">+ Mahlzeit</button>
      </div>
    </div>
    <div class="plan-wrap" id="plan-grid"></div>
    <div id="plan-status" class="mt-2"></div>
    <div class="alert alert-blue mt-1">📦 <strong>Gelb = aufgewärmt.</strong> Frühstück & Snack werden für je ${DB.settings.prepBatchDays || 3} Tage am Stück geplant – einmal vorbereiten reicht.
      🛒 zeigt deine Einkaufstage (Rhythmus in den Einstellungen).</div>`;
  renderPlanGrid();
  document.getElementById('plan-status').innerHTML = planStatusHtml();
}

function renderPlanGrid() {
  const days = DB.mealplan.slice((curPlanWeek - 1) * 7, curPlanWeek * 7);
  const colW = '34px repeat(7, minmax(80px, 1fr))';
  const shop = shoppingDays();
  let html = `<div style="display:grid;grid-template-columns:${colW};gap:3px;min-width:660px">`;

  // Kopfzeile
  html += '<div></div>' + days.map((d, i) =>
    `<div class="plan-col-header">${DAY_NAMES[i]}<br><small style="opacity:.6">Tag ${d.day}</small></div>`).join('');

  // Einkaufszeile
  html += '<div style="display:flex;align-items:center;justify-content:center;font-size:13px">🛒</div>';
  days.forEach((d) => {
    const t = shop[d.day];
    html += `<div style="text-align:center;display:flex;align-items:center;justify-content:center;min-height:24px">${
      t === 'big' ? '<span class="badge badge-amber" style="font-size:9px">Großeinkauf</span>'
        : t === 'fresh' ? '<span class="badge badge-green" style="font-size:9px">Frisch-Einkauf</span>'
          : ''}</div>`;
  });

  // Mahlzeiten-Zeilen
  SLOTS.forEach((s) => {
    html += `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;color:var(--text3)">${s.ic}<br>${s.lb}</div>`;
    days.forEach((d) => {
      const m = d[s.k];
      if (!m) {
        html += `<div class="meal-cell empty-cell" onclick="openAddMealModal(${d.day},'${s.k}')">+</div>`;
      } else {
        html += `<div class="meal-cell ${m.reheated ? 'reheated' : 'filled'}" onclick="openMealDetail(${d.day},'${s.k}')">
          <div class="meal-name">${esc(m.name)}</div>
          <div class="meal-macro">${m.protein || 0}g P${(m.mult && Math.abs(m.mult - 1) > 0.05) ? ' · ' + (Math.round(m.mult * 10) / 10).toString().replace('.', ',') + '×' : ''}</div>
          ${m.reheated ? '<div class="meal-tag" style="color:var(--amber)">♻ Aufgewärmt</div>'
            : m.rid ? '<div class="meal-tag" style="color:var(--accent)">🍳 Frisch</div>' : ''}
        </div>`;
      }
    });
  });

  // Protein- & Kalorien-Summen pro Tag
  const pGoal = DB.settings.proteinGoal || 120;
  const kGoal = DB.settings.kcalGoal || 2200;
  html += '<div style="display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text3);text-align:center">Tag<br>gesamt</div>';
  days.forEach((d) => {
    const p = d.totalProtein || 0, k = d.totalKcal || 0;
    const pOk = p >= pGoal - 10;
    const kOk = Math.abs(k - kGoal) <= kGoal * 0.15;
    html += `<div style="text-align:center;padding:5px 2px">
      <div style="font-size:12px;font-weight:700;color:${pOk ? 'var(--accent)' : 'var(--amber)'}">${p} g P</div>
      <div style="font-size:11px;font-weight:600;color:${kOk ? 'var(--text2)' : 'var(--amber)'}">${k.toLocaleString('de-CH')} kcal</div></div>`;
  });
  html += '</div>';
  document.getElementById('plan-grid').innerHTML = html;
}

function switchPlanWeek(w) {
  curPlanWeek = w;
  renderMealPlan();
}

function recalcDay(d) {
  if (!d) return;
  d.totalProtein = SLOTS.reduce((s, sl) => s + ((d[sl.k] && d[sl.k].protein) || 0), 0);
  d.totalKcal = SLOTS.reduce((s, sl) => s + mealKcal(d[sl.k]), 0);
}

/* ============================================================
   ZIEL-ABGLEICH – wie gut trifft der Plan Protein/kcal/Budget?
   ============================================================ */
function planTargetReport(plan) {
  plan = plan || DB.mealplan;
  plan.forEach(recalcDay);
  const pGoal = DB.settings.proteinGoal || 120;
  const kGoal = DB.settings.kcalGoal || 2200;
  const budget = budgetForWindow();
  const n = plan.length || 1;
  let sumP = 0, sumK = 0;
  plan.forEach((d) => { sumP += d.totalProtein || 0; sumK += d.totalKcal || 0; });
  const avgP = Math.round(sumP / n), avgK = Math.round(sumK / n), cost = planCost(plan);
  const issues = [];
  if (avgP < pGoal - 8) {
    issues.push(`Protein: Ø ${avgP} g/Tag – dein Ziel von ${pGoal} g wird nicht erreicht.`);
  }
  if (avgK > kGoal + kGoal * 0.12) {
    issues.push(`Kalorien: Ø ${avgK} kcal/Tag liegt deutlich über deinem Ziel von ${kGoal} kcal.`);
  } else if (avgK < kGoal - kGoal * 0.12) {
    issues.push(`Kalorien: Ø ${avgK} kcal/Tag liegt deutlich unter deinem Ziel von ${kGoal} kcal.`);
  }
  if (budget > 0 && cost > budget * 1.05) {
    issues.push(`Budget: geschätzt ${fmtMoney(cost)} – über deinem Budget von ${fmtMoney(budget)}.`);
  }
  return { avgP, avgK, cost, issues, ok: !issues.length };
}

function planStatusHtml() {
  const rep = planTargetReport(DB.mealplan);
  const pGoal = DB.settings.proteinGoal || 120;
  const kGoal = DB.settings.kcalGoal || 2200;
  const budget = budgetForWindow();
  const pOk = rep.avgP >= pGoal - 8;
  const kOk = Math.abs(rep.avgK - kGoal) <= kGoal * 0.12;
  const bOk = !(budget > 0) || rep.cost <= budget * 1.05;
  const tile = (label, val, sub, ok) => `<div class="stat">
    <div class="stat-label">${label}</div>
    <div class="stat-value" style="font-size:18px;color:${ok ? 'var(--accent)' : 'var(--amber)'}">${val}</div>
    <div class="stat-sub">${sub}</div></div>`;
  let html = '<div class="grid-3 mb-1" style="gap:8px">'
    + tile('Ø Protein / Tag', rep.avgP + ' g', 'Ziel ' + pGoal + ' g', pOk)
    + tile('Ø Kalorien / Tag', rep.avgK.toLocaleString('de-CH'), 'Ziel ' + kGoal.toLocaleString('de-CH') + ' kcal', kOk)
    + tile('Kosten · 14 Tage', fmtMoney(rep.cost), budget > 0 ? 'Budget ' + fmtMoney(budget) : 'kein Budget gesetzt', bOk)
    + '</div>';
  if (rep.ok) {
    html += '<div class="alert alert-green">✓ Der Plan trifft deine Ziele.</div>';
  } else {
    html += `<div class="alert alert-amber"><strong>Hinweis:</strong> ${rep.issues.map(esc).join(' ')}
      Tipp: <a onclick="autoGeneratePlan()" style="color:var(--accent);cursor:pointer;font-weight:600">Plan neu erstellen</a>,
      mehr Rezepte anlegen oder Ziele/Budget in den <a onclick="navigate('settings')" style="color:var(--accent);cursor:pointer;font-weight:600">Einstellungen</a> anpassen.</div>`;
  }
  return html;
}

function showPlanIssues(rep) {
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" style="max-width:460px">
      <div class="modal-head"><div class="modal-title">⚠️ Ziele nicht ganz erreicht</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <p class="text-sm text-muted mb-2">Der Plan wurde erstellt, aber mit den aktuellen Rezepten und Vorgaben werden nicht alle Ziele getroffen:</p>
        <ul style="margin:0 0 12px 18px;font-size:13px;line-height:1.7">
          ${rep.issues.map((i) => `<li>${esc(i)}</li>`).join('')}
        </ul>
        <p class="text-sm" style="font-weight:600;margin-bottom:4px">Das kannst du tun:</p>
        <ul style="margin:0 0 12px 18px;font-size:13px;line-height:1.7;color:var(--text2)">
          <li>Mehr passende Rezepte anlegen oder unter „Entdecken" importieren.</li>
          <li>Beim Auto-Plan die Option „Online-Rezepte (Spoonacular)" aktivieren.</li>
          <li>Ziele oder Budget in den Einstellungen realistischer einstellen.</li>
        </ul>
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-primary" onclick="closeModal();addPlanIngredientsToGroceries()">Zutaten zur Einkaufsliste</button>
          <button class="btn btn-sm" onclick="closeModal()">Schließen</button>
        </div>
      </div>
    </div>
  </div>`);
}

/* ============================================================
   AUTO-PLAN-OPTIMIERER
   Der Plan wird so zusammengestellt, dass er Protein- und
   Kalorienziel möglichst trifft und im Budget bleibt. Bei
   knappem Budget hat Protein Vorrang. Meal-Prep-Blöcke bleiben
   erhalten (Frühstück/Snack in Mehrtagesblöcken, Mittag/Abend
   nach Portionen).
   ============================================================ */
function mealFromRecipe(r, reheated) {
  return {
    name: r.name, protein: r.protein || 0, kcal: r.kcal || 0,
    cost: r.cost || 3, cuisine: r.cuisine || '', rid: r.id,
    liked: !!r._liked, reheated: !!reheated,
  };
}

function splitTerms(str) {
  return String(str || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function recipeHasTerms(r, terms) {
  const hay = (r.name + ' ' + (r.ingredients || []).map((i) => i.n).join(' ')).toLowerCase();
  return terms.some((t) => t && hay.includes(t));
}

function readPlanPrefs() {
  const s = DB.settings;
  return {
    cuisines: Array.isArray(s.planCuisines) ? s.planCuisines : [],
    likes: splitTerms(s.planLikes),
    dislikes: splitTerms(s.planDislikes),
  };
}

/* KH-Timing aktiv? Explizit gesetzt -> diese Wahl; sonst
   automatisch an, wenn das Ziel „Muskelaufbau" ist. */
function carbTimingActive() {
  const s = DB.settings;
  return s.carbTiming != null ? !!s.carbTiming : (s.bodyGoal === 'gain');
}

/* Rezept-Pools für die Plan-Generierung – Vorlieben werden hier
   angewendet: No-Go-Zutaten fliegen raus, Lieblingszutaten werden
   markiert (_liked). DB.recipes selbst bleibt unverändert. */
const _NO_PLAN_NAMES = ['dip', 'sauce', 'marinade', 'dressing', 'condiment', 'spread', 'chutney', 'relish', 'salsa', 'syrup', 'hüttenkäse', 'cottage cheese'];

function buildPlanPools(prefs, extraRecipes) {
  let recs = DB.recipes.filter((r) => {
    if (r.browse || r.active === false) return false;
    const name = (r.name || '').toLowerCase();
    return !_NO_PLAN_NAMES.some((bad) => name.includes(bad));
  });
  if (extraRecipes && extraRecipes.length) recs = recs.concat(extraRecipes);
  if (!recs.length) recs = DB.recipes.filter((r) => !r.browse);

  let filtered = recs;
  if (prefs.dislikes.length) {
    const f = recs.filter((r) => !recipeHasTerms(r, prefs.dislikes));
    if (f.length >= 4) filtered = f;          // nur filtern, wenn genug übrig bleibt
  }
  const pool = filtered.map((r) => Object.assign({}, r, {
    _liked: prefs.likes.length ? recipeHasTerms(r, prefs.likes) : false,
  }));
  let quick = pool.filter((r) => (r.time || 30) <= 15);
  let mains = pool.filter((r) => (r.time || 30) > 15);
  if (!quick.length) quick = pool;
  if (!mains.length) mains = pool;
  // Bevorzuge Rezepte mit 'snack'-Tag; Fallback: hartcodierte SNACKS-Liste
  const snackRecs = pool.filter((r) => r.tags && r.tags.includes('snack'));
  const snacks = snackRecs.length >= 3
    ? snackRecs
    : SNACKS.map((s, i) => Object.assign({ id: 'snack-' + i, cuisine: '', time: 5, portions: 1, _liked: false }, s));
  return { breakfast: quick, mains: mains, snacks: snacks };
}

/* Füllt einen Slot Block für Block. Pro Block wird das Rezept
   gewählt, das den laufenden Tagesdurchschnitt am besten an die
   Slot-Ziele heranführt; Abwechslung über recent/usage-Strafen. */
function fillSlotGreedy(plan, slot, pool, fixedBlock, pTarget, kTarget, opts, usage, cTarget) {
  if (!pool.length) return;
  let i = 0, sumP = 0, sumK = 0, filled = 0;
  const recent = [];
  while (i < plan.length) {
    const remaining = plan.length - i;
    let best = null, bestScore = Infinity;
    for (const r of pool) {
      const base = fixedBlock || Math.min(r.portions || 1, 5);
      const span = Math.max(1, Math.min(base, remaining));
      const days = filled + span;
      const projP = (sumP + (r.protein || 0) * span) / days;
      const projK = (sumK + (r.kcal || 0) * span) / days;
      let s = Math.abs(projP - pTarget) / Math.max(1, pTarget) * 2.2
            + Math.abs(projK - kTarget) / Math.max(1, kTarget) * 1.0;
      if (cTarget != null) s += Math.abs((r.carbs || 0) - cTarget) / 60 * 1.5;  // KH-Timing
      s += (opts.costWeight || 0) * ((r.cost || 3) / 6);
      if (recent.includes(r.id)) s += 0.4;
      s += (usage[r.id] || 0) * 0.16;
      if (r._liked) s -= 0.3;
      if (s < bestScore) { bestScore = s; best = { r: r, span: span }; }
    }
    for (let k = 0; k < best.span; k++) plan[i + k][slot] = mealFromRecipe(best.r, k > 0);
    sumP += (best.r.protein || 0) * best.span;
    sumK += (best.r.kcal || 0) * best.span;
    filled += best.span;
    usage[best.r.id] = (usage[best.r.id] || 0) + 1;
    recent.push(best.r.id);
    if (recent.length > 2) recent.shift();
    i += best.span;
  }
}

function buildPlanGreedy(pools, opts) {
  opts = opts || {};
  const plan = Array.from({ length: 14 }, (_, i) => ({ day: i + 1 }));
  const batch = Math.max(1, Math.min(7, DB.settings.prepBatchDays || 3));
  const pGoal = DB.settings.proteinGoal || 120;
  const kGoal = DB.settings.kcalGoal || 2200;
  const boost = opts.proteinBoost || 1;
  const usage = {};
  // KH-Timing: morgens kohlenhydratarm, mittags moderat, abends kohlenhydratreich
  const carbT = carbTimingActive();
  fillSlotGreedy(plan, 'breakfast', pools.breakfast, batch, pGoal * 0.27 * boost, kGoal * 0.25, opts, usage, carbT ? 15 : null);
  fillSlotGreedy(plan, 'lunch', pools.mains, null, pGoal * 0.32 * boost, kGoal * 0.32, opts, usage, carbT ? 50 : null);
  fillSlotGreedy(plan, 'dinner', pools.mains, null, pGoal * 0.31 * boost, kGoal * 0.33, opts, usage, carbT ? 78 : null);
  fillSlotGreedy(plan, 'snack', pools.snacks, batch, pGoal * 0.12 * boost, kGoal * 0.10, opts, usage, null);
  plan.forEach(recalcDay);
  applyPortionScaling(plan);
  return plan;
}

/* Skaliert die Portionsgrößen so, dass der Plan das Protein- UND
   das Kalorienziel erreicht. Ein einzelnes Gericht deckt einen
   hohen Tagesbedarf (z. B. 3500 kcal) nicht ab – hier wird die
   Portionsmenge je Mahlzeit hochgerechnet, bis beide Ziele
   erreicht sind (es zählt der größere der beiden Faktoren, damit
   kein Ziel unterschritten wird). */
function applyPortionScaling(plan) {
  const pGoal = DB.settings.proteinGoal || 120;
  const kGoal = DB.settings.kcalGoal || 2200;
  const n = plan.length || 1;
  // Snacks werden nicht skaliert – nur Hauptmahlzeiten (Frühstück, Mittag, Abend)
  // müssen das Ziel decken. Snacks sollen realistisch klein bleiben.
  let sumP = 0, sumK = 0;
  plan.forEach((d) => {
    sumP += ((d.breakfast && d.breakfast.protein) || 0) +
            ((d.lunch && d.lunch.protein) || 0) +
            ((d.dinner && d.dinner.protein) || 0);
    sumK += mealKcal(d.breakfast) + mealKcal(d.lunch) + mealKcal(d.dinner);
  });
  const avgP = sumP / n, avgK = sumK / n;
  if (avgP <= 0 || avgK <= 0) return;
  // Snack deckt ~12 % Protein und ~10 % kcal – Hauptmahlzeiten den Rest
  let mult = Math.max((kGoal * 0.90) / avgK, (pGoal * 0.88) / avgP);
  // Auf "schöne" Schritte runden – keine krummen Skalierungen
  const STEPS = [0.75, 1.0, 1.25, 1.5];
  mult = STEPS.reduce((best, s) => Math.abs(s - mult) < Math.abs(best - mult) ? s : best, 1.0);
  if (Math.abs(mult - 1) < 0.06) return;
  plan.forEach((d) => {
    ['breakfast', 'lunch', 'dinner'].forEach((sl) => {
      const m = d[sl];
      if (!m) return;
      m.protein = Math.round((m.protein || 0) * mult);
      m.kcal = Math.round((m.kcal || 0) * mult);
      m.cost = Math.round((m.cost || 0) * mult * 100) / 100;
      m.mult = Math.round(mult * 100) / 100;
    });
    recalcDay(d);
  });
}

function prefBonus(plan, prefs) {
  if (!prefs || (!prefs.cuisines.length && !prefs.likes.length)) return 0;
  let bonus = 0;
  plan.forEach((d) => SLOTS.forEach((sl) => {
    const m = d[sl.k];
    if (!m) return;
    if (prefs.cuisines.length && m.cuisine && prefs.cuisines.includes(m.cuisine)) bonus += 0.6;
    if (m.liked) bonus += 0.8;
  }));
  return Math.min(bonus, 28);
}

/* Bewertet einen Plan – kleiner ist besser. Protein-Defizit wird
   am stärksten bestraft (Protein-Vorrang), dann kcal-Abweichung
   und Budget-Überschreitung. */
function scorePlan(plan, prefs) {
  const pGoal = DB.settings.proteinGoal || 120;
  const kGoal = DB.settings.kcalGoal || 2200;
  const budget = budgetForWindow();
  const n = plan.length || 1;
  let sumP = 0, sumK = 0;
  plan.forEach((d) => { sumP += d.totalProtein || 0; sumK += d.totalKcal || 0; });
  const avgP = sumP / n, avgK = sumK / n;
  let score = 0;
  if (avgP < pGoal) score += (pGoal - avgP) / pGoal * 100 * 3;
  else score += (avgP - pGoal) / pGoal * 100 * 0.4;
  score += Math.abs(avgK - kGoal) / kGoal * 100 * 1.4;
  if (budget > 0) {
    const cost = planCost(plan);
    if (cost > budget) score += (cost - budget) / budget * 100 * 4;
  }
  return score - prefBonus(plan, prefs);
}

/* Baut mehrere Plan-Varianten und gibt die bestbewertete zurück. */
function generatePlan(extraRecipes) {
  const prefs = readPlanPrefs();
  const pools = buildPlanPools(prefs, extraRecipes);
  const variants = [
    { costWeight: 0 },
    { costWeight: 0.9 },
    { costWeight: 1.8 },
    { costWeight: 0, proteinBoost: 1.18 },
    { costWeight: 0.7, proteinBoost: 1.12 },
  ];
  let best = null, bestScore = Infinity;
  variants.forEach((v) => {
    const plan = buildPlanGreedy(pools, v);
    const sc = scorePlan(plan, prefs);
    if (sc < bestScore) { bestScore = sc; best = plan; }
  });
  return best || buildPlanGreedy(pools, {});
}

/* Von den Einstellungen aufgerufen (Ziel/Budget geändert). */
async function regeneratePlanForSettings(msg) {
  DB.mealplan = generatePlan();
  DB.mealplan.forEach(recalcDay);
  const changed = syncPlanSpoonRecipes([]);
  await Data.persist('mealplan');
  if (changed) await Data.persist('recipes');
  if (curPage === 'mealplan') renderMealPlan();
  toast(msg || 'Plan neu erstellt.');
  const rep = planTargetReport(DB.mealplan);
  if (!rep.ok) showPlanIssues(rep);
}

/* ---------- Auto-Plan-Dialog (Vorlieben) ---------- */
const PLAN_CUISINES = [
  ['european', '🥗 Europäisch'], ['mediterranean', '🫒 Mediterran'], ['asian', '🍜 Asiatisch'],
  ['indian', '🍛 Indisch'], ['oriental', '🧆 Orientalisch'], ['mexican', '🌮 Mexikanisch'],
];

function autoGeneratePlan() { openAutoPlanModal(); }

function openAutoPlanModal() {
  const s = DB.settings;
  const budget = budgetForWindow();
  const sel = s.planCuisines || [];
  const chips = PLAN_CUISINES.map(([k, label]) =>
    `<span class="ob-chip ${sel.includes(k) ? 'on' : ''}" data-c="${k}" onclick="this.classList.toggle('on')">${label}</span>`).join('');
  const hasKey = !!s.spoonacularKey;
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" style="max-width:480px">
      <div class="modal-head"><div class="modal-title">⚡ Plan automatisch erstellen</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="alert alert-blue" style="font-size:12px">
          Ziel: <strong>${s.proteinGoal || 120} g Protein</strong> · <strong>${(s.kcalGoal || 2200).toLocaleString('de-CH')} kcal</strong> pro Tag${budget > 0 ? ` · Budget <strong>${fmtMoney(budget)}</strong>` : ''}.
          Der Plan wird darauf optimiert (Protein hat bei knappem Budget Vorrang) und ersetzt den aktuellen Plan.
        </div>
        <div class="form-row"><label>Bevorzugte Küchen (optional)</label>
          <div class="ob-chips" id="ap-cuisines">${chips}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">Nichts angehakt = alle Küchen sind erlaubt.</div>
        </div>
        <div class="form-row"><label>Lieblingszutaten (Komma-getrennt, optional)</label>
          <input id="ap-likes" type="text" value="${esc(s.planLikes || '')}" placeholder="z. B. Aubergine, Kichererbsen"></div>
        <div class="form-row"><label>Diese Zutaten meiden (Komma-getrennt, optional)</label>
          <input id="ap-dislikes" type="text" value="${esc(s.planDislikes || '')}" placeholder="z. B. Rosenkohl, Pilze"></div>
        <div class="form-row"><label><input type="checkbox" id="ap-carbtiming" ${carbTimingActive() ? 'checked' : ''} style="width:auto;margin-right:6px">
          Kohlenhydrat-Timing</label>
          <div style="font-size:11px;color:var(--text3)">Frühstück kohlenhydratarm, Mittag moderat, Abendessen kohlenhydratreich – gut für Muskelaufbau & Schlaf.</div></div>
        ${hasKey
          ? `<div class="form-row"><label><input type="checkbox" id="ap-spoon" style="width:auto;margin-right:6px" ${s.planUseSpoon ? 'checked' : ''}>
              Auch Online-Rezepte (Spoonacular) einbeziehen</label>
              <div style="font-size:11px;color:var(--text3)">Holt zusätzliche passende Rezepte – mehr Auswahl für einen besseren Plan.</div></div>`
          : `<div class="alert alert-amber" style="font-size:12px">💡 Mit einem Spoonacular-Key (in den Einstellungen) kann der Auto-Plan zusätzlich Online-Rezepte einbeziehen.</div>`}
        <div id="ap-status" class="mt-1"></div>
        <div class="flex gap-2 mt-1">
          <button class="btn btn-primary btn-sm" id="ap-go" onclick="runAutoPlan()">Plan erstellen</button>
          <button class="btn btn-sm" onclick="closeModal()">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>`);
}

async function runAutoPlan() {
  const cuisines = Array.from(document.querySelectorAll('#ap-cuisines .ob-chip.on')).map((c) => c.dataset.c);
  const likes = (document.getElementById('ap-likes').value || '').trim();
  const dislikes = (document.getElementById('ap-dislikes').value || '').trim();
  const spoonEl = document.getElementById('ap-spoon');
  const useSpoon = !!(spoonEl && spoonEl.checked);
  const carbTiming = !!document.getElementById('ap-carbtiming').checked;
  Object.assign(DB.settings, {
    planCuisines: cuisines, planLikes: likes, planDislikes: dislikes,
    planUseSpoon: useSpoon, carbTiming: carbTiming,
  });
  await Data.persistSettings();

  const btn = document.getElementById('ap-go');
  const status = document.getElementById('ap-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Erstellt…'; }

  let extra = [];
  if (useSpoon) {
    if (status) status.innerHTML = '<p class="text-sm text-muted">Online-Rezepte werden geladen…</p>';
    try {
      extra = await fetchSpoonPlanRecipes(readPlanPrefs());
      if (status) status.innerHTML = `<p class="text-sm text-muted">${extra.length} Online-Rezepte einbezogen.</p>`;
    } catch (e) {
      toast('Online-Rezepte nicht geladen: ' + e.message);
      extra = [];
    }
  }

  DB.mealplan = generatePlan(extra);
  DB.mealplan.forEach(recalcDay);
  const recipesChanged = syncPlanSpoonRecipes(extra);
  await Data.persist('mealplan');
  if (recipesChanged) await Data.persist('recipes');
  closeModal();
  curPlanWeek = 1;
  renderMealPlan();

  const rep = planTargetReport(DB.mealplan);
  toast(`Plan erstellt · Ø ${rep.avgP} g Protein · ${rep.avgK.toLocaleString('de-CH')} kcal/Tag.`);
  if (!rep.ok) { showPlanIssues(rep); return; }
  setTimeout(() => {
    if (confirm('Plan erstellt! Sollen die benötigten Zutaten zur Einkaufsliste hinzugefügt werden?')) {
      addPlanIngredientsToGroceries();
    }
  }, 350);
}

/* Holt für den Auto-Plan zusätzliche Rezepte von Spoonacular. */
async function fetchSpoonPlanRecipes(prefs) {
  const key = DB.settings.spoonacularKey;
  if (!key) return [];
  const diet = DB.settings.diet === 'vegan' ? 'vegan'
    : DB.settings.diet === 'vegetarian' ? 'vegetarian' : '';
  const intol = (DB.settings.allergies || []).map(allergyToSpoon).filter(Boolean).join(',');
  let url = `${EP.SPOONACULAR_BASE}/recipes/complexSearch?apiKey=${encodeURIComponent(key)}`
    + '&number=20&addRecipeNutrition=true&addRecipeInformation=true&instructionsRequired=true'
    + '&sort=protein&sortDirection=desc';
  if (diet) url += '&diet=' + diet;
  if (intol) url += '&intolerances=' + encodeURIComponent(intol);
  const cuis = (prefs.cuisines || []).map(spoonCuisine).filter(Boolean);
  if (cuis.length) url += '&cuisine=' + encodeURIComponent(cuis.join(','));
  if (prefs.dislikes && prefs.dislikes.length) {
    const ex = prefs.dislikes.map((t) => translateWords(t, FOOD_DE_EN)).join(',');
    url += '&excludeIngredients=' + encodeURIComponent(ex);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(res.status === 402 ? 'Spoonacular-Tageslimit erreicht'
      : res.status === 401 ? 'Spoonacular-Key ungültig' : 'Status ' + res.status);
  }
  const data = await res.json();
  const NO_MEAL_TYPES = ['dip', 'sauce', 'condiment', 'spread', 'marinade', 'dressing', 'beverage', 'drink', 'cocktail', 'hor d\'oeuvre', 'fingerfood'];
  return (data.results || [])
    .filter((s) => {
      const types = (s.dishTypes || []).map((t) => t.toLowerCase());
      const name = (s.title || '').toLowerCase();
      return !NO_MEAL_TYPES.some((bad) => types.includes(bad) || name.includes(bad));
    })
    .map(spoonToRecipe)
    .filter((r) => r.protein > 0 && r.kcal > 0);
}

/* Hält DB.recipes mit den im Plan genutzten Online-Rezepten in
   Sync: nicht mehr genutzte Plan-Importe raus, genutzte rein. */
function syncPlanSpoonRecipes(fetched) {
  const usedIds = new Set();
  DB.mealplan.forEach((d) => SLOTS.forEach((sl) => {
    if (d[sl.k] && d[sl.k].rid) usedIds.add(String(d[sl.k].rid));
  }));
  const before = DB.recipes.map((r) => String(r.id)).join('|');
  DB.recipes = DB.recipes.filter((r) => !r.fromPlan || usedIds.has(String(r.id)));
  const have = new Set(DB.recipes.map((r) => String(r.id)));
  (fetched || []).forEach((r) => {
    if (usedIds.has(String(r.id)) && !have.has(String(r.id))) {
      DB.recipes.push(Object.assign({}, r, { browse: true, active: false, fromPlan: true }));
      have.add(String(r.id));
    }
  });
  return before !== DB.recipes.map((r) => String(r.id)).join('|');
}

/* Normalisiert problematische Einheiten für bestimmte Zutaten:
   Knoblauch kommt aus Rezepten in Zehen, Stück und EL – alles → Zehen. */
function _normalizeIngredientUnit(name, amount) {
  const n = (name || '').toLowerCase();
  if (!n.includes('knoblauch')) return amount;
  const m = String(amount || '').match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return amount;
  const num = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].trim().toLowerCase();
  if (unit === 'stück') return Math.max(1, Math.round(num)) + ' Zehen';
  if (unit === 'el' || unit === 'eßlöffel') return Math.max(1, Math.round(num * 3)) + ' Zehen';
  return amount;
}

function addPlanIngredientsToGroceries() {
  // Vorherige Plan-Zutaten entfernen → Button ist idempotent, keine endlosen "+"-Ketten
  DB.groceries = DB.groceries.filter((g) => !g.fromPlan);

  const usedRids = new Set();
  const ridMult = {};
  DB.mealplan.forEach((d) => SLOTS.forEach((s) => {
    const m = d[s.k];
    if (m && m.rid) { usedRids.add(m.rid); if (m.mult) ridMult[m.rid] = m.mult; }
  }));
  let added = 0, merged = 0;
  usedRids.forEach((rid) => {
    const r = DB.recipes.find((x) => x.id === rid);
    if (!r) return;
    const factor = (r.perPortion ? (r.portions || 1) : 1) * (ridMult[rid] || 1);
    (r.ingredients || []).forEach((ing) => {
      const name = translateFoodName(ing.n);
      let amount = scaleAmount(ing.a, factor);
      amount = _normalizeIngredientUnit(name, amount);
      const key = foodKey(name);
      const existing = DB.groceries.find((g) => foodKey(g.n) === key);
      if (existing) {
        existing.a = mergeAmounts(existing.a, amount);
        merged++;
      } else {
        const store = guessStore(name);
        DB.groceries.push({
          id: uid(), n: name, a: amount, cat: guessCategory(name),
          store, price: estimatePrice(name, store), checked: false, fromPlan: true,
        });
        added++;
      }
    });
  });
  if (added + merged) {
    Data.persist('groceries');
    toast(`${added + merged} Zutat(en) auf die Einkaufsliste übernommen.`);
  } else {
    toast('Keine Zutaten gefunden.');
  }
}

/* ---------- Mahlzeit hinzufügen / bearbeiten ---------- */
function openAddMealModal(day, slot) {
  const recs = DB.recipes.filter((r) => !r.browse);
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal">
      <div class="modal-head"><div class="modal-title">Mahlzeit eintragen</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-row"><label>Tag (1–14)</label>
            <input id="m-day" type="number" min="1" max="14" value="${day || 1}"></div>
          <div class="form-row"><label>Mahlzeit</label>
            <select id="m-slot">
              ${SLOTS.map((s) => `<option value="${s.k}" ${slot === s.k ? 'selected' : ''}>${s.lb}</option>`).join('')}
            </select></div>
        </div>
        <div class="form-row"><label>Rezept</label>
          <select id="m-recipe">
            ${recs.map((r) => `<option value="${r.id}">${esc(r.name)} · ${r.protein}g P · ${r.portions} Port.</option>`).join('')}
          </select></div>
        <div class="form-row">
          <label><input type="checkbox" id="m-prep" style="width:auto;margin-right:6px" checked>
            Meal Prep: für mehrere Tage am Stück eintragen</label>
        </div>
        <div class="flex gap-2 mt-1">
          <button class="btn btn-primary btn-sm" onclick="saveMealEntry()">Speichern</button>
          <button class="btn btn-sm" onclick="closeModal()">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>`);
}

async function saveMealEntry() {
  const day = Math.min(14, Math.max(1, +document.getElementById('m-day').value || 1));
  const slot = document.getElementById('m-slot').value;
  const rid = document.getElementById('m-recipe').value;
  const prep = document.getElementById('m-prep').checked;
  const r = DB.recipes.find((x) => x.id === rid);
  if (!r) return;

  // Frühstück/Snack: Mehrtagesblock; Mittag/Abend: nach Portionen
  const isQuick = slot === 'breakfast' || slot === 'snack';
  const block = isQuick ? (DB.settings.prepBatchDays || 3) : (r.portions || 1);
  const span = prep ? Math.max(1, Math.min(block, 14 - day + 1)) : 1;

  for (let k = 0; k < span; k++) {
    const d = DB.mealplan.find((x) => x.day === day + k);
    if (!d) continue;
    d[slot] = mealFromRecipe(r, k > 0);
    recalcDay(d);
  }
  await Data.persist('mealplan');
  closeModal();
  curPlanWeek = day <= 7 ? 1 : 2;
  renderMealPlan();
  toast(span > 1 ? `Meal Prep: ${span} Tage eingetragen.` : 'Mahlzeit eingetragen.');
}

function openMealDetail(day, slot) {
  const d = DB.mealplan.find((x) => x.day === day);
  if (!d || !d[slot]) return;
  const m = d[slot];
  const slotLabel = SLOTS.find((s) => s.k === slot).lb;

  // Aufgewärmte Mahlzeit – nur kurze Info, kein Rezept
  if (m.reheated) {
    modal(`<div class="modal-backdrop" onclick="closeModal(event)">
      <div class="modal" style="max-width:380px">
        <div class="modal-head"><div class="modal-title">♻ ${esc(m.name)}</div>
          <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
        <div class="modal-body">
          <div class="alert alert-blue mb-2">Diese Mahlzeit wurde vorgekocht und wird heute aufgewärmt – kein frisches Kochen nötig.</div>
          <p class="text-sm text-muted mb-3">Tag ${day} · ${slotLabel} · ${m.protein || 0} g Protein · ${m.kcal || 0} kcal</p>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-danger" onclick="clearMeal(${day},'${slot}')">Entfernen</button>
            <button class="btn btn-sm" onclick="closeModal()">Schließen</button>
          </div>
        </div>
      </div>
    </div>`);
    return;
  }

  // Frische Mahlzeit mit Rezept – Zutaten für alle Meal-Prep-Tage hochrechnen
  if (m.rid) {
    const r = DB.recipes.find((x) => x.id === m.rid);
    if (r) {
      // Zähle, wie viele aufeinanderfolgende Tage dieses Rezept gilt
      let span = 1;
      for (let k = day; k < 14; k++) {
        const next = DB.mealplan.find((x) => x.day === k + 1);
        if (next && next[slot] && next[slot].rid === m.rid && next[slot].reheated) {
          span++;
        } else break;
      }
      openRecipeModal(m.rid, span);
      return;
    }
  }

  // Kein Rezept hinterlegt (manuell eingetragene Mahlzeit)
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" style="max-width:380px">
      <div class="modal-head"><div class="modal-title">${esc(m.name)}</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <p class="text-sm text-muted mb-2">Tag ${day} · ${slotLabel} · ${m.protein || 0} g Protein</p>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-danger" onclick="clearMeal(${day},'${slot}')">Mahlzeit entfernen</button>
          <button class="btn btn-sm" onclick="closeModal()">Schließen</button>
        </div>
      </div>
    </div>
  </div>`);
}

async function clearMeal(day, slot) {
  const d = DB.mealplan.find((x) => x.day === day);
  if (d) { delete d[slot]; recalcDay(d); await Data.persist('mealplan'); }
  closeModal();
  renderMealPlan();
}
