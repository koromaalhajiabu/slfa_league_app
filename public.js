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
  // Match-day board: today's fixtures (kick-off, venue, status), or the next few when none are on today.
  // Times use Sierra Leone time (Africa/Freetown, UTC+0).
  function dayStart(offsetDays) {
    var d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offsetDays); return d.toISOString();
  }
  function matchDayLabel(m) {
    var st = String(m.match_status || '').toUpperCase();
    if (st === 'FT') return 'Full time' + (m.home_score != null ? ' ' + m.home_score + '–' + m.away_score : '');
    if (['LIVE', 'HT', '1H', '2H', 'ET', 'PEN', 'EXTRA_TIME'].indexOf(st) !== -1) return 'Live now';
    if (st === 'POSTPONED' || st === 'CANCELLED' || st === 'ABANDONED') return st.charAt(0) + st.slice(1).toLowerCase();
    return 'Not started';
  }
  function matchDayRow(m) {
    var when = new Date(m.match_date).toLocaleString('en-GB', { timeZone: 'Africa/Freetown', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return '<div class="md-row"><span class="md-when">' + esc(when) + '</span>' +
      '<strong class="md-teams">' + esc(m.home_team) + ' v ' + esc(m.away_team) + '</strong>' +
      '<span class="md-venue">' + esc(m.venue || 'Venue to be confirmed') + '</span>' +
      '<span class="md-status">' + esc(matchDayLabel(m)) + '</span></div>';
  }
  function loadMatchDay() {
    var box = $('matchDay'); if (!box) return;
    var cols = 'id, match_date, venue, home_team, away_team, home_score, away_score, match_status';
    db.from('matches').select(cols).gte('match_date', dayStart(0)).lt('match_date', dayStart(1)).order('match_date', { ascending: true }).limit(30).then(function (r) {
      if (r.error) { box.hidden = true; return; }
      var today = r.data || [];
      if (today.length) {
        box.hidden = false;
        box.innerHTML = '<h2 class="md-title">Today’s matches</h2>' + today.map(matchDayRow).join('');
        return;
      }
      db.from('matches').select(cols).gte('match_date', dayStart(1)).order('match_date', { ascending: true }).limit(3).then(function (n) {
        var next = (n.data || []);
        if (!next.length) { box.hidden = true; return; }
        box.hidden = false;
        box.innerHTML = '<h2 class="md-title">No matches today. Next up</h2>' + next.map(matchDayRow).join('');
      });
    });
  }
  function fmt(d) { try { return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return d || ''; } }
  var CLUB_LOGO_FALLBACKS = {
    baiburehwarriors: 'https://images.seeklogo.com/logo-png/63/1/bai-bureh-warriors-fc-logo-png_seeklogo-638343.png',
    bhantalfc: 'https://www.dsg-images.com/clubs/200x200/63845.png',
    borangers: 'https://images.seeklogo.com/logo-png/63/1/bo-rangers-fc-logo-png_seeklogo-638330.png',
    bullomstars: 'https://www.dsg-images.com/clubs/200x200/65780.png',
    kallon: 'https://images.seeklogo.com/logo-png/63/1/fc-kallon-logo-png_seeklogo-638335.png',
    kamboieagles: 'https://images.seeklogo.com/logo-png/63/1/kamboi-eagles-fc-logo-png_seeklogo-638346.png',
    mightyblackpool: 'https://www.dsg-images.com/clubs/200x200/17004.png',
    oldedwardians: 'https://images.seeklogo.com/logo-png/63/1/old-edwardians-fc-logo-png_seeklogo-638331.png',
    ports: 'https://images.seeklogo.com/logo-png/63/1/ports-authority-fc-logo-png_seeklogo-638329.png',
    starsportacademy: 'https://www.dsg-images.com/clubs/200x200/67409.png',

    wilberforcestrikers: 'https://dsg-images.com/clubs/200x200/63177.png',
    wusumstars: 'https://images.seeklogo.com/logo-png/63/1/wusum-stars-fc-logo-png_seeklogo-638334.png',
    diamondstars: 'https://images.seeklogo.com/logo-png/63/1/diamond-stars-fc-logo-png_seeklogo-638347.png',
    eastendlions: 'https://images.seeklogo.com/logo-png/63/1/east-end-lions-fc-logo-png_seeklogo-638348.png',
    westernunited: 'https://www.dsg-images.com/sport_entity/200x200/6528.png',
  };
  var WOMENS_CLUB_LOGOS = {
    bamoiqueens: 'logos/women/bamoi-queens-fc.jpg',
    kallonfemale: 'logos/women/fc-kallon-female.jpg',
    jonathanchildcare: 'logos/women/jonathan-child-care-fc.jpg',
    kahunlaqueens: 'logos/women/kahunla-queens-fc.jpg',
    koyaqueens: 'logos/women/koya-queens-fc.jpg',
    menaqueens: 'logos/women/mena-queens.jpg',
    mogbwemoqueens: 'logos/women/mogbwemo-queens.jpg',
    patriciaumustrikers: 'logos/women/patricia-umu-strikers.jpg',
    ramkamara: 'logos/women/ram-kamara-fc.jpg',
    risingqueens: 'logos/women/rising-queens-fc.jpg',
    sierraleonepolicefemale: 'logos/women/sierra-leone-police-female-2026.jpg',
    vembuck: 'logos/women/vem-buck-fc.jpg'
  };
  function clubLogoFallback(name) {
    var raw = String(name || '').toLowerCase();
    var key = raw.replace(/fc/g, '').replace(/[^a-z0-9]/g, '');
    var aliases = {
      bamoiqueen: 'bamoiqueens', fckallonfemale: 'kallonfemale',
      kallonwomen: 'kallonfemale', jonathanchildcarefc: 'jonathanchildcare',
      kahunlaqueensfc: 'kahunlaqueens', koyaqueensfc: 'koyaqueens',
      menaqueensfc: 'menaqueens', mogbwemoqueensfc: 'mogbwemoqueens',
      patriciaumu: 'patriciaumustrikers', patriciaumufc: 'patriciaumustrikers',
      ramkamarafc: 'ramkamara', risingqueensfc: 'risingqueens',
      vembuckfc: 'vembuck', slpolice: 'sierraleonepolicefemale',
      slpolicefemale: 'sierraleonepolicefemale',
      sierraleonepolice: 'sierraleonepolicefemale',
      sierraleonepolicefc: 'sierraleonepolicefemale'
    };
    key = aliases[key] || key;
    // Match common database naming variations for women's clubs.
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('kallon') !== -1 && /(female|women|ladies)/.test(raw)) key = 'kallonfemale';
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('police') !== -1) key = 'sierraleonepolicefemale';
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('mogbwemo') !== -1) key = 'mogbwemoqueens';
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('mena') !== -1 && key.indexOf('queen') !== -1) key = 'menaqueens';
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('patricia') !== -1) key = 'patriciaumustrikers';
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('vem') !== -1 && key.indexOf('buck') !== -1) key = 'vembuck';
    return WOMENS_CLUB_LOGOS[key] || CLUB_LOGO_FALLBACKS[key] || '';
  }
  function isSlfaLogoUrl(url) { return String(url || '').toLowerCase().indexOf('slfa-logo') !== -1; }
  function badge(url, name) {
    var fallback = clubLogoFallback(name), isWomens = !!(fallback && fallback.indexOf('logos/women/') !== -1), primary = isWomens ? fallback : (isSlfaLogoUrl(url) ? (fallback || '') : (url || fallback));
    var initial = esc((name || '?').charAt(0).toUpperCase());
    if (!primary) return '<span class="badge ph">' + initial + '</span>';
    return '<img class="badge" src="' + esc(primary) + '" data-fallback="' + esc(fallback && primary !== fallback ? fallback : '') + '" alt="" onerror="if(this.dataset.fallback){var next=this.dataset.fallback;this.dataset.fallback=\'\';this.src=next;}else{this.hidden=true;this.nextElementSibling.hidden=false;}"><span class="badge ph" hidden>' + initial + '</span>';
  }
  function empty(msg) { return '<p class="muted empty">' + msg + '</p>'; }

  // Tabs
  // Privacy-light usage counts: an event name only, no identifiers. Failures are ignored.
  window.slfaTrack = function (ev) {
    try { db.rpc('log_app_event', { p_event: ev }).then(function () {}, function () {}); } catch (e) {}
  };
  try { if (!sessionStorage.getItem('slfa_seen')) { sessionStorage.setItem('slfa_seen', '1'); window.slfaTrack('app_open'); } } catch (e) {}
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b === btn)); });
      document.querySelectorAll('[data-view]').forEach(function (v) { v.hidden = v.dataset.view !== btn.dataset.tab; });
      window.slfaTrack('tab_' + btn.dataset.tab);
    });
  });

  // Matches
  // Upcoming and results are loaded separately, so the newest results are never cut off
  var resultsTeam = '', leaguesCache = [], dateSel = '', clubLogos = {};
  // Favourite clubs for the signed-in fan (empty when signed out)
  var myFavIds = {}, myFavNames = {}, myFavList = [];
  // The league chosen in the switcher above the tabs, remembered on this device
  var currentLeague = '', leagueList = [], clubLeague = {};
  // Seasons: the current season is live. Past seasons are read-only and show their final table.
  var seasonList = [], seasonSel = '';
  try { seasonSel = localStorage.getItem('slfa_season') || ''; } catch (e) {}
  function currentSeason() { return seasonList.filter(function (x) { return x.is_current; })[0] || null; }
  function selectedSeason() { return seasonList.filter(function (x) { return String(x.id) === String(seasonSel); })[0] || currentSeason(); }
  function loadSeasonData() {
    return db.from('seasons').select('id, name, start_date, end_date, is_current').order('start_date', { ascending: false }).then(function (r) {
      seasonList = r.error ? [] : (r.data || []);
      renderSeasonPick();
    });
  }
  function renderSeasonPick() {
    var box = $('seasonPick'); if (!box) return;
    if (!seasonList.length) { box.innerHTML = '<option value="">Season not set</option>'; return; }
    var sel = selectedSeason();
    box.innerHTML = seasonList.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (sel && String(x.id) === String(sel.id) ? ' selected' : '') + '>' + esc(x.name) + (x.is_current ? ' (current)' : '') + '</option>';
    }).join('');
  }
  function setSeason(id) {
    seasonSel = String(id || '');
    try { localStorage.setItem('slfa_season', seasonSel); } catch (e) {}
    renderSeasonPick();
    document.dispatchEvent(new CustomEvent('slfa:season-change', { detail: { seasonId: seasonSel } }));
    refreshAll();
  }
  try { currentLeague = localStorage.getItem('slfa_league') || ''; } catch (e) {}
  function loadLeagueData() {
    return Promise.all([
      db.from('leagues').select('id, name, logo_url, competition_type, gender_category').eq('is_active', true).order('sort_order'),
      db.from('league_clubs').select('club_name, league_id').eq('is_active', true)
    ]).then(function (all) {
      if (all[0].error) {
        return db.from('leagues').select('id, name').eq('is_active', true).order('sort_order').then(function (fallback) {
          all[0] = fallback;
          return all;
        });
      }
      return all;
    }).then(function (all) {
      leagueList = all[0].data || [];
      clubLeague = {};
      (all[1].data || []).forEach(function (c) { clubLeague[c.club_name] = c.league_id ? String(c.league_id) : ''; });
      renderLeagueSwitch();
    });
  }
  function leagueLogo(l) {
    if (l.logo_url) return '<img class="league-chip-logo" src="' + esc(l.logo_url) + '" alt="" loading="lazy" onerror="this.hidden=true">';
    var n = String(l.name || '').toLowerCase();
    if (n.indexOf('leone rock') !== -1) {
      return '<img class="league-chip-logo" src="league-logos/leone-rock-premier-league.jpg" alt="Leone Rock Premier League logo" loading="lazy">';
    }
    if (n.indexOf('marampa') !== -1 && n.indexOf('women') !== -1) {
      return '<span class="league-chip-logo league-chip-logo-marampa" role="img" aria-label="Marampa Mines Women\'s Premier League crest"></span>';
    }
    return '';
  }
  function renderLeagueSwitch() {
    var box = $('leagueSwitch'); if (!box) return;
    box.innerHTML = [{ id: '', name: 'All leagues' }].concat(leagueList).map(function (l) {
      var on = String(l.id) === String(currentLeague);
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-league="' + esc(l.id) + '" aria-pressed="' + on + '">' + leagueLogo(l) + '<span class="league-chip-name">' + esc(l.name) + '</span></button>';
    }).join('');
    box.querySelectorAll('[data-league]').forEach(function (b) {
      b.addEventListener('click', function () { setLeague(b.dataset.league); });
    });
  }
  function setLeague(id) {
    currentLeague = String(id || '');
    try { localStorage.setItem('slfa_league', currentLeague); } catch (e) {}
    renderLeagueSwitch();
    document.dispatchEvent(new CustomEvent('slfa:league-change', { detail: { leagueId: currentLeague } }));
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
  // Match Centre is rendered exclusively by match-centre.js. Keep this legacy
  // loader as a no-op so older refresh/favourites hooks cannot overwrite it.
  function loadMatches() { return; }
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
    var mine = function (m) { return resultsTeam === '__fav__' ? !!(myFavNames[m.home_team] || myFavNames[m.away_team]) : (m.home_team === resultsTeam || m.away_team === resultsTeam); };
    var list = onDate(resultsTeam ? rows.filter(mine) : rows);
    $('resultsList').innerHTML = byLeague(list) || empty(dateSel ? 'No results on this date.' : resultsTeam === '__fav__' ? 'No results for your clubs yet.' : resultsTeam ? 'No results for ' + esc(resultsTeam) + ' yet.' : 'No results yet.');
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
        box.innerHTML = ev.length ? teamTotals(ev) + ev.map(eventLine).join('') : '<p class="muted">No match events yet.</p>';
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
  // Per-team totals for a match: goals, yellow cards, red cards and substitutions
  function teamTotals(ev) {
    var st = {};
    ev.forEach(function (e) {
      var k = e.team_name || 'Match', t = String(e.event_type || '').toUpperCase();
      st[k] = st[k] || { goals: 0, yellow: 0, red: 0, subs: 0 };
      if (t === 'GOAL') st[k].goals++;
      else if (t === 'YELLOW_CARD') st[k].yellow++;
      else if (t === 'RED_CARD') st[k].red++;
      else if (t === 'SUB') st[k].subs++;
    });
    return '<h4 class="league-name">Match stats</h4>' + Object.keys(st).map(function (k) {
      var x = st[k];
      return '<div class="ev"><span class="etxt"><strong>' + esc(k) + '</strong><small>⚽ ' + x.goals + ' goals · 🟨 ' + x.yellow +
        ' yellow · 🟥 ' + x.red + ' red · 🔁 ' + x.subs + ' subs</small></span></div>';
    }).join('');
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
    var sel = selectedSeason();
    if (sel && !sel.is_current) return loadPastTable(sel);
    Promise.all([
      db.from('leagues').select('id, name').eq('is_active', true).order('sort_order'),
      db.from('league_standings').select('league_id, pos, club, mp, w, d, l, gf, ga, pts').order('pos', { ascending: true }),
      db.from('league_clubs').select('club_name, logo_url').eq('is_active', true)
    ]).then(function (all) {
      if (all[1].error) { $('tableBody').innerHTML = '<tr><td colspan="9">The table is not available right now.</td></tr>'; return; }
      var emptyText = 'The table will appear after the first results.';
      renderTable(all[0].data || [], all[1].data || [], all[2].data || [], emptyText);
    });
  }
  // A finished season's table, worked out from its matches on the server. Read-only.
  function loadPastTable(sel) {
    db.from('leagues').select('id, name').eq('is_active', true).order('sort_order').then(function (lg) {
      var leagues = lg.data || [];
      return Promise.all(leagues.map(function (l) {
        return db.rpc('season_table', { p_season_id: Number(sel.id), p_league_id: Number(l.id) });
      })).then(function (results) {
        var rows = [], failed = results.some(function (r) { return r.error; });
        results.forEach(function (r) { (r.data || []).forEach(function (x) { rows.push(x); }); });
        if (failed) { $('tableBody').innerHTML = '<tr><td colspan="9">This season\'s table is not available right now.</td></tr>'; return; }
        return db.from('league_clubs').select('club_name, logo_url').eq('is_active', true).then(function (c) {
          renderTable(leagues, rows, c.data || [], 'No results were recorded for ' + esc(sel.name) + '.');
        });
      });
    });
  }
  function renderTable(leagues, rows, clubs, emptyText) {
    var logos = {};
    clubs.forEach(function (c) { logos[c.club_name] = c.logo_url || clubLogoFallback(c.club_name); });
    if (!rows.length) { $('tableBody').innerHTML = '<tr><td colspan="9">' + emptyText + '</td></tr>'; return; }
    var html = '';
    leagues.concat([{ id: null, name: 'Other' }]).forEach(function (lg) {
      if (currentLeague && String(lg.id) !== currentLeague) return;
      var items = rows.filter(function (r) { return (r.league_id || null) === (lg.id || null); });
      if (!items.length) return;
      // Each competition has its own relegation zone: the bottom four clubs
      // in that league's current displayed standings, independent of other leagues.
      var rankedItems = items.slice().sort(function (a, b) {
        var ap = Number(a.pos), bp = Number(b.pos);
        if (Number.isFinite(ap) && Number.isFinite(bp)) return ap - bp;
        return 0;
      });
      var relegationStart = Math.max(0, rankedItems.length - 4);
      html += '<tr class="league-row"><td colspan="9">' + esc(lg.name) + '</td></tr>' + rankedItems.map(function (r, index) {
        var inRelegationZone = index >= relegationStart;
        var rowClass = inRelegationZone ? ' class="relegation-zone" aria-label="Relegation zone"' : '';
        var relegationMark = inRelegationZone ? '<span class="relegation-mark" title="Relegation zone" aria-label="Relegation zone">RZ</span>' : '';
        var positionCell = inRelegationZone ? '<td class="relegation-position-cell"><span class="relegation-position">' + esc(r.pos) + '</span></td>' : '<td>' + esc(r.pos) + '</td>';
        return '<tr' + rowClass + '>' + positionCell + '<td class="club"><span class="table-club" role="button" tabindex="0" data-open-club-name="' + esc(r.club) + '">' + (logos[r.club] ? '<img class="table-club-logo" src="' + esc(logos[r.club]) + '" alt="" loading="lazy">' : '<span class="table-club-logo table-club-fallback">' + esc((r.club || '?').charAt(0).toUpperCase()) + '</span>') + '<span>' + esc(r.club) + '</span>' + relegationMark + '</span></td><td>' + esc(r.mp) + '</td><td>' + esc(r.w) + '</td><td>' + esc(r.d) + '</td><td>' + esc(r.l) + '</td><td>' + esc(r.gf) + '</td><td>' + esc(r.ga) + '</td><td class="pts">' + esc(r.pts) + '</td></tr>';
      }).join('');
    });
    $('tableBody').innerHTML = html;
  }

  // Teams
  function loadTeams() {
    db.from('league_clubs').select('id, club_name, logo_url').eq('is_active', true).order('club_name')
      .then(function (res) {
        if (res.error || !(res.data || []).length) { $('teamGrid').innerHTML = empty('Teams will appear here once they are added.'); return; }
        var clubs = (res.data || []).filter(function (c) { return !currentLeague || clubLeague[c.club_name] === currentLeague; });
        var mine = clubs.filter(function (c) { return myFavIds[c.id]; });
        var others = clubs.filter(function (c) { return !myFavIds[c.id]; });
        function card(c) {
          var on = !!myFavIds[c.id];
          return '<div class="team" role="button" tabindex="0" data-club="' + esc(c.id) + '" data-name="' + esc(c.club_name) + '">' + badge(c.logo_url, c.club_name) +
            '<span>' + esc(c.club_name) + '</span>' +
            '<button class="fav' + (on ? ' on' : '') + '" data-fav="' + esc(c.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' +
            (on ? 'Remove ' : 'Save ') + esc(c.club_name) + ' as a favourite">' + (on ? '★' : '☆') + '</button></div>';
        }
        var head = '<div class="favNote" style="grid-column:1/-1"><span id="favStatus" class="muted"></span></div>';
        var yours = mine.length ? '<h3 class="sub" style="grid-column:1/-1">Your clubs</h3>' + mine.map(card).join('') + '<h3 class="sub" style="grid-column:1/-1">All clubs</h3>' : '';
        var title = '<div class="teams-title" style="grid-column:1/-1"><h3 class="sub" style="margin:0">Participating clubs</h3><span class="muted">' + clubs.length + '</span></div>';
        $('teamGrid').innerHTML = head + title + yours + others.map(card).join('');
        document.querySelectorAll('[data-club]').forEach(function (el) {
          el.addEventListener('click', function () { loadSquadPublic(el.dataset.club, el.dataset.name); });
          el.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadSquadPublic(el.dataset.club, el.dataset.name); });
        });
        document.querySelectorAll('[data-fav]').forEach(function (b) {
          b.addEventListener('click', function (e) { e.stopPropagation(); toggleFav(b.dataset.fav, clubs); });
        });
        if (selectedClub) loadSquadPublic(selectedClub.id, selectedClub.name);
      });
  }

  // Favourite clubs: saved to the fan's account when signed in, otherwise on this device
  function localFavs() { try { return JSON.parse(localStorage.getItem('slfa_fav_clubs') || '[]'); } catch (e) { return []; } }
  function saveLocalFavs(list) { try { localStorage.setItem('slfa_fav_clubs', JSON.stringify(list)); } catch (e) {} }
  function loadFavs() {
    return db.auth.getUser().then(function (u) {
      if (!u.data || !u.data.user) {
        var list = localFavs();
        myFavIds = {}; myFavNames = {}; myFavList = list.slice();
        list.forEach(function (f) { myFavIds[f.id] = true; myFavNames[f.name] = true; });
        return;
      }
      return db.from('user_favorite_clubs').select('club_id, league_clubs(club_name)').eq('user_id', u.data.user.id).then(function (r) {
        myFavIds = {}; myFavNames = {}; myFavList = [];
        (r.data || []).forEach(function (f) {
          var name = f.league_clubs && f.league_clubs.club_name;
          if (!name) return;
          myFavIds[f.club_id] = true; myFavNames[name] = true; myFavList.push({ id: f.club_id, name: name });
        });
      });
    }).then(function () { loadTeams(); renderMyClub(); });
  }
  function refreshFavs() { loadFavs().then(function () { loadMatches(); }); }
  function toggleFav(clubId, clubs) {
    var status = function (t) { var el = document.getElementById('favStatus'); if (el) el.textContent = t; };
    db.auth.getUser().then(function (u) {
      if (!u.data || !u.data.user) {
        var on0 = !!myFavIds[clubId];
        var list = localFavs();
        if (on0) { list = list.filter(function (f) { return String(f.id) !== String(clubId); }); }
        else {
          var club = (clubs || []).find(function (c) { return String(c.id) === String(clubId); });
          if (club) list.push({ id: club.id, name: club.club_name });
        }
        saveLocalFavs(list);
        status(on0 ? 'Removed from your clubs.' : 'Saved on this device.');
        refreshFavs();
        return;
      }
      var on = !!myFavIds[clubId];
      window.slfaTrack('favourite_club');
      var q = on
        ? db.from('user_favorite_clubs').delete().eq('user_id', u.data.user.id).eq('club_id', clubId)
        : db.from('user_favorite_clubs').insert({ user_id: u.data.user.id, club_id: clubId });
      return q.then(function (r) {
        if (r.error) { status(r.error.message); return; }
        status(on ? 'Removed from your clubs.' : 'Saved to your clubs.');
        refreshFavs();
      });
    });
  }
  db.auth.onAuthStateChange(function () { refreshFavs(); });

  // My club: the fan's first favourite club, shown at the top of Matches
  function ensureMyClubCard() {
    var el = document.getElementById('myClubCard');
    if (!el) {
      var list = document.getElementById('matchList'); if (!list) return null;
      el = document.createElement('section'); el.id = 'myClubCard'; el.className = 'my-club-card'; el.hidden = true;
      list.parentNode.insertBefore(el, list);
    }
    return el;
  }
  function renderMyClub() {
    var box = ensureMyClubCard(); if (!box) return;
    var club = myFavList[0];
    if (!club) { box.hidden = true; box.innerHTML = ''; return; }
    var name = club.name;
    box.hidden = false;
    box.innerHTML = '<p class="my-club-eyebrow">MY CLUB</p><h3>' + esc(name) + '</h3><p class="muted">Loading…</p>';
    Promise.all([
      db.from('matches').select('id, match_date, home_team, away_team, home_score, away_score, match_status').eq('home_team', name).order('match_date', { ascending: false }).limit(30),
      db.from('matches').select('id, match_date, home_team, away_team, home_score, away_score, match_status').eq('away_team', name).order('match_date', { ascending: false }).limit(30),
      db.from('league_standings').select('pos').eq('club', name).limit(1)
    ]).then(function (all) {
      var inactive = { SCHEDULED: 1, RESCHEDULED: 1, POSTPONED: 1, CANCELLED: 1, ABANDONED: 1 };
      var all2 = (all[0].data || []).concat(all[1].data || []);
      var played = all2.filter(function (m) { return !inactive[m.match_status] && m.home_score != null && m.away_score != null; })
        .sort(function (a, b) { return new Date(b.match_date) - new Date(a.match_date); });
      var upcoming = all2.filter(function (m) { return inactive[m.match_status] && new Date(m.match_date) >= new Date(); })
        .sort(function (a, b) { return new Date(a.match_date) - new Date(b.match_date); });
      var pos = (all[2].data || [])[0];
      var form = played.slice(0, 5).map(function (m) {
        var home = m.home_team === name, mine = home ? m.home_score : m.away_score, theirs = home ? m.away_score : m.home_score;
        return mine > theirs ? 'W' : mine === theirs ? 'D' : 'L';
      }).reverse();
      var last = played[0], next = upcoming[0];
      var html = '<p class="my-club-eyebrow">MY CLUB</p><div class="my-club-head"><h3>' + esc(name) + '</h3>' +
        (pos ? '<span class="my-club-pos">Position ' + esc(pos.pos) + '</span>' : '') + '</div>';
      if (form.length) html += '<p class="slfa-form" aria-label="Form: ' + esc(form.join(' ')) + '">' + form.map(function (r) { return '<span class="slfa-form-' + r + '">' + r + '</span>'; }).join('') + '</p>';
      html += next
        ? '<p class="my-club-line"><span class="muted">Next</span> <strong>' + esc(next.home_team) + ' v ' + esc(next.away_team) + '</strong><br><small class="muted">' + esc(fmt(next.match_date)) + '</small></p>'
        : '<p class="my-club-line muted">No upcoming fixture yet.</p>';
      if (last) html += '<p class="my-club-line"><span class="muted">Last</span> <strong>' + esc(last.home_team) + ' ' + esc(last.home_score) + ' – ' + esc(last.away_score) + ' ' + esc(last.away_team) + '</strong></p>';
      html += '<button type="button" class="my-club-open">Open club page</button>';
      box.innerHTML = html;
      var btn = box.querySelector('.my-club-open');
      if (btn) btn.addEventListener('click', function () { if (window.slfaOpenClub) window.slfaOpenClub(name); });
    }).catch(function () { box.innerHTML = '<p class="my-club-eyebrow">MY CLUB</p><p class="muted">Your club information is temporarily unavailable.</p>'; });
  }

  // Squad for one club: approved, active players for the current season
  var selectedClub = null;
  var POS = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };
  function ensureSquadPanel() {
    var panel = $('squadPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'squadPanel';
      panel.className = 'card';
      panel.setAttribute('data-view', 'teams');
      var grid = $('teamGrid');
      if (grid && grid.parentNode) grid.parentNode.insertBefore(panel, grid.nextSibling);
    }
    return panel;
  }
  // Opens a club page from a club name anywhere in the app (standings, match cards, lineups)
  window.slfaOpenClub = function (name) {
    if (!name) return;
    var tab = document.querySelector('[data-tab="teams"]');
    if (tab) tab.click();
    db.from('league_clubs').select('id, club_name').eq('club_name', name).maybeSingle().then(function (r) {
      if (!r.data) return;
      loadSquadPublic(r.data.id, r.data.club_name);
      var panel = $('squadPanel');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  // Fixture to calendar (.ics), two hours long
  function icsFor(title, startIso, venue) {
    var start = new Date(startIso), end = new Date(start.getTime() + 2 * 3600 * 1000);
    var f = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SLFA League App//EN', 'BEGIN:VEVENT',
      'UID:' + f(start) + '-' + title.replace(/\W/g, '') + '@slfa-league-app', 'DTSTAMP:' + f(new Date()),
      'DTSTART:' + f(start), 'DTEND:' + f(end), 'SUMMARY:' + title, 'LOCATION:' + (venue || ''),
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  document.addEventListener('click', function (e) {
    var cal = e.target.closest && e.target.closest('.slfa-ics');
    if (cal) {
      var blob = new Blob([icsFor(cal.getAttribute('data-ics-title'), cal.getAttribute('data-ics-start'), cal.getAttribute('data-ics-venue'))], { type: 'text/calendar' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'slfa-fixture.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      return;
    }
    var share = e.target.closest && e.target.closest('[data-share-club]');
    if (share) {
      var club = share.getAttribute('data-share-club');
      var pos = document.querySelector('#squadPanel .slfa-club-position');
      var text = club + (pos ? ' · ' + pos.textContent : '') + ' · SLFA League App';
      var url = location.href.split('#')[0];
      if (navigator.share) { navigator.share({ title: 'SLFA League App', text: text, url: url }).catch(function () {}); }
      else { window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener'); }
      return;
    }
    var el = e.target.closest && e.target.closest('[data-open-club-name]');
    if (el && window.slfaOpenClub) { e.preventDefault(); window.slfaOpenClub(el.getAttribute('data-open-club-name')); }
  });
  document.addEventListener('keydown', function (e) {
    var el = e.target.closest && e.target.closest('[data-open-club-name]');
    if (el && e.key === 'Enter' && window.slfaOpenClub) window.slfaOpenClub(el.getAttribute('data-open-club-name'));
  });
  function loadSquadPublic(id, name) {
    selectedClub = { id: id, name: name };
    var panel = ensureSquadPanel();
    if (!panel) return;
    panel.innerHTML = '<h3 class="sub">' + esc(name) + '</h3><p class="muted">Loading…</p>';
    Promise.all([
      db.from('league_clubs').select('stadium, city, founded_year, about').eq('id', id).maybeSingle(),
      db.from('club_announcements').select('title, body, created_at').eq('club_id', id).order('created_at', { ascending: false }).limit(10),
      db.from('club_squad').select('id, player_name, position, photo_url, jersey_number').eq('club_id', id).order('jersey_number', { ascending: true, nullsFirst: false }).order('player_name'),
      db.from('suspensions').select('player_id, matches_total, matches_served').eq('status', 'ACTIVE'),
      db.from('disciplinary_actions').select('player_id, action_type, amount, currency, reason, decided_at').eq('published', true).order('decided_at', { ascending: false }).limit(200),
      db.from('motm_awards').select('player_id, awards').limit(500),
      db.from('matches').select('id, match_date, venue, home_team, away_team, home_score, away_score, match_status').eq('home_team', name).order('match_date', { ascending: false }).limit(30),
      db.from('matches').select('id, match_date, venue, home_team, away_team, home_score, away_score, match_status').eq('away_team', name).order('match_date', { ascending: false }).limit(30),
      db.from('league_standings').select('pos, club').eq('club', name).limit(1)
    ]).then(function (all) {
      var profile = all[0].data || {};
      var facts = [profile.stadium ? 'Ground: ' + profile.stadium : '', profile.city || '', profile.founded_year ? 'Founded ' + profile.founded_year : ''].filter(Boolean);
      var html = '<h3 class="sub">' + esc(name) + '</h3>' +
        '<button type="button" class="slfa-club-share" data-share-club="' + esc(name) + '" aria-label="Share ' + esc(name) + '">Share club ↗</button>';
      if (facts.length) html += '<p class="muted">' + facts.map(function (f) { return esc(f); }).join(' · ') + '</p>';
      if (profile.about) html += '<p>' + esc(profile.about) + '</p>';
      // Table position and this club's results and fixtures
      var inactive = { SCHEDULED: 1, RESCHEDULED: 1, POSTPONED: 1, CANCELLED: 1, ABANDONED: 1 };
      var fixtures = (all[6].data || []).concat(all[7].data || []).sort(function (a, b) { return new Date(b.match_date) - new Date(a.match_date); });
      var played = fixtures.filter(function (m) { return !inactive[m.match_status] && m.home_score != null && m.away_score != null; });
      var due = fixtures.filter(function (m) { return inactive[m.match_status] || m.home_score == null; }).sort(function (a, b) { return new Date(a.match_date) - new Date(b.match_date); });
      var fxRow = function (m) {
        var sc = (m.home_score != null && m.away_score != null) ? m.home_score + ' – ' + m.away_score : 'v';
        return '<div class="row"><span class="muted">' + esc(fmt(m.match_date)) + '</span><strong>' + esc(m.home_team) + ' ' + esc(sc) + ' ' + esc(m.away_team) + '</strong></div>';
      };
      var pos = (all[8].data || [])[0];
      if (pos) html += '<p class="slfa-club-position"><strong>League position: ' + esc(pos.pos) + '</strong></p>';
      // Form: last five results, oldest first, most recent last
      var formRuns = played.slice(0, 5).map(function (m) {
        var home = m.home_team === name, mine = home ? m.home_score : m.away_score, theirs = home ? m.away_score : m.home_score;
        return mine > theirs ? 'W' : mine === theirs ? 'D' : 'L';
      }).reverse();
      if (formRuns.length) html += '<p class="slfa-form" aria-label="Form: ' + esc(formRuns.join(' ')) + '">' + formRuns.map(function (r) {
        return '<span class="slfa-form-' + r + '">' + r + '</span>'; }).join('') + '</p>';
      if (played.length) html += '<h4 class="league-name">Results</h4>' + played.slice(0, 5).map(fxRow).join('');
      // Head-to-head: this club's record against each opponent it has played (all meetings on record)
      var h2h = {};
      played.forEach(function (m) {
        var home = m.home_team === name, opp = home ? m.away_team : m.home_team;
        var mine = home ? m.home_score : m.away_score, theirs = home ? m.away_score : m.home_score;
        var r = h2h[opp] || (h2h[opp] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
        r.p += 1; r.gf += mine; r.ga += theirs;
        if (mine > theirs) r.w += 1; else if (mine === theirs) r.d += 1; else r.l += 1;
      });
      var oppNames = Object.keys(h2h).sort(function (a, b) { return h2h[b].p - h2h[a].p || a.localeCompare(b); });
      if (oppNames.length) {
        html += '<h4 class="league-name">Head-to-head</h4><div class="scroll"><table class="table h2h"><thead><tr><th>Opponent</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th></tr></thead><tbody>' +
          oppNames.map(function (o) {
            var r = h2h[o];
            return '<tr><td>' + esc(o) + '</td><td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + r.gf + '</td><td>' + r.ga + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }
      if (due.length) html += '<h4 class="league-name">Fixtures</h4>' + due.slice(0, 3).map(function (m) {
        var t = m.home_team + ' v ' + m.away_team;
        return fxRow(m) + '<button type="button" class="slfa-ics" data-ics-start="' + esc(new Date(m.match_date).toISOString()) + '" data-ics-title="' + esc(t) + '" data-ics-venue="' + esc(m.venue || '') + '">Add to calendar</button>';
      }).join('');
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
          return '<div class="row player-profile-trigger" role="button" tabindex="0" data-profile-player="' + esc(x.player_name) + '" data-profile-club="' + esc(name) + '" data-profile-photo="' + esc(x.photo_url || '') + '" data-profile-position="' + esc(POS[x.position] || x.position || '') + '" data-profile-jersey="' + esc(x.jersey_number || '') + '">' + badge(x.photo_url, x.player_name) + '<span class="pname">' + (x.jersey_number ? '#' + esc(x.jersey_number) + ' ' : '') + esc(x.player_name) + '<small>' + esc(POS[x.position] || x.position) + (susp[x.id] ? ' · Suspended, ' + susp[x.id] + ' match' + (susp[x.id] === 1 ? '' : 'es') + ' left' : '') + (motmBy[x.id] ? ' · Man of the Match ×' + motmBy[x.id] : '') + '</small></span></div>';
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

  // Premium player statistics: public, read-only leaderboards from published statistics tables.
  function playerRows(rows, nameKey, valueKey, metric) {
    if (!rows || !rows.length) return empty('No published ' + metric.toLowerCase() + ' records yet.');
    return rows.map(function (r, i) {
      return '<article class="ps-row player-profile-trigger' + (i === 0 ? ' ps-leader' : '') + '" role="button" tabindex="0" data-profile-player="' + esc(r[nameKey]) + '" data-profile-club="' + esc(r.club || '') + '" data-profile-photo="' + esc(r.photo_url || '') + '">' +
        '<span class="ps-rank">' + (i === 0 ? '1' : i + 1) + '</span>' +
        badge(r.photo_url, r[nameKey]) +
        '<span class="ps-player"><strong>' + esc(r[nameKey]) + '</strong><small>' + esc(r.club || 'Club not listed') + '</small></span>' +
        '<span class="ps-value"><strong>' + esc(r[valueKey]) + '</strong><small>' + esc(metric) + '</small></span></article>';
    }).join('');
  }
  // Public list of players currently serving a suspension (status ACTIVE), league-wide.
  function loadSuspensions() {
    var box = $('suspensionsPublic');
    if (!box) return;
    db.from('suspensions').select('id, player_id, reason, matches_total, matches_served').eq('status', 'ACTIVE').order('id', { ascending: false }).limit(200).then(function (res) {
      if (res.error) { box.innerHTML = '<h3 class="ps-susp-title">Current suspensions</h3>' + empty('Suspensions are not available right now.'); return; }
      var active = (res.data || []).filter(function (s) { return Number(s.matches_total) > Number(s.matches_served); });
      var head = '<h3 class="ps-susp-title">Current suspensions</h3>';
      if (!active.length) { box.innerHTML = head + empty('No players are suspended right now.'); return; }
      var ids = active.map(function (s) { return s.player_id; });
      db.from('club_squad').select('id, player_name, league_clubs(club_name)').in('id', ids).then(function (sq) {
        var byId = {};
        (sq.data || []).forEach(function (x) { byId[x.id] = x; });
        box.innerHTML = head + active.map(function (s) {
          var p = byId[s.player_id] || {};
          var left = Number(s.matches_total) - Number(s.matches_served);
          var club = p.league_clubs ? p.league_clubs.club_name : '';
          return '<div class="post"><strong>' + esc(p.player_name || 'Player') + '</strong>' +
            (club ? ' · ' + esc(club) : '') +
            '<div class="muted">' + esc(left) + ' match' + (left === 1 ? '' : 'es') + ' left</div>' +
            (s.reason ? '<p>' + esc(s.reason) + '</p>' : '') + '</div>';
        }).join('');
      });
    });
  }
  function loadPlayers() {
    loadSuspensions();
    var sel = selectedSeason();
    if (sel && !sel.is_current) return loadPastPlayers(sel);
    var jobs = [
      db.from('top_scorers').select('player, club, goals, photo_url').order('goals', { ascending: false }).limit(500),
      db.from('top_assists').select('player, club, assists, photo_url').order('assists', { ascending: false }).limit(500),
      db.from('clean_sheets').select('goalkeeper, club, clean_sheets, photo_url').order('clean_sheets', { ascending: false }).limit(500),
      db.from('motm_awards').select('player, club, awards, photo_url').order('awards', { ascending: false }).limit(500)
    ];
    Promise.all(jobs).then(function (all) { renderPlayerStats(all, ''); }).catch(playerStatsFailed);
  }
  function playerStatsFailed() {
    ['scorers','assists','cleanSheets','motm'].forEach(function (id) { if ($(id)) $(id).innerHTML = empty('Player statistics are temporarily unavailable.'); });
  }
  // Past seasons: goals and assists are worked out per season; clean sheets and awards are not recorded per season.
  function loadPastPlayers(sel) {
    db.rpc('season_player_stats', { p_season_id: Number(sel.id) }).then(function (r) {
      if (r.error) { playerStatsFailed(); return; }
      var stats = r.data || {};
      var note = 'Not recorded for past seasons yet.';
      renderPlayerStats([
        { data: stats.scorers || [], error: null },
        { data: stats.assists || [], error: null },
        { data: [], error: null },
        { data: [], error: null }
      ], note);
    }).catch(playerStatsFailed);
  }
  function renderPlayerStats(all, pastNote) {
    var datasets = all.map(function (res) { return res.error ? [] : (res.data || []); });
    var scorers = inLeague(datasets[0]).sort(function (a,b) { return Number(b.goals || 0)-Number(a.goals || 0); }).slice(0,20);
    var assists = inLeague(datasets[1]).sort(function (a,b) { return Number(b.assists || 0)-Number(a.assists || 0); }).slice(0,20);
    var sheets = inLeague(datasets[2]).sort(function (a,b) { return Number(b.clean_sheets || 0)-Number(a.clean_sheets || 0); }).slice(0,20);
    var motm = inLeague(datasets[3]).sort(function (a,b) { return Number(b.awards || 0)-Number(a.awards || 0); }).slice(0,20);
    var summary = $('playerStatsSummary');
    if (summary) {
      var leaders = [
        {label:'Golden Boot',row:scorers[0],name:'player',value:'goals',unit:'goals'},
        {label:'Top Playmaker',row:assists[0],name:'player',value:'assists',unit:'assists'},
        {label:'Golden Glove',row:sheets[0],name:'goalkeeper',value:'clean_sheets',unit:'clean sheets'},
        {label:'Most Awards',row:motm[0],name:'player',value:'awards',unit:'awards'}
      ];
      summary.innerHTML = leaders.map(function (x) {
        return '<article class="ps-summary-card"><span>' + esc(x.label) + '</span>' +
          (x.row ? '<strong>' + esc(x.row[x.name]) + '</strong><small>' + esc(x.row[x.value]) + ' ' + esc(x.unit) + (x.row.club ? ' · ' + esc(x.row.club) : '') + '</small>' :
            '<strong>—</strong><small>Awaiting published statistics</small>') + '</article>';
      }).join('');
    }
    var panels = [
      {id:'scorers',title:'Golden Boot',subtitle:'Most goals scored',rows:scorers,name:'player',value:'goals',metric:'GOALS'},
      {id:'assists',title:'Playmakers',subtitle:'Most assists recorded',rows:assists,name:'player',value:'assists',metric:'ASSISTS'},
      {id:'cleanSheets',title:'Golden Glove',subtitle:'Most clean sheets',rows:sheets,name:'goalkeeper',value:'clean_sheets',metric:'CLEAN SHEETS'},
      {id:'motm',title:'Man of the Match',subtitle:'Most match awards',rows:motm,name:'player',value:'awards',metric:'AWARDS'}
    ];
    panels.forEach(function (x) {
      var box = $(x.id);
      if (!box) return;
      var unavailable = all[['scorers','assists','cleanSheets','motm'].indexOf(x.id)].error;
      box.innerHTML = '<div class="ps-panel-head"><div><span class="ps-eyebrow">PLAYER LEADERBOARD</span><h3>' + esc(x.title) + '</h3><p>' + esc(x.subtitle) + '</p></div><span class="ps-count">' + x.rows.length + ' ranked</span></div>' +
        (unavailable ? empty('This statistic is temporarily unavailable.') : (pastNote && (x.id === 'cleanSheets' || x.id === 'motm') ? empty(pastNote) : playerRows(x.rows,x.name,x.value,x.metric)));
    });
  }

  // News & announcements centre. Public viewers receive published posts only.
  var CAT_LABEL = { NEWS: 'News', PRESS_RELEASE: 'Press release', MATCH_REPORT: 'Match report', ANNOUNCEMENT: 'Announcement', FIXTURE: 'Fixture', RESULT: 'Result', PHOTO: 'Photo story' };
  var newsRows = [];
  function loadNews() {
    var news = db.from('media_posts').select('id, category, title, body, image_url, video_url, published_at, status, league_id')
      .eq('status', 'PUBLISHED');
    if (currentLeague) news = news.or('league_id.is.null,league_id.eq.' + currentLeague);
    news.order('published_at', { ascending: false }).limit(60)
      .then(function (res) {
        if (res.error) { $('newsItems').innerHTML = empty('News is temporarily unavailable. Please try again later.'); return; }
        newsRows = res.data || [];
        renderNewsCentre();
        var search = $('newsSearch'), category = $('newsCategory');
        if (search && !search.dataset.wired) {
          search.dataset.wired = '1';
          search.addEventListener('input', renderNewsCentre);
        }
        if (category && !category.dataset.wired) {
          category.dataset.wired = '1';
          category.addEventListener('change', renderNewsCentre);
        }
      });
  }
  function renderNewsCentre() {
    var search = $('newsSearch'), category = $('newsCategory');
    var term = search ? search.value.trim().toLowerCase() : '';
    var cat = category ? category.value : '';
    var rows = newsRows.filter(function (p) {
      var matchesCategory = !cat || p.category === cat;
      var haystack = String(p.title || '') + ' ' + String(p.body || '');
      return matchesCategory && (!term || haystack.toLowerCase().indexOf(term) !== -1);
    });
    var count = $('newsCount');
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' published update' : ' published updates') + (currentLeague ? ' · selected competition' : '');
    if (!rows.length) {
      $('newsItems').innerHTML = empty(newsRows.length ? 'No published updates match those filters.' : 'No news or announcements have been published yet.');
      return;
    }
    function card(p, featured) {
      var categoryName = CAT_LABEL[p.category] || 'News';
      var image = p.image_url ? '<img loading="lazy" src="' + esc(p.image_url) + '" alt="' + esc(p.title) + '">' : '';
      var body = p.body ? '<p>' + esc(p.body) + '</p>' : '';
      var video = p.video_url ? '<a class="news-watch" href="' + esc(p.video_url) + '" target="_blank" rel="noopener noreferrer">Watch related video ↗</a>' : '';
      return '<article class="news-card' + (featured ? ' news-card-featured' : '') + '">' + image +
        '<div class="news-card-content"><div class="news-card-meta"><span class="news-category">' + esc(categoryName) + '</span><time>' + esc(fmt(p.published_at)) + '</time></div>' +
        '<h3>' + esc(p.title) + '</h3>' + body + video +
        '<button type="button" class="share" data-title="' + esc(p.title) + '">Share update</button></div></article>';
    }
    $('newsItems').innerHTML = '<div class="news-featured-wrap">' + card(rows[0], true) + '</div>' +
      (rows.length > 1 ? '<div class="news-grid">' + rows.slice(1).map(function (p) { return card(p, false); }).join('') + '</div>' : '');
    wireShare();
  }

  // Video highlights and replays: published news posts that carry a video link
  function loadVideos() {
    if (window.slfaPremiumMediaLoad) { window.slfaPremiumMediaLoad(); return; }
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
  var ALERT_CATEGORIES = [
    { value: 'FIXTURES', label: 'New fixtures' },
    { value: 'KICKOFF', label: 'Kick-off alerts' },
    { value: 'GOALS', label: 'Goals' },
    { value: 'CARDS', label: 'Yellow and red cards' },
    { value: 'FULL_TIME', label: 'Full-time results' },
    { value: 'NEWS', label: 'League news' },
    { value: 'ANNOUNCEMENTS', label: 'Announcements' },
    { value: 'MATCH_UPDATES', label: 'Other match updates' }
  ];
  var DEFAULT_ALERT_TYPES = ALERT_CATEGORIES.map(function (x) { return x.value; });

  if (alertBtn) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      alertBtn.disabled = true;
      setAlertStatus('Alerts are not supported on this browser. On iPhone, add the app to your Home Screen first.');
    }
    alertBtn.addEventListener('click', function () {
      setAlertStatus('Checking this device…');
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
            alertBtn.textContent = 'Manage alerts';
            setAlertStatus('Alerts are on for this device. Choose the clubs and alert types you want.');
            showAlertPreferences(j.endpoint);
          });
        }).catch(function () { setAlertStatus('Could not turn on alerts. Please try again.'); });
      });
    });
  }

  // Each device can choose both the clubs and the types of league alerts it receives.
  function showAlertPreferences(endpoint) {
    var box = $('alertClubs');
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '<p class="muted">Loading alert preferences…</p>';

    Promise.all([
      db.from('league_clubs').select('club_name').eq('is_active', true).order('club_name'),
      db.rpc('get_push_preferences', { p_endpoint: endpoint })
    ]).then(function (results) {
      var clubsResult = results[0], prefResult = results[1];
      if (clubsResult.error) {
        box.innerHTML = '<p class="muted">The club list could not be loaded. Please try again.</p>';
        return;
      }

      var names = (clubsResult.data || []).map(function (c) { return c.club_name; });
      var pref = !prefResult.error && prefResult.data && prefResult.data[0] ? prefResult.data[0] : null;
      var savedClubs = pref ? pref.club_names : null;
      var savedTypes = pref && Array.isArray(pref.alert_types) ? pref.alert_types : DEFAULT_ALERT_TYPES.slice();
      var allClubs = !savedClubs;

      box.innerHTML =
        '<div class="alert-preferences">' +
          '<fieldset class="alert-clubs">' +
            '<legend>Clubs you follow</legend>' +
            '<label class="alert-clubs-all"><input type="checkbox" id="acAll"' + (allClubs ? ' checked' : '') + '> All clubs</label>' +
            '<div class="alert-clubs-list">' + names.map(function (n) {
              var checked = savedClubs && savedClubs.indexOf(n) !== -1;
              return '<label><input type="checkbox" class="acClub" value="' + esc(n) + '"' + (checked ? ' checked' : '') + (allClubs ? ' disabled' : '') + '> ' + esc(n) + '</label>';
            }).join('') + '</div>' +
          '</fieldset>' +
          '<fieldset class="alert-settings">' +
            '<legend>Notification types</legend>' +
            '<div class="alert-options-list">' + ALERT_CATEGORIES.map(function (x) {
              return '<label><input type="checkbox" class="acType" value="' + esc(x.value) + '"' + (savedTypes.indexOf(x.value) !== -1 ? ' checked' : '') + '> ' + esc(x.label) + '</label>';
            }).join('') + '</div>' +
          '</fieldset>' +
          '<button type="button" class="primary" id="acSave">Save alert preferences</button>' +
        '</div>';

      var all = box.querySelector('#acAll');
      all.addEventListener('change', function () {
        box.querySelectorAll('.acClub').forEach(function (c) {
          c.disabled = all.checked;
          if (all.checked) c.checked = false;
        });
      });

      box.querySelector('#acSave').addEventListener('click', function () {
        var pickedClubs = Array.prototype.slice.call(box.querySelectorAll('.acClub:checked')).map(function (c) { return c.value; });
        var pickedTypes = Array.prototype.slice.call(box.querySelectorAll('.acType:checked')).map(function (c) { return c.value; });
        if (!all.checked && !pickedClubs.length) { setAlertStatus('Choose at least one club, or select All clubs.'); return; }
        if (!pickedTypes.length) { setAlertStatus('Choose at least one notification type.'); return; }

        var save = box.querySelector('#acSave');
        save.disabled = true;
        setAlertStatus('Saving alert preferences…');
        db.rpc('set_push_preferences', {
          p_endpoint: endpoint,
          p_clubs: all.checked ? null : pickedClubs,
          p_alert_types: pickedTypes
        }).then(function (res) {
          save.disabled = false;
          setAlertStatus(res.error ? 'Could not save preferences. Please try again.' : 'Your alert preferences have been saved on this device.');
        });
      });
    }).catch(function () {
      box.innerHTML = '<p class="muted">Alert preferences could not be loaded. Please try again.</p>';
    });
  }

  // Show the preference manager immediately for a device that has already subscribed.
  if (alertBtn && 'serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (!sub) return;
      alertBtn.textContent = 'Manage alerts';
    }).catch(function () {});
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

  var appFreezeBanner = null;
  function refreshAll() {
    db.from('application_control').select('app_frozen').eq('id',1).maybeSingle().then(function(fr){
      var cached=null;
      if(!fr.error&&fr.data){cached=!!fr.data.app_frozen;try{localStorage.setItem('slfa_app_frozen_v1',String(cached));}catch(e){}}
      else if(!navigator.onLine){try{cached=localStorage.getItem('slfa_app_frozen_v1')==='true';}catch(e){}}
      // Fail closed while online if the maintenance flag cannot be verified.
      var frozen=fr.error||!fr.data ? (navigator.onLine||cached!==false) : cached;
      var area=$('public');
      if(frozen){
        if(!appFreezeBanner){appFreezeBanner=document.createElement('section');appFreezeBanner.id='appFreezeBanner';appFreezeBanner.className='card';appFreezeBanner.style.cssText='max-width:760px;margin:12vh auto;padding:40px 24px;text-align:center;border-top:5px solid #16834a';appFreezeBanner.innerHTML='<h2>Application temporarily unavailable</h2><p>The SLFA League App is undergoing maintenance or its security status cannot be verified. Please connect and try again later.</p>';if(area&&area.parentNode)area.parentNode.insertBefore(appFreezeBanner,area);}
        if(area)area.hidden=true;return;
      }
      if(appFreezeBanner){appFreezeBanner.remove();appFreezeBanner=null;}if(area)area.hidden=false;
      Promise.all([loadLeagueData(), loadSeasonData()]).then(function(){loadMatches();loadLive();loadMatchDay();loadTable();loadTeams();loadPlayers();loadNews();loadVideos();});
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
    ['matches', 'match_events', 'league_standings', 'league_clubs', 'club_squad', 'top_scorers', 'top_assists', 'clean_sheets', 'media_posts', 'application_control'].forEach(function (t) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleRefresh);
    });
    ch.subscribe();
    setInterval(refreshAll, 120000);
    setInterval(loadMatchDay, 120000);
  }

  // Premium interaction: pull to refresh, light tactile feedback, and goal and card alerts for favourite clubs
  var buzz = function (pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} };
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('button, .match[data-match], .team[data-club]')) buzz(8);
  });

  var pull = document.createElement('div');
  pull.className = 'pullHint'; pull.setAttribute('aria-live', 'polite');
  document.body.appendChild(pull);
  var pullY = null;
  function hidePull() { pull.classList.remove('show'); pull.style.transform = ''; }
  document.addEventListener('touchstart', function (e) {
    pullY = window.scrollY <= 0 && !document.querySelector('dialog[open]') ? e.touches[0].clientY : null;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (pullY == null) return;
    var dy = e.touches[0].clientY - pullY;
    if (dy <= 0) { hidePull(); return; }
    pull.classList.add('show');
    pull.style.transform = 'translateY(' + Math.min(dy * 0.5, 56) + 'px)';
    pull.textContent = dy > 70 ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (pullY == null) return;
    var dy = e.changedTouches[0].clientY - pullY;
    pullY = null;
    if (dy > 70) { pull.textContent = 'Refreshing…'; pull.style.transform = 'translateY(40px)'; buzz(12); refreshAll(); setTimeout(hidePull, 900); }
    else hidePull();
  });

  var toastEl = document.createElement('div');
  toastEl.className = 'toast'; toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  var toastTimer = null;
  function toast(text) {
    toastEl.textContent = text; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4500);
  }
  var ALERT_EVENTS = { GOAL: 'Goal', YELLOW_CARD: 'Yellow card', RED_CARD: 'Red card' };
  function favAlert(e) {
    var label = ALERT_EVENTS[String(e.event_type).toUpperCase()];
    if (!label || !myFavNames[e.team_name]) return;
    buzz(e.event_type === 'GOAL' ? [60, 40, 60] : 40);
    toast(label + ' for ' + e.team_name + (e.player_name ? ': ' + e.player_name : '') + (e.minute != null ? ' (' + e.minute + "')" : ''));
  }
  db.channel('favourite-alerts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_events' }, function (p) { if (p && p.new) favAlert(p.new); })
    .subscribe();

  if ($('seasonPick')) $('seasonPick').addEventListener('change', function () { setSeason(this.value); });
  refreshAll();
  subscribeLive();
  loadFavs();
})();
