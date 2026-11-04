// SLFA League App service worker.
// 1. Keeps the app shell available offline (pages, scripts, styles, images).
// 2. Shows league alerts sent as push messages.
// League data always comes from the network, so scores and news are never stale.
const CACHE = 'slfa-app-v39';
// Saved copies of public league data, so fans can still read the last information when offline
const DATA_CACHE = CACHE + '-data';
const PUBLIC_TABLES = ['matches', 'league_standings', 'league_clubs', 'club_squad', 'media_posts', 'leagues', 'match_events', 'match_lineups', 'club_announcements', 'top_scorers', 'top_assists', 'clean_sheets', 'motm_awards', 'polls', 'poll_options'];
const SHELL = ['./', './index.html', './config.js', './public.js', './match-centre.js', './match-centre.css', './league-pages.js', './league-pages.css', './admin.js', './portal.js', './sw-update.js', './styles.css', './developer.html', './super-admin.html', './referee.html', './media.html', './disciplinary.html', './club.html', './manifest.json',
  './icon-192.png', './icon-512.png', './slfa-logo.png'];

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
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) { return hit || caches.match('./index.html'); });
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
