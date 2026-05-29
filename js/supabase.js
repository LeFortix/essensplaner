/* ============================================================
   ESSENSPLANER – Datenlayer
   ------------------------------------------------------------
   Eine einzige API ("Data") fuer die ganze App. Sie synct mit
   Supabase, wenn der Nutzer eingeloggt ist – und faellt sonst
   automatisch auf den localStorage zurueck. Aenderungen im
   Offline-Modus landen in einer Queue und werden beim naechsten
   Online-Gang automatisch nachgereicht.
   ============================================================ */

/* In-Memory-Arbeitskopie aller Daten. Die Seiten lesen/schreiben
   hier direkt und rufen danach Data.persist(...) auf. */
window.DB = {
  settings: {},
  recipes: [],
  mealplan: [],
  groceries: [],
  pantry: [],
  priceData: null,
  onboardingDone: false,
};

/* Mapping: In-Memory-Sammlung -> Supabase-Tabelle + localStorage-Key */
const COLLECTIONS = {
  recipes:   { table: 'recipes',       ls: 'ep_recipes'   },
  mealplan:  { table: 'meal_plans',    ls: 'ep_mealplan'  },
  groceries: { table: 'grocery_items', ls: 'ep_groceries' },
  pantry:    { table: 'pantry_items',  ls: 'ep_pantry'    },
};

/* ---------- localStorage-Helfer ---------- */
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('localStorage voll?', e); } }
function lsDel(k) { try { localStorage.removeItem(k); } catch {} }

/* Scope-Suffix fuer den lokalen Cache. Wichtig fuer Multi-User-
   Trennung: jeder Account bekommt eigene localStorage-Schluessel,
   damit beim Wechsel zwischen Konten NIEMALS Daten eines anderen
   Nutzers sichtbar werden.
   - Cloud-Modus + eingeloggt -> '_<userId>'
   - Local-Modus              -> '_local'
   - sonst (Setup/Login-Screen, niemand angemeldet) -> null
     -> in dem Zustand wird nichts gelesen/geschrieben. */
function lsScope() {
  if (typeof Data === 'undefined') return null;
  if (Data.mode === 'cloud' && Data.user) return '_' + Data.user.id;
  if (Data.mode === 'local') return '_local';
  return null;
}

/* Eindeutige ID (auch offline stabil) */
function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

const Data = {
  client: null,
  user: null,
  mode: 'local',          // 'local' | 'cloud'

  /* ---------- Supabase-Client erzeugen ---------- */
  initClient() {
    if (this.client) return this.client;
    if (EP.hasSupabaseConfig() && window._SupabaseLib) {
      try {
        this.client = window._SupabaseLib.createClient(
          EP.SUPABASE_URL, EP.SUPABASE_ANON_KEY,
          { auth: { persistSession: true, autoRefreshToken: true } }
        );
      } catch (e) {
        console.error('Supabase-Init fehlgeschlagen:', e);
        this.client = null;
      }
    }
    return this.client;
  },

  /* ---------- Lokales Laden (Cache / Offline / Local-Modus) ---------- */
  loadLocal() {
    // Ohne Scope (kein User, kein Local-Modus) NICHTS aus dem
    // localStorage holen – sonst koennten Daten eines anderen
    // Nutzers in DB landen, der vorher auf diesem Browser war.
    const s = lsScope();
    if (!s) { this.resetDB(); return; }
    DB.settings       = Object.assign(defaultSettings(), lsGet('ep_settings' + s) || {});
    DB.recipes        = lsGet('ep_recipes' + s)   || defaultRecipes();
    DB.mealplan       = lsGet('ep_mealplan' + s)  || defaultPlan();
    DB.groceries      = lsGet('ep_groceries' + s) || defaultGroceries();
    DB.pantry         = lsGet('ep_pantry' + s)    || defaultPantry();
    DB.priceData      = lsGet('ep_pricedata' + s) || null;
    DB.onboardingDone = lsGet('ep_onboarding' + s) || false;
    migrateData();
  },

  /* Setzt DB im Speicher komplett auf Defaults zurueck.
     Beruehrt localStorage NICHT. */
  resetDB() {
    DB.settings = defaultSettings();
    DB.recipes = [];
    DB.mealplan = [];
    DB.groceries = [];
    DB.pantry = [];
    DB.priceData = null;
    DB.onboardingDone = false;
  },

  /* Loescht alle Cache-Eintraege eines konkreten Scopes
     (z.B. nach Logout). 'scope' ist '_<userId>' oder '_local'. */
  clearScopedCache(scope) {
    if (!scope) return;
    ['ep_settings','ep_recipes','ep_mealplan','ep_groceries',
     'ep_pantry','ep_pricedata','ep_onboarding', EP.OFFLINE_QUEUE_KEY]
      .forEach((b) => lsDel(b + scope));
  },

  /* Einmalige Aufraeumaktion: aeltere App-Versionen schrieben den
     localStorage-Cache OHNE User-Scope ('ep_recipes' statt
     'ep_recipes_<uid>'). Diese Altdaten gehoeren keinem Konto mehr
     zu und werden hier hart geloescht – nur Verbindungs-Keys und
     der Setup-Modus bleiben erhalten. */
  cleanupLegacyCache() {
    if (lsGet('ep_legacy_cache_cleared')) return;
    ['ep_settings','ep_recipes','ep_mealplan','ep_groceries',
     'ep_pantry','ep_pricedata','ep_onboarding', EP.OFFLINE_QUEUE_KEY,
     'ep_user']
      .forEach((k) => lsDel(k));
    try { localStorage.setItem('ep_legacy_cache_cleared', '1'); } catch {}
  },

  saveLocalCollection(coll) {
    const s = lsScope();
    if (!s) return;
    if (coll === 'settings')  return lsSet('ep_settings'  + s, DB.settings);
    if (coll === 'pricedata') return lsSet('ep_pricedata' + s, DB.priceData);
    if (COLLECTIONS[coll])    return lsSet(COLLECTIONS[coll].ls + s, DB[coll]);
  },
  saveLocalAll() {
    const s = lsScope();
    if (!s) return;
    lsSet('ep_settings'   + s, DB.settings);
    lsSet('ep_recipes'    + s, DB.recipes);
    lsSet('ep_mealplan'   + s, DB.mealplan);
    lsSet('ep_groceries'  + s, DB.groceries);
    lsSet('ep_pantry'     + s, DB.pantry);
    lsSet('ep_pricedata'  + s, DB.priceData);
    lsSet('ep_onboarding' + s, DB.onboardingDone);
  },

  /* ---------- Cloud: alles vom Server holen ---------- */
  async pullAll() {
    if (!this.client || !this.user) return false;
    this.mode = 'cloud';
    const uidv = this.user.id;
    const scope = '_' + uidv;

    // Profil / Einstellungen
    try {
      const { data: prof } = await this.client
        .from('profiles').select('settings,onboarding_done').eq('id', uidv).maybeSingle();
      if (prof) {
        DB.settings = Object.assign(defaultSettings(), prof.settings || {});
        DB.onboardingDone = !!prof.onboarding_done;
      } else {
        // Kein Profil in Supabase -> FRISCHER Start fuer dieses Konto.
        // KEIN Fallback auf localStorage: sonst leakt es Daten eines
        // Nutzers, der vorher auf diesem Browser eingeloggt war.
        DB.settings = defaultSettings();
        DB.onboardingDone = false;
        try {
          const { error: upErr } = await this.client.from('profiles').upsert({
            id: uidv, email: this.user.email, settings: DB.settings,
            onboarding_done: false, updated_at: new Date().toISOString(),
          });
          if (upErr) console.warn('Profil-Upsert fehlgeschlagen:', upErr);
        } catch (e) { console.warn('Profil-Upsert fehlgeschlagen:', e); }
      }
    } catch (e) { console.warn('Profil laden fehlgeschlagen:', e); }

    // Sammlungen
    const pendingQueue = this.getQueue();
    for (const [coll, cfg] of Object.entries(COLLECTIONS)) {
      try {
        // Ausstehende lokale Aenderungen DIESES Users haben Vorrang
        if (pendingQueue.includes(coll)) {
          const local = lsGet(cfg.ls + scope);
          if (local) { DB[coll] = Array.isArray(local) ? local : defaultFor(coll); continue; }
        }
        const { data: row } = await this.client
          .from(cfg.table).select('data').eq('user_id', uidv).maybeSingle();
        if (row) {
          DB[coll] = Array.isArray(row.data) ? row.data : defaultFor(coll);
        } else {
          DB[coll] = defaultFor(coll);
          await this.pushCollection(coll);
        }
      } catch (e) {
        console.warn('Laden fehlgeschlagen:', coll, e);
        DB[coll] = lsGet(cfg.ls + scope) || defaultFor(coll);
      }
    }

    DB.priceData = lsGet('ep_pricedata' + scope) || null;
    migrateData();
    this.saveLocalAll();
    return true;
  },

  /* ---------- Cloud: eine Sammlung hochladen ---------- */
  async pushCollection(coll) {
    if (!this.client || !this.user) return;
    const cfg = COLLECTIONS[coll];
    if (!cfg) return;
    const { error } = await this.client.from(cfg.table).upsert({
      user_id: this.user.id,
      data: DB[coll],
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },

  async pushSettings() {
    if (!this.client || !this.user) return;
    const { error } = await this.client.from('profiles').upsert({
      id: this.user.id,
      email: this.user.email,
      settings: DB.settings,
      onboarding_done: DB.onboardingDone,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },

  /* ---------- Zentrale Speicher-API fuer alle Seiten ----------
     Seite aendert DB.xxx direkt -> ruft Data.persist('xxx') auf. */
  async persist(coll) {
    this.saveLocalCollection(coll);
    if (this.mode !== 'cloud') return;
    if (navigator.onLine && this.client && this.user) {
      try { await this.pushCollection(coll); }
      catch (e) { console.warn('Sync fehlgeschlagen, in Queue:', coll, e); this.enqueue(coll); }
    } else {
      this.enqueue(coll);
    }
  },

  async persistSettings() {
    this.saveLocalCollection('settings');
    const s = lsScope();
    if (s) lsSet('ep_onboarding' + s, DB.onboardingDone);
    if (this.mode !== 'cloud') return;
    if (navigator.onLine && this.client && this.user) {
      try { await this.pushSettings(); }
      catch (e) { console.warn('Settings-Sync fehlgeschlagen:', e); this.enqueue('settings'); }
    } else {
      this.enqueue('settings');
    }
  },

  /* ---------- Offline-Queue (pro Nutzer getrennt) ---------- */
  queueKey() { const s = lsScope(); return s ? EP.OFFLINE_QUEUE_KEY + s : null; },
  getQueue() { const k = this.queueKey(); return k ? (lsGet(k) || []) : []; },
  enqueue(coll) {
    const k = this.queueKey();
    if (!k) return;
    const q = lsGet(k) || [];
    if (!q.includes(coll)) q.push(coll);
    lsSet(k, q);
    if (window.updateSyncBadge) updateSyncBadge();
  },
  async flushQueue() {
    if (this.mode !== 'cloud' || !navigator.onLine || !this.client || !this.user) return;
    const k = this.queueKey();
    if (!k) return;
    const q = lsGet(k) || [];
    if (!q.length) return;
    const stillPending = [];
    for (const coll of q) {
      try {
        if (coll === 'settings') await this.pushSettings();
        else await this.pushCollection(coll);
      } catch (e) { stillPending.push(coll); }
    }
    lsSet(k, stillPending);
    if (window.updateSyncBadge) updateSyncBadge();
    if (!stillPending.length && window.toast) toast('Offline-Änderungen synchronisiert.');
  },

  hasPendingSync() { return this.getQueue().length > 0; },
};

/* ============================================================
   STANDARD-DATEN (Beispielinhalte fuer neue Nutzer)
   ============================================================ */
function defaultFor(coll) {
  return { recipes: defaultRecipes, mealplan: defaultPlan,
           groceries: defaultGroceries, pantry: defaultPantry }[coll]();
}

function defaultSettings() {
  return {
    proteinGoal: 120,
    kcalGoal: 2200,
    goalSource: 'manual',         // 'manual' | 'calculator' – woher proteinGoal/kcalGoal stammen
    sex: '',                      // '' | 'male' | 'female'  (für Bedarfsrechner)
    age: null,
    heightCm: null,
    weightKg: null,
    jobActivity: 'sitting',       // 'sitting' | 'standing' | 'physical'
    sportDays: '0',               // '0' | '1-2' | '3-4' | '5+'
    bodyGoal: 'maintain',         // 'lose' | 'maintain' | 'gain'
    planCuisines: [],             // bevorzugte Küchen für den Auto-Plan
    planLikes: '',                // Lieblingszutaten (Komma-getrennt)
    planDislikes: '',             // No-Go-Zutaten (Komma-getrennt)
    planUseSpoon: false,          // Spoonacular-Rezepte in den Auto-Plan einbeziehen
    carbTiming: null,             // KH-Timing (morgens wenig, abends viel); null = automatisch nach Ziel
    city: 'Winterthur, Schweiz',
    deCity: 'Konstanz, Deutschland',
    homeCC: 'ch',                 // Länderkürzel Wohnort
    compCC: 'de',                 // Länderkürzel Vergleichsort
    threshold: 20,
    diet: 'vegetarian',
    lang: 'de',
    allergies: [],
    spoonacularKey: '',
    fuelPrice: EP.DEFAULT_FUEL_PRICE,
    fuelConsumption: EP.DEFAULT_FUEL_CONSUMPTION,
    minSavingDE: 0,
    cookDays: 3,
    portionsPerSession: 3,
    prepBatchDays: 3,             // Frühstück/Snack im Voraus für X Tage
    shopInterval: 14,             // Großeinkauf alle X Tage (14 oder 7)
    maxStores: 2,
    maxPrepTime: 60,
    activeRecipeCount: 6,
    budgetAmount: 0,              // 0 = kein Budget gesetzt
    budgetPeriod: 'biweekly',     // 'biweekly' | 'monthly'
    homeCoords: null,
    deCoords: null,
  };
}

/* Wandelt Daten aus älteren Versionen ins aktuelle Format um */
function migrateData() {
  // Vorrat: altes Format {fresh:[],dry:[]} -> flaches Array
  if (DB.pantry && !Array.isArray(DB.pantry) && typeof DB.pantry === 'object') {
    const flat = [];
    ['fresh', 'dry'].forEach((cat) => {
      (DB.pantry[cat] || []).forEach((it) => flat.push(Object.assign({ id: uid(), cat }, it)));
    });
    DB.pantry = flat;
  }

  // Sicherstellen, dass alle Sammlungen Arrays sind
  if (!Array.isArray(DB.pantry)) DB.pantry = [];
  if (!Array.isArray(DB.recipes)) DB.recipes = [];
  if (!Array.isArray(DB.mealplan)) DB.mealplan = [];
  if (!Array.isArray(DB.groceries)) DB.groceries = [];

  // IDs als Strings vereinheitlichen (alte Versionen nutzten Zahlen)
  DB.recipes.forEach((r) => { if (r && r.id != null) r.id = String(r.id); });
  DB.groceries.forEach((g) => { if (g && g.id != null) g.id = String(g.id); });
  DB.pantry.forEach((p) => { if (p) p.id = p.id != null ? String(p.id) : uid(); });
  DB.mealplan.forEach((d) => {
    if (!d) return;
    ['breakfast', 'lunch', 'dinner', 'snack'].forEach((k) => {
      if (d[k] && d[k].rid != null) d[k].rid = String(d[k].rid);
    });
  });

  // Einkaufsliste: alte Laden-Kürzel auf home/comp umstellen
  DB.groceries.forEach((g) => {
    if (g.store === 'ch') g.store = 'home';
    else if (g.store === 'de') g.store = 'comp';
    else if (g.store !== 'home' && g.store !== 'comp') g.store = 'comp';
  });

  // Einkaufsliste: englische Zutatennamen eindeutschen und
  // deutsch/englische Dubletten zusammenführen ("eggs" + "Eier")
  if (typeof translateFoodName === 'function') {
    const seen = {};
    const mergedGroceries = [];
    DB.groceries.forEach((g) => {
      if (!g) return;
      g.n = translateFoodName(g.n);
      const key = foodKey(g.n);
      if (seen[key] != null) {
        const keep = mergedGroceries[seen[key]];
        keep.a = mergeAmounts(keep.a, g.a);                         // Mengen aufsummieren
        if (g.checked) keep.checked = true;                         // „erledigt" erhalten
      } else {
        seen[key] = mergedGroceries.length;
        mergedGroceries.push(g);
      }
    });
    DB.groceries = mergedGroceries;
  }

  // Vorrat-Einträge ohne Kategorie ergänzen
  DB.pantry.forEach((p) => { if (p && !p.cat) p.cat = 'dry'; });

  // Online-importierte Dip/Saucen-Rezepte bereinigen
  const _BAD_NAMES = ['dip', 'sauce', 'marinade', 'dressing', 'condiment', 'spread', 'chutney', 'relish', 'hüttenkäse', 'cottage cheese'];
  DB.recipes = DB.recipes.filter((r) => {
    if (!r || (!r.fromPlan && !r.browse)) return true;    // eigene Rezepte unangetastet lassen
    const name = (r.name || '').toLowerCase();
    return !_BAD_NAMES.some((bad) => name.includes(bad));
  });

  // Fehlende Snack-Starter-Rezepte (r34–r43) automatisch ergänzen
  const _existingIds = new Set(DB.recipes.map((r) => r && String(r.id)));
  const _snackIds = new Set(['r34','r35','r36','r37','r38','r39','r40','r41','r42','r43']);
  defaultRecipes().forEach((def) => {
    if (_snackIds.has(def.id) && !_existingIds.has(def.id)) {
      DB.recipes.push(Object.assign({}, def));
    }
  });
}

function defaultRecipes() {
  const COSTS = { r1: 2.4, r2: 3.8, r3: 2.2, r4: 2.6, r5: 3.2, r6: 1.6, r7: 3.5, r8: 4.2, r9: 2.8, r10: 3.6 };
  return [
    { id: 'r1', name: 'Linsen-Dhal mit Reis', time: 35, protein: 34, kcal: 580, carbs: 78, fat: 12,
      tags: ['high-protein', 'meal-prep', 'cheap'], cuisine: 'indian', portions: 3, active: true, image: '',
      ingredients: [
        { n: 'Rote Linsen', a: '250 g' }, { n: 'Basmati Reis', a: '200 g' }, { n: 'Kokosmilch (light)', a: '200 ml' },
        { n: 'Tomaten (Dose)', a: '400 g' }, { n: 'Zwiebel', a: '1 Stück' }, { n: 'Knoblauch', a: '3 Zehen' },
        { n: 'Ingwer (gemahlen)', a: '1 TL' }, { n: 'Kurkuma', a: '1 TL' }, { n: 'Kreuzkümmel', a: '1 TL' }, { n: 'Rapsöl', a: '1 EL' }],
      steps: [
        'Zwiebel würfeln und in Öl 3 Min glasig braten.',
        'Knoblauch, Ingwer, Kurkuma und Kreuzkümmel einrühren, 1 Min rösten.',
        'Tomaten und Kokosmilch dazugeben, aufkochen.',
        'Linsen einrühren. Alles 20–25 Min köcheln (kein Rühren nötig).',
        'Reis parallel in 15 Min kochen. Mit Salz abschmecken.',
        'In 3 Behälter aufteilen – hält 3 Tage im Kühlschrank.'],
      notes: 'Günstigstes Gericht. Linsen in DE kaufen: ~0,99 €/500 g bei Aldi/Lidl.' },

    { id: 'r2', name: 'Tofu-Gemüse-Pfanne', time: 25, protein: 28, kcal: 490, carbs: 42, fat: 18,
      tags: ['quick', 'high-protein', 'meal-prep'], cuisine: 'asian', portions: 2, active: true, image: '',
      ingredients: [
        { n: 'Tofu (fest)', a: '400 g' }, { n: 'Brokkoli', a: '300 g' }, { n: 'Paprika', a: '2 Stück' },
        { n: 'Sojasauce', a: '3 EL' }, { n: 'Sesamöl', a: '1 EL' }, { n: 'Knoblauch', a: '2 Zehen' },
        { n: 'Reisnudeln', a: '150 g' }, { n: 'Chili', a: 'nach Geschmack' }],
      steps: [
        'Tofu trockentupfen, in 2 cm Würfel schneiden.',
        'Bei hoher Hitze in Öl von allen Seiten knusprig anbraten (~8 Min). Rausnehmen.',
        'Brokkoli und Paprika im gleichen Öl 5 Min anbraten.',
        'Knoblauch und Chili kurz mitrösten.',
        'Sojasauce und Sesamöl dazugeben. Tofu zurück in die Pfanne.',
        'Reisnudeln nach Packungsanleitung, alles vermengen.'],
      notes: 'Varianten: Zucchini, Karotten oder Weißkohl funktionieren genauso.' },

    { id: 'r3', name: 'Kichererbsen-Curry', time: 30, protein: 31, kcal: 550, carbs: 72, fat: 14,
      tags: ['high-protein', 'meal-prep', 'cheap'], cuisine: 'indian', portions: 3, active: true, image: '',
      ingredients: [
        { n: 'Kichererbsen (Dose)', a: '2×400 g' }, { n: 'Tomaten (Dose)', a: '400 g' },
        { n: 'Zwiebel', a: '1 Stück' }, { n: 'Kokosmilch', a: '200 ml' },
        { n: 'Garam Masala', a: '2 TL' }, { n: 'Kurkuma', a: '1 TL' }, { n: 'Knoblauch', a: '3 Zehen' }],
      steps: [
        'Zwiebel würfeln, glasig braten. Knoblauch dazu.',
        'Gewürze einrühren, 1 Min rösten.',
        'Tomaten und abgetropfte Kichererbsen dazugeben.',
        'Kokosmilch einrühren. 20 Min köcheln lassen.',
        'Mit Salz abschmecken. Mit Reis oder Brot servieren.'],
      notes: '2 Dosen Kichererbsen ~0,80 €. Bestes Preis-Protein-Verhältnis im Plan.' },

    { id: 'r4', name: 'Skyr-Frühstücksbowl', time: 5, protein: 38, kcal: 420, carbs: 52, fat: 8,
      tags: ['quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, image: '',
      ingredients: [
        { n: 'Skyr', a: '250 g' }, { n: 'Haferflocken', a: '50 g' }, { n: 'Gefrorene Beeren', a: '100 g' },
        { n: 'Leinsamen', a: '1 EL' }, { n: 'Honig', a: '1 TL' }, { n: 'Walnüsse', a: '20 g' }],
      steps: [
        'Haferflocken kurz in etwas Wasser einweichen (optional, 5 Min).',
        'Beeren auftauen (Mikrowelle 1 Min).',
        'Skyr in Schüssel, Haferflocken drauf.',
        'Beeren, Leinsamen, Walnüsse drüber. Honig drizzeln.'],
      notes: '38 g Protein vor dem Mittag – sehr starker Start. Skyr in CH kaufen (Coop/Migros).' },

    { id: 'r5', name: 'Erbsen-Linsen-Nudelauflauf', time: 40, protein: 36, kcal: 620, carbs: 85, fat: 16,
      tags: ['meal-prep', 'high-protein'], cuisine: 'european', portions: 3, active: true, image: '',
      ingredients: [
        { n: 'Erbsen-Linsen-Nudeln', a: '300 g' }, { n: 'Gefrorene Erbsen', a: '200 g' },
        { n: 'Magerquark', a: '300 g' }, { n: 'Eier', a: '2 Stück' }, { n: 'Gouda (gerieben)', a: '100 g' },
        { n: 'Gemüsebrühe', a: '300 ml' }, { n: 'Knoblauch', a: '2 Zehen' }, { n: 'Muskat, Salz, Pfeffer', a: 'nach Geschmack' }],
      steps: [
        'Nudeln al dente kochen (8 Min). Abgießen.',
        'Quark, Eier, Brühe, Knoblauch und Gewürze verrühren.',
        'Nudeln mit Erbsen mischen, in Auflaufform.',
        'Quarkmischung drübergießen, Käse drüberstreuen.',
        '200 °C Ofen, 25 Min backen (aktive Zeit: 15 Min).'],
      notes: 'Linsen-Nudeln bei Edeka/Aldi DE ~1,50 € – günstigste Protein-Nudel im Plan.' },

    { id: 'r6', name: 'Haferflocken-Proteinporridge', time: 10, protein: 32, kcal: 480, carbs: 68, fat: 14,
      tags: ['quick', 'high-protein', 'cheap'], cuisine: 'european', portions: 1, active: true, image: '',
      ingredients: [
        { n: 'Haferflocken', a: '80 g' }, { n: 'Milch (1,5 %)', a: '300 ml' },
        { n: 'Erdnussmus', a: '1 EL' }, { n: 'Banane', a: '1 Stück' }, { n: 'Zimt', a: '1 Prise' },
        { n: 'Proteinpulver (optional)', a: '20 g' }],
      steps: [
        'Haferflocken mit Milch aufkochen, dabei rühren.',
        'Hitze reduzieren, 3–4 Min quellen lassen.',
        'Vom Herd, Erdnussmus einrühren (+ Proteinpulver falls gewünscht).',
        'In Schüssel, Banane drüber, Zimt bestreuen.'],
      notes: 'Ohne Pulver: 22 g Protein. Mit Pulver: 32 g. Haferflocken immer in DE kaufen.' },

    { id: 'r7', name: 'Vietnamesische Pho Chay', time: 45, protein: 22, kcal: 380, carbs: 55, fat: 8,
      tags: ['healthy'], cuisine: 'asian', portions: 2, active: false, browse: true, image: '',
      ingredients: [{ n: 'Breite Reisnudeln', a: '200 g' }, { n: 'Tofu', a: '200 g' }, { n: 'Gemüsebrühe', a: '1 L' },
        { n: 'Sternanis', a: '2 Stück' }, { n: 'Ingwer', a: '2 cm' }, { n: 'Sojasauce', a: '2 EL' },
        { n: 'Frühlingszwiebeln', a: '3 Stück' }, { n: 'Limette', a: '1 Stück' }, { n: 'Bohnensprossen', a: '100 g' }],
      steps: ['Brühe mit Sternanis und Ingwer 20 Min köcheln, dann durch Sieb geben.',
        'Reisnudeln einweichen (laut Packung).',
        'Tofu in Öl goldbraun anbraten.',
        'Nudeln in Brühe einlegen, Tofu und Gemüse drauf.',
        'Mit Sprossen, Frühlingszwiebeln, Limette servieren.'],
      notes: 'Aromatisch durch Sternanis. Ideales Wintergericht.' },

    { id: 'r8', name: 'Palak Paneer (Spinat-Käse)', time: 35, protein: 26, kcal: 440, carbs: 22, fat: 24,
      tags: ['high-protein'], cuisine: 'indian', portions: 2, active: false, browse: true, image: '',
      ingredients: [{ n: 'Paneer oder fester Tofu', a: '250 g' }, { n: 'TK-Spinat', a: '400 g' },
        { n: 'Zwiebel', a: '1 Stück' }, { n: 'Tomaten', a: '200 g' }, { n: 'Knoblauch', a: '3 Zehen' },
        { n: 'Garam Masala', a: '2 TL' }, { n: 'Sahne oder Kokossahne', a: '100 ml' }, { n: 'Butter', a: '1 EL' }],
      steps: ['Spinat auftauen und pürieren.',
        'Zwiebel und Knoblauch in Butter andünsten.',
        'Tomaten und Gewürze dazu, 5 Min köcheln.',
        'Spinatpüree einrühren, 10 Min köcheln.',
        'Sahne einrühren, Paneer-Würfel dazu, 5 Min erwärmen.'],
      notes: 'Paneer bei Aldi/Lidl ~2,50 €. Alternative: fester Tofu.' },

    { id: 'r9', name: 'Spanische Tortilla', time: 30, protein: 24, kcal: 460, carbs: 38, fat: 22,
      tags: ['quick'], cuisine: 'mediterranean', portions: 2, active: false, browse: true, image: '',
      ingredients: [{ n: 'Eier', a: '6 Stück' }, { n: 'Kartoffeln', a: '400 g' },
        { n: 'Zwiebel', a: '1 Stück' }, { n: 'Olivenöl', a: '4 EL' }, { n: 'Paprika', a: '1 Stück' }],
      steps: ['Kartoffeln schälen, in dünne Scheiben schneiden.',
        'In Olivenöl 15 Min braten bis weich.',
        'Eier verquirlen, Kartoffeln einmischen, 5 Min ruhen lassen.',
        'Masse in Pfanne, bei niedriger Hitze stocken lassen.',
        'Teller-Trick: wenden und andere Seite 3 Min braten.'],
      notes: 'Hält sich kalt 3 Tage – ideal als Lunchbox.' },

    { id: 'r10', name: 'Burrito-Bowl', time: 20, protein: 30, kcal: 560, carbs: 72, fat: 16,
      tags: ['quick', 'high-protein'], cuisine: 'mexican', portions: 2, active: false, browse: true, image: '',
      ingredients: [{ n: 'Schwarze Bohnen (Dose)', a: '400 g' }, { n: 'Reis', a: '150 g' },
        { n: 'Mais (Dose)', a: '200 g' }, { n: 'Paprika', a: '2 Stück' }, { n: 'Avocado', a: '1 Stück' },
        { n: 'Skyr oder Sauerrahm', a: '100 g' }, { n: 'Kreuzkümmel, Paprikapulver', a: 'je 1 TL' }, { n: 'Limette', a: '1 Stück' }],
      steps: ['Reis kochen (15 Min).',
        'Paprika und Mais mit Gewürzen in Pfanne rösten (5 Min).',
        'Bohnen erhitzen.',
        'Alles in Bowl schichten: Reis, Bohnen, Gemüse.',
        'Avocado würfeln, Skyr und Limettensaft drüber.'],
      notes: 'Schnelle Mahlzeit ohne komplizierte Zutaten.' },

    { id: 'r11', name: 'Protein-Pancakes', time: 15, protein: 30, kcal: 470, carbs: 52, fat: 12,
      tags: ['quick', 'high-protein'], cuisine: 'european', portions: 2, active: true, browse: false, image: '', cost: 1.8,
      ingredients: [
        { n: 'Magerquark', a: '250 g' }, { n: 'Haferflocken', a: '80 g' }, { n: 'Eier', a: '2 Stück' },
        { n: 'Banane', a: '1 Stück' }, { n: 'Backpulver', a: '1 TL' }, { n: 'Proteinpulver (optional)', a: '20 g' },
        { n: 'Rapsöl', a: '1 EL' }],
      steps: [
        'Banane mit der Gabel zerdrücken.',
        'Quark, Eier, Haferflocken, Backpulver (und Proteinpulver) mit der Banane glatt rühren.',
        '5 Min quellen lassen, damit der Teig dicker wird.',
        'Wenig Öl in der Pfanne erhitzen, kleine Pancakes bei mittlerer Hitze je 2 Min pro Seite backen.',
        'Mit Beeren oder etwas Honig servieren.'],
      notes: 'Ohne Proteinpulver ~24 g Protein. Teig hält im Kühlschrank 1 Tag.' },

    { id: 'r12', name: 'Overnight Oats mit Skyr & Erdnussmus', time: 5, protein: 27, kcal: 450, carbs: 55, fat: 14,
      tags: ['quick', 'high-protein', 'meal-prep'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 1.6,
      ingredients: [
        { n: 'Haferflocken', a: '60 g' }, { n: 'Skyr', a: '200 g' }, { n: 'Milch (1,5 %)', a: '100 ml' },
        { n: 'Erdnussmus', a: '1 EL' }, { n: 'Chiasamen', a: '1 EL' }, { n: 'Gefrorene Beeren', a: '80 g' },
        { n: 'Honig', a: '1 TL' }],
      steps: [
        'Haferflocken, Chiasamen, Milch und Skyr in einem Glas verrühren.',
        'Erdnussmus und Honig unterheben.',
        'Beeren obenauf geben, Glas verschließen.',
        'Über Nacht in den Kühlschrank – morgens fertig.'],
      notes: 'Ideal zum Vorbereiten: 2–3 Gläser auf einmal machen.' },

    { id: 'r13', name: 'Rührei mit Avocado-Vollkornbrot', time: 12, protein: 26, kcal: 440, carbs: 32, fat: 24,
      tags: ['quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 2.2,
      ingredients: [
        { n: 'Eier', a: '3 Stück' }, { n: 'Vollkornbrot', a: '2 Scheiben' }, { n: 'Avocado', a: '1/2 Stück' },
        { n: 'Butter', a: '1 TL' }, { n: 'Schnittlauch', a: 'etwas' }, { n: 'Salz, Pfeffer', a: 'nach Geschmack' }],
      steps: [
        'Eier verquirlen, mit Salz und Pfeffer würzen.',
        'Butter in der Pfanne schmelzen, Eier bei niedriger Hitze cremig stocken lassen.',
        'Brot toasten, Avocado darauf zerdrücken.',
        'Rührei auf das Brot geben, mit Schnittlauch bestreuen.'],
      notes: 'Schneller, sättigender Start mit guten Fetten aus der Avocado.' },

    { id: 'r14', name: 'Erdnuss-Tofu-Curry', time: 30, protein: 31, kcal: 560, carbs: 48, fat: 26,
      tags: ['high-protein', 'meal-prep'], cuisine: 'asian', portions: 3, active: true, browse: false, image: '', cost: 3.0,
      ingredients: [
        { n: 'Tofu (fest)', a: '400 g' }, { n: 'Erdnussmus', a: '3 EL' }, { n: 'Kokosmilch', a: '200 ml' },
        { n: 'Brokkoli', a: '250 g' }, { n: 'Paprika', a: '1 Stück' }, { n: 'Basmati Reis', a: '200 g' },
        { n: 'Sojasauce', a: '2 EL' }, { n: 'Knoblauch', a: '2 Zehen' }, { n: 'Ingwer (gemahlen)', a: '1 TL' },
        { n: 'Limette', a: '1 Stück' }],
      steps: [
        'Tofu würfeln und in der Pfanne rundum knusprig braten.',
        'Knoblauch und Ingwer kurz mitbraten.',
        'Erdnussmus, Kokosmilch und Sojasauce einrühren, aufkochen.',
        'Brokkoli und Paprika dazugeben, 8 Min köcheln.',
        'Reis parallel kochen. Curry mit Limettensaft abschmecken.'],
      notes: 'Cremiges Curry mit viel Protein aus Tofu und Erdnussmus.' },

    { id: 'r15', name: 'Misosuppe mit Edamame & Tofu', time: 20, protein: 25, kcal: 380, carbs: 38, fat: 12,
      tags: ['quick', 'high-protein'], cuisine: 'asian', portions: 2, active: true, browse: false, image: '', cost: 2.8,
      ingredients: [
        { n: 'Misopaste', a: '2 EL' }, { n: 'Tofu (fest)', a: '200 g' }, { n: 'Edamame', a: '200 g' },
        { n: 'Reisnudeln', a: '120 g' }, { n: 'Frühlingszwiebeln', a: '2 Stück' }, { n: 'Karotte', a: '1 Stück' },
        { n: 'Sojasauce', a: '1 EL' }],
      steps: [
        '1 Liter Wasser erhitzen (nicht kochen).',
        'Karotte in Streifen, Tofu würfeln, beides 5 Min ziehen lassen.',
        'Reisnudeln und Edamame dazugeben, 4 Min garen.',
        'Topf vom Herd, Misopaste in etwas Brühe auflösen und einrühren (nicht mehr kochen).',
        'Mit Sojasauce abschmecken, Frühlingszwiebeln darüberstreuen.'],
      notes: 'Miso nicht aufkochen – sonst gehen die guten Kulturen verloren.' },

    { id: 'r16', name: 'Shakshuka mit Feta', time: 25, protein: 24, kcal: 420, carbs: 24, fat: 26,
      tags: ['high-protein'], cuisine: 'oriental', portions: 2, active: true, browse: false, image: '', cost: 2.6,
      ingredients: [
        { n: 'Eier', a: '4 Stück' }, { n: 'Passierte Tomaten', a: '400 g' }, { n: 'Paprika', a: '1 Stück' },
        { n: 'Zwiebel', a: '1 Stück' }, { n: 'Feta', a: '100 g' }, { n: 'Knoblauch', a: '2 Zehen' },
        { n: 'Kreuzkümmel', a: '1 TL' }, { n: 'Paprikapulver', a: '1 TL' }, { n: 'Olivenöl', a: '2 EL' }],
      steps: [
        'Zwiebel und Paprika würfeln, in Olivenöl 5 Min anbraten.',
        'Knoblauch und Gewürze kurz mitrösten.',
        'Passierte Tomaten dazugeben, 8 Min einköcheln.',
        'Mit dem Löffel 4 Mulden formen, Eier hineingleiten lassen.',
        'Feta darüberbröseln, zugedeckt 6–8 Min stocken lassen.'],
      notes: 'Mit Fladenbrot servieren. Klassiker aus der orientalischen Küche.' },

    { id: 'r17', name: 'Falafel-Bowl mit Hummus', time: 35, protein: 23, kcal: 540, carbs: 62, fat: 22,
      tags: ['high-protein', 'meal-prep'], cuisine: 'oriental', portions: 3, active: true, browse: false, image: '', cost: 2.7,
      ingredients: [
        { n: 'Kichererbsen (Dose)', a: '2×400 g' }, { n: 'Hummus', a: '200 g' }, { n: 'Bulgur', a: '200 g' },
        { n: 'Gurke', a: '1 Stück' }, { n: 'Tomaten', a: '2 Stück' }, { n: 'Petersilie', a: '1 Bund' },
        { n: 'Knoblauch', a: '2 Zehen' }, { n: 'Kreuzkümmel', a: '1 TL' }, { n: 'Olivenöl', a: '2 EL' }],
      steps: [
        'Eine Dose Kichererbsen mit Knoblauch, Petersilie, Kreuzkümmel und etwas Mehl pürieren.',
        'Aus der Masse Bällchen formen und in Öl rundum goldbraun braten.',
        'Bulgur nach Packung garen.',
        'Gurke und Tomaten würfeln, zweite Dose Kichererbsen erwärmen.',
        'Alles in Schüsseln anrichten, Hummus dazugeben.'],
      notes: 'Falafel lassen sich gut auf Vorrat braten und kalt essen.' },

    { id: 'r18', name: 'Linsen-Bolognese mit Vollkornspaghetti', time: 35, protein: 29, kcal: 600, carbs: 88, fat: 12,
      tags: ['high-protein', 'meal-prep', 'cheap'], cuisine: 'mediterranean', portions: 3, active: true, browse: false, image: '', cost: 2.4,
      ingredients: [
        { n: 'Vollkornspaghetti', a: '300 g' }, { n: 'Rote Linsen', a: '200 g' }, { n: 'Passierte Tomaten', a: '500 g' },
        { n: 'Zwiebel', a: '1 Stück' }, { n: 'Karotte', a: '2 Stück' }, { n: 'Knoblauch', a: '3 Zehen' },
        { n: 'Gemüsebrühe', a: '200 ml' }, { n: 'Olivenöl', a: '2 EL' }, { n: 'Oregano', a: '1 TL' }],
      steps: [
        'Zwiebel, Karotte und Knoblauch fein würfeln, in Öl 5 Min anbraten.',
        'Linsen kurz mitrösten.',
        'Passierte Tomaten und Brühe dazugeben, 20 Min köcheln bis die Linsen weich sind.',
        'Mit Oregano, Salz und Pfeffer abschmecken.',
        'Spaghetti al dente kochen und mit der Sauce servieren.'],
      notes: 'Sehr günstige, proteinreiche Variante der klassischen Bolognese.' },

    { id: 'r19', name: 'Halloumi-Bauernsalat', time: 20, protein: 27, kcal: 470, carbs: 22, fat: 30,
      tags: ['quick', 'high-protein'], cuisine: 'mediterranean', portions: 2, active: true, browse: false, image: '', cost: 3.6,
      ingredients: [
        { n: 'Halloumi', a: '225 g' }, { n: 'Gurke', a: '1 Stück' }, { n: 'Tomaten', a: '3 Stück' },
        { n: 'Paprika', a: '1 Stück' }, { n: 'Zwiebel', a: '1/2 Stück' }, { n: 'Oliven', a: '60 g' },
        { n: 'Feta', a: '60 g' }, { n: 'Olivenöl', a: '3 EL' }, { n: 'Oregano', a: '1 TL' }],
      steps: [
        'Gurke, Tomaten, Paprika und Zwiebel grob würfeln.',
        'Mit Oliven, Olivenöl und Oregano vermengen.',
        'Halloumi in Scheiben schneiden und in der Pfanne ohne Öl goldbraun braten.',
        'Salat anrichten, Feta darüberbröseln, warmen Halloumi auflegen.'],
      notes: 'Halloumi quietscht beim Braten – das ist normal und gewollt.' },

    { id: 'r20', name: 'Ofengemüse mit Kichererbsen & Feta', time: 40, protein: 22, kcal: 480, carbs: 46, fat: 24,
      tags: ['high-protein', 'meal-prep'], cuisine: 'mediterranean', portions: 3, active: true, browse: false, image: '', cost: 2.9,
      ingredients: [
        { n: 'Kichererbsen (Dose)', a: '2×400 g' }, { n: 'Zucchini', a: '2 Stück' }, { n: 'Paprika', a: '2 Stück' },
        { n: 'Süßkartoffel', a: '1 Stück' }, { n: 'Feta', a: '150 g' }, { n: 'Olivenöl', a: '3 EL' },
        { n: 'Knoblauch', a: '3 Zehen' }, { n: 'Paprikapulver', a: '1 TL' }, { n: 'Rosmarin', a: '1 TL' }],
      steps: [
        'Zucchini, Paprika und Süßkartoffel in mundgerechte Stücke schneiden.',
        'Mit abgetropften Kichererbsen, Öl, Knoblauch und Gewürzen mischen.',
        'Auf ein Blech geben, bei 200 °C 25 Min backen.',
        'Feta darüberbröseln, weitere 8 Min backen.'],
      notes: 'Aktive Zeit nur ~12 Min – der Rest macht der Ofen.' },

    { id: 'r21', name: 'Chili sin Carne', time: 35, protein: 26, kcal: 520, carbs: 78, fat: 10,
      tags: ['high-protein', 'meal-prep', 'cheap'], cuisine: 'mexican', portions: 4, active: true, browse: false, image: '', cost: 2.2,
      ingredients: [
        { n: 'Kidneybohnen (Dose)', a: '2×400 g' }, { n: 'Schwarze Bohnen (Dose)', a: '400 g' }, { n: 'Mais (Dose)', a: '200 g' },
        { n: 'Passierte Tomaten', a: '500 g' }, { n: 'Zwiebel', a: '1 Stück' }, { n: 'Paprika', a: '2 Stück' },
        { n: 'Knoblauch', a: '3 Zehen' }, { n: 'Kreuzkümmel', a: '2 TL' }, { n: 'Chili', a: 'nach Geschmack' },
        { n: 'Basmati Reis', a: '200 g' }],
      steps: [
        'Zwiebel, Paprika und Knoblauch würfeln, anbraten.',
        'Gewürze kurz mitrösten.',
        'Bohnen, Mais und passierte Tomaten dazugeben.',
        '20 Min köcheln lassen, gelegentlich umrühren.',
        'Mit Reis servieren. Schmeckt aufgewärmt noch besser.'],
      notes: '4 große Portionen für wenig Geld – ideal für Meal Prep.' },

    { id: 'r22', name: 'Gemüse-Frittata', time: 30, protein: 25, kcal: 430, carbs: 18, fat: 28,
      tags: ['high-protein', 'meal-prep'], cuisine: 'european', portions: 3, active: true, browse: false, image: '', cost: 2.8,
      ingredients: [
        { n: 'Eier', a: '8 Stück' }, { n: 'Kartoffeln', a: '300 g' }, { n: 'Spinat', a: '150 g' },
        { n: 'Zwiebel', a: '1 Stück' }, { n: 'Gouda (gerieben)', a: '100 g' }, { n: 'Milch', a: '80 ml' },
        { n: 'Olivenöl', a: '2 EL' }],
      steps: [
        'Kartoffeln in dünne Scheiben schneiden, in der ofenfesten Pfanne 10 Min anbraten.',
        'Zwiebel und Spinat dazugeben, kurz mitgaren.',
        'Eier mit Milch, Käse, Salz und Pfeffer verquirlen, über das Gemüse gießen.',
        'Bei 180 °C im Ofen 15 Min backen, bis die Frittata fest ist.'],
      notes: 'Kalt als Lunchbox top – hält 3 Tage im Kühlschrank.' },

    { id: 'r23', name: 'Gemüse-Omelett', time: 15, protein: 23, kcal: 330, carbs: 9, fat: 24,
      tags: ['quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 1.9,
      ingredients: [
        { n: 'Eier', a: '3 Stück' }, { n: 'Paprika', a: '1/2 Stück' }, { n: 'Champignons', a: '60 g' },
        { n: 'Spinat', a: '1 Handvoll' }, { n: 'Zwiebel', a: '1/2 Stück' }, { n: 'Rapsöl', a: '1 EL' }],
      steps: [
        'Zwiebel, Paprika und Champignons klein schneiden, in Öl 4 Min anbraten.',
        'Spinat zugeben, kurz zusammenfallen lassen.',
        'Eier verquirlen, mit Salz und Pfeffer würzen, über das Gemüse gießen.',
        'Bei mittlerer Hitze stocken lassen, zusammenklappen und servieren.'],
      notes: 'Kohlenhydratarmes Frühstück mit viel Protein – passt zum KH-Timing.' },

    { id: 'r24', name: 'Tofu-Rührei mit Spinat', time: 12, protein: 21, kcal: 290, carbs: 8, fat: 19,
      tags: ['quick', 'high-protein'], cuisine: 'european', portions: 2, active: true, browse: false, image: '', cost: 2.0,
      ingredients: [
        { n: 'Tofu (fest)', a: '300 g' }, { n: 'Spinat', a: '150 g' }, { n: 'Zwiebel', a: '1 Stück' },
        { n: 'Kurkuma', a: '1 TL' }, { n: 'Knoblauch', a: '1 Zehe' }, { n: 'Rapsöl', a: '1 EL' }],
      steps: [
        'Tofu mit der Gabel grob zerbröseln.',
        'Zwiebel und Knoblauch in Öl andünsten.',
        'Tofu und Kurkuma zugeben, 4–5 Min kräftig anbraten.',
        'Spinat unterheben, bis er zusammenfällt. Mit Salz und Pfeffer abschmecken.'],
      notes: 'Veganes, kohlenhydratarmes Frühstück.' },

    { id: 'r25', name: 'Skyr-Bowl mit Nüssen', time: 5, protein: 26, kcal: 360, carbs: 16, fat: 22,
      tags: ['quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 2.0,
      ingredients: [
        { n: 'Skyr', a: '250 g' }, { n: 'Walnüsse', a: '20 g' }, { n: 'Mandeln', a: '15 g' },
        { n: 'Leinsamen', a: '1 EL' }, { n: 'Gefrorene Beeren', a: '60 g' }],
      steps: [
        'Skyr in eine Schüssel geben.',
        'Beeren antauen lassen und untermischen.',
        'Walnüsse und Mandeln grob hacken, mit den Leinsamen darüberstreuen.'],
      notes: 'Ohne Haferflocken – proteinreich und kohlenhydratarm.' },

    { id: 'r26', name: 'Käsespätzle', time: 35, protein: 25, kcal: 640, carbs: 56, fat: 32,
      tags: ['high-protein', 'meal-prep'], cuisine: 'german', portions: 3, active: true, browse: false, image: '', cost: 2.8,
      ingredients: [
        { n: 'Mehl', a: '300 g' }, { n: 'Eier', a: '4 Stück' }, { n: 'Bergkäse (gerieben)', a: '200 g' },
        { n: 'Zwiebel', a: '2 Stück' }, { n: 'Butter', a: '2 EL' }, { n: 'Muskat, Salz', a: 'nach Geschmack' }],
      steps: [
        'Mehl, Eier, etwas Wasser, Salz und Muskat zu einem zähen Teig verrühren.',
        'Teig portionsweise durch einen Spätzlehobel ins kochende Salzwasser schaben.',
        'Spätzle abschöpfen, sobald sie oben schwimmen.',
        'Zwiebeln in Butter goldbraun rösten.',
        'Spätzle und geriebenen Käse abwechselnd schichten, Röstzwiebeln darüber.'],
      notes: 'Deftiger Klassiker – der Käse bringt ordentlich Protein.' },

    { id: 'r27', name: 'Kaiserschmarrn mit Quark', time: 25, protein: 24, kcal: 470, carbs: 46, fat: 17,
      tags: ['high-protein'], cuisine: 'german', portions: 2, active: true, browse: false, image: '', cost: 2.0,
      ingredients: [
        { n: 'Eier', a: '4 Stück' }, { n: 'Mehl', a: '120 g' }, { n: 'Milch', a: '150 ml' },
        { n: 'Magerquark', a: '200 g' }, { n: 'Rosinen', a: '40 g' }, { n: 'Butter', a: '1 EL' },
        { n: 'Zucker', a: '1 EL' }],
      steps: [
        'Eier trennen. Eiweiß mit einer Prise Salz steif schlagen.',
        'Eigelb mit Mehl, Milch, Quark und Zucker glatt rühren.',
        'Eischnee vorsichtig unterheben.',
        'Teig in Butter goldbraun backen, mit zwei Gabeln in Stücke reißen.',
        'Rosinen unterheben und kurz mitkaramellisieren.'],
      notes: 'Mit Quark im Teig deutlich proteinreicher als das Original.' },

    { id: 'r28', name: 'Deftiger Linseneintopf', time: 40, protein: 22, kcal: 410, carbs: 58, fat: 6,
      tags: ['high-protein', 'meal-prep', 'cheap'], cuisine: 'german', portions: 4, active: true, browse: false, image: '', cost: 1.7,
      ingredients: [
        { n: 'Tellerlinsen', a: '300 g' }, { n: 'Karotte', a: '3 Stück' }, { n: 'Kartoffeln', a: '3 Stück' },
        { n: 'Knollensellerie', a: '150 g' }, { n: 'Zwiebel', a: '1 Stück' }, { n: 'Gemüsebrühe', a: '1,2 L' },
        { n: 'Lorbeerblatt', a: '1 Stück' }, { n: 'Essig', a: '1 EL' }],
      steps: [
        'Zwiebel würfeln und andünsten.',
        'Karotte, Kartoffeln und Sellerie würfeln, kurz mitbraten.',
        'Linsen, Brühe und Lorbeerblatt zugeben.',
        '30 Min köcheln, bis Linsen und Gemüse weich sind.',
        'Mit einem Schuss Essig, Salz und Pfeffer abschmecken.'],
      notes: 'Hält im Kühlschrank 3–4 Tage und schmeckt aufgewärmt noch besser.' },

    { id: 'r29', name: 'Edamame-Reis-Bowl', time: 20, protein: 27, kcal: 520, carbs: 68, fat: 14,
      tags: ['quick', 'high-protein', 'meal-prep'], cuisine: 'asian', portions: 2, active: true, browse: false, image: '', cost: 2.9,
      ingredients: [
        { n: 'Edamame', a: '200 g' }, { n: 'Basmati Reis', a: '200 g' }, { n: 'Räuchertofu', a: '150 g' },
        { n: 'Karotte', a: '1 Stück' }, { n: 'Gurke', a: '1/2 Stück' }, { n: 'Sojasauce', a: '2 EL' },
        { n: 'Sesam', a: '1 EL' }, { n: 'Limette', a: '1 Stück' }],
      steps: [
        'Reis kochen, Edamame nach Packung garen.',
        'Räuchertofu würfeln und knusprig anbraten.',
        'Karotte und Gurke in feine Streifen schneiden.',
        'Alles in Schüsseln anrichten, mit Sojasauce, Limettensaft und Sesam würzen.'],
      notes: 'Edamame und Räuchertofu liefern reichlich pflanzliches Protein.' },

    { id: 'r30', name: 'Erdnuss-Tofu-Nudeln', time: 25, protein: 29, kcal: 580, carbs: 60, fat: 24,
      tags: ['high-protein', 'meal-prep'], cuisine: 'asian', portions: 3, active: true, browse: false, image: '', cost: 3.0,
      ingredients: [
        { n: 'Vollkornnudeln', a: '300 g' }, { n: 'Tofu (fest)', a: '400 g' }, { n: 'Erdnussmus', a: '3 EL' },
        { n: 'Sojasauce', a: '3 EL' }, { n: 'Brokkoli', a: '250 g' }, { n: 'Knoblauch', a: '2 Zehen' },
        { n: 'Limette', a: '1 Stück' }, { n: 'Chili', a: 'nach Geschmack' }],
      steps: [
        'Nudeln kochen, Brokkoli die letzten 4 Min mitgaren.',
        'Tofu würfeln und knusprig anbraten.',
        'Erdnussmus, Sojasauce, Knoblauch, Limettensaft und etwas Nudelwasser zu einer Sauce verrühren.',
        'Nudeln, Brokkoli und Tofu mit der Erdnusssauce vermengen, mit Chili abschmecken.'],
      notes: 'Cremige Erdnusssauce – sättigend und sehr proteinreich.' },

    { id: 'r31', name: 'Spinat-Ricotta-Cannelloni', time: 45, protein: 28, kcal: 560, carbs: 50, fat: 26,
      tags: ['high-protein', 'meal-prep'], cuisine: 'italian', portions: 3, active: true, browse: false, image: '', cost: 3.4,
      ingredients: [
        { n: 'Cannelloni', a: '250 g' }, { n: 'Ricotta', a: '250 g' }, { n: 'Blattspinat (TK)', a: '400 g' },
        { n: 'Mozzarella', a: '125 g' }, { n: 'Passierte Tomaten', a: '500 g' }, { n: 'Parmesan (gerieben)', a: '40 g' },
        { n: 'Knoblauch', a: '2 Zehen' }],
      steps: [
        'Spinat auftauen, gut ausdrücken, mit Ricotta, Knoblauch, Salz und Pfeffer mischen.',
        'Cannelloni mit der Spinat-Ricotta-Masse füllen.',
        'Passierte Tomaten in eine Auflaufform geben, Cannelloni darauflegen.',
        'Mozzarella und Parmesan darüber verteilen.',
        'Bei 190 °C ca. 30 Min backen, bis der Käse goldbraun ist.'],
      notes: 'Ricotta und Mozzarella machen den Auflauf schön proteinreich.' },

    { id: 'r32', name: 'Italienischer Bohnen-Mozzarella-Salat', time: 15, protein: 23, kcal: 430, carbs: 36, fat: 19,
      tags: ['quick', 'high-protein'], cuisine: 'italian', portions: 2, active: true, browse: false, image: '', cost: 2.6,
      ingredients: [
        { n: 'Weiße Bohnen (Dose)', a: '2×400 g' }, { n: 'Mozzarella', a: '125 g' }, { n: 'Tomaten', a: '3 Stück' },
        { n: 'Rote Zwiebel', a: '1/2 Stück' }, { n: 'Olivenöl', a: '2 EL' }, { n: 'Basilikum', a: '1 Handvoll' },
        { n: 'Balsamico-Essig', a: '1 EL' }],
      steps: [
        'Weiße Bohnen abtropfen lassen und abspülen.',
        'Tomaten und Mozzarella würfeln, Zwiebel fein hacken.',
        'Alles mit Olivenöl, Balsamico, Salz und Pfeffer vermengen.',
        'Basilikum darüberzupfen und kurz durchziehen lassen.'],
      notes: 'In 15 Minuten fertig – ideal als schnelles, kaltes Mittagessen.' },

    { id: 'r33', name: 'Bohnen-Käse-Quesadilla', time: 20, protein: 26, kcal: 540, carbs: 54, fat: 22,
      tags: ['quick', 'high-protein'], cuisine: 'mexican', portions: 2, active: true, browse: false, image: '', cost: 2.6,
      ingredients: [
        { n: 'Vollkorn-Tortillas', a: '4 Stück' }, { n: 'Kidneybohnen (Dose)', a: '400 g' },
        { n: 'Käse (gerieben)', a: '150 g' }, { n: 'Paprika', a: '1 Stück' }, { n: 'Mais (Dose)', a: '100 g' },
        { n: 'Frühlingszwiebel', a: '2 Stück' }, { n: 'Kreuzkümmel', a: '1 TL' }],
      steps: [
        'Bohnen grob zerdrücken, mit Kreuzkümmel, Salz und Pfeffer würzen.',
        'Paprika und Frühlingszwiebeln klein schneiden.',
        'Eine Tortilla mit Bohnen, Gemüse, Mais und Käse belegen, zweite Tortilla darauflegen.',
        'In der trockenen Pfanne je Seite 2–3 Min knusprig backen, in Stücke schneiden.'],
      notes: 'Knusprig, herzhaft und in 20 Minuten fertig.' },

    // ---- Snack-Rezepte (r34–r43) ----
    { id: 'r34', name: 'Magerquark-Bowl mit Kakao & Banane', time: 5, protein: 18, kcal: 185, carbs: 22, fat: 1,
      tags: ['snack', 'quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 1.0,
      ingredients: [
        { n: 'Magerquark', a: '150 g' }, { n: 'Banane', a: '½ Stück' },
        { n: 'Kakaopulver (ungesüßt)', a: '1 TL' }, { n: 'Honig', a: '1 TL' }],
      steps: [
        'Magerquark in eine Schüssel geben.',
        'Banane in Scheiben schneiden und untermischen.',
        'Kakaopulver und Honig einrühren – fertig.'],
      notes: 'Klingt simpel, schmeckt wie Schoko-Pudding. Mit Vanillezucker noch besser.' },

    { id: 'r35', name: 'Skyr-Bowl mit Nüssen & Honig', time: 5, protein: 17, kcal: 230, carbs: 18, fat: 10,
      tags: ['snack', 'quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 1.5,
      ingredients: [
        { n: 'Skyr', a: '150 g' }, { n: 'Walnüsse', a: '20 g' },
        { n: 'Beeren (gefroren)', a: '50 g' }, { n: 'Honig', a: '1 TL' }],
      steps: [
        'Beeren kurz auftauen (Mikrowelle 1 Min oder über Nacht in Kühlschrank).',
        'Skyr in Schüssel geben, Beeren und Walnüsse drauf.',
        'Mit Honig beträufeln.'],
      notes: 'Perfekt als Nachmittags-Snack. Skyr ist sättigender als normaler Joghurt.' },

    { id: 'r36', name: 'Protein-Shake mit Erdnussmus', time: 2, protein: 30, kcal: 270, carbs: 14, fat: 10,
      tags: ['snack', 'quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 1.5,
      ingredients: [
        { n: 'Proteinpulver', a: '25 g' }, { n: 'Milch (1,5 %)', a: '250 ml' },
        { n: 'Erdnussmus', a: '1 EL' }],
      steps: [
        'Alle Zutaten in einen Shaker oder Becher geben.',
        'Gut schütteln oder mit dem Mixer kurz mixen.',
        'Direkt trinken.'],
      notes: '1 Löffel Proteinpulver (~25 g) liefert sofort 20–25 g Protein dazu – das ist der einfachste Protein-Boost.' },

    { id: 'r37', name: 'Edamame mit Meersalz', time: 8, protein: 16, kcal: 190, carbs: 12, fat: 8,
      tags: ['snack', 'quick', 'high-protein'], cuisine: 'asian', portions: 1, active: true, browse: false, image: '', cost: 1.7,
      ingredients: [
        { n: 'Edamame (TK, in Schote)', a: '200 g' }, { n: 'Meersalz', a: '1 Prise' }],
      steps: [
        'Edamame nach Packungsanleitung kochen (ca. 5–6 Min in Salzwasser).',
        'Abgießen, mit Meersalz bestreuen.',
        'Direkt aus der Schote essen – die Schote selbst wird nicht gegessen.'],
      notes: 'Bei Aldi/Lidl TK fuer ca. 1,50 Euro/400 g. Einer der einfachsten pflanzlichen Proteinsnacks.' },

    { id: 'r38', name: 'Reiskuchen mit Erdnussmus & Banane', time: 3, protein: 9, kcal: 240, carbs: 36, fat: 8,
      tags: ['snack', 'quick'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 0.9,
      ingredients: [
        { n: 'Reiskuchen', a: '3 Stück' }, { n: 'Erdnussmus', a: '1,5 EL' },
        { n: 'Banane', a: '½ Stück' }],
      steps: [
        'Reiskuchen nebeneinander legen.',
        'Erdnussmus gleichmäßig darauf verteilen.',
        'Banane in Scheiben schneiden und drauflegen.'],
      notes: 'Leichter, süßer Snack. Mit Chiasamen oder Zimt verfeinern.' },

    { id: 'r39', name: 'Hartgekochte Eier mit Tomate', time: 12, protein: 13, kcal: 165, carbs: 4, fat: 10,
      tags: ['snack', 'quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 0.8,
      ingredients: [
        { n: 'Eier', a: '2 Stück' }, { n: 'Tomate', a: '1 Stück' },
        { n: 'Salz, Pfeffer', a: 'nach Geschmack' }],
      steps: [
        'Eier in kochendes Wasser legen, 10 Min kochen.',
        'Abschrecken, schälen.',
        'Mit Tomate und Salz servieren.'],
      notes: 'Lässt sich gut vorkochen – 4–5 Eier auf Vorrat, halten 3 Tage im Kühlschrank.' },

    { id: 'r40', name: 'Hummus-Gemüse-Teller', time: 5, protein: 9, kcal: 215, carbs: 22, fat: 10,
      tags: ['snack', 'quick'], cuisine: 'oriental', portions: 1, active: true, browse: false, image: '', cost: 1.3,
      ingredients: [
        { n: 'Hummus', a: '100 g' }, { n: 'Paprika', a: '½ Stück' },
        { n: 'Gurke', a: '½ Stück' }, { n: 'Karotte', a: '1 Stück' }],
      steps: [
        'Gemüse in Stifte schneiden.',
        'Hummus in eine kleine Schale geben.',
        'Gemüse zum Dippen daneben legen.'],
      notes: 'Hummus aus dem Supermarkt ist völlig ok. Wenn du mehr Protein willst, 150 g Hummus nehmen.' },

    { id: 'r41', name: 'Knusprige Ofen-Kichererbsen', time: 25, protein: 12, kcal: 235, carbs: 28, fat: 7,
      tags: ['snack', 'high-protein'], cuisine: 'mediterranean', portions: 1, active: true, browse: false, image: '', cost: 0.9,
      ingredients: [
        { n: 'Kichererbsen (Dose)', a: '240 g (abgetropft)' }, { n: 'Olivenöl', a: '1 TL' },
        { n: 'Paprikapulver', a: '½ TL' }, { n: 'Salz', a: '1 Prise' }, { n: 'Knoblauchpulver', a: '½ TL' }],
      steps: [
        'Ofen auf 200 °C vorheizen.',
        'Kichererbsen gut abtropfen und mit Küchenpapier trocken tupfen.',
        'Mit Öl und Gewürzen mischen, auf ein Backblech geben.',
        '20–22 Min backen, bis sie knusprig sind. Gelegentlich schütteln.',
        'Abkühlen lassen – werden beim Abkühlen noch knuspriger.'],
      notes: 'Lässt sich auf Vorrat machen – hält 2 Tage in einer offenen Dose (nicht luftdicht, sonst werden sie weich).' },

    { id: 'r42', name: 'Käse-Obst-Teller', time: 5, protein: 15, kcal: 290, carbs: 14, fat: 20,
      tags: ['snack', 'quick', 'high-protein'], cuisine: 'european', portions: 1, active: true, browse: false, image: '', cost: 1.4,
      ingredients: [
        { n: 'Gouda oder Bergkäse', a: '60 g' }, { n: 'Apfel', a: '1 Stück' },
        { n: 'Walnüsse', a: '15 g' }],
      steps: [
        'Käse in Scheiben schneiden.',
        'Apfel in Spalten schneiden.',
        'Mit Walnüssen anrichten.'],
      notes: 'Keine Zubereitung nötig. Sättigend durch Fett + Protein aus dem Käse.' },

    { id: 'r43', name: 'Griechischer Joghurt mit Mandeln & Honig', time: 3, protein: 13, kcal: 275, carbs: 18, fat: 14,
      tags: ['snack', 'quick', 'high-protein'], cuisine: 'mediterranean', portions: 1, active: true, browse: false, image: '', cost: 1.6,
      ingredients: [
        { n: 'Griechischer Joghurt (10 %)', a: '150 g' }, { n: 'Mandeln', a: '20 g' },
        { n: 'Beeren (gefroren)', a: '50 g' }, { n: 'Honig', a: '1 TL' }],
      steps: [
        'Joghurt in eine Schüssel geben.',
        'Beeren draufgeben (aufgetaut oder gefroren).',
        'Mandeln und Honig drüber.'],
      notes: 'Griechischer Joghurt hat mehr Protein als normaler Joghurt – auf "10 % Fett" achten, das schmeckt viel besser als Mager-Varianten.' },

  ].map((r) => Object.assign({ cost: COSTS[r.id] || 3 }, r));
}

function defaultPlan() {
  const breakfasts = [{ name: 'Skyr-Frühstücksbowl', protein: 38, rid: 'r4' }, { name: 'Haferflocken-Porridge', protein: 32, rid: 'r6' }];
  const lunches    = [{ name: 'Linsen-Dhal', protein: 34, rid: 'r1' }, { name: 'Kichererbsen-Curry', protein: 31, rid: 'r3' }];
  const dinners    = [{ name: 'Tofu-Gemüse-Pfanne', protein: 28, rid: 'r2' }, { name: 'Nudelauflauf', protein: 36, rid: 'r5' }, { name: 'Linsen-Dhal', protein: 34, rid: 'r1' }];
  const snacks     = [{ name: 'Quark + Banane', protein: 18 }, { name: 'Joghurt + Nüsse', protein: 15 }, { name: 'Protein-Shake', protein: 25 }];
  return Array.from({ length: 14 }, (_, i) => {
    const bf = { ...breakfasts[i % 2] }, lu = { ...lunches[Math.floor(i / 2) % 2] };
    const dn = { ...dinners[i % 3] }, sn = { ...snacks[i % 3] };
    return {
      day: i + 1, breakfast: bf, lunch: lu, dinner: dn, snack: sn,
      totalProtein: bf.protein + lu.protein + dn.protein + sn.protein,
    };
  });
}

function defaultPantry() {
  return [
    { id: uid(), n: 'Eier', a: '6 Stück', cat: 'fresh', s: 'fresh', e: 'in 2 Wochen', added: todayISO() },
    { id: uid(), n: 'Skyr', a: '500 g', cat: 'fresh', s: 'soon', e: 'in 3 Tagen', added: todayISO() },
    { id: uid(), n: 'Brokkoli', a: '1 Kopf', cat: 'fresh', s: 'soon', e: 'in 4 Tagen', added: todayISO() },
    { id: uid(), n: 'Tofu (fest)', a: '400 g', cat: 'fresh', s: 'fresh', e: 'in 1 Woche', added: todayISO() },
    { id: uid(), n: 'Haferflocken', a: '1 kg', cat: 'dry', s: 'fresh', e: 'noch 6 Monate', added: todayISO() },
    { id: uid(), n: 'Rote Linsen', a: '500 g', cat: 'dry', s: 'fresh', e: 'noch 1 Jahr', added: todayISO() },
    { id: uid(), n: 'Kichererbsen (Dose)', a: '3 Dosen', cat: 'dry', s: 'fresh', e: 'noch 2 Jahre', added: todayISO() },
    { id: uid(), n: 'Basmati Reis', a: '2 kg', cat: 'dry', s: 'fresh', e: 'noch 1 Jahr', added: todayISO() },
    { id: uid(), n: 'Tomaten (Dose)', a: '2 Dosen', cat: 'dry', s: 'fresh', e: 'noch 1 Jahr', added: todayISO() },
    { id: uid(), n: 'Kokosmilch', a: '1 Dose', cat: 'dry', s: 'fresh', e: 'noch 8 Monate', added: todayISO() },
    { id: uid(), n: 'Sojasauce', a: 'halbvoll', cat: 'dry', s: 'fresh', e: 'noch 1 Jahr', added: todayISO() },
  ];
}

function defaultGroceries() {
  const mk = (n, a, cat, store, price) => ({ id: uid(), n, a, cat, store, price, checked: false });
  return [
    mk('Rote Linsen', '1 kg', 'Hülsenfrüchte', 'comp', '1,49 €'),
    mk('Kichererbsen (Dose, 4×)', '4×400 g', 'Hülsenfrüchte', 'comp', '1,96 €'),
    mk('Haferflocken', '2 kg', 'Getreide', 'comp', '1,59 €'),
    mk('Basmati Reis', '2 kg', 'Getreide', 'comp', '2,99 €'),
    mk('Tomaten (Dose, 4×)', '4×400 g', 'Konserven', 'comp', '2,80 €'),
    mk('Kokosmilch (2×)', '2×400 ml', 'Konserven', 'comp', '1,98 €'),
    mk('Skyr', '4×500 g', 'Milchprodukte', 'home', 'CHF 12.80'),
    mk('Magerquark', '2×500 g', 'Milchprodukte', 'home', 'CHF 4.20'),
    mk('Tofu (fest)', '2×400 g', 'Proteinquellen', 'home', 'CHF 6.40'),
    mk('Eier', '10 Stück', 'Proteinquellen', 'home', 'CHF 4.50'),
    mk('Brokkoli', '2 Köpfe', 'Gemüse', 'home', 'CHF 4.20'),
    mk('Paprika (bunt)', '4 Stück', 'Gemüse', 'home', 'CHF 3.60'),
    mk('Gefrorene Beeren', '1 kg', 'TK', 'comp', '2,49 €'),
    mk('Zwiebeln', '2 kg', 'Gemüse', 'home', 'CHF 1.20'),
  ];
}
