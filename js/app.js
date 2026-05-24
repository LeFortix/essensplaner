/* ============================================================
   ESSENSPLANER – App-Kern
   Navigation, Dashboard und geteilte Helfer (toast, modal,
   recipeCard, Rezept-Modal, barChart).
   ============================================================ */

let curPage = 'dashboard';

const PAGES = {
  dashboard: { title: 'Dashboard',                 render: 'renderDashboard' },
  mealplan:  { title: 'Mahlzeitenplan (14 Tage)',   render: 'renderMealPlan' },
  groceries: { title: 'Einkaufsliste',              render: 'renderGroceries' },
  pantry:    { title: 'Vorräte',                    render: 'renderPantry' },
  recipes:   { title: 'Meine Rezepte',              render: 'renderRecipes' },
  browse:    { title: 'Entdecken',                  render: 'renderDiscover' },
  nutrition: { title: 'Nährwerte',                  render: 'renderNutrition' },
  settings:  { title: 'Einstellungen',              render: 'renderSettings' },
};

/* ---------- Start nach Login/Setup ---------- */
function initApp() {
  const chip = document.getElementById('user-chip');
  const emailEl = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  if (Data.mode === 'cloud' && Data.user) {
    emailEl.textContent = Data.user.email || 'Konto';
    avatarEl.textContent = (Data.user.email || '?').charAt(0).toUpperCase();
  } else {
    emailEl.textContent = 'Lokaler Modus';
    avatarEl.textContent = '📱';
  }
  chip.classList.remove('hidden');
  if (window.updateOnlineStatus) updateOnlineStatus();
  if (window.updateSyncBadge) updateSyncBadge();
  navigate('dashboard');
}

/* ---------- Navigation ---------- */
function navigate(page) {
  document.querySelectorAll('.content').forEach((el) => el.classList.add('hidden'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.getElementById('page-title').textContent = (PAGES[page] || {}).title || page;
  curPage = page;
  closeUserMenu();
  renderPage(page);
}

function renderPage(page) {
  const cfg = PAGES[page];
  if (!cfg) return;
  const fn = window[cfg.render];
  if (typeof fn === 'function') {
    try { fn(); }
    catch (e) { console.error('Render-Fehler:', page, e); pagePlaceholder(page, 'Fehler beim Laden: ' + e.message); }
  } else {
    pagePlaceholder(page);
  }
}

function pagePlaceholder(page, msg) {
  const el = document.getElementById('page-' + page);
  if (!el) return;
  el.innerHTML = `<div class="empty-state">
    <div class="icon">🛠️</div>
    <p>${esc(msg || 'Dieser Bereich wird gerade gebaut.')}</p>
  </div>`;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
let _dismissedSuggestions = [];

function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  const avgP = DB.mealplan.length
    ? Math.round(DB.mealplan.reduce((s, d) => s + (d.totalProtein || 0), 0) / DB.mealplan.length) : 0;
  const avgK = DB.mealplan.length
    ? Math.round(DB.mealplan.reduce((s, d) => s + dayKcal(d), 0) / DB.mealplan.length) : 0;
  const activeRecipes = DB.recipes.filter((r) => !r.browse);
  const goal = DB.settings.proteinGoal || 120;

  el.innerHTML = `
    <div id="dash-suggestions"></div>

    <div class="grid-4 mb-2">
      <div class="stat">
        <div class="stat-label">Ø Protein / Tag</div>
        <div class="stat-value" style="color:${avgP >= goal ? 'var(--accent)' : 'var(--amber)'}">${avgP} g</div>
        <div class="stat-sub">Ziel: ${goal} g</div>
      </div>
      <div class="stat">
        <div class="stat-label">Ø Kalorien</div>
        <div class="stat-value">${avgK.toLocaleString('de-CH')}</div>
        <div class="stat-sub">Ziel: ${(DB.settings.kcalGoal || 2200).toLocaleString('de-CH')} kcal</div>
      </div>
      <div class="stat">
        <div class="stat-label">Aktive Rezepte</div>
        <div class="stat-value">${activeRecipes.length}</div>
        <div class="stat-sub">im Plan verfügbar</div>
      </div>
      <div class="stat">
        <div class="stat-label">Koch-Tage</div>
        <div class="stat-value">${DB.settings.cookDays || 3}×</div>
        <div class="stat-sub">pro Woche</div>
      </div>
    </div>

    <div class="grid-2 mb-2">
      <div class="card">
        <div class="card-header"><div class="card-title">Heute</div>
          <button class="btn btn-sm" onclick="navigate('mealplan')">Plan →</button></div>
        <div id="dash-today"></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Vorrat-Status</div>
          <button class="btn btn-sm" onclick="navigate('pantry')">Vorrat →</button></div>
        <div id="dash-pantry"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">Aktive Gerichte</div>
        <button class="btn btn-sm btn-primary" onclick="navigate('recipes')">Alle Rezepte</button></div>
      <div class="grid-3" id="dash-recipes" style="gap:12px"></div>
    </div>`;

  renderSuggestions();

  // Heute
  const d = DB.mealplan[0];
  if (d) {
    document.getElementById('dash-today').innerHTML =
      [['🌅', 'Frühstück', d.breakfast], ['☀️', 'Mittag', d.lunch], ['🌙', 'Abend', d.dinner], ['🥜', 'Snack', d.snack]]
        .filter(([, , m]) => m)
        .map(([ic, lb, m]) => `<div class="flex items-center gap-3" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:16px">${ic}</span>
          <div style="flex:1"><div style="font-size:13px;font-weight:600">${esc(m.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${lb}${m.reheated ? ' · aufgewärmt' : ''}</div></div>
          <span class="badge badge-green">${m.protein || 0}g P</span>
        </div>`).join('') +
      `<div class="mt-1 font-bold" style="color:var(--accent)">Gesamt heute: ${d.totalProtein || 0}g Protein</div>`;
  } else {
    document.getElementById('dash-today').innerHTML = '<p class="text-muted text-sm">Noch kein Plan – im Mahlzeitenplan generieren.</p>';
  }

  // Vorrat-Status
  const soon = DB.pantry.filter((p) => p.s === 'soon').length;
  const old = DB.pantry.filter((p) => p.s === 'old').length;
  const fresh = DB.pantry.filter((p) => p.s === 'fresh').length;
  document.getElementById('dash-pantry').innerHTML = `
    <div class="flex gap-3 flex-wrap">
      <div class="stat" style="flex:1;min-width:90px"><div class="stat-label">🟢 Frisch</div><div class="stat-value">${fresh}</div></div>
      <div class="stat" style="flex:1;min-width:90px"><div class="stat-label">🟡 Bald</div><div class="stat-value" style="color:var(--amber)">${soon}</div></div>
      <div class="stat" style="flex:1;min-width:90px"><div class="stat-label">🔴 Abgelaufen</div><div class="stat-value" style="color:var(--red)">${old}</div></div>
    </div>`;

  // Aktive Gerichte
  const dr = document.getElementById('dash-recipes');
  dr.innerHTML = activeRecipes.length
    ? activeRecipes.slice(0, 6).map((r) => recipeCard(r)).join('')
    : '<p class="text-muted text-sm">Noch keine Rezepte.</p>';
}

/* Kalorien einer einzelnen Mahlzeit – am Eintrag gespeichert,
   sonst aus dem Rezept, sonst grob aus dem Protein geschätzt. */
function mealKcal(meal) {
  if (!meal) return 0;
  if (typeof meal.kcal === 'number' && meal.kcal > 0) return meal.kcal;
  if (meal.rid) {
    const r = DB.recipes.find((x) => x.id === meal.rid);
    if (r && r.kcal) return r.kcal;
  }
  return Math.round((meal.protein || 0) * 12);
}

function dayKcal(d) {
  return ['breakfast', 'lunch', 'dinner', 'snack'].reduce((k, slot) => k + mealKcal(d[slot]), 0);
}

/* Skaliert eine Mengenangabe – die führende Zahl wird multipliziert,
   die Einheit bleibt. „250 g" ×3 → „750 g"; „nach Geschmack" bleibt. */
function scaleAmount(amount, factor) {
  if (!amount || !factor || factor === 1) return amount || '';
  const m = String(amount).match(/^\s*(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(.*)$/);
  if (!m) return amount;
  const token = m[1].replace(/\s/g, '');
  let num;
  if (token.includes('/')) {
    const parts = token.split('/');
    num = parseFloat(parts[0].replace(',', '.')) / parseFloat(parts[1]);
  } else {
    num = parseFloat(token.replace(',', '.'));
  }
  if (!isFinite(num)) return amount;
  const raw = num * factor;
  const unit = (m[2] || '').trim().toLowerCase();
  let scaled;
  // Stückzahl (Eier, Zehen, Stück…): ganze Zahlen
  if (!unit || ['stück', 'eier', 'ei', 'zehe', 'zehen', 'scheibe', 'scheiben', 'prise', 'blatt'].some((u) => unit.startsWith(u))) {
    scaled = Math.max(1, Math.round(raw));
  // Löffel: halbe Schritte (0,5 / 1 / 1,5 / 2…)
  } else if (unit === 'el' || unit === 'tl') {
    scaled = Math.max(0.5, Math.round(raw * 2) / 2);
  // Gramm/Milliliter > 50: auf 5er runden; darunter: ganze Zahlen
  } else if (['g', 'ml', 'kg', 'l'].includes(unit)) {
    scaled = raw >= 50 ? Math.round(raw / 5) * 5 : Math.max(1, Math.round(raw));
  // Alles andere: 1 Dezimalstelle
  } else {
    scaled = Math.round(raw * 10) / 10;
  }
  return scaled + (m[2] ? ' ' + m[2] : '');
}

/* ---------- Smarte Vorschläge (Basis – wird in Phase 3 erweitert) ---------- */
function computeSuggestions() {
  const out = [];
  const goal = DB.settings.proteinGoal || 120;

  const expiring = DB.pantry.filter((p) => p.s === 'soon' || p.s === 'old');
  if (expiring.length) {
    out.push({
      id: 'sg-expiring',
      text: `🟡 <strong>${expiring.length} Vorrat-Artikel</strong> laufen bald ab (${esc(expiring.slice(0, 3).map((p) => p.n).join(', '))}…). Bald verkochen.`,
      actions: [{ label: 'Zum Vorrat', fn: "navigate('pantry')" }],
    });
  }

  const lowDays = DB.mealplan.filter((d) => (d.totalProtein || 0) < goal - 15);
  if (lowDays.length) {
    out.push({
      id: 'sg-protein',
      text: `⚠️ An <strong>${lowDays.length} Tag(en)</strong> liegt das Protein unter deinem Ziel von ${goal} g. Snack einplanen?`,
      actions: [{ label: 'Plan ansehen', fn: "navigate('mealplan')" }],
    });
  }

  const comp = compInfo();
  const compCount = DB.groceries.filter((g) => g.store === 'comp' && !g.checked).length;
  if (compCount >= 4) {
    out.push({
      id: 'sg-comp',
      text: `🏪 <strong>${compCount} Artikel</strong> auf der Einkaufsliste lohnen sich in ${esc(comp.name)}. Fahrkostenrechner prüfen?`,
      actions: [{ label: 'Einkaufsliste', fn: "navigate('groceries')" }],
    });
  }

  const budget = budgetForWindow();
  if (budget > 0 && planCost(DB.mealplan) > budget * 1.05) {
    out.push({
      id: 'sg-budget',
      text: `💸 Der 14-Tage-Plan kostet geschätzt <strong>${fmtMoney(planCost(DB.mealplan))}</strong> – über deinem Budget von ${fmtMoney(budget)}.`,
      actions: [{ label: 'Einstellungen', fn: "navigate('settings')" }],
    });
  }
  return out.filter((s) => !_dismissedSuggestions.includes(s.id));
}

function renderSuggestions() {
  const wrap = document.getElementById('dash-suggestions');
  if (!wrap) return;
  const sugg = computeSuggestions();
  if (!sugg.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = sugg.map((s) => `
    <div class="suggestion" id="${s.id}">
      <div class="suggestion-text">${s.text}</div>
      <div class="suggestion-btns">
        ${s.actions.map((a) => `<button class="btn btn-sm btn-primary" onclick="${a.fn}">${esc(a.label)}</button>`).join('')}
        <button class="btn btn-sm" onclick="dismissSuggestion('${s.id}')">Ausblenden</button>
      </div>
    </div>`).join('');
}

function dismissSuggestion(id) {
  if (!_dismissedSuggestions.includes(id)) _dismissedSuggestions.push(id);
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* ============================================================
   NÄHRWERTE (Basis)
   ============================================================ */
function renderNutrition() {
  const el = document.getElementById('page-nutrition');
  const n = DB.mealplan.length || 1;
  const avgP = Math.round(DB.mealplan.reduce((s, d) => s + (d.totalProtein || 0), 0) / n);
  const avgK = Math.round(DB.mealplan.reduce((s, d) => s + dayKcal(d), 0) / n);

  el.innerHTML = `
    <div class="grid-4 mb-2">
      <div class="stat"><div class="stat-label">Ø Protein</div>
        <div class="stat-value" style="color:var(--accent)">${avgP} g</div>
        <div class="stat-sub">Ziel: ${DB.settings.proteinGoal || 120} g</div></div>
      <div class="stat"><div class="stat-label">Ø Kalorien</div>
        <div class="stat-value">${avgK.toLocaleString('de-CH')}</div><div class="stat-sub">kcal / Tag</div></div>
      <div class="stat"><div class="stat-label">Gerichte</div>
        <div class="stat-value">${DB.recipes.filter((r) => !r.browse).length}</div><div class="stat-sub">im Bestand</div></div>
      <div class="stat"><div class="stat-label">Plan-Tage</div>
        <div class="stat-value">${DB.mealplan.length}</div><div class="stat-sub">geplant</div></div>
    </div>
    <div class="card mb-2">
      <div class="card-header"><div class="card-title">Protein – 14-Tage-Übersicht</div></div>
      <div id="nut-chart" style="padding-top:4px"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Makros pro Gericht</div></div>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Gericht</th><th>Protein</th><th>kcal</th><th>KH</th><th>Fett</th><th>Zeit</th></tr></thead>
        <tbody>${DB.recipes.filter((r) => !r.browse).map((r) => `<tr>
          <td><strong>${esc(r.name)}</strong></td>
          <td><span class="badge badge-green">${r.protein}g</span></td>
          <td>${r.kcal} kcal</td><td>${r.carbs}g</td><td>${r.fat}g</td><td>${r.time} Min</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  document.getElementById('nut-chart').innerHTML = barChart(DB.mealplan, 120);
}

function barChart(days, height = 90) {
  if (!days || !days.length) return '<p class="text-muted text-sm">Keine Daten.</p>';
  const goal = DB.settings.proteinGoal || 120;
  return `<div class="bar-chart" style="height:${height}px">
    ${days.map((d) => {
      const p = d.totalProtein || 0;
      const pct = Math.min(100, Math.round((p / (goal * 1.3)) * 100));
      const col = p >= goal ? 'var(--accent)' : p >= goal - 20 ? '#e9a826' : '#e24b4a';
      return `<div class="bar-col">
        <div class="bar-val">${p}</div>
        <div class="bar-body" style="flex:1"><div class="bar-fill" style="height:${pct}%;background:${col}"></div></div>
        <div class="bar-lbl">T${d.day}</div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ============================================================
   GETEILTE HELFER
   ============================================================ */
function tagLabel(t) {
  return { 'high-protein': '💪 Viel Protein', 'meal-prep': '📦 Meal Prep', 'cheap': '💰 Günstig',
    'quick': '⚡ Schnell', 'vegan': '🌱 Vegan', 'healthy': '🥦 Gesund' }[t] || t;
}
function cuisineLabel(c) {
  return { asian: 'Asiatisch', indian: 'Indisch', european: 'Europäisch',
    mediterranean: 'Mediterran', mexican: 'Mexikanisch', oriental: 'Orientalisch',
    italian: 'Italienisch', german: 'Deutsch' }[c] || c || 'Allgemein';
}
function cuisineEmoji(c) {
  return { asian: '🍜', indian: '🍛', european: '🥗', mediterranean: '🫒', mexican: '🌮',
    oriental: '🧆', italian: '🍝', german: '🥨' }[c] || '🍲';
}

/* ---------- Länder, Währungen, Geld ---------- */
const COUNTRY_INFO = {
  ch: { name: 'Schweiz', currency: 'CHF', symbol: 'CHF', flag: '🇨🇭' },
  de: { name: 'Deutschland', currency: 'EUR', symbol: '€', flag: '🇩🇪' },
  at: { name: 'Österreich', currency: 'EUR', symbol: '€', flag: '🇦🇹' },
  fr: { name: 'Frankreich', currency: 'EUR', symbol: '€', flag: '🇫🇷' },
  it: { name: 'Italien', currency: 'EUR', symbol: '€', flag: '🇮🇹' },
  li: { name: 'Liechtenstein', currency: 'CHF', symbol: 'CHF', flag: '🇱🇮' },
  cz: { name: 'Tschechien', currency: 'CZK', symbol: 'Kč', flag: '🇨🇿' },
  pl: { name: 'Polen', currency: 'PLN', symbol: 'zł', flag: '🇵🇱' },
  dk: { name: 'Dänemark', currency: 'DKK', symbol: 'kr', flag: '🇩🇰' },
  se: { name: 'Schweden', currency: 'SEK', symbol: 'kr', flag: '🇸🇪' },
  no: { name: 'Norwegen', currency: 'NOK', symbol: 'kr', flag: '🇳🇴' },
  nl: { name: 'Niederlande', currency: 'EUR', symbol: '€', flag: '🇳🇱' },
  be: { name: 'Belgien', currency: 'EUR', symbol: '€', flag: '🇧🇪' },
  lu: { name: 'Luxemburg', currency: 'EUR', symbol: '€', flag: '🇱🇺' },
  es: { name: 'Spanien', currency: 'EUR', symbol: '€', flag: '🇪🇸' },
  hu: { name: 'Ungarn', currency: 'HUF', symbol: 'Ft', flag: '🇭🇺' },
  sk: { name: 'Slowakei', currency: 'EUR', symbol: '€', flag: '🇸🇰' },
  si: { name: 'Slowenien', currency: 'EUR', symbol: '€', flag: '🇸🇮' },
};
function countryInfo(cc) {
  return COUNTRY_INFO[(cc || '').toLowerCase()]
    || { name: 'Vergleichsort', currency: '', symbol: '', flag: '🏳️' };
}
function homeInfo() { return countryInfo(DB.settings.homeCC); }
function compInfo() { return countryInfo(DB.settings.compCC); }

/* true, wenn ein Vergleichsort gesetzt ist */
function hasComparison() {
  return !!(DB.settings && DB.settings.deCity && DB.settings.deCity.trim());
}

function fmtMoney(v, sym) {
  if (sym === undefined) sym = homeInfo().symbol;
  const n = (Math.round(v * 100) / 100).toLocaleString('de-CH', { minimumFractionDigits: 2 });
  if (!sym) return n;
  return sym === '€' ? n + ' €' : sym + ' ' + n;
}

/* ---------- Kosten eines Plans (Schätzung) ---------- */
function mealCost(meal) {
  if (!meal) return 0;
  if (typeof meal.cost === 'number' && meal.cost > 0) return meal.cost;
  if (meal.rid) {
    const r = DB.recipes.find((x) => x.id === meal.rid);
    if (r) return r.cost || 3;
  }
  return 1.5;
}
function planCost(plan) {
  return (plan || DB.mealplan).reduce((sum, d) =>
    sum + ['breakfast', 'lunch', 'dinner', 'snack'].reduce((s, k) => s + mealCost(d[k]), 0), 0);
}
function budgetForWindow() {
  const b = DB.settings.budgetAmount || 0;
  if (!b) return 0;
  return DB.settings.budgetPeriod === 'monthly' ? b * 14 / 30.4 : b;
}

function recipeImage(r) {
  if (r.image) {
    return `<img class="recipe-img" src="${esc(r.image)}" alt="${esc(r.name)}"
      onerror="this.outerHTML='<div class=\\'recipe-img-fallback\\'>${cuisineEmoji(r.cuisine)}</div>'">`;
  }
  return `<div class="recipe-img-fallback">${cuisineEmoji(r.cuisine)}</div>`;
}

function recipeCard(r, opts = {}) {
  const tagHtml = (r.tags || []).slice(0, 2).map((t) =>
    `<span class="badge ${t === 'high-protein' ? 'badge-green' : t === 'cheap' ? 'badge-blue' : 'badge-amber'}"
      style="font-size:10px">${tagLabel(t)}</span>`).join('');
  return `<div class="recipe-card" onclick="openRecipeModal('${r.id}')">
    ${recipeImage(r)}
    <div class="cuisine-bar cuisine-${r.cuisine || 'european'}"></div>
    <div class="recipe-card-body">
      <div class="recipe-card-title">${esc(r.name)}</div>
      <div class="recipe-meta">
        <span>⏱ ${r.time} Min</span><span>🍽 ${r.portions} Port.</span>${tagHtml}
      </div>
      <div class="macro-grid">
        <div class="macro-item"><div class="macro-val" style="color:var(--accent)">${r.protein}g</div><div class="macro-lbl">Protein</div></div>
        <div class="macro-item"><div class="macro-val">${r.kcal}</div><div class="macro-lbl">kcal</div></div>
        <div class="macro-item"><div class="macro-val">${r.carbs}g</div><div class="macro-lbl">KH</div></div>
        <div class="macro-item"><div class="macro-val">${r.fat}g</div><div class="macro-lbl">Fett</div></div>
      </div>
      ${opts.showAddBtn ? `<button class="btn btn-sm btn-primary btn-full"
        onclick="event.stopPropagation();addToMyRecipes('${r.id}')">+ Zu meinen Rezepten</button>` : ''}
    </div>
  </div>`;
}

/* ---------- Rezept-Detail-Modal (geteilt) ---------- */
function getRecipe(id) {
  return DB.recipes.find((x) => x.id === id)
    || (window.lastSpoonResults || []).find((x) => x.id === id);
}

function openRecipeModal(id, initPortions) {
  const r = getRecipe(id);
  if (!r) return;
  const basePortions = r.perPortion ? 1 : (r.portions || 1);
  const displayPortions = (initPortions && initPortions >= 1) ? initPortions : basePortions;
  const scaleFactor = displayPortions / basePortions;
  const mealPrepNote = displayPortions > 1 && Math.abs(scaleFactor - 1) > 0.05
    ? `<div class="alert alert-blue" style="font-size:12px;margin-bottom:8px">🍳 Zutaten für <strong>${displayPortions} Tage</strong> Meal Prep – bereits hochgerechnet.</div>`
    : '';
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal">
      <div class="modal-head">
        <div>
          <div class="modal-title">${esc(r.name)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:6px">
            ⏱ ${r.time} Min · ${r.portions} Portionen · ${cuisineLabel(r.cuisine)} · ~${fmtMoney(r.cost || 3)}/Portion</div>
        </div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        ${r.image ? `<img src="${esc(r.image)}" alt="" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;margin-bottom:14px"
          onerror="this.style.display='none'">` : ''}
        <div class="grid-4 mb-2">
          <div class="stat"><div class="stat-label">Protein</div><div class="stat-value" style="color:var(--accent);font-size:18px">${r.protein}g</div></div>
          <div class="stat"><div class="stat-label">kcal</div><div class="stat-value" style="font-size:18px">${r.kcal}</div></div>
          <div class="stat"><div class="stat-label">KH</div><div class="stat-value" style="font-size:18px">${r.carbs}g</div></div>
          <div class="stat"><div class="stat-label">Fett</div><div class="stat-value" style="font-size:18px">${r.fat}g</div></div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin:-6px 0 10px">Nährwerte pro Portion</div>
        <div class="grid-2" style="gap:16px">
          <div>
            ${mealPrepNote}
            <div class="card-title mb-1" style="display:flex;justify-content:space-between;align-items:center">
              <span>Zutaten</span>
              <label style="font-size:12px;font-weight:normal;display:flex;align-items:center;gap:4px">
                für <input type="number" min="1" max="30" value="${displayPortions}"
                  style="width:44px;text-align:center;padding:2px 4px;border:1px solid var(--border);border-radius:6px;font-size:12px"
                  oninput="updateRecipePortions('${r.id}',+this.value)"> Port.
              </label>
            </div>
            <div id="rcp-ing-list">
              ${(r.ingredients || []).map((i) => {
                const a = Math.abs(scaleFactor - 1) > 0.01 ? scaleAmount(i.a, scaleFactor) : i.a;
                return `<div class="flex justify-between" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
                  <span>${esc(i.n)}</span><span class="text-muted">${esc(a)}</span></div>`;
              }).join('')}
            </div>
          </div>
          <div>
            <div class="card-title mb-1">Zubereitung</div>
            <ol class="step-list">
              ${(r.steps || []).map((s, i) => `<li><div class="step-num">${i + 1}</div><div class="step-text">${esc(s)}</div></li>`).join('')}
            </ol>
          </div>
        </div>
        ${r.notes ? `<div class="alert alert-amber mt-2">💡 ${esc(r.notes)}</div>` : ''}
        <div class="flex gap-2 mt-2 flex-wrap">
          ${r.browse
            ? `<button class="btn btn-sm btn-primary" onclick="addToMyRecipes('${r.id}');closeModal()">+ Zu meinen Rezepten</button>`
            : `<button class="btn btn-sm btn-primary" onclick="markRecipeCooked('${r.id}')">✓ Gekocht (Vorrat abziehen)</button>`}
          <button class="btn btn-sm" onclick="closeModal()">Schließen</button>
          ${!r.browse ? `<button class="btn btn-sm btn-danger" onclick="deleteRecipe('${r.id}')">Löschen</button>` : ''}
        </div>
      </div>
    </div>
  </div>`);
}

function updateRecipePortions(id, n) {
  const r = getRecipe(id);
  const el = document.getElementById('rcp-ing-list');
  if (!r || !el || !(n >= 1)) return;
  const base = r.perPortion ? 1 : (r.portions || 1);
  const factor = Math.round(n) / base;
  el.innerHTML = (r.ingredients || []).map((i) => {
    const a = Math.abs(factor - 1) > 0.01 ? scaleAmount(i.a, factor) : i.a;
    return `<div class="flex justify-between" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
      <span>${esc(i.n)}</span><span class="text-muted">${esc(a)}</span></div>`;
  }).join('');
}

/* ---------- Modal & Toast ---------- */
function modal(html) { document.getElementById('modal-root').innerHTML = html; }
function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-root').innerHTML = '';
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

/* ---------- Benutzer-Menü ---------- */
function toggleUserMenu() {
  const p = document.getElementById('user-pop');
  if (p.classList.contains('hidden')) {
    const cloud = Data.mode === 'cloud';
    p.innerHTML = `
      <button onclick="navigate('settings')">⚙️ Einstellungen</button>
      ${cloud
        ? '<button onclick="Auth.signOut()">🚪 Abmelden</button>'
        : '<button onclick="Auth.showSetup()">☁️ Mit Cloud-Konto verbinden</button>'}
      <div style="font-size:11px;color:var(--text3);padding:6px 12px">Version ${EP.APP_VERSION}</div>`;
    p.classList.remove('hidden');
  } else {
    p.classList.add('hidden');
  }
}
function closeUserMenu() {
  const p = document.getElementById('user-pop');
  if (p) p.classList.add('hidden');
}
document.addEventListener('click', (e) => {
  const chip = document.getElementById('user-chip');
  const pop = document.getElementById('user-pop');
  if (chip && pop && !chip.contains(e.target) && !pop.contains(e.target)) pop.classList.add('hidden');
});
