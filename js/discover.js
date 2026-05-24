/* ============================================================
   ESSENSPLANER – Entdecken
   Lokale Vorschläge + Online-Suche via Spoonacular (mit Bildern).
   Die Suche ist zweisprachig: „Apfel" findet auch „apple".
   ============================================================ */

let discoverSearch = '';
let discoverCuisine = '';
window.lastSpoonResults = [];

/* Wörterbuch DE <-> EN für die zweisprachige Suche */
const FOOD_DE_EN = {
  apfel: 'apple', banane: 'banana', kartoffel: 'potato', tomate: 'tomato', zwiebel: 'onion',
  knoblauch: 'garlic', reis: 'rice', nudeln: 'pasta', linsen: 'lentils', kichererbsen: 'chickpeas',
  bohnen: 'beans', erbsen: 'peas', tofu: 'tofu', ei: 'egg', eier: 'eggs', käse: 'cheese',
  milch: 'milk', joghurt: 'yogurt', quark: 'quark', spinat: 'spinach', brokkoli: 'broccoli',
  paprika: 'pepper', karotte: 'carrot', pilze: 'mushrooms', kürbis: 'pumpkin', zucchini: 'zucchini',
  aubergine: 'eggplant', avocado: 'avocado', mais: 'corn', hähnchen: 'chicken', huhn: 'chicken',
  fisch: 'fish', lachs: 'salmon', curry: 'curry', suppe: 'soup', salat: 'salad', auflauf: 'casserole',
  pfanne: 'stir fry', kuchen: 'cake', brot: 'bread', haferflocken: 'oats', mandeln: 'almonds',
  nuss: 'nut', nüsse: 'nuts', honig: 'honey', schokolade: 'chocolate', beeren: 'berries',
  gemüse: 'vegetable', bowl: 'bowl', wrap: 'wrap', protein: 'protein',
};
const FOOD_EN_DE = Object.fromEntries(Object.entries(FOOD_DE_EN).map(([d, e]) => [e, d]));

function translateWords(q, dict) {
  return (q || '').toLowerCase().split(/\s+/).map((w) => dict[w] || w).join(' ').trim();
}

function renderDiscover() {
  const el = document.getElementById('page-browse');
  const hasKey = !!DB.settings.spoonacularKey;
  el.innerHTML = `
    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
      <div class="search-wrap" style="flex:1;min-width:200px;max-width:320px">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="Zutat oder Gericht (optional)…" value="${esc(discoverSearch)}"
               oninput="discoverSearch=this.value;renderDiscoverGrid()"
               onkeydown="if(event.key==='Enter')searchOnline()">
      </div>
      <div class="flex gap-2 flex-wrap">
        <select onchange="discoverCuisine=this.value;renderDiscoverGrid()">
          <option value="">Alle Küchen</option>
          <option value="italian" ${discoverCuisine === 'italian' ? 'selected' : ''}>🍝 Italienisch</option>
          <option value="asian" ${discoverCuisine === 'asian' ? 'selected' : ''}>🍜 Asiatisch</option>
          <option value="indian" ${discoverCuisine === 'indian' ? 'selected' : ''}>🍛 Indisch</option>
          <option value="mediterranean" ${discoverCuisine === 'mediterranean' ? 'selected' : ''}>🫒 Mediterran</option>
          <option value="mexican" ${discoverCuisine === 'mexican' ? 'selected' : ''}>🌮 Mexikanisch</option>
          <option value="oriental" ${discoverCuisine === 'oriental' ? 'selected' : ''}>🧆 Orientalisch</option>
          <option value="german" ${discoverCuisine === 'german' ? 'selected' : ''}>🥨 Deutsch</option>
          <option value="european" ${discoverCuisine === 'european' ? 'selected' : ''}>🥗 Europäisch</option>
        </select>
        ${hasKey ? '<button class="btn btn-sm btn-primary" id="online-btn" onclick="searchOnline()">🌐 Online suchen</button>' : ''}
      </div>
    </div>
    ${hasKey ? `<div class="alert alert-blue" style="font-size:12px">💡 Für Inspiration: einfach eine Küche wählen und auf „🌐 Online suchen" tippen – ganz ohne Suchbegriff. Du bekommst dann 10 passende Rezepte.</div>` : ''}
    ${!hasKey ? `<div class="alert alert-amber">💡 Mit einem Spoonacular-API-Key (in den <a onclick="navigate('settings')" style="color:var(--accent);cursor:pointer;font-weight:600">Einstellungen</a>) durchsuchst du tausende Rezepte mit Bildern.</div>` : ''}
    <div id="discover-online"></div>
    <div class="section-title" style="margin-top:8px">Vorschläge</div>
    <div class="grid-3" id="discover-grid" style="gap:14px"></div>`;
  renderDiscoverGrid();
  renderOnlineResults();
}

function renderDiscoverGrid() {
  let recs = DB.recipes.filter((r) => r.browse);
  if (discoverCuisine) recs = recs.filter((r) => r.cuisine === discoverCuisine);
  if (discoverSearch.trim()) {
    const terms = [
      discoverSearch.toLowerCase(),
      translateWords(discoverSearch, FOOD_DE_EN),
      translateWords(discoverSearch, FOOD_EN_DE),
    ];
    recs = recs.filter((r) => terms.some((t) =>
      r.name.toLowerCase().includes(t) || (r.ingredients || []).some((i) => i.n.toLowerCase().includes(t))));
  }
  const grid = document.getElementById('discover-grid');
  if (!grid) return;
  grid.innerHTML = recs.length
    ? recs.map((r) => recipeCard(r, { showAddBtn: true })).join('')
    : '<div class="empty-state"><div class="icon">🔍</div><p>Keine lokalen Treffer – probiere die Online-Suche.</p></div>';
}

function renderOnlineResults() {
  const box = document.getElementById('discover-online');
  if (!box) return;
  if (!lastSpoonResults.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="section-title">🌐 Online-Ergebnisse (Spoonacular)</div>
    <div class="grid-3" style="gap:14px;margin-bottom:8px">
      ${lastSpoonResults.map((r) => recipeCard(r, { showAddBtn: true })).join('')}
    </div>`;
}

/* ---------- Online-Suche ----------
   Funktioniert mit Suchbegriff ODER ganz ohne (dann liefert die
   gewählte Küche zufällige Rezept-Inspiration). */
async function searchOnline() {
  const key = DB.settings.spoonacularKey;
  if (!key) { toast('Kein Spoonacular-Key – in den Einstellungen eintragen.'); return; }
  const query = discoverSearch.trim();

  const btn = document.getElementById('online-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sucht…'; }
  try {
    const diet = DB.settings.diet === 'vegan' ? 'vegan'
      : DB.settings.diet === 'vegetarian' ? 'vegetarian' : '';
    const intolerances = (DB.settings.allergies || []).map(allergyToSpoon).filter(Boolean).join(',');
    let url = `${EP.SPOONACULAR_BASE}/recipes/complexSearch?apiKey=${encodeURIComponent(key)}`
      + '&number=10&addRecipeNutrition=true&addRecipeInformation=true&instructionsRequired=true';
    if (query) {
      url += '&query=' + encodeURIComponent(translateWords(query, FOOD_DE_EN));
    } else {
      url += '&sort=random';                       // ohne Suchbegriff: Inspiration
    }
    if (diet) url += '&diet=' + diet;
    if (intolerances) url += '&intolerances=' + encodeURIComponent(intolerances);
    const cui = spoonCuisine(discoverCuisine);
    if (cui) url += '&cuisine=' + encodeURIComponent(cui);

    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status === 401 ? 'API-Key ungültig.' : res.status === 402 ? 'Tageslimit erreicht.' : 'Status ' + res.status);
    const data = await res.json();
    lastSpoonResults = (data.results || []).map(spoonToRecipe);
    renderOnlineResults();
    toast(lastSpoonResults.length ? `${lastSpoonResults.length} Online-Rezepte gefunden.` : 'Keine Online-Treffer.');
  } catch (e) {
    toast('Online-Suche fehlgeschlagen: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🌐 Online suchen'; }
  }
}

function allergyToSpoon(a) {
  return ({ 'Gluten': 'gluten', 'Laktose': 'dairy', 'Nüsse': 'tree nut', 'Erdnüsse': 'peanut',
    'Soja': 'soy', 'Eier': 'egg', 'Sesam': 'sesame', 'Senf': '' })[a] || '';
}
function spoonCuisine(c) {
  return ({ asian: 'asian', indian: 'indian', mediterranean: 'mediterranean',
    mexican: 'mexican', oriental: 'middle eastern', italian: 'italian',
    german: 'german', european: 'european' })[c] || '';
}

/* ---------- Spoonacular -> internes Rezept-Format ---------- */
function extractSteps(s) {
  const ai = s.analyzedInstructions;
  if (ai && ai[0] && ai[0].steps && ai[0].steps.length) return ai[0].steps.map((x) => x.step);
  if (s.instructions) {
    return String(s.instructions).replace(/<[^>]+>/g, ' ').split(/\.\s+/)
      .map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\.$/, '') + '.');
  }
  return [];
}

/* Wandelt Spoonacular-Mengen in metrische / deutsche Einheiten um.
   Cups, Ounces & Co. werden umgerechnet (z. B. 1 cup -> 240 ml). */
function convertSpoonAmount(amount, unit) {
  if (amount == null || amount === '') return '';
  const u = String(unit || '').toLowerCase().trim();
  const has = (re) => re.test(u);
  let qty = amount, out = unit || '';
  if (has(/cup|tasse|becher/)) { qty = amount * 240; out = 'ml'; }
  else if (has(/fluid ounce|fl\.? ?oz/)) { qty = amount * 30; out = 'ml'; }
  else if (has(/tablespoon|tbsp|essl|^el$/)) { out = 'EL'; }
  else if (has(/teaspoon|tsp|teel|^tl$/)) { out = 'TL'; }
  else if (has(/ounce|^oz$/)) { qty = amount * 28; out = 'g'; }
  else if (has(/pound|^lbs?$/)) { qty = amount * 454; out = 'g'; }
  else if (has(/kilogram|^kg$/)) { qty = amount * 1000; out = 'g'; }
  else if (has(/milliliter|^ml$/)) { out = 'ml'; }
  else if (has(/^grams?$|gramm|^g$/)) { out = 'g'; }
  else if (has(/liter|litre|^l$/)) { qty = amount * 1000; out = 'ml'; }
  else if (has(/clove|zehe/)) { out = 'Stück'; }
  else if (has(/pinch|prise/)) { out = 'Prise'; }
  const num = Math.round(qty * 10) / 10;
  return (num + (out ? ' ' + out : '')).trim();
}

function spoonToRecipe(s) {
  const nutr = (s.nutrition && s.nutrition.nutrients) || [];
  const get = (name) => { const x = nutr.find((n) => n.name === name); return x ? Math.round(x.amount) : 0; };
  const ings = (s.nutrition && s.nutrition.ingredients) || s.extendedIngredients || [];
  const protein = get('Protein');
  return {
    id: 'sp' + s.id,
    name: s.title || 'Rezept',
    image: s.image || '',
    time: s.readyInMinutes || 30,
    portions: s.servings || 2,
    protein, kcal: get('Calories'), carbs: get('Carbohydrates'), fat: get('Fat'),
    cost: s.pricePerServing ? Math.round(s.pricePerServing) / 100 : 3,
    cuisine: ((s.cuisines && s.cuisines[0]) || 'european').toLowerCase(),
    tags: protein >= 25 ? ['high-protein'] : [],
    ingredients: ings.map((i) => ({
      n: translateFoodName(i.name || i.originalName || i.original || ''),
      a: convertSpoonAmount(i.amount, i.unit),
    })).filter((i) => i.n),
    steps: extractSteps(s),
    notes: s.sourceUrl ? 'Quelle: ' + s.sourceUrl : '',
    browse: true, active: false, spoon: true,
  };
}
