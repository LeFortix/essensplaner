/* ============================================================
   ESSENSPLANER – Konfiguration
   ------------------------------------------------------------
   WICHTIG: Hier stehen NIEMALS echte API-Keys.
   Die Supabase-Keys werden beim ersten App-Start vom Nutzer im
   Setup-Screen eingegeben und ausschliesslich im localStorage
   des Browsers gespeichert – lokal auf dem Geraet, nie im Code.
   ============================================================ */
window.EP = {
  // Vom Nutzer beim Setup eingetragen (localStorage):
  SUPABASE_URL:       localStorage.getItem('ep_supabase_url') || '',
  SUPABASE_ANON_KEY:  localStorage.getItem('ep_supabase_key') || '',

  // Oeffentliche API-Endpunkte (keine Keys noetig):
  SPOONACULAR_BASE:   'https://api.spoonacular.com',
  NOMINATIM_BASE:     'https://nominatim.openstreetmap.org',
  OPENFOODFACTS_BASE: 'https://world.openfoodfacts.org/cgi/search.pl',

  // localStorage-Schluessel:
  OFFLINE_QUEUE_KEY:  'ep_offline_queue',
  USER_CACHE_KEY:     'ep_user',
  SETUP_DONE_KEY:     'ep_setup_done',

  // Standardwerte Fahrkostenrechner:
  DEFAULT_FUEL_PRICE:       1.90,  // EUR / Liter
  DEFAULT_FUEL_CONSUMPTION: 7,     // Liter / 100 km

  APP_VERSION: '1.0.0',
};

/* true, wenn der Nutzer im Setup gueltige Supabase-Daten hinterlegt hat */
EP.hasSupabaseConfig = function () {
  return !!(EP.SUPABASE_URL && EP.SUPABASE_ANON_KEY);
};
