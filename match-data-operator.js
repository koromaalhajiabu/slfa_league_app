/* SLFA Match Data Operator workspace.
   A separately appointed operator records live events while referees control the match clock and official result. */
(function () {
  'use strict';
  var db=window.slfaDb, ROOT='slfaMatchDataOperator';
  var user=null, assignments=[], fixtures=[], activeMatch=null, lineup=[], events=[], pending=[], channel=null, observer=null, loading=false;
  function $(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function say(s,bad){var el=$('mdoStatus');if(el){el.textContent=s||'';el.style.color=bad?'#b4513b':'inherit';}}
  function key(){return 'slfa_match_data_operator_queue_v1_'+(user&&user.id||'unknown');}
  function readQueue(){try{var v=JSON.parse(localStorage.getItem(key())||'[]');return Array.isArray(v)?v:[];}catch(_){return [];}}
  function writeQueue(rows){try{localStorage.setItem(key(),JSON.stringify(rows));return true;}catch(_){return false;}}
  function uuid(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});}
  function addStyle(){
    if($('mdoStyle'))return;
    var s=document.createElement('style');s.id='mdoStyle';
    s.textContent=[
      '#'+ROOT+'{margin:16px 0;padding:16px;border:1px solid var(--border,#dce4eb);border-radius:16px;background:var(--panel,#fff);color:var(--text,#172b3d)}',
      '#'+ROOT+' *{box-sizing:border-box}',
      '#'+ROOT+' .mdo-kicker{font-size:9px;letter-spacing:1.5px;font-weight:900;color:#b18a3f}',
      '#'+ROOT+' h2{font-size:20px;margin:5px 0 8px}#'+ROOT+' h3{font-size:14px;margin:0 0 9px}',
      '#'+ROOT+' p,#'+ROOT+' .mdo-muted{font-size:11px;line-height:1.5;color:var(--muted,#718096)}',
      '#'+ROOT+' .mdo-note{padding:10px 12px;margin:10px 0;border-radius:10px;background:rgba(15,118,90,.08);border:1px solid rgba(15,118,90,.2);font-size:11px;line-height:1.5}',
      '#'+ROOT+' .mdo-panel{padding:13px;border:1px solid var(--border,#e1e7ee);border-radius:12px;margin-top:12px}',
      '#'+ROOT+' label{display:block;font-size:10px;font-weight:850;color:var(--muted,#637386);margin:9px 0 5px}',
      '#'+ROOT+' input,#'+ROOT+' select{width:100%;min-height:42px;padding:9px 10px;border:1px solid var(--border,#dce4eb);border-radius:9px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:12px}',
      '#'+ROOT+' .mdo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
      '#'+ROOT+' .mdo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
      '#'+ROOT+' button{border:0;border-radius:9px;background:#086447;color:#fff;padding:11px 14px;font-size:11px;font-weight:850;cursor:pointer}',
      '#'+ROOT+' button.secondary{border:1px solid var(--border,#ccd6df);background:transparent;color:inherit}',
      '#'+ROOT+' button:disabled{opacity:.45;cursor:not-allowed}',
      '#'+ROOT+' .mdo-status{margin-top:9px;font-size:11px;line-height:1.45}',
      '#'+ROOT+' .mdo-match{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:11px;border:1px solid var(--border,#e1e7ee);border-radius:10px;margin:7px 0}',
      '#'+ROOT+' .mdo-match strong{font-size:12px;display:block}#'+ROOT+' .mdo-match small{display:block;margin-top:3px;font-size:10px;color:var(--muted,#718096)}',
      '#'+ROOT+' .mdo-badge{display:inline-block;white-space:nowrap;border-radius:30px;background:#e8f4ed;color:#1b6647;padding:5px 8px;font-size:9px;font-weight:900}',
      '#'+ROOT+' .mdo-badge.warn{background:#fff0dd;color:#8b5c0b}',
      '#'+ROOT+' .mdo-event{display:grid;grid-template-columns:58px minmax(0,1fr) auto;align-items:center;gap:8px;border-bottom:1px solid var(--border,#e7ebf0);padding:10px 0}',
      '#'+ROOT+' .mdo-event:last-child{border-bottom:0}',
      '#'+ROOT+' .mdo-time{font-size:12px;font-weight:900;color:#0b704d}',
      '#'+ROOT+' .mdo-event strong{display:block;font-size:11px}#'+ROOT+' .mdo-event small{display:block;font-size:10px;color:var(--muted,#718096);margin-top:3px}',
      '#'+ROOT+' .mdo-event button{padding:6px 8px;font-size:9px}',
      '#'+ROOT+' .mdo-empty{padding:16px;text-align:center;font-size:11px;color:var(--muted,#718096)}',
      '@media(max-width:560px){#'+ROOT+'{padding:12px}#'+ROOT+' .mdo-grid{grid-template-columns:1fr}#'+ROOT+' .mdo-event{grid-template-columns:48px minmax(0,1fr)}#'+ROOT+' .mdo-event button{grid-column:2;justify-self:start}}'
    ].join('');
    document.head.appendChild(s);
  }
  function mount(){
    var role=$('whoRole'),tools=$('roleTools');
    if(!role||!tools||String(role.textContent||'').trim().toUpperCase()!=='MATCH DATA OPERATOR')return;
    if($(ROOT))return;
    addStyle();
    var panel=document.createElement('section');panel.id=ROOT;
    panel.innerHTML='<span class="mdo-kicker">SLFA · MATCHDAY LIVE DESK</span><h2>Live Match Event Operator</h2><p>Record goals, cards and substitutions while the referee manages the match itself.</p><div class="mdo-note"><strong>Role boundary:</strong> You can record events only for fixtures assigned to you. Every player and assist is checked against the approved match line-up before the database accepts it. You cannot start, pause or end matches, change the match clock, submit final scores or change results. The Main Referee retains those responsibilities. You may reverse only an event you personally entered, while the match is live, by giving an audit reason.</div><div id="mdoStatus" class="mdo-status" role="status" aria-live="polite">Loading your appointments…</div><div id="mdoApp"></div>';
    tools.appendChild(panel);loadAssignments();
  }
  async function loadAssignments(){
    if(loading)return;loading=true;
    try{
      var auth=await db.auth.getUser();if(auth.error)throw auth.error;
      user=auth.data&&auth.data.user;if(!user)throw new Error('Sign in to continue.');
      var profile=await db.from('user_profiles').select('id,system_role,status,full_name').eq('id',user.id).maybeSingle();
      if(profile.error)throw profile.error;
      if(!profile.data||profile.data.system_role!=='MATCH_DATA_OPERATOR'||profile.data.status!=='Active')throw new Error('This account is not an active Match Data Operator.');
      var a=await db.from('match_referee_assignments').select('id,match_id,assignment_status,official_role,assigned_at').eq('referee_user_id',user.id).eq('official_role','DATA_OPERATOR').eq('assignment_status','ACTIVE').order('assigned_at',{ascending:false});
      if(a.error)throw a.error;
      assignments=a.data||[];
      var ids=assignments.map(function(x){return x.match_id;});
      if(ids.length){
        var m=await db.from('matches').select('id,home_team,away_team,home_club_id,away_club_id,venue,match_date,match_status,match_minute,current_half').in('id',ids).order('match_date',{ascending:false});
        if(m.error)throw m.error;fixtures=m.data||[];
      }else fixtures=[];
      render();
      pending=readQueue();
      if(pending.length)await syncQueue();
      say('Signed in as '+(profile.data.full_name||'Match Data Operator')+' · '+assignments.length+' active fixture appointment(s).');
    }catch(e){say(e.message||String(e),true);}
    finally{loading=false;}
  }
  function render(){
    var host=$('mdoApp');if(!host)return;
    var options=fixtures.map(function(m){return '<option value="'+esc(m.id)+'">'+esc(m.home_team)+' v '+esc(m.away_team)+' · '+esc(m.match_status)+'</option>';}).join('');
    host.innerHTML='<section class="mdo-panel"><h3>My appointed fixtures</h3><label for="mdoMatch">Select assigned fixture</label><select id="mdoMatch"><option value="">Choose a fixture…</option>'+options+'</select><div id="mdoFixtureInfo" class="mdo-muted">Choose an assigned fixture to view its live event desk.</div></section><section class="mdo-panel"><h3>Event timeline</h3><div id="mdoEventList" class="mdo-empty">Choose a fixture.</div><div id="mdoQueueStatus" class="mdo-muted"></div></section><section class="mdo-panel"><h3>Record a live event</h3><div id="mdoEventForm" class="mdo-muted">Choose a fixture first.</div></section>';
    $('mdoMatch').addEventListener('change',function(){openMatch(this.value);});
    if(!fixtures.length)$('mdoFixtureInfo').textContent='No active Match Data Operator appointments. The Super Admin must appoint you to a fixture.';
    if(pending.length)showQueueStatus();
  }
  async function openMatch(id){
    activeMatch=fixtures.find(function(m){return String(m.id)===String(id);})||null;
    if(channel){try{db.removeChannel(channel);}catch(_){}channel=null;}
    var info=$('mdoFixtureInfo'),form=$('mdoEventForm'),list=$('mdoEventList');
    if(!activeMatch){if(info)info.textContent='Choose an assigned fixture.';if(form)form.textContent='Choose a fixture first.';if(list)list.textContent='Choose a fixture.';return;}
    info.textContent='Loading official lineup and event timeline…';
    form.innerHTML='<p class="mdo-muted">Preparing event entry…</p>';
    try{
      var l=await db.from('match_lineups').select('club_id,player_id').eq('match_id',activeMatch.id);
      if(l.error)throw l.error;
      var lineups=l.data||[],ids=Array.from(new Set(lineups.map(function(x){return x.player_id;})));
      var players=[];
      if(ids.length){
        var p=await db.from('club_squad').select('id,player_name,jersey_number,club_id').in('id',ids);
        if(p.error)throw p.error;players=p.data||[];
      }
      var pmap={};players.forEach(function(x){pmap[String(x.id)]=x;});
      lineup=lineups.map(function(x){var p=pmap[String(x.player_id)];return p?{club_id:x.club_id,id:p.id,name:p.player_name,number:p.jersey_number}:null;}).filter(Boolean);
      await refreshEvents();
      var kickoff=activeMatch.match_date?new Date(activeMatch.match_date).toLocaleString('en-GB',{timeZone:'Africa/Freetown'}):'Not set';
      info.innerHTML='<div class="mdo-match"><div><strong>'+esc(activeMatch.home_team)+' v '+esc(activeMatch.away_team)+'</strong><small>'+esc(kickoff)+' · '+esc(activeMatch.venue||'Venue not recorded')+'</small></div><span class="mdo-badge '+(['LIVE','HT'].indexOf(activeMatch.match_status)>=0?'':'warn')+'">'+esc(activeMatch.match_status)+'</span></div><p>Referee match clock: '+esc(activeMatch.match_minute||0)+'′ · Current half: '+esc(activeMatch.current_half||1)+' · Players loaded from the published team lineups: '+lineup.length+'</p>';
      renderForm();renderEvents();
      channel=db.channel('slfa-mdo-events-'+activeMatch.id).on('postgres_changes',{event:'*',schema:'public',table:'match_events',filter:'match_id=eq.'+String(activeMatch.id)},function(){refreshEvents().then(renderEvents);}).subscribe();
    }catch(e){info.textContent='Could not load this fixture: '+(e.message||String(e));form.textContent='Event entry is unavailable until the lineup and match records can be read.';}
  }
  async function refreshEvents(){
    if(!activeMatch)return;
    var r=await db.from('match_events').select('id,event_type,team_name,player_name,assist_player_name,player_off_name,minute,half,recorded_by,recorded_at,published_at').eq('match_id',String(activeMatch.id)).order('minute',{ascending:true}).order('recorded_at',{ascending:true});
    if(r.error)throw r.error;events=r.data||[];
    pending=readQueue();
  }
  function teamId(name){return String(name)===String(activeMatch.home_team)?activeMatch.home_club_id:activeMatch.away_club_id;}
  function playerOptions(teamName,selected){
    var id=teamId(teamName);
    return '<option value="">Choose a player…</option>'+lineup.filter(function(p){return String(p.club_id)===String(id);}).map(function(p){
      return '<option value="'+esc(p.name)+'" '+(p.name===selected?'selected':'')+'>'+(p.number?'#'+esc(p.number)+' ':'')+esc(p.name)+'</option>';
    }).join('');
  }
  function renderForm(){
    var host=$('mdoEventForm');if(!host||!activeMatch)return;
    var live=['LIVE','HT'].indexOf(activeMatch.match_status)>=0;
    if(!live){host.innerHTML='<div class="mdo-note">Event entry is paused. The referee must start the fixture before you can enter live events.</div>';return;}
    var home=activeMatch.home_team||'Home',away=activeMatch.away_team||'Away';
    var teamOptions='<option value="">Choose team…</option><option value="'+esc(home)+'">'+esc(home)+'</option><option value="'+esc(away)+'">'+esc(away)+'</option>';
    host.innerHTML='<div class="mdo-grid"><div><label for="mdoType">Event</label><select id="mdoType"><option value="GOAL">Goal</option><option value="YELLOW_CARD">Yellow card</option><option value="RED_CARD">Red card</option><option value="SUB">Substitution</option></select></div><div><label for="mdoMinute">Match minute</label><input id="mdoMinute" type="number" min="1" max="120" value="'+esc(Math.max(1,Number(activeMatch.match_minute)||1))+'"></div></div><div class="mdo-grid"><div><label for="mdoHalf">Half</label><select id="mdoHalf"><option value="1" '+(Number(activeMatch.current_half)===1?'selected':'')+'>First half</option><option value="2" '+(Number(activeMatch.current_half)===2?'selected':'')+'>Second half</option></select></div><div><label for="mdoTeam">Team</label><select id="mdoTeam">'+teamOptions+'</select></div></div><label for="mdoPlayer">Player</label><select id="mdoPlayer"><option value="">Choose a team first…</option></select><div id="mdoSubOffWrap" hidden><label for="mdoPlayerOff">Player substituted off</label><select id="mdoPlayerOff"><option value="">Choose player going off…</option></select></div><div id="mdoAssistWrap"><label for="mdoAssist">Assist (optional, goals only)</label><select id="mdoAssist"><option value="">No assist recorded</option></select></div><div class="mdo-actions"><button id="mdoSave" type="button">Record event to live match</button><button id="mdoRefresh" class="secondary" type="button">Refresh match</button></div><div id="mdoFormStatus" class="mdo-status" role="status"></div>';
    $('mdoType').addEventListener('change',updateFormType);
    $('mdoTeam').addEventListener('change',updateTeamPlayers);
    $('mdoSave').addEventListener('click',recordEvent);
    $('mdoRefresh').addEventListener('click',function(){loadAssignments();});
    updateFormType();updateTeamPlayers();
  }
  function updateFormType(){
    var type=$('mdoType');if(!type)return;
    var sub=type.value==='SUB',goal=type.value==='GOAL';
    $('mdoSubOffWrap').hidden=!sub;$('mdoAssistWrap').hidden=!goal;
    updateTeamPlayers();
  }
  function updateTeamPlayers(){
    var team=$('mdoTeam'),player=$('mdoPlayer'),off=$('mdoPlayerOff'),assist=$('mdoAssist');
    if(!team||!player)return;
    var teamName=team.value;
    if(!teamName){player.innerHTML='<option value="">Choose a team first…</option>';if(off)off.innerHTML='<option value="">Choose a team first…</option>';if(assist)assist.innerHTML='<option value="">No assist recorded</option>';return;}
    var opts=playerOptions(teamName);
    player.innerHTML=opts;
    if(off){off.innerHTML=playerOptions(teamName);off.value='';}
    if(assist){assist.innerHTML='<option value="">No assist recorded</option>'+lineup.filter(function(p){return String(p.club_id)===String(teamId(teamName));}).map(function(p){return '<option value="'+esc(p.name)+'">'+(p.number?'#'+esc(p.number)+' ':'')+esc(p.name)+'</option>';}).join('');}
  }
  async function recordEvent(){
    var type=$('mdoType').value,team=$('mdoTeam').value,player=$('mdoPlayer').value,off=$('mdoPlayerOff')&&$('mdoPlayerOff').value;
    var minute=Number($('mdoMinute').value),half=Number($('mdoHalf').value),assist=$('mdoAssist')&&$('mdoAssist').value;
    var status=$('mdoFormStatus'),button=$('mdoSave');
    if(!team||!player){status.textContent='Choose the team and the player involved.';return;}
    if(type==='SUB'&&(!off||off===player)){status.textContent='Choose two different players for the substitution.';return;}
    if(!Number.isInteger(minute)||minute<1||minute>120||![1,2].includes(half)){status.textContent='Enter a valid match minute and half.';return;}
    if(!activeMatch||['LIVE','HT'].indexOf(activeMatch.match_status)<0){status.textContent='This fixture is not currently live.';return;}
    var event={
      client_event_id:uuid(),match_id:String(activeMatch.id),event_type:type,team_name:team,
      player_name:player,player_off_name:type==='SUB'?off:null,assist_player_name:type==='GOAL'?(assist||null):null,
      minute:minute,half:half,recorded_by:user.id,recorded_at:new Date().toISOString(),published_at:new Date().toISOString()
    };
    var q=readQueue();q.push(event);
    if(!writeQueue(q)){status.textContent='This device cannot save offline. Keep the page open and try again.';return;}
    button.disabled=true;status.textContent='Saving event…';
    var result=await syncOne(event);
    button.disabled=false;
    if(result.ok){status.textContent='Event recorded and published to the live match timeline.';await refreshEvents();renderEvents();}
    else if(result.queued){status.textContent='Connection unavailable. Event saved on this device and queued to sync automatically.';pending=readQueue();showQueueStatus();}
    else{status.textContent='Event not accepted by the database: '+result.message+'. The event remains in the on-device queue for review.';pending=readQueue();showQueueStatus();}
  }
  async function syncOne(event){
    if(!navigator.onLine)return {ok:false,queued:true};
    try{
      var r=await db.from('match_events').upsert([event],{onConflict:'client_event_id',ignoreDuplicates:true});
      if(r.error){
        var net=!navigator.onLine||r.error.status===0||/failed to fetch|network|timeout|load failed/i.test(r.error.message||'');
        return {ok:false,queued:net,message:r.error.message};
      }
      writeQueue(readQueue().filter(function(x){return x.client_event_id!==event.client_event_id;}));
      return {ok:true};
    }catch(e){return {ok:false,queued:true,message:e.message||'Network unavailable'};}
  }
  async function syncQueue(){
    var q=readQueue();if(!q.length)return;
    var remain=q.slice();
    for(var i=0;i<q.length;i++){
      var r=await syncOne(q[i]);
      if(!r.ok)break;
      remain=readQueue();
    }
    pending=readQueue();showQueueStatus();
    if(!pending.length&&activeMatch)await refreshEvents();
    if(activeMatch)renderEvents();
  }
  function showQueueStatus(){
    var host=$('mdoQueueStatus');if(!host)return;
    var count=readQueue().length;
    host.textContent=count?count+' event(s) saved on this device and waiting to sync. Keep this account signed in on this device until they are uploaded.':'No events are waiting to sync.';
  }
  function renderEvents(){
    var host=$('mdoEventList');if(!host)return;
    var rows=events.slice().sort(function(a,b){return Number(a.half)-Number(b.half)||Number(a.minute)-Number(b.minute)||new Date(a.recorded_at||0)-new Date(b.recorded_at||0);});
    var html=rows.map(function(e){
      var label={GOAL:'Goal',YELLOW_CARD:'Yellow card',RED_CARD:'Red card',SUB:'Substitution'}[e.event_type]||e.event_type;
      var detail=e.event_type==='SUB'?e.player_name+' on · '+(e.player_off_name||'player off'):(e.player_name||'Player');
      if(e.assist_player_name)detail+=' · Assist: '+e.assist_player_name;
      var undo=String(e.recorded_by||'')===String(user&&user.id||'')&&['LIVE','HT'].indexOf(activeMatch.match_status)>=0?
        '<button type="button" class="secondary" data-mdo-undo="'+esc(e.id)+'">Reverse own entry</button>':'';
      return '<article class="mdo-event"><span class="mdo-time">'+esc(e.minute)+'′</span><div><strong>'+esc(label)+' · '+esc(e.team_name)+'</strong><small>'+esc(detail)+' · '+(Number(e.half)===1?'First half':'Second half')+' · '+esc(e.published_at?'Published':'Not published')+'</small></div>'+undo+'</article>';
    }).join('');
    var queued=readQueue().filter(function(e){return !activeMatch||String(e.match_id)===String(activeMatch.id);}).map(function(e){
      return '<article class="mdo-event"><span class="mdo-time">'+esc(e.minute)+'′</span><div><strong>Pending · '+esc(e.event_type)+' · '+esc(e.team_name)+'</strong><small>'+esc(e.player_name)+' · '+(Number(e.half)===1?'First half':'Second half')+' · waiting for connection</small></div><span class="mdo-badge warn">QUEUED</span></article>';
    }).join('');
    host.innerHTML=(html+queued)||'<div class="mdo-empty">No match events have been recorded for this fixture yet.</div>';
    host.querySelectorAll('[data-mdo-undo]').forEach(function(b){
      b.addEventListener('click',async function(){
        var reason=window.prompt('Reason for reversing your own event (minimum 5 characters):');
        if(reason===null)return;if(reason.trim().length<5){say('Enter a reason of at least 5 characters.',true);return;}
        b.disabled=true;
        var r=await db.rpc('reverse_match_event',{p_event_id:Number(b.getAttribute('data-mdo-undo')),p_reason:reason.trim()});
        if(r.error){b.disabled=false;say('Event reversal failed: '+r.error.message,true);return;}
        say('Your event was reversed and the reason was saved in the audit log.');
        await refreshEvents();renderEvents();
      });
    });
    showQueueStatus();
  }
  function start(){
    mount();if(observer||!document.body)return;
    observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    db.auth.onAuthStateChange(function(){setTimeout(loadAssignments,0);});
    window.addEventListener('online',function(){syncQueue();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.slfaRenderMatchDataOperator=function(){mount();return Promise.resolve();};
})();
