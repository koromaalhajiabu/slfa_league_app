/* Premium public League Pages. Read-only presentation of published SLFA competition data. */
(function () {
  'use strict';
  var db = window.slfaDb;
  var nav = document.querySelector('.tabs');
  var switcher = document.getElementById('leagueSwitch');
  var host;
  if (!db || !nav || !switcher) return;

  var leagues = [], clubs = [], matches = [], standings = [];
  var selectedId = '';
  var loading = false, lastLoaded = 0;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function currentId() {
    try { return localStorage.getItem('slfa_league') || ''; } catch (e) { return ''; }
  }
  function dateLabel(v) {
    if (!v) return 'Date to be confirmed';
    var d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString(undefined, {
      weekday:'short', day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
  }
  function completed(m) {
    return String(m.match_status || '').toUpperCase() === 'FT' ||
      (m.home_score != null && m.away_score != null && !['SCHEDULED','RESCHEDULED','POSTPONED','CANCELLED'].includes(String(m.match_status || '').toUpperCase()));
  }
  function upcoming(m) {
    return ['SCHEDULED','RESCHEDULED'].includes(String(m.match_status || '').toUpperCase());
  }
  var CLUB_LOGO_FALLBACKS = {
    baiburehwarriors: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Bai%20Burah%20Warrior%20FC%20Logo.jpeg',
    bhantalfc: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Bhantal%20FC%20Logo.jpeg',
    borangers: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Bo%20Rangers.png',
    bullomstars: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Bullom%20Stars%20Logo.png',
    kallon: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Kallon_FC.jpg',
    kamboieagles: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Kambo%20Eagles%20Logo.png',
    mightyblackpool: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Mighty%20Blackpool%20Logo.png',
    oldedwardians: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Old%20Edwardian%20Logo.png',
    ports: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Port%20Authority%20Logo.png',
    starsportacademy: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Star%20Sport%20Logo.png',
    waterloofc: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/waterloo%20fc.jpeg',
    wilberforcestrikers: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Wilberforce%20Strikers%20Logo.png',
    wusumstars: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/Wusum%20Stars%20Logo.png',
    diamondstars: 'https://images.seeklogo.com/logo-png/63/1/diamond-stars-fc-logo-png_seeklogo-638347.png',
    eastendlions: 'https://pbs.twimg.com/profile_images/1640109457047711746/tdyyWD6m_400x400.jpg',
    westernunited: 'https://wufcsl.com/wp-content/uploads/2026/08/logo-circle-crop.png'
  };
  function clubLogoFallback(name) {
    var key = String(name || '').toLowerCase().replace(/\bfc\b/g, '').replace(/[^a-z0-9]/g, '');
    if (key === 'portsauthority') key = 'ports';
    if (key === 'starssa' || key === 'starsport') key = 'starsportacademy';
    return CLUB_LOGO_FALLBACKS[key] || '';
  }
  function clubBadge(c) {
    var logo = c.logo_url || clubLogoFallback(c.club_name);
    return logo
      ? '<img class="slfa-lp-badge" src="' + esc(logo) + '" alt="" loading="lazy">'
      : '<span class="slfa-lp-badge slfa-lp-placeholder">' + esc((c.club_name || '?').charAt(0).toUpperCase()) + '</span>';
  }
  function selectedLeague() {
    var id = currentId();
    return leagues.find(function (l) { return String(l.id) === String(id); }) || null;
  }
  function kpi(value, label, note) {
    return '<div class="slfa-lp-kpi"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span>' +
      (note ? '<small>' + esc(note) + '</small>' : '') + '</div>';
  }
  function matchClub(name) {
    return clubs.find(function (c) { return c.club_name === name; }) || { club_name: name, logo_url: '' };
  }
  function matchTeam(name) {
    var c = matchClub(name);
    return '<span class="slfa-lp-match-team">' + clubBadge(c) + '<span>' + esc(name) + '</span></span>';
  }
  function matchRow(m) {
    var hasScore = m.home_score != null && m.away_score != null;
    var score = hasScore ? '<b>' + esc(m.home_score) + ' : ' + esc(m.away_score) + '</b>' : '<b class="slfa-lp-vs">VS</b>';
    var state = String(m.match_status || '').toUpperCase();
    var tag = state === 'FT' ? 'FULL TIME' : state === 'LIVE' ? 'LIVE' : state === 'HT' ? 'HALF TIME' :
      state === 'RESCHEDULED' ? 'RESCHEDULED' : 'UPCOMING';
    return '<article class="slfa-lp-match"><div class="slfa-lp-match-meta"><span>' + esc(tag) + '</span><time>' + esc(dateLabel(m.match_date)) + '</time></div>' +
      '<div class="slfa-lp-match-teams">' + matchTeam(m.home_team) + score + matchTeam(m.away_team) + '</div>' +
      '<div class="slfa-lp-match-venue">' + esc(m.venue || 'Venue to be confirmed') + '</div></article>';
  }
  function renderDirectory() {
    var cards = leagues.map(function (l) {
      var id = String(l.id), teamCount = clubs.filter(function (c) { return String(c.league_id) === id; }).length;
      var games = matches.filter(function (m) { return String(m.league_id) === id; });
      var played = games.filter(completed), goals = played.reduce(function (n,m) {
        return n + (Number(m.home_score) || 0) + (Number(m.away_score) || 0);
      }, 0);
      return '<button type="button" class="slfa-lp-league-card" data-open-league="' + esc(id) + '">' +
        '<span class="slfa-lp-card-icon" aria-hidden="true">⚽</span><span class="slfa-lp-card-copy"><strong>' + esc(l.name) +
        '</strong><small>Public competition information</small><span class="slfa-lp-card-stats">' + teamCount + ' clubs · ' + played.length +
        ' completed · ' + goals + ' goals</span></span><span class="slfa-lp-arrow" aria-hidden="true">›</span></button>';
    }).join('');
    host.innerHTML = '<section class="slfa-league-pages"><div class="slfa-lp-hero"><div><p class="slfa-lp-eyebrow">SIERRA LEONE FOOTBALL ASSOCIATION</p>' +
      '<h3>League Pages</h3><p>Explore competitions, clubs, standings and match information.</p></div><span class="slfa-lp-hero-mark">SLFA</span></div>' +
      '<div class="slfa-lp-section-head"><div><span>COMPETITION DIRECTORY</span><h4>All leagues</h4></div><small>' + leagues.length + ' competitions</small></div>' +
      (cards ? '<div class="slfa-lp-directory">' + cards + '</div>' : '<p class="slfa-lp-empty">No public competitions are currently listed.</p>') +
      '<p class="slfa-lp-source">Competition information is displayed from records published in the SLFA League App.</p></section>';
    host.querySelectorAll('[data-open-league]').forEach(function (b) {
      b.addEventListener('click', function () { chooseLeague(b.getAttribute('data-open-league')); });
    });
  }
  function renderLeague(lg) {
    var id = String(lg.id);
    var teamRows = clubs.filter(function (c) { return String(c.league_id) === id; }).sort(function (a,b) {
      return String(a.club_name).localeCompare(String(b.club_name));
    });
    var games = matches.filter(function (m) { return String(m.league_id) === id; });
    var played = games.filter(completed);
    var next = games.filter(upcoming).sort(function (a,b) { return new Date(a.match_date)-new Date(b.match_date); });
    var recent = played.sort(function (a,b) { return new Date(b.match_date)-new Date(a.match_date); });
    var goals = played.reduce(function (n,m) { return n + (Number(m.home_score)||0) + (Number(m.away_score)||0); }, 0);
    var table = standings.filter(function (r) { return String(r.league_id) === id; }).sort(function (a,b) {
      return Number(a.pos)-Number(b.pos);
    });
    var clubCards = teamRows.map(function (c) {
      var facts = [c.city, c.stadium ? 'Home: ' + c.stadium : '', c.founded_year ? 'Est. ' + c.founded_year : ''].filter(Boolean);
      return '<button type="button" class="slfa-lp-club slfa-lp-club-link" data-open-club="' + esc(c.id) + '">' + clubBadge(c) + '<span><strong>' + esc(c.club_name) + '</strong>' +
        (facts.length ? '<small>' + esc(facts.join(' · ')) + '</small>' : '<small>View club profile</small>') + '</span><span class="slfa-lp-club-arrow" aria-hidden="true">›</span></button>';
    }).join('');
    var tableHtml = table.length ? '<div class="slfa-lp-table-wrap"><table class="slfa-lp-table"><thead><tr><th>#</th><th>Club</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>' +
      table.map(function (r) {
        var gd = Number(r.gf || 0) - Number(r.ga || 0);
        return '<tr><td>' + esc(r.pos) + '</td><td class="club"><span class="slfa-lp-table-club">' + clubBadge(matchClub(r.club)) + '<span>' + esc(r.club) + '</span></span></td><td>' + esc(r.mp) + '</td><td>' + esc(r.w) +
          '</td><td>' + esc(r.d) + '</td><td>' + esc(r.l) + '</td><td>' + esc(r.gf) + '</td><td>' + esc(r.ga) +
          '</td><td>' + (gd > 0 ? '+' : '') + gd + '</td><td class="pts">' + esc(r.pts) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="slfa-lp-empty">The official standings will appear here when published.</p>';
    host.innerHTML = '<section class="slfa-league-pages"><div class="slfa-lp-hero"><div><p class="slfa-lp-eyebrow">SLFA COMPETITION PROFILE</p>' +
      '<h3>' + esc(lg.name) + '</h3><p>Competition overview, participating clubs and published league information.</p></div><span class="slfa-lp-hero-mark">SLFA</span></div>' +
      '<div class="slfa-lp-detail-actions"><button type="button" id="slfaLpAll">‹ All competitions</button><span>Public information</span></div>' +
      '<div class="slfa-lp-kpis">' + kpi(teamRows.length,'Participating clubs') + kpi(played.length,'Matches completed') +
      kpi(goals,'Goals recorded') + kpi(next.length,'Upcoming fixtures') + '</div>' +
      '<section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>LEAGUE TABLE</span><h4>Current standings</h4></div><small>' + (table.length ? table.length + ' clubs' : 'Awaiting publication') + '</small></div>' +
      tableHtml + '<p class="slfa-lp-note">Goal difference is calculated from goals for minus goals against.</p></section>' +
      '<div class="slfa-lp-two-col"><section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>THE COMPETITION</span><h4>Participating clubs</h4></div><small>' + teamRows.length + '</small></div>' +
      (clubCards ? '<div class="slfa-lp-clubs">' + clubCards + '</div>' : '<p class="slfa-lp-empty">Club information has not been published yet.</p>') + '</section>' +
      '<div class="slfa-lp-match-panels"><section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>MATCH CENTRE</span><h4>Latest results</h4></div></div>' +
      (recent.length ? recent.slice(0,3).map(matchRow).join('') : '<p class="slfa-lp-empty">No completed results published yet.</p>') + '</section>' +
      '<section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>UP NEXT</span><h4>Upcoming fixtures</h4></div></div>' +
      (next.length ? next.slice(0,3).map(matchRow).join('') : '<p class="slfa-lp-empty">No upcoming fixtures published yet.</p>') + '</section></div></div>' +
      '<p class="slfa-lp-source">Match results, standings and club information reflect the records currently published in the SLFA League App. Official updates are subject to SLFA publication.</p></section>';
    var back = document.getElementById('slfaLpAll');
    if (back) back.addEventListener('click', renderDirectory);
    host.querySelectorAll('[data-open-club]').forEach(function (b) {
      b.addEventListener('click', function () {
        var club = teamRows.find(function (c) { return String(c.id) === String(b.getAttribute('data-open-club')); });
        if (club) renderClubProfile(club, lg);
      });
    });
  }
  function clubKey(value) {
    return String(value || '').toLowerCase().replace(/\bfc\b/g, '').replace(/[^a-z0-9]/g, '');
  }
  function sameClub(a, b) { return clubKey(a) === clubKey(b); }
  function renderClubProfile(club, lg) {
    var id = String(lg.id), name = club.club_name;
    var clubGames = matches.filter(function (m) {
      return String(m.league_id) === id && (sameClub(m.home_team, name) || sameClub(m.away_team, name));
    });
    var played = clubGames.filter(completed).sort(function (a,b) { return new Date(b.match_date)-new Date(a.match_date); });
    var next = clubGames.filter(upcoming).sort(function (a,b) { return new Date(a.match_date)-new Date(b.match_date); });
    var stats = {w:0,d:0,l:0,gf:0,ga:0};
    played.forEach(function (m) {
      var home = sameClub(m.home_team, name), gf = Number(home ? m.home_score : m.away_score) || 0;
      var ga = Number(home ? m.away_score : m.home_score) || 0;
      stats.gf += gf; stats.ga += ga;
      if (gf > ga) stats.w++; else if (gf === ga) stats.d++; else stats.l++;
    });
    var standing = standings.find(function (r) {
      return String(r.league_id) === id && sameClub(r.club, name);
    });
    var position = standing && standing.pos != null ? standing.pos : '—';
    var facts = [club.city, club.stadium ? 'Home ground: ' + club.stadium : '', club.founded_year ? 'Established ' + club.founded_year : ''].filter(Boolean);
    host.innerHTML = '<section class="slfa-league-pages slfa-lp-profile"><div class="slfa-lp-hero"><div><p class="slfa-lp-eyebrow">OFFICIAL COMPETITION CLUB</p><h3>' + esc(name) + '</h3><p>' + esc(lg.name) + '</p></div>' + clubBadge(club) + '</div>' +
      '<div class="slfa-lp-detail-actions"><button type="button" id="slfaLpClubBack">‹ Back to ' + esc(lg.name) + '</button><span>Public club profile</span></div>' +
      '<div class="slfa-lp-profile-intro"><div>' + clubBadge(club) + '</div><section><h4>' + esc(name) + '</h4><p>' + esc(facts.join(' · ') || 'Club information published for this competition') + '</p></section></div>' +
      '<div class="slfa-lp-kpis">' + kpi(position,'League position') + kpi(played.length,'Matches played') + kpi(stats.w + '–' + stats.d + '–' + stats.l,'W · D · L') + kpi(stats.gf + ' : ' + stats.ga,'Goals for · against') + '</div>' +
      '<section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>COMPETITION PERFORMANCE</span><h4>Season record</h4></div><small>' + esc(lg.name) + '</small></div>' +
      '<div class="slfa-lp-record"><div><strong>' + stats.w + '</strong><span>Wins</span></div><div><strong>' + stats.d + '</strong><span>Draws</span></div><div><strong>' + stats.l + '</strong><span>Losses</span></div><div><strong>' + (stats.gf-stats.ga > 0 ? '+' : '') + (stats.gf-stats.ga) + '</strong><span>Goal difference</span></div><div><strong>' + (standing && standing.pts != null ? standing.pts : '—') + '</strong><span>Points</span></div></div></section>' +
      '<div class="slfa-lp-profile-matches"><section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>RECENT FORM</span><h4>Latest results</h4></div></div>' +
      (played.length ? played.slice(0,5).map(matchRow).join('') : '<p class="slfa-lp-empty">No completed results published for this club yet.</p>') + '</section>' +
      '<section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>COMING UP</span><h4>Upcoming fixtures</h4></div></div>' +
      (next.length ? next.slice(0,5).map(matchRow).join('') : '<p class="slfa-lp-empty">No upcoming fixtures published for this club.</p>') + '</section></div>' +
      '<p class="slfa-lp-source">Club statistics are calculated from published match results in this competition. Unpublished information is not displayed.</p></section>';
    var back = document.getElementById('slfaLpClubBack');
    if (back) back.addEventListener('click', function () { renderLeague(lg); });
  }
  function render() {
    selectedId = currentId();
    var lg = selectedLeague();
    if (lg) renderLeague(lg); else renderDirectory();
  }
  function chooseLeague(id) {
    var chip = switcher.querySelector('[data-league="' + String(id).replace(/"/g,'') + '"]');
    if (chip) chip.click();
    else { try { localStorage.setItem('slfa_league', String(id)); } catch (e) {} }
    activateTab();
    window.setTimeout(render, 120);
  }
  function activateTab() {
    nav.querySelectorAll('[data-tab]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === 'leagues'));
    });
    document.querySelectorAll('[data-view]').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== 'leagues'; });
    if (host) host.hidden = false;
  }
  function load() {
    if (loading) return;
    loading = true;
    host.innerHTML = '<section class="slfa-league-pages"><div class="slfa-lp-loading">Loading public competition information…</div></section>';
    Promise.all([
      db.from('leagues').select('id,name').eq('is_active',true).order('sort_order'),
      db.from('league_clubs').select('id,league_id,club_name,logo_url,stadium,city,founded_year').eq('is_active',true).order('club_name'),
      db.from('matches').select('id,league_id,match_date,venue,match_status,home_team,away_team,home_score,away_score').order('match_date',{ascending:false}).limit(1000),
      db.from('league_standings').select('league_id,pos,club,mp,w,d,l,gf,ga,pts').order('pos',{ascending:true})
    ]).then(function (r) {
      leagues = r[0].error ? [] : (r[0].data || []);
      clubs = r[1].error ? [] : (r[1].data || []);
      matches = r[2].error ? [] : (r[2].data || []);
      standings = r[3].error ? [] : (r[3].data || []);
      lastLoaded = Date.now();
      render();
      if (r.some(function (x) { return !!x.error; })) {
        var warning = document.createElement('p');
        warning.className = 'slfa-lp-source';
        warning.textContent = 'Some competition information could not be loaded. Please try again when connected.';
        host.querySelector('.slfa-league-pages').appendChild(warning);
      }
    }).catch(function () {
      host.innerHTML = '<section class="slfa-league-pages"><p class="slfa-lp-empty">Competition information is temporarily unavailable. Please try again.</p></section>';
    }).then(function () { loading = false; });
  }

  var tab = document.createElement('button');
  tab.type = 'button'; tab.setAttribute('role','tab'); tab.setAttribute('data-tab','leagues');
  tab.setAttribute('aria-selected','false'); tab.textContent = 'Leagues';
  var matchesTab = nav.querySelector('[data-tab="matches"]');
  nav.insertBefore(tab, matchesTab ? matchesTab.nextSibling : null);
  host = document.createElement('div');
  host.className = 'view card slfa-lp-host'; host.id = 'leaguePages'; host.setAttribute('data-view','leagues'); host.hidden = true;
  var matchView = document.getElementById('matchList');
  if (matchView && matchView.parentNode) matchView.parentNode.insertBefore(host, matchView.nextSibling);
  tab.addEventListener('click', function () { activateTab(); if (!lastLoaded || Date.now()-lastLoaded>60000) load(); else render(); });
  switcher.addEventListener('click', function () { window.setTimeout(function () { if (!host.hidden) render(); }, 90); });
  if (db.channel) db.channel('public-league-pages').on('postgres_changes',{event:'*',schema:'public',table:'leagues'},load)
    .on('postgres_changes',{event:'*',schema:'public',table:'league_clubs'},load)
    .on('postgres_changes',{event:'*',schema:'public',table:'matches'},load)
    .on('postgres_changes',{event:'*',schema:'public',table:'league_standings'},load).subscribe();
  window.addEventListener('online',function(){ if(!host.hidden)load(); });
  load();
})();