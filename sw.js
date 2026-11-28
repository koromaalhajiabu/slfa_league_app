// SLFA League App service worker.
// 1. Keeps the app shell available offline (pages, scripts, styles, images).
// 2. Shows league alerts sent as push messages.
// League data always comes from the network, so scores and news are never stale.
const CACHE = 'slfa-app-v332';
// Saved copies of public league data, so fans can still read the last information when offline
const DATA_CACHE = CACHE + '-data';
const PUBLIC_TABLES = ['matches', 'league_standings', 'season_standings', 'league_clubs', 'club_squad', 'media_posts', 'leagues', 'match_events', 'match_lineups', 'club_announcements', 'top_scorers', 'top_assists', 'clean_sheets', 'motm_awards', 'competition_rules', 'seasons', 'slfa_publications', 'league_division_settings', 'league_movement_records'];
const SHELL = [
  "./",
  "./index.html",
  "./config.js",
  "./i18n.js?v=32",
  "./sw-update.js?v=5",
  "./match-minute-format.js?v=1",
  "./public.js?v=94",
  "./match-centre.js?v=93",
  "./match-centre.css?v=9",
  "./styles.css?v=9",
  "./performance.css?v=1",
  "./premium-theme.css?v=64",
  "./flag-mobile.css?v=17",
  "./light-theme.css?v=12",
  "./contrast-accessibility.css?v=2",
  "./button-motion.css?v=1",
  "./button-system.css?v=1",
  "./buttons-compact.css?v=10",
  "./cosmic-theme.css?v=14",
  "./portal-visibility-fix.css?v=6",
  "./workspace-shell.css?v=2",
  "./manifest.json",
  "./slfa-logo.png?v=1",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== DATA_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Public league data from the database. Signed-in responses are never saved, so they cannot show on a shared phone.
function jwtRole(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role || ''; } catch (e) { return ''; }
}
function isPublicDataRequest(req) {
  var u = new URL(req.url);
  if (req.method !== 'GET' || u.hostname.slice(-'.supabase.co'.length) !== '.supabase.co' || u.pathname.indexOf('/rest/v1/') !== 0) return false;
  if (PUBLIC_TABLES.indexOf(u.pathname.slice('/rest/v1/'.length).split('/')[0]) === -1) return false;
  var auth = req.headers.get('Authorization') || '';
  if (auth && auth.indexOf('Bearer sb_publishable_') !== 0 && jwtRole(auth.replace(/^Bearer\s+/i, '')) !== 'anon') return false;
  return true;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  // Staff portals are deliberately network-only: never precache or retain their HTML on shared devices.
  var privatePath = /\/(team-official|match-data-operator)\.html$/.test(new URL(req.url).pathname);
  if (privatePath && req.method === 'GET' && new URL(req.url).origin === self.location.origin) {
    e.respondWith(fetch(req).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  if (isPublicDataRequest(req)) {
    // Stale-while-revalidate: show the last public snapshot immediately, then
    // refresh the cache in the background. Only anonymous public GET requests
    // are eligible; authenticated/private responses are never cached here.
    var cachePromise = caches.open(DATA_CACHE);
    var networkPromise = fetch(req).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        cachePromise.then(function (cache) { return cache.put(req, copy); });
      }
      return res;
    });
    e.waitUntil(networkPromise.then(function () {}, function () {}));
    e.respondWith(cachePromise.then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return networkPromise.catch(function () { return Response.error(); });
      });
    }));
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Public app assets are installed into the versioned shell cache. Serve them
  // from cache first so moving between tabs does not wait on GitHub Pages again.
  // A new deployment installs a new cache version before it takes control.
  if (req.headers.has('range') || new URL(req.url).pathname.endsWith('/sw.js')) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); cache.put(req, copy); }
        return res;
      });
    });
  }).catch(function () {
    return caches.open(CACHE).then(function (cache) {
      return cache.match('./index.html').then(function (hit) { return hit || Response.error(); });
    });
  }));
});

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'The SLFA League App', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'The SLFA League App', {
    body: data.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: data.url || './' }
  }));
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || './'));
});
