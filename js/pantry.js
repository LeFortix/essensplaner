/* ============================================================
   ESSENSPLANER – Vorrat
   - Hinzufügen mit Autocomplete + automatischer Haltbarkeit.
   - Status (frisch/bald/abgelaufen) wird aus dem Datum berechnet.
   - Rezept "gekocht" -> Zutaten werden aus dem Vorrat entfernt.
   ============================================================ */

/* Häufige Lebensmittel für die Autovervollständigung */
const COMMON_FOODS = [
  'Rote Linsen', 'Grüne Linsen', 'Kichererbsen (Dose)', 'Schwarze Bohnen (Dose)', 'Kidneybohnen',
  'Basmati Reis', 'Vollkornreis', 'Haferflocken', 'Vollkornnudeln', 'Erbsen-Linsen-Nudeln',
  'Couscous', 'Bulgur', 'Quinoa', 'Mehl', 'Tomaten (Dose)', 'Passierte Tomaten', 'Kokosmilch',
  'Mais (Dose)', 'Tofu (fest)', 'Räuchertofu', 'Tempeh', 'Eier', 'Magerquark', 'Skyr',
  'Naturjoghurt', 'Griechischer Joghurt', 'Milch', 'Gouda', 'Mozzarella', 'Parmesan', 'Butter',
  'Brokkoli', 'Blumenkohl', 'Paprika', 'Zucchini', 'Karotten', 'Kartoffeln', 'Süßkartoffeln',
  'Zwiebeln', 'Knoblauch', 'Ingwer', 'Spinat (TK)', 'Erbsen (TK)', 'Tomaten', 'Gurke', 'Salat',
  'Champignons', 'Lauch', 'Banane', 'Apfel', 'Zitrone', 'Limette', 'Avocado', 'Gefrorene Beeren',
  'Erdnussmus', 'Tahini', 'Sojasauce', 'Olivenöl', 'Rapsöl', 'Sesamöl', 'Gemüsebrühe',
  'Walnüsse', 'Mandeln', 'Cashews', 'Leinsamen', 'Chiasamen', 'Proteinpulver', 'Honig',
];

/* Geschätzte Haltbarkeit nach Lebensmitteltyp (in Tagen) */
const SHELF_TIERS = [
  { days: 3,   words: ['salat', 'kräuter', 'beere', 'beeren', 'pilz', 'champignon', 'rucola', 'spinat frisch'] },
  { days: 7,   words: ['brokkoli', 'blumenkohl', 'paprika', 'gurke', 'tomate', 'milch', 'joghurt', 'skyr', 'quark', 'tofu', 'banane', 'zucchini', 'lauch', 'tempeh'] },
  { days: 21,  words: ['ei', 'eier', 'käse', 'gouda', 'mozzarella', 'parmesan', 'butter', 'karotte', 'apfel', 'kohl', 'sahne', 'zitrone', 'limette'] },
  { days: 75,  words: ['kartoffel', 'süßkartoffel', 'zwiebel', 'knoblauch', 'ingwer'] },
  { days: 365, words: ['tk', 'gefroren', 'tiefkühl', 'beeren (tk)', 'erbsen (tk)', 'spinat (tk)'] },
  { days: 540, words: ['reis', 'nudel', 'nudeln', 'pasta', 'linse', 'linsen', 'kichererbse', 'bohne', 'bohnen', 'haferflocken', 'mehl', 'dose', 'konserve', 'öl', 'zucker', 'salz', 'gewürz', 'mus', 'sauce', 'kokosmilch', 'brühe', 'tahini', 'nüsse', 'mandeln', 'samen', 'honig', 'couscous', 'bulgur', 'quinoa', 'pulver'] },
];

function shelfDays(name) {
  const n = (name || '').toLowerCase();
  for (const t of SHELF_TIERS) { if (t.words.some((w) => n.includes(w))) return t.days; }
  return 14;
}

/* true, wenn ein Lebensmittel keine 2 Wochen hält -> muss nachgekauft werden */
function isPerishable(name) {
  return shelfDays(name) < 14;
}

function pantryStatusFromExpiry(expiry, fallback) {
  if (!expiry) return fallback || 'fresh';
  const days = Math.round((new Date(expiry) - new Date(todayISO())) / 86400000);
  if (days < 0) return 'old';
  if (days <= 3) return 'soon';
  return 'fresh';
}

function pantryExpiryText(item) {
  if (!item.expiry) return item.e || 'unbekannt';
  const days = Math.round((new Date(item.expiry) - new Date(todayISO())) / 86400000);
  if (days < 0) return `abgelaufen vor ${-days} Tag(en)`;
  if (days === 0) return 'läuft heute ab';
  if (days <= 14) return `noch ${days} Tage`;
  if (days <= 70) return `noch ~${Math.round(days / 7)} Wochen`;
  return `noch ~${Math.round(days / 30)} Monate`;
}

/* von groceries.js verwendet: liefert komplett berechnete Haltbarkeit */
function guessShelfLife(name) {
  const days = shelfDays(name);
  const expiry = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const tmp = { expiry };
  return { days, expiry, s: pantryStatusFromExpiry(expiry), e: pantryExpiryText(tmp) };
}

/* ---------- Rendering ---------- */
function renderPantry() {
  // Status frisch halten
  DB.pantry.forEach((p) => { p.s = pantryStatusFromExpiry(p.expiry, p.s); });

  const el = document.getElementById('page-pantry');
  el.innerHTML = `
    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
      <div class="text-sm text-muted">🟢 Frisch &nbsp; 🟡 Bald ablaufend &nbsp; 🔴 Abgelaufen</div>
      <button class="btn btn-sm btn-primary" onclick="openAddPantryModal()">+ Vorrat</button>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title mb-2">🧊 Kühlschrank / Frisch</div><div id="pantry-fresh"></div></div>
      <div class="card"><div class="card-title mb-2">📦 Vorratskammer</div><div id="pantry-dry"></div></div>
    </div>`;

  const order = { old: 0, soon: 1, fresh: 2 };
  ['fresh', 'dry'].forEach((cat) => {
    const items = DB.pantry.filter((p) => p.cat === cat)
      .sort((a, b) => (order[a.s] ?? 3) - (order[b.s] ?? 3));
    const box = document.getElementById('pantry-' + cat);
    box.innerHTML = items.length ? items.map((p) => `
      <div class="pantry-row">
        <div class="pdot ${p.s}"></div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${esc(p.n)}</div>
          <div style="font-size:11px;color:${p.s === 'old' ? 'var(--red)' : p.s === 'soon' ? 'var(--amber)' : 'var(--text3)'}">${esc(pantryExpiryText(p))}</div>
        </div>
        <div style="font-size:12px;color:var(--text2)">${esc(p.a || '')}</div>
        <button class="btn btn-icon btn-danger btn-sm" onclick="removePantry('${p.id}')">✕</button>
      </div>`).join('')
      : '<p class="text-muted text-sm" style="padding:8px 12px">Noch nichts eingetragen.</p>';
  });
}

async function removePantry(id) {
  DB.pantry = DB.pantry.filter((p) => p.id !== id);
  await Data.persist('pantry');
  renderPantry();
}

/* ---------- Hinzufügen mit Autocomplete ---------- */
function openAddPantryModal() {
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" style="max-width:440px">
      <div class="modal-head"><div class="modal-title">Vorrat hinzufügen</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Lebensmittel</label>
          <div class="autocomplete">
            <input id="p-name" type="text" placeholder="z. B. Rote Linsen" autocomplete="off"
                   oninput="pantryAutocomplete(this.value)" onfocus="pantryAutocomplete(this.value)">
            <div id="p-ac" class="ac-list hidden"></div>
          </div>
        </div>
        <div id="p-guess" class="alert alert-blue" style="margin-bottom:12px">Die Haltbarkeit wird automatisch geschätzt.</div>
        <div class="form-grid">
          <div class="form-row"><label>Menge</label><input id="p-amount" type="text" placeholder="z. B. 500 g"></div>
          <div class="form-row"><label>Lagerung</label>
            <select id="p-cat"><option value="fresh">Kühlschrank / Frisch</option><option value="dry">Vorratskammer</option></select></div>
        </div>
        <div class="form-row"><label>Haltbar bis</label><input id="p-expiry" type="date"></div>
        <div class="flex gap-2 mt-1">
          <button class="btn btn-primary btn-sm" onclick="savePantryItem()">Hinzufügen</button>
          <button class="btn btn-sm" onclick="closeModal()">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>`);
  pantryApplyGuess('');
}

function pantryFoodPool() {
  const fromRecipes = [];
  DB.recipes.forEach((r) => (r.ingredients || []).forEach((i) => fromRecipes.push(i.n)));
  return Array.from(new Set([...COMMON_FOODS, ...fromRecipes]));
}

/* ---------- Tippfehler-tolerante Lebensmittelsuche ----------
   Wird vom Vorrat und vom Rezept-Dialog genutzt. Erkennt auch
   vertippte Eingaben (z. B. „eei" → „Eier", „brokoli" → „Brokkoli"). */
function _normFood(s) {
  return String(s || '').toLowerCase().replace(/[^a-zäöüß]/g, '');
}
function _collapseDup(s) {
  return s.replace(/(.)\1+/g, '$1');   // doppelte Buchstaben zusammenfassen
}
function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

function fuzzyFoodMatches(query, limit) {
  const q = _normFood(query);
  if (q.length < 2) return [];
  const qc = _collapseDup(q);
  const scored = [];
  pantryFoodPool().forEach((food) => {
    const f = _normFood(food);
    if (!f) return;
    const fc = _collapseDup(f);
    let score = -1;
    if (f.startsWith(q)) score = 100 - f.length;
    else if (f.includes(q)) score = 75 - f.length;
    else if (fc.startsWith(qc)) score = 60 - f.length;
    else if (fc.includes(qc)) score = 48 - f.length;
    else {
      const d = _levenshtein(qc, fc.slice(0, qc.length));
      if (d <= 1) score = 36 - f.length;
      else if (qc.length >= 5 && d <= 2) score = 22 - f.length;
    }
    if (score > -1) scored.push({ food, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit || 7).map((x) => x.food);
}

let _pantryAcMatches = [];
function pantryAutocomplete(q) {
  const box = document.getElementById('p-ac');
  if (!box) return;
  const query = (q || '').trim().toLowerCase();
  pantryApplyGuess(q);
  if (!query) { box.classList.add('hidden'); return; }
  _pantryAcMatches = fuzzyFoodMatches(query, 7);
  if (!_pantryAcMatches.length) { box.classList.add('hidden'); return; }
  box.innerHTML = _pantryAcMatches.map((f, i) =>
    `<div class="ac-item" onclick="pantryPickFood(${i})">
      <span>${esc(f)}</span><small>${esc(guessShelfLife(f).e)}</small></div>`).join('');
  box.classList.remove('hidden');
}

function pantryPickFood(i) {
  const name = _pantryAcMatches[i];
  if (name == null) return;
  document.getElementById('p-name').value = name;
  document.getElementById('p-ac').classList.add('hidden');
  pantryApplyGuess(name);
}

/* Kategorie + Haltbarkeitsdatum automatisch vorbelegen */
function pantryApplyGuess(name) {
  const sl = guessShelfLife(name);
  const expEl = document.getElementById('p-expiry');
  const catEl = document.getElementById('p-cat');
  const guessBox = document.getElementById('p-guess');
  if (expEl) expEl.value = sl.expiry;
  if (catEl) catEl.value = ['Gemüse', 'Obst', 'Milchprodukte', 'Proteinquellen', 'TK'].includes(guessCategory(name)) ? 'fresh' : 'dry';
  if (guessBox) {
    guessBox.innerHTML = name.trim()
      ? `Automatisch geschätzt: haltbar <strong>${sl.e}</strong>. Du kannst das Datum unten anpassen.`
      : 'Die Haltbarkeit wird automatisch geschätzt, sobald du tippst.';
  }
}

async function savePantryItem() {
  const n = document.getElementById('p-name').value.trim();
  if (!n) { toast('Bitte einen Namen eingeben.'); return; }
  const expiry = document.getElementById('p-expiry').value || guessShelfLife(n).expiry;
  DB.pantry.push({
    id: uid(), n,
    a: document.getElementById('p-amount').value.trim(),
    cat: document.getElementById('p-cat').value,
    expiry,
    s: pantryStatusFromExpiry(expiry),
    added: todayISO(),
  });
  await Data.persist('pantry');
  closeModal();
  renderPantry();
  toast('Vorrat hinzugefügt.');
}

/* ---------- Rezept gekocht -> Zutaten aus Vorrat entfernen ---------- */
function foodMatches(a, b) {
  a = (a || '').toLowerCase().trim();
  b = (b || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  return a.split(/[ (]/)[0] === b.split(/[ (]/)[0];
}

function _parseAmt(str) {
  const m = String(str || '').trim().match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  return { num: parseFloat(m[1].replace(',', '.')), unit: m[2].trim().toLowerCase() };
}
function _subtractAmt(pantryAmt, useAmt) {
  const p = _parseAmt(pantryAmt), u = _parseAmt(useAmt);
  if (!p || !u || p.unit !== u.unit) return null;
  const diff = Math.round((p.num - u.num) * 100) / 100;
  if (diff <= 0) return null;
  return diff + (p.unit ? ' ' + p.unit : '');
}

async function markRecipeCooked(rid) {
  const r = DB.recipes.find((x) => x.id === rid);
  if (!r) return;
  const removed = [], reduced = [];
  (r.ingredients || []).forEach((ing) => {
    const idx = DB.pantry.findIndex((p) => foodMatches(p.n, ing.n));
    if (idx < 0) return;
    const item = DB.pantry[idx];
    const rest = _subtractAmt(item.a, ing.a);
    if (rest !== null) {
      item.a = rest;
      reduced.push(`${item.n} (noch ${rest})`);
    } else {
      removed.push(item.n);
      DB.pantry.splice(idx, 1);
    }
  });
  closeModal();
  if (removed.length || reduced.length) {
    await Data.persist('pantry');
    if (curPage === 'pantry') renderPantry();
    if (curPage === 'dashboard') renderDashboard();
    const parts = [];
    if (removed.length) parts.push(`Entfernt: ${removed.join(', ')}`);
    if (reduced.length) parts.push(reduced.join(', '));
    toast('Gekocht! ' + parts.join(' · '));
  } else {
    toast('Als gekocht markiert – keine passenden Zutaten im Vorrat.');
  }
}
