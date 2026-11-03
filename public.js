// Public viewer: matches, league table, teams, players and news.
// Read-only. Uses only data the database already exposes to the public.
(function () {
  var cfg = window.SLFA_CONFIG;
  var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function fmt(d) { try { return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return d || ''; } }
  function badge(url, name) {
    return url ? '<img class="badge" src="' + esc(url) + '" alt="">' : '<span class="badge ph">' + esc((name || '?').charAt(0)) + '</span>';
  }
  function empty(msg) { return '<p class="muted empty">' + msg + '</p>'; }

  // Tabs
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b === btn)); });
      document.querySelectorAll('[data-view]').forEach(function (v) { v.hidden = v.dataset.view !== btn.dataset.tab; });
    });
  });

  // Matches
  // Upcoming and results are loaded separately, so the newest results are never cut off
  var resultsTeam = '', leaguesCache = [], dateSel = '', clubLogos = {};
  // The league chosen in the switcher above the tabs, remembered on this device
  var currentLeague = '', leagueList = [], clubLeague = {};
  try { currentLeague = localStorage.getItem('slfa_league') || ''; } catch (e) {}
  function loadLeagueData() {
    return Promise.all([
      db.from('leagues').select('id, name').eq('is_active', true).order('sort_order'),
      db.from('league_clubs').select('club_name, league_id').eq('is_active', true)
    ]).then(function (all) {
      leagueList = all[0].data || [];
      clubLeague = {};
      (all[1].data || []).forEach(function (c) { clubLeague[c.club_name] = c.league_id ? String(c.league_id) : ''; });
      renderLeagueSwitch();
    });
  }
  function renderLeagueSwitch() {
    var box = $('leagueSwitch'); if (!box) return;
    box.innerHTML = [{ id: '', name: 'All leagues' }].concat(leagueList).map(function (l) {
      var on = String(l.id) === String(currentLeague);
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-league="' + esc(l.id) + '" aria-pressed="' + on + '">' + esc(l.name) + '</button>';
    }).join('');
    box.querySelectorAll('[data-league]').forEach(function (b) {
      b.addEventListener('click', function () { setLeague(b.dataset.league); });
    });
  }
  function setLeague(id) {
    currentLeague = String(id || '');
    try { localStorage.setItem('slfa_league', currentLeague); } catch (e) {}
    renderLeagueSwitch();
    refreshAll();
  }
  function inLeague(rows) { return (rows || []).filter(function (r) { return !currentLeague || clubLeague[r.club] === currentLeague; }); }
  // Local calendar day as YYYY-MM-DD, so the date picker matches what the viewer sees
  function dayKey(d) {
    var x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function shiftDay(key, n) {
    var p = key.split('-').map(Number);
    return dayKey(new Date(p[0], p[1] - 1, p[2] + n));
  }
  function onDate(rows) { return dateSel ? rows.filter(function (m) { return dayKey(m.match_date) === dateSel; }) : rows; }
  var MATCH_COLS = 'id, match_date, venue, match_status, match_minute, league_id, home_team, away_team, home_score, away_score, motm_name, motm_jersey_number';
  function loadMatches() {
    Promise.all([
      db.from('leagues').select('id, name').eq('is_active', true).order('sort_order'),
      db.from('matches').select(MATCH_COLS).in('match_status', ['SCHEDULED', 'RESCHEDULED', 'POSTPONED', 'CANCELLED']).order('match_date', { ascending: true }).limit(200),
      db.from('matches').select(MATCH_COLS).eq('match_status', 'FT').order('match_date', { ascending: false }).limit(200),
      db.from('league_clubs').select('club_name, logo_url').eq('is_active', true)
    ]).then(function (all) {
      if (all[1].error || all[2].error) { $('matchList').innerHTML = empty('Matches are not available right now.'); return; }
      leaguesCache = all[0].data || [];
      var up = all[1].data || [];
      var done = all[2].data || [];
      var teams = {};
      up.concat(done).forEach(function (m) { teams[m.home_team] = true; teams[m.away_team] = true; });
      var teamOpts = Object.keys(teams).sort().map(function (t) {
        return '<option value="' + esc(t) + '"' + (t === resultsTeam ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
      clubLogos = {};
      (all[3].data || []).forEach(function (c) { clubLogos[c.club_name] = c.logo_url; });
      $('matchList').innerHTML =
        '<div class="mc">' +
        '<div class="datebar"><button class="small" data-day="-1" aria-label="Previous day">‹</button>' +
        '<input type="date" id="dateFilter" value="' + esc(dateSel) + '" aria-label="Choose a date">' +
        '<button class="small" data-day="1" aria-label="Next day">›</button>' +
        '<button class="small" id="dateAll">All dates</button></div>' +
        '<h3 class="sub">Playing now</h3><div id="playingNow">' + empty('Loading…') + '</div>' +
        '<h3 class="sub">Upcoming</h3><div id="upcomingList"></div>' +
        '<h3 class="sub">Results</h3>' +
        '<label class="filter">Team <select id="teamFilter"><option value="">All teams</option>' + teamOpts + '</select></label>' +
        '<div id="resultsList"></div></div>';
      $('teamFilter').addEventListener('change', function () { resultsTeam = this.value; renderResults(done); });
      $('dateFilter').addEventListener('change', function () { dateSel = this.value; renderUpcoming(up); renderResults(done); });
      $('dateAll').addEventListener('click', function () { dateSel = ''; $('dateFilter').value = ''; renderUpcoming(up); renderResults(done); });
      document.querySelectorAll('.mc [data-day]').forEach(function (b) {
        b.addEventListener('click', function () {
          dateSel = shiftDay(dateSel || dayKey(new Date()), Number(b.dataset.day));
          $('dateFilter').value = dateSel; renderUpcoming(up); renderResults(done);
        });
      });
      renderUpcoming(up);
      renderResults(done);
      loadLive();
    });
  }
  // Matches grouped under each league's name, in league order; matches with no league go last
  function byLeague(rows) {
    var html = '';
    leaguesCache.concat([{ id: null, name: 'Other matches' }]).forEach(function (lg) {
      if (currentLeague && String(lg.id) !== currentLeague) return;
      var items = rows.filter(function (m) { return (m.league_id || null) === (lg.id || null); });
      if (!items.length) return;
      html += '<h4 class="league-name">' + esc(lg.name) + '</h4>' + items.map(matchCard).join('');
    });
    return html;
  }
  function renderUpcoming(rows) {
    var list = onDate(rows);
    $('upcomingList').innerHTML = byLeague(list) || empty(dateSel ? 'No upcoming matches on this date.' : currentLeague ? 'No upcoming matches in this league.' : 'No upcoming matches yet.');
  }
  function renderResults(rows) {
    var list = onDate(resultsTeam ? rows.filter(function (m) { return m.home_team === resultsTeam || m.away_team === resultsTeam; }) : rows);
    $('resultsList').innerHTML = byLeague(list) || empty(dateSel ? 'No results on this date.' : resultsTeam ? 'No results for ' + esc(resultsTeam) + ' yet.' : 'No results yet.');
  }
  function matchCard(m) {
    var st = m.match_status;
    var playing = st === 'LIVE' || st === 'HT' || st === 'FT';
    var score = playing && m.home_score != null ? '<span class="score">' + esc(m.home_score) + ' – ' + esc(m.away_score) + '</span>' : '<span class="vs">v</span>';
    var label = st === 'LIVE' ? (m.match_minute != null ? esc(m.match_minute) + "'" : 'Live')
      : st === 'HT' ? 'Half time' : st === 'FT' ? 'Full time'
      : st === 'POSTPONED' ? 'Postponed' : st === 'CANCELLED' ? 'Cancelled' : st === 'RESCHEDULED' ? 'Rescheduled' : '';
    var motm = m.motm_name ? '<div class="meta">Man of the Match: ' + esc(m.motm_name) + (m.motm_jersey_number ? ' (#' + esc(m.motm_jersey_number) + ')' : '') + '</div>' : '';
    return '<article class="match" data-match="' + esc(m.id) + '" tabindex="0">' +
      '<div class="meta">' + (label ? '<strong>' + label + '</strong> · ' : '') + esc(fmt(m.match_date)) + (m.venue ? ' · ' + esc(m.venue) : '') + '</div>' +
      '<div class="teams"><span class="tm">' + badge(clubLogos[m.home_team], m.home_team) + '<span>' + esc(m.home_team) + '</span></span>' + score + '<span class="tm"><span>' + esc(m.away_team) + '</span>' + badge(clubLogos[m.away_team], m.away_team) + '</span></div>' +
      motm + '<div class="detail" hidden></div></article>';
  }

  // Match details: goals, cards and substitutions, published events only
  function wireMatchDetails() {
    // Listens once for the whole page, so cards re-rendered by a refresh still open
  }
  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('.match[data-match]');
    if (card) toggleDetail(card);
  });
  document.addEventListener('keydown', function (e) {
    var card = e.target.closest && e.target.closest('.match[data-match]');
    if (card && e.key === 'Enter') toggleDetail(card);
  });
  function toggleDetail(card) {
    var box = card.querySelector('.detail');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    if (box.dataset.loaded) return;
    box.textContent = 'Loading…';
    db.from('match_events').select('event_type, team_name, player_name, player_off_name, assist_player_name, minute')
      .eq('match_id', String(card.dataset.match))
      .order('minute', { ascending: true })
      .then(function (res) {
        box.dataset.loaded = '1';
        if (res.error) { box.textContent = 'Details are not available right now.'; return; }
        var ev = res.data || [];
        box.innerHTML = ev.length ? ev.map(eventLine).join('') : '<p class="muted">No match events yet.</p>';
        loadLineups(String(card.dataset.match), box);
      });
  }
  function loadLineups(matchId, box) {
    db.from('match_lineups').select('is_starter, league_clubs(club_name), club_squad(player_name, jersey_number)').eq('match_id', matchId)
      .then(function (r) {
        var rows = r.data || [];
        if (r.error || !rows.length) return;
        var byClub = {};
        rows.forEach(function (x) {
          var c = x.league_clubs ? x.league_clubs.club_name : 'Club';
          byClub[c] = byClub[c] || { xi: [], bench: [] };
          var pl = x.club_squad || {};
          var label = (pl.jersey_number ? '#' + pl.jersey_number + ' ' : '') + (pl.player_name || '');
          (x.is_starter ? byClub[c].xi : byClub[c].bench).push(label);
        });
        box.insertAdjacentHTML('beforeend', '<div class="lineups"><h4 class="league-name">Lineups</h4>' + Object.keys(byClub).map(function (c) {
          return '<div class="ev"><span class="etxt"><strong>' + esc(c) + '</strong><small>Starting XI: ' + esc(byClub[c].xi.join(', ') || '—') + '</small><small>Bench: ' + esc(byClub[c].bench.join(', ') || '—') + '</small></span></div>';
        }).join('') + '</div>');
      });
  }
  var ICON = { goal:'⚽', yellow_card:'🟨', red_card:'🟥', sub:'🔁' };
  function eventLine(e) {
    var t = String(e.event_type || '').toLowerCase();
    var who = e.player_name || '';
    var text = t === 'sub' ? (who + ' on, ' + (e.player_off_name || '') + ' off')
      : t === 'goal' ? (who + (e.assist_player_name ? ' (assist ' + e.assist_player_name + ')' : ''))
      : who;
    return '<div class="ev"><span class="min">' + esc(e.minute) + "'</span><span class=\"ico\">" + (ICON[t] || '•') + '</span><span class="etxt">' + esc(text) + '<small>' + esc(e.team_name || '') + '</small></span></div>';
  }

  // League table: one standings table per league
  function loadTable() {
    Promise.all([
      db.from('leagues').select('id, name').eq('is_active', true).order('sort_order'),
      db.from('league_standings').select('league_id, pos, club, mp, w, d, l, gf, ga, pts').order('pos', { ascending: true })
    ]).then(function (all) {
      if (all[1].error) { $('tableBody').innerHTML = '<tr><td colspan="9">The table is not available right now.</td></tr>'; return; }
      var leagues = all[0].data || [], rows = all[1].data || [];
      if (!rows.length) { $('tableBody').innerHTML = '<tr><td colspan="9">The table will appear after the first results.</td></tr>'; return; }
      var html = '';
      leagues.concat([{ id: null, name: 'Other' }]).forEach(function (lg) {
        if (currentLeague && String(lg.id) !== currentLeague) return;
        var items = rows.filter(function (r) { return (r.league_id || null) === (lg.id || null); });
        if (!items.length) return;
        html += '<tr class="league-row"><td colspan="9">' + esc(lg.name) + '</td></tr>' + items.map(function (r) {
          return '<tr><td>' + esc(r.pos) + '</td><td class="club">' + esc(r.club) + '</td><td>' + esc(r.mp) + '</td><td>' + esc(r.w) + '</td><td>' + esc(r.d) + '</td><td>' + esc(r.l) + '</td><td>' + esc(r.gf) + '</td><td>' + esc(r.ga) + '</td><td class="pts">' + esc(r.pts) + '</td></tr>';
        }).join('');
      });
      $('tableBody').innerHTML = html;
    });
  }

  // Teams
  function loadTeams() {
    db.from('league_clubs').select('id, club_name, logo_url').eq('is_active', true).order('club_name')
      .then(function (res) {
        if (res.error || !(res.data || []).length) { $('teamGrid').innerHTML = empty('Teams will appear here once they are added.'); return; }
        var clubs = (res.data || []).filter(function (c) { return !currentLeague || clubLeague[c.club_name] === currentLeague; });
        $('teamGrid').innerHTML = clubs.map(function (c) {
          return '<div class="team" role="button" tabindex="0" data-club="' + esc(c.id) + '" data-name="' + esc(c.club_name) + '">' + badge(c.logo_url, c.club_name) + '<span>' + esc(c.club_name) + '</span></div>';
        }).join('') + '<div id="squadPanel"></div>';
        document.querySelectorAll('[data-club]').forEach(function (el) {
          el.addEventListener('click', function () { loadSquadPublic(el.dataset.club, el.dataset.name); });
          el.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadSquadPublic(el.dataset.club, el.dataset.name); });
        });
        if (selectedClub) loadSquadPublic(selectedClub.id, selectedClub.name);
      });
  }

  // Squad for one club: approved, active players for the current season
  var selectedClub = null;
  var POS = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };
  function loadSquadPublic(id, name) {
    selectedClub = { id: id, name: name };
    var panel = $('squadPanel');
    if (!panel) return;
    panel.innerHTML = '<h3 class="sub">' + esc(name) + '</h3><p class="muted">Loading…</p>';
    Promise.all([
      db.from('league_clubs').select('stadium, city, founded_year, about').eq('id', id).maybeSingle(),
      db.from('club_announcements').select('title, body, created_at').eq('club_id', id).order('created_at', { ascending: false }).limit(10),
      db.from('club_squad').select('id, player_name, position, photo_url, jersey_number').eq('club_id', id).order('jersey_number', { ascending: true, nullsFirst: false }).order('player_name'),
      db.from('suspensions').select('player_id, matches_total, matches_served').eq('status', 'ACTIVE'),
      db.from('disciplinary_actions').select('player_id, action_type, amount, currency, reason, decided_at').eq('published', true).order('decided_at', { ascending: false }).limit(200),
      db.from('motm_awards').select('player_id, awards').limit(500)
    ]).then(function (all) {
      var profile = all[0].data || {};
      var facts = [profile.stadium ? 'Ground: ' + profile.stadium : '', profile.city || '', profile.founded_year ? 'Founded ' + profile.founded_year : ''].filter(Boolean);
      var html = '<h3 class="sub">' + esc(name) + '</h3>';
      if (facts.length) html += '<p class="muted">' + facts.map(function (f) { return esc(f); }).join(' · ') + '</p>';
      if (profile.about) html += '<p>' + esc(profile.about) + '</p>';
      var ann = all[1].data || [];
      if (ann.length) {
        html += '<h4 class="league-name">Announcements</h4>' + ann.map(function (a) {
          return '<div class="post"><strong>' + esc(a.title) + '</strong><div class="muted">' + esc(fmt(a.created_at)) + '</div>' + (a.body ? '<p>' + esc(a.body) + '</p>' : '') + '</div>';
        }).join('');
      }
      var rows = all[2].error ? [] : (all[2].data || []);
      var susp = {}, nameById = {}, squadIds = {};
      rows.forEach(function (x) { squadIds[x.id] = true; nameById[x.id] = x.player_name; });
      (all[3].data || []).forEach(function (s) { if (squadIds[s.player_id] && s.matches_served < s.matches_total) susp[s.player_id] = s.matches_total - s.matches_served; });
      var records = all[4].error ? [] : (all[4].data || []).filter(function (x) { return squadIds[x.player_id]; });
      var motmBy = {};
      if (!all[5].error) (all[5].data || []).forEach(function (a) { if (squadIds[a.player_id]) motmBy[a.player_id] = a.awards; });
      html += '<h4 class="league-name">Squad</h4>';
      if (all[2].error) { html += empty('The squad is not available right now.'); }
      else {
        html += rows.length ? rows.map(function (x) {
          return '<div class="row">' + badge(x.photo_url, x.player_name) + '<span class="pname">' + (x.jersey_number ? '#' + esc(x.jersey_number) + ' ' : '') + esc(x.player_name) + '<small>' + esc(POS[x.position] || x.position) + (susp[x.id] ? ' · Suspended, ' + susp[x.id] + ' match' + (susp[x.id] === 1 ? '' : 'es') + ' left' : '') + (motmBy[x.id] ? ' · Man of the Match ×' + motmBy[x.id] : '') + '</small></span></div>';
        }).join('') : empty('No approved players for this season yet.');
      }
      if (records.length) {
        var kinds = { FINE: 'Fine', PROTEST: 'Protest', BAN: 'Match ban', RULING: 'Official ruling', NOTE: 'Note' };
        html += '<h4 class="league-name">Disciplinary record</h4>' + records.map(function (x) {
          return '<div class="post"><strong>' + esc(kinds[x.action_type] || x.action_type) + '</strong> · ' + esc(nameById[x.player_id] || 'Player') +
            (x.amount ? ' · ' + esc(x.currency) + ' ' + esc(x.amount) : '') + '<div class="muted">' + esc(fmt(x.decided_at)) + '</div><p>' + esc(x.reason) + '</p></div>';
        }).join('');
      }
      panel.innerHTML = html;
    });
  }

  // Players: top scorers, assists, clean sheets
  function list(rows, label, valueKey) {
    if (!rows || !rows.length) return empty('No ' + label + ' yet.');
    return rows.map(function (r, i) {
      return '<div class="row"><span class="rank">' + (i + 1) + '</span>' + badge(r.photo_url, r.name) +
        '<span class="pname">' + esc(r.name) + '<small>' + esc(r.club) + '</small></span><span class="pval">' + esc(r[valueKey]) + '</span></div>';
    }).join('');
  }
  function loadPlayers() {
    db.from('top_scorers').select('player, club, goals, photo_url').order('goals', { ascending: false }).limit(10)
      .then(function (res) {
        $('scorers').innerHTML = list(inLeague(res.data).map(function (r) { return { name: r.player, club: r.club, photo_url: r.photo_url, goals: r.goals }; }), 'goals', 'goals');
      });
    db.from('top_assists').select('player, club, assists, photo_url').order('assists', { ascending: false }).limit(10)
      .then(function (res) {
        $('assists').innerHTML = list(inLeague(res.data).map(function (r) { return { name: r.player, club: r.club, photo_url: r.photo_url, assists: r.assists }; }), 'assists', 'assists');
      });
    db.from('clean_sheets').select('goalkeeper, club, clean_sheets, photo_url').order('clean_sheets', { ascending: false }).limit(10)
      .then(function (res) {
        $('cleanSheets').innerHTML = list(inLeague(res.data).map(function (r) { return { name: r.goalkeeper, club: r.club, photo_url: r.photo_url, sheets: r.clean_sheets }; }), 'clean sheets', 'sheets');
      });
    db.from('motm_awards').select('player, club, awards, photo_url').order('awards', { ascending: false }).limit(10)
      .then(function (res) {
        $('motm').innerHTML = list(inLeague(res.data).map(function (r) { return { name: r.player, club: r.club, photo_url: r.photo_url, awards: r.awards }; }), 'Man of the Match awards', 'awards');
      });
  }

  // News and media (published only)
  var CAT_LABEL = { NEWS: 'News', PRESS_RELEASE: 'Press release', MATCH_REPORT: 'Match report', ANNOUNCEMENT: 'Announcement', FIXTURE: 'Fixture', RESULT: 'Result', PHOTO: 'Photo' };
  function loadNews() {
    loadPolls();
    var news = db.from('media_posts').select('id, category, title, body, image_url, video_url, published_at, status, league_id')
      .eq('status', 'PUBLISHED');
    if (currentLeague) news = news.or('league_id.is.null,league_id.eq.' + currentLeague);
    news.order('published_at', { ascending: false }).limit(20)
      .then(function (res) {
        if (res.error || !(res.data || []).length) { $('newsItems').innerHTML = empty('No news yet.'); return; }
        $('newsItems').innerHTML = res.data.map(function (p) {
          return '<article class="news">' +
            (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : '') +
            '<div class="meta">' + esc(CAT_LABEL[p.category] || 'News') + ' · ' + esc(fmt(p.published_at)) + '</div>' +
            '<h3>' + esc(p.title) + '</h3>' +
            '<p>' + esc(p.body) + '</p>' +
            (p.video_url ? '<a href="' + esc(p.video_url) + '" target="_blank" rel="noopener">Watch video</a>' : '') +
            '<button class="share" data-title="' + esc(p.title) + '">Share</button></article>';
        }).join('');
        wireShare();
      });
  }

  // Video highlights and replays: published news posts that carry a video link
  function loadVideos() {
    var box = $('videoList'); if (!box) return;
    var q = db.from('media_posts').select('id, title, category, video_url, published_at, league_id').eq('status', 'PUBLISHED').not('video_url', 'is', null);
    if (currentLeague) q = q.or('league_id.is.null,league_id.eq.' + currentLeague);
    q.order('published_at', { ascending: false }).limit(30).then(function (res) {
      if (res.error) { box.innerHTML = empty('Videos are not available right now.'); return; }
      var rows = res.data || [];
      box.innerHTML = '<h3 class="sub">Highlights &amp; replays</h3>' + (rows.length ? rows.map(function (v) {
        return '<article class="news"><div class="meta">' + esc(CAT_LABEL[v.category] || 'Video') + ' · ' + esc(fmt(v.published_at)) + '</div>' +
          '<h3>' + esc(v.title) + '</h3>' +
          '<a class="btnlink" href="' + esc(v.video_url) + '" target="_blank" rel="noopener">Watch</a></article>';
      }).join('') : empty('No videos yet.'));
    });
  }

  // Match predictions: one prediction per browser per match, until kick-off. Leaderboard from finished matches.
  function loadPredict() {
    var box = $('predictList'); if (!box) return;
    // Do not redraw while a fan is typing a prediction
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    var savedName = ''; try { savedName = localStorage.getItem('slfa_fan_name') || ''; } catch (e) {}
    var saved = {}; try { saved = JSON.parse(localStorage.getItem('slfa_predictions') || '{}'); } catch (e) {}
    Promise.all([
      db.from('matches').select('id, home_team, away_team, match_date, league_id').in('match_status', ['SCHEDULED', 'RESCHEDULED']).gte('match_date', new Date().toISOString()).order('match_date', { ascending: true }).limit(30),
      db.rpc('prediction_leaderboard', { p_league_id: currentLeague ? Number(currentLeague) : null })
    ]).then(function (all) {
      var matches = (all[0].data || []).filter(function (m) { return !currentLeague || String(m.league_id) === currentLeague; });
      var board = all[1].data || [];
      var cards = matches.map(function (m) {
        var s = saved[m.id] || {};
        return '<article class="match pred" data-pred="' + esc(m.id) + '"><div class="meta">' + esc(fmt(m.match_date)) + ' · predictions close at kick-off</div>' +
          '<div class="teams"><span>' + esc(m.home_team) + '</span>' +
          '<span class="predIn"><input type="number" min="0" max="20" inputmode="numeric" value="' + esc(s.h != null ? s.h : '') + '" data-ph="' + esc(m.id) + '" aria-label="' + esc(m.home_team) + ' goals"> – ' +
          '<input type="number" min="0" max="20" inputmode="numeric" value="' + esc(s.a != null ? s.a : '') + '" data-pa="' + esc(m.id) + '" aria-label="' + esc(m.away_team) + ' goals"></span>' +
          '<span>' + esc(m.away_team) + '</span></div>' +
          '<div class="btns"><button class="small" data-predict="' + esc(m.id) + '">' + (s.h != null ? 'Change prediction' : 'Save prediction') + '</button>' +
          (s.h != null ? '<span class="muted">Your prediction: ' + esc(s.h) + '–' + esc(s.a) + '</span>' : '') + '</div></article>';
      }).join('');
      var rows = board.length ? '<table class="table lb"><thead><tr><th>#</th><th>Fan</th><th>Points</th><th>Exact</th><th>Right result</th></tr></thead><tbody>' +
        board.map(function (r, i) {
          return '<tr><td>' + (i + 1) + '</td><td class="club">' + esc(r.fan_name) + '</td><td class="pts">' + esc(r.points) + '</td><td>' + esc(r.exact_hits) + '</td><td>' + esc(r.right_results) + '</td></tr>';
        }).join('') + '</tbody></table>' : empty('The leaderboard will appear after the first finished match.');
      box.innerHTML = '<h3 class="sub">Predict the score</h3>' +
        '<label for="fanName">Your name (shown on the leaderboard)</label><input id="fanName" type="text" maxlength="30" value="' + esc(savedName) + '" autocomplete="nickname">' +
        '<p class="muted">Right result scores 1 point. Exact score scores 3 points.</p>' +
        (cards || empty('No matches open for predictions right now.')) +
        '<h3 class="sub">Leaderboard</h3>' + rows +
        '<p class="status" id="predMsg" role="status"></p>';
      box.querySelectorAll('[data-predict]').forEach(function (b) {
        b.addEventListener('click', function () { submitPrediction(b.dataset.predict); });
      });
    });
  }
  function submitPrediction(matchId) {
    var name = ($('fanName').value || '').trim(), msgEl = $('predMsg');
    var h = document.querySelector('[data-ph="' + matchId + '"]').value, a = document.querySelector('[data-pa="' + matchId + '"]').value;
    if (name.length < 2) { msgEl.textContent = 'Enter your name (at least 2 letters).'; return; }
    if (h === '' || a === '') { msgEl.textContent = 'Enter a score for both teams.'; return; }
    var key = voterKey();
    if (!key) { msgEl.textContent = 'Predictions need your browser to store a small code. Turn off private browsing and try again.'; return; }
    db.rpc('submit_prediction', { p_match_id: Number(matchId), p_fan_name: name, p_home: Number(h), p_away: Number(a), p_voter_key: key }).then(function (res) {
      if (res.error) { msgEl.textContent = res.error.message; return; }
      try {
        localStorage.setItem('slfa_fan_name', name);
        var saved = JSON.parse(localStorage.getItem('slfa_predictions') || '{}'); saved[matchId] = { h: Number(h), a: Number(a) };
        localStorage.setItem('slfa_predictions', JSON.stringify(saved));
      } catch (e) {}
      loadPredict();
    });
  }

  // Fan polls: one vote per browser, enforced in the database
  var VOTER_KEY = 'slfa_voter_key', VOTES_KEY = 'slfa_votes';
  function voterKey() {
    try {
      var k = localStorage.getItem(VOTER_KEY);
      if (!k) {
        k = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        localStorage.setItem(VOTER_KEY, k);
      }
      return k;
    } catch (e) { return null; }
  }
  function getVoted() { try { return JSON.parse(localStorage.getItem(VOTES_KEY) || '{}'); } catch (e) { return {}; } }
  function setVoted(pollId, optionId) { try { var v = getVoted(); v[pollId] = optionId; localStorage.setItem(VOTES_KEY, JSON.stringify(v)); } catch (e) {} }
  function loadPolls() {
    var box = $('pollList'); if (!box) return;
    db.from('polls').select('id, question, is_open, poll_options(id, label, sort_order)').order('created_at', { ascending: false }).limit(5)
      .then(function (r) {
        var polls = r.data || [];
        if (r.error || !polls.length) { box.innerHTML = ''; return; }
        box.innerHTML = polls.map(function (p) {
          return '<div class="news poll"><div class="meta">Fan poll · ' + (p.is_open ? 'Open' : 'Closed') + '</div><h3>' + esc(p.question) + '</h3><div data-poll-body="' + esc(p.id) + '"></div></div>';
        }).join('');
        polls.forEach(renderPoll);
      });
  }
  function renderPoll(p) {
    var body = document.querySelector('[data-poll-body="' + p.id + '"]'); if (!body) return;
    var opts = (p.poll_options || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    if (!p.is_open || getVoted()[p.id]) { showResults(p, opts, body); return; }
    body.innerHTML = opts.map(function (o) { return '<button class="small" data-vote="' + esc(o.id) + '">' + esc(o.label) + '</button> '; }).join('');
    body.querySelectorAll('[data-vote]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = voterKey();
        if (!key) { body.insertAdjacentHTML('beforeend', '<p class="muted">Voting needs your browser to store a small code. Turn off private browsing and try again.</p>'); return; }
        db.rpc('cast_poll_vote', { p_poll_id: p.id, p_option_id: Number(b.dataset.vote), p_voter_key: key }).then(function (res) {
          if (res.error && !/already voted/i.test(res.error.message)) {
            body.insertAdjacentHTML('beforeend', '<p class="muted">' + esc(res.error.message) + '</p>'); return;
          }
          setVoted(p.id, Number(b.dataset.vote));
          showResults(p, opts, body);
        });
      });
    });
  }
  function showResults(p, opts, body) {
    db.rpc('poll_results', { p_poll_id: p.id }).then(function (r) {
      var counts = {}, total = 0;
      (r.data || []).forEach(function (x) { counts[x.option_id] = Number(x.votes); total += Number(x.votes); });
      body.innerHTML = opts.map(function (o) {
        var n = counts[o.id] || 0, pct = total ? Math.round(n * 100 / total) : 0;
        return '<div class="poll-row"><span>' + esc(o.label) + '</span><span class="muted">' + pct + '% (' + n + ')</span><div class="poll-bar"><span style="width:' + pct + '%"></span></div></div>';
      }).join('') + '<p class="muted">' + total + ' vote' + (total === 1 ? '' : 's') + (p.is_open ? '' : ' · poll closed') + '</p>';
    });
  }

  // Sharing
  function wireShare() {
    document.querySelectorAll('.share').forEach(function (b) {
      b.addEventListener('click', function () { shareText(b.dataset.title); });
    });
  }
  function shareText(text) {
    var data = { title: 'The SLFA League App', text: text, url: location.href };
    if (navigator.share) { navigator.share(data).catch(function () {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(text + ' ' + location.href); alert('Link copied.'); }
  }
  $('shareApp').addEventListener('click', function () { shareText('Follow the league on The SLFA League App'); });

  // ALERTS: anyone can subscribe on their phone or computer
  function urlBase64ToUint8Array(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  }
  function setAlertStatus(msg) { var el = $('alertStatus'); if (el) el.textContent = msg; }
  var alertBtn = $('alertBtn');
  if (alertBtn) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      alertBtn.disabled = true;
      setAlertStatus('Alerts are not supported on this browser. On iPhone, add the app to your Home Screen first.');
    }
    alertBtn.addEventListener('click', function () {
      setAlertStatus('Turning on alerts…');
      Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') { setAlertStatus('Alerts are off. You can allow them in your browser settings.'); return; }
        return navigator.serviceWorker.register('sw.js').then(function (reg) {
          return navigator.serviceWorker.ready.then(function () {
            return reg.pushManager.getSubscription().then(function (sub) {
              return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey) });
            });
          });
        }).then(function (sub) {
          var j = sub.toJSON();
          return db.from('push_subscriptions').insert([{ user_id: null, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }]).then(function (res) {
            if (res.error && res.error.code !== '23505') throw res.error;
            setAlertStatus('Alerts are on for this device.');
          });
        }).catch(function () { setAlertStatus('Could not turn on alerts. Please try again.'); });
      });
    });
  }

  function setLive(html) {
    $('liveList').innerHTML = html;
    if ($('playingNow')) $('playingNow').innerHTML = html;
  }
  // Live matches: the score is counted from goal events
  function loadLive() {
    db.from('matches').select('id, match_date, venue, match_status, match_minute, league_id, home_team, away_team, home_score, away_score, motm_name, motm_jersey_number')
      .in('match_status', ['LIVE', 'HT']).order('match_date', { ascending: true })
      .then(function (res) {
        if (res.error) { setLive(empty('Live matches are not available right now.')); return; }
        var rows = (res.data || []).filter(function (m) { return !currentLeague || String(m.league_id) === currentLeague; });
        if (!rows.length) { setLive(empty('No live matches right now.')); return; }
        db.from('match_events').select('match_id, team_name, event_type').in('match_id', rows.map(function (m) { return String(m.id); })).eq('event_type', 'GOAL')
          .then(function (ev) {
            var goals = ev.data || [];
            setLive(rows.map(function (m) {
              var mid = String(m.id);
              m.home_score = goals.filter(function (g) { return g.match_id === mid && g.team_name === m.home_team; }).length;
              m.away_score = goals.filter(function (g) { return g.match_id === mid && g.team_name === m.away_team; }).length;
              return matchCard(m);
            }).join(''));
          });
      });
  }

  // Freeze banner: shown to everyone while the league is frozen
  function loadPauseBanner() {
    db.from('system_pause').select('paused, reason').eq('id', 1).maybeSingle().then(function (res) {
      var el = $('pauseBanner');
      if (!el) return;
      var st = res.data;
      el.hidden = !(st && st.paused);
      el.textContent = st && st.paused
        ? 'The league is frozen for now. Results and fixtures cannot change until it is resumed.' + (st.reason ? ' Reason: ' + st.reason : '')
        : '';
    });
  }

  function refreshAll() {
    loadLeagueData().then(function () {
      loadMatches(); loadLive(); loadTable(); loadTeams(); loadPlayers(); loadNews(); loadVideos(); loadPredict(); loadPauseBanner();
    });
  }

  // Offline: say so, and refresh the screens when the connection comes back
  function showOnline() { var b = $('offlineBanner'); if (b) b.hidden = navigator.onLine !== false; }
  window.addEventListener('offline', showOnline);
  window.addEventListener('online', function () { showOnline(); refreshAll(); });
  showOnline();

  // Live updates: changes in the database refresh the screens, with a short pause to batch them
  var refreshTimer = null;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAll, 400);
  }
  function subscribeLive() {
    var ch = db.channel('public-league');
    ['matches', 'match_events', 'league_standings', 'league_clubs', 'club_squad', 'top_scorers', 'top_assists', 'clean_sheets', 'media_posts', 'system_pause'].forEach(function (t) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleRefresh);
    });
    ch.subscribe();
    setInterval(refreshAll, 120000);
  }

  refreshAll();
  subscribeLive();
})();
