/* ============================================================
   ESSENSPLANER – Offline & PWA
   Service-Worker-Registrierung + Online/Offline-Erkennung.
   Bei Reconnect wird die Offline-Queue automatisch nachgereicht.
   ============================================================ */

/* ---------- Service Worker registrieren ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => {
        // Auf neue Version pruefen – Nutzer wird nicht ausgeloggt
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              if (window.toast) toast('Update verfügbar – beim nächsten Start aktiv.');
            }
          });
        });
      })
      .catch((e) => console.warn('Service Worker nicht registriert:', e));
  });
}

/* ---------- Online / Offline ---------- */
function updateOnlineStatus() {
  const online = navigator.onLine;
  const badge = document.getElementById('net-badge');
  if (badge) {
    badge.textContent = online ? '● Online' : '● Offline';
    badge.className = 'badge ' + (online ? 'badge-green' : 'badge-red');
    badge.title = online ? 'Mit dem Internet verbunden' : 'Offline – Änderungen werden später synchronisiert';
  }
  if (online && window.Data) {
    Data.flushQueue().then(() => updateSyncBadge());
  }
}

/* ---------- Badge fuer ausstehende Offline-Aenderungen ---------- */
function updateSyncBadge() {
  const b = document.getElementById('sync-badge');
  if (!b || !window.Data) return;
  const n = Data.getQueue().length;
  if (n > 0) {
    b.textContent = '⟳ ' + n + ' nicht synchron';
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
