/* Premium public Match Centre. Read-only; uses the existing public tables. */
(function () {
  'use strict';
  var db = window.slfaDb, host = document.getElementById('matchList');
  if (!db || !host) return;
  var matches = [], leagueNames = {}, clubLogos = {}, liveEvents = [], filter = 'all', chosenDate = '', chosenClub = '', updated = null, timer, fetchTimer;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function league() { try { return localStorage.getItem('slfa_league') || ''; } catch (e) { return ''; } }
  function dateText(v) { if (!v) return 'Date TBC'; var d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function day(v) { var d = new Date(v); return isNaN(d) ? '' : d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function status(m) { return String(m.match_status || '').toUpperCase(); }
  function group(m) {
    var s = status(m);
    if (['LIVE','HT','1H','2H','ET','PEN','EXTRA_TIME'].indexOf(s) !== -1) return 'live';
    if (s === 'FT' || (m.home_score != null && m.away_score != null && s !== 'SCHEDULED' && s !== 'RESCHEDULED')) return 'results';
    if (s === 'SCHEDULED' || s === 'RESCHEDULED') return 'upcoming';
    return 'other';
  }
  // Live minute: the admin's last set minute plus the time since it was set (status_set_at)
  function liveMinute(m) {
    if (m.match_minute == null) return null;
    if (!m.status_set_at) return m.match_minute;
    var el = Math.floor((Date.now() - new Date(m.status_set_at).getTime()) / 60000);
    return m.match_minute + Math.max(0, el);
  }
  function label(m) {
    var s = status(m);
    if (['LIVE','1H','2H','ET','PEN','EXTRA_TIME'].indexOf(s) !== -1) { var mn = liveMinute(m); return 'LIVE' + (mn == null ? '' : ' · '+(mn > 90 ? '90+' : mn)+"'"); }
    if (s === 'HT') return 'HALF TIME';
    return ({HT:'HALF TIME',FT:'FULL TIME',SCHEDULED:'UPCOMING',RESCHEDULED:'RESCHEDULED',POSTPONED:'POSTPONED',CANCELLED:'CANCELLED',ABANDONED:'ABANDONED'})[s] || s.replace(/_/g,' ') || 'STATUS PENDING';
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
  function clubLogoFallback(name) {
    var key = String(name || '').toLowerCase().replace(/\bfc\b/g, '').replace(/[^a-z0-9]/g, '');
    if (key === 'portsauthority' || key === 'portsauthorityfc') key = 'ports';
    if (key === 'starsa' || key === 'starssa' || key === 'starsport' || key === 'starsportacademyfc') key = 'starsportacademy';
    if (key === 'western' || key === 'westernunitedfc' || key === 'fcwesternunited') key = 'westernunited';
    return CLUB_LOGO_FALLBACKS[key] || '';
  }
  function isSlfaLogoUrl(url) { return String(url || '').toLowerCase().indexOf('slfa-logo') !== -1; }
  function crest(name) {
    var fallback = clubLogoFallback(name), saved = isSlfaLogoUrl(clubLogos[name]) ? '' : clubLogos[name], logo = saved || fallback;
    var initial = esc((name || '?').charAt(0).toUpperCase());
    return logo ? '<img class="slfa-mc-crest" src="'+esc(logo)+'" data-fallback="'+esc(saved && fallback && saved !== fallback ? fallback : '')+'" alt="" loading="lazy" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=\'\';}else{this.hidden=true;this.nextElementSibling.hidden=false;}"><span class="slfa-mc-crest slfa-mc-crest-fallback" aria-hidden="true" hidden>'+initial+'</span>' :
      '<span class="slfa-mc-crest slfa-mc-crest-fallback" aria-hidden="true">'+initial+'</span>';
  }
  function selected() {
    return matches.filter(function (m) {
      if (league() && String(m.league_id || '') !== league()) return false;
      if (chosenDate && day(m.match_date) !== chosenDate) return false;
      if (chosenClub && m.home_team !== chosenClub && m.away_team !== chosenClub) return false;
      return filter === 'all' || group(m) === filter;
    }).sort(function (a,b) {
      if (filter === 'all' && group(a) !== group(b)) return ({live:0,upcoming:1,results:2,other:3})[group(a)] - ({live:0,upcoming:1,results:2,other:3})[group(b)];
      if (group(a) === 'upcoming' && group(b) === 'upcoming') return new Date(a.match_date)-new Date(b.match_date);
      return new Date(b.match_date)-new Date(a.match_date);
    });
  }
  function livePreview(m) {
    var events = liveEvents.filter(function (e) { return String(e.match_id) === String(m.id); });
    if (!events.length) return '<div class="slfa-mc-live-feed"><span class="slfa-mc-feed-empty">Live event updates will appear here</span></div>';
    var goals = events.filter(function (e) { return e.event_type === 'GOAL'; }).length;
    var yellows = events.filter(function (e) { return e.event_type === 'YELLOW_CARD'; }).length;
    var reds = events.filter(function (e) { return e.event_type === 'RED_CARD'; }).length;
    var recent = events.slice().sort(function (a,b) { return Number(b.minute || 0) - Number(a.minute || 0); }).slice(0,3);
    return '<div class="slfa-mc-live-feed"><div class="slfa-mc-live-counts"><span>⚽ '+goals+' goals</span><span>🟨 '+yellows+' yellow</span><span>🟥 '+reds+' red</span></div>' +
      '<div class="slfa-mc-live-events">'+recent.map(function(e){
        var type=e.event_type==='GOAL'?'Goal':e.event_type==='YELLOW_CARD'?'Yellow card':e.event_type==='RED_CARD'?'Red card':'Substitution';
        var player=e.event_type==='SUB'?(e.player_name||'Player on')+' on':(e.player_name||type);
        return '<span><b>'+esc(e.minute==null?'—':e.minute+"'")+'</b> '+esc(type)+' · '+esc(player)+'</span>';
      }).join('')+'</div></div>';
  }
  function card(m) {
    var s = status(m), g = group(m), score = m.home_score != null && m.away_score != null ?
      '<strong class="slfa-mc-score">'+esc(m.home_score)+'<i>:</i>'+esc(m.away_score)+'</strong>' : '<span class="slfa-mc-vs">VS</span>';
    return '<article class="slfa-mc-card '+(g==='live'?'is-live':'')+'"><div class="slfa-mc-card-top"><b class="slfa-mc-status status-'+esc(s.toLowerCase())+'">'+(g==='live'?'<i class="slfa-mc-live-dot"></i>':'')+esc(label(m))+'</b><span class="slfa-mc-league">'+esc(leagueNames[String(m.league_id)] || 'SLFA Competition')+'</span></div>'+
      '<div class="slfa-mc-teams"><div class="slfa-mc-team">'+crest(m.home_team)+'<span role="button" tabindex="0" data-open-club-name="'+esc(m.home_team)+'">'+esc(m.home_team)+'</span></div>'+score+'<div class="slfa-mc-team">'+crest(m.away_team)+'<span role="button" tabindex="0" data-open-club-name="'+esc(m.away_team)+'">'+esc(m.away_team)+'</span></div></div>'+
      '<div class="slfa-mc-card-bottom"><span>'+esc(dateText(m.match_date))+'</span><span>'+esc(m.venue || 'Venue TBC')+'</span></div>'+
      (m.motm_name?'<p class="slfa-mc-motm">★ Man of the Match: '+esc(m.motm_name)+(m.motm_jersey_number?' · #'+esc(m.motm_jersey_number):'')+'</p>':'')+
      (g==='live'?livePreview(m):'')+
      '<button class="slfa-mc-share" type="button" data-share="'+esc(m.id)+'" aria-label="Share this match">Share ↗</button>'+'<button class="slfa-mc-details-btn" type="button" data-mc-details="'+esc(m.id)+'" aria-expanded="false">Match details <span>＋</span></button><div class="slfa-mc-detail" id="mc-detail-'+esc(m.id)+'" hidden></div></article>';
  }
  function render() {
    var list = selected(), clubs = {};
    matches.forEach(function (m) { if (!league() || String(m.league_id || '') === league()) { clubs[m.home_team]=1; clubs[m.away_team]=1; } });
    var options = Object.keys(clubs).sort().map(function (n) { return '<option value="'+esc(n)+'"'+(chosenClub===n?' selected':'')+'>'+esc(n)+'</option>'; }).join('');
    var filters = [['all','All'],['upcoming','Upcoming'],['results','Results'],['other','Other']].map(function (f) {
      var n = f[0]==='all' ? matches.length : matches.filter(function(m){return group(m)===f[0];}).length;
      return '<button type="button" class="slfa-mc-filter'+(filter===f[0]?' active':'')+'" data-mc-filter="'+f[0]+'" aria-pressed="'+(filter===f[0])+'">'+f[1]+' <span class="slfa-mc-count-pill">'+n+'</span></button>';
    }).join('');
    host.innerHTML = '<section class="slfa-match-centre-v2" aria-label="Match Centre"><div class="slfa-mc-heading"><div><p class="slfa-mc-eyebrow">THE SLFA LEAGUE APP</p><h3>Match Centre</h3><p>Fixtures, live scores and completed results</p></div><span class="slfa-mc-update">'+(updated?'Updated '+new Date(updated).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Public match information')+'</span></div>'+
      '<div class="slfa-mc-tools"><div class="slfa-mc-filters" role="group" aria-label="Match filters">'+filters+'</div><div class="slfa-mc-selects"><label>Date<input type="date" id="mcDate" value="'+esc(chosenDate)+'"></label><label>Club<select id="mcClub"><option value="">All clubs</option>'+options+'</select></label><button type="button" class="slfa-mc-reset" id="mcReset">Reset</button></div></div>'+
      '<div class="slfa-mc-summary" aria-live="polite"><button type="button" id="mcRefresh" aria-label="Refresh match information">↻ Refresh</button></div>'+
      '<p class="slfa-mc-count">'+list.length+' match'+(list.length===1?'':'es')+' shown</p>'+
      (list.length?'<div class="slfa-mc-grid">'+list.map(card).join('')+'</div>':'<div class="slfa-mc-empty"><span>⚽</span><strong>No matches found</strong><p>Try another date, club or match filter.</p></div>')+
      '<p class="slfa-mc-footnote">Scores and match details reflect information currently published in the app.</p></section>';
    host.querySelectorAll('[data-mc-filter]').forEach(function (b) { b.addEventListener('click',function(){filter=b.dataset.mcFilter;render();}); });
    var d=document.getElementById('mcDate'), c=document.getElementById('mcClub'), r=document.getElementById('mcReset');
    if(d)d.addEventListener('change',function(){chosenDate=this.value;render();});
    if(c)c.addEventListener('change',function(){chosenClub=this.value;render();});
    if(r)r.addEventListener('click',function(){chosenDate='';chosenClub='';filter='all';render();});
    var refresh=document.getElementById('mcRefresh');if(refresh)refresh.addEventListener('click',function(){refresh.disabled=true;refresh.textContent='Refreshing…';fetchData().then(function(){var b=document.getElementById('mcRefresh');if(b){b.disabled=false;b.textContent='↻ Refresh';}});});
    host.querySelectorAll('[data-mc-details]').forEach(function(b){b.addEventListener('click',function(){details(b.dataset.mcDetails,b);});});
    host.querySelectorAll('[data-share]').forEach(function(b){b.addEventListener('click',function(){
      var m=matches.find(function(x){return String(x.id)===String(b.dataset.share);}); if(!m)return;
      var hasScore=m.home_score!=null&&m.away_score!=null;
      var status=group(m)==='live'?'Live':group(m)==='results'?'Full time':'Upcoming';
      var text=status+': '+m.home_team+' '+(hasScore?m.home_score+' – '+m.away_score:'v')+' '+m.away_team+' · SLFA League App';
      var url=location.href.split('#')[0];
      if(navigator.share){navigator.share({title:'SLFA League App',text:text,url:url}).catch(function(){});}
      else{window.open('https://wa.me/?text='+encodeURIComponent(text+' '+url),'_blank','noopener');}
    });});
  }
  function details(id,button) {
    var box=document.getElementById('mc-detail-'+id); if(!box)return;
    if(!box.hidden){box.hidden=true;button.setAttribute('aria-expanded','false');button.innerHTML='Match details <span>＋</span>';return;}
    if (window.slfaTrack) window.slfaTrack('match_details');
    box.hidden=false;button.setAttribute('aria-expanded','true');button.innerHTML='Hide details <span>−</span>';
    if(box.dataset.loaded)return;
    box.innerHTML='<p class="slfa-mc-detail-loading">Loading published match details…</p>';
    Promise.all([
      db.from('match_events').select('event_type,team_name,player_name,player_off_name,assist_player_name,minute').eq('match_id',String(id)).order('minute',{ascending:true}),
      db.from('match_lineups').select('is_starter,league_clubs(club_name),club_squad(player_name,jersey_number)').eq('match_id',String(id))
    ]).then(function(a){
      box.dataset.loaded='1';var ev=a[0].error?[]:(a[0].data||[]),lu=a[1].error?[]:(a[1].data||[]),html='';
      if(ev.length){
        var st={};ev.forEach(function(e){var k=e.team_name||'Match',t=String(e.event_type||'').toUpperCase();st[k]=st[k]||{goals:0,yellow:0,red:0,subs:0};if(t==='GOAL')st[k].goals++;else if(t==='YELLOW_CARD')st[k].yellow++;else if(t==='RED_CARD')st[k].red++;else if(t==='SUB')st[k].subs++;});
        html+='<h4>Match stats</h4><div class="slfa-mc-stats">'+Object.keys(st).map(function(k){var x=st[k];return '<div><strong>'+esc(k)+'</strong><span>⚽ '+x.goals+' goals</span><span>🟨 '+x.yellow+' yellow</span><span>🟥 '+x.red+' red</span><span>↔ '+x.subs+' subs</span></div>';}).join('')+'</div>';
        html+='<h4>Match timeline</h4><div class="slfa-mc-timeline">'+ev.map(function(e){
        var t=String(e.event_type||'').toUpperCase(),ico=t==='GOAL'?'⚽':t==='YELLOW_CARD'?'🟨':t==='RED_CARD'?'🟥':t==='SUB'?'↔':'•';
        var who=t==='SUB'?(e.player_name||'Player on')+' for '+(e.player_off_name||'player'):(e.player_name||'Match event')+(e.assist_player_name?' · Assist: '+e.assist_player_name:'');
        return '<div class="slfa-mc-event"><span class="slfa-mc-minute">'+esc(e.minute==null?'—':e.minute+"'")+'</span><span>'+ico+'</span><div><strong>'+esc(who)+'</strong><small>'+esc(e.team_name||'')+'</small></div></div>';
      }).join('')+'</div>';}
      if(lu.length){var by={};lu.forEach(function(x){var n=x.league_clubs&&x.league_clubs.club_name||'Team',p=x.club_squad||{},v=(p.jersey_number?'#'+p.jersey_number+' ':'')+(p.player_name||'Player');by[n]=by[n]||{xi:[],bench:[]};(x.is_starter?by[n].xi:by[n].bench).push(v);});
        html+='<h4>Published line-ups</h4><div class="slfa-mc-lineups">'+Object.keys(by).map(function(n){return '<div><strong role="button" tabindex="0" data-open-club-name="'+esc(n)+'">'+esc(n)+'</strong><p><b>Starting:</b> '+esc(by[n].xi.join(', ')||'Not published')+'</p><p><b>Bench:</b> '+esc(by[n].bench.join(', ')||'Not published')+'</p></div>';}).join('')+'</div>';}
      if(lu.length||ev.length) html+='<div class="slfa-mc-print-row"><button type="button" class="secondary" data-print-match="'+esc(String(id))+'">Print match sheet</button></div>';
      box.innerHTML=(html||'<p class="slfa-mc-no-events">No additional match details have been published.</p>')+'<div class="slfa-mc-comments"></div><div class="slfa-mc-report"></div>';
      loadComments(id,box.querySelector('.slfa-mc-comments'));
      renderReport(id,box.querySelector('.slfa-mc-report'));
    }).catch(function(){box.innerHTML='<p class="slfa-mc-no-events">Match details are temporarily unavailable.</p>';});
  }
  // Printable match sheet: built from the same published data as the match page, printed from a hidden frame (A4).
  function printMatchSheet(id) {
    Promise.all([
      db.from('matches').select('match_date,venue,home_team,away_team,home_score,away_score,match_status').eq('id', String(id)).maybeSingle(),
      db.from('match_lineups').select('is_starter,league_clubs(club_name),club_squad(player_name,jersey_number)').eq('match_id', String(id)),
      db.from('match_events').select('event_type,team_name,player_name,player_off_name,assist_player_name,minute').eq('match_id', String(id)).order('minute', { ascending: true })
    ]).then(function (a) {
      var m = (a[0].data) || {}, lu = a[1].data || [], ev = a[2].data || [];
      var when = m.match_date ? new Date(m.match_date).toLocaleString('en-GB', { timeZone: 'Africa/Freetown', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      var score = (m.home_score != null && m.away_score != null) ? m.home_score + ' – ' + m.away_score : 'v';
      var by = {};
      lu.forEach(function (x) {
        var n = (x.league_clubs && x.league_clubs.club_name) || 'Team', pl = x.club_squad || {};
        var v = (pl.jersey_number ? '#' + pl.jersey_number + ' ' : '') + (pl.player_name || 'Player');
        by[n] = by[n] || { xi: [], bench: [] }; (x.is_starter ? by[n].xi : by[n].bench).push(v);
      });
      var lineHtml = Object.keys(by).map(function (n) {
        return '<div class="team"><h3>' + esc(n) + '</h3><p><b>Starting:</b></p><ol>' + by[n].xi.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol><p><b>Bench:</b></p><ul>' + by[n].bench.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
      }).join('') || '<p>No line-ups published.</p>';
      var evHtml = ev.length ? '<table><thead><tr><th>Min</th><th>Event</th><th>Player</th><th>Team</th></tr></thead><tbody>' + ev.map(function (e) {
        var t = String(e.event_type || '').toUpperCase();
        var what = t === 'GOAL' ? 'Goal' : t === 'YELLOW_CARD' ? 'Yellow card' : t === 'RED_CARD' ? 'Red card' : t === 'SUB' ? 'Substitution' : 'Event';
        var who = t === 'SUB' ? (e.player_name || '') + ' for ' + (e.player_off_name || '') : (e.player_name || '') + (e.assist_player_name ? ' (assist: ' + e.assist_player_name + ')' : '');
        return '<tr><td>' + esc(e.minute == null ? '—' : e.minute) + '</td><td>' + what + '</td><td>' + esc(who) + '</td><td>' + esc(e.team_name || '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p>No match events published.</p>';
      var doc = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Match sheet</title><style>' +
        '@page{size:A4;margin:14mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11pt}' +
        'header{border-bottom:3px solid #0b2545;padding-bottom:8px;margin-bottom:12px}h1{font-size:18pt;margin:0 0 4px;color:#0b2545}' +
        '.score{font-size:22pt;font-weight:bold;text-align:center;margin:10px 0}.meta{color:#444}' +
        'h2{font-size:12.5pt;color:#0b2545;margin:16px 0 6px;border-bottom:1px solid #c8d6e5;padding-bottom:3px}' +
        '.teams{display:flex;gap:18px}.team{flex:1}.team h3{font-size:11.5pt;margin:0 0 4px}.team ol,.team ul{margin:2px 0 8px 18px;padding:0}' +
        'table{width:100%;border-collapse:collapse}th,td{border:1px solid #c8d6e5;padding:4px 6px;text-align:left;font-size:10pt}th{background:#eef4fb}' +
        'footer{margin-top:18px;font-size:8.5pt;color:#666;border-top:1px solid #c8d6e5;padding-top:6px}</style></head><body>' +
        '<header><h1>' + esc((m.home_team || 'Home') + ' v ' + (m.away_team || 'Away')) + '</h1><div class="meta">' + esc(when) + (m.venue ? ' · ' + esc(m.venue) : '') + '</div></header>' +
        '<div class="score">' + esc(score) + '</div>' +
        '<h2>Line-ups</h2><div class="teams">' + lineHtml + '</div>' +
        '<h2>Match events</h2>' + evHtml +
        '<footer>Printed from the SLFA League App on ' + esc(new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Freetown' })) + '. Shows published information only.</footer></body></html>';
      var frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(frame);
      frame.onload = function () {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) {}
        setTimeout(function () { frame.remove(); }, 2000);
      };
      frame.srcdoc = doc;
    }).catch(function () {});
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-print-match]');
    if (b) printMatchSheet(b.getAttribute('data-print-match'));
  });
  function voterKey(){try{var k=localStorage.getItem('slfa_voter_key');if(!k){k=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);localStorage.setItem('slfa_voter_key',k);}return k;}catch(e){return null;}}
  function fanName(){try{return localStorage.getItem('slfa_fan_name')||'';}catch(e){return '';}}
  // Report a wrong score, a wrong player or another problem. Reports go to SLFA staff.
  function renderReport(matchId,box){
    if(!box)return;
    box.innerHTML='<details class="slfa-mc-report-box"><summary>Report a problem</summary>'+
      '<form class="slfa-mc-comment-form" novalidate><label>What is wrong?<select name="type"><option value="WRONG_SCORE">Wrong score</option><option value="WRONG_PLAYER">Wrong or missing player</option><option value="OTHER">Something else</option></select></label>'+
      '<label>Tell us more<textarea name="message" maxlength="500" rows="3" placeholder="What should we check?"></textarea></label>'+
      '<button type="submit" class="slfa-mc-comment-send">Send report</button><p class="status" role="status"></p></form></details>';
    var form=box.querySelector('form'),msg=form.querySelector('.status');
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var message=form.message.value.trim();
      if(message.length<5){msg.textContent='Describe the problem in at least 5 characters.';return;}
      var key=voterKey();if(!key){msg.textContent='Reports need your browser to store a small code. Turn off private browsing and try again.';return;}
      var btn=form.querySelector('button');btn.disabled=true;msg.textContent='Sending…';
      if (window.slfaTrack) window.slfaTrack('fan_report');
      db.rpc('submit_fan_report',{p_match_id:Number(matchId),p_type:form.type.value,p_message:message,p_voter_key:key}).then(function(r){
        btn.disabled=false;
        if(r.error){msg.textContent=r.error.message;return;}
        form.message.value='';
        msg.textContent='Thank you. SLFA staff will look at this.';
      });
    });
  }
  // Fan comments: only approved comments are shown. New ones wait for moderator approval.
  function loadComments(matchId,box){
    if(!box)return;
    db.from('match_comments').select('id,fan_name,body,created_at').eq('match_id',String(matchId)).eq('status','APPROVED').order('created_at',{ascending:false}).limit(30)
    .then(function(res){
      var rows=res.error?null:(res.data||[]);
      var list=rows===null?'<p class="slfa-mc-no-events">Comments are temporarily unavailable.</p>':
        rows.length?rows.map(function(c){return '<div class="slfa-mc-comment"><strong>'+esc(c.fan_name)+'</strong><small>'+esc(dateText(c.created_at))+'</small><p>'+esc(c.body)+'</p></div>';}).join(''):
        '<p class="slfa-mc-no-events">No comments yet.</p>';
      box.innerHTML='<h4>Fan comments</h4>'+
        '<form class="slfa-mc-comment-form" novalidate><label>Your name<input name="fan" maxlength="30" value="'+esc(fanName())+'" autocomplete="nickname"></label>'+
        '<label>Comment<textarea name="body" maxlength="280" rows="2" placeholder="Say something about this match"></textarea></label>'+
        '<button type="submit" class="slfa-mc-comment-send">Send for approval</button><p class="status" role="status"></p></form>'+
        '<p class="slfa-mc-comment-note">Comments appear here after an admin approves them.</p>'+list;
      var form=box.querySelector('form'),msg=form.querySelector('.status');
      form.addEventListener('submit',function(e){
        e.preventDefault();
        var name=form.fan.value.trim(),body=form.body.value.trim();
        if(name.length<2){msg.textContent='Enter your name (at least 2 letters).';return;}
        if(!body){msg.textContent='Write a comment first.';return;}
        var key=voterKey();if(!key){msg.textContent='Comments need your browser to store a small code. Turn off private browsing and try again.';return;}
        var btn=form.querySelector('button');btn.disabled=true;msg.textContent='Sending…';
        if (window.slfaTrack) window.slfaTrack('fan_comment');
        db.rpc('submit_match_comment',{p_match_id:Number(matchId),p_fan_name:name,p_body:body,p_voter_key:key}).then(function(r){
          btn.disabled=false;
          if(r.error){msg.textContent=r.error.message;return;}
          try{localStorage.setItem('slfa_fan_name',name);}catch(x){}
          form.body.value='';
          msg.textContent='Thank you. Your comment will appear once it is approved.';
        });
      });
    });
  }
  function fetchData() {
    var request = Promise.all([
      db.from('matches').select('id,match_date,venue,match_status,match_minute,status_set_at,league_id,home_team,away_team,home_score,away_score,motm_name,motm_jersey_number').order('match_date',{ascending:false}).limit(500),
      db.from('leagues').select('id,name').eq('is_active',true).order('sort_order'),
      db.from('league_clubs').select('club_name,logo_url').eq('is_active',true)
    ]).then(function(a){
      var failed = a.find(function (item) { return item && item.error; });
      if (failed) throw new Error(failed.error.message || 'A league database query failed.');
      matches=a[0].data||[];leagueNames={};clubLogos={};
      (a[1].data||[]).forEach(function(x){leagueNames[String(x.id)]=x.name;});
      (a[2].data||[]).forEach(function(x){clubLogos[x.club_name]=x.logo_url || clubLogoFallback(x.club_name);});
      var live=matches.filter(function(m){return group(m)==='live';});
      var eventQuery=live.length?db.from('match_events').select('match_id,event_type,team_name,player_name,minute').in('match_id',live.map(function(m){return String(m.id);})).order('minute',{ascending:true}):Promise.resolve({data:[]});
      return eventQuery.then(function(g){
        liveEvents=g.error?[]:(g.data||[]);
        if(!g.error&&live.length){
          live.forEach(function(m){
            var id=String(m.id), goals=liveEvents.filter(function(x){return String(x.match_id)===id&&x.event_type==='GOAL';});
            if(m.home_score==null)m.home_score=goals.filter(function(x){return x.team_name===m.home_team;}).length;
            if(m.away_score==null)m.away_score=goals.filter(function(x){return x.team_name===m.away_team;}).length;
          });
        }
        updated=new Date();render();return true;
      });
    });
    return Promise.race([request, new Promise(function (_, reject) {
      fetchTimer = setTimeout(function () { reject(new Error('The database did not respond within 12 seconds.')); }, 12000);
    })]).catch(function (err) {
      host.innerHTML = '<section class="slfa-match-centre-v2"><div class="slfa-mc-empty"><strong>Matches could not load</strong><p>Check your internet connection and try again. The league database did not complete the request.</p><button type="button" id="slfaMcRetry">Retry loading matches</button></div></section>';
      var retry = document.getElementById('slfaMcRetry');
      if (retry) retry.addEventListener('click', function () { retry.disabled = true; retry.textContent = 'Retrying…'; fetchData(); });
      return false;
    }).then(function (result) { clearTimeout(fetchTimer); return result; });
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(fetchData,500);}
  if(window.MutationObserver){new MutationObserver(function(){if(!host.querySelector('.slfa-match-centre-v2')&&matches.length)render();}).observe(host,{childList:true,subtree:true});}
  var switcher=document.getElementById('leagueSwitch');
  if(switcher)switcher.addEventListener('click',function(){window.setTimeout(render,50);});
  if(db.channel)db.channel('public-match-centre').on('postgres_changes',{event:'*',schema:'public',table:'matches'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'match_events'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'league_clubs'},schedule).subscribe();
  window.addEventListener('online',schedule);
  window.setInterval(fetchData,60000);
  fetchData();
})();