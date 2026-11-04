(function(){
  'use strict';
  var db=window.slfaDb, host=document.getElementById('homeDashboard');
  if(!db||!host)return;
  var rows=[],clubs=[],leagues=[],lastError=false;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function dateText(v){if(!v)return 'Date to be confirmed';var d=new Date(v);return isNaN(d.getTime())?String(v):d.toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
  function status(m){return String(m.match_status||'').toUpperCase();}
  function live(m){return ['LIVE','HT','1H','2H','ET','PEN','EXTRA_TIME'].indexOf(status(m))!==-1;}
  function done(m){return status(m)==='FT'||(m.home_score!=null&&m.away_score!=null&&!['SCHEDULED','RESCHEDULED','POSTPONED','CANCELLED'].includes(status(m)));}
  function upcoming(m){return ['SCHEDULED','RESCHEDULED'].includes(status(m));}
  function selectedLeague(){try{return localStorage.getItem('slfa_league')||'';}catch(e){return '';}}
  function visibleMatches(){var id=selectedLeague();if(!id)return rows.slice();var byName={};clubs.forEach(function(c){byName[c.club_name]=String(c.league_id||'');});return rows.filter(function(m){return String(m.league_id||'')===id||(byName[m.home_team]===id&&byName[m.away_team]===id);});}
  function crest(name){var c=clubs.find(function(x){return x.club_name===name;});var url=c&&c.logo_url;return url?'<img class="slfa-home-crest" src="'+esc(url)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="slfa-home-crest slfa-home-crest-fallback" hidden>'+esc(String(name||'?').charAt(0).toUpperCase())+'</span>':'<span class="slfa-home-crest slfa-home-crest-fallback">'+esc(String(name||'?').charAt(0).toUpperCase())+'</span>';}
  function featured(list){var active=list.filter(live).sort(function(a,b){return new Date(b.match_date)-new Date(a.match_date);});if(active.length)return {match:active[0],kind:'LIVE'};var next=list.filter(upcoming).sort(function(a,b){return new Date(a.match_date)-new Date(b.match_date);});if(next.length)return {match:next[0],kind:'UP NEXT'};var recent=list.filter(done).sort(function(a,b){return new Date(b.match_date)-new Date(a.match_date);});if(recent.length)return {match:recent[0],kind:'LATEST RESULT'};return null;}
  function render(){
    var list=visibleMatches(),pick=featured(list),played=list.filter(done).length,next=list.filter(upcoming).length,clubCount=clubs.filter(function(c){return !selectedLeague()||String(c.league_id||'')===selectedLeague();}).length;
    var league=leagues.find(function(l){return String(l.id)===selectedLeague();});
    var label=league?league.name:'All competitions';
    var matchHtml='';
    if(pick){var m=pick.match,tag=pick.kind==='LIVE'?'<span class="slfa-home-live">LIVE'+(m.match_minute?' · '+esc(m.match_minute):'')+'</span>':'<strong>'+esc(pick.kind)+'</strong>';var score=done(m)||live(m)?'<div class="slfa-home-score">'+esc(m.home_score==null?'0':m.home_score)+' – '+esc(m.away_score==null?'0':m.away_score)+'</div>':'<div class="slfa-home-vs">VS</div>';var lg=leagues.find(function(x){return String(x.id)===String(m.league_id);});matchHtml='<div class="slfa-home-feature-head"><strong>'+esc(lg?lg.name:label)+'</strong>'+tag+'</div><div class="slfa-home-match"><div class="slfa-home-side">'+crest(m.home_team)+'<strong>'+esc(m.home_team)+'</strong></div>'+score+'<div class="slfa-home-side">'+crest(m.away_team)+'<strong>'+esc(m.away_team)+'</strong></div></div><div class="slfa-home-meta"><span>◷ '+esc(dateText(m.match_date))+'</span><span>⌖ '+esc(m.venue||'Venue to be confirmed')+'</span></div><div class="slfa-home-feature-foot"><button type="button" data-home-tab="matches">Open Match Centre</button></div>';}
    else matchHtml='<div class="slfa-home-empty">'+(lastError?'Match information is temporarily unavailable. Please try again when connected.':'No match has been published for this competition yet.')+'</div>';
    host.innerHTML='<div class="slfa-home-topline"><span>FOOTBALL AT A GLANCE</span><small>'+esc(label)+'</small></div><section class="slfa-home-feature" aria-label="Featured match">'+matchHtml+'</section><div class="slfa-home-stats"><div class="slfa-home-stat"><strong>'+clubCount+'</strong><span>Clubs</span></div><div class="slfa-home-stat"><strong>'+played+'</strong><span>Completed matches</span></div><div class="slfa-home-stat"><strong>'+next+'</strong><span>Upcoming fixtures</span></div></div><div class="slfa-home-shortcuts" aria-label="Explore football"><button class="slfa-home-shortcut" data-home-tab="matches"><i>⚽</i><span>Fixtures &amp; Results</span></button><button class="slfa-home-shortcut" data-home-tab="table"><i>▤</i><span>League Table</span></button><button class="slfa-home-shortcut" data-home-tab="teams"><i>♧</i><span>Club Profiles</span></button><button class="slfa-home-shortcut" data-home-tab="players"><i>★</i><span>Player Centre</span></button><button class="slfa-home-shortcut" data-home-tab="news"><i>▣</i><span>Latest News</span></button><button class="slfa-home-shortcut" data-home-tab="videos"><i>▷</i><span>Video Highlights</span></button></div>';
    host.querySelectorAll('[data-home-tab]').forEach(function(b){b.addEventListener('click',function(){var tab=document.querySelector('[data-tab="'+b.getAttribute('data-home-tab')+'"]');if(tab)tab.click();});});
  }
  function load(){
    Promise.all([
      db.from('matches').select('id,league_id,match_date,venue,match_status,match_minute,home_team,away_team,home_score,away_score').order('match_date',{ascending:false}).limit(250),
      db.from('league_clubs').select('club_name,league_id,logo_url').eq('is_active',true),
      db.from('leagues').select('id,name').eq('is_active',true)
    ]).then(function(all){lastError=all.some(function(x){return !!x.error;});rows=all[0].error?[]:(all[0].data||[]);clubs=all[1].error?[]:(all[1].data||[]);leagues=all[2].error?[]:(all[2].data||[]);render();}).catch(function(){lastError=true;render();});
  }
  var switcher=document.getElementById('leagueSwitch');
  if(switcher)switcher.addEventListener('click',function(){window.setTimeout(render,80);});
  if(db.channel)db.channel('slfa-home-dashboard').on('postgres_changes',{event:'*',schema:'public',table:'matches'},load).on('postgres_changes',{event:'*',schema:'public',table:'league_clubs'},load).subscribe();
  load();
})();