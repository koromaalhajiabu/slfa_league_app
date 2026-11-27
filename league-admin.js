(function(){
'use strict';
var cfg=window.SLFA_CONFIG, db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
window.slfaDb=db;
var $=function(id){return document.getElementById(id);};
var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var activeLeague=null;
function status(s){$('laStatus').textContent=s;}
function showAuth(s){$('laLogin').hidden=false;$('laApp').hidden=true;if(s)status(s);}
function showApp(){ $('laLogin').hidden=true;$('laApp').hidden=false; }
async function start(){
 var u=await db.auth.getUser();
 if(!u.data||!u.data.user){showAuth('Sign in with your approved SLFA account.');return;}
 var p=await db.from('user_profiles').select('id,full_name,email,system_role,status').eq('id',u.data.user.id).maybeSingle();
 if(p.error||!p.data||p.data.status!=='Active'||p.data.system_role!=='LEAGUE_ADMIN'){await db.auth.signOut();showAuth('This account is not authorised as a League Administrator.');return;}
 showApp();$('laWho').textContent=p.data.full_name||p.data.email;
 var a=await db.from('league_admin_assignments').select('id,league_id,leagues(id,name,competition_type,gender_category,description,start_date,end_date,venue,format_details)').eq('user_id',u.data.user.id).eq('is_active',true);
 if(a.error){status('Could not load your competition assignments.');return;}
 var rows=a.data||[];$('laCompetition').innerHTML=rows.map(function(x){return '<option value="'+x.league_id+'">'+esc(x.leagues&&x.leagues.name||'Competition')+'</option>';}).join('');
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
}
$('laSignIn').addEventListener('click',async function(){status('Signing in…');var r=await db.auth.signInWithPassword({email:$('laEmail').value.trim(),password:$('laPassword').value});if(r.error){status('Sign-in failed. Check your credentials.');return;}await start();});
$('laPassword').addEventListener('keydown',function(e){if(e.key==='Enter')$('laSignIn').click();});
$('laSignOut').addEventListener('click',async function(){await db.auth.signOut();location.reload();});
$('laSaveCompetition').addEventListener('click',async function(){if(!activeLeague)return;status('Saving competition details…');var r=await db.from('leagues').update({description:$('laDescription').value.trim(),venue:$('laVenue').value.trim()||null,start_date:$('laStart').value||null,end_date:$('laEnd').value||null,format_details:$('laFormat').value.trim()||null}).eq('id',activeLeague.id);if(r.error){status('Could not save. '+r.error.message);return;}status('Competition details saved. Publishing and global rules remain under Super Admin control.');});
$('laAddClub').addEventListener('click',async function(){if(!activeLeague)return;var name=$('laClubName').value.trim();if(name.length<2){status('Enter a valid club name.');return;}status('Adding club…');var r=await db.from('league_clubs').insert({club_name:name,city:$('laClubCity').value.trim()||null,stadium:$('laClubStadium').value.trim()||null,league_id:activeLeague.id,is_active:true});if(r.error){status('Could not add club. '+r.error.message);return;}$('laClubName').value='';$('laClubCity').value='';$('laClubStadium').value='';var selected=$('laCompetition').value;var all=await db.from('league_admin_assignments').select('league_id,leagues(id,name,competition_type,gender_category,description,start_date,end_date,venue,format_details)').eq('is_active',true);await loadLeague((all.data||[]).filter(function(x){return String(x.league_id)===selected;}));status('Club added to assigned competition.');});
$('laAddFixture').addEventListener('click',async function(){if(!activeLeague)return;var h=$('laHome').value.trim(),a=$('laAway').value.trim(),d=$('laDate').value;if(!h||!a||!d){status('Enter both clubs and a kickoff date/time.');return;}status('Creating fixture…');var r=await db.from('matches').insert({league_id:activeLeague.id,home_team:h,away_team:a,match_date:new Date(d).toISOString(),venue:$('laMatchVenue').value.trim()||activeLeague.venue||null,match_status:'SCHEDULED',current_half:1});if(r.error){status('Could not create fixture. '+r.error.message);return;}$('laHome').value='';$('laAway').value='';$('laDate').value='';status('Fixture created. Referee assignment and result confirmation remain separate authorised processes.');await start();});
start();
})();