(function(){
  var cfg=window.SLFA_CONFIG;
  var root=document.getElementById('demoRecords');
  var count=document.getElementById('demoCount');
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  if(!cfg||!window.supabase){root.textContent='The demonstration data connection is unavailable.';return;}
  var db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  Promise.all([
    db.from('noda_demo_matches').select('*').order('match_date',{ascending:false}).order('kickoff_local',{ascending:false}),
    db.from('noda_demo_events').select('*').order('minute_label',{ascending:true})
  ]).then(function(results){
    var mr=results[0],er=results[1];
    if(mr.error||er.error){root.textContent='Unable to load demonstration records. Please refresh later.';count.textContent='Data connection error';return;}
    var matches=mr.data||[],events=er.data||[];
    count.textContent=matches.length+' source-attributed results · '+events.length+' recorded event details · 2026/27';
    if(!matches.length){root.innerHTML='<div class="demo-card">No demonstration records are available.</div>';return;}
    root.innerHTML=matches.map(function(m){
      var ev=events.filter(function(e){return e.demo_match_id===m.id;});
      var date=new Date(m.match_date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
      return '<article class="demo-card"><div class="demo-meta"><span>'+esc(date)+(m.kickoff_local?' · '+esc(m.kickoff_local):'')+'</span><span>FULL TIME</span></div><div class="demo-meta" style="margin-top:5px"><span>'+esc(m.competition)+'</span><span>'+esc(m.season)+'</span></div><div class="demo-score"><span>'+esc(m.home_team)+'</span><b>'+m.home_score+'–'+m.away_score+'</b><span>'+esc(m.away_team)+'</span></div><div class="demo-meta"><span>'+esc(m.venue||'Venue not listed')+'</span></div>'+(ev.length?'<div class="demo-events"><strong>Source-listed events</strong>'+ev.map(function(e){return '<div class="demo-event"><time>'+esc(e.minute_label)+"'</time><span>"+esc(e.event_type.replace('_',' '))+' · '+esc(e.player_name||'Player not named')+(e.assist_player_name?' (Assist: '+esc(e.assist_player_name)+')':'')+'<br><small>'+esc(e.team_name||'')+'</small></span></div>';}).join('')+'</div>':'<div class="demo-events">No individual event details are included in this source snapshot.</div>')+'<a class="demo-source" href="'+esc(m.source_url)+'" target="_blank" rel="noopener">View original Noda record ↗</a><div class="demo-meta" style="margin-top:8px"><strong>'+esc(m.data_label)+'</strong></div></article>';
    }).join('');
  }).catch(function(){root.textContent='Unable to load demonstration records.';});
})();