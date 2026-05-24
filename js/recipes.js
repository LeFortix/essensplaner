/* ============================================================
   ESSENSPLANER – Meine Rezepte
   Eigene Rezepte anlegen, bearbeiten, löschen; Import per URL
   (Spoonacular). Bilder & Nährwerte werden mitübernommen.
   ============================================================ */

let recipeSearch = '';
let recipeTag = '';

function missingStarterRecipes() {
  const have = new Set(DB.recipes.map((r) => String(r.id)));
  return defaultRecipes().filter((r) => !have.has(String(r.id)));
}

async function loadStarterRecipes() {
  const missing = missingStarterRecipes();
  if (!missing.length) { toast('Alle Beispielrezepte sind bereits vorhanden.'); return; }
  if (!confirm(`${missing.length} Beispielrezept(e) zu deinen Rezepten hinzufügen?`)) return;
  DB.recipes.push(...missing);
  await Data.persist('recipes');
  renderRecipes();
  toast(`${missing.length} Beispielrezept(e) hinzugefügt.`);
}

function renderRecipes() {
  const el = document.getElementById('page-recipes');
  const missing = missingStarterRecipes().length;
  el.innerHTML = `
    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
      <div class="search-wrap" style="flex:1;min-width:200px;max-width:300px">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="Rezepte durchsuchen…" value="${esc(recipeSearch)}"
               oninput="recipeSearch=this.value;renderRecipeGrid()">
      </div>
      <div class="flex gap-2 flex-wrap">
        <select onchange="recipeTag=this.value;renderRecipeGrid()">
          <option value="">Alle</option>
          <option value="high-protein" ${recipeTag === 'high-protein' ? 'selected' : ''}>Viel Protein</option>
          <option value="quick" ${recipeTag === 'quick' ? 'selected' : ''}>Schnell</option>
          <option value="meal-prep" ${recipeTag === 'meal-prep' ? 'selected' : ''}>Meal Prep</option>
          <option value="cheap" ${recipeTag === 'cheap' ? 'selected' : ''}>Günstig</option>
        </select>
        ${missing ? `<button class="btn btn-sm" onclick="loadStarterRecipes()">🍽 ${missing} Beispielrezepte laden</button>` : ''}
        <button class="btn btn-sm" onclick="openImportModal()">🔗 Import</button>
        <button class="btn btn-sm btn-primary" onclick="openAddRecipeModal()">+ Rezept</button>
      </div>
    </div>
    <div class="grid-3" id="recipes-grid" style="gap:14px"></div>`;
  renderRecipeGrid();
}

function renderRecipeGrid() {
  let recs = DB.recipes.filter((r) => !r.browse);
  if (recipeTag) recs = recs.filter((r) => (r.tags || []).includes(recipeTag));
  if (recipeSearch.trim()) {
    const q = recipeSearch.toLowerCase();
    recs = recs.filter((r) => r.name.toLowerCase().includes(q)
      || (r.ingredients || []).some((i) => i.n.toLowerCase().includes(q)));
  }
  const grid = document.getElementById('recipes-grid');
  grid.innerHTML = recs.length
    ? recs.map((r) => recipeCard(r)).join('')
    : '<div class="empty-state"><div class="icon">🍳</div><p>Keine Rezepte gefunden.</p></div>';
}

/* ---------- Aus „Entdecken" übernehmen ---------- */
async function addToMyRecipes(id) {
  let r = DB.recipes.find((x) => x.id === id);
  if (r) {
    r.browse = false; r.active = true;
  } else {
    const found = (window.lastSpoonResults || []).find((x) => x.id === id);
    if (!found) { toast('Rezept nicht gefunden.'); return; }
    r = Object.assign({}, found, { browse: false, active: true });
    DB.recipes.push(r);
  }
  await Data.persist('recipes');
  toast(`„${r.name}" zu deinen Rezepten hinzugefügt.`);
  if (curPage === 'recipes') renderRecipeGrid();
  if (curPage === 'browse') renderDiscover();
  if (curPage === 'dashboard') renderDashboard();
}

async function deleteRecipe(id) {
  if (!confirm('Rezept wirklich löschen?')) return;
  DB.recipes = DB.recipes.filter((r) => r.id !== id);
  await Data.persist('recipes');
  closeModal();
  if (curPage === 'recipes') renderRecipeGrid();
  else renderPage(curPage);
  toast('Rezept gelöscht.');
}

/* ============================================================
   NEUES REZEPT ANLEGEN
   Zutaten werden für 1 Portion eingegeben (mit tippfehler-
   toleranter Autovervollständigung). Optional kann das Rezept
   direkt in den Mahlzeitenplan eingetragen werden; die Zutaten
   landen – auf die Tageszahl hochgerechnet – in der Einkaufsliste.
   ============================================================ */
const SLOT_LABEL = { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snack: 'Snack' };
const SLOT_PROTEIN_SHARE = { breakfast: 0.27, lunch: 0.32, dinner: 0.31, snack: 0.12 };

/* ---------- Mengen-Einheiten & Nährwert-Datenbank ----------
   Grobe Richtwerte je 100 g (bzw. 100 ml). Die App nutzt sie, um
   Protein/kcal/KH/Fett eines Rezepts automatisch zu schätzen.
   Reihenfolge: spezifische Begriffe zuerst. */
const RECIPE_UNITS = ['g', 'ml', 'Stück', 'EL', 'TL', 'Dose', 'Prise'];
/* EL/TL bewusst konservativ (eher zu wenig als zu viel rechnen) */
const UNIT_GRAMS = { g: 1, ml: 1, EL: 12.5, TL: 4, Dose: 400, Prise: 0.5 };
let _recipeNutriLocked = false;

/* [Stichwort, Protein, kcal, KH, Fett]  – je 100 g */
const FOOD_NUTRITION = [
  ['proteinpulver', 80, 375, 8, 5],
  ['erdnussmus', 25, 600, 20, 50], ['mandelmus', 21, 600, 15, 55], ['tahini', 17, 600, 21, 54],
  ['kokosmilch', 2, 180, 3, 18], ['kokos', 4, 350, 15, 33],
  ['rote linsen', 25, 350, 50, 1.5], ['linsen', 25, 350, 50, 1.5], ['linse', 25, 350, 50, 1.5],
  ['kichererbse', 7, 120, 20, 2], ['kidneybohne', 7, 115, 17, 0.5], ['schwarze bohne', 7, 115, 17, 0.5],
  ['bohne', 7, 115, 17, 0.5], ['edamame', 11, 120, 9, 5],
  ['erbsen-linsen-nudel', 25, 340, 50, 5], ['vollkornnudel', 13, 350, 64, 2.5],
  ['vollkornspaghetti', 13, 350, 64, 2.5], ['spaghetti', 12, 360, 72, 1.5], ['reisnudel', 7, 360, 80, 0.5],
  ['nudel', 12, 360, 72, 1.5], ['pasta', 12, 360, 72, 1.5],
  ['basmati', 7, 360, 78, 1], ['reis', 7, 360, 78, 1],
  ['haferflocken', 13, 370, 60, 7], ['couscous', 12, 360, 72, 1], ['bulgur', 12, 350, 70, 1.5],
  ['quinoa', 14, 360, 64, 6], ['mehl', 10, 350, 72, 1], ['vollkornbrot', 8, 230, 40, 3], ['brot', 8, 250, 48, 3],
  ['passierte tomaten', 1.5, 35, 7, 0.3], ['tomate', 1, 18, 4, 0.2], ['mais', 3, 90, 19, 1],
  ['räuchertofu', 16, 170, 1, 10], ['tofu', 12, 140, 2, 8], ['tempeh', 19, 190, 9, 11],
  ['seitan', 25, 150, 5, 2], ['paneer', 18, 290, 4, 22], ['halloumi', 22, 320, 2, 25],
  ['eier', 13, 140, 1, 10], ['ei', 13, 140, 1, 10],
  ['magerquark', 12, 67, 4, 0.2], ['quark', 12, 100, 4, 4], ['skyr', 11, 63, 4, 0.2],
  ['hüttenkäse', 12, 98, 3, 4], ['griechischer joghurt', 9, 120, 4, 9], ['joghurt', 4, 61, 5, 3.5],
  ['milch', 3.4, 50, 5, 1.6], ['parmesan', 35, 400, 0, 29], ['mozzarella', 18, 250, 1, 18],
  ['gouda', 25, 360, 0, 28], ['feta', 14, 260, 1, 21], ['käse', 25, 360, 1, 28],
  ['sahne', 2, 290, 3, 30], ['butter', 0.7, 720, 0.6, 81],
  ['brokkoli', 3, 35, 5, 0.4], ['blumenkohl', 2, 25, 5, 0.3], ['paprika', 1, 30, 6, 0.3],
  ['zucchini', 1.6, 17, 3, 0.3], ['aubergine', 1, 25, 6, 0.2], ['süßkartoffel', 1.6, 86, 20, 0.1],
  ['kartoffel', 2, 77, 17, 0.1], ['karotte', 0.9, 40, 10, 0.2], ['möhre', 0.9, 40, 10, 0.2],
  ['zwiebel', 1.1, 40, 9, 0.1], ['knoblauch', 6, 150, 33, 0.5], ['ingwer', 1.8, 80, 18, 0.8],
  ['spinat', 3, 23, 4, 0.4], ['salat', 1, 15, 3, 0.2], ['gurke', 0.7, 15, 3, 0.1],
  ['lauch', 2, 30, 6, 0.3], ['kohl', 1.3, 25, 6, 0.1], ['champignon', 3, 22, 3, 0.3],
  ['pilz', 3, 22, 3, 0.3], ['sellerie', 1, 16, 3, 0.2], ['erbsen', 5, 80, 11, 0.4], ['oliven', 1, 150, 6, 15],
  ['banane', 1, 90, 21, 0.3], ['apfel', 0.3, 52, 14, 0.2], ['avocado', 2, 160, 9, 15],
  ['mango', 0.8, 60, 15, 0.4], ['beere', 1, 45, 10, 0.4], ['zitrone', 1, 30, 9, 0.3],
  ['limette', 0.7, 30, 10, 0.2], ['orange', 1, 47, 12, 0.1],
  ['walnuss', 15, 650, 14, 65], ['walnüss', 15, 650, 14, 65], ['mandel', 21, 580, 20, 50],
  ['cashew', 18, 550, 30, 44], ['nüsse', 15, 620, 16, 60], ['nuss', 15, 620, 16, 60],
  ['leinsamen', 18, 530, 29, 42], ['chiasamen', 17, 490, 42, 31], ['sesam', 18, 570, 23, 50],
  ['samen', 18, 540, 25, 45],
  ['hummus', 8, 230, 15, 15], ['misopaste', 12, 200, 25, 6], ['miso', 12, 200, 25, 6],
  ['sojasauce', 8, 60, 6, 0],
  ['olivenöl', 0, 880, 0, 100], ['rapsöl', 0, 880, 0, 100], ['sesamöl', 0, 880, 0, 100], ['öl', 0, 880, 0, 100],
  ['honig', 0.3, 300, 80, 0], ['ahornsirup', 0, 260, 67, 0], ['zucker', 0, 400, 100, 0],
  ['gemüsebrühe', 0, 8, 1, 0], ['brühe', 0, 8, 1, 0], ['backpulver', 0, 0, 0, 0],
  ['petersilie', 3, 36, 6, 0.8], ['schnittlauch', 3, 30, 4, 0.7], ['kräuter', 3, 40, 7, 1],
];

/* [Stichwort, Gramm pro Stück] */
const PIECE_GRAMS = [
  ['eier', 60], ['ei', 60], ['banane', 120], ['apfel', 150], ['avocado', 150],
  ['paprika', 150], ['zwiebel', 110], ['knoblauch', 5], ['zucchini', 250], ['aubergine', 300],
  ['süßkartoffel', 200], ['kartoffel', 120], ['tomate', 80], ['karotte', 70], ['möhre', 70],
  ['gurke', 300], ['zitrone', 80], ['limette', 50], ['orange', 200], ['mango', 200],
  ['brokkoli', 400], ['blumenkohl', 600], ['lauch', 150], ['frühlingszwiebel', 15],
  ['sellerie', 40], ['petersilie', 30], ['paneer', 250], ['halloumi', 225], ['tofu', 400],
];

function lookupNutrition(name) {
  const n = (name || '').toLowerCase();
  for (const row of FOOD_NUTRITION) {
    if (n.includes(row[0])) return { p: row[1], k: row[2], c: row[3], f: row[4] };
  }
  return { p: 3, k: 70, c: 10, f: 1.5 };          // grober Default für Unbekanntes
}

function pieceGrams(name) {
  const n = (name || '').toLowerCase();
  for (const row of PIECE_GRAMS) { if (n.includes(row[0])) return row[1]; }
  return 100;
}

function ingredientGrams(name, qty, unit) {
  if (!qty) return 0;
  if (unit === 'Stück') return qty * pieceGrams(name);
  return qty * (UNIT_GRAMS[unit] || 1);
}

/* Schätzt die Nährwerte (pro Portion) aus den Zutaten-Zeilen. */
function estimateRecipeMacros(rows) {
  let p = 0, k = 0, c = 0, f = 0;
  rows.forEach((row) => {
    if (!row.n || !row.qty) return;
    const g = ingredientGrams(row.n, row.qty, row.unit);
    const nu = lookupNutrition(row.n);
    p += nu.p / 100 * g;
    k += nu.k / 100 * g;
    c += nu.c / 100 * g;
    f += nu.f / 100 * g;
  });
  return { protein: Math.round(p), kcal: Math.round(k), carbs: Math.round(c), fat: Math.round(f) };
}

/* Zerlegt eine Mengen-Zeichenkette wieder in Zahl + Einheit
   (für vorbefüllte Rezepte, z. B. aus dem Import). */
function parseAmount(str) {
  const s = String(str || '').trim();
  const m = s.match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return { qty: '', unit: 'g' };
  let qty = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(qty)) return { qty: '', unit: 'g' };
  const rest = m[2].toLowerCase();
  let unit = 'g';
  if (/kg|kilo/.test(rest)) { unit = 'g'; qty *= 1000; }
  else if (/cup|tasse|becher/.test(rest)) { unit = 'ml'; qty *= 240; }
  else if (/\bg\b|gramm/.test(rest)) unit = 'g';
  else if (/ml|milli/.test(rest)) unit = 'ml';
  else if (/\bl\b|liter/.test(rest)) { unit = 'ml'; qty *= 1000; }
  else if (/essl|tablespoon|tbsp|\bel\b/.test(rest)) unit = 'EL';
  else if (/teel|teaspoon|tsp|\btl\b/.test(rest)) unit = 'TL';
  else if (/dose|can\b/.test(rest)) unit = 'Dose';
  else if (/prise|pinch/.test(rest)) unit = 'Prise';
  else if (/stück|stk|zehe|kopf|stange|bund|scheibe/.test(rest) || rest === '') unit = 'Stück';
  return { qty: Math.round(qty * 100) / 100, unit: unit };
}

function formatRecipeAmount(qty, unit) {
  return (Math.round(qty * 100) / 100) + ' ' + unit;
}

function recipeIngRowHtml(n, qty, unit) {
  const u = unit || 'g';
  return `<div class="ing-row" style="display:flex;gap:5px;margin-bottom:6px;align-items:flex-start">
    <div class="autocomplete" style="flex:1;min-width:0">
      <input class="ing-name" type="text" autocomplete="off" placeholder="Zutat (z. B. Eier)"
        value="${esc(n || '')}" oninput="recipeIngSuggest(this);recipeIngChanged()" onfocus="recipeIngSuggest(this)">
      <div class="ac-list hidden"></div>
    </div>
    <input class="ing-qty" type="number" min="0" step="any" style="width:62px" placeholder="Menge"
      value="${(qty != null && qty !== '') ? qty : ''}" oninput="recipeIngChanged()">
    <select class="ing-unit" style="width:74px" onchange="recipeIngChanged()">
      ${RECIPE_UNITS.map((x) => `<option ${x === u ? 'selected' : ''}>${x}</option>`).join('')}
    </select>
    <button type="button" class="btn btn-icon btn-danger btn-sm" onclick="removeIngRow(this)">✕</button>
  </div>`;
}

function addIngRow() {
  document.getElementById('r-ing-rows').insertAdjacentHTML('beforeend', recipeIngRowHtml('', '', 'g'));
}

function removeIngRow(btn) {
  const box = document.getElementById('r-ing-rows');
  btn.closest('.ing-row').remove();
  if (!box.querySelector('.ing-row')) box.insertAdjacentHTML('beforeend', recipeIngRowHtml('', '', 'g'));
  recipeIngChanged();
}

function recipeIngSuggest(input) {
  const list = input.nextElementSibling;
  document.querySelectorAll('#r-ing-rows .ac-list').forEach((l) => { if (l !== list) l.classList.add('hidden'); });
  const matches = fuzzyFoodMatches(input.value, 7);
  if (!matches.length) { list.classList.add('hidden'); return; }
  list.innerHTML = matches.map((f) =>
    `<div class="ac-item" data-food="${esc(f)}" onclick="recipeIngPick(this)"><span>${esc(f)}</span></div>`).join('');
  list.classList.remove('hidden');
}

function recipeIngPick(item) {
  const list = item.parentElement;
  const row = list.closest('.ing-row');
  row.querySelector('.ing-name').value = item.dataset.food;
  list.classList.add('hidden');
  recipeIngChanged();
}

/* Zutaten-Zeilen einlesen – strukturiert (Zahl + Einheit). */
function collectRecipeRows() {
  return Array.from(document.querySelectorAll('#r-ing-rows .ing-row')).map((row) => ({
    n: row.querySelector('.ing-name').value.trim(),
    qty: parseFloat(row.querySelector('.ing-qty').value) || 0,
    unit: row.querySelector('.ing-unit').value,
  })).filter((i) => i.n);
}

/* Zutaten fürs Speichern – Menge als Anzeige-Text ("250 g"). */
function collectRecipeIngredients() {
  return collectRecipeRows().map((r) => ({
    n: r.n,
    a: r.qty > 0 ? formatRecipeAmount(r.qty, r.unit) : '',
  }));
}

/* Bei jeder Zutaten-Änderung – schätzt die Nährwerte neu,
   sofern sie nicht manuell überschrieben wurden. */
function recipeIngChanged() {
  if (!_recipeNutriLocked) recomputeRecipeNutrition();
}

function recomputeRecipeNutrition() {
  const m = estimateRecipeMacros(collectRecipeRows());
  ['protein', 'kcal', 'carbs', 'fat'].forEach((key) => {
    const el = document.getElementById('r-' + key);
    if (el) el.value = m[key];
  });
  updateRecipeNutriCheck();
}

function markNutriEdited() {
  _recipeNutriLocked = true;
  const hint = document.getElementById('r-nutri-hint');
  if (hint) hint.textContent = 'Nährwerte manuell bearbeitet. Mit „🔄 Aus Zutaten schätzen" neu berechnen.';
  updateRecipeNutriCheck();
}

function recalcNutriFromIngredients() {
  _recipeNutriLocked = false;
  const hint = document.getElementById('r-nutri-hint');
  if (hint) hint.textContent = 'Automatisch aus den Zutaten geschätzt – du kannst die Werte überschreiben.';
  recomputeRecipeNutrition();
}

function togglePlanBlock() {
  document.getElementById('r-plan-block').style.display =
    document.getElementById('r-toplan').checked ? '' : 'none';
}

/* Nährwert-Check: prüft, ob das Rezept als gewählte Mahlzeit
   genug Protein liefert, und schlägt sonst eine Lösung vor. */
function updateRecipeNutriCheck() {
  const box = document.getElementById('r-nutri-check');
  if (!box) return;
  const protein = +document.getElementById('r-protein').value || 0;
  const kcal = +document.getElementById('r-kcal').value || 0;
  const slot = document.getElementById('r-plan-slot').value;
  const ppm = +document.getElementById('r-plan-ppm').value || 1;
  const pGoal = DB.settings.proteinGoal || 120;
  const perMealP = protein * ppm, perMealK = kcal * ppm;
  const target = Math.round(pGoal * (SLOT_PROTEIN_SHARE[slot] || 0.3));
  let cls, msg;
  if (perMealP >= target * 0.85) {
    cls = 'alert-green';
    msg = `✓ ${perMealP} g Protein pro ${SLOT_LABEL[slot]} – passt gut (Richtwert für diese Mahlzeit: ~${target} g).`;
  } else {
    cls = 'alert-amber';
    const tips = [];
    if (ppm < 2) tips.push('2 Portionen pro Mahlzeit einplanen');
    tips.push('proteinreiche Zutaten ergänzen (Magerquark, Skyr, Tofu, Linsen, Eier, Proteinpulver)');
    if (slot !== 'snack') tips.push('das Rezept als Snack statt Hauptmahlzeit eintragen');
    msg = `⚠️ Nur ${perMealP} g Protein pro ${SLOT_LABEL[slot]} – Richtwert wären ~${target} g. Tipp: ${tips.join('; ')}.`;
  }
  box.innerHTML = `<div class="alert ${cls}" style="font-size:12px">${msg}
    <div style="margin-top:3px;color:var(--text3)">≈ ${perMealK} kcal pro Mahlzeit · ${protein} g Protein / ${kcal} kcal je Portion.</div></div>`;
}

function estimateRecipeCost(ingredients) {
  if (!ingredients.length) return 3;
  let sum = 0;
  ingredients.forEach((ing) => { sum += lookupFoodPrice(ing.n); });
  return Math.max(1, Math.min(8, Math.round(sum / 3.5 * 10) / 10));
}

/* Trägt das Rezept in den Plan ein. Liefert zurück, wie viele
   Tage tatsächlich belegt wurden (belegte Tage werden je nach
   Einstellung übersprungen). */
function scheduleRecipeIntoPlan(rec, opts) {
  const targetDays = [];
  for (let day = opts.start; day <= 14 && targetDays.length < opts.days; day++) {
    const d = DB.mealplan.find((x) => x.day === day);
    if (!d) continue;
    if (!opts.overwrite && d[opts.slot]) continue;
    targetDays.push(d);
  }
  targetDays.forEach((d, idx) => {
    d[opts.slot] = {
      name: rec.name,
      protein: Math.round(rec.protein * opts.ppm),
      kcal: Math.round(rec.kcal * opts.ppm),
      cost: Math.round((rec.cost || 3) * opts.ppm * 100) / 100,
      cuisine: rec.cuisine || '',
      rid: rec.id,
      mult: opts.ppm,
      reheated: opts.prep && idx > 0,
    };
    recalcDay(d);
  });
  return {
    slot: opts.slot, ppm: opts.ppm,
    placedDays: targetDays.length,
    skipped: opts.days - targetDays.length,
    firstWeek: (targetDays.length && targetDays[0].day > 7) ? 2 : 1,
  };
}

function addRecipeIngredientsScaled(ingredients, servings) {
  let touched = 0;
  ingredients.forEach((ing) => {
    const name = translateFoodName(ing.n);
    const amount = scaleAmount(ing.a, servings);
    const key = foodKey(name);
    const existing = DB.groceries.find((g) => foodKey(g.n) === key);
    if (existing) {
      existing.a = mergeAmounts(existing.a, amount);   // Menge addieren statt Dublette
    } else {
      const store = guessStore(name);
      DB.groceries.push({
        id: uid(), n: name, a: amount,
        cat: guessCategory(name), store, price: estimatePrice(name, store), checked: false,
      });
    }
    touched++;
  });
  return touched;
}

function openAddRecipeModal(prefill) {
  const p = prefill || {};
  const ings = (p.ingredients && p.ingredients.length) ? p.ingredients : [{ n: '', a: '' }];
  const curTag = (p.tags && p.tags[0]) || '';
  // vorbefüllte Nährwerte (z. B. aus dem Import) nicht überschreiben
  _recipeNutriLocked = !!(prefill && (prefill.protein || prefill.kcal));
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal">
      <div class="modal-head"><div class="modal-title">${p.name ? 'Rezept prüfen & speichern' : 'Neues Rezept'}</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Name</label>
          <input id="r-name" type="text" value="${esc(p.name || '')}" placeholder="z. B. Tofu-Curry"></div>
        <div class="form-grid">
          <div class="form-row"><label>Küche</label>
            <select id="r-cuisine">
              ${['european', 'italian', 'asian', 'indian', 'mediterranean', 'mexican', 'oriental', 'german'].map((c) =>
                `<option value="${c}" ${p.cuisine === c ? 'selected' : ''}>${cuisineLabel(c)}</option>`).join('')}
            </select></div>
          <div class="form-row"><label>Zubereitungszeit (Min)</label>
            <input id="r-time" type="number" min="1" value="${p.time || 30}"></div>
        </div>
        <div class="form-row"><label>Bild-URL (optional)</label>
          <input id="r-image" type="url" value="${esc(p.image || '')}" placeholder="https://…"></div>

        <hr class="divider">
        <div class="card-title" style="font-size:14px">🥗 Zutaten · für 1 Portion</div>
        <p class="text-muted" style="font-size:11px;margin:2px 0 8px">Menge + Einheit (g, ml, Stück, EL, TL …) für eine einzige Portion. Daraus schätzt die App die Nährwerte.</p>
        <div id="r-ing-rows">${ings.map((i) => { const pa = parseAmount(i.a); return recipeIngRowHtml(i.n, pa.qty, pa.unit); }).join('')}</div>
        <button type="button" class="btn btn-sm" onclick="addIngRow()">+ Zutat</button>
        <div class="form-row mt-1"><label>Zubereitung (ein Schritt pro Zeile)</label>
          <textarea id="r-steps" rows="4" placeholder="Tofu würfeln und anbraten.&#10;Gemüse dazugeben…">${esc((p.steps || []).join('\n'))}</textarea></div>

        <hr class="divider">
        <div class="card-title" style="font-size:14px">📊 Nährwerte · pro Portion</div>
        <p id="r-nutri-hint" class="text-muted" style="font-size:11px;margin:2px 0 6px">Automatisch aus den Zutaten geschätzt – du kannst die Werte überschreiben.</p>
        <div class="form-grid">
          <div class="form-row"><label>Protein (g)</label>
            <input id="r-protein" type="number" min="0" placeholder="auto" value="${p.protein != null ? p.protein : ''}" oninput="markNutriEdited()"></div>
          <div class="form-row"><label>Kalorien (kcal)</label>
            <input id="r-kcal" type="number" min="0" placeholder="auto" value="${p.kcal != null ? p.kcal : ''}" oninput="markNutriEdited()"></div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Kohlenhydrate (g)</label>
            <input id="r-carbs" type="number" min="0" placeholder="auto" value="${p.carbs != null ? p.carbs : ''}" oninput="markNutriEdited()"></div>
          <div class="form-row"><label>Fett (g)</label>
            <input id="r-fat" type="number" min="0" placeholder="auto" value="${p.fat != null ? p.fat : ''}" oninput="markNutriEdited()"></div>
        </div>
        <button type="button" class="btn btn-sm" onclick="recalcNutriFromIngredients()">🔄 Nährwerte aus Zutaten schätzen</button>
        <div class="form-grid">
          <div class="form-row"><label>Eigenschaft</label>
            <select id="r-tag">
              <option value="">—</option>
              ${['high-protein', 'quick', 'meal-prep', 'cheap'].map((t) =>
                `<option value="${t}" ${curTag === t ? 'selected' : ''}>${tagLabel(t)}</option>`).join('')}
            </select></div>
          <div class="form-row"><label>Notiz (optional)</label>
            <input id="r-notes" type="text" value="${esc(p.notes || '')}" placeholder="z. B. Tipp"></div>
        </div>

        <hr class="divider">
        <div class="form-row"><label><input type="checkbox" id="r-toplan" checked style="width:auto;margin-right:6px" onchange="togglePlanBlock()">
          <strong>In den Mahlzeitenplan eintragen</strong></label></div>
        <div id="r-plan-block">
          <div class="form-grid">
            <div class="form-row"><label>Als welche Mahlzeit?</label>
              <select id="r-plan-slot" onchange="updateRecipeNutriCheck()">
                <option value="breakfast">Frühstück</option>
                <option value="lunch">Mittagessen</option>
                <option value="dinner" selected>Abendessen</option>
                <option value="snack">Snack</option>
              </select></div>
            <div class="form-row"><label>Für wie viele Tage?</label>
              <input id="r-plan-days" type="number" min="1" max="14" value="3"></div>
          </div>
          <div class="form-grid">
            <div class="form-row"><label>Ab Tag (1–14)</label>
              <input id="r-plan-start" type="number" min="1" max="14" value="1"></div>
            <div class="form-row"><label>Portionen pro Mahlzeit</label>
              <select id="r-plan-ppm" onchange="updateRecipeNutriCheck()">
                <option value="1">1 Portion</option>
                <option value="2">2 Portionen</option>
              </select></div>
          </div>
          <div class="form-row"><label><input type="checkbox" id="r-plan-prep" checked style="width:auto;margin-right:6px">
            Meal Prep: einmal kochen, Folgetage „aufgewärmt"</label></div>
          <div class="form-row"><label><input type="checkbox" id="r-plan-overwrite" checked style="width:auto;margin-right:6px">
            Schon belegte Tage überschreiben (sonst werden sie übersprungen)</label></div>
          <div id="r-nutri-check" class="mb-1"></div>
        </div>

        <div class="form-row"><label><input type="checkbox" id="r-togroc" checked style="width:auto;margin-right:6px">
          Zutaten zur Einkaufsliste hinzufügen</label></div>
        <div class="flex gap-2 mt-1">
          <button class="btn btn-primary btn-sm" onclick="saveNewRecipe()">Speichern</button>
          <button class="btn btn-sm" onclick="closeModal()">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>`);
  updateRecipeNutriCheck();
}

async function saveNewRecipe() {
  const name = document.getElementById('r-name').value.trim();
  if (!name) { toast('Bitte einen Rezeptnamen eingeben.'); return; }
  const ingredients = collectRecipeIngredients();
  const steps = document.getElementById('r-steps').value.trim().split('\n').map((s) => s.trim()).filter(Boolean);
  const tag = document.getElementById('r-tag').value;
  const toPlan = document.getElementById('r-toplan').checked;

  const rec = {
    id: uid(), name,
    image: document.getElementById('r-image').value.trim(),
    time: +document.getElementById('r-time').value || 30,
    portions: 3,
    protein: +document.getElementById('r-protein').value || 0,
    kcal: +document.getElementById('r-kcal').value || 0,
    carbs: +document.getElementById('r-carbs').value || 0,
    fat: +document.getElementById('r-fat').value || 0,
    cost: estimateRecipeCost(ingredients),
    cuisine: document.getElementById('r-cuisine').value,
    tags: tag ? [tag] : [],
    ingredients, steps,
    notes: document.getElementById('r-notes').value.trim(),
    active: true, browse: false, perPortion: true,
  };

  let planResult = null;
  if (toPlan) {
    const opts = {
      slot: document.getElementById('r-plan-slot').value,
      days: Math.max(1, Math.min(14, +document.getElementById('r-plan-days').value || 1)),
      start: Math.max(1, Math.min(14, +document.getElementById('r-plan-start').value || 1)),
      ppm: +document.getElementById('r-plan-ppm').value || 1,
      prep: document.getElementById('r-plan-prep').checked,
      overwrite: document.getElementById('r-plan-overwrite').checked,
    };
    rec.portions = opts.days;
    planResult = scheduleRecipeIntoPlan(rec, opts);
  }

  DB.recipes.push(rec);
  await Data.persist('recipes');
  if (planResult) await Data.persist('mealplan');

  let groceriesAdded = 0;
  if (document.getElementById('r-togroc').checked && ingredients.length) {
    const servings = planResult ? Math.max(1, planResult.placedDays * planResult.ppm) : 1;
    groceriesAdded = addRecipeIngredientsScaled(ingredients, servings);
    if (groceriesAdded) await Data.persist('groceries');
  }

  closeModal();
  if (planResult && planResult.placedDays) {
    curPlanWeek = planResult.firstWeek;
    navigate('mealplan');               // Ergebnis direkt sichtbar machen
  } else {
    renderRecipes();
  }

  let msg;
  if (planResult) {
    msg = planResult.placedDays
      ? `Rezept gespeichert · ${planResult.placedDays} Tag(e) als ${SLOT_LABEL[planResult.slot]} eingetragen.`
      : 'Rezept gespeichert · keine freien Tage gefunden (alle belegt).';
  } else {
    msg = 'Rezept gespeichert.';
  }
  if (groceriesAdded) msg += ` ${groceriesAdded} Zutat(en) zur Einkaufsliste.`;
  toast(msg);
  if (planResult && planResult.placedDays && planResult.skipped > 0) {
    setTimeout(() => toast(`${planResult.skipped} bereits belegte(r) Tag(e) übersprungen.`), 900);
  }
}

/* ---------- Import per URL (Spoonacular) ---------- */
function openImportModal() {
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" style="max-width:440px">
      <div class="modal-head"><div class="modal-title">Rezept per URL importieren</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        ${DB.settings.spoonacularKey
          ? `<p class="text-sm text-muted mb-2">Füge die Adresse einer Rezept-Webseite ein – Zutaten, Bild und Nährwerte werden automatisch ausgelesen.</p>
             <div class="form-row"><label>Rezept-URL</label>
               <input id="imp-url" type="url" placeholder="https://…"></div>
             <div id="imp-status"></div>
             <div class="flex gap-2 mt-1">
               <button class="btn btn-primary btn-sm" id="imp-btn" onclick="importRecipeFromUrl()">Importieren</button>
               <button class="btn btn-sm" onclick="closeModal()">Abbrechen</button>
             </div>`
          : `<div class="alert alert-amber">Für den URL-Import wird ein Spoonacular-API-Key benötigt. Du kannst ihn in den <a onclick="closeModal();navigate('settings')" style="color:var(--accent);cursor:pointer;font-weight:600">Einstellungen</a> eintragen.</div>`}
      </div>
    </div>
  </div>`);
}

async function importRecipeFromUrl() {
  const url = (document.getElementById('imp-url').value || '').trim();
  const status = document.getElementById('imp-status');
  const btn = document.getElementById('imp-btn');
  if (!url) { status.innerHTML = '<div class="auth-error">Bitte eine URL eingeben.</div>'; return; }
  btn.disabled = true; btn.textContent = 'Lädt…';
  status.innerHTML = '<p class="text-sm text-muted">Rezept wird ausgelesen…</p>';
  try {
    const api = `${EP.SPOONACULAR_BASE}/recipes/extract?apiKey=${encodeURIComponent(DB.settings.spoonacularKey)}&url=${encodeURIComponent(url)}&analyzedInstructions=true&forceExtraction=true`;
    const res = await fetch(api);
    if (!res.ok) throw new Error('Status ' + res.status);
    const data = await res.json();
    if (!data || !data.title) throw new Error('Kein Rezept erkannt.');
    closeModal();
    openAddRecipeModal(spoonToRecipe(data));
    toast('Rezept ausgelesen – bitte prüfen und speichern.');
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Importieren';
    status.innerHTML = `<div class="auth-error">Import fehlgeschlagen: ${esc(e.message)}</div>`;
  }
}
