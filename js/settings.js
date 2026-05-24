/* ============================================================
   ESSENSPLANER – Einstellungen, Budget & Fahrkostenrechner
   Alle Änderungen wirken sofort. Ziel- und Budget-Änderungen
   fragen, ob der Plan angepasst werden soll.
   ============================================================ */

const ALLERGY_OPTIONS = ['Gluten', 'Laktose', 'Nüsse', 'Erdnüsse', 'Soja', 'Eier', 'Sesam', 'Senf'];

/* Bekannte Grenz-Einkaufs-Konstellationen (Wohnland -> günstigere Nachbarn) */
const BORDER_DEALS = {
  ch: [
    { country: 'de', cities: [
      { name: 'Singen, Deutschland', lat: 47.76, lon: 8.84 },
      { name: 'Konstanz, Deutschland', lat: 47.66, lon: 9.18 },
      { name: 'Waldshut-Tiengen, Deutschland', lat: 47.62, lon: 8.21 },
      { name: 'Lörrach, Deutschland', lat: 47.62, lon: 7.66 },
      { name: 'Weil am Rhein, Deutschland', lat: 47.59, lon: 7.61 },
    ] },
    { country: 'at', cities: [{ name: 'Bregenz, Österreich', lat: 47.50, lon: 9.75 }] },
  ],
  de: [
    { country: 'cz', cities: [
      { name: 'Pilsen, Tschechien', lat: 49.74, lon: 13.37 },
      { name: 'Cheb, Tschechien', lat: 50.08, lon: 12.37 },
    ] },
    { country: 'pl', cities: [
      { name: 'Słubice, Polen', lat: 52.35, lon: 14.56 },
      { name: 'Szczecin, Polen', lat: 53.43, lon: 14.55 },
    ] },
  ],
  at: [
    { country: 'de', cities: [
      { name: 'Freilassing, Deutschland', lat: 47.84, lon: 12.98 },
      { name: 'Lindau, Deutschland', lat: 47.55, lon: 9.68 },
      { name: 'Passau, Deutschland', lat: 48.57, lon: 13.46 },
    ] },
  ],
  dk: [{ country: 'de', cities: [{ name: 'Flensburg, Deutschland', lat: 54.79, lon: 9.45 }] }],
  no: [{ country: 'se', cities: [{ name: 'Strömstad, Schweden', lat: 58.93, lon: 11.17 }] }],
};

function renderSettings() {
  const s = DB.settings;
  const h = homeInfo(), c = compInfo();
  const el = document.getElementById('page-settings');
  el.innerHTML = `
    <div class="grid-2" style="gap:18px;align-items:start">

      <div class="card">
        <div class="card-title mb-2">🎯 Profil & Ziele</div>
        <div class="form-row"><label>Ernährungsweise</label>
          <select onchange="saveSetting('diet',this.value)">
            <option value="vegetarian" ${s.diet === 'vegetarian' ? 'selected' : ''}>🥦 Vegetarisch</option>
            <option value="vegan" ${s.diet === 'vegan' ? 'selected' : ''}>🌱 Vegan</option>
            <option value="omnivore" ${s.diet === 'omnivore' ? 'selected' : ''}>🍽️ Omnivor (alles)</option>
          </select>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">Wirkt sofort auf die Online-Suche unter „Entdecken".</div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Protein-Ziel (g/Tag)</label>
            <input type="number" value="${s.proteinGoal}" onchange="onGoalChange('proteinGoal',+this.value)"></div>
          <div class="form-row"><label>Kalorien-Ziel (kcal/Tag)</label>
            <input type="number" value="${s.kcalGoal}" onchange="onGoalChange('kcalGoal',+this.value)"></div>
        </div>
        <button class="btn btn-sm w-full" onclick="openGoalCalculator()">🧮 Ziele aus Körperdaten berechnen</button>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">${s.goalSource === 'calculator'
          ? 'Deine Ziele wurden mit dem Bedarfsrechner ermittelt. Du kannst sie oben jederzeit von Hand überschreiben.'
          : 'Lass die App aus Gewicht, Größe, Alter, Aktivität und Ziel ein passendes Protein- und Kalorienziel berechnen.'}</div>
      </div>

      <div class="card">
        <div class="card-title mb-2">💸 Budget</div>
        <p class="text-sm text-muted mb-2">Was möchtest du fürs Essen ausgeben? Der Plan zeigt geschätzte Kosten und warnt bei Überschreitung.</p>
        <div class="form-grid">
          <div class="form-row"><label>Betrag (${esc(h.symbol || h.currency)})</label>
            <input type="number" min="0" step="5" value="${s.budgetAmount || 0}" onchange="onBudgetChange('budgetAmount',+this.value)"></div>
          <div class="form-row"><label>Zeitraum</label>
            <select onchange="onBudgetChange('budgetPeriod',this.value)">
              <option value="biweekly" ${s.budgetPeriod === 'biweekly' ? 'selected' : ''}>pro 2 Wochen</option>
              <option value="monthly" ${s.budgetPeriod === 'monthly' ? 'selected' : ''}>pro Monat</option>
            </select></div>
        </div>
        <div style="font-size:11px;color:var(--text3)">0 = kein Budget. Der Auto-Plan bevorzugt bei knappem Budget günstigere Gerichte.</div>
      </div>

      <div class="card">
        <div class="card-title mb-2">🏠 Wohnort & Einkauf</div>
        <div class="form-row"><label>Wohnort (Haupteinkauf)</label>
          <div class="autocomplete">
            <input id="set-city" type="text" value="${esc(s.city)}" autocomplete="off"
                   oninput="nominatimSuggest('set-city','ac-city')"
                   onchange="onLocationChange('home',this.value)">
            <div id="ac-city" class="ac-list hidden"></div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">Erkannt: ${h.flag} ${esc(h.name)} · Währung ${esc(h.currency || '–')}</div>
        </div>
        <div class="form-row"><label>Vergleichsort (optional)</label>
          <div class="autocomplete">
            <input id="set-decity" type="text" value="${esc(s.deCity)}" autocomplete="off"
                   placeholder="leer lassen = nur Wohnort"
                   oninput="nominatimSuggest('set-decity','ac-decity')"
                   onchange="onLocationChange('comp',this.value)">
            <div id="ac-decity" class="ac-list hidden"></div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">${hasComparison()
            ? `Erkannt: ${c.flag} ${esc(c.name)} · Währung ${esc(c.currency || '–')}`
            : 'Leer = die App rechnet nur mit Preisen an deinem Wohnort.'}</div>
        </div>
        <button class="btn btn-sm w-full" onclick="autoDetectComparison()">🔍 Vergleichsort automatisch finden</button>
        <div id="comp-detect-result" class="mt-1"></div>
        <div class="form-grid mt-1">
          <div class="form-row"><label>Einkaufs-Strategie</label>
            <select onchange="saveSetting('strategy',this.value)">
              <option value="mixed" ${s.strategy !== 'all-home' && s.strategy !== 'all-comp' ? 'selected' : ''}>Haltbares im Vergleichsort, Frisches am Wohnort</option>
              <option value="all-home" ${s.strategy === 'all-home' ? 'selected' : ''}>Alles am Wohnort</option>
              <option value="all-comp" ${s.strategy === 'all-comp' ? 'selected' : ''}>Alles im Vergleichsort</option>
            </select></div>
          <div class="form-row"><label>Max. Supermärkte / Einkauf</label>
            <input type="number" min="1" max="6" value="${s.maxStores}" onchange="saveSetting('maxStores',+this.value)"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-2">🍳 Mahlzeitenplan & Meal Prep</div>
        <div class="form-grid">
          <div class="form-row"><label>Koch-Tage pro Woche</label>
            <input type="number" min="1" max="7" value="${s.cookDays}" onchange="saveSetting('cookDays',+this.value)"></div>
          <div class="form-row"><label>Portionen pro Koch-Session</label>
            <input type="number" min="1" max="7" value="${s.portionsPerSession}" onchange="saveSetting('portionsPerSession',+this.value)"></div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Frühstück & Snack vorbereiten für (Tage)</label>
            <input type="number" min="1" max="7" value="${s.prepBatchDays}" onchange="saveSetting('prepBatchDays',+this.value)"></div>
          <div class="form-row"><label>Großeinkauf-Rhythmus</label>
            <select onchange="saveSetting('shopInterval',+this.value)">
              <option value="14" ${(s.shopInterval || 14) >= 14 ? 'selected' : ''}>alle 2 Wochen</option>
              <option value="7" ${(s.shopInterval || 14) < 14 ? 'selected' : ''}>jede Woche</option>
            </select></div>
        </div>
        <div class="form-row"><label>Max. Zubereitungszeit (Min)</label>
          <input type="number" value="${s.maxPrepTime}" onchange="saveSetting('maxPrepTime',+this.value)"></div>
      </div>

      <div class="card">
        <div class="card-title mb-2">🚫 Allergien & Unverträglichkeiten</div>
        <p class="text-sm text-muted mb-2">Werden bei der Online-Suche unter „Entdecken" vermieden.</p>
        <div class="ob-chips" id="set-allergies">
          ${ALLERGY_OPTIONS.map((a) => `<span class="ob-chip ${(s.allergies || []).includes(a) ? 'on' : ''}"
            onclick="toggleAllergy('${a}')">${a}</span>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-2">🔗 API & Daten</div>
        <div class="form-row"><label>Spoonacular API-Key (Rezepte, Bilder, Nährwerte)</label>
          <div class="flex gap-2">
            <input id="set-spoon" type="text" style="flex:1" placeholder="API-Key…" value="${esc(s.spoonacularKey || '')}">
            <button class="btn btn-sm btn-primary" onclick="testSpoonacular()">Verbinden</button>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">Kostenlos auf spoonacular.com/food-api</div>
        </div>
        <div class="alert alert-blue" style="font-size:12px;line-height:1.6">
          <div><strong>💰 Woher kommen die Preise?</strong></div>
          <div style="margin-top:5px"><strong>Der einfache Weg:</strong> Tippe die Preise direkt in der Einkaufsliste ein – dort einfach den Preis eines Artikels anklicken. Das genügt völlig, mehr brauchst du nicht.</div>
          <div style="margin-top:5px"><strong>Nur für Technik-Fans (optional):</strong> Im Projektordner liegt ein Python-Programm <em>preise_scraper.py</em>. Es sucht Preise automatisch im Internet und legt eine Datei <em>preise.json</em> an, die du unten hochladen kannst. Wenn dir das nichts sagt: einfach ignorieren – es ist nicht nötig.</div>
        </div>
        <div class="form-row"><label>preise.json hochladen (optional)</label>
          <input type="file" accept=".json" onchange="loadPriceFile(this)" style="font-size:12px">
        </div>
        <hr class="divider">
        <div class="form-row"><label>Datensicherung</label>
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-sm" onclick="exportJSON()">📦 Export</button>
            <button class="btn btn-sm" onclick="document.getElementById('imp-json').click()">📂 Import</button>
            <input type="file" id="imp-json" accept=".json" class="hidden" onchange="importJSON(this)">
            <button class="btn btn-sm btn-danger" onclick="resetSettings()">↺ Einstellungen zurücksetzen</button>
          </div>
        </div>
      </div>

      <div class="card" id="fuel-card">
        <div class="card-title mb-2">⛽ Fahrkostenrechner</div>
        <p class="text-sm text-muted mb-2">Lohnt sich die Fahrt zum Vergleichsort? Vergleicht die Ersparnis mit den Spritkosten.</p>
        <div class="form-row"><label>Einkaufsort</label>
          <div class="autocomplete">
            <input id="fuel-dest" type="text" value="${esc(s.deCity)}" autocomplete="off"
                   oninput="nominatimSuggest('fuel-dest','ac-fuel')">
            <div id="ac-fuel" class="ac-list hidden"></div>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Distanz (km, einfach)</label>
            <input id="fuel-dist" type="number" placeholder="auto" value="${s.lastDistance || ''}"></div>
          <div class="form-row"><label style="visibility:hidden">.</label>
            <button class="btn btn-sm w-full" onclick="calcDistance()">📍 Distanz automatisch</button></div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Spritpreis (€/L)</label>
            <input id="fuel-price" type="number" step="0.01" value="${s.fuelPrice}"></div>
          <div class="form-row"><label>Verbrauch (L/100km)</label>
            <input id="fuel-cons" type="number" step="0.1" value="${s.fuelConsumption}"></div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Geschätzte Ersparnis (€)</label>
            <input id="fuel-saving" type="number" step="0.5" value="${estimateCompSavings()}"></div>
          <div class="form-row"><label>Nur fahren ab Ersparnis (€)</label>
            <input id="fuel-min" type="number" step="1" value="${s.minSavingDE || 0}"></div>
        </div>
        <button class="btn btn-primary btn-full" onclick="calcFahrkosten()">Berechnen</button>
        <div id="fuel-result" class="mt-2"></div>
      </div>

    </div>`;
}

/* ---------- Einstellungen speichern (sofort wirksam) ---------- */
async function saveSetting(key, value) {
  DB.settings[key] = value;
  await Data.persistSettings();
}

async function onGoalChange(key, value) {
  DB.settings[key] = value;
  DB.settings.goalSource = 'manual';
  await Data.persistSettings();
  if (confirm('Ziel geändert. Soll der 14-Tage-Plan neu generiert werden, damit er dazu passt?')) {
    regeneratePlanForSettings('Plan an das neue Ziel angepasst.');
  }
}

/* ============================================================
   BEDARFSRECHNER – kcal- und Protein-Ziel aus Körperdaten
   Formel: Grundumsatz nach Mifflin-St-Jeor, multipliziert mit
   einem Aktivitätsfaktor (Beruf + Sport), dann an das Ziel
   (Abnehmen / Halten / Aufbau) angepasst.
   ============================================================ */
const JOB_PAL = { sitting: 1.25, standing: 1.45, physical: 1.65 };
const SPORT_PAL = { '0': 0, '1-2': 0.06, '3-4': 0.13, '5+': 0.22 };
const GOAL_KCAL = { lose: 0.80, maintain: 1.0, gain: 1.10 };
const GOAL_PROTEIN = { lose: 1.7, maintain: 1.4, gain: 1.6 };

function computeNutritionGoals(p) {
  if (!p || !p.sex || !p.age || !p.heightCm || !p.weightKg) return null;
  // Grundumsatz (BMR) – Mifflin-St-Jeor
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  // Aktivitätsfaktor (PAL): Beruf als Basis, Sport als Aufschlag
  const pal = Math.min(2.0, (JOB_PAL[p.jobActivity] || 1.25) + (SPORT_PAL[p.sportDays] || 0));
  const tdee = bmr * pal;                                  // Gesamtumsatz
  const kcal = Math.round(tdee * (GOAL_KCAL[p.bodyGoal] || 1) / 50) * 50;
  const protein = Math.round(p.weightKg * (GOAL_PROTEIN[p.bodyGoal] || 1.6) / 5) * 5;
  return { bmr: Math.round(bmr), pal: Math.round(pal * 100) / 100, tdee: Math.round(tdee), kcal, protein };
}

function openGoalCalculator() {
  const s = DB.settings;
  const sel = (val, cur) => val === cur ? 'selected' : '';
  modal(`<div class="modal-backdrop" onclick="closeModal(event)">
    <div class="modal" style="max-width:480px">
      <div class="modal-head"><div class="modal-title">🧮 Bedarf berechnen</div>
        <button class="btn btn-icon" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <p class="text-sm text-muted mb-2">Aus diesen Angaben berechnet die App ein passendes Kalorien- und Protein-Ziel (Formel nach Mifflin-St-Jeor).</p>
        <div class="form-grid">
          <div class="form-row"><label>Geschlecht</label>
            <select id="gc-sex">
              <option value="" ${sel('', s.sex)}>– bitte wählen –</option>
              <option value="female" ${sel('female', s.sex)}>weiblich</option>
              <option value="male" ${sel('male', s.sex)}>männlich</option>
            </select></div>
          <div class="form-row"><label>Alter (Jahre)</label>
            <input id="gc-age" type="number" min="14" max="100" value="${s.age || ''}" placeholder="z. B. 30"></div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Größe (cm)</label>
            <input id="gc-height" type="number" min="120" max="230" value="${s.heightCm || ''}" placeholder="z. B. 175"></div>
          <div class="form-row"><label>Gewicht (kg)</label>
            <input id="gc-weight" type="number" min="35" max="250" value="${s.weightKg || ''}" placeholder="z. B. 72"></div>
        </div>
        <div class="form-row"><label>Wie aktiv bist du im Alltag / Beruf?</label>
          <select id="gc-job">
            <option value="sitting" ${sel('sitting', s.jobActivity)}>Überwiegend sitzend (Büro, Homeoffice)</option>
            <option value="standing" ${sel('standing', s.jobActivity)}>Viel auf den Beinen (Verkauf, Lehre, Pflege leicht)</option>
            <option value="physical" ${sel('physical', s.jobActivity)}>Körperlich anstrengend (Bau, Handwerk, Pflege schwer)</option>
          </select></div>
        <div class="form-row"><label>Wie oft machst du Sport pro Woche?</label>
          <select id="gc-sport">
            <option value="0" ${sel('0', s.sportDays)}>Gar nicht</option>
            <option value="1-2" ${sel('1-2', s.sportDays)}>1–2 ×</option>
            <option value="3-4" ${sel('3-4', s.sportDays)}>3–4 ×</option>
            <option value="5+" ${sel('5+', s.sportDays)}>5 × oder mehr</option>
          </select></div>
        <div class="form-row"><label>Was ist dein Ziel?</label>
          <select id="gc-goal">
            <option value="lose" ${sel('lose', s.bodyGoal)}>Abnehmen</option>
            <option value="maintain" ${sel('maintain', s.bodyGoal)}>Gewicht halten</option>
            <option value="gain" ${sel('gain', s.bodyGoal)}>Muskeln aufbauen</option>
          </select></div>
        <button class="btn btn-primary btn-full" onclick="calcGoalPreview()">Berechnen</button>
        <div id="gc-result" class="mt-2"></div>
      </div>
    </div>
  </div>`);
}

function readGoalCalcForm() {
  return {
    sex: document.getElementById('gc-sex').value,
    age: +document.getElementById('gc-age').value || null,
    heightCm: +document.getElementById('gc-height').value || null,
    weightKg: +document.getElementById('gc-weight').value || null,
    jobActivity: document.getElementById('gc-job').value,
    sportDays: document.getElementById('gc-sport').value,
    bodyGoal: document.getElementById('gc-goal').value,
  };
}

function calcGoalPreview() {
  const p = readGoalCalcForm();
  const out = document.getElementById('gc-result');
  const r = computeNutritionGoals(p);
  if (!r) {
    out.innerHTML = '<div class="alert alert-amber">Bitte Geschlecht, Alter, Größe und Gewicht ausfüllen.</div>';
    return;
  }
  const goalText = { lose: 'Abnehmen (moderates Kaloriendefizit)', maintain: 'Gewicht halten',
    gain: 'Muskelaufbau (leichter Kalorienüberschuss)' }[p.bodyGoal];
  out.innerHTML = `
    <div class="grid-2 mb-1" style="gap:8px">
      <div class="stat"><div class="stat-label">Kalorien-Ziel</div>
        <div class="stat-value" style="font-size:20px">${r.kcal.toLocaleString('de-CH')}</div><div class="stat-sub">kcal / Tag</div></div>
      <div class="stat"><div class="stat-label">Protein-Ziel</div>
        <div class="stat-value" style="font-size:20px;color:var(--accent)">${r.protein} g</div><div class="stat-sub">pro Tag</div></div>
    </div>
    <div class="alert alert-blue" style="font-size:12px;line-height:1.6">
      Grundumsatz ≈ <strong>${r.bmr.toLocaleString('de-CH')} kcal</strong> ·
      mit Aktivität (Faktor ${r.pal.toString().replace('.', ',')}) ≈ <strong>${r.tdee.toLocaleString('de-CH')} kcal</strong> Gesamtbedarf.<br>
      Angepasst an dein Ziel „${esc(goalText)}".
    </div>
    <button class="btn btn-primary btn-full mt-1" onclick="applyGoalCalc()">Diese Ziele übernehmen</button>`;
}

async function applyGoalCalc() {
  const p = readGoalCalcForm();
  const r = computeNutritionGoals(p);
  if (!r) { toast('Bitte zuerst alle Felder ausfüllen.'); return; }
  Object.assign(DB.settings, p, {
    proteinGoal: r.protein, kcalGoal: r.kcal, goalSource: 'calculator',
  });
  await Data.persistSettings();
  closeModal();
  renderSettings();
  toast(`Ziele übernommen: ${r.protein} g Protein · ${r.kcal.toLocaleString('de-CH')} kcal.`);
  if (confirm('Soll der 14-Tage-Plan jetzt auf die neuen Ziele angepasst werden?')) {
    regeneratePlanForSettings('Plan an die neuen Ziele angepasst.');
  }
}

async function onBudgetChange(key, value) {
  DB.settings[key] = value;
  await Data.persistSettings();
  const budget = budgetForWindow();
  if (budget > 0 && planCost(DB.mealplan) > budget * 1.05
      && confirm('Der aktuelle Plan liegt über dem Budget. Soll er günstiger neu generiert werden?')) {
    regeneratePlanForSettings('Plan ans Budget angepasst.');
  }
  // Hinweis bei sehr knappem Budget
  if (key === 'budgetAmount' && budget > 0) {
    const perDay = budget / 14;
    const need = (DB.settings.proteinGoal || 120) * 0.035;
    if (perDay < need) {
      toast(`Hinweis: ${fmtMoney(perDay)}/Tag ist sehr knapp für ${DB.settings.proteinGoal} g Protein.`);
    }
  }
}

async function toggleAllergy(name) {
  const list = DB.settings.allergies || [];
  const i = list.indexOf(name);
  if (i >= 0) list.splice(i, 1); else list.push(name);
  DB.settings.allergies = list;
  await Data.persistSettings();
  renderSettings();
}

/* ---------- Spoonacular testen ---------- */
async function testSpoonacular() {
  const key = document.getElementById('set-spoon').value.trim();
  if (!key) { toast('Bitte einen API-Key eingeben.'); return; }
  toast('Verbindung wird getestet…');
  try {
    const res = await fetch(`${EP.SPOONACULAR_BASE}/recipes/complexSearch?apiKey=${encodeURIComponent(key)}&number=1`);
    if (!res.ok) throw new Error(res.status === 401 ? 'Key ungültig' : res.status === 402 ? 'Tageslimit erreicht' : 'Fehler ' + res.status);
    DB.settings.spoonacularKey = key;
    await Data.persistSettings();
    toast('✓ Spoonacular erfolgreich verbunden.');
  } catch (e) {
    toast('Test fehlgeschlagen: ' + e.message);
  }
}

/* ---------- preise.json laden ---------- */
function loadPriceFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      DB.priceData = JSON.parse(e.target.result);
      Data.saveLocalCollection('pricedata');
      toast('✓ Live-Preise geladen.');
    } catch { toast('Ungültige JSON-Datei.'); }
  };
  reader.readAsText(file);
}

/* ---------- Export / Import / Reset ---------- */
function exportJSON() {
  const dump = { settings: DB.settings, recipes: DB.recipes, mealplan: DB.mealplan,
    groceries: DB.groceries, pantry: DB.pantry, exportedAt: new Date().toISOString() };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
  a.download = `essensplaner_backup_${todayISO()}.json`;
  a.click();
  toast('Backup erstellt.');
}

function importJSON(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const d = JSON.parse(e.target.result);
      if (!confirm('Backup einspielen? Die aktuellen Daten werden ersetzt.')) return;
      if (d.settings) DB.settings = Object.assign(defaultSettings(), d.settings);
      if (d.recipes) DB.recipes = d.recipes;
      if (d.mealplan) DB.mealplan = d.mealplan;
      if (d.groceries) DB.groceries = d.groceries;
      if (d.pantry) DB.pantry = d.pantry;
      await Data.persistSettings();
      for (const coll of ['recipes', 'mealplan', 'groceries', 'pantry']) await Data.persist(coll);
      toast('✓ Backup eingespielt.');
      renderSettings();
    } catch { toast('Ungültige Backup-Datei.'); }
  };
  reader.readAsText(file);
}

async function resetSettings() {
  if (!confirm('Alle Einstellungen auf Standard zurücksetzen? (Rezepte, Plan und Vorrat bleiben erhalten.)')) return;
  DB.settings = defaultSettings();
  await Data.persistSettings();
  renderSettings();
  toast('Einstellungen zurückgesetzt.');
}

/* ============================================================
   ORTSSUCHE & LÄNDER-ERKENNUNG (Nominatim / OpenStreetMap)
   ============================================================ */
let _nomTimer = null;
let _nomResults = [];
function nominatimSuggest(inputId, listId) {
  clearTimeout(_nomTimer);
  const q = (document.getElementById(inputId).value || '').trim();
  const list = document.getElementById(listId);
  if (q.length < 3) { list.classList.add('hidden'); return; }
  _nomTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${EP.NOMINATIM_BASE}/search?format=json&limit=5&accept-language=de&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.length) { list.classList.add('hidden'); return; }
      _nomResults = data.map((d) => d.display_name.split(',').slice(0, 3).join(',').trim());
      list.innerHTML = _nomResults.map((label, i) =>
        `<div class="ac-item" onclick="pickPlace('${inputId}','${listId}',${i})"><span>${esc(label)}</span></div>`).join('');
      list.classList.remove('hidden');
    } catch { list.classList.add('hidden'); }
  }, 450);
}

function pickPlace(inputId, listId, i) {
  const label = _nomResults[i];
  if (label == null) return;
  document.getElementById(inputId).value = label;
  document.getElementById(listId).classList.add('hidden');
  if (inputId === 'set-city') onLocationChange('home', label);
  else if (inputId === 'set-decity') onLocationChange('comp', label);
}

/* Vollständige Geokodierung inkl. Länderkürzel */
async function geocodeFull(q) {
  const res = await fetch(`${EP.NOMINATIM_BASE}/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`);
  const d = await res.json();
  if (!d.length) return null;
  return {
    lat: +d[0].lat, lon: +d[0].lon,
    cc: ((d[0].address && d[0].address.country_code) || '').toLowerCase(),
  };
}

/* Ort gewechselt -> Land/Währung neu ableiten */
async function onLocationChange(which, value) {
  if (which === 'home') DB.settings.city = value;
  else DB.settings.deCity = value;
  DB.settings.homeCoords = null;
  DB.settings.deCoords = null;
  await Data.persistSettings();
  if (!value || !value.trim()) {            // Vergleichsort leer -> nicht geokodieren
    if (curPage === 'settings') renderSettings();
    return;
  }
  try {
    const g = await geocodeFull(value);
    if (g && g.cc) {
      if (which === 'home') DB.settings.homeCC = g.cc;
      else DB.settings.compCC = g.cc;
      await Data.persistSettings();
      if (curPage === 'settings') renderSettings();
    }
  } catch (e) { console.warn('Land konnte nicht ermittelt werden:', e); }
}

/* Vergleichsort automatisch suchen (nur bei Grenznähe) */
async function autoDetectComparison() {
  const out = document.getElementById('comp-detect-result');
  out.innerHTML = '<p class="text-sm text-muted">Suche läuft…</p>';
  try {
    const home = await geocodeFull(DB.settings.city);
    if (!home || !home.cc) throw new Error('Wohnort nicht gefunden – bitte oben prüfen.');
    DB.settings.homeCC = home.cc;

    const deals = BORDER_DEALS[home.cc];
    if (!deals) {
      await Data.persistSettings();
      const ci = countryInfo(home.cc);
      out.innerHTML = `<div class="alert alert-amber">Für deinen Wohnort (${ci.flag} ${esc(ci.name)}) hat die App keinen typischen Grenz-Einkaufsort gefunden. Trag den Vergleichsort einfach von Hand ein.</div>`;
      return;
    }

    let best = null;
    deals.forEach((deal) => deal.cities.forEach((city) => {
      const dist = haversineKm(home, city);
      if (!best || dist < best.dist) best = { dist, city, cc: deal.country };
    }));

    if (!best || best.dist > 90) {
      await Data.persistSettings();
      out.innerHTML = `<div class="alert alert-amber">Kein günstigerer Einkaufsort in Fahrnähe gefunden${best ? ` (nächster ~${Math.round(best.dist)} km entfernt)` : ''}. Du kannst den Vergleichsort manuell eintragen.</div>`;
      return;
    }

    DB.settings.deCity = best.city.name;
    DB.settings.compCC = best.cc;
    await Data.persistSettings();
    renderSettings();
    const ci = countryInfo(best.cc);
    toast(`Vergleichsort gefunden: ${best.city.name} (${ci.flag}, ~${Math.round(best.dist)} km).`);
  } catch (e) {
    out.innerHTML = `<div class="alert alert-amber">${esc(e.message)}</div>`;
  }
}

/* ============================================================
   FAHRKOSTENRECHNER
   ============================================================ */
function parseEUR(str) {
  const m = String(str || '').replace(',', '.').match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/* Schätzt die Ersparnis: Summe der Vergleichsort-Artikel mit €-Preis. */
function estimateCompSavings() {
  let sum = 0;
  DB.groceries.filter((g) => g.store === 'comp' && !g.checked).forEach((g) => {
    if (g.price && /€/.test(g.price)) sum += parseEUR(g.price);
  });
  return Math.round(sum * 100) / 100;
}

async function geocode(q) {
  const res = await fetch(`${EP.NOMINATIM_BASE}/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
  const d = await res.json();
  return d.length ? { lat: +d[0].lat, lon: +d[0].lon } : null;
}

function haversineKm(a, b) {
  const R = 6371, toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function calcDistance() {
  const home = (document.getElementById('set-city').value || DB.settings.city || '').trim();
  const dest = (document.getElementById('fuel-dest').value || '').trim();
  const out = document.getElementById('fuel-result');
  if (!home || !dest) { out.innerHTML = '<div class="alert alert-amber">Bitte Wohnort und Einkaufsort angeben.</div>'; return; }
  out.innerHTML = '<p class="text-sm text-muted">Distanz wird ermittelt…</p>';
  try {
    const a = await geocode(home);
    await new Promise((r) => setTimeout(r, 600)); // Nominatim: max 1 Anfrage/Sekunde
    const b = await geocode(dest);
    if (!a || !b) throw new Error('Ort nicht gefunden.');
    const road = Math.round(haversineKm(a, b) * 1.3); // Luftlinie -> grobe Straßendistanz
    document.getElementById('fuel-dist').value = road;
    DB.settings.lastDistance = road;
    await Data.persistSettings();
    out.innerHTML = `<div class="alert alert-blue">Geschätzte Strecke: <strong>${road} km</strong> (einfach). Jetzt „Berechnen" drücken.</div>`;
  } catch (e) {
    out.innerHTML = `<div class="alert alert-amber">Distanz nicht ermittelbar (${esc(e.message)}). Bitte km manuell eintragen.</div>`;
  }
}

async function calcFahrkosten() {
  const dist = +document.getElementById('fuel-dist').value || 0;
  const price = +document.getElementById('fuel-price').value || EP.DEFAULT_FUEL_PRICE;
  const cons = +document.getElementById('fuel-cons').value || EP.DEFAULT_FUEL_CONSUMPTION;
  const saving = +document.getElementById('fuel-saving').value || 0;
  const minSaving = +document.getElementById('fuel-min').value || 0;
  const out = document.getElementById('fuel-result');

  if (!dist) {
    out.innerHTML = '<div class="alert alert-amber">Bitte zuerst eine Distanz eintragen oder automatisch ermitteln.</div>';
    return;
  }

  // Fahrtkosten = (Distanz × 2 / 100) × Verbrauch × Spritpreis
  const fuelCost = (dist * 2 / 100) * cons * price;
  const net = saving - fuelCost;

  DB.settings.fuelPrice = price;
  DB.settings.fuelConsumption = cons;
  DB.settings.minSavingDE = minSaving;
  await Data.persistSettings();

  let verdict, cls;
  if (net <= 0) {
    verdict = `Lohnt sich <strong>nicht</strong>: Die Fahrt kostet mehr Sprit (${fmtEUR(fuelCost)}), als du sparst (${fmtEUR(saving)}).`;
    cls = 'alert-red';
  } else if (saving < minSaving) {
    verdict = `Würde sich rechnen (Netto-Ersparnis ${fmtEUR(net)}), aber deine Ersparnis liegt unter deiner Schwelle von ${fmtEUR(minSaving)}.`;
    cls = 'alert-amber';
  } else {
    verdict = `<strong>Lohnt sich!</strong> Nach Abzug der Spritkosten bleiben ${fmtEUR(net)} echte Ersparnis.`;
    cls = 'alert-green';
  }

  out.innerHTML = `
    <div class="grid-3 mb-1" style="gap:8px">
      <div class="stat"><div class="stat-label">Fahrtkosten</div><div class="stat-value" style="font-size:17px">${fmtEUR(fuelCost)}</div><div class="stat-sub">${dist} km × 2</div></div>
      <div class="stat"><div class="stat-label">Ersparnis</div><div class="stat-value" style="font-size:17px">${fmtEUR(saving)}</div></div>
      <div class="stat"><div class="stat-label">Netto</div><div class="stat-value" style="font-size:17px;color:${net > 0 ? 'var(--accent)' : 'var(--red)'}">${fmtEUR(net)}</div></div>
    </div>
    <div class="alert ${cls}">${verdict}</div>`;
}

function fmtEUR(v) {
  return (Math.round(v * 100) / 100).toLocaleString('de-CH', { minimumFractionDigits: 2 }) + ' €';
}
