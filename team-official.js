/* Club-scoped electronic team-sheet submission portal.
   Team Officials can submit only for their assigned club and upcoming assigned fixtures. */
(function () {
  'use strict';
  var db=window.slfaDb, ROOT='slfaTeamSheetPortal';
  var profile=null, club=null, fixtures=[], activeMatch=null, squad=[], historyRows=[];
  function $(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function dateText(v){if(!v)return 'Kick-off not set';try{return new Date(v).toLocaleString('en-GB',{timeZone:'Africa/Freetown',dateStyle:'medium',timeStyle:'short'});}catch(e){return String(v);}}
  function timeOf(m){return new Date(m.new_match_date||m.match_date);}
  function say(t,bad){var n=$('tsoStatus');if(n){n.textContent=t;n.style.color=bad?'#a33333':'inherit';}}
  function style(){
    if($('tsoStyle'))return;
    var s=document.createElement('style');s.id='tsoStyle';
    s.textContent=[
      '#'+ROOT+'{margin:16px 0;padding:16px;border:1px solid var(--border,#dce4eb);border-radius:15px;background:var(--panel,#fff);color:var(--text,#172b3d)}',
      '#'+ROOT+' *{box-sizing:border-box}',
      '#'+ROOT+' .tso-kicker{font-size:9px;font-weight:850;letter-spacing:1.4px;color:#b18a3f}',
      '#'+ROOT+' h2{font-size:20px;margin:5px 0 8px}#'+ROOT+' h3{font-size:14px;margin:0 0 10px}',
      '#'+ROOT+' p,#'+ROOT+' .muted{font-size:11px;line-height:1.5;color:var(--muted,#718096)}',
      '#'+ROOT+' .tso-note{padding:10px 12px;border:1px solid rgba(177,138,63,.25);background:rgba(177,138,63,.08);border-radius:9px;font-size:11px;line-height:1.5;margin:10px 0}',
      '#'+ROOT+' .tso-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:9px;padding:10px;border:1px solid var(--border,#e2e8ef);border-radius:9px;margin:7px 0}',
      '#'+ROOT+' .tso-row strong{display:block;font-size:11px}#'+ROOT+' .tso-row small{display:block;font-size:10px;color:var(--muted,#718096);margin-top:3px}',
      '#'+ROOT+' label{display:block;font-size:10px;font-weight:800;color:var(--muted,#637386);margin-bottom:5px}',
      '#'+ROOT+' select{max-width:100%;min-width:120px;padding:9px;border:1px solid var(--border,#dce4eb);border-radius:8px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:11px}',
      '#'+ROOT+' .tso-fixture{padding:12px;border:1px solid var(--border,#dce4eb);border-radius:11px;margin:10px 0}',
      '#'+ROOT+' .tso-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}',
      '#'+ROOT+' .tso-stat{padding:10px;background:var(--surface,#f7f9fb);border-radius:9px;border:1px solid var(--border,#e2e8ef)}#'+ROOT+' .tso-stat small{display:block;color:var(--muted,#718096);font-size:9px}#'+ROOT+' .tso-stat b{font-size:18px}',
      '#'+ROOT+' .tso-btn{border:0;border-radius:9px;background:#086447;color:#fff;padding:11px 14px;font-size:11px;font-weight:850;cursor:pointer}',
      '#'+ROOT+' .tso-btn:disabled{opacity:.5;cursor:wait}',
      '#'+ROOT+' .tso-panel{border:1px solid var(--border,#e2e8ef);border-radius:11px;padding:12px;margin-top:13px}',
      '#'+ROOT+' .tso-staff-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}',
      '#'+ROOT+' .tso-staff-grid input:focus{outline:2px solid rgba(0,114,198,.35);border-color:#0072c6}',
      '#'+ROOT+' .tso-history{display:grid;gap:7px}.tso-history-item{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;border:1px solid var(--border,#e2e8ef);border-radius:9px;padding:10px;font-size:10px}',
      '#'+ROOT+' .tso-status{border-radius:20px;padding:4px 8px;font-size:9px;font-weight:850;background:#eaf1f8;color:#38536a}',
      '@media(max-width:580px){#'+ROOT+'{padding:12px}#'+ROOT+' .tso-grid{grid-template-columns:repeat(3,minmax(0,1fr))}#'+ROOT+' .tso-row{grid-template-columns:1fr}#'+ROOT+' .tso-staff-grid{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(s);
  }
  function mount(){
    var role=$('whoRole'),tools=$('roleTools');
    if(!role||!tools||String(role.textContent||'').trim().toUpperCase().replace(/\s+/g,'_')!=='TEAM_OFFICIAL')return;
    if($(ROOT))return;
    style();
    var panel=document.createElement('section');panel.id=ROOT;
    panel.innerHTML='<span class="tso-kicker">SLFA · CLUB OPERATIONS</span><h2>Club Representative · Team Sheet Portal</h2><p>Submit your club’s official starting XI and substitutes electronically for each upcoming fixture. Your submission is registered in the SLFA match team-sheet table and sent directly to the Super Admin for approval.</p><div class="tso-note">Only active, approved players registered to your club for the fixture season can be selected. Submit before the deadline: team sheets close 20 minutes before kick-off. An approved team sheet is locked; contact the Super Admin if a correction is required.</div><div id="tsoStatus" class="muted" role="status">Loading your club and fixtures…</div><div id="tsoApp"></div>';
    tools.insertAdjacentElement('afterend',panel);load();
  }
  async function load(){
    try{
      var u=await db.auth.getUser();var user=u.data&&u.data.user;if(!user)throw new Error('Sign in to continue.');
      var pr=await db.from('user_profiles').select('id,full_name,email,system_role,status,club_id').eq('id',user.id).maybeSingle();
      if(pr.error)throw pr.error;
      profile=pr.data;
      if(!profile||profile.system_role!=='TEAM_OFFICIAL'||profile.status!=='Active'||!profile.club_id)throw new Error('This account must be active and assigned to a club by the Technical Director.');
      var cr=await db.from('league_clubs').select('id,club_name,logo_url').eq('id',profile.club_id).maybeSingle();
      if(cr.error)throw cr.error;club=cr.data;if(!club)throw new Error('Your assigned club could not be found.');
      var current=await db.from('seasons').select('id,name').eq('is_current',true).order('id',{ascending:false}).limit(1).maybeSingle();
      if(current.error)throw current.error;
      var mr=await db.from('matches').select('id,match_date,new_match_date,home_team,away_team,venue,match_status,home_club_id,away_club_id,season_id').or('home_club_id.eq.'+club.id+',away_club_id.eq.'+club.id).in('match_status',['SCHEDULED','RESCHEDULED']).order('match_date',{ascending:true}).limit(100);
      if(mr.error)throw mr.error;
      fixtures=(mr.data||[]).filter(function(m){return timeOf(m).getTime()>Date.now();});
      render();
      await loadHistory();
      say('Signed in as '+(profile.full_name||profile.email)+' · '+club.club_name+'. Select a fixture to prepare your team sheet.');
    }catch(e){say(e.message||String(e),true);}
  }
  function render(){
    var host=$('tsoApp');if(!host)return;
    var opts=fixtures.map(function(m){return '<option value="'+esc(m.id)+'">'+esc(m.home_team)+' v '+esc(m.away_team)+' · '+esc(dateText(m.new_match_date||m.match_date))+'</option>';}).join('');
    host.innerHTML='<div class="tso-panel"><h3>Club workspace</h3><div class="tso-row"><div><strong>'+esc(club.club_name)+'</strong><small>Assigned Team Official: '+esc(profile.full_name||profile.email)+'</small></div><span class="tso-status">TEAM OFFICIAL</span></div><label for="tsoFixture">Select your upcoming fixture</label><select id="tsoFixture" style="width:100%"><option value="">Choose fixture…</option>'+opts+'</select><div id="tsoFixtureInfo"></div><div id="tsoSheetForm"></div></div><div class="tso-panel"><h3>My team-sheet submissions</h3><div id="tsoHistory" class="tso-history"><span class="muted">Loading…</span></div></div>';
    $('tsoFixture').addEventListener('change',function(){openFixture(this.value);});
    if(!fixtures.length)$('tsoFixtureInfo').innerHTML='<p class="muted">No upcoming scheduled fixtures are currently linked to this club.</p>';
  }
  async function openFixture(id){
    activeMatch=fixtures.find(function(m){return String(m.id)===String(id);})||null;
    var info=$('tsoFixtureInfo'),form=$('tsoSheetForm');
    if(!activeMatch){info.innerHTML='';form.innerHTML='';return;}
    var deadline=new Date(timeOf(activeMatch).getTime()-20*60000);
    info.innerHTML='<div class="tso-fixture"><strong>'+esc(activeMatch.home_team)+' v '+esc(activeMatch.away_team)+'</strong><p>'+esc(dateText(activeMatch.new_match_date||activeMatch.match_date))+' · '+esc(activeMatch.venue||'Venue to be confirmed')+'</p><p>Submission deadline: '+esc(dateText(deadline))+'</p></div>';
    form.innerHTML='<span class="muted">Loading approved player registrations…</span>';
    try{
      var seasonId=activeMatch.season_id;
      if(!seasonId){var sr=await db.from('seasons').select('id').eq('is_current',true).order('id',{ascending:false}).limit(1).maybeSingle();if(sr.error)throw sr.error;seasonId=sr.data&&sr.data.id;}
      if(!seasonId)throw new Error('No current competition season is configured.');
      var players=await db.from('club_squad').select('id,player_name,jersey_number,position').eq('club_id',club.id).eq('season_id',seasonId).eq('status','Active').eq('registration_status','Approved').order('jersey_number',{ascending:true});
      if(players.error)throw players.error;squad=players.data||[];
      var existing=await db.from('match_team_sheets').select('id,reference_code,starting_player_ids,substitute_player_ids,status,review_notes,head_coach_name,team_manager_name,assistant_coach_name,team_doctor_name,physiotherapist_name').eq('match_id',activeMatch.id).eq('club_id',club.id).maybeSingle();
      if(existing.error)throw existing.error;
      renderPicker(existing.data||null);
    }catch(e){form.innerHTML='<p class="muted">'+esc(e.message||String(e))+'</p>';}
  }
  function renderPicker(existing){
    var host=$('tsoSheetForm');if(!host)return;
    var locked=existing&&existing.status==='APPROVED';
    var starts=(existing&&existing.starting_player_ids)||[],subs=(existing&&existing.substitute_player_ids)||[];
    function staffField(id,label,value,required){
      return '<label for="'+id+'">'+label+(required?' *':'')+'</label><input id="'+id+'" type="text" maxlength="150" value="'+esc(value||'')+'" '+(required?'required':'')+(locked?' disabled':'')+' placeholder="Enter full name" style="width:100%;padding:10px;border:1px solid var(--border,#dce4eb);border-radius:8px;margin:4px 0 10px">';
    }
    var staffMarkup='<section class="tso-panel" aria-labelledby="tsoBenchTitle"><h3 id="tsoBenchTitle">Bench staff and team officials</h3><p class="muted">Record the officials accompanying this team. Head Coach and Team Manager are required; other roles are optional.</p><div class="tso-staff-grid">'+
      '<div>'+staffField('tsoHeadCoach','Head Coach',existing&&existing.head_coach_name,true)+'</div>'+
      '<div>'+staffField('tsoTeamManager','Team Manager',existing&&existing.team_manager_name,true)+'</div>'+
      '<div>'+staffField('tsoAssistantCoach','Assistant Coach',existing&&existing.assistant_coach_name,false)+'</div>'+
      '<div>'+staffField('tsoTeamDoctor','Team Doctor',existing&&existing.team_doctor_name,false)+'</div>'+
      '<div>'+staffField('tsoPhysio','Physiotherapist',existing&&existing.physiotherapist_name,false)+'</div>'+
      '</div></section>';
    var rows=squad.map(function(p){
      var current=starts.indexOf(p.id)>=0?'STARTER':(subs.indexOf(p.id)>=0?'SUB':'NONE');
      return '<div class="tso-row"><div><strong>'+(p.jersey_number?'#'+esc(p.jersey_number)+' ':'')+esc(p.player_name)+'</strong><small>'+esc(p.position||'Position not listed')+'</small></div><select data-tso-player="'+esc(p.id)+'" '+(locked?'disabled':'')+'><option value="NONE" '+(current==='NONE'?'selected':'')+'>Not selected</option><option value="STARTER" '+(current==='STARTER'?'selected':'')+'>Starting XI</option><option value="SUB" '+(current==='SUB'?'selected':'')+'>Substitute</option></select></div>';
    }).join('');
    var kick=timeOf(activeMatch),canSubmit=Date.now()<kick.getTime()-20*60000&&['SCHEDULED','RESCHEDULED'].includes(activeMatch.match_status);
    host.innerHTML='<h3 style="margin-top:12px">Select players for '+esc(club.club_name)+'</h3><div class="tso-grid"><div class="tso-stat"><small>Starting XI</small><b id="tsoStarterCount">0 / 11</b></div><div class="tso-stat"><small>Substitutes</small><b id="tsoSubCount">0 / 9</b></div><div class="tso-stat"><small>Approved squad</small><b>'+squad.length+'</b></div></div><p class="muted">Choose exactly 11 starters and up to 9 substitutes. A player cannot appear in both groups.</p>'+(rows||'<p class="muted">No active approved players are registered for this club and season.</p>')+(existing&&existing.review_notes?'<div class="tso-note">Super Admin feedback: '+esc(existing.review_notes)+'</div>':'')+staffMarkup+'<div id="tsoSubmitStatus" class="muted" role="status"></div><button type="button" id="tsoSubmit" class="tso-btn" '+(!canSubmit||locked||squad.length<11?'disabled':'')+'>'+(locked?'Approved · Locked':(canSubmit?'Submit team sheet to Super Admin':'Submission deadline passed'))+'</button>';
    host.querySelectorAll('[data-tso-player]').forEach(function(el){el.addEventListener('change',updateCounts);});
    updateCounts();
    var btn=$('tsoSubmit');if(btn)btn.addEventListener('click',submit);
  }
  function selections(){
    var starters=[],subs=[];
    document.querySelectorAll('[data-tso-player]').forEach(function(el){var id=Number(el.dataset.tsoPlayer);if(el.value==='STARTER')starters.push(id);if(el.value==='SUB')subs.push(id);});
    return {starters:starters,subs:subs};
  }
  function updateCounts(){
    var v=selections(),a=$('tsoStarterCount'),b=$('tsoSubCount'),btn=$('tsoSubmit');
    if(a)a.textContent=v.starters.length+' / 11';if(b)b.textContent=v.subs.length+' / 9';
    if(btn&&!btn.disabled)btn.disabled=v.starters.length!==11||v.subs.length>9;
    if(btn&&btn.textContent==='Submit team sheet to Super Admin')btn.disabled=v.starters.length!==11||v.subs.length>9;
  }
  async function submit(){
    var btn=$('tsoSubmit'),status=$('tsoSubmitStatus'),v=selections();
    var staff={head:$('tsoHeadCoach')&&$('tsoHeadCoach').value.trim(),manager:$('tsoTeamManager')&&$('tsoTeamManager').value.trim(),
      assistant:$('tsoAssistantCoach')&&$('tsoAssistantCoach').value.trim(),doctor:$('tsoTeamDoctor')&&$('tsoTeamDoctor').value.trim(),
      physio:$('tsoPhysio')&&$('tsoPhysio').value.trim()};
    if(v.starters.length!==11||v.subs.length>9){if(status)status.textContent='Select exactly 11 starters and no more than 9 substitutes.';return;}
    if(!staff.head||staff.head.length<2||!staff.manager||staff.manager.length<2){if(status)status.textContent='Enter the Head Coach and Team Manager names before submitting.';return;}
    if(!activeMatch)return;
    if(btn)btn.disabled=true;if(status)status.textContent='Submitting securely to the SLFA database…';
    try{
      var r=await db.rpc('submit_match_team_sheet_with_staff',{p_match_id:activeMatch.id,p_starting_player_ids:v.starters,p_substitute_player_ids:v.subs,p_head_coach_name:staff.head,p_team_manager_name:staff.manager,p_assistant_coach_name:staff.assistant||null,p_team_doctor_name:staff.doctor||null,p_physiotherapist_name:staff.physio||null});
      if(r.error)throw r.error;
      var result=r.data||{};
      if(status)status.textContent='Team sheet submitted. Reference: '+(result.reference_code||'saved')+'. The Super Admin has received it.';
      await loadHistory();
      await openFixture(activeMatch.id);
    }catch(e){if(status)status.textContent='Submission failed: '+(e.message||String(e));if(btn)btn.disabled=false;}
  }
  async function loadHistory(){
    var host=$('tsoHistory');if(!host||!club)return;
    var r=await db.from('match_team_sheets').select('id,reference_code,match_id,status,submitted_at,review_notes').eq('club_id',club.id).order('submitted_at',{ascending:false}).limit(25);
    if(r.error){host.textContent='Could not load your team-sheet history: '+r.error.message;return;}
    historyRows=r.data||[];
    host.innerHTML=historyRows.length?historyRows.map(function(x){
      var m=fixtures.find(function(y){return String(y.id)===String(x.match_id);})||{};
      return '<article class="tso-history-item"><div><strong>'+esc(x.reference_code||'Team sheet')+' · '+esc(m.home_team||'Match #'+x.match_id)+' v '+esc(m.away_team||'')+'</strong><small class="muted">'+esc(dateText(x.submitted_at))+(x.review_notes?' · '+esc(x.review_notes):'')+'</small></div><span class="tso-status">'+esc(x.status)+'</span></article>';
    }).join(''):'<span class="muted">No team sheets submitted yet.</span>';
  }
  function start(){
    mount();if(!document.body||start.wired)return;start.wired=true;
    new MutationObserver(mount).observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();