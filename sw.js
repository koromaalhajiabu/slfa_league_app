// SLFA League App - Performance-Optimised Service Worker
// App files load from cache immediately.
// New versions are downloaded in the background.
// Supabase league data stays network-first with offline fallback.

const CACHE = 'slfa-app-v37';
const DATA_CACHE = CACHE + '-data';

const PUBLIC_TABLES = [
  'matches',
  'league_standings',
  'league_clubs',
  'club_squad',
  'media_posts',
  'leagues',
  'match_events',
  'match_lineups',
  'club_announcements',
  'top_scorers',
  'top_assists',
  'clean_sheets',
  'motm_awards',
  'polls',
  'poll_options'
];

const SHELL = [
  './',
  './index.html',
  './config.js',
  './public.js',
  './enhancements.js',
  './admin.js',
  './portal.js',
  './sw-update.js',
  './styles.css',
  './developer.html',
  './super-admin.html',
  './referee.html',
  './media.html',
  './disciplinary.html',
  './club.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './slfa-logo.png'
];

// Install and prepare the new app cache.
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

// Remove old app caches and activate the new version.
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE && key !== DATA_CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// Identify public, anonymous Supabase data requests.
function jwtRole(token) {
  try {
    return JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    ).role || '';
  } catch (error) {
    return '';
  }
}

function isPublicDataRequest(request) {
  var url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    !url.hostname.endsWith('.supabase.co') ||
    url.pathname.indexOf('/rest/v1/') !== 0
  ) {
    return false;
  }

  var table = url.pathname
    .slice('/rest/v1/'.length)
    .split('/')[0];

  if (PUBLIC_TABLES.indexOf(table) === -1) {
    return false;
  }

  var auth = request.headers.get('Authorization') || '';

  if (
    auth &&
    auth.indexOf('Bearer sb_publishable_') !== 0 &&
    jwtRole(auth.replace(/^Bearer\s+/i, '')) !== 'anon'
  ) {
    return false;
  }

  return true;
}

// Handle app files and public data.
self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Public league data: network first, cached fallback.
  if (isPublicDataRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response.ok) {
            var copy = response.clone();

            event.waitUntil(
              caches.open(DATA_CACHE).then(function (cache) {
                return cache.put(request, copy);
              })
            );
          }

          return response;
        })
        .catch(function () {
          return caches.open(DATA_CACHE)
            .then(function (cache) {
              return cache.match(request);
            })
            .then(function (cached) {
              return cached || Response.error();
            });
        })
    );

    return;
  }

  // Only handle files belonging to this app. Always ask the network for
  // the newest shell first; use the saved copy only when the device is offline.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          return caches.open(CACHE)
            .then(function (cache) {
              return cache.put(request, copy);
            })
            .then(function () {
              return response;
            });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request)
          .then(function (cached) {
            if (cached) return cached;
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return Response.error();
          });
      })
  );
});

// League notification support.
self.addEventListener('push', function (event) {
  var data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: 'The SLFA League App',
      body: event.data ? event.data.text() : ''
    };
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'The SLFA League App',
      {
        body: data.body || '',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        data: {
          url: data.url || './'
        }
      }
    )
  );
});

// Open the correct page when a notification is tapped.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(
      event.notification.data.url || './'
    )
  );
});
