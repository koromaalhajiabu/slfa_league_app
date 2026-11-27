(function(){
'use strict';
var cfg=window.SLFA_CONFIG, db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
window.slfaDb=db;
var $=function(id){return document.getElementById(id);};
var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var activeLeague=null, assignedRows=[], currentMatches=[], currentClubs=[], reportData={};
function status(s){var a=$('laLoginStatus'),b=$('laAppStatus');if(a)a.textContent=s;if(b)b.textContent=s;}
function showAuth(s){$('laLogin').hidden=false;$('laApp').hidden=true;if(s)status(s);}
function showApp(){ $('laLogin').hidden=true;$('laApp').hidden=false; }
async function start(){
 var u=await db.auth.getUser();
 if(!u.data||!u.data.user){showAuth('Sign in with your approved SLFA account.');return;}
 var p=await db.from('user_profiles').select('id,full_name,email,system_role,status').eq('id',u.data.user.id).maybeSingle();
 if(p.error||!p.data||p.data.status!=='Active'||p.data.system_role!=='LEAGUE_ADMIN'){await db.auth.signOut();showAuth('This account is not authorised as a League Administrator.');return;}
 var fr=await db.from('application_control').select('app_frozen').eq('id',1).maybeSingle();
 if(fr.error||!fr.data||fr.data.app_frozen){await db.auth.signOut();showAuth(fr.error?'Security status could not be verified. Access is blocked.':'The SLFA application is temporarily in maintenance mode.');return;}
 showApp();$('laWho').textContent=p.data.full_name||p.data.email;
 var a=await db.from('league_admin_assignments').select('id,league_id,leagues(id,name,competition_type,gender_category,description,start_date,end_date,venue,format_details)').eq('user_id',u.data.user.id).eq('is_active',true);
 if(a.error){status('Could not load your competition assignments.');return;}
 var rows=a.data||[];assignedRows=rows;$('laCompetition').innerHTML=rows.map(function(x){return '<option value="'+x.league_id+'">'+esc(x.leagues&&x.leagues.name||'Competition')+'</option>';}).join('');
 if(!rows.length){status('No active competition has been assigned to this account. Contact the Super Admin.');return;}
 $('laCompetition').addEventListener('change',function(){loadLeague(rows);});
 $('laCompetition').value=String(rows[0].league_id);await loadLeague(rows);
}
async function loadLeague(rows){
 var id=Number($('laCompetition').value), item=rows.find(function(x){return Number(x.league_id)===id;});if(!item||!item.leagues)return;
 activeLeague=item.leagues;$('laTitle').textContent=activeLeague.name;
 $('laDescription').value=activeLeague.description||'';$('laVenue').value=activeLeague.venue||'';
 $('laStart').value=activeLeague.start_date||'';$('laEnd').value=activeLeague.end_date||'';
 $('laFormat').value=activeLeague.format_details||'';
 var [clubs,matches]=await Promise.all([
 db.from('league_clubs').select('id,club_name,city,stadium,is_active').eq('league_id',id).order('club_name'),
 db.from('matches').select('id,match_date,home_team,away_team,venue,match_status').eq('league_id',id).order('match_date',{ascending:true}).limit(100)
 ]);
 $('laClubs').innerHTML=clubs.error?'<p>Club list unavailable.</p>':(clubs.data||[]).map(function(c){return '<div class="la-row"><strong>'+esc(c.club_name)+'</strong><span>'+esc(c.city||'')+'</span><span>'+(c.is_active?'Active':'Inactive')+'</span></div>';}).join('')||'<p>No clubs registered in this competition.</p>';
 $('laFixtures').innerHTML=matches.error?'<p>Fixture list unavailable.</p>':(matches.data||[]).map(function(m){return '<div class="la-row"><strong>'+esc(m.home_team)+' v '+esc(m.away_team)+'</strong><span>'+esc(m.match_date?new Date(m.match_date).toLocaleString():'Date pending')+'</span><span>'+esc(m.match_status)+'</span></div>';}).join('')||'<p>No fixtures recorded yet.</p>';
 $('laClubCount').textContent=(clubs.data||[]).length;$('laFixtureCount').textContent=(matches.data||[]).length;
 status('Managing '+activeLeague.name+'. Your access is limited to assigned competitions.');
 await loadOperationalPanels(matches.data||[],clubs.data||[]);
}
$('laSignIn').addEventListener('click',async function(){status('Signing in…');var r=await db.auth.signInWithPassword({email:$('laEmail').value.trim(),password:$('laPassword').value});if(r.error){status('Sign-in failed. Check your credentials.');return;}await start();});
$('laPassword').addEventListener('keydown',function(e){if(e.key==='Enter')$('laSignIn').click();});
$('laSignOut').addEventListener('click',async function(){await db.auth.signOut();location.reload();});
$('laSaveCompetition').addEventListener('click',async function(){if(!activeLeague)return;status('Saving competition details…');var r=await db.from('leagues').update({description:$('laDescription').value.trim(),venue:$('laVenue').value.trim()||null,start_date:$('laStart').value||null,end_date:$('laEnd').value||null,format_details:$('laFormat').value.trim()||null}).eq('id',activeLeague.id);if(r.error){status('Could not save. '+r.error.message);return;}status('Competition details saved. Publishing and global rules remain under Super Admin control.');});
$('laAddClub').addEventListener('click',async function(){if(!activeLeague)return;var name=$('laClubName').value.trim();if(name.length<2){status('Enter a valid club name.');return;}status('Adding club…');var r=await db.from('league_clubs').insert({id:crypto.randomUUID(),club_name:name,city:$('laClubCity').value.trim()||null,stadium:$('laClubStadium').value.trim()||null,league_id:activeLeague.id,is_active:true});if(r.error){status('Could not add club. '+r.error.message);return;}$('laClubName').value='';$('laClubCity').value='';$('laClubStadium').value='';await loadLeague(assignedRows);status('Club added to assigned competition.');});
$('laAddFixture').addEventListener('click',async function(){if(!activeLeague)return;var h=$('laHome').value.trim(),a=$('laAway').value.trim(),d=$('laDate').value;if(!h||!a||!d){status('Enter both clubs and a kickoff date/time.');return;}status('Creating fixture…');var r=await db.from('matches').insert({league_id:activeLeague.id,home_team:h,away_team:a,match_date:new Date(d).toISOString(),venue:$('laMatchVenue').value.trim()||activeLeague.venue||null,match_status:'SCHEDULED',current_half:1});if(r.error){status('Could not create fixture. '+r.error.message);return;}$('laHome').value='';$('laAway').value='';$('laDate').value='';status('Fixture created. Referee assignment and result confirmation remain separate authorised processes.');await start();});
async function loadOperationalPanels(matches,clubs){
 currentMatches=matches;currentClubs=clubs;var ids=matches.map(x=>x.id);
 $('laCaseMatch').innerHTML=matches.map(m=>'<option value="'+m.id+'">'+esc(m.home_team)+' v '+esc(m.away_team)+' · '+esc(m.match_date?new Date(m.match_date).toLocaleDateString():'TBC')+'</option>').join('');
 var clubIds=clubs.map(x=>x.id),players=[];
 if(clubIds.length){var p=await db.from('club_squad').select('id,player_name,club_id').in('club_id',clubIds).order('player_name');if(!p.error)players=p.data||[];}
 $('laCasePlayer').innerHTML='<option value="">Not player-specific</option>'+players.map(p=>'<option value="'+p.id+'">'+esc(p.player_name)+'</option>').join('');
 var sheets=[],commissioners=[],disputes=[],sanctions=[],cases=[],audit=[],standings=[];
 if(ids.length){
  var q=await Promise.all([
   db.from('league_standings').select('club,pos,mp,w,d,l,gf,ga,pts').eq('league_id',activeLeague.id).order('pos',{ascending:true}),
   db.from('match_team_sheets').select('id,match_id,club_id,starting_player_ids,substitute_player_ids,submitted_at,status,reference_code,review_notes').in('match_id',ids).order('submitted_at',{ascending:false}),
   db.from('match_commissioner_reports').select('id,match_id,report_status,pitch_condition,facilities_condition,security_arrangements,incident_details,post_match_summary,recommendations,submitted_at,created_at').in('match_id',ids).order('created_at',{ascending:false}),
   db.from('match_disputes').select('id,match_id,club_id,subject,description,status,raised_at,decision_note').in('match_id',ids).order('raised_at',{ascending:false}),
   db.from('disciplinary_actions').select('id,player_id,match_id,action_type,reason,amount,currency,published,decided_at').in('match_id',ids).order('decided_at',{ascending:false}),
   db.from('league_admin_disciplinary_cases').select('id,match_id,player_id,case_type,description,status,admin_notes,created_at,referred_at').eq('league_id',activeLeague.id).order('created_at',{ascending:false}),
   db.from('match_audit_log').select('id,occurred_at,actor_name,actor_role,table_name,action,reason,match_id').in('match_id',ids.map(String)).order('occurred_at',{ascending:false}).limit(40)
  ]);
  standings=q[0].data||[];sheets=q[1].data||[];commissioners=q[2].data||[];disputes=q[3].data||[];sanctions=q[4].data||[];cases=q[5].data||[];audit=q[6].data||[];
  $('laStandings').innerHTML=q[0].error?'Standings unavailable.':standings.length?'<div class="la-row"><strong>Club</strong><span>MP · W · D · L</span><span>GD · Pts</span></div>'+standings.map(x=>'<div class="la-row"><strong>'+esc(x.pos)+'. '+esc(x.club)+'</strong><span>'+esc(x.mp)+' · '+esc(x.w)+' · '+esc(x.d)+' · '+esc(x.l)+'</span><span>'+esc(Number(x.gf||0)-Number(x.ga||0))+' · '+esc(x.pts)+'</span></div>').join(''):'<p>No standings published for this competition.</p>';
  var results=matches.filter(x=>x.home_score!==null&&x.away_score!==null);$('laResults').innerHTML=results.map(x=>'<div class="la-row"><strong>'+esc(x.home_team)+' '+esc(x.home_score)+' – '+esc(x.away_score)+' '+esc(x.away_team)+'</strong><span>'+esc(x.match_status)+'</span><span>'+esc(x.match_date?new Date(x.match_date).toLocaleDateString():'')+'</span></div>').join('')||'<p>No recorded results yet.</p>';
  $('laTeamSheets').innerHTML=q[0].error?'Team-sheet oversight unavailable.':sheets.map(x=>{var m=matches.find(y=>y.id===x.match_id)||{},c=clubs.find(y=>y.id===x.club_id)||{};return '<div class="la-row"><strong>'+esc(c.club_name||'Club')+' · '+esc(m.home_team)+' v '+esc(m.away_team)+'</strong><span>'+esc(x.reference_code)+' · '+esc(x.status)+'</span><span>'+esc(x.submitted_at?new Date(x.submitted_at).toLocaleString():'')+'</span></div>';}).join('')||'<p>No team sheets submitted yet.</p>';
  $('laCommissionerReports').innerHTML=q[1].error?'Commissioner reports unavailable.':commissioners.map(x=>{var m=matches.find(y=>y.id===x.match_id)||{};return '<div class="la-row"><strong>'+esc(m.home_team)+' v '+esc(m.away_team)+'</strong><span>'+esc(x.report_status)+'</span><span>'+esc(x.incident_details||x.post_match_summary||x.recommendations||'No incident summary')+'</span></div>';}).join('')||'<p>No commissioner reports submitted yet.</p>';
  $('laDisputes').innerHTML=q[2].error?'Dispute register unavailable.':disputes.map(x=>{var m=matches.find(y=>y.id===x.match_id)||{};return '<div class="la-row"><strong>'+esc(x.subject)+'</strong><span>'+esc(m.home_team)+' v '+esc(m.away_team)+' · '+esc(x.status)+'</span><span>'+esc(x.description)+'</span></div>';}).join('')||'<p>No disputes recorded.</p>';
  $('laSanctions').innerHTML=q[3].error?'Disciplinary actions unavailable.':sanctions.map(x=>'<div class="la-row"><strong>'+esc(x.action_type)+'</strong><span>'+esc(x.reason)+'</span><span>'+(x.published?'Published':'Unpublished')+'</span></div>').join('')||'<p>No disciplinary actions recorded for these fixtures.</p>';
  $('laCases').innerHTML=q[4].error?'Case register unavailable.':cases.map(x=>{var m=matches.find(y=>y.id===x.match_id)||{};return '<div class="la-row"><strong>'+esc(x.case_type)+' · '+esc(m.home_team)+' v '+esc(m.away_team)+'</strong><span>'+esc(x.status)+'</span><span>'+esc(x.description)+(x.status==='DRAFT'?' <button type="button" data-refer-case="'+x.id+'">Refer to Disciplinary Officer</button>':'')+'</span></div>';}).join('')||'<p>No cases registered.</p>';
  $('laAudit').innerHTML=q[5].error?'Activity log unavailable.':audit.map(x=>'<div class="la-row"><strong>'+esc(x.action)+' · '+esc(x.table_name)+'</strong><span>'+esc(x.actor_name||x.actor_role||'System')+'</span><span>'+esc(x.occurred_at?new Date(x.occurred_at).toLocaleString():'')+' · '+esc(x.reason||'')+'</span></div>').join('')||'<p>No match activity available.</p>';
 }else{$('laTeamSheets').textContent='No fixtures to review.';$('laCommissionerReports').textContent='No fixtures to review.';$('laDisputes').textContent='No fixtures to review.';$('laSanctions').textContent='No fixtures to review.';$('laCases').textContent='No fixtures to review.';$('laAudit').textContent='No fixtures to review.';}
 $('laCases').querySelectorAll('[data-refer-case]').forEach(function(b){b.addEventListener('click',async function(){var r=await db.from('league_admin_disciplinary_cases').update({status:'REFERRED',referred_at:new Date().toISOString()}).eq('id',b.dataset.referCase).eq('status','DRAFT');if(r.error){status('Could not refer case: '+r.error.message);return;}status('Case referred to the Disciplinary Officer. Final decision remains with the disciplinary authority.');await loadOperationalPanels(currentMatches,currentClubs);});});
 reportData={matches:matches,clubs:clubs,standings:standings,sheets:sheets,commissioners:commissioners,disputes:disputes,sanctions:sanctions,cases:cases,audit:audit};
}
$('laCreateCase').addEventListener('click',async function(){
 if(!activeLeague)return;var mid=Number($('laCaseMatch').value),desc=$('laCaseDescription').value.trim();if(!mid||desc.length<20){status('Select a match and enter a description of at least 20 characters.');return;}
 var user=await db.auth.getUser();if(!user.data.user){status('Your session has expired. Sign in again.');return;}
 var ev=$('laCaseEvidence').value.split(',').map(x=>x.trim()).filter(Boolean);
 var r=await db.from('league_admin_disciplinary_cases').insert({league_id:activeLeague.id,match_id:mid,player_id:$('laCasePlayer').value?Number($('laCasePlayer').value):null,case_type:$('laCaseType').value,description:desc,evidence_paths:ev,reported_by:user.data.user.id});
 if(r.error){status('Could not save case: '+r.error.message);return;}
 $('laCaseDescription').value='';$('laCaseEvidence').value='';status('Case recorded. Refer it to the Disciplinary Officer when ready.');await loadOperationalPanels(currentMatches,currentClubs);
});
$('laExportReport').addEventListener('click',function(){
 var d=reportData,rows=[['Section','Reference','Status','Details','Date']];
 (d.matches||[]).forEach(x=>rows.push(['Fixture',x.id,x.match_status,(x.home_team||'')+' v '+(x.away_team||''),x.match_date||'']));
 (d.clubs||[]).forEach(x=>rows.push(['Club',x.id,x.is_active?'Active':'Inactive',x.club_name,x.city||'']));
 (d.standings||[]).forEach(x=>rows.push(['Standing',x.pos,'',x.club+' · Played '+x.mp+' · Points '+x.pts,'']));
 (d.sheets||[]).forEach(x=>rows.push(['Team sheet',x.reference_code,x.status,'Match '+x.match_id,x.submitted_at||'']));
 (d.commissioners||[]).forEach(x=>rows.push(['Commissioner report',x.id,x.report_status,x.incident_details||x.post_match_summary||'',x.submitted_at||'']));
 (d.disputes||[]).forEach(x=>rows.push(['Dispute',x.id,x.status,x.subject+' — '+x.description,x.raised_at||'']));
 (d.sanctions||[]).forEach(x=>rows.push(['Disciplinary action',x.id,x.published?'Published':'Unpublished',x.action_type+' — '+x.reason,x.decided_at||'']));
 (d.cases||[]).forEach(x=>rows.push(['Case referral',x.id,x.status,x.case_type+' — '+x.description,x.created_at||'']));
 var csv=rows.map(r=>r.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 var url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='SLFA-'+activeLeague.name.replace(/[^a-z0-9]+/gi,'-')+'-operations-report.csv';a.click();URL.revokeObjectURL(url);
});

start();
})();