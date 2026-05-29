/* ============================================================
   ESSENSPLANER – Einkaufsliste
   - Beim Hinzufügen reicht der Name: Laden, Kategorie und ein
     geschätzter Preis werden automatisch zugeordnet.
   - Reiter: Alle, Wohnort, Vergleichsort, Einkaufstag, Kategorien.
   - Preise per Klick editierbar; Gesamtbetrag je Währung.
   - Abhaken legt den Artikel automatisch in den Vorrat.
   - Ohne Vergleichsort zählt nur der Wohnort.
   ============================================================ */

let curGroceryFilter = 'all';

/* ---------- Automatische Zuordnung ---------- */
const CAT_KEYWORDS = {
  'Gemüse': ['brokkoli', 'paprika', 'zwiebel', 'knoblauch', 'karotte', 'möhre', 'salat', 'gurke', 'tomate', 'spinat', 'zucchini', 'kartoffel', 'lauch', 'kohl', 'sellerie', 'aubergine', 'champignon', 'pilz', 'ingwer', 'kräuter'],
  'Obst': ['apfel', 'banane', 'beere', 'beeren', 'orange', 'zitrone', 'limette', 'birne', 'traube', 'mango', 'avocado'],
  'Hülsenfrüchte': ['linse', 'linsen', 'kichererbse', 'kichererbsen', 'bohne', 'bohnen'],
  'Getreide': ['reis', 'nudel', 'nudeln', 'pasta', 'haferflocken', 'mehl', 'brot', 'couscous', 'bulgur', 'quinoa'],
  'Milchprodukte': ['milch', 'joghurt', 'skyr', 'quark', 'käse', 'sahne', 'butter', 'gouda', 'mozzarella', 'paneer'],
  'Proteinquellen': ['tofu', 'tempeh', 'seitan', 'ei', 'eier', 'proteinpulver'],
  'Konserven': ['dose', 'konserve', 'kokosmilch', 'passierte'],
  'TK': ['gefroren', 'tiefkühl', 'tk', 'tk-'],
};

function guessCategory(name) {
  const n = (name || '').toLowerCase();
  for (const [cat, words] of Object.entries(CAT_KEYWORDS)) {
    if (words.some((w) => n.includes(w))) return cat;
  }
  return 'Sonstiges';
}

function guessStore(name) {
  if (!hasComparison()) return 'home';
  const strat = DB.settings && DB.settings.strategy;
  if (strat === 'all-home') return 'home';
  if (strat === 'all-comp') return 'comp';
  const cat = guessCategory(name);
  return (cat === 'Gemüse' || cat === 'Obst') ? 'home' : 'comp';
}

function pantryCatFor(cat) {
  return ['Gemüse', 'Obst', 'Milchprodukte', 'Proteinquellen', 'TK'].includes(cat) ? 'fresh' : 'dry';
}

function storeInfo(store) { return store === 'home' ? homeInfo() : compInfo(); }

function parsePrice(str) {
  if (!str || str === '–') return null;
  const m = String(str).replace(',', '.').match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/* ============================================================
   AUTOMATISCHE PREISSCHÄTZUNG
   Grobe Richtpreise (EUR, typische Packung im dt. Supermarkt).
   Reihenfolge: spezifische Begriffe zuerst.
   ============================================================ */
const FOOD_PRICES = [
  ['proteinpulver', 15], ['erdnussmus', 3.0], ['mandelmus', 4.0], ['tahini', 3.5],
  ['kokosmilch', 1.0], ['kokos', 1.2],
  ['rote linsen', 1.2], ['linsen', 1.3], ['linse', 1.3],
  ['kichererbse', 0.6], ['kidneybohne', 0.7], ['schwarze bohne', 0.7], ['bohne', 0.7],
  ['basmati', 2.2], ['reisnudel', 1.5], ['reis', 2.0],
  ['erbsen-linsen-nudel', 1.8], ['vollkornnudel', 1.2], ['nudel', 1.2], ['pasta', 1.3],
  ['haferflocken', 0.8], ['couscous', 1.6], ['bulgur', 1.6], ['quinoa', 2.8],
  ['mehl', 0.9], ['brot', 1.6],
  ['passierte tomaten', 0.8], ['tomaten', 0.7], ['tomate', 1.6], ['mais', 0.8],
  ['räuchertofu', 2.0], ['tofu', 1.6], ['tempeh', 2.6], ['seitan', 2.2], ['paneer', 2.6],
  ['eier', 2.2], ['ei', 2.2],
  ['magerquark', 0.9], ['quark', 0.9], ['skyr', 1.1],
  ['griechischer joghurt', 1.2], ['joghurt', 0.8], ['milch', 1.1],
  ['parmesan', 2.5], ['mozzarella', 0.9], ['gouda', 1.8], ['käse', 2.0],
  ['sahne', 0.8], ['butter', 2.2],
  ['brokkoli', 1.1], ['blumenkohl', 1.4], ['paprika', 1.6], ['zucchini', 0.9],
  ['süßkartoffel', 1.8], ['kartoffel', 1.5], ['karotte', 1.0], ['möhre', 1.0],
  ['zwiebel', 0.8], ['knoblauch', 0.5], ['ingwer', 0.5],
  ['spinat', 1.5], ['salat', 1.0], ['gurke', 0.7], ['lauch', 0.9], ['kohl', 1.2],
  ['champignon', 1.5], ['pilz', 1.6], ['aubergine', 1.3], ['sellerie', 1.2],
  ['banane', 0.6], ['apfel', 1.8], ['avocado', 1.2], ['mango', 1.2],
  ['beeren', 2.5], ['beere', 2.5], ['zitrone', 0.4], ['limette', 0.4], ['orange', 1.5],
  ['olivenöl', 4.0], ['rapsöl', 2.5], ['sesamöl', 3.5], ['öl', 3.0],
  ['sojasauce', 1.6], ['gemüsebrühe', 1.0], ['brühe', 1.0], ['essig', 1.2],
  ['honig', 3.0], ['ahornsirup', 3.5], ['zucker', 0.9],
  ['walnüss', 2.8], ['walnuss', 2.8], ['mandel', 2.8], ['cashew', 3.0], ['nüsse', 2.5], ['nuss', 2.5],
  ['leinsamen', 1.8], ['chiasamen', 3.0], ['sesam', 2.0], ['samen', 2.2],
  ['garam masala', 1.5], ['kurkuma', 1.2], ['kreuzkümmel', 1.2], ['paprikapulver', 1.2],
  ['curry', 1.2], ['chili', 0.8], ['zimt', 1.0], ['muskat', 1.5], ['gewürz', 1.2],
  ['salz', 0.5], ['pfeffer', 1.0],
];

/* grobe Wechselkurse relativ zum EUR (nur für Schätzpreise) */
const CURRENCY_RATE = { EUR: 1, CHF: 1.9, CZK: 24, PLN: 4.3, SEK: 11, NOK: 11.5, DKK: 7.5, HUF: 380 };

/* ============================================================
   ZUTATEN-ÜBERSETZUNG (Englisch -> Deutsch)
   Spoonacular liefert englische Namen. Damit „eggs" und „Eier"
   nicht doppelt auf der Einkaufsliste landen, werden Namen ins
   Deutsche übersetzt und über einen kanonischen Schlüssel
   (foodKey) zusammengeführt. Unbekanntes bleibt unverändert –
   ein bisschen Englisch ist in Ordnung.
   ============================================================ */
const FOOD_PHRASE2DE = {
  'olive oil': 'Olivenöl', 'extra virgin olive oil': 'Olivenöl',
  'vegetable oil': 'Rapsöl', 'canola oil': 'Rapsöl', 'coconut oil': 'Kokosöl', 'sesame oil': 'Sesamöl',
  'coconut milk': 'Kokosmilch', 'soy sauce': 'Sojasauce', 'soy milk': 'Sojamilch',
  'bell pepper': 'Paprika', 'bell peppers': 'Paprika', 'red bell pepper': 'Paprika',
  'green onion': 'Frühlingszwiebel', 'green onions': 'Frühlingszwiebeln', 'spring onion': 'Frühlingszwiebel',
  'peanut butter': 'Erdnussmus', 'almond butter': 'Mandelmus', 'maple syrup': 'Ahornsirup',
  'black beans': 'Schwarze Bohnen', 'kidney beans': 'Kidneybohnen', 'white beans': 'Weiße Bohnen',
  'green beans': 'Grüne Bohnen', 'garbanzo beans': 'Kichererbsen',
  'tomato sauce': 'Passierte Tomaten', 'tomato puree': 'Passierte Tomaten',
  'crushed tomatoes': 'Passierte Tomaten', 'canned tomatoes': 'Tomaten (Dose)',
  'diced tomatoes': 'Tomaten (Dose)', 'cherry tomatoes': 'Kirschtomaten', 'tomato paste': 'Tomatenmark',
  'sweet potato': 'Süßkartoffel', 'sweet potatoes': 'Süßkartoffeln',
  'cream cheese': 'Frischkäse', 'sour cream': 'Sauerrahm', 'greek yogurt': 'Griechischer Joghurt',
  'cottage cheese': 'Hüttenkäse', 'parmesan cheese': 'Parmesan',
  'black pepper': 'Pfeffer', 'sea salt': 'Salz', 'brown rice': 'Reis', 'white rice': 'Reis',
  'basmati rice': 'Basmati Reis', 'red lentils': 'Rote Linsen', 'rolled oats': 'Haferflocken',
  'chili powder': 'Chilipulver', 'curry powder': 'Currypulver', 'nutritional yeast': 'Hefeflocken',
  'lemon juice': 'Zitronensaft', 'lime juice': 'Limettensaft', 'baking powder': 'Backpulver',
};
/* Nur Wörter, die sich vom Deutschen unterscheiden UND eindeutig sind.
   (z. B. „paprika" bewusst NICHT – im EN Gewürz, im DE Gemüse.) */
const FOOD_EN2DE = {
  egg: 'Ei', eggs: 'Eier', milk: 'Milch', cheese: 'Käse', butter: 'Butter',
  yogurt: 'Joghurt', yoghurt: 'Joghurt', cream: 'Sahne', rice: 'Reis', pasta: 'Nudeln',
  noodles: 'Nudeln', bread: 'Brot', flour: 'Mehl', oats: 'Haferflocken',
  lentils: 'Linsen', lentil: 'Linsen', beans: 'Bohnen', bean: 'Bohnen', peas: 'Erbsen',
  chickpeas: 'Kichererbsen', chickpea: 'Kichererbsen', spinach: 'Spinat', broccoli: 'Brokkoli',
  cauliflower: 'Blumenkohl', carrot: 'Karotte', carrots: 'Karotten', potato: 'Kartoffel',
  potatoes: 'Kartoffeln', onion: 'Zwiebel', onions: 'Zwiebeln', garlic: 'Knoblauch', ginger: 'Ingwer',
  tomato: 'Tomate', tomatoes: 'Tomaten', cucumber: 'Gurke', courgette: 'Zucchini',
  eggplant: 'Aubergine', aubergine: 'Aubergine', mushroom: 'Champignon', mushrooms: 'Champignons',
  cabbage: 'Kohl', kale: 'Grünkohl', lettuce: 'Salat', leek: 'Lauch', celery: 'Sellerie',
  corn: 'Mais', olive: 'Oliven', olives: 'Oliven', apple: 'Apfel', apples: 'Äpfel',
  banana: 'Banane', bananas: 'Bananen', lemon: 'Zitrone', lime: 'Limette', orange: 'Orange',
  berries: 'Beeren', blueberries: 'Blaubeeren', strawberries: 'Erdbeeren', raspberries: 'Himbeeren',
  nuts: 'Nüsse', nut: 'Nuss', walnuts: 'Walnüsse', almonds: 'Mandeln', cashews: 'Cashewkerne',
  peanuts: 'Erdnüsse', seeds: 'Samen', oil: 'Öl', honey: 'Honig', sugar: 'Zucker',
  salt: 'Salz', water: 'Wasser', parsley: 'Petersilie', basil: 'Basilikum',
  cilantro: 'Koriander', coriander: 'Koriander', cinnamon: 'Zimt', cumin: 'Kreuzkümmel',
  turmeric: 'Kurkuma', thyme: 'Thymian', rosemary: 'Rosmarin', vinegar: 'Essig', mustard: 'Senf',
  broth: 'Brühe', stock: 'Brühe', coconut: 'Kokos', raisins: 'Rosinen', dates: 'Datteln',
  scallions: 'Frühlingszwiebeln',
};
/* Englische Füllwörter, die beim Übersetzen entfallen */
const EN_FOOD_FILLER = ['fresh', 'large', 'small', 'medium', 'boneless', 'skinless', 'raw',
  'cooked', 'chopped', 'sliced', 'diced', 'minced', 'ground', 'extra', 'virgin', 'organic',
  'ripe', 'whole', 'peeled', 'grated', 'shredded', 'of', 'a', 'an', 'the', 'plain'];

function _capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* Übersetzt einen Zutatennamen ins Deutsche. Erkennt die App
   nichts Englisches, bleibt der Name unverändert. */
function translateFoodName(name) {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  // Zwiebel-/Knoblauchpulver durch die frische Zutat ersetzen (andere Pulver bleiben)
  if (/zwiebelpulver|onion powder/.test(lower)) return 'Zwiebel';
  if (/knoblauchpulver|garlic powder/.test(lower)) return 'Knoblauch';
  if (FOOD_PHRASE2DE[lower]) return FOOD_PHRASE2DE[lower];
  const words = lower.split(/[\s,]+/).filter(Boolean);
  const out = [];
  let changed = false;
  for (const w of words) {
    if (EN_FOOD_FILLER.includes(w)) { changed = true; continue; }
    if (FOOD_EN2DE[w]) { out.push(FOOD_EN2DE[w]); changed = true; }
    else out.push(w);
  }
  if (!changed || !out.length) return _capFirst(raw);
  return out.map(_capFirst).join(' ');
}

/* Adjektive, die für die Zutaten-Identität egal sind.
   Farben gehören NICHT dazu – rote und weiße Zwiebeln sollen
   getrennt bleiben (siehe COLOR_WORD). */
const FOOD_ADJ = ['frische', 'frischer', 'frisches', 'gefrorene', 'gefrorener',
  'getrocknete', 'gemahlene', 'geriebene', 'große', 'großer', 'kleine', 'kleiner',
  'bunte', 'reife', 'ganze', 'halbe', 'passierte', 'passierter'];
/* Modifizierer-Wörter: machen aus der Zutat ein anderes Produkt */
const FOOD_MOD_WORDS = ['dose', 'dosen', 'konserve', 'tk', 'pulver', 'powder', 'gefroren', 'tiefkühl'];
/* Farbwörter (DE + EN) – fließen in den Schlüssel ein, damit
   z. B. rote und weiße Zwiebeln getrennte Posten bleiben. */
const COLOR_WORD = {
  rot: 'rot', rote: 'rot', roter: 'rot', rotes: 'rot', red: 'rot',
  'weiß': 'weiss', 'weiße': 'weiss', weiss: 'weiss', weisse: 'weiss', white: 'weiss',
  'grün': 'gruen', 'grüne': 'gruen', 'grüner': 'gruen', green: 'gruen',
  gelb: 'gelb', gelbe: 'gelb', yellow: 'gelb',
  schwarz: 'schwarz', schwarze: 'schwarz', black: 'schwarz',
  braun: 'braun', braune: 'braun', brown: 'braun',
};
/* Unregelmäßige Mehrzahl -> Einzahl */
const FOOD_CANON = { eier: 'ei', äpfel: 'apfel', nüsse: 'nuss', würste: 'wurst' };

/* Kanonischer Schlüssel: führt Schreibvarianten desselben
   Lebensmittels zusammen (Zwiebel / Zwiebeln -> gleicher
   Schlüssel), hält aber Farbe sowie Dose/TK/Pulver getrennt. */
function foodKey(name) {
  const de = translateFoodName(name).toLowerCase();
  let mod = '';
  if (/pulver|powder/.test(de)) mod += 'p';
  if (/dose|konserve/.test(de)) mod += 'd';
  if (/passiert/.test(de)) mod += 's';
  if (/\btk\b|gefror|tiefkühl/.test(de)) mod += 't';
  const cleaned = de.replace(/\([^)]*\)/g, ' ').replace(/[^a-zäöüß ]/g, ' ');
  const allWords = cleaned.split(/\s+/).filter(Boolean);
  let color = '';
  allWords.forEach((w) => { if (COLOR_WORD[w]) color = COLOR_WORD[w]; });
  let words = allWords.filter((w) => !COLOR_WORD[w] && FOOD_ADJ.indexOf(w) < 0 && FOOD_MOD_WORDS.indexOf(w) < 0);
  if (!words.length) words = allWords.filter((w) => !COLOR_WORD[w]);
  if (!words.length) words = allWords;
  if (!words.length) return mod || 'x';
  let main = words[words.length - 1];               // im Deutschen ist das letzte Wort die Hauptzutat
  if (FOOD_CANON[main]) main = FOOD_CANON[main];
  else if (main.length >= 5 && /[ns]$/.test(main)) main = main.slice(0, -1);
  return main + (color ? '#' + color : '') + (mod ? '#' + mod : '');
}

/* Führt mehrere Mengenangaben zusammen. Pro Einheits-Gruppe wird addiert;
   verschiedene Einheiten bleiben nebeneinander stehen ("2 kg + 12 Stück").
   kg/g und l/ml werden automatisch in eine Einheit umgerechnet. */
const _UNIT_NORM = { dosen: 'dose', stücke: 'stück', stücken: 'stück', scheiben: 'scheibe', zehen: 'zehe', tassen: 'tasse' };
function _normUnit(u) { const l = (u || '').toLowerCase().trim(); return _UNIT_NORM[l] || l; }

// Stück-Synonyme werden alle als 'stück' gefuehrt, damit auch
// "2 Zwiebeln" + "1 Stück" + "3" zu "6 Stück" wird.
const _PIECE_UNITS = new Set(['', 'stück', 'stk', 'stk.', 'pcs']);

// Mass-Konvertierungen: alles in Basis-Einheit speichern, am Ende
// hochrechnen wenn sinnvoll.
const _MASS_CONV = {
  g:   { base: 'g',  factor: 1    },
  gr:  { base: 'g',  factor: 1    },
  kg:  { base: 'g',  factor: 1000 },
  ml:  { base: 'ml', factor: 1    },
  cl:  { base: 'ml', factor: 10   },
  dl:  { base: 'ml', factor: 100  },
  l:   { base: 'ml', factor: 1000 },
};

function _formatMass(totalBase, baseUnit) {
  // > 1000 → in kg/l, sonst in g/ml
  if (totalBase >= 1000) {
    const big = totalBase / 1000;
    const rounded = big >= 10 ? Math.round(big) : Math.round(big * 10) / 10;
    return rounded + ' ' + (baseUnit === 'g' ? 'kg' : 'l');
  }
  const rounded = totalBase >= 50 ? Math.round(totalBase / 5) * 5 : Math.max(1, Math.round(totalBase));
  return rounded + ' ' + baseUnit;
}

function mergeAmounts(a1, a2) {
  a1 = String(a1 || '').trim();
  a2 = String(a2 || '').trim();
  if (!a1) return a2;
  if (!a2) return a1;
  const parts = [...a1.split('+'), ...a2.split('+')].map((s) => s.trim()).filter(Boolean);

  // Gruppen sammeln: { groupKey -> { total, displayUnit, isMass?, baseUnit? } }
  // Reihenfolge der Gruppen bewahren wir mit einem Array
  const order = [];
  const groups = {};
  const addGroup = (key, init) => { if (!groups[key]) { groups[key] = init; order.push(key); } };

  for (const part of parts) {
    const m = part.match(/^([\d.,]+)\s*(.*)$/);
    if (!m) {
      // Nicht parsebar — als eigene "raw"-Gruppe einreihen, einmalig
      addGroup('__raw__' + part, { total: 0, displayUnit: part, raw: true });
      continue;
    }
    const u = (m[2] || '').trim();
    const uN = _normUnit(u);
    const val = parseFloat(m[1].replace(',', '.'));
    if (!isFinite(val)) { addGroup('__raw__' + part, { total: 0, displayUnit: part, raw: true }); continue; }

    if (_PIECE_UNITS.has(uN)) {
      addGroup('piece', { total: 0, displayUnit: 'Stück' });
      groups.piece.total += val;
      continue;
    }
    const conv = _MASS_CONV[uN];
    if (conv) {
      const k = 'mass_' + conv.base;
      addGroup(k, { total: 0, isMass: true, baseUnit: conv.base });
      groups[k].total += val * conv.factor;
      continue;
    }
    // Andere Einheiten (EL, TL, Bund, Prise…): pro Einheit eine Gruppe
    addGroup('unit_' + uN, { total: 0, displayUnit: u || uN });
    groups['unit_' + uN].total += val;
  }

  // Ausgabe rendern
  const out = order.map((k) => {
    const g = groups[k];
    if (g.raw) return g.displayUnit;
    if (g.isMass) return _formatMass(g.total, g.baseUnit);
    const rounded = Math.round(g.total * 100) / 100;
    return rounded + (g.displayUnit ? ' ' + g.displayUnit : '');
  });
  return out.join(' + ');
}

function lookupFoodPrice(name) {
  const n = (name || '').toLowerCase();
  for (const [kw, price] of FOOD_PRICES) {
    if (n.includes(kw)) return price;
  }
  return 1.5; // Standard-Schätzung für Unbekanntes
}

/* Liefert einen geschätzten Preis-String in der Währung des Ladens */
function estimatePrice(name, store) {
  const base = lookupFoodPrice(name); // EUR
  const info = store === 'home' ? homeInfo() : compInfo();
  const rate = CURRENCY_RATE[info.currency] || 1;
  const val = Math.round(base * rate * 100) / 100;
  return '~' + fmtMoney(val, info.symbol);
}

/* ---------- Rendering ---------- */
function renderGroceries() {
  if (!hasComparison() && (curGroceryFilter === 'home' || curGroceryFilter === 'comp')) curGroceryFilter = 'all';
  const el = document.getElementById('page-groceries');
  const h = homeInfo(), c = compInfo();

  const tab = (id, label) => `<div class="tab ${curGroceryFilter === id ? 'active' : ''}" onclick="switchGroceryTab('${id}')">${label}</div>`;
  const tabs = hasComparison()
    ? tab('all', 'Alle') + tab('home', `${h.flag} ${esc(h.name)}`) + tab('comp', `${c.flag} ${esc(c.name)}`)
      + tab('shop', '📅 Einkaufstag') + tab('cat', 'Kategorien')
    : tab('all', 'Alle') + tab('shop', '📅 Einkaufstag') + tab('cat', 'Kategorien');

  el.innerHTML = `
    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
      <div class="tabs" id="grocery-tabs">${tabs}</div>
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-sm" onclick="estimateAllPrices()">💡 Preise schätzen</button>
        <button class="btn btn-sm" onclick="exportGroceries()">📋 Export</button>
        <button class="btn btn-sm" onclick="clearCheckedGroceries()">✓ Erledigte entfernen</button>
        <button class="btn btn-sm btn-primary" onclick="openAddGroceryModal()">+ Hinzufügen</button>
      </div>
    </div>
    <div class="card mb-2"><div id="grocery-list"></div></div>
    <div class="card">
      <div class="card-header"><div class="card-title">💰 Preisvergleich${hasComparison() ? ` ${h.flag} ↔ ${c.flag}` : ''}</div>
        <span class="badge ${DB.priceData ? 'badge-green' : 'badge-amber'}">${DB.priceData ? '✓ Live-Preise' : 'Schätzpreise'}</span></div>
      <div id="price-compare"></div>
    </div>`;
  renderGroceryList();
  renderPriceCompare();
}

function sectionHead(kind, text) {
  const style = kind === 'big'
    ? 'background:var(--amber-light);color:var(--amber)'
    : 'background:var(--accent-light);color:var(--accent2)';
  return `<div style="padding:9px 12px;${style};font-size:12px;font-weight:600">${text}</div>`;
}

function emptyLine(txt) {
  return `<div class="text-muted text-sm" style="padding:9px 12px">${esc(txt)}</div>`;
}

function renderGroceryList() {
  const gl = document.getElementById('grocery-list');
  const all = DB.groceries.slice();
  if (!all.length) {
    gl.innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>Keine Artikel. Mit „+ Hinzufügen" startest du.</p></div>';
    return;
  }

  let html = '';
  let totalsItems = all;

  if (curGroceryFilter === 'shop') {
    const iv = DB.settings.shopInterval || 14;
    if (iv <= 7) {
      html += sectionHead('big', '🛒 Wöchentlicher Einkauf · alle Artikel');
      html += all.map(groceryRow).join('');
      html += `<div style="padding:6px 12px;font-size:11px;color:var(--text3)">Bei wöchentlichem Rhythmus kaufst du jede Woche alles frisch ein.</div>`;
    } else {
      const perish = all.filter((i) => isPerishable(i.n));
      html += sectionHead('big', '🛒 Großeinkauf · um Tag 1 · alles für die nächsten 2 Wochen');
      html += all.map(groceryRow).join('');
      if (perish.length) {
        html += sectionHead('small', '🥬 Kleineinkauf · um Tag 8 · frische Sachen nachkaufen');
        html += `<div style="padding:6px 12px;font-size:11px;color:var(--text3)">Diese Artikel halten keine 2 Wochen – am Tag 8 frisch nachkaufen (zusätzlich, nicht statt Tag 1):</div>`;
        html += perish.map(groceryRow).join('');
      } else {
        html += sectionHead('small', '🥬 Kleineinkauf · nicht nötig');
        html += emptyLine('Alle Zutaten auf der Liste halten 2 Wochen – ein Nachkauf ist nicht nötig.');
      }
    }
  } else if (curGroceryFilter === 'cat') {
    const cats = {};
    all.forEach((i) => { (cats[i.cat] = cats[i.cat] || []).push(i); });
    html += Object.keys(cats).sort().map((cat) =>
      `<div style="padding:8px 12px;background:var(--surface2);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3)">${esc(cat)}</div>
       ${cats[cat].map(groceryRow).join('')}`).join('');
  } else {
    let items = all;
    if (curGroceryFilter === 'home') items = items.filter((i) => i.store === 'home');
    else if (curGroceryFilter === 'comp') items = items.filter((i) => i.store === 'comp');
    if (!items.length) { gl.innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>Keine Artikel in diesem Reiter.</p></div>'; return; }
    html += items.map(groceryRow).join('');
    totalsItems = items;
  }
  html += groceryTotalsHtml(totalsItems);
  gl.innerHTML = html;
}

function groceryRow(item) {
  const info = storeInfo(item.store);
  const badge = hasComparison()
    ? `<span class="store-${item.store}" onclick="toggleGroceryStore('${item.id}')" style="cursor:pointer"
        title="Laden wechseln">${info.flag} ${esc(info.name)}</span>`
    : '';
  return `<div class="grocery-row">
    <div class="gcheck${item.checked ? ' on' : ''}" onclick="toggleGrocery('${item.id}')" title="Abhaken → in den Vorrat"></div>
    <div class="gname${item.checked ? ' crossed' : ''}">${esc(item.n)}</div>
    <div class="gamount">${esc(item.a || '')}</div>
    <div class="gprice" onclick="editGroceryPrice('${item.id}')" style="cursor:pointer"
      title="Preis eintragen oder ändern">${esc(item.price || '–')}</div>
    ${badge}
    <button class="btn btn-icon btn-danger btn-sm" onclick="removeGrocery('${item.id}')">✕</button>
  </div>`;
}

/* Gesamtbetrag – getrennt je Währung, plus Anzahl Artikel ohne Preis */
function groceryTotalsHtml(items) {
  let homeSum = 0, compSum = 0, noPrice = 0;
  items.forEach((i) => {
    const p = parsePrice(i.price);
    if (p == null) { noPrice++; return; }
    if (i.store === 'comp' && hasComparison()) compSum += p; else homeSum += p;
  });
  const h = homeInfo(), c = compInfo();
  const parts = [];
  if (hasComparison() && compSum > 0) parts.push(`🛒 Großeinkauf: <strong>${fmtMoney(compSum, c.symbol)}</strong>`);
  if (homeSum > 0) parts.push(`${hasComparison() ? '🥬 Kleineinkauf' : '🛒 Einkauf'}: <strong>${fmtMoney(homeSum, h.symbol)}</strong>`);
  if (!parts.length) parts.push('<span class="text-muted">Noch keine Preise – „💡 Preise schätzen" drücken.</span>');
  let txt = parts.join(' &nbsp;·&nbsp; ');
  if (noPrice > 0) txt += ` &nbsp;·&nbsp; <span style="color:var(--text3)">${noPrice} ohne Preis</span>`;
  return `<div style="padding:11px 12px;border-top:2px solid var(--border2);font-size:13px">${txt}
    <span style="font-size:11px;color:var(--text3)"> · Beträge sind Schätzungen</span></div>`;
}

function switchGroceryTab(f) { curGroceryFilter = f; renderGroceries(); }

/* ---------- Preise ---------- */
async function editGroceryPrice(id) {
  const it = DB.groceries.find((i) => i.id === id);
  if (!it) return;
  const cur = it.price && it.price !== '–' ? it.price : '';
  const v = prompt(`Preis für „${it.n}" eingeben (z. B. 1.49):`, cur);
  if (v === null) return;
  it.price = v.trim() || '–';
  await Data.persist('groceries');
  renderGroceryList();
}

async function estimateAllPrices() {
  let n = 0;
  DB.groceries.forEach((g) => {
    if (!g.price || g.price === '–') { g.price = estimatePrice(g.n, g.store); n++; }
  });
  if (n) { await Data.persist('groceries'); renderGroceries(); toast(`${n} Preis(e) automatisch geschätzt.`); }
  else toast('Alle Artikel haben bereits einen Preis.');
}

/* ---------- Abhaken → automatisch in den Vorrat ---------- */
async function toggleGrocery(id) {
  const it = DB.groceries.find((i) => i.id === id);
  if (!it) return;
  it.checked = !it.checked;

  if (it.checked) {
    if (!DB.pantry.some((p) => p.fromGrocery === id)) {
      // Dialog: tatsächlich gekaufte Menge erfragen
      _confirmGroceryPurchase(it, id);
      return; // wird async nach Dialog-Bestätigung weitergemacht
    }
  } else {
    const before = DB.pantry.length;
    DB.pantry = DB.pantry.filter((p) => p.fromGrocery !== id);
    if (DB.pantry.length !== before) await Data.persist('pantry');
  }
  await Data.persist('groceries');
  renderGroceryList();
}

function _confirmGroceryPurchase(it, id) {
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" style="max-width:380px">
      <div class="modal-head">
        <div class="modal-title">Eingekauft: ${esc(it.n)}</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <p class="text-sm text-muted mb-2">Wie viel hast du tatsächlich gekauft? (Einkaufsliste: ${esc(it.a || '–')})</p>
        <div class="form-row">
          <label>Eingekaufte Menge</label>
          <input id="bought-amt" type="text" value="${esc(it.a || '')}"
            placeholder="z. B. 300 ml oder 2 Stück"
            onkeydown="if(event.key==='Enter')_savePurchase('${id}')">
        </div>
        <div class="flex gap-2 mt-2">
          <button class="btn btn-primary" onclick="_savePurchase('${id}')">In Vorrat übernehmen</button>
          <button class="btn" onclick="closeModal()">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>`);
  setTimeout(() => { const el = document.getElementById('bought-amt'); if (el) { el.focus(); el.select(); } }, 80);
}

async function _savePurchase(id) {
  const it = DB.groceries.find((i) => i.id === id);
  const amtEl = document.getElementById('bought-amt');
  if (!it || !amtEl) { closeModal(); return; }
  const boughtAmt = amtEl.value.trim() || it.a || '';
  closeModal();
  const sl = guessShelfLife(it.n);
  DB.pantry.push({
    id: uid(), n: it.n, a: boughtAmt, cat: pantryCatFor(it.cat),
    expiry: sl.expiry, s: sl.s, added: todayISO(), fromGrocery: id,
  });
  await Data.persist('pantry');
  await Data.persist('groceries');
  toast(`„${it.n}" (${boughtAmt}) in den Vorrat übernommen.`);
  renderGroceryList();
}

async function toggleGroceryStore(id) {
  const it = DB.groceries.find((i) => i.id === id);
  if (!it) return;
  it.store = it.store === 'home' ? 'comp' : 'home';
  await Data.persist('groceries');
  renderGroceries();
}

async function removeGrocery(id) {
  DB.groceries = DB.groceries.filter((i) => i.id !== id);
  await Data.persist('groceries');
  renderGroceries();
}

async function clearCheckedGroceries() {
  const checked = DB.groceries.filter((i) => i.checked).length;
  if (!checked) { toast('Keine erledigten Artikel.'); return; }
  if (!confirm(`${checked} erledigte(n) Artikel von der Liste entfernen? (Bleiben im Vorrat.)`)) return;
  DB.groceries = DB.groceries.filter((i) => !i.checked);
  await Data.persist('groceries');
  renderGroceries();
}

/* ---------- Artikel hinzufügen ---------- */
function openAddGroceryModal() {
  const h = homeInfo(), c = compInfo();
  const storeField = hasComparison()
    ? `<div class="form-row"><label>Laden</label>
        <select id="g-store">
          <option value="comp">${c.flag} ${esc(c.name)} (Großeinkauf)</option>
          <option value="home">${h.flag} ${esc(h.name)} (Kleineinkauf)</option>
        </select></div>`
    : '<input type="hidden" id="g-store" value="home">';
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" style="max-width:440px">
      <div class="modal-head"><div class="modal-title">Artikel hinzufügen</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <p class="text-sm text-muted mb-2">Es reicht der Name – Kategorie, Laden und ein geschätzter Preis kommen automatisch.</p>
        <div class="form-row"><label>Lebensmittel</label>
          <input id="g-name" type="text" placeholder="z. B. Haferflocken" oninput="previewGroceryGuess()"></div>
        <div class="form-row"><label>Menge (optional)</label>
          <input id="g-amount" type="text" placeholder="z. B. 1 kg"></div>
        <div id="g-guess" class="alert alert-blue" style="margin-bottom:12px">Tippe einen Namen ein…</div>
        <div class="form-grid">
          ${storeField}
          <div class="form-row"><label>Preis (leer = geschätzt)</label>
            <input id="g-price" type="text" placeholder="automatisch"></div>
        </div>
        <div class="flex gap-2 mt-1">
          <button class="btn btn-primary btn-sm" onclick="saveGroceryItem()">Hinzufügen</button>
          <button class="btn btn-sm" onclick="closeModal()">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>`);
}

function previewGroceryGuess() {
  const name = document.getElementById('g-name').value.trim();
  const box = document.getElementById('g-guess');
  if (!name) { box.textContent = 'Tippe einen Namen ein…'; return; }
  const cat = guessCategory(name);
  const store = guessStore(name);
  const storeSel = document.getElementById('g-store');
  if (storeSel) storeSel.value = store;
  const info = storeInfo(store);
  box.innerHTML = `Vorschlag: <strong>${esc(cat)}</strong>${hasComparison() ? ` · Laden <strong>${info.flag} ${esc(info.name)}</strong>` : ''} · Preis <strong>${esc(estimatePrice(name, store))}</strong>`;
}

async function saveGroceryItem() {
  const n = translateFoodName(document.getElementById('g-name').value.trim());
  if (!n) { toast('Bitte einen Namen eingeben.'); return; }
  const amount = document.getElementById('g-amount').value.trim();
  const existing = DB.groceries.find((g) => foodKey(g.n) === foodKey(n));
  if (existing) {
    existing.a = mergeAmounts(existing.a, amount);
    await Data.persist('groceries');
    closeModal();
    renderGroceries();
    toast(`„${n}" mit vorhandenem Posten zusammengefasst.`);
    return;
  }
  const store = document.getElementById('g-store').value || 'home';
  const typed = document.getElementById('g-price').value.trim();
  DB.groceries.push({
    id: uid(), n, a: amount,
    cat: guessCategory(n),
    store,
    price: typed || estimatePrice(n, store),
    checked: false,
  });
  await Data.persist('groceries');
  closeModal();
  renderGroceries();
  toast('Artikel hinzugefügt.');
}

/* ---------- Preisvergleich ---------- */
function renderPriceCompare() {
  const el = document.getElementById('price-compare');
  const h = homeInfo(), c = compInfo();

  if (!hasComparison()) {
    el.innerHTML = `<div class="alert alert-blue">Kein Vergleichsort gesetzt – es zählen nur die Preise an deinem Wohnort (${h.flag} ${esc(h.name)}).
      Einen Vergleichsort kannst du in den <a onclick="navigate('settings')" style="color:var(--accent);cursor:pointer;font-weight:600">Einstellungen</a> hinzufügen.</div>`;
    return;
  }

  if (DB.priceData && DB.priceData.items) {
    let rows = '';
    Object.entries(DB.priceData.items).forEach(([q, d]) => {
      if (!d.best_de && !d.best_ch) return;
      const de = d.best_de ? `${d.best_de.price} (${d.best_de.store})` : '–';
      const ch = d.best_ch ? `${d.best_ch.price} (${d.best_ch.store})` : '–';
      const sav = d.savings_pct
        ? `<span class="badge ${d.cheaper_in_de ? 'badge-green' : 'badge-amber'}">${d.savings_pct}% günstiger</span>` : '';
      rows += `<tr><td>${esc(q)}</td><td>${esc(c.flag)} ${esc(de)}</td><td>${esc(h.flag)} ${esc(ch)}</td><td>${sav}</td></tr>`;
    });
    el.innerHTML = `<div style="overflow-x:auto"><table>
      <thead><tr><th>Produkt</th><th>${c.flag} ${esc(c.name)}</th><th>${h.flag} ${esc(h.name)}</th><th>Empfehlung</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="alert alert-blue mt-1">Stand: ${DB.priceData.generated ? new Date(DB.priceData.generated).toLocaleDateString('de-CH') : 'unbekannt'}</div>`;
    return;
  }

  if (DB.settings.homeCC === 'ch' && DB.settings.compCC === 'de') {
    el.innerHTML = `<div style="overflow-x:auto"><table>
      <thead><tr><th>Produkt</th><th>🇩🇪 Schätzpreis</th><th>🇨🇭 Schätzpreis</th><th>DE günstiger</th></tr></thead>
      <tbody>
        <tr><td>Rote Linsen 500 g</td><td>~0,99 €</td><td>~CHF 2.20</td><td><span class="badge badge-green">~52 %</span></td></tr>
        <tr><td>Haferflocken 1 kg</td><td>~0,79 €</td><td>~CHF 2.10</td><td><span class="badge badge-green">~60 %</span></td></tr>
        <tr><td>Kichererbsen Dose</td><td>~0,49 €</td><td>~CHF 1.40</td><td><span class="badge badge-green">~64 %</span></td></tr>
        <tr><td>TK-Beeren 1 kg</td><td>~2,49 €</td><td>~CHF 5.50</td><td><span class="badge badge-green">~52 %</span></td></tr>
        <tr><td>Tofu 400 g</td><td>~1,79 €</td><td>~CHF 3.20</td><td><span class="badge badge-green">~41 %</span></td></tr>
        <tr><td>Skyr 500 g</td><td>~1,19 €</td><td>~CHF 3.20</td><td><span class="badge badge-green">~63 %</span></td></tr>
      </tbody></table></div>
      <div class="alert alert-amber mt-1">💡 Schätzpreise (Aldi/Lidl/Rewe vs. Migros/Coop). Die App schätzt Preise automatisch – mit „💡 Preise schätzen" füllst du fehlende Preise.</div>`;
    return;
  }

  el.innerHTML = `<div class="alert alert-amber">Für <strong>${h.flag} ${esc(h.name)} ↔ ${c.flag} ${esc(c.name)}</strong> gibt es keine fertige Schätztabelle.
    Mit „💡 Preise schätzen" füllt die App trotzdem grobe Preise – oder tippe sie in der Liste oben selbst ein.</div>`;
}

/* ---------- Export ---------- */
function exportGroceries() {
  const h = homeInfo(), c = compInfo();
  const fmt = (arr) => arr.map((i) => `☐ ${i.n}${i.a ? ' – ' + i.a : ''}${i.price && i.price !== '–' ? ' (' + i.price + ')' : ''}`).join('\n');
  const home = DB.groceries.filter((i) => i.store === 'home');
  const comp = DB.groceries.filter((i) => i.store === 'comp');
  let text = 'EINKAUFSLISTE – ESSENSPLANER\n\n';
  if (hasComparison()) {
    text += `EINKAUF IN ${c.name.toUpperCase()}:\n${fmt(comp) || '–'}\n\nEINKAUF IN ${h.name.toUpperCase()}:\n${fmt(home) || '–'}\n`;
  } else {
    text += `EINKAUF (${h.name}):\n${fmt(DB.groceries) || '–'}\n`;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = 'einkaufsliste.txt';
  a.click();
  toast('Einkaufsliste exportiert.');
}
