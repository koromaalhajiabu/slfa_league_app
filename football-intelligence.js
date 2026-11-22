/* SLFA Elite Football Intelligence — public, read-only analytics built from published league data. */
(function(){
  'use strict';
  var db=window.slfaDb, nav=document.querySelector('.tabs'), pub=document.getElementById('public');
  if(!db||!nav||!pub)return;
  var matches=[],clubs=[],leagues=[],standings=[],scorers=[],assists=[],keepers=[],awards=[],seasons=[],activeLeague='';
  var host=document.createElement('section');
  host.id='slfaInsights';host.className='view card slfa-insights';host.setAttribute('data-view','insights');host.hidden=true;
  host.setAttribute('aria-label','Elite football intelligence dashboard');
  pub.appendChild(host);
  var tab=document.createElement('button');tab.type='button';tab.setAttribute('role','tab');tab.setAttribute('data-tab','insights');tab.setAttribute('aria-selected','false');tab.textContent='Insights';
  var leagueTab=nav.querySelector('[data-tab="leagues"]'),matchesTab=nav.querySelector('[data-tab="matches"]');
  nav.insertBefore(tab,leagueTab?leagueTab.nextSibling:(matchesTab?matchesTab.nextSibling:null));
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function clubKey(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  function completed(m){var s=String(m.match_status||'').toUpperCase();return m.home_score!=null&&m.away_score!=null&&!['SCHEDULED','RESCHEDULED','POSTPONED','CANCELLED','ABANDONED'].includes(s);}
  function leagueMatches(){return matches.filter(function(m){return !activeLeague||String(m.league_id||'')===activeLeague;});}
  function leagueClubs(){return clubs.filter(function(c){return !activeLeague||String(c.league_id||'')===activeLeague;});}
  function scoreBars(items,key,label){var max=items.reduce(function(a,x){return Math.max(a,Number(x[key])||0);},0)||1;return items.length?items.slice(0,6).map(function(x){var value=Number(x[key])||0;return '<div class="si-bar-row"><div><strong>'+esc(x[label]||'Unlisted')+'</strong><b>'+value+'</b></div><span><i style="width:'+Math.max(2,Math.round(value/max*100))+'%"></i></span></div>';}).join(''):'<p class="si-empty">No published data available.</p>';}
  function playerLeaders(rows,field,nameField){var valid=rows.filter(function(x){return !activeLeague||leagueClubs().some(function(c){return clubKey(c.club_name)===clubKey(x.club);});});return valid.slice().sort(function(a,b){return (Number(b[field])||0)-(Number(a[field])||0);}).slice(0,5).map(function(x){return {name:x[nameField],club:x.club,value:Number(x[field])||0};});}
  function leaderboard(title,rows,unit){return '<section class="si-panel"><div class="si-panel-head"><div><span>PLAYER LEADERS</span><h3>'+title+'</h3></div><small>Published records</small></div>'+(rows.length?'<ol class="si-leader-list">'+rows.map(function(x,i){return '<li><span class="si-rank">'+(i+1)+'</span><div><strong>'+esc(x.name||'Unlisted player')+'</strong><small>'+esc(x.club||'Club not listed')+'</small></div><b>'+x.value+' <small>'+unit+'</small></b></li>';}).join('')+'</ol>':'<p class="si-empty">No published rankings for this competition yet.</p>')+'</section>';}
  function render(){
    var list=leagueMatches(),played=list.filter(completed),goalCount=played.reduce(function(n,m){return n+(Number(m.home_score)||0)+(Number(m.away_score)||0);},0);
    var upcoming=list.filter(function(m){return ['SCHEDULED','RESCHEDULED'].includes(String(m.match_status||'').toUpperCase());}).length;
    var active=leagueClubs(),league=leagues.find(function(x){return String(x.id)===activeLeague;});
    var goalsPerMatch=played.length?(goalCount/played.length).toFixed(2):'—';
    var rows=active.map(function(c){
      var games=played.filter(function(m){return clubKey(m.home_team)===clubKey(c.club_name)||clubKey(m.away_team)===clubKey(c.club_name);});
      var w=0,d=0,l=0,gf=0,ga=0,homePts=0,awayPts=0,form=[];
      games.slice().sort(function(a,b){return new Date(b.match_date)-new Date(a.match_date);}).forEach(function(m){
        var home=clubKey(m.home_team)===clubKey(c.club_name),forGoals=Number(home?m.home_score:m.away_score)||0,against=Number(home?m.away_score:m.home_score)||0;
        gf+=forGoals;ga+=against;
        if(forGoals>against){w++;form.push('W');if(home)homePts+=3;else awayPts+=3;}
        else if(forGoals===against){d++;form.push('D');if(home)homePts++;else awayPts++;}
        else{l++;form.push('L');}
      });
      return {name:c.club_name,played:games.length,w:w,d:d,l:l,gf:gf,ga:ga,gd:gf-ga,pts:w*3+d,homePts:homePts,awayPts:awayPts,form:form.slice(0,5)};
    }).sort(function(a,b){return b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name);});
    var maxPoints=rows.reduce(function(n,x){return Math.max(n,x.pts);},0)||1;
    var table=rows.length?'<div class="si-table-wrap"><table class="si-table"><thead><tr><th>#</th><th>Club</th><th>P</th><th>W-D-L</th><th>GD</th><th>Pts</th><th>Form</th></tr></thead><tbody>'+rows.map(function(x,i){return '<tr><td>'+(i+1)+'</td><td>'+esc(x.name)+'</td><td>'+x.played+'</td><td>'+x.w+'-'+x.d+'-'+x.l+'</td><td>'+(x.gd>0?'+':'')+x.gd+'</td><td><strong>'+x.pts+'</strong></td><td>'+x.form.map(function(v){return '<i class="si-form si-'+v.toLowerCase()+'">'+v+'</i>';}).join('')+'</td></tr>';}).join('')+'</tbody></table></div>':'<p class="si-empty">No clubs are published for this competition.</p>';
    var ranked=rows.slice().sort(function(a,b){return b.pts-a.pts||b.gd-a.gd;}).slice(0,5).map(function(x){return {name:x.name,value:x.pts};});
    var topScorers=playerLeaders(scorers,'goals','player'),topAssists=playerLeaders(assists,'assists','player'),topKeepers=playerLeaders(keepers,'clean_sheets','goalkeeper'),topAwards=playerLeaders(awards,'awards','player');
    var seasonList=seasons.map(function(s){var seasonGames=list.filter(function(m){if(m.season_id!=null)return String(m.season_id)===String(s.id);var day=String(m.match_date||'').slice(0,10);return day&&day>=String(s.start_date||'')&&day<=String(s.end_date||'');}).filter(completed);var goals=seasonGames.reduce(function(n,m){return n+(Number(m.home_score)||0)+(Number(m.away_score)||0);},0);return {name:s.name,played:seasonGames.length,goals:goals,average:seasonGames.length?goals/seasonGames.length:0};}).filter(function(x){return x.played||x.goals;});
    var maxSeason=seasonList.reduce(function(n,x){return Math.max(n,x.goals);},0)||1;
    host.innerHTML='<div class="si-hero"><div><span class="si-eyebrow">SLFA · 2026 FOOTBALL INTELLIGENCE</span><h2>Football Intelligence Centre</h2><p>Competition performance, club form and published player rankings in one view.</p></div><div class="si-orbit" aria-hidden="true">✦</div></div>'+
      '<div class="si-controls"><label for="siCompetition">COMPETITION<select id="siCompetition"><option value="">All competitions</option>'+leagues.map(function(l){return '<option value="'+esc(l.id)+'"'+(String(l.id)===activeLeague?' selected':'')+'>'+esc(l.name)+'</option>';}).join('')+'</select></label><span>Based on published records · Read-only</span></div>'+
      '<div class="si-kpis"><article><span>COMPLETED MATCHES</span><strong>'+played.length+'</strong></article><article><span>GOALS SCORED</span><strong>'+goalCount+'</strong></article><article><span>GOALS / MATCH</span><strong>'+goalsPerMatch+'</strong></article><article><span>UPCOMING FIXTURES</span><strong>'+upcoming+'</strong></article></div>'+
      '<section class="si-panel"><div class="si-panel-head"><div><span>COMPETITION TABLE</span><h3>Club performance rankings</h3></div><small>Calculated from completed scores</small></div>'+table+'</section>'+
      '<div class="si-grid">'+leaderboard('Golden Boot race',topScorers,'goals')+leaderboard('Assist leaders',topAssists,'assists')+leaderboard('Goalkeeper rankings',topKeepers,'clean sheets')+leaderboard('Match awards',topAwards,'awards')+'</div>'+
      '<section class="si-panel"><div class="si-panel-head"><div><span>CLUB PERFORMANCE</span><h3>Points comparison</h3></div><small>Calculated from completed matches</small></div>'+scoreBars(ranked,'value','name')+'</section>'+
      '<section class="si-panel"><div class="si-panel-head"><div><span>SEASON HISTORY</span><h3>Scoring trends by season</h3></div><small>Matches linked to season records</small></div>'+(seasonList.length?seasonList.map(function(x){return '<div class="si-season-row"><div><strong>'+esc(x.name)+'</strong><span>'+x.played+' matches · '+x.goals+' goals · '+x.average.toFixed(2)+' per match</span></div><i><b style="width:'+Math.round(x.goals/maxSeason*100)+'%"></b></i></div>';}).join(''):'<p class="si-empty">Historical trends will appear as completed matches are assigned to seasons.</p>')+'</section>'+
      '<p class="si-footnote">All figures are derived from published match scores, standings and player-statistic records. Rankings are informational and may change when authorised staff update league data.</p>';
    var select=host.querySelector('#siCompetition');if(select)select.addEventListener('change',function(){activeLeague=this.value;render();});
  }
  function load(){
    host.innerHTML='<div class="si-loading">Loading verified league statistics…</div>';
    Promise.all([
      db.from('matches').select('id,league_id,season_id,match_date,match_status,home_team,away_team,home_score,away_score').order('match_date',{ascending:false}).limit(1000),
      db.from('league_clubs').select('club_name,league_id,logo_url,is_active').eq('is_active',true),
      db.from('leagues').select('id,name,is_active').eq('is_active',true),
      db.from('league_standings').select('league_id,pos,club,mp,w,d,l,gf,ga,pts').order('pos',{ascending:true}),
      db.from('top_scorers').select('player,club,goals').order('goals',{ascending:false}).limit(100),
      db.from('top_assists').select('player,club,assists').order('assists',{ascending:false}).limit(100),
      db.from('clean_sheets').select('goalkeeper,club,clean_sheets').order('clean_sheets',{ascending:false}).limit(100),
      db.from('motm_awards').select('player,club,awards').order('awards',{ascending:false}).limit(100),
      db.from('seasons').select('id,name,start_date,end_date,is_current').order('start_date',{ascending:true})
    ]).then(function(r){
      matches=r[0].error?[]:(r[0].data||[]);clubs=r[1].error?[]:(r[1].data||[]);leagues=r[2].error?[]:(r[2].data||[]);standings=r[3].error?[]:(r[3].data||[]);
      scorers=r[4].error?[]:(r[4].data||[]);assists=r[5].error?[]:(r[5].data||[]);keepers=r[6].error?[]:(r[6].data||[]);awards=r[7].error?[]:(r[7].data||[]);seasons=r[8].error?[]:(r[8].data||[]);
      if(!activeLeague){var current=leagues.find(function(l){return String(l.id)===String(localStorage.getItem('slfa_league')||'');});if(current)activeLeague=String(current.id);}
      render();
      if(r.some(function(x){return !!x.error;})){var note=document.createElement('p');note.className='si-footnote';note.textContent='Some optional statistic sources are unavailable. Available published records are still shown.';host.appendChild(note);}
    }).catch(function(){host.innerHTML='<p class="si-empty">Football intelligence is temporarily unavailable. Please reconnect and try again.</p>';});
  }
  function activate(){nav.querySelectorAll('[data-tab]').forEach(function(b){b.setAttribute('aria-selected',b===tab?'true':'false');});document.querySelectorAll('[data-view]').forEach(function(v){v.hidden=v!==host;});if(!host.dataset.loaded){host.dataset.loaded='true';load();}}
  tab.addEventListener('click',activate);
  var switcher=document.getElementById('leagueSwitch');if(switcher)switcher.addEventListener('click',function(){window.setTimeout(function(){if(!host.hidden){activeLeague=localStorage.getItem('slfa_league')||'';render();}},90);});
  if(db.channel)db.channel('slfa-football-intelligence').on('postgres_changes',{event:'*',schema:'public',table:'matches'},function(){if(!host.hidden)load();}).on('postgres_changes',{event:'*',schema:'public',table:'league_standings'},function(){if(!host.hidden)load();}).on('postgres_changes',{event:'*',schema:'public',table:'top_scorers'},function(){if(!host.hidden)load();}).subscribe();
  window.addEventListener('online',function(){if(!host.hidden)load();});
})();
