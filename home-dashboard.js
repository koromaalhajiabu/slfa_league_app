(function(){
  'use strict';
  var db=window.slfaDb, host=document.getElementById('homeDashboard');
  if(!db||!host)return;
  var rows=[],clubs=[],leagues=[],seasons=[],lastError=false,quickStandings=[],quickStandingsError=false,quickStandingsLoaded=false,quickStandingsLoading=false,supporterSnapshot=null,supporterLoading=false;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function dateText(v){if(!v)return 'Date to be confirmed';var d=new Date(v);return isNaN(d.getTime())?String(v):d.toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
  function status(m){return String(m.match_status||'').toUpperCase();}
  function live(m){return ['LIVE','HT','1H','2H','ET','PEN','EXTRA_TIME'].indexOf(status(m))!==-1;}
  function done(m){return status(m)==='FT'||(m.home_score!=null&&m.away_score!=null&&!['SCHEDULED','RESCHEDULED','POSTPONED','CANCELLED'].includes(status(m)));}
  function upcoming(m){return ['SCHEDULED','RESCHEDULED'].includes(status(m));}
  function selectedLeague(){try{return localStorage.getItem('slfa_league')||'';}catch(e){return '';}}
  function selectedSeason(){var id='';try{id=localStorage.getItem('slfa_season')||'';}catch(e){}return seasons.filter(function(s){return String(s.id)===id;})[0]||seasons.filter(function(s){return s.is_current;})[0]||null;}
  function visibleMatches(){var id=selectedLeague();if(!id)return rows.slice();var byName={};clubs.forEach(function(c){byName[c.club_name]=String(c.league_id||'');});return rows.filter(function(m){return String(m.league_id||'')===id||(byName[m.home_team]===id&&byName[m.away_team]===id);});}
  function loadQuickStandings(){
    if(quickStandingsLoaded||quickStandingsLoading)return;
    quickStandingsLoading=true;
    var season=selectedSeason(),request;
    if(season&&!season.is_current){
      request=Promise.all(leagues.map(function(l){return db.rpc('season_table',{p_season_id:Number(season.id),p_league_id:Number(l.id)});})).then(function(results){quickStandingsError=results.some(function(r){return !!r.error;});quickStandings=[];results.forEach(function(r){if(!r.error)quickStandings=quickStandings.concat(r.data||[]);});});
    }else{
      request=db.from('league_standings').select('league_id,pos,club,mp,pts').order('pos',{ascending:true}).then(function(r){quickStandingsError=!!r.error;quickStandings=r.error?[]:(r.data||[]);});
    }
    return Promise.resolve(request).then(function(){quickStandingsLoading=false;quickStandingsLoaded=true;renderQuickStandings();}).catch(function(){quickStandingsLoading=false;quickStandingsLoaded=true;quickStandingsError=true;quickStandings=[];renderQuickStandings();});
  }
  function renderQuickStandings(){
    var body=host.querySelector('#slfaQuickStandingsBody');if(!body)return;
    if(quickStandingsError){body.innerHTML='<p class="slfa-home-quick-empty">The table preview is unavailable. Open the official Table panel to retry.</p>';return;}
    var chosen=selectedLeague(),groups=leagues.filter(function(l){return !chosen||String(l.id)===chosen;}),html='';
    groups.forEach(function(l){var items=quickStandings.filter(function(r){return String(r.league_id)===String(l.id);}).sort(function(a,b){return Number(a.pos)-Number(b.pos);}).slice(0,chosen?5:3);if(!items.length)return;
      html+='<section class="slfa-home-quick-group"><h4>'+esc(l.name)+'</h4><div class="slfa-home-quick-scroll"><table><thead><tr><th>#</th><th>Club</th><th>P</th><th>Pts</th></tr></thead><tbody>'+items.map(function(r){return '<tr><td>'+esc(r.pos)+'</td><td>'+esc(r.club)+'</td><td>'+esc(r.mp)+'</td><td><strong>'+esc(r.pts)+'</strong></td></tr>';}).join('')+'</tbody></table></div></section>';
    });
    body.innerHTML=html||'<p class="slfa-home-quick-empty">The league table will appear when published standings are available.</p>';
  }
  function crest(name){var c=clubs.find(function(x){return x.club_name===name;});var url=c&&c.logo_url;return url?'<img class="slfa-home-crest" src="'+esc(url)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="slfa-home-crest slfa-home-crest-fallback" hidden>'+esc(String(name||'?').charAt(0).toUpperCase())+'</span>':'<span class="slfa-home-crest slfa-home-crest-fallback">'+esc(String(name||'?').charAt(0).toUpperCase())+'</span>';}
  function featured(list){var active=list.filter(live).sort(function(a,b){return new Date(b.match_date)-new Date(a.match_date);});if(active.length)return {match:active[0],kind:'LIVE'};var next=list.filter(upcoming).sort(function(a,b){return new Date(a.match_date)-new Date(b.match_date);});if(next.length)return {match:next[0],kind:'UP NEXT'};var recent=list.filter(done).sort(function(a,b){return new Date(b.match_date)-new Date(a.match_date);});if(recent.length)return {match:recent[0],kind:'LATEST RESULT'};return null;}
  function icsEscape(value){return String(value||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');}
  function icsDate(value){return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
  function localReminderIds(){try{return JSON.parse(localStorage.getItem('slfa_match_reminders')||'{}');}catch(e){return {};}}
  function saveReminderIds(value){try{localStorage.setItem('slfa_match_reminders',JSON.stringify(value));}catch(e){}}
  function setMatchReminder(matchId,button){
    var reminderIds=localReminderIds(),key=String(matchId),enabled=!reminderIds[key];
    if(!('serviceWorker' in navigator)||!('PushManager' in window)){
      var note=document.getElementById('alertStatus');if(note)note.textContent='Match reminders need push alerts. Use a browser that supports notifications.';
      return;
    }
    button.disabled=true;
    navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription();}).then(function(sub){
      if(!sub){
        var note=document.getElementById('alertStatus');if(note)note.textContent='Tap Get alerts first, allow notifications, then set your match reminder.';
        button.disabled=false;return;
      }
      return db.rpc('set_push_match_reminder',{p_endpoint:sub.endpoint,p_match_id:Number(matchId),p_enabled:enabled}).then(function(res){
        if(res.error)throw res.error;
        if(enabled)reminderIds[key]=true;else delete reminderIds[key];
        saveReminderIds(reminderIds);
        button.textContent=enabled?'Reminder set · Remove':'Remind me';
        button.setAttribute('aria-pressed',String(enabled));
        var note=document.getElementById('alertStatus');if(note)note.textContent=res.data|| (enabled?'Your one-hour match reminder is set.':'Your match reminder has been removed.');
      });
    }).catch(function(){
      var note=document.getElementById('alertStatus');if(note)note.textContent='Could not save this match reminder. Check that Get alerts is enabled.';
    }).finally(function(){button.disabled=false;});
  }
  function loadSupporterDashboard(force){
    var box=host.querySelector('#slfaSupporterDashboard');if(!box)return;
    if(supporterSnapshot&&!force){renderSupporterDashboard(box,supporterSnapshot.clubs,supporterSnapshot.players,supporterSnapshot.signedIn,supporterSnapshot.localPlayerCount);return;}
    if(supporterLoading)return;
    supporterLoading=true;
    box.innerHTML='<div class="slfa-supporter-loading">Loading your followed clubs and players…</div>';
    db.auth.getUser().then(function(u){
      if(u.data&&u.data.user){
        return Promise.all([
          db.from('user_favorite_clubs').select('club_id, league_clubs(club_name)').eq('user_id',u.data.user.id),
          db.from('user_favorite_players').select('player_id, club_squad(player_name)').eq('user_id',u.data.user.id)
        ]).then(function(all){
          if(all.some(function(r){return r.error;}))throw new Error('Supporter preferences unavailable');
          var followedClubs=(all[0].data||[]).map(function(x){return x.league_clubs&&x.league_clubs.club_name;}).filter(Boolean);
          var followedPlayers=(all[1].data||[]).map(function(x){return x.club_squad&&x.club_squad.player_name;}).filter(Boolean);
          supporterLoading=false;renderSupporterDashboard(box,followedClubs,followedPlayers,true);
        });
      }
      var localClubs=[];
      try{localClubs=JSON.parse(localStorage.getItem('slfa_fav_clubs')||'[]').map(function(x){return x.name;}).filter(Boolean);}catch(e){}
      var localPlayers=[];try{localPlayers=JSON.parse(localStorage.getItem('slfa_fav_players')||'[]').map(String);}catch(e){}
      if(!localPlayers.length){supporterLoading=false;renderSupporterDashboard(box,localClubs,[],false,0);return;}
      db.from('club_squad').select('id, player_name').in('id',localPlayers).then(function(r){
        var names=r.error?[]:(r.data||[]).map(function(x){return x.player_name;}).filter(Boolean);
        supporterLoading=false;renderSupporterDashboard(box,localClubs,names,false,names.length||localPlayers.length);
      });
    }).catch(function(){
      supporterLoading=false;
      box.innerHTML='<p class="slfa-supporter-empty">Your supporter preferences are temporarily unavailable.</p>';
    });
  }
  function renderSupporterDashboard(box,followedClubs,followedPlayers,signedIn,localPlayerCount){
    supporterSnapshot={clubs:followedClubs.slice(),players:followedPlayers.slice(),signedIn:signedIn,localPlayerCount:localPlayerCount||0};
    supporterLoading=false;
    var clubMarkup=followedClubs.length?followedClubs.map(function(n){return '<span class="slfa-follow-chip">'+esc(n)+'</span>';}).join(''):'<span class="slfa-supporter-empty">No clubs followed yet. Save a club with the star in Teams.</span>';
    var playerMarkup=followedPlayers.length?followedPlayers.map(function(n){return '<span class="slfa-follow-chip">'+esc(n)+'</span>';}).join(''):(localPlayerCount?'<span class="slfa-follow-chip">'+localPlayerCount+' player'+(localPlayerCount===1?'':'s')+' followed on this device</span>':'<span class="slfa-supporter-empty">No players followed yet. Save players from the Players directory.</span>');
    var upcomingMatches=rows.filter(upcoming).filter(function(m){return followedClubs.indexOf(m.home_team)!==-1||followedClubs.indexOf(m.away_team)!==-1;}).sort(function(a,b){return new Date(a.match_date)-new Date(b.match_date);}).slice(0,3);
    var matches=upcomingMatches.length?upcomingMatches.map(function(m){var reminderOn=!!localReminderIds()[String(m.id)];return '<div class="slfa-supporter-match"><span><strong>'+esc(m.home_team)+' v '+esc(m.away_team)+'</strong><small>'+esc(dateText(m.match_date))+'</small></span><button type="button" data-slfa-remind="'+esc(m.id)+'" aria-pressed="'+reminderOn+'">'+(reminderOn?'Reminder set · Remove':'Remind me')+'</button></div>';}).join(''):'<p class="slfa-supporter-empty">Upcoming fixtures involving your followed clubs will appear here.</p>';
    box.innerHTML='<div class="slfa-supporter-head"><div><span>YOUR FOLLOWED TEAMS</span><strong>Followed clubs &amp; players</strong></div><small>'+(signedIn?'Synced to your account':'Saved on this device')+'</small></div>'+
      '<div class="slfa-supporter-groups"><section><h4>Favourite clubs</h4><div class="slfa-follow-list">'+clubMarkup+'</div></section>'+
      '<section><h4>Favourite players</h4><div class="slfa-follow-list">'+playerMarkup+'</div></section></div>'+
      '<section class="slfa-supporter-fixtures"><h4>Upcoming matches for your clubs</h4>'+matches+'</section>'+
      '<div class="slfa-supporter-actions"><button type="button" data-slfa-open-tab="teams">Browse clubs</button><button type="button" data-slfa-open-tab="players">Find players</button></div>'+
      (!signedIn?'<p class="slfa-supporter-hint">Sign in through Admin to sync followed clubs and players across devices.</p>':'');
    box.querySelectorAll('[data-slfa-open-tab]').forEach(function(b){b.addEventListener('click',function(){var tab=document.querySelector('[data-tab="'+b.getAttribute('data-slfa-open-tab')+'"]');if(tab)tab.click();});});
    box.querySelectorAll('[data-slfa-remind]').forEach(function(b){b.addEventListener('click',function(){setMatchReminder(b.getAttribute('data-slfa-remind'),b);});});
  }
  function exportCalendar(items){
    if(!items.length){return;}
    var stamp=icsDate(new Date()),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SLFA//League App//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    items.forEach(function(m){
      var start=new Date(m.match_date),end=new Date(start.getTime()+120*60000),league=leagues.find(function(l){return String(l.id)===String(m.league_id);});
      lines.push('BEGIN:VEVENT','UID:slfa-'+icsEscape(m.id)+'@slfa-league-app','DTSTAMP:'+stamp,'DTSTART:'+icsDate(start),'DTEND:'+icsDate(end),
        'SUMMARY:'+icsEscape(m.home_team+' vs '+m.away_team),
        'LOCATION:'+icsEscape(m.venue||'Venue to be confirmed'),
        'DESCRIPTION:'+icsEscape((league?league.name+' · ':'')+'SLFA League App fixture'),'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var blob=new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='slfa-upcoming-fixtures.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  function render(){
    var list=visibleMatches(),pick=featured(list),played=list.filter(done).length,next=list.filter(upcoming).length,clubCount=clubs.filter(function(c){return !selectedLeague()||String(c.league_id||'')===selectedLeague();}).length;
    var upcomingRows=list.filter(upcoming).sort(function(a,b){return new Date(a.match_date)-new Date(b.match_date);}).slice(0,4);
    var league=leagues.find(function(l){return String(l.id)===selectedLeague();});
    var label=league?league.name:'All competitions';
    var matchHtml='';
    if(pick){var m=pick.match,tag=pick.kind==='LIVE'?'<span class="slfa-home-live">LIVE'+(m.match_minute?' · '+esc(m.match_minute):'')+'</span>':'<strong>'+esc(pick.kind)+'</strong>';var score=done(m)||live(m)?'<div class="slfa-home-score">'+esc(m.home_score==null?'0':m.home_score)+' – '+esc(m.away_score==null?'0':m.away_score)+'</div>':'<div class="slfa-home-vs">VS</div>';var lg=leagues.find(function(x){return String(x.id)===String(m.league_id);});matchHtml='<div class="slfa-home-feature-head"><strong>'+esc(lg?lg.name:label)+'</strong>'+tag+'</div><div class="slfa-home-match"><div class="slfa-home-side">'+crest(m.home_team)+'<strong>'+esc(m.home_team)+'</strong></div>'+score+'<div class="slfa-home-side">'+crest(m.away_team)+'<strong>'+esc(m.away_team)+'</strong></div></div><div class="slfa-home-meta"><span>◷ '+esc(dateText(m.match_date))+'</span><span>⌖ '+esc(m.venue||'Venue to be confirmed')+'</span></div>';}
    else matchHtml='<div class="slfa-home-empty">'+(lastError?'Match information is temporarily unavailable. Please try again when connected.':'No match has been published for this competition yet.')+'</div>';
    var upcomingHtml=upcomingRows.length?upcomingRows.map(function(m){
      var reminderOn=!!localReminderIds()[String(m.id)];
      return '<article class="slfa-home-fixture"><div><strong>'+esc(m.home_team)+' <span>vs</span> '+esc(m.away_team)+'</strong><small>'+esc(dateText(m.match_date))+' · '+esc(m.venue||'Venue to be confirmed')+'</small></div><button type="button" class="slfa-home-remind" data-slfa-remind="'+esc(m.id)+'" aria-pressed="'+reminderOn+'">'+(reminderOn?'Reminder set · Remove':'Remind me')+'</button></article>';
    }).join(''):'<p class="slfa-home-empty slfa-home-fixture-empty">No upcoming fixtures have been published.</p>';
    host.innerHTML='<div class="slfa-home-topline"><span>FOOTBALL AT A GLANCE</span><small>'+esc(label)+'</small></div><section class="slfa-supporter-dashboard" id="slfaSupporterDashboard" aria-label="Followed clubs and players"><div class="slfa-supporter-loading">Loading your followed clubs and players…</div></section><section class="slfa-home-feature" aria-label="Featured match">'+matchHtml+'</section><div class="slfa-home-stats"><div class="slfa-home-stat"><strong>'+clubCount+'</strong><span>Clubs</span></div><div class="slfa-home-stat"><strong>'+played+'</strong><span>Completed matches</span></div><div class="slfa-home-stat"><strong>'+next+'</strong><span>Upcoming fixtures</span></div></div><section class="slfa-home-upcoming"><div class="slfa-home-upcoming-head"><div><span>YOUR FIXTURE PLANNER</span><strong>Coming up</strong></div><button type="button" data-slfa-calendar>＋ Add to calendar</button></div>'+upcomingHtml+'</section><details class="slfa-home-quick-table" id="slfaQuickStandings"><summary><span><small>OFFICIAL STANDINGS</small><strong>Quick table preview</strong></span><span class="slfa-home-quick-chevron" aria-hidden="true">＋</span></summary><div id="slfaQuickStandingsBody" class="slfa-home-quick-body"><p class="slfa-home-quick-empty">Loading the official table preview…</p></div><div class="slfa-home-quick-actions"><button type="button" data-slfa-open-table>View full official table</button></div></details>';
    var calendarButton=host.querySelector('[data-slfa-calendar]');
    if(calendarButton)calendarButton.addEventListener('click',function(){exportCalendar(list.filter(upcoming).sort(function(a,b){return new Date(a.match_date)-new Date(b.match_date);}));});
    var tableButton=host.querySelector('[data-slfa-open-table]');if(tableButton)tableButton.addEventListener('click',function(){var tab=document.querySelector('[data-tab="table"]');if(tab)tab.click();});
    var quickTable=host.querySelector('#slfaQuickStandings');if(quickTable)quickTable.addEventListener('toggle',function(){if(quickTable.open)loadQuickStandings();});
    renderQuickStandings();
    host.querySelectorAll('[data-slfa-remind]').forEach(function(b){b.addEventListener('click',function(){setMatchReminder(b.getAttribute('data-slfa-remind'),b);});});
    loadSupporterDashboard();
  }
  function consumeSharedData(data){
    if(!data){return;}
    lastError=false;
    rows=Array.isArray(data.matches)?data.matches:[];
    clubs=Array.isArray(data.clubs)?data.clubs:[];
    leagues=Array.isArray(data.leagues)?data.leagues:[];
    seasons=Array.isArray(data.seasons)?data.seasons:[];
    render();
    var quickTable=host.querySelector('#slfaQuickStandings');
    if(quickTable&&quickTable.open){quickStandingsLoaded=false;quickStandingsLoading=false;loadQuickStandings();}
  }
  document.addEventListener('slfa:public-data-ready',function(e){consumeSharedData(e.detail||window.slfaPublicData);});
  document.addEventListener('slfa:public-data-error',function(){lastError=true;rows=[];render();});
  var switcher=document.getElementById('leagueSwitch');
  if(switcher)switcher.addEventListener('click',function(){window.setTimeout(render,80);});
  document.addEventListener('slfa:season-change',function(){
    if(window.slfaPublicData)consumeSharedData(window.slfaPublicData);
    quickStandingsLoaded=false;quickStandingsLoading=false;
    var quickTable=host.querySelector('#slfaQuickStandings');if(quickTable&&quickTable.open)loadQuickStandings();
  });
  if(db.auth)db.auth.onAuthStateChange(function(){supporterSnapshot=null;supporterLoading=false;window.setTimeout(function(){loadSupporterDashboard(true);},0);});
  if(window.slfaPublicData)consumeSharedData(window.slfaPublicData);
})();