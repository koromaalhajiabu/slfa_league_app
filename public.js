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
  var resultsTeam = '', leagueSel = '', leaguesCache = [];
  var MATCH_COLS = 'id, match_date, venue, match_status, match_minute, league_id, home_team, away_team, home_score, away_score, motm_name, motm_jersey_number';
  function loadMatches() {
    Promise.all([
      db.from('leagues').select('id, name').eq('is_active', true).order('sort_order'),
      db.from('matches').select(MATCH_COLS).in('match_status', ['SCHEDULED', 'RESCHEDULED', 'POSTPONED', 'CANCELLED']).order('match_date', { ascending: true }).limit(200),
      db.from('matches').select(MATCH_COLS).eq('match_status', 'FT').order('match_date', { ascending: false }).limit(200)
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
      var leagueOpts = leaguesCache.map(function (l) {
        return '<option value="' + esc(l.id) + '"' + (String(l.id) === leagueSel ? ' selected' : '') + '>' + esc(l.name) + '</option>';
      }).join('');
      $('matchList').innerHTML =
        '<label class="filter">League <select id="leagueFilter"><option value="">All leagues</option>' + leagueOpts + '</select></label>' +
        '<h3 class="sub">Playing now</h3><div id="playingNow">' + empty('Loading…') + '</div>' +
        '<h3 class="sub">Upcoming</h3><div id="upcomingList"></div>' +
        '<h3 class="sub">Results</h3>' +
        '<label class="filter">Team <select id="teamFilter"><option value="">All teams</option>' + teamOpts + '</select></label>' +
        '<div id="resultsList"></div>';
      $('leagueFilter').addEventListener('change', function () { leagueSel = this.value; renderUpcoming(up); renderResults(done); });
      $('teamFilter').addEventListener('change', function () { resultsTeam = this.value; renderResults(done); });
      renderUpcoming(up);
      renderResults(done);
      loadLive();
    });
  }
  // Matches grouped under each league's name, in league order; matches with no league go last
  function byLeague(rows) {
    var html = '';
    leaguesCache.concat([{ id: null, name: 'Other matches' }]).forEach(function (lg) {
      if (leagueSel && String(lg.id) !== leagueSel) return;
      var items = rows.filter(function (m) { return (m.league_id || null) === (lg.id || null); });
      if (!items.length) return;
      html += '<h4 class="league-name">' + esc(lg.name) + '</h4>' + items.map(matchCard).join('');
    });
    return html;
  }
  function renderUpcoming(rows) {
    $('upcomingList').innerHTML = byLeague(rows) || empty(leagueSel ? 'No upcoming matches in this league.' : 'No upcoming matches yet.');
  }
  function renderResults(rows) {
    var list = resultsTeam ? rows.filter(function (m) { return m.home_team === resultsTeam || m.away_team === resultsTeam; }) : rows;
    $('resultsList').innerHTML = byLeague(list) || empty(resultsTeam ? 'No results for ' + esc(resultsTeam) + ' yet.' : 'No results yet.');
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
      '<div class="teams"><span>' + esc(m.home_team) + '</span>' + score + '<span>' + esc(m.away_team) + '</span></div>' +
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
      });
  }
  var ICON = { goal:'⚽', yellow_card:'🟨', red_card:'🟥', substitution:'🔁' };
  function eventLine(e) {
    var t = String(e.event_type || '').toLowerCase();
    var who = e.player_name || '';
    var text = t === 'substitution' ? (who + ' on, ' + (e.player_off_name || '') + ' off')
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
        $('teamGrid').innerHTML = res.data.map(function (c) {
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
    panel.innerHTML = '<h3 class="sub">' + esc(name) + ' squad</h3><p class="muted">Loading…</p>';
    db.from('club_squad').select('player_name, position, photo_url').eq('club_id', id).order('player_name')
      .then(function (res) {
        if (res.error) { panel.innerHTML = '<h3 class="sub">' + esc(name) + ' squad</h3>' + empty('The squad is not available right now.'); return; }
        var rows = res.data || [];
        panel.innerHTML = '<h3 class="sub">' + esc(name) + ' squad</h3>' + (rows.length ? rows.map(function (x) {
          return '<div class="row">' + badge(x.photo_url, x.player_name) + '<span class="pname">' + esc(x.player_name) + '<small>' + esc(POS[x.position] || x.position) + '</small></span></div>';
        }).join('') : empty('No approved players for this season yet.'));
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
        $('scorers').innerHTML = list((res.data || []).map(function (r) { return { name: r.player, club: r.club, photo_url: r.photo_url, goals: r.goals }; }), 'goals', 'goals');
      });
    db.from('top_assists').select('player, club, assists, photo_url').order('assists', { ascending: false }).limit(10)
      .then(function (res) {
        $('assists').innerHTML = list((res.data || []).map(function (r) { return { name: r.player, club: r.club, photo_url: r.photo_url, assists: r.assists }; }), 'assists', 'assists');
      });
    db.from('clean_sheets').select('goalkeeper, club, clean_sheets, photo_url').order('clean_sheets', { ascending: false }).limit(10)
      .then(function (res) {
        $('cleanSheets').innerHTML = list((res.data || []).map(function (r) { return { name: r.goalkeeper, club: r.club, photo_url: r.photo_url, sheets: r.clean_sheets }; }), 'clean sheets', 'sheets');
      });
  }

  // News and media (published only)
  function loadNews() {
    db.from('media_posts').select('id, category, title, body, image_url, video_url, published_at, status')
      .eq('status', 'PUBLISHED').order('published_at', { ascending: false }).limit(20)
      .then(function (res) {
        if (res.error || !(res.data || []).length) { $('newsList').innerHTML = empty('No news yet.'); return; }
        $('newsList').innerHTML = res.data.map(function (p) {
          return '<article class="news">' +
            (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : '') +
            '<div class="meta">' + esc(p.category || 'News') + ' · ' + esc(fmt(p.published_at)) + '</div>' +
            '<h3>' + esc(p.title) + '</h3>' +
            '<p>' + esc(p.body) + '</p>' +
            (p.video_url ? '<a href="' + esc(p.video_url) + '" target="_blank" rel="noopener">Watch video</a>' : '') +
            '<button class="share" data-title="' + esc(p.title) + '">Share</button></article>';
        }).join('');
        wireShare();
      });
  }

  // Sharing
  function wireShare() {
    document.querySelectorAll('.share').forEach(function (b) {
      b.addEventListener('click', function () { shareText(b.dataset.title); });
    });
  }
  function shareText(text) {
    var data = { title: 'SLFA League', text: text, url: location.href };
    if (navigator.share) { navigator.share(data).catch(function () {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(text + ' ' + location.href); alert('Link copied.'); }
  }
  $('shareApp').addEventListener('click', function () { shareText('Follow the league on the SLFA League app'); });

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
    db.from('matches').select('id, match_date, venue, match_status, match_minute, home_team, away_team, home_score, away_score, motm_name, motm_jersey_number')
      .in('match_status', ['LIVE', 'HT']).order('match_date', { ascending: true })
      .then(function (res) {
        if (res.error) { setLive(empty('Live matches are not available right now.')); return; }
        var rows = res.data || [];
        if (!rows.length) { setLive(empty('No live matches right now.')); return; }
        db.from('match_events').select('match_id, team_name, event_type').in('match_id', rows.map(function (m) { return String(m.id); })).eq('event_type', 'goal')
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
    loadMatches(); loadLive(); loadTable(); loadTeams(); loadPlayers(); loadNews(); loadPauseBanner();
  }

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
