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
  function label(m) {
    var s = status(m);
    if (['LIVE','1H','2H','ET','PEN','EXTRA_TIME'].indexOf(s) !== -1) return 'LIVE' + (m.match_minute == null ? '' : ' · '+m.match_minute+"'");
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
  function isWomensLeagueClub(name) {
    var key = String(name || '').toLowerCase().replace(/\\bfc\\b/g, '').replace(/[^a-z0-9]/g, '');
    return ['ramkamara','ramkamarafemale','mogbwemoqueens','slpolice','slpolicefemale','sierraleonepolicefemale','kallonfemale','fckallonfemale','menaqueens','patriciaumu','kahunlaqueens','koyaqueens','risingqueens','vembuck'].indexOf(key) !== -1;
  }
  function clubLogoFallback(name) {
    var key = String(name || '').toLowerCase().replace(/\bfc\b/g, '').replace(/[^a-z0-9]/g, '');
    if (key === 'portsauthority' || key === 'portsauthorityfc') key = 'ports';
    if (key === 'starsa' || key === 'starssa' || key === 'starsport' || key === 'starsportacademyfc') key = 'starsportacademy';
    if (key === 'western' || key === 'westernunitedfc' || key === 'fcwesternunited') key = 'westernunited';
    return CLUB_LOGO_FALLBACKS[key] || '';
  }
  function isSlfaLogoUrl(url) { return String(url || '').toLowerCase().indexOf('slfa-logo') !== -1; }
  function crest(name) {
    var fallback = clubLogoFallback(name), saved = (isWomensLeagueClub(name) || isSlfaLogoUrl(clubLogos[name])) ? '' : clubLogos[name], logo = saved || fallback;
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
      '<div class="slfa-mc-teams"><div class="slfa-mc-team">'+crest(m.home_team)+'<span>'+esc(m.home_team)+'</span></div>'+score+'<div class="slfa-mc-team">'+crest(m.away_team)+'<span>'+esc(m.away_team)+'</span></div></div>'+
      '<div class="slfa-mc-card-bottom"><span>'+esc(dateText(m.match_date))+'</span><span>'+esc(m.venue || 'Venue TBC')+'</span></div>'+
      (m.motm_name?'<p class="slfa-mc-motm">★ Man of the Match: '+esc(m.motm_name)+(m.motm_jersey_number?' · #'+esc(m.motm_jersey_number):'')+'</p>':'')+
      (g==='live'?livePreview(m):'')+
      '<button class="slfa-mc-details-btn" type="button" data-mc-details="'+esc(m.id)+'" aria-expanded="false">Match details <span>＋</span></button><div class="slfa-mc-detail" id="mc-detail-'+esc(m.id)+'" hidden></div></article>';
  }
  function render() {
    var list = selected(), clubs = {};
    matches.forEach(function (m) { if (!league() || String(m.league_id || '') === league()) { clubs[m.home_team]=1; clubs[m.away_team]=1; } });
    var options = Object.keys(clubs).sort().map(function (n) { return '<option value="'+esc(n)+'"'+(chosenClub===n?' selected':'')+'>'+esc(n)+'</option>'; }).join('');
    var filters = [['all','All matches'],['upcoming','Upcoming'],['results','Results'],['other','Other']].map(function (f) {
      return '<button type="button" class="slfa-mc-filter'+(filter===f[0]?' active':'')+'" data-mc-filter="'+f[0]+'" aria-pressed="'+(filter===f[0])+'">'+f[1]+'</button>';
    }).join('');
    host.innerHTML = '<section class="slfa-match-centre-v2" aria-label="Match Centre"><div class="slfa-mc-heading"><div><p class="slfa-mc-eyebrow">THE SLFA LEAGUE APP</p><h3>Match Centre</h3><p>Fixtures, live scores and completed results</p></div><span class="slfa-mc-update">'+(updated?'Updated '+new Date(updated).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Public match information')+'</span></div>'+
      '<div class="slfa-mc-tools"><div class="slfa-mc-filters" role="group" aria-label="Match filters">'+filters+'</div><div class="slfa-mc-selects"><label>Date<input type="date" id="mcDate" value="'+esc(chosenDate)+'"></label><label>Club<select id="mcClub"><option value="">All clubs</option>'+options+'</select></label><button type="button" class="slfa-mc-reset" id="mcReset">Reset</button></div></div>'+
      '<div class="slfa-mc-summary" aria-live="polite"><span><b>'+matches.length+'</b> Total</span><span class="live"><b>'+matches.filter(function(m){return group(m)==='live';}).length+'</b> Live</span><span><b>'+matches.filter(function(m){return group(m)==='upcoming';}).length+'</b> Upcoming</span><span><b>'+matches.filter(function(m){return group(m)==='results';}).length+'</b> Results</span><button type="button" id="mcRefresh" aria-label="Refresh match information">↻ Refresh</button></div>'+
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
  }
  function details(id,button) {
    var box=document.getElementById('mc-detail-'+id); if(!box)return;
    if(!box.hidden){box.hidden=true;button.setAttribute('aria-expanded','false');button.innerHTML='Match details <span>＋</span>';return;}
    box.hidden=false;button.setAttribute('aria-expanded','true');button.innerHTML='Hide details <span>−</span>';
    if(box.dataset.loaded)return;
    box.innerHTML='<p class="slfa-mc-detail-loading">Loading published match details…</p>';
    Promise.all([
      db.from('match_events').select('event_type,team_name,player_name,player_off_name,assist_player_name,minute').eq('match_id',String(id)).order('minute',{ascending:true}),
      db.from('match_lineups').select('is_starter,league_clubs(club_name),club_squad(player_name,jersey_number)').eq('match_id',String(id))
    ]).then(function(a){
      box.dataset.loaded='1';var ev=a[0].error?[]:(a[0].data||[]),lu=a[1].error?[]:(a[1].data||[]),html='';
      if(ev.length){html+='<h4>Match timeline</h4><div class="slfa-mc-timeline">'+ev.map(function(e){
        var t=String(e.event_type||'').toUpperCase(),ico=t==='GOAL'?'⚽':t==='YELLOW_CARD'?'🟨':t==='RED_CARD'?'🟥':t==='SUB'?'↔':'•';
        var who=t==='SUB'?(e.player_name||'Player on')+' for '+(e.player_off_name||'player'):(e.player_name||'Match event')+(e.assist_player_name?' · Assist: '+e.assist_player_name:'');
        return '<div class="slfa-mc-event"><span class="slfa-mc-minute">'+esc(e.minute==null?'—':e.minute+"'")+'</span><span>'+ico+'</span><div><strong>'+esc(who)+'</strong><small>'+esc(e.team_name||'')+'</small></div></div>';
      }).join('')+'</div>';}
      if(lu.length){var by={};lu.forEach(function(x){var n=x.league_clubs&&x.league_clubs.club_name||'Team',p=x.club_squad||{},v=(p.jersey_number?'#'+p.jersey_number+' ':'')+(p.player_name||'Player');by[n]=by[n]||{xi:[],bench:[]};(x.is_starter?by[n].xi:by[n].bench).push(v);});
        html+='<h4>Published line-ups</h4><div class="slfa-mc-lineups">'+Object.keys(by).map(function(n){return '<div><strong>'+esc(n)+'</strong><p><b>Starting:</b> '+esc(by[n].xi.join(', ')||'Not published')+'</p><p><b>Bench:</b> '+esc(by[n].bench.join(', ')||'Not published')+'</p></div>';}).join('')+'</div>';}
      box.innerHTML=html||'<p class="slfa-mc-no-events">No additional match details have been published.</p>';
    }).catch(function(){box.innerHTML='<p class="slfa-mc-no-events">Match details are temporarily unavailable.</p>';});
  }
  function fetchData() {
    var request = Promise.all([
      db.from('matches').select('id,match_date,venue,match_status,match_minute,league_id,home_team,away_team,home_score,away_score,motm_name,motm_jersey_number').order('match_date',{ascending:false}).limit(500),
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