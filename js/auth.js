/* ============================================================
   ESSENSPLANER – Setup, Login & Onboarding
   ------------------------------------------------------------
   Steuert den Start der App:
     1. Erster Start  -> Setup-Screen (Supabase verbinden ODER
        nur lokal nutzen)
     2. Cloud-Modus   -> Login / Registrierung
     3. Erstes Login  -> Onboarding (4 Schritte, alles skipbar)
     4. danach        -> die eigentliche App
   ============================================================ */

const Auth = {

  /* ---------- Start-Entscheidung ---------- */
  async boot() {
    Data.loadLocal();                       // Cache sofort verfuegbar
    const setup = localStorage.getItem(EP.SETUP_DONE_KEY);   // 'cloud' | 'local' | null

    if (!setup) { this.showSetup(); return; }

    if (setup === 'local') {
      Data.mode = 'local';
      if (!DB.onboardingDone) { this.showOnboarding(); return; }
      this.enterApp();
      return;
    }

    // ----- Cloud-Modus -----
    Data.initClient();
    if (!Data.client) {
      this.showSetup('Verbindung zu Supabase nicht möglich – bitte Zugangsdaten erneut eingeben.');
      return;
    }
    try {
      const { data: { session } } = await Data.client.auth.getSession();
      if (session) {
        Data.user = session.user;
        await Data.pullAll();
        // Fallback: localStorage gewinnt, falls Supabase-Sync noch aussteht
        if (!DB.onboardingDone) DB.onboardingDone = !!lsGet('ep_onboarding');
        if (!DB.onboardingDone) { this.showOnboarding(); return; }
        this.enterApp();
        return;
      }
    } catch (e) { console.warn('Session-Check fehlgeschlagen:', e); }
    this.showLogin();
  },

  screen(html) {
    const s = document.getElementById('auth-screen');
    s.innerHTML = html;
    s.classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  },

  /* ============================================================
     1) SETUP-SCREEN
     ============================================================ */
  showSetup(errMsg) {
    this.screen(`
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-logo">🥗</div>
          <h1 class="auth-title">Essensplaner</h1>
          <p class="auth-sub">Intelligentes Ernährungssystem – einmalige Einrichtung</p>
          ${errMsg ? `<div class="auth-error">${errMsg}</div>` : ''}

          <div class="auth-options">
            <div class="auth-option" onclick="Auth.toggleSetupMode('cloud')" id="opt-cloud">
              <div class="auth-option-head">
                <strong>☁️ Mit Cloud-Konto</strong>
                <span class="badge badge-green">empfohlen</span>
              </div>
              <p>Login auf mehreren Geräten, automatische Synchronisierung, mehrere Nutzer.</p>
            </div>
            <div class="auth-option" onclick="Auth.toggleSetupMode('local')" id="opt-local">
              <div class="auth-option-head"><strong>📱 Nur auf diesem Gerät</strong></div>
              <p>Funktioniert sofort ohne Konto. Daten bleiben nur in diesem Browser.</p>
            </div>
          </div>

          <div id="setup-cloud-form" class="hidden">
            <hr class="divider">
            <p class="auth-hint">
              Die Daten findest du im Supabase-Dashboard unter
              <em>Project Settings → API</em>. Sie werden nur lokal in diesem
              Browser gespeichert – nie im Code, nie online.
            </p>
            <div class="form-row">
              <label>Supabase Projekt-URL</label>
              <input id="setup-url" type="url" placeholder="https://xxxxx.supabase.co" autocomplete="off">
            </div>
            <div class="form-row">
              <label>Supabase anon / public Key</label>
              <input id="setup-key" type="text" placeholder="eyJhbGciOi..." autocomplete="off">
            </div>
            <div id="setup-err" class="auth-error hidden"></div>
            <button class="btn btn-primary btn-full" onclick="Auth.saveSupabaseConfig()">Verbinden</button>
          </div>

          <div id="setup-local-form" class="hidden">
            <hr class="divider">
            <p class="auth-hint">Du kannst später in den Einstellungen jederzeit auf ein Cloud-Konto umstellen.</p>
            <button class="btn btn-primary btn-full" onclick="Auth.chooseLocal()">Lokal starten</button>
          </div>
        </div>
      </div>`);
  },

  toggleSetupMode(mode) {
    document.getElementById('opt-cloud').classList.toggle('selected', mode === 'cloud');
    document.getElementById('opt-local').classList.toggle('selected', mode === 'local');
    document.getElementById('setup-cloud-form').classList.toggle('hidden', mode !== 'cloud');
    document.getElementById('setup-local-form').classList.toggle('hidden', mode !== 'local');
  },

  chooseLocal() {
    localStorage.setItem(EP.SETUP_DONE_KEY, 'local');
    Data.mode = 'local';
    Data.loadLocal();
    this.showOnboarding();
  },

  saveSupabaseConfig() {
    const url = (document.getElementById('setup-url').value || '').trim().replace(/\/+$/, '');
    const key = (document.getElementById('setup-key').value || '').trim();
    const err = document.getElementById('setup-err');
    const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };

    if (!/^https:\/\/.+\..+/.test(url)) return fail('Die URL muss mit https:// beginnen, z. B. https://xxxxx.supabase.co');
    if (key.length < 30) return fail('Der anon Key sieht zu kurz aus – bitte vollständig einfügen.');

    localStorage.setItem('ep_supabase_url', url);
    localStorage.setItem('ep_supabase_key', key);
    EP.SUPABASE_URL = url;
    EP.SUPABASE_ANON_KEY = key;
    Data.client = null;
    if (!Data.initClient()) return fail('Verbindung konnte nicht aufgebaut werden. Daten prüfen.');

    localStorage.setItem(EP.SETUP_DONE_KEY, 'cloud');
    this.showLogin();
  },

  /* ============================================================
     2) LOGIN / REGISTRIERUNG
     ============================================================ */
  showLogin(mode = 'login') {
    const isLogin = mode === 'login';
    this.screen(`
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-logo">🥗</div>
          <h1 class="auth-title">Essensplaner</h1>
          <p class="auth-sub">${isLogin ? 'Willkommen zurück' : 'Neues Konto erstellen'}</p>

          <div class="form-row">
            <label>E-Mail</label>
            <input id="auth-email" type="email" placeholder="du@beispiel.de" autocomplete="email">
          </div>
          <div class="form-row">
            <label>Passwort</label>
            <input id="auth-pass" type="password" placeholder="••••••••" autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                   onkeydown="if(event.key==='Enter')Auth.${isLogin ? 'doLogin' : 'doRegister'}()">
          </div>
          <div id="auth-err" class="auth-error hidden"></div>
          <div id="auth-info" class="auth-info hidden"></div>

          <button class="btn btn-primary btn-full" id="auth-submit"
                  onclick="Auth.${isLogin ? 'doLogin' : 'doRegister'}()">
            ${isLogin ? 'Anmelden' : 'Registrieren'}
          </button>

          <p class="auth-switch">
            ${isLogin
              ? 'Noch kein Konto? <a onclick="Auth.showLogin(\'register\')">Registrieren</a>'
              : 'Schon ein Konto? <a onclick="Auth.showLogin(\'login\')">Anmelden</a>'}
          </p>
          <p class="auth-switch"><a onclick="Auth.showSetup()">← Verbindung ändern</a></p>
        </div>
      </div>`);
  },

  _authMsg(text, type) {
    const errEl = document.getElementById('auth-err');
    const infoEl = document.getElementById('auth-info');
    errEl.classList.add('hidden');
    infoEl.classList.add('hidden');
    if (!text) return;
    const target = type === 'info' ? infoEl : errEl;
    target.textContent = text;
    target.classList.remove('hidden');
  },

  _busy(on, label) {
    const b = document.getElementById('auth-submit');
    if (!b) return;
    b.disabled = on;
    b.textContent = on ? 'Bitte warten…' : label;
  },

  async doLogin() {
    const email = (document.getElementById('auth-email').value || '').trim();
    const pass = document.getElementById('auth-pass').value || '';
    if (!email || !pass) return this._authMsg('Bitte E-Mail und Passwort eingeben.');
    this._authMsg('');
    this._busy(true, 'Anmelden');
    try {
      const { data, error } = await Data.client.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      Data.user = data.user;
      await Data.pullAll();
      if (!DB.onboardingDone) DB.onboardingDone = !!lsGet('ep_onboarding');
      if (!DB.onboardingDone) this.showOnboarding();
      else this.enterApp();
    } catch (e) {
      this._busy(false, 'Anmelden');
      this._authMsg(this._friendlyError(e));
    }
  },

  async doRegister() {
    const email = (document.getElementById('auth-email').value || '').trim();
    const pass = document.getElementById('auth-pass').value || '';
    if (!email || !pass) return this._authMsg('Bitte E-Mail und Passwort eingeben.');
    if (pass.length < 6) return this._authMsg('Das Passwort muss mindestens 6 Zeichen haben.');
    this._authMsg('');
    this._busy(true, 'Registrieren');
    try {
      const { data, error } = await Data.client.auth.signUp({ email, password: pass });
      if (error) throw error;
      if (data.session) {
        // E-Mail-Bestätigung im Projekt deaktiviert -> direkt rein
        Data.user = data.user;
        await Data.pullAll();
        this.showOnboarding();
      } else {
        // Bestätigungs-Mail wurde verschickt
        this._busy(false, 'Registrieren');
        this._authMsg('Fast geschafft! Bitte bestätige den Link in deiner E-Mail und melde dich dann an.', 'info');
      }
    } catch (e) {
      this._busy(false, 'Registrieren');
      this._authMsg(this._friendlyError(e));
    }
  },

  _friendlyError(e) {
    const m = (e && e.message || '').toLowerCase();
    if (m.includes('invalid login')) return 'E-Mail oder Passwort ist falsch.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'Diese E-Mail ist bereits registriert.';
    if (m.includes('email not confirmed')) return 'Bitte bestätige zuerst den Link in deiner E-Mail.';
    if (m.includes('rate limit')) return 'Zu viele Versuche – bitte kurz warten.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'Keine Verbindung zum Server. Sind die Supabase-Daten korrekt?';
    return e && e.message ? e.message : 'Unbekannter Fehler.';
  },

  async signOut() {
    // Ausstehende Änderungen vor dem Abmelden synchronisieren
    if (Data.client && Data.user) {
      try { await Data.flushQueue(); } catch {}
    }
    if (Data.client) { try { await Data.client.auth.signOut(); } catch {} }
    Data.user = null;
    this.showLogin();
  },

  /* ============================================================
     3) ONBOARDING (4 Schritte, alles überspringbar)
     ============================================================ */
  _obStep: 1,
  _obDraft: null,

  showOnboarding() {
    this._obStep = 1;
    this._obDraft = JSON.parse(JSON.stringify(DB.settings || defaultSettings()));
    this._renderOnboarding();
  },

  _renderOnboarding() {
    const s = this._obDraft;
    const steps = {
      1: `<h2 class="ob-title">Wo kaufst du ein?</h2>
          <p class="ob-text">Damit Preisvergleich und Fahrkostenrechner funktionieren.</p>
          <div class="form-row"><label>Wohnort (Haupteinkauf)</label>
            <input id="ob-city" type="text" value="${esc(s.city)}" placeholder="z. B. Winterthur, Schweiz"></div>
          <div class="form-row"><label>Vergleichsort (günstiger Großeinkauf, optional)</label>
            <input id="ob-decity" type="text" value="${esc(s.deCity)}" placeholder="z. B. Konstanz, Deutschland"></div>
          <button class="btn btn-sm w-full" onclick="Auth.obDetectComparison()">🔍 Vergleichsort automatisch finden</button>
          <div id="ob-detect" class="mt-1"></div>`,
      2: `<h2 class="ob-title">Deine Ziele</h2>
          <p class="ob-text">Die App passt Vorschläge und den Plan daran an.</p>
          <div class="form-row"><label>Ernährungsweise</label>
            <select id="ob-diet">
              <option value="vegetarian" ${s.diet === 'vegetarian' ? 'selected' : ''}>🥦 Vegetarisch</option>
              <option value="vegan" ${s.diet === 'vegan' ? 'selected' : ''}>🌱 Vegan</option>
              <option value="omnivore" ${s.diet === 'omnivore' ? 'selected' : ''}>🍽️ Omnivor (alles)</option>
            </select></div>
          <div class="form-grid">
            <div class="form-row"><label>Protein-Ziel (g/Tag)</label>
              <input id="ob-protein" type="number" value="${s.proteinGoal}"></div>
            <div class="form-row"><label>Kalorien-Ziel (kcal/Tag)</label>
              <input id="ob-kcal" type="number" value="${s.kcalGoal}"></div>
          </div>`,
      3: `<h2 class="ob-title">Allergien & Unverträglichkeiten</h2>
          <p class="ob-text">Markierte Zutaten werden in Vorschlägen vermieden.</p>
          <div id="ob-allergies" class="ob-chips">
            ${['Gluten', 'Laktose', 'Nüsse', 'Erdnüsse', 'Soja', 'Eier', 'Sesam', 'Senf']
              .map(a => `<span class="ob-chip ${(s.allergies || []).includes(a) ? 'on' : ''}"
                          onclick="this.classList.toggle('on')">${a}</span>`).join('')}
          </div>`,
      4: `<h2 class="ob-title">Meal Prep</h2>
          <p class="ob-text">Wie kochst du am liebsten? Steuert die Plan-Generierung.</p>
          <div class="form-grid">
            <div class="form-row"><label>Koch-Tage pro Woche</label>
              <input id="ob-cookdays" type="number" min="1" max="7" value="${s.cookDays}"></div>
            <div class="form-row"><label>Portionen pro Koch-Session</label>
              <input id="ob-portions" type="number" min="1" max="7" value="${s.portionsPerSession}"></div>
          </div>
          <div class="form-row"><label>Max. Supermärkte pro Einkauf</label>
            <input id="ob-stores" type="number" min="1" max="5" value="${s.maxStores}"></div>`,
    };

    this.screen(`
      <div class="auth-wrap">
        <div class="auth-card auth-card-wide">
          <div class="ob-progress">
            ${[1, 2, 3, 4].map(n => `<span class="ob-dot ${n <= this._obStep ? 'on' : ''}"></span>`).join('')}
          </div>
          <div class="ob-body">${steps[this._obStep]}</div>
          <div class="ob-actions">
            <button class="btn" onclick="Auth.onboardingSkip()">
              ${this._obStep === 4 ? 'Überspringen' : 'Schritt überspringen'}
            </button>
            <button class="btn btn-primary" onclick="Auth.onboardingNext()">
              ${this._obStep === 4 ? 'Fertig & los' : 'Weiter'}
            </button>
          </div>
          <p class="auth-switch" style="margin-top:10px">Schritt ${this._obStep} von 4 · alles später änderbar</p>
        </div>
      </div>`);
  },

  /* Vergleichsort beim Onboarding automatisch suchen (nur Grenznähe) */
  async obDetectComparison() {
    const out = document.getElementById('ob-detect');
    const cityEl = document.getElementById('ob-city');
    if (!cityEl || !cityEl.value.trim()) {
      out.innerHTML = '<div class="auth-error">Bitte zuerst den Wohnort eingeben.</div>';
      return;
    }
    out.innerHTML = '<p class="auth-hint">Suche läuft…</p>';
    try {
      const home = await geocodeFull(cityEl.value.trim());
      if (!home || !home.cc) throw new Error('Wohnort nicht gefunden.');
      this._obDraft.homeCC = home.cc;
      const deals = BORDER_DEALS[home.cc];
      if (!deals) {
        const ci = countryInfo(home.cc);
        out.innerHTML = `<div class="auth-info">Für ${ci.flag} ${esc(ci.name)} gibt es keinen typischen Grenz-Einkaufsort. Trag den Vergleichsort von Hand ein – oder lass das Feld leer.</div>`;
        return;
      }
      let best = null;
      deals.forEach((d) => d.cities.forEach((c) => {
        const dist = haversineKm(home, c);
        if (!best || dist < best.dist) best = { dist, city: c, cc: d.country };
      }));
      if (!best || best.dist > 90) {
        out.innerHTML = '<div class="auth-info">Kein günstigerer Ort in Fahrnähe gefunden. Du kannst einen Vergleichsort manuell eintragen.</div>';
        return;
      }
      document.getElementById('ob-decity').value = best.city.name;
      this._obDraft.deCity = best.city.name;
      this._obDraft.compCC = best.cc;
      const ci = countryInfo(best.cc);
      out.innerHTML = `<div class="auth-info">Gefunden: ${ci.flag} ${esc(best.city.name)} (~${Math.round(best.dist)} km). Du kannst es im Feld oben noch ändern.</div>`;
    } catch (e) {
      out.innerHTML = `<div class="auth-error">${esc(e.message)}</div>`;
    }
  },

  _collectOnboardingStep() {
    const s = this._obDraft;
    const g = (id) => document.getElementById(id);
    if (this._obStep === 1) {
      if (g('ob-city')) s.city = g('ob-city').value.trim() || s.city;
      if (g('ob-decity')) s.deCity = g('ob-decity').value.trim();
    } else if (this._obStep === 2) {
      if (g('ob-diet')) s.diet = g('ob-diet').value;
      if (g('ob-protein')) s.proteinGoal = +g('ob-protein').value || s.proteinGoal;
      if (g('ob-kcal')) s.kcalGoal = +g('ob-kcal').value || s.kcalGoal;
    } else if (this._obStep === 3) {
      const chips = document.querySelectorAll('#ob-allergies .ob-chip.on');
      s.allergies = Array.from(chips).map(c => c.textContent.trim());
    } else if (this._obStep === 4) {
      if (g('ob-cookdays')) s.cookDays = +g('ob-cookdays').value || s.cookDays;
      if (g('ob-portions')) s.portionsPerSession = +g('ob-portions').value || s.portionsPerSession;
      if (g('ob-stores')) s.maxStores = +g('ob-stores').value || s.maxStores;
    }
  },

  onboardingNext() {
    this._collectOnboardingStep();
    if (this._obStep < 4) { this._obStep++; this._renderOnboarding(); }
    else this.finishOnboarding();
  },

  onboardingSkip() {
    if (this._obStep < 4) { this._obStep++; this._renderOnboarding(); }
    else this.finishOnboarding();
  },

  async finishOnboarding() {
    DB.settings = Object.assign(DB.settings, this._obDraft);
    DB.onboardingDone = true;
    await Data.persistSettings();
    this.enterApp();
  },

  /* ============================================================
     4) IN DIE APP WECHSELN
     ============================================================ */
  enterApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    if (window.initApp) initApp();
  },
};

/* kleine HTML-Escape-Hilfe (auch in app.js vorhanden – hier als Fallback) */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
