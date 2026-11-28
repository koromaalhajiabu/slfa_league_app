// SLFA League App service worker.
// 1. Keeps the app shell available offline (pages, scripts, styles, images).
// 2. Shows league alerts sent as push messages.
// League data always comes from the network, so scores and news are never stale.
const CACHE = 'slfa-app-v322';
// Saved copies of public league data, so fans can still read the last information when offline
const DATA_CACHE = CACHE + '-data';
const PUBLIC_TABLES = ['matches', 'league_standings', 'season_standings', 'league_clubs', 'club_squad', 'media_posts', 'leagues', 'match_events', 'match_lineups', 'club_announcements', 'top_scorers', 'top_assists', 'clean_sheets', 'motm_awards', 'competition_rules', 'seasons', 'slfa_publications', 'league_division_settings', 'league_movement_records'];
const SHELL = [
  "./",
  "./index.html",
  "./config.js",
  "./i18n.js?v=30",
  "./sw-update.js?v=5",
  "./match-minute-format.js?v=1",
  "./public.js?v=94",
  "./match-centre.js?v=93",
  "./match-centre.css?v=9",
  "./league-pages.js?v=82",
  "./league-pages.css?v=7",
  "./home-dashboard.js?v=7",
  "./home-dashboard.css?v=4",
  "./football-intelligence.js?v=1",
  "./football-intelligence.css?v=1",
  "./premium-media.js?v=7",
  "./premium-media.css?v=3",
  "./player-profile.js?v=6",
  "./player-profile.css?v=5",
  "./player-directory.js?v=6",
  "./player-directory.css?v=2",
  "./cosmic-theme.js?v=18",
  "./cosmic-theme.css?v=14",
  "./competition-history.js?v=1",
  "./competition-history.css?v=1",
  "./publications-public.js?v=2",
  "./publications.css?v=1",
  "./player-stats.css",
  "./matchday-premium.css?v=3",
  "./news-centre.css",
  "./styles.css?v=9",
  "./my-club.css?v=1",
  "./buttons-compact.css?v=10",
  "./premium-theme.css?v=64",
  "./flag-mobile.css?v=17",
  "./public-contrast.css?v=1",
  "./light-theme.css?v=12",
  "./contrast-accessibility.css?v=2",
  "./button-motion.css?v=1",
  "./button-system.css?v=1",
  "./portal-visibility-fix.css?v=6",
  "./workspace-shell.css?v=2",
  "./workspace-shell.js?v=2",
  "./help.html",
  "./privacy.html",
  "./my-data.html",
  "./voter-key.js?v=1",
  "./manifest.json",
  "./slfa-logo.png?v=1",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./league-logos/leone-rock-premier-league.jpg",
  "./league-logos/marampa-mines-womens-premier-league.jpg"
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
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(DATA_CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.open(DATA_CACHE).then(function (c) { return c.match(req); }).then(function (hit) { return hit || Response.error(); });
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
