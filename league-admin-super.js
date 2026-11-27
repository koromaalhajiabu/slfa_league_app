(function(){
'use strict';
var db=window.slfaDb,$=function(id){return document.getElementById(id);};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function msg(s){$('laAssignStatus').textContent=s;}
async function load(){
 if(!db)return;
 var l=await db.from('leagues').select('id,name').order('sort_order').order('name');
 if(l.error){msg('Could not load competitions.');return;}
 $('laAssignLeague').innerHTML=(l.data||[]).map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('');
 await list();
}
async function list(){
 var r=await db.from('league_admin_assignments').select('id,user_id,league_id,assigned_at,is_active,leagues(name)').eq('is_active',true).order('assigned_at',{ascending:false});
 if(r.error){$('laAssignments').textContent='Assignment list unavailable: '+r.error.message;return;}
 var rows=r.data||[],ids=rows.map(x=>x.user_id),profiles=[];
 if(ids.length){var p=await db.from('user_profiles').select('id,full_name,email').in('id',ids);if(p.error){$('laAssignments').textContent='Administrator details unavailable: '+p.error.message;return;}profiles=p.data||[];}
 $('laAssignments').innerHTML=rows.map(x=>{var u=profiles.find(p=>p.id===x.user_id)||{};return '<div class="post" style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><span><strong>'+esc(u.full_name||u.email||'Staff account')+'</strong><br><small>'+esc(u.email||'')+' · '+esc(x.leagues&&x.leagues.name||'Competition')+'</small></span><button type="button" class="secondary" data-revoke="'+x.id+'">Revoke access</button></div>';}).join('')||'No League Administrators assigned yet.';
 $('laAssignments').querySelectorAll('[data-revoke]').forEach(b=>b.addEventListener('click',async function(){if(!confirm('Revoke this League Administrator assignment?'))return;var z=await db.rpc('admin_revoke_league_admin',{p_assignment_id:Number(b.dataset.revoke)});if(z.error){msg(z.error.message);return;}msg('Assignment revoked.');await list();}));
}
$('laAssignButton').addEventListener('click',async function(){
 var email=$('laAssignEmail').value.trim(),id=Number($('laAssignLeague').value);
 if(!email||!id){msg('Enter an existing active staff account email and select a competition.');return;}
 msg('Assigning access…');
 var r=await db.rpc('admin_assign_league_admin',{p_email:email,p_league_id:id});
 if(r.error){msg(r.error.message);return;}
 $('laAssignEmail').value='';msg('League Administrator assigned successfully.');await list();
});
db.auth.getSession().then(function(s){if(s.data&&s.data.session)load();});
db.auth.onAuthStateChange(function(event){if(event==='SIGNED_IN')load();});
})();