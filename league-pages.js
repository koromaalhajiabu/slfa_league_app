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
    mogbwemoqueens: 'logos/women/mogbwemo-queens-fc.jpg',
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
      bamoiqueen: 'bamoiqueens', bamoiqueensfc: 'bamoiqueens',
      fckallonfemale: 'kallonfemale', kallonwomen: 'kallonfemale',
      jonathanchildcarefc: 'jonathanchildcare',
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
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('kallon') !== -1 && /(female|women|ladies)/.test(raw)) key = 'kallonfemale';
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('police') !== -1) key = 'sierraleonepolicefemale';
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('patricia') !== -1) key = 'patriciaumustrikers';
    if (!WOMENS_CLUB_LOGOS[key] && key.indexOf('vem') !== -1 && key.indexOf('buck') !== -1) key = 'vembuck';
    return WOMENS_CLUB_LOGOS[key] || CLUB_LOGO_FALLBACKS[key] || '';
  }
  function isSlfaLogoUrl(url) { return String(url || '').toLowerCase().indexOf('slfa-logo') !== -1; }
  function clubBadge(c) {
    var fallback = clubLogoFallback(c.club_name);
    var logo = (isSlfaLogoUrl(c.logo_url) ? '' : (c.logo_url || '')) || fallback;
    var initial = esc((c.club_name || '?').charAt(0).toUpperCase());
    return logo
      ? '<img class="slfa-lp-badge" src="' + esc(logo) + '" data-fallback="' + esc(c.logo_url && fallback && c.logo_url !== fallback ? fallback : '') + '" alt="" loading="lazy" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=\'\';}else{this.hidden=true;this.nextElementSibling.hidden=false;}"><span class="slfa-lp-badge slfa-lp-placeholder" hidden>' + initial + '</span>'
      : '<span class="slfa-lp-badge slfa-lp-placeholder">' + initial + '</span>';
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
    return clubs.find(function (c) { return sameClub(c.club_name, name); }) || { club_name: name, logo_url: '' };
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
    host.innerHTML = '<section class="slfa-league-pages"><div class="slfa-lp-hero"><div><p class="slfa-lp-eyebrow">SLFA COMPETITION PROFILE</p>' +
      '<h3>' + esc(lg.name) + '</h3><p>Competition overview and published league information. Participating clubs are listed under Teams.</p></div>' +
      (String(lg.name || '').toLowerCase().indexOf('marampa') !== -1 && String(lg.name || '').toLowerCase().indexOf('women') !== -1
        ? '<img class="slfa-lp-competition-logo" src="league-logos/marampa-mines-womens-premier-league.jpg" alt="Marampa Mines Women\'s Premier League logo" loading="lazy">'
        : String(lg.name || '').toLowerCase().indexOf('leone rock') !== -1
        ? '<img class="slfa-lp-competition-logo" src="league-logos/leone-rock-premier-league.jpg" alt="Leone Rock Premier League logo" loading="lazy">'
        : '<span class="slfa-lp-hero-mark">SLFA</span>') + '</div>' +
      '<div class="slfa-lp-detail-actions"><button type="button" id="slfaLpAll">‹ All competitions</button><span>Public information</span></div>' +
      '<div class="slfa-lp-kpis">' + kpi(teamRows.length,'Participating clubs') + kpi(played.length,'Matches completed') +
      kpi(goals,'Goals recorded') + kpi(next.length,'Upcoming fixtures') + '</div>' +
      '<div class="slfa-lp-match-panels"><section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>MATCH CENTRE</span><h4>Latest results</h4></div></div>' +
      (recent.length ? recent.slice(0,3).map(matchRow).join('') : '<p class="slfa-lp-empty">No completed results published yet.</p>') + '</section>' +
      '<section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>UP NEXT</span><h4>Upcoming fixtures</h4></div></div>' +
      (next.length ? next.slice(0,3).map(matchRow).join('') : '<p class="slfa-lp-empty">No upcoming fixtures published yet.</p>') + '</section></div>' +
      '<p class="slfa-lp-source">Match results, standings and club information reflect the records currently published in the SLFA League App. Official updates are subject to SLFA publication.</p></section>';
    var back = document.getElementById('slfaLpAll');
    if (back) back.addEventListener('click', renderDirectory);
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
      '<div class="slfa-lp-profile-intro"><div>' + clubBadge(club) + '</div><section><h4>' + esc(name) + '</h4><p>' + esc(facts.join(' · ') || 'Club information published for this competition') + '</p>' + (club.about ? '<p class="slfa-lp-club-about">' + esc(club.about) + '</p>' : '') + '</section></div>' +
      '<div class="slfa-lp-kpis">' + kpi(position,'League position') + kpi(played.length,'Matches played') + kpi(stats.w + '–' + stats.d + '–' + stats.l,'W · D · L') + kpi(stats.gf + ' : ' + stats.ga,'Goals for · against') + '</div>' +
      '<section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>COMPETITION PERFORMANCE</span><h4>Season record</h4></div><small>' + esc(lg.name) + '</small></div>' +
      '<div class="slfa-lp-record"><div><strong>' + stats.w + '</strong><span>Wins</span></div><div><strong>' + stats.d + '</strong><span>Draws</span></div><div><strong>' + stats.l + '</strong><span>Losses</span></div><div><strong>' + (stats.gf-stats.ga > 0 ? '+' : '') + (stats.gf-stats.ga) + '</strong><span>Goal difference</span></div><div><strong>' + (standing && standing.pts != null ? standing.pts : '—') + '</strong><span>Points</span></div></div></section>' +
      '<section class="slfa-lp-panel slfa-lp-squad-panel"><div class="slfa-lp-section-head"><div><span>FIRST TEAM</span><h4>Club squad</h4></div><small id="slfaLpSquadCount">Loading players…</small></div><div id="slfaLpSquad" class="slfa-lp-squad-grid"><p class="slfa-lp-empty">Loading approved player profiles…</p></div></section>' +
      '<section class="slfa-lp-panel slfa-lp-announcements-panel"><div class="slfa-lp-section-head"><div><span>CLUB UPDATES</span><h4>Latest announcements</h4></div></div><div id="slfaLpAnnouncements"><p class="slfa-lp-empty">Loading club updates…</p></div></section>' +
      '<div class="slfa-lp-profile-matches"><section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>RECENT FORM</span><h4>Latest results</h4></div></div>' +
      (played.length ? played.slice(0,5).map(matchRow).join('') : '<p class="slfa-lp-empty">No completed results published for this club yet.</p>') + '</section>' +
      '<section class="slfa-lp-panel"><div class="slfa-lp-section-head"><div><span>COMING UP</span><h4>Upcoming fixtures</h4></div></div>' +
      (next.length ? next.slice(0,5).map(matchRow).join('') : '<p class="slfa-lp-empty">No upcoming fixtures published for this club.</p>') + '</section></div>' +
      '<p class="slfa-lp-source">Club statistics are calculated from published match results in this competition. Unpublished information is not displayed.</p></section>';
    var back = document.getElementById('slfaLpClubBack');
    if (back) back.addEventListener('click', function () { renderLeague(lg); });
    var squadHost = document.getElementById('slfaLpSquad');
    var squadCount = document.getElementById('slfaLpSquadCount');
    var announcementsHost = document.getElementById('slfaLpAnnouncements');
    Promise.all([
      db.from('club_squad').select('id,player_name,position,photo_url,jersey_number').eq('club_id',String(club.id)).order('jersey_number',{ascending:true,nullsFirst:false}).order('player_name'),
      db.from('club_announcements').select('title,body,created_at').eq('club_id',String(club.id)).order('created_at',{ascending:false}).limit(5)
    ]).then(function(results){
      if(!document.getElementById('slfaLpSquad'))return;
      var players=results[0].error?[]:(results[0].data||[]);
      if(squadCount)squadCount.textContent=results[0].error?'Unavailable':players.length+' players';
      if(squadHost){
        squadHost.innerHTML=results[0].error?'<p class="slfa-lp-empty">The squad is temporarily unavailable.</p>':
          (players.length?players.map(function(p){
            var pos=String(p.position||'').replace(/_/g,' ');
            var photo=p.photo_url?'<img class="slfa-lp-player-photo" src="'+esc(p.photo_url)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false;"><span class="slfa-lp-player-initial" hidden>'+esc((p.player_name||'?').charAt(0).toUpperCase())+'</span>':
              '<span class="slfa-lp-player-initial">'+esc((p.player_name||'?').charAt(0).toUpperCase())+'</span>';
            return '<button type="button" class="slfa-lp-player-card" data-profile-player="'+esc(p.player_name)+'" data-profile-id="'+esc(p.id)+'" data-profile-club="'+esc(name)+'" data-profile-photo="'+esc(p.photo_url||'')+'" data-profile-position="'+esc(pos)+'" data-profile-jersey="'+esc(p.jersey_number||'')+'">'+
              '<span class="slfa-lp-player-portrait">'+photo+'</span><span class="slfa-lp-player-name">'+(p.jersey_number?'#'+esc(p.jersey_number)+' ':'')+esc(p.player_name)+'</span><small>'+esc(pos||'Squad member')+'</small></button>';
          }).join(''):'<p class="slfa-lp-empty">No approved players have been published for this club yet.</p>');
      }
      var announcements=results[1].error?[]:(results[1].data||[]);
      if(announcementsHost)announcementsHost.innerHTML=results[1].error?'<p class="slfa-lp-empty">Club updates are temporarily unavailable.</p>':
        (announcements.length?announcements.map(function(a){
          var when=a.created_at?new Date(a.created_at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'';
          return '<article class="slfa-lp-announcement"><strong>'+esc(a.title)+'</strong>'+(when?'<time>'+esc(when)+'</time>':'')+(a.body?'<p>'+esc(a.body)+'</p>':'')+'</article>';
        }).join(''):'<p class="slfa-lp-empty">No public club announcements yet.</p>');
    }).catch(function(){
      if(squadHost)squadHost.innerHTML='<p class="slfa-lp-empty">Club information is temporarily unavailable.</p>';
      if(announcementsHost)announcementsHost.innerHTML='<p class="slfa-lp-empty">Club updates are temporarily unavailable.</p>';
    });
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
      db.from('league_clubs').select('id,league_id,club_name,logo_url,stadium,city,founded_year,about').eq('is_active',true).order('club_name'),
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