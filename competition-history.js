/* SLFA Competition Regulations, Season Archive and Football Records Centre.
   Public, read-only presentation. Uses existing published Supabase records only. */
(function () {
  'use strict';
  var db = window.slfaDb;
  var nav = document.querySelector('.tabs');
  var pub = document.getElementById('public');
  if (!db || !nav || !pub) return;

  var host = document.createElement('section');
  host.id = 'slfaRecordsRules';
  host.className = 'view card slfa-rr';
  host.setAttribute('data-view', 'records-rules');
  host.setAttribute('aria-label', 'Competition regulations, season archive and football records');
  host.hidden = true;
  pub.appendChild(host);

  var tab = document.createElement('button');
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('data-tab', 'records-rules');
  tab.setAttribute('aria-selected', 'false');
  tab.textContent = 'Records & Rules';
  nav.appendChild(tab);

  var seasons = [], leagues = [], clubs = [], rules = [];
  var currentStandings = [], historicalStandings = [], matches = [], goalEvents = [];
  var coreLoaded = false, coreLoading = null, matchesLoaded = false, matchesLoading = null;
  var matchesTruncated = false, eventsTruncated = false, sourceWarnings = [];
  var activeSection = 'rules';
  var archiveSeasonChoice = '', archiveLeagueChoice = '';
  var recordsSeasonChoice = '', recordsLeagueChoice = '';
  var archiveDerivedTables = {};
  var rulesNote = '';

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function number(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function formatDate(value) {
    if (!value) return 'Date to be confirmed';
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { timeZone: 'Africa/Freetown', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function formatDateTime(value) {
    if (!value) return 'Kick-off to be confirmed';
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', { timeZone: 'Africa/Freetown', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function seasonById(id) {
    return seasons.filter(function (s) { return String(s.id) === String(id); })[0] || null;
  }
  function leagueById(id) {
    return leagues.filter(function (l) { return String(l.id) === String(id); })[0] || null;
  }
  function currentSeason() {
    return seasons.filter(function (s) { return !!s.is_current; })[0] || null;
  }
  function selectedAppLeague() {
    try { return localStorage.getItem('slfa_league') || ''; } catch (e) { return ''; }
  }
  function seasonKey(match) {
    if (match.season_id != null) return String(match.season_id);
    var day = String(match.match_date || '').slice(0, 10);
    if (!day) return '';
    var found = seasons.filter(function (s) {
      return day >= String(s.start_date || '') && day <= String(s.end_date || '');
    }).sort(function (a, b) { return String(b.start_date).localeCompare(String(a.start_date)); })[0];
    return found ? String(found.id) : '';
  }
  function belongsToSeason(match, seasonId) {
    if (!seasonId) return true;
    return seasonKey(match) === String(seasonId);
  }
  function clubLeagueId(name) {
    var key = String(name || '').trim().toLowerCase();
    var c = clubs.filter(function (x) { return String(x.club_name || '').trim().toLowerCase() === key; })[0];
    return c && c.league_id != null ? String(c.league_id) : '';
  }
  function clubLeagueIdById(id) {
    if (id == null) return '';
    var c = clubs.filter(function (x) { return String(x.id) === String(id); })[0];
    return c && c.league_id != null ? String(c.league_id) : '';
  }
  function matchLeagueId(match) {
    if (match.league_id != null) return String(match.league_id);
    var homeById = clubLeagueIdById(match.home_club_id), awayById = clubLeagueIdById(match.away_club_id);
    if (homeById && homeById === awayById) return homeById;
    var home = clubLeagueId(match.home_team), away = clubLeagueId(match.away_team);
    return home && home === away ? home : '';
  }
  function belongsToLeague(match, leagueId) {
    return !leagueId || matchLeagueId(match) === String(leagueId);
  }
  function isFinished(match) {
    return String(match.match_status || '').toUpperCase() === 'FT' &&
      match.home_score != null && match.away_score != null &&
      Number.isFinite(Number(match.home_score)) && Number.isFinite(Number(match.away_score));
  }
  function isUpcoming(match) {
    return ['SCHEDULED', 'RESCHEDULED'].indexOf(String(match.match_status || '').toUpperCase()) !== -1;
  }
  function sortedMatches(rows, ascending) {
    return rows.slice().sort(function (a, b) {
      var delta = new Date(a.match_date || 0).getTime() - new Date(b.match_date || 0).getTime();
      return ascending ? delta : -delta;
    });
  }
  function optionsForLeagues(selected) {
    return '<option value="">All competitions</option>' + leagues.map(function (l) {
      return '<option value="' + esc(l.id) + '"' + (String(selected) === String(l.id) ? ' selected' : '') + '>' + esc(l.name) + (l.is_active ? '' : ' · Archived') + '</option>';
    }).join('');
  }
  function optionsForSeasons(selected, includeAll) {
    var html = includeAll ? '<option value="">All seasons</option>' : '';
    return html + seasons.slice().sort(function (a, b) {
      return String(b.start_date || '').localeCompare(String(a.start_date || ''));
    }).map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (String(selected) === String(s.id) ? ' selected' : '') + '>' +
        esc(s.name) + (s.is_current ? ' · Current' : '') + '</option>';
    }).join('');
  }
  function empty(message) {
    return '<div class="rr-empty"><strong>' + esc(message) + '</strong></div>';
  }
  function metric(label, value, detail) {
    return '<article class="rr-metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong>' +
      (detail ? '<small>' + esc(detail) + '</small>' : '') + '</article>';
  }
  function setStatus(id, message) {
    var el = $(id);
    if (el) el.textContent = message || '';
  }
  function showMainTab() {
    nav.querySelectorAll('[data-tab]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b === tab));
    });
    document.querySelectorAll('[data-view]').forEach(function (v) {
      v.hidden = v !== host;
    });
    host.hidden = false;
    if (window.slfaTrack) window.slfaTrack('tab_records-rules');
  }
  function switchSection(name) {
    activeSection = name;
    host.querySelectorAll('[data-rr-section]').forEach(function (section) {
      section.hidden = section.getAttribute('data-rr-section') !== name;
    });
    host.querySelectorAll('[data-rr-subtab]').forEach(function (button) {
      var on = button.getAttribute('data-rr-subtab') === name;
      button.setAttribute('aria-selected', String(on));
    });
    if (name === 'rules') ensureCore().then(renderRules);
    if (name === 'archive') ensureCore().then(ensureMatches).then(renderArchive).catch(showLoadError);
    if (name === 'records') ensureCore().then(ensureMatches).then(renderRecords).catch(showLoadError);
  }
  function showLoadError() {
    var box = $('rrLoadMessage');
    if (box) box.textContent = 'Some public records could not be loaded. Check the connection and use Refresh to try again.';
  }

  function pageThrough(table, columns, apply) {
    var all = [], offset = 0, pageSize = 1000, cap = 10000;
    function next() {
      var query = db.from(table).select(columns);
      if (apply) query = apply(query);
      query = query.order('id', { ascending: true }).range(offset, offset + pageSize - 1);
      return query.then(function (res) {
        if (res.error) throw res.error;
        var page = res.data || [];
        all = all.concat(page);
        offset += page.length;
        if (page.length === pageSize && offset < cap) return next();
        return { rows: all, truncated: page.length === pageSize && offset >= cap };
      });
    }
    return next();
  }

  function ensureCore() {
    if (coreLoaded) return Promise.resolve();
    if (coreLoading) return coreLoading;
    host.querySelectorAll('[data-rr-section]').forEach(function (s) {
      if (s.getAttribute('data-rr-section') === 'rules') {
        var loading = s.querySelector('.rr-rules-content');
        if (loading) loading.innerHTML = '<p class="rr-loading">Loading published competition settings…</p>';
      }
    });
    coreLoading = Promise.all([
      db.from('seasons').select('id,name,start_date,end_date,is_current').order('start_date', { ascending: false }),
      db.from('leagues').select('id,name,competition_type,gender_category,description,sort_order,is_active').order('sort_order', { ascending: true }),
      db.from('competition_rules').select('id,season_id,competition_name,points_win,points_draw,points_loss,use_head_to_head,tiebreaker_order,knockout_extra_time,knockout_penalties,updated_at').order('updated_at', { ascending: false }),
      db.from('league_clubs').select('id,league_id,club_name,is_active').eq('is_active', true).order('club_name', { ascending: true }),
      db.from('league_standings').select('league_id,pos,club,mp,w,d,l,gf,ga,pts').order('pos', { ascending: true }),
      db.from('season_standings').select('season_id,league_id,pos,club,mp,w,d,l,gf,ga,pts').order('pos', { ascending: true })
    ]).then(function (results) {
      sourceWarnings = [];
      if (results[0].error) sourceWarnings.push('seasons');
      if (results[1].error) sourceWarnings.push('competitions');
      if (results[2].error) sourceWarnings.push('competition rules');
      if (results[3].error) sourceWarnings.push('clubs');
      if (results[4].error) sourceWarnings.push('current tables');
      if (results[5].error) sourceWarnings.push('historical tables');
      seasons = results[0].error ? [] : (results[0].data || []);
      leagues = results[1].error ? [] : (results[1].data || []);
      rules = results[2].error ? [] : (results[2].data || []);
      clubs = results[3].error ? [] : (results[3].data || []);
      currentStandings = results[4].error ? [] : (results[4].data || []);
      historicalStandings = results[5].error ? [] : (results[5].data || []);
      if (!archiveSeasonChoice) {
        var cur = currentSeason() || seasons[0];
        if (cur) archiveSeasonChoice = String(cur.id);
      }
      if (!archiveLeagueChoice && leagues.length) {
        var stored = selectedAppLeague();
        if (stored && leagueById(stored)) archiveLeagueChoice = stored;
      }
      if (!recordsLeagueChoice && leagues.length) {
        var storedRecords = selectedAppLeague();
        if (storedRecords && leagueById(storedRecords)) recordsLeagueChoice = storedRecords;
      }
      coreLoaded = true;
      renderRules();
      return;
    }).catch(function (err) {
      coreLoading = null;
      throw err;
    }).then(function () {
      coreLoading = null;
    });
    return coreLoading;
  }

  function ensureMatches() {
    if (matchesLoaded) return Promise.resolve();
    if (matchesLoading) return matchesLoading;
    matchesLoading = Promise.all([
      pageThrough('matches', 'id,league_id,season_id,home_club_id,away_club_id,match_date,venue,match_status,home_team,away_team,home_score,away_score'),
      pageThrough('match_events', 'id,match_id,event_type,team_name,player_name,assist_player_name,minute,published_at', function (q) {
        return q.eq('event_type', 'GOAL').not('published_at', 'is', null);
      })
    ]).then(function (result) {
      matches = result[0].rows;
      goalEvents = result[1].rows;
      matchesTruncated = result[0].truncated;
      eventsTruncated = result[1].truncated;
      matchesLoaded = true;
    }).catch(function (err) {
      matchesLoading = null;
      throw err;
    }).then(function () {
      matchesLoading = null;
    });
    return matchesLoading;
  }

  function renderRules() {
    var box = host.querySelector('.rr-rules-content');
    if (!box) return;
    if (sourceWarnings.indexOf('competition rules') !== -1) {
      box.innerHTML = empty('Competition rule settings could not be verified. Please reconnect and try again.');
      return;
    }
    if (!rules.length) {
      box.innerHTML = empty('No competition rules profile has been published to the app yet.');
      return;
    }
    var cards = rules.map(function (r) {
      var season = seasonById(r.season_id);
      var order = safeArray(r.tiebreaker_order);
      var names = {
        HEAD_TO_HEAD: 'Head-to-head',
        head_to_head: 'Head-to-head',
        GOAL_DIFFERENCE: 'Goal difference',
        goal_difference: 'Goal difference',
        GOALS_FOR: 'Goals scored',
        goals_for: 'Goals scored',
        FAIR_PLAY: 'Fair play record',
        fair_play: 'Fair play record',
        DRAW: 'Lots / draw'
      };
      var orderNames = order.map(function (x, i) { return (i + 1) + '. ' + (names[x] || String(x).replace(/_/g, ' ')); });
      var hasHeadToHead = order.some(function (x) { return String(x).toUpperCase() === 'HEAD_TO_HEAD'; });
      var mismatch = !!r.use_head_to_head && !hasHeadToHead;
      return '<article class="rr-rule-card">' +
        '<div class="rr-rule-title"><div><span class="rr-eyebrow">DATABASE RULE PROFILE</span><h3>' + esc(r.competition_name || 'Competition rules') + '</h3>' +
        '<p>' + esc(season ? season.name : (r.season_id ? 'Season record #' + r.season_id : 'No season assigned')) + '</p></div>' +
        '<span class="rr-source-pill">Published settings</span></div>' +
        '<div class="rr-metric-grid">' +
        metric('Win', number(r.points_win), 'points') +
        metric('Draw', number(r.points_draw), 'points') +
        metric('Loss', number(r.points_loss), 'points') +
        metric('Head-to-head', r.use_head_to_head ? 'Enabled' : 'Disabled', 'stored setting') +
        '</div>' +
        '<div class="rr-rule-detail"><h4>Stored tie-break order</h4>' +
        (orderNames.length ? '<ol>' + orderNames.map(function (x) { return '<li>' + esc(x.replace(/^\d+\.\s*/, '')) + '</li>'; }).join('') + '</ol>' : '<p>No ordered tie-break list is stored.</p>') +
        (mismatch ? '<p class="rr-warning"><strong>Needs confirmation:</strong> head-to-head is enabled separately, but it is not included in the stored tie-break order. The Association should confirm the official precedence before this setting is relied upon.</p>' : '') +
        '</div>' +
        '<div class="rr-rule-detail"><h4>Knockout settings in this profile</h4><div class="rr-inline-stats"><span>Extra time: <strong>' + (r.knockout_extra_time ? 'Enabled' : 'Disabled') + '</strong></span><span>Penalties: <strong>' + (r.knockout_penalties ? 'Enabled' : 'Disabled') + '</strong></span></div>' +
        '<p class="rr-muted">This record is labelled "' + esc(r.competition_name || 'Competition') + '". These values should not be treated as a separately approved cup regulations document.</p></div>' +
        '</article>';
    }).join('');
    var noDoc = '<section class="rr-document-note"><span class="rr-eyebrow">OFFICIAL DOCUMENT LIBRARY</span><h3>Full competition regulations</h3>' +
      '<p>The database contains a rules configuration profile, but no approved regulations document or document link is currently connected to this public centre.</p>' +
      '<div class="rr-doc-list">' +
      '<span>Competition format and points</span><span>Player eligibility and registration</span><span>Squad and matchday requirements</span>' +
      '<span>Disciplinary procedures and appeals</span><span>Postponements and abandoned matches</span><span>Promotion, relegation and cup rules</span>' +
      '</div><p class="rr-muted">These are recommended publication sections, not statements of current SLFA rules. Approved documents must be supplied and authorised by the Association before publication.</p></section>';
    var scopeNote = '<p class="rr-warning">The current rules table stores a season-level profile named "' + esc(rules[0].competition_name || 'League') + '" but has no competition ID to identify which individual league it governs. Confirm its scope before treating it as binding for both active competitions.</p>';
    box.innerHTML = '<div class="rr-section-intro"><span class="rr-eyebrow">COMPETITION GOVERNANCE</span><h2>Competition Regulations Centre</h2><p>Published rule settings are shown below exactly as stored in the league database. The app does not invent missing competition rules.</p></div>' +
      cards + scopeNote + noDoc;
    if (sourceWarnings.length) box.insertAdjacentHTML('beforeend', '<p class="rr-source-warning">Some supporting information could not be loaded: ' + esc(sourceWarnings.join(', ')) + '.</p>');
  }

  function filterMatchesFor(seasonId, leagueId) {
    return matches.filter(function (m) {
      return belongsToSeason(m, seasonId) && belongsToLeague(m, leagueId);
    });
  }
  function ruleForSeason(seasonId) {
    return rules.filter(function (r) { return String(r.season_id || '') === String(seasonId || ''); })[0] || null;
  }
  function calculatedTable(rows, seasonId) {
    var config = ruleForSeason(seasonId);
    if (!config) return [];
    var win = number(config.points_win);
    var draw = number(config.points_draw);
    var loss = number(config.points_loss);
    var table = {};
    rows.filter(isFinished).forEach(function (m) {
      var h = String(m.home_team || 'Home team'), a = String(m.away_team || 'Away team');
      table[h] = table[h] || { club: h, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      table[a] = table[a] || { club: a, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      var hs = number(m.home_score), as = number(m.away_score);
      table[h].mp++; table[a].mp++;
      table[h].gf += hs; table[h].ga += as; table[a].gf += as; table[a].ga += hs;
      if (hs > as) { table[h].w++; table[a].l++; table[h].pts += win; table[a].pts += loss; }
      else if (hs < as) { table[a].w++; table[h].l++; table[a].pts += win; table[h].pts += loss; }
      else { table[h].d++; table[a].d++; table[h].pts += draw; table[a].pts += draw; }
    });
    return Object.keys(table).map(function (key) { return table[key]; }).sort(function (a, b) {
      return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.club.localeCompare(b.club);
    }).map(function (row, index) { row.pos = index + 1; row.gd = row.gf - row.ga; return row; });
  }
  function renderTable(rows, title, badge, note) {
    var sorted = rows.slice().sort(function (a, b) { return number(a.pos) - number(b.pos); });
    return '<section class="rr-table-block"><div class="rr-table-head"><h3>' + esc(title) + '</h3><span>' + esc(badge) + '</span></div>' +
      (sorted.length ? '<div class="rr-scroll"><table class="rr-table"><thead><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>' +
      sorted.map(function (r, i) {
        var gd = r.gd != null ? number(r.gd) : number(r.gf) - number(r.ga);
        return '<tr><td>' + esc(r.pos == null ? i + 1 : r.pos) + '</td><td class="rr-club-name">' + esc(r.club) + '</td><td>' + number(r.mp) +
          '</td><td>' + number(r.w) + '</td><td>' + number(r.d) + '</td><td>' + number(r.l) + '</td><td>' + number(r.gf) +
          '</td><td>' + number(r.ga) + '</td><td>' + (gd > 0 ? '+' : '') + gd + '</td><td><strong>' + number(r.pts) + '</strong></td></tr>';
      }).join('') + '</tbody></table></div>' : empty('No published or match-derived table is available for this competition and season.')) +
      (note ? '<p class="rr-table-note">' + esc(note) + '</p>' : '') + '</section>';
  }
  function matchRow(match) {
    var status = String(match.match_status || '').toUpperCase();
    var score = isFinished(match) ? number(match.home_score) + ' – ' + number(match.away_score) : 'v';
    return '<article class="rr-match-row"><div class="rr-match-date">' + esc(formatDateTime(match.match_date)) + '<small>' + esc(status.replace(/_/g, ' ')) + '</small></div>' +
      '<strong>' + esc(match.home_team || 'Home team') + '</strong><span class="rr-match-score">' + esc(score) + '</span><strong>' + esc(match.away_team || 'Away team') + '</strong>' +
      '<small class="rr-match-venue">' + esc(match.venue || 'Venue to be confirmed') + '</small></article>';
  }

  function renderArchive() {
    var box = host.querySelector('[data-rr-section="archive"]');
    if (!box) return;
    var season = seasonById(archiveSeasonChoice);
    var selected = filterMatchesFor(archiveSeasonChoice, archiveLeagueChoice);
    var played = selected.filter(isFinished);
    var upcoming = sortedMatches(selected.filter(isUpcoming), true);
    var goals = played.reduce(function (n, m) { return n + number(m.home_score) + number(m.away_score); }, 0);
    var visibleClubs = {};
    selected.forEach(function (m) { if (m.home_team) visibleClubs[m.home_team] = true; if (m.away_team) visibleClubs[m.away_team] = true; });
    var clubCount;
    if (season && season.is_current) {
      clubCount = clubs.filter(function (c) { return !archiveLeagueChoice || String(c.league_id) === String(archiveLeagueChoice); }).length;
    } else {
      var tableRowsForScope = historicalStandings.filter(function (r) {
        return String(r.season_id) === String(archiveSeasonChoice) && (!archiveLeagueChoice || String(r.league_id) === String(archiveLeagueChoice));
      });
      tableRowsForScope.forEach(function (r) { visibleClubs[r.club] = true; });
      clubCount = Object.keys(visibleClubs).length;
    }
    var finalTableCount = leagues.filter(function (l) {
      return (!archiveLeagueChoice || String(l.id) === String(archiveLeagueChoice)) &&
        l.competition_type !== 'CUP' &&
        (season && season.is_current
          ? currentStandings.some(function (r) { return String(r.league_id) === String(l.id); })
          : historicalStandings.some(function (r) { return String(r.season_id) === String(archiveSeasonChoice) && String(r.league_id) === String(l.id); }));
    }).length;
    var competitionLabel = archiveLeagueChoice ? (leagueById(archiveLeagueChoice) || {}).name : 'All competitions';
    var title = season ? season.name : 'All seasons';
    var tables = '';
    var competitionsForTable = leagues.filter(function (l) {
      return l.competition_type !== 'CUP' && (!archiveLeagueChoice || String(l.id) === String(archiveLeagueChoice));
    });
    competitionsForTable.forEach(function (l) {
      var stored = season && season.is_current
        ? currentStandings.filter(function (r) { return String(r.league_id) === String(l.id); })
        : historicalStandings.filter(function (r) { return String(r.season_id) === String(archiveSeasonChoice) && String(r.league_id) === String(l.id); });
      if (stored.length) {
        tables += renderTable(stored, l.name, season && season.is_current ? 'Current published table' : 'Archived final table', '');
        return;
      }
      if (isNaN(Number(archiveSeasonChoice)) || !season) return;
      var derived = calculatedTable(filterMatchesFor(archiveSeasonChoice, String(l.id)), archiveSeasonChoice);
      if (derived.length) {
        tables += renderTable(derived, l.name, 'Calculated from final scores',
          'Derived from published full-time scores because no manually saved final table is present. Exact tied positions should be checked against the approved competition tie-break rules.');
      } else {
        var hasResults = filterMatchesFor(archiveSeasonChoice, String(l.id)).some(isFinished);
        var reason = hasResults
          ? 'Completed results exist, but this season has no saved final table or season-specific points profile. A table cannot be calculated safely yet.'
          : (season.is_current ? 'The current table has not received a completed match record yet.' : 'No final table or completed match records have been published for this past season.');
        tables += '<section class="rr-table-block"><div class="rr-table-head"><h3>' + esc(l.name) + '</h3><span>' + (season.is_current ? 'Current season' : 'Past season') + '</span></div>' + empty(reason) + '</section>';
      }
    });
    if (!competitionsForTable.length) tables = '<p class="rr-muted">No league-table competition is selected. Cup competitions are shown through their match and bracket records, not a league table.</p>';
    var recent = sortedMatches(played, false).slice(0, 10);
    var next = upcoming.slice(0, 5);
    box.innerHTML = '<div class="rr-section-intro"><span class="rr-eyebrow">COMPETITION HISTORY</span><h2>Advanced Season Archive</h2><p>Browse a season by competition, inspect published final results and view stored or clearly labelled calculated tables.</p></div>' +
      '<div class="rr-filter-grid"><label>Season<select id="rrArchiveSeason">' + optionsForSeasons(archiveSeasonChoice, false) + '</select></label>' +
      '<label>Competition<select id="rrArchiveLeague">' + optionsForLeagues(archiveLeagueChoice) + '</select></label></div>' +
      '<div class="rr-metric-grid">' +
      metric('Season', title, season ? formatDate(season.start_date) + ' – ' + formatDate(season.end_date) : 'All stored seasons') +
      metric('Completed matches', played.length, 'Full-time records') +
      metric('Goals recorded', goals, 'From final scores') +
      metric('Clubs represented', clubCount, 'In the selected scope') +
      '</div>' +
      '<div class="rr-archive-status">' + (season ? (season.is_current ? '<span class="rr-status-current">Current season</span>' : '<span class="rr-status-past">Past season</span>') : '<span class="rr-status-past">All seasons</span>') +
      '<span>' + esc(competitionLabel) + '</span>' +
      (finalTableCount ? '<span>' + finalTableCount + ' table' + (finalTableCount === 1 ? '' : 's') + ' published</span>' : '<span>No stored final table for this selection</span>') + '</div>' +
      (seasons.filter(function (s) { return !s.is_current; }).length ? '' : '<p class="rr-source-warning">No past seasons have been created in the database yet. The archive currently has only the active season; older seasons will appear once their records are added.</p>') +
      '<section class="rr-archive-block"><h3>League tables</h3>' + (tables || empty('No league table is available for this selection.')) + '</section>' +
      '<div class="rr-archive-columns"><section class="rr-archive-block"><h3>Latest completed results</h3>' +
      (recent.length ? recent.map(matchRow).join('') : empty('No completed match results have been published for this season yet.')) +
      '</section><section class="rr-archive-block"><h3>Upcoming and rescheduled matches</h3>' +
      (next.length ? next.map(matchRow).join('') : empty('No upcoming fixtures are currently published for this selection.')) +
      '</section></div>' +
      (matchesTruncated ? '<p class="rr-source-warning">The archive is showing the first 10,000 match records returned by the database. Contact the developer if older records are expected beyond this range.</p>' : '') +
      '<p class="rr-table-note">Only records currently available in the league database are shown. A season with no stored results or final table is intentionally left blank rather than populated with sample records.</p>';
    $('rrArchiveSeason').addEventListener('change', function () { archiveSeasonChoice = this.value; archiveDerivedTables = {}; renderArchive(); });
    $('rrArchiveLeague').addEventListener('change', function () { archiveLeagueChoice = this.value; renderArchive(); });
  }

  function bestMatch(rows, scoreFn, sortFn) {
    if (!rows.length) return null;
    return rows.slice().sort(sortFn || function (a, b) { return scoreFn(b) - scoreFn(a); })[0];
  }
  function recordCard(title, value, detail) {
    return '<article class="rr-record-card"><span>' + esc(title) + '</span><strong>' + esc(value) + '</strong><small>' + esc(detail || 'No verified record available yet') + '</small></article>';
  }
  function buildClubRecords(rows) {
    var clubsByName = {};
    sortedMatches(rows, true).forEach(function (m) {
      var home = String(m.home_team || 'Home team'), away = String(m.away_team || 'Away team');
      clubsByName[home] = clubsByName[home] || { club: home, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, winRun: 0, unbeatenRun: 0, bestWinRun: 0, bestUnbeatenRun: 0 };
      clubsByName[away] = clubsByName[away] || { club: away, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, winRun: 0, unbeatenRun: 0, bestWinRun: 0, bestUnbeatenRun: 0 };
      var hs = number(m.home_score), as = number(m.away_score);
      var homeRow = clubsByName[home], awayRow = clubsByName[away];
      homeRow.mp++; awayRow.mp++;
      homeRow.gf += hs; homeRow.ga += as; awayRow.gf += as; awayRow.ga += hs;
      var homeResult = hs > as ? 'W' : hs < as ? 'L' : 'D';
      var awayResult = as > hs ? 'W' : as < hs ? 'L' : 'D';
      [ [homeRow, homeResult], [awayRow, awayResult] ].forEach(function (entry) {
        var row = entry[0], outcome = entry[1];
        if (outcome === 'W') { row.w++; row.winRun++; row.unbeatenRun++; }
        else if (outcome === 'D') { row.d++; row.winRun = 0; row.unbeatenRun++; }
        else { row.l++; row.winRun = 0; row.unbeatenRun = 0; }
        row.bestWinRun = Math.max(row.bestWinRun, row.winRun);
        row.bestUnbeatenRun = Math.max(row.bestUnbeatenRun, row.unbeatenRun);
      });
    });
    return Object.keys(clubsByName).map(function (k) { return clubsByName[k]; });
  }
  function playerLeaders(events, finishedRows, field) {
    var matchIds = {};
    finishedRows.forEach(function (m) { matchIds[String(m.id)] = true; });
    var totals = {};
    events.forEach(function (e) {
      if (!matchIds[String(e.match_id)]) return;
      var name = field === 'goals' ? e.player_name : e.assist_player_name;
      name = String(name || '').trim();
      if (!name) return;
      var key = name.toLowerCase();
      totals[key] = totals[key] || { player: name, club: e.team_name || '', total: 0 };
      totals[key].total++;
    });
    return Object.keys(totals).map(function (k) { return totals[k]; }).sort(function (a, b) {
      return b.total - a.total || a.player.localeCompare(b.player);
    }).slice(0, 8);
  }
  function streakLeader(rows, key) {
    return rows.slice().sort(function (a, b) {
      return number(b[key]) - number(a[key]) || a.club.localeCompare(b.club);
    }).filter(function (x) { return number(x[key]) > 0; })[0] || null;
  }
  function renderRecords() {
    var box = host.querySelector('[data-rr-section="records"]');
    if (!box) return;
    var selected = filterMatchesFor(recordsSeasonChoice, recordsLeagueChoice);
    var finished = sortedMatches(selected.filter(isFinished), true);
    var goalTotal = finished.reduce(function (n, m) { return n + number(m.home_score) + number(m.away_score); }, 0);
    var clubsInData = {};
    finished.forEach(function (m) { clubsInData[m.home_team] = true; clubsInData[m.away_team] = true; });
    var allGoals = playerLeaders(goalEvents, finished, 'goals');
    var assists = playerLeaders(goalEvents, finished, 'assists');
    var highest = bestMatch(finished, function (m) { return number(m.home_score) + number(m.away_score); });
    var biggest = bestMatch(finished, null, function (a, b) {
      return Math.abs(number(b.home_score) - number(b.away_score)) - Math.abs(number(a.home_score) - number(a.away_score)) ||
        (number(b.home_score) + number(b.away_score)) - (number(a.home_score) + number(a.away_score));
    });
    var topClubScore = bestMatch(finished, null, function (a, b) {
      return Math.max(number(b.home_score), number(b.away_score)) - Math.max(number(a.home_score), number(a.away_score));
    });
    var topDraw = bestMatch(finished.filter(function (m) { return number(m.home_score) === number(m.away_score); }),
      function (m) { return number(m.home_score) + number(m.away_score); });
    var teamRecords = buildClubRecords(finished);
    var bestWinRun = streakLeader(teamRecords, 'bestWinRun');
    var bestUnbeatenRun = streakLeader(teamRecords, 'bestUnbeatenRun');
    var ranking = teamRecords.slice().sort(function (a, b) {
      return b.w - a.w || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.club.localeCompare(b.club);
    }).slice(0, 12);
    function matchDetail(m) {
      if (!m) return 'No verified full-time match record yet.';
      return m.home_team + ' ' + number(m.home_score) + '–' + number(m.away_score) + ' ' + m.away_team + ' · ' + formatDate(m.match_date);
    }
    function leaderHtml(rows, label) {
      return rows.length ? '<ol class="rr-leader-list">' + rows.map(function (r) {
        return '<li><span><strong>' + esc(r.player) + '</strong><small>' + esc(r.club || 'Club not recorded') + '</small></span><b>' + number(r.total) + '</b></li>';
      }).join('') + '</ol>' : empty('No published ' + label + ' events are available for this selection.');
    }
    var competitionLabel = recordsLeagueChoice ? (leagueById(recordsLeagueChoice) || {}).name : 'All competitions';
    var seasonLabel = recordsSeasonChoice ? ((seasonById(recordsSeasonChoice) || {}).name || 'Selected season') : 'All seasons';
    box.innerHTML = '<div class="rr-section-intro"><span class="rr-eyebrow">HISTORICAL FOOTBALL DATA</span><h2>Football Records Centre</h2><p>Records are calculated from completed matches marked Full Time. Player rankings use published goal events linked to those matches.</p></div>' +
      '<div class="rr-filter-grid"><label>Season<select id="rrRecordsSeason">' + optionsForSeasons(recordsSeasonChoice, true) + '</select></label>' +
      '<label>Competition<select id="rrRecordsLeague">' + optionsForLeagues(recordsLeagueChoice) + '</select></label></div>' +
      '<div class="rr-metric-grid">' +
      metric('Completed matches', finished.length, 'Verified full-time results') +
      metric('Goals in final scores', goalTotal, 'Across selected matches') +
      metric('Clubs with records', Object.keys(clubsInData).length, 'Appearing in completed matches') +
      metric('Published goal events', allGoals.reduce(function (n, r) { return n + r.total; }, 0), 'Linked to completed matches') +
      '</div>' +
      (finished.length ? '<div class="rr-record-grid">' +
      recordCard('Highest-scoring match', highest ? (number(highest.home_score) + number(highest.away_score)) + ' goals' : '—', matchDetail(highest)) +
      recordCard('Biggest winning margin', biggest ? Math.abs(number(biggest.home_score) - number(biggest.away_score)) + ' goals' : '—', matchDetail(biggest)) +
      recordCard('Most goals by one team', topClubScore ? Math.max(number(topClubScore.home_score), number(topClubScore.away_score)) + ' goals' : '—', matchDetail(topClubScore)) +
      recordCard('Highest-scoring draw', topDraw ? (number(topDraw.home_score) + number(topDraw.away_score)) + ' goals' : '—', matchDetail(topDraw)) +
      recordCard('Longest winning run', bestWinRun ? bestWinRun.bestWinRun + ' matches' : '—', bestWinRun ? bestWinRun.club : 'No winning streak in the available results') +
      recordCard('Longest unbeaten run', bestUnbeatenRun ? bestUnbeatenRun.bestUnbeatenRun + ' matches' : '—', bestUnbeatenRun ? bestUnbeatenRun.club : 'No unbeaten run in the available results') +
      '</div>' : empty('No verified full-time results are currently stored for ' + seasonLabel + ' · ' + competitionLabel + '. Records will populate when official match scores are published.')) +
      '<div class="rr-record-columns"><section class="rr-table-block"><div class="rr-table-head"><h3>Club performance records</h3><span>Wins · Goal difference · Goals for</span></div>' +
      (ranking.length ? '<div class="rr-scroll"><table class="rr-table"><thead><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th></tr></thead><tbody>' +
      ranking.map(function (r, i) { return '<tr><td>' + (i + 1) + '</td><td class="rr-club-name">' + esc(r.club) + '</td><td>' + r.mp + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + r.gf + '</td><td>' + r.ga + '</td><td>' + (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : empty('Club rankings will appear after full-time results are published.')) +
      '<p class="rr-table-note">This is an all-time or season-filtered record ranking, not the official live league table.</p></section>' +
      '<div class="rr-player-records"><section class="rr-table-block"><div class="rr-table-head"><h3>Published goal scorers</h3><span>Match events</span></div>' + leaderHtml(allGoals, 'goal') + '</section>' +
      '<section class="rr-table-block"><div class="rr-table-head"><h3>Published assists</h3><span>Goal event records</span></div>' + leaderHtml(assists, 'assist') + '</section></div></div>' +
      '<p class="rr-table-note">Scope: ' + esc(seasonLabel) + ' · ' + esc(competitionLabel) + '. Only Full Time matches are included; live, abandoned, postponed and unverified scores are excluded. Player goal and assist totals require published match events.</p>' +
      (matchesTruncated || eventsTruncated ? '<p class="rr-source-warning">The data request reached its 10,000-row safety limit. Some older match or event records may not be included.</p>' : '');
    $('rrRecordsSeason').addEventListener('change', function () { recordsSeasonChoice = this.value; renderRecords(); });
    $('rrRecordsLeague').addEventListener('change', function () { recordsLeagueChoice = this.value; renderRecords(); });
  }

  function renderShell() {
    host.innerHTML = '<header class="rr-hero"><div><span class="rr-eyebrow">THE SLFA LEAGUE APP</span><h2>Records, Regulations &amp; History</h2><p>Explore competition rules, past seasons and football records from published league information.</p></div><span class="rr-hero-mark" aria-hidden="true">SL</span></header>' +
      '<nav class="rr-subnav" role="tablist" aria-label="League library sections">' +
      '<button type="button" role="tab" data-rr-subtab="rules" aria-selected="true">Competition Regulations</button>' +
      '<button type="button" role="tab" data-rr-subtab="archive" aria-selected="false">Season Archive</button>' +
      '<button type="button" role="tab" data-rr-subtab="records" aria-selected="false">Football Records</button></nav>' +
      '<p id="rrLoadMessage" class="rr-status" role="status" aria-live="polite"></p>' +
      '<section data-rr-section="rules"><div class="rr-rules-content"><p class="rr-loading">Loading published competition settings…</p></div></section>' +
      '<section data-rr-section="archive" hidden><div class="rr-loading">The season archive will load when opened.</div></section>' +
      '<section data-rr-section="records" hidden><div class="rr-loading">Football records will load when opened.</div></section>';
    host.querySelectorAll('[data-rr-subtab]').forEach(function (button) {
      button.addEventListener('click', function () { switchSection(button.getAttribute('data-rr-subtab')); });
    });
  }

  tab.addEventListener('click', function () {
    showMainTab();
    switchSection(activeSection || 'rules');
  });
  if (window.slfaDb && window.slfaDb.channel) {
    var channel = db.channel('public-records-rules');
    ['matches', 'match_events', 'competition_rules', 'seasons', 'league_standings', 'season_standings', 'leagues', 'league_clubs'].forEach(function (tableName) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: tableName }, function () {
        coreLoaded = false; matchesLoaded = false; coreLoading = null; matchesLoading = null;
        archiveDerivedTables = {};
        if (!host.hidden) switchSection(activeSection);
      });
    });
    channel.subscribe();
  }
  window.addEventListener('online', function () {
    if (host.hidden) return;
    coreLoaded = false; matchesLoaded = false; coreLoading = null; matchesLoading = null;
    switchSection(activeSection);
  });
  renderShell();
})();