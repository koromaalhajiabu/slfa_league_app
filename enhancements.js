
/* =========================================================
   SLFA LEAGUE APP — PREMIUM INTERACTIVE ENHANCEMENTS
   Designed by Alhaji Abu Koroma

   Features:
   1. Interactive Live Match Centre
   2. Smart Search: clubs, players and matches
   3. Favourite Clubs: saved locally on the device
   4. Premium animations and touch feedback

   Does not modify database records, authentication or roles.
========================================================= */

(function () {
  'use strict';

  var db = window.slfaDb;

  if (!db) {
    console.warn('SLFA: Database client not ready.');
    return;
  }

  var $ = function (id) {
    return document.getElementById(id);
  };

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(
      /[&<>"']/g,
      function (c) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[c];
      }
    );
  }

  var STORAGE_KEY = 'slfa_favourite_clubs_v1';

  var favourites = [];
  var clubs = [];
  var squad = [];
  var matches = [];

  var searchTimer = null;
  var searchRequest = 0;

  try {
    favourites = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '[]'
    );
  } catch (e) {
    favourites = [];
  }

  if (!Array.isArray(favourites)) {
    favourites = [];
  }

  favourites = favourites.map(String);

  /* =========================================================
     PREMIUM STYLES
  ========================================================= */

  function installStyles() {
    if ($('slfaEnhancementStyles')) return;

    var style = document.createElement('style');

    style.id = 'slfaEnhancementStyles';

    style.textContent = `
      .slfa-tools {
        display:grid;
        grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);
        gap:14px;
        margin:16px 0;
      }

      .slfa-search-wrap,
      .slfa-favs,
      .slfa-live-summary {
        background:linear-gradient(
          135deg,
          #102b45,
          #071a2d
        );
        border:1px solid rgba(255,255,255,.1);
        border-radius:17px;
        padding:15px;
        color:#fff;
        box-shadow:0 8px 25px rgba(0,0,0,.13);
      }

      .slfa-search-wrap label {
        display:block;
        color:#c5d1dd;
        font-size:12px;
        font-weight:700;
        letter-spacing:1px;
        margin-bottom:9px;
      }

      .slfa-search {
        width:100%;
        box-sizing:border-box;
        padding:14px;
        border-radius:12px;
        border:1px solid #52677b;
        background:#071827;
        color:#fff;
        font-size:14px;
        outline:none;
      }

      .slfa-search:focus {
        border-color:#e0b95d;
        box-shadow:0 0 0 3px rgba(224,185,93,.15);
      }

      .slfa-search-results,
      .slfa-favs-list {
        display:grid;
        gap:8px;
        margin-top:11px;
      }

      .slfa-result {
        display:flex;
        justify-content:space-between;
        align-items:center;
        width:100%;
        gap:10px;
        padding:11px;
        color:#fff;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.09);
        border-radius:11px;
        text-align:left;
        cursor:pointer;
        transition:.2s ease;
      }

      .slfa-result:hover {
        background:rgba(255,255,255,.12);
        transform:translateY(-2px);
      }

      .slfa-result small {
        display:block;
        color:#aebdcb;
        margin-top:4px;
      }

      .slfa-favs-head,
      .slfa-live-head {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:8px;
      }

      .slfa-favs-list {
        display:flex;
        flex-wrap:wrap;
      }

      .slfa-fav-chip {
        border:1px solid rgba(224,185,93,.4);
        border-radius:30px;
        padding:8px 12px;
        background:rgba(224,185,93,.12);
        color:#f4d58c;
        cursor:pointer;
      }

      .slfa-fav-btn {
        margin-left:auto;
        border:1px solid rgba(224,185,93,.4);
        border-radius:30px;
        padding:6px 10px;
        background:rgba(224,185,93,.1);
        color:#f4d58c;
        cursor:pointer;
        white-space:nowrap;
      }

      .slfa-live-summary {
        margin-bottom:12px;
      }

      .slfa-live-dot {
        display:inline-block;
        width:9px;
        height:9px;
        background:#ef5350;
        border-radius:50%;
        margin-right:8px;
        animation:slfaPulse 1.5s infinite;
      }

      .slfa-empty {
        color:#aebdcb;
        font-size:13px;
        padding:9px 0;
      }

      .match,
      .team,
      .post {
        animation:slfaEnter .3s ease both;
      }

      .slfa-result:active,
      .slfa-fav-btn:active,
      .slfa-fav-chip:active {
        transform:scale(.97);
      }

      @keyframes slfaPulse {
        50% {
          opacity:.35;
          box-shadow:0 0 0 7px rgba(239,83,80,0);
        }
      }

      @keyframes slfaEnter {
        from {
          opacity:0;
          transform:translateY(8px);
        }
        to {
          opacity:1;
          transform:translateY(0);
        }
      }

      @media(max-width:700px) {
        .slfa-tools {
          grid-template-columns:1fr;
        }
      }

      @media(prefers-reduced-motion:reduce) {
        .match,.team,.post {
          animation:none !important;
        }
        * {
          transition:none !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /* =========================================================
     FAVOURITE CLUBS
  ========================================================= */

  function isFavourite(name) {
    return favourites.indexOf(String(name)) !== -1;
  }

  function saveFavourites() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(favourites)
      );
    } catch (e) {}

    renderFavourites();
    decorateTeams();
  }

  function toggleFavourite(name) {
    name = String(name || '');

    if (!name) return;

    if (isFavourite(name)) {
      favourites = favourites.filter(function (x) {
        return x !== name;
      });
    } else {
      favourites.push(name);
    }

    saveFavourites();
  }

  function openClub(name) {
    goTab('teams');

    var elements = document.querySelectorAll('[data-club]');

    Array.prototype.forEach.call(elements, function (el) {
      if (el.dataset.name === name) {
        el.click();
      }
    });
  }

  function decorateTeams() {
    document.querySelectorAll('.team[data-club]').forEach(function (el) {
      var name = el.dataset.name;

      if (!name) return;

      var button = el.querySelector('.slfa-fav-btn');

      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'slfa-fav-btn';

        button.addEventListener('click', function (e) {
          e.stopPropagation();
          toggleFavourite(name);
        });

        el.appendChild(button);
      }

      button.textContent = isFavourite(name)
        ? '★ Saved'
        : '☆ Follow';

      button.setAttribute(
        'aria-label',
        isFavourite(name)
          ? 'Remove from favourites'
          : 'Add to favourites'
      );
    });
  }

  function renderFavourites() {
    var list = $('slfaFavsList');
    var count = $('slfaFavCount');
    var panel = $('slfaFavMatches');

    if (!list || !count || !panel) return;

    count.textContent = favourites.length + ' saved';

    if (!favourites.length) {
      list.innerHTML =
        '<span class="slfa-empty">Follow clubs to save them here.</span>';

      panel.textContent =
        'Your favourite club fixtures will appear here.';

      return;
    }

    list.innerHTML = favourites.map(function (name) {
      return (
        '<button class="slfa-fav-chip" type="button" data-fav="' +
        escapeHTML(name) +
        '">★ ' +
        escapeHTML(name) +
        ' ×</button>'
      );
    }).join('');

    list.querySelectorAll('[data-fav]').forEach(function (button) {
      button.addEventListener('click', function () {
        var name = button.dataset.fav;
        openClub(name);
      });

      button.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        toggleFavourite(button.dataset.fav);
      });
    });

    var rows = matches.filter(function (m) {
      return favourites.indexOf(String(m.home_team)) !== -1 ||
        favourites.indexOf(String(m.away_team)) !== -1;
    }).slice(0, 8);

    if (!rows.length) {
      panel.innerHTML =
        '<div class="slfa-empty">No fixtures found for your favourite clubs yet.</div>';
      return;
    }

    panel.innerHTML = rows.map(function (m) {
      var score = m.home_score == null
        ? 'vs'
        : m.home_score + ' – ' + (m.away_score == null ? 0 : m.away_score);

      return (
        '<div class="slfa-result">' +
        '<span><b>' +
        escapeHTML(m.home_team) +
        ' ' + escapeHTML(score) + ' ' +
        escapeHTML(m.away_team) +
        '</b><small>' +
        escapeHTML(m.match_status || m.match_date || 'Fixture') +
        '</small></span></div>'
      );
    }).join('');
  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  function goTab(tab) {
    var button = document.querySelector('[data-tab="' + tab + '"]');

    if (button) button.click();
  }

  /* =========================================================
     SMART SEARCH
  ========================================================= */

  function buildSearch() {
    if ($('slfaTools')) return;

    var anchor = $('leagueSwitch');

    if (!anchor) return;

    var wrapper = document.createElement('section');

    wrapper.id = 'slfaTools';
    wrapper.className = 'slfa-tools';

    wrapper.innerHTML = `
      <div class="slfa-search-wrap">
        <label for="slfaSearch">SMART LEAGUE SEARCH</label>
        <input
          id="slfaSearch"
          class="slfa-search"
          type="search"
          placeholder="Search clubs, players and matches..."
          autocomplete="off"
        >
        <div
          id="slfaSearchResults"
          class="slfa-search-results"
          aria-live="polite"
        ></div>
      </div>

      <div class="slfa-favs">
        <div class="slfa-favs-head">
          <strong>★ Favourite Clubs</strong>
          <span id="slfaFavCount">0 saved</span>
        </div>

        <div id="slfaFavsList" class="slfa-favs-list"></div>

        <div id="slfaFavMatches" class="slfa-empty">
          Your favourite club fixtures will appear here.
        </div>
      </div>
    `;

    anchor.insertAdjacentElement('afterend', wrapper);

    $('slfaSearch').addEventListener('input', function () {
      clearTimeout(searchTimer);

      var q = this.value.trim();

      if (q.length < 2) {
        $('slfaSearchResults').innerHTML = '';
        return;
      }

      $('slfaSearchResults').innerHTML =
        '<div class="slfa-empty">Searching...</div>';

      searchTimer = setTimeout(function () {
        search(q);
      }, 300);
    });

    renderFavourites();
  }

  function search(q) {
    var request = ++searchRequest;
    var needle = q.toLowerCase();

    Promise.all([
      db.from('league_clubs')
        .select('id, club_name')
        .eq('is_active', true)
        .limit(300),

      db.from('club_squad')
        .select('id, player_name, club_id, jersey_number, position')
        .limit(500),

      db.from('matches')
        .select('id, match_date, match_status, home_team, away_team, home_score, away_score')
        .order('match_date', { ascending: false })
        .limit(300)
    ]).then(function (results) {
      if (request !== searchRequest) return;

      if (results.some(function (r) { return r.error; })) {
        $('slfaSearchResults').textContent =
          'Some search results are temporarily unavailable.';
        return;
      }

      clubs = results[0].data || [];
      squad = results[1].data || [];
      matches = results[2].data || [];

      var clubById = {};

      clubs.forEach(function (c) {
        clubById[String(c.id)] = c.club_name;
      });

      var output = [];

      clubs.filter(function (c) {
        return String(c.club_name || '').toLowerCase().includes(needle);
      }).slice(0, 5).forEach(function (c) {
        output.push({
          type: 'Club',
          title: c.club_name,
          subtitle: 'Open club profile',
          club: c.club_name
        });
      });

      squad.filter(function (p) {
        return String(p.player_name || '').toLowerCase().includes(needle);
      }).slice(0, 6).forEach(function (p) {
        var clubName = clubById[String(p.club_id)] || '';

        output.push({
          type: 'Player',
          title: p.player_name,
          subtitle: clubName +
            (p.jersey_number ? ' · #' + p.jersey_number : '') +
            (p.position ? ' · ' + p.position : ''),
          club: clubName
        });
      });

      matches.filter(function (m) {
        return (
          String(m.home_team || '') + ' ' +
          String(m.away_team || '')
        ).toLowerCase().includes(needle);
      }).slice(0, 8).forEach(function (m) {
        output.push({
          type: 'Match',
          title: m.home_team + ' vs ' + m.away_team,
          subtitle:
            (m.home_score == null
              ? 'Fixture'
              : m.home_score + ' – ' + m.away_score) +
            ' · ' + (m.match_status || m.match_date || ''),
          match: m.id
        });
      });

      var box = $('slfaSearchResults');

      if (!box) return;

      if (!output.length) {
        box.innerHTML =
          '<div class="slfa-empty">No matching clubs, players or matches found.</div>';
        return;
      }

      box.innerHTML = output.map(function (r, i) {
        return (
          '<button type="button" class="slfa-result" data-search-result="' +
          i +
          '">' +
          '<span><b>' + escapeHTML(r.title) +
          '</b><small>' + escapeHTML(r.type + ' · ' + r.subtitle) +
          '</small></span><span>›</span></button>'
        );
      }).join('');

      box.querySelectorAll('[data-search-result]').forEach(function (button) {
        button.addEventListener('click', function () {
          var result = output[Number(button.dataset.searchResult)];

          if (result.type === 'Club' || result.type === 'Player') {
            if (result.club) openClub(result.club);
          }

          if (result.type === 'Match') {
            goTab('matches');

            var match = document.querySelector(
              '[data-match="' + result.match + '"]'
            );

            if (match) {
              match.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });

              match.click();
            }
          }

          $('slfaSearch').value = '';
          box.innerHTML = '';
        });
      });

      renderFavourites();
    }).catch(function () {
      if ($('slfaSearchResults')) {
        $('slfaSearchResults').textContent =
          'Search is temporarily unavailable.';
      }
    });
  }

  /* =========================================================
     LIVE MATCH CENTRE
  ========================================================= */

  function buildLiveCentre() {
    var live = $('liveList');

    if (!live || $('slfaLiveSummary')) return;

    var summary = document.createElement('div');

    summary.id = 'slfaLiveSummary';
    summary.className = 'slfa-live-summary';

    summary.innerHTML = `
      <div class="slfa-live-head">
        <strong><span class="slfa-live-dot"></span>LIVE MATCH CENTRE</strong>
        <span id="slfaLiveCount">Updating...</span>
      </div>
      <small>Follow live match updates from the league.</small>
    `;

    live.insertBefore(summary, live.firstChild);

    var observer = new MutationObserver(function () {
      updateLiveCount();
    });

    observer.observe(live, {
      childList: true,
      subtree: true
    });

    updateLiveCount();
  }

  function updateLiveCount() {
    var live = $('liveList');
    var count = $('slfaLiveCount');

    if (!live || !count) return;

    var cards = live.querySelectorAll('.match');

    count.textContent =
      cards.length + (cards.length === 1 ? ' live match' : ' live matches');
  }

  /* =========================================================
     MATCH DATA
  ========================================================= */

  function refreshMatches() {
    db.from('matches')
      .select('id, match_date, match_status, home_team, away_team, home_score, away_score')
      .order('match_date', { ascending: false })
      .limit(300)
      .then(function (result) {
        if (result.error) return;

        matches = result.data || [];
        renderFavourites();
      });
  }

  /* =========================================================
     OBSERVE DYNAMIC CONTENT
  ========================================================= */

  function observePublicUI() {
    var root = $('public');

    if (!root) return;

    var observer = new MutationObserver(function () {
      decorateTeams();
      buildLiveCentre();
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    decorateTeams();
    buildLiveCentre();
  }

  /* =========================================================
     START
  ========================================================= */

  function start() {
    installStyles();
    buildSearch();
    observePublicUI();
    refreshMatches();

    window.addEventListener('online', refreshMatches);

    // Keep favourite fixtures reasonably fresh.
    window.setInterval(refreshMatches, 180000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
