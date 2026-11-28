/* SLFA official accreditation workspace: private evidence, controlled review and audit history. */
(function(){
'use strict';
var db=window.slfaDb,rootId='slfaOfficialAccreditation',bucket='slfa-official-documents';
var user=null,profile=null,isAdmin=false,records=[],history=[],reviewerNames={},busy=false,observerStarted=false;
function $(id){return document.getElementById(id);}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function today(){return new Date().toISOString().slice(0,10);}
function fmtDate(v){if(!v)return '—';return new Date(v+'T00:00:00').toLocaleDateString('en-GB',{timeZone:'Africa/Freetown',day:'2-digit',month:'short',year:'numeric'});}
function statusOf(x){return x.status==='VERIFIED'&&x.expires_on<today()?'EXPIRED':x.status;}
function say(t,bad){var el=$('oacStatus');if(el){el.textContent=t;el.style.color=bad?'#b42318':'inherit';}}
function css(){
 if($('oacStyle'))return;
 var s=document.createElement('style');s.id='oacStyle';s.textContent=[
 '#'+rootId+'{margin:18px 0;padding:clamp(14px,2.5vw,22px);border:1px solid var(--border,#dce4eb);border-radius:18px;background:var(--panel,#fff);color:var(--text,#172b3d);box-shadow:0 12px 28px rgba(0,40,80,.08)}',
 '#'+rootId+' *{box-sizing:border-box}#'+rootId+' .oac-kicker{font-size:9px;letter-spacing:1.5px;font-weight:900;color:#08784e;text-transform:uppercase}',
 '#'+rootId+' h2{font-size:19px;margin:6px 0}#'+rootId+' p,#'+rootId+' .muted{font-size:11px;line-height:1.55;color:var(--muted,#718096)}',
 '#'+rootId+' .form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}#'+rootId+' .field{min-width:0}#'+rootId+' .full{grid-column:1/-1}',
 '#'+rootId+' label{display:block;font-size:10px;font-weight:800;margin-bottom:5px;color:var(--muted,#536577)}',
 '#'+rootId+' input,#'+rootId+' select{width:100%;min-width:0;padding:10px;border:1px solid var(--border,#dce4eb);border-radius:9px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:12px}',
 '#'+rootId+' input:focus,#'+rootId+' select:focus{outline:2px solid rgba(0,114,198,.25);border-color:#0072c6}',
 '#'+rootId+' .btn{border:0;border-radius:9px;background:linear-gradient(110deg,#08764d,#0872b5);color:#fff;padding:10px 14px;font-size:11px;font-weight:850;cursor:pointer;min-height:42px}',
 '#'+rootId+' .alt{background:transparent;color:inherit;border:1px solid var(--border,#dce4eb)}#'+rootId+' .danger{background:#9f2b2b}#'+rootId+' button:disabled{opacity:.55;cursor:wait}',
 '#'+rootId+' .list{display:grid;gap:10px;margin-top:12px}#'+rootId+' .card{border:1px solid var(--border,#dce4eb);border-radius:12px;padding:12px;background:var(--surface,#f8fafc)}',
 '#'+rootId+' .head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}#'+rootId+' .head strong{font-size:12px}',
 '#'+rootId+' .pill{display:inline-block;border-radius:99px;padding:5px 9px;font-size:9px;font-weight:900;background:#e8f1f8;color:#1d4e69}',
 '#'+rootId+' .VERIFIED{background:#dcfce7;color:#166534}#'+rootId+' .REJECTED{background:#fee2e2;color:#991b1b}#'+rootId+' .EXPIRED{background:#ffedd5;color:#9a3412}',
 '#'+rootId+' .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:9px 0;font-size:10px}#'+rootId+' .meta b{display:block;color:var(--muted,#718096);font-size:9px;text-transform:uppercase}',
 '#'+rootId+' .actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}#'+rootId+' .review{display:grid;gap:7px;margin-top:10px}',
 '#'+rootId+' .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}#'+rootId+' .stat{padding:10px;border:1px solid var(--border,#dce4eb);border-radius:10px}#'+rootId+' .stat b{display:block;font-size:20px}#'+rootId+' .stat small{font-size:9px;color:var(--muted,#718096)}',
 '#'+rootId+' .history{border-top:1px solid var(--border,#dce4eb);margin-top:9px;padding-top:8px;font-size:10px;line-height:1.5}',
 '@media(max-width:560px){#'+rootId+' .form{grid-template-columns:1fr}#'+rootId+' .full{grid-column:auto}#'+rootId+' .meta{grid-template-columns:1fr}}'
 ].join('');document.head.appendChild(s);
}
async function mount(){
 if(busy||$(rootId)||!db||!$('roleTools'))return;busy=true;
 try{
  var auth=await db.auth.getUser();user=auth.data&&auth.data.user;if(!user)return;
  var p=await db.from('user_profiles').select('id,full_name,email,system_role,status,official_title').eq('id',user.id).maybeSingle();
  if(p.error)throw p.error;profile=p.data;if(!profile||profile.status!=='Active')return;
  isAdmin=profile.system_role==='SUPER_ADMIN';
  var isOfficial=profile.system_role==='REFEREE';if(!isAdmin&&!isOfficial)return;
  css();var panel=document.createElement('section');panel.id=rootId;
  panel.innerHTML='<span class="oac-kicker">SLFA · OFFICIAL CREDENTIALS</span><h2>Official Accreditation</h2><p>Submit and track official accreditation. Supporting documents stay private and are only opened by the official or authorised SLFA reviewers.</p><div id="oacStatus" class="muted" role="status" aria-live="polite">Loading accreditation records…</div>'+(isAdmin?
   '<div id="oacStats" class="stats"></div><div id="oacList" class="list"></div>':
   '<form id="oacForm"><div class="form"><div class="field"><label for="oacRole">Accreditation role *</label><select id="oacRole" required></select></div><div class="field"><label for="oacNumber">Accreditation number *</label><input id="oacNumber" maxlength="80" required></div><div class="field"><label for="oacAuthority">Issuing authority *</label><input id="oacAuthority" maxlength="150" required></div><div class="field"><label for="oacIssued">Issue date</label><input id="oacIssued" type="date"></div><div class="field"><label for="oacExpires">Expiry date *</label><input id="oacExpires" type="date" required></div><div class="field full"><label for="oacFile">Evidence document (PDF, JPG or PNG; maximum 10 MB) *</label><input id="oacFile" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required></div><div class="field full"><button class="btn" id="oacSubmit" type="submit">Submit accreditation for review</button></div></div></form><div id="oacList" class="list"></div>');
  $('roleTools').appendChild(panel);
  if(isOfficial){var commissioner=String(profile.official_title||'').trim().toLowerCase()==='match commissioner';var options=commissioner?[['match_commissioner','Match Commissioner']]:[['referee','Referee'],['assistant_referee','Assistant Referee'],['fourth_official','Fourth Official']];$('oacRole').innerHTML=options.map(function(x){return '<option value="'+x[0]+'">'+x[1]+'</option>';}).join('');$('oacForm').addEventListener('submit',submit);}
  if(isAdmin)$('oacList').addEventListener('click',adminClick);
  await load();
 }catch(e){var st=$('oacStatus');if(st)st.textContent='Accreditation workspace could not be loaded: '+(e.message||String(e));}
 finally{busy=false;}
}
async function submit(e){
 e.preventDefault();var file=$('oacFile').files&&$('oacFile').files[0],number=$('oacNumber').value.trim(),authority=$('oacAuthority').value.trim();
 var role=$('oacRole').value,issue=$('oacIssued').value||null,expiry=$('oacExpires').value,button=$('oacSubmit');
 if(!file){say('Select an accreditation evidence document.',true);return;}
 if(['application/pdf','image/jpeg','image/png'].indexOf(file.type)===-1){say('Only PDF, JPEG and PNG evidence is accepted.',true);return;}
 if(file.size>10*1024*1024){say('The evidence document must be 10 MB or smaller.',true);return;}
 if(!number||!authority||!expiry){say('Complete the accreditation number, issuing authority and expiry date.',true);return;}
 if(issue&&issue>expiry){say('Expiry date cannot be earlier than issue date.',true);return;}
 if(expiry<today()){say('This accreditation has already expired. Submit a current credential.',true);return;}
 if(!window.crypto||!window.crypto.getRandomValues){say('This browser cannot create a secure upload reference. Update the browser and retry.',true);return;}
 var rnd=new Uint32Array(4);window.crypto.getRandomValues(rnd);
 var token=Array.from(rnd).map(function(x){return x.toString(16);}).join('');
 var filename=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'accreditation';
 var path=user.id+'/'+Date.now()+'_'+token+'_'+filename;
 button.disabled=true;say('Uploading private evidence and registering application…');
 var up=await db.storage.from(bucket).upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
 if(up.error){button.disabled=false;say('Evidence upload failed: '+up.error.message,true);return;}
 var inserted=await db.from('official_accreditations').insert({
  official_user_id:user.id,league_id:null,official_name:profile.full_name||profile.email||user.email||'Official',
  official_role:role,accreditation_number:number,issuing_authority:authority,issued_on:issue,expires_on:expiry,
  document_path:path,status:'PENDING',reviewed_by:null,reviewed_at:null,review_notes:null
 });
 if(inserted.error){await db.storage.from(bucket).remove([path]);button.disabled=false;say('Application could not be saved: '+inserted.error.message,true);return;}
 $('oacForm').reset();button.disabled=false;say('Accreditation submitted for SLFA review.');await load();
}
async function load(){
 var q=db.from('official_accreditations').select('*').order('created_at',{ascending:false}).limit(250);
 if(!isAdmin)q=q.eq('official_user_id',user.id);
 var r=await q;if(r.error){say('Could not load accreditation records: '+r.error.message,true);return;}
 records=r.data||[];history=[];reviewerNames={};
 if(records.length){
  var h=await db.from('official_accreditation_reviews').select('id,accreditation_id,decision,review_notes,reviewer_id,reviewed_at').in('accreditation_id',records.map(function(x){return x.id;})).order('reviewed_at',{ascending:false}).limit(500);
  if(!h.error)history=h.data||[];
  if(isAdmin&&history.length){var ids=Array.from(new Set(history.map(function(x){return x.reviewer_id;}).filter(Boolean)));if(ids.length){var p=await db.from('user_profiles').select('id,full_name,email').in('id',ids);if(!p.error)(p.data||[]).forEach(function(x){reviewerNames[x.id]=x.full_name||x.email||'SLFA reviewer';});}}
 }
 render();say(records.length?records.length+' accreditation record(s) loaded.':'No accreditation records have been submitted yet.');
}
function render(){
 var host=$('oacList');if(!host)return;
 if(isAdmin){var pending=records.filter(function(x){return x.status==='PENDING';}).length,verified=records.filter(function(x){return statusOf(x)==='VERIFIED';}).length,expired=records.filter(function(x){return statusOf(x)==='EXPIRED';}).length;$('oacStats').innerHTML='<div class="stat"><b>'+pending+'</b><small>Awaiting review</small></div><div class="stat"><b>'+verified+'</b><small>Currently valid</small></div><div class="stat"><b>'+expired+'</b><small>Expired</small></div>';}
 host.innerHTML=records.length?records.map(function(x){
  var status=statusOf(x),itemHistory=history.filter(function(h){return String(h.accreditation_id)===String(x.id);});
  var historyHtml=itemHistory.length?'<div class="history"><strong>Review history</strong>'+itemHistory.map(function(h){return '<div>'+esc(h.decision)+' · '+esc(new Date(h.reviewed_at).toLocaleString('en-GB'))+' · '+esc(reviewerNames[h.reviewer_id]||'Authorised reviewer')+(h.review_notes?' · '+esc(h.review_notes):'')+'</div>';}).join('')+'</div>':'';
  var html='<article class="card"><div class="head"><div><strong>'+esc(x.official_name)+'</strong><div class="muted">'+esc(({referee:'Referee',assistant_referee:'Assistant Referee',fourth_official:'Fourth Official',match_commissioner:'Match Commissioner'})[x.official_role]||x.official_role)+' · '+esc(x.accreditation_number)+'</div></div><span class="pill '+esc(status)+'">'+esc(status)+'</span></div><div class="meta"><span><b>Issuing authority</b>'+esc(x.issuing_authority)+'</span><span><b>Issue date</b>'+esc(fmtDate(x.issued_on))+'</span><span><b>Expiry date</b>'+esc(fmtDate(x.expires_on))+'</span><span><b>Submitted</b>'+esc(new Date(x.created_at).toLocaleDateString('en-GB'))+'</span><span><b>Last reviewed</b>'+esc(x.reviewed_at?new Date(x.reviewed_at).toLocaleString('en-GB'):'Not reviewed')+'</span></div>'+(x.review_notes?'<p><strong>Review note:</strong> '+esc(x.review_notes)+'</p>':'')+'<div class="actions"><button class="btn alt" type="button" data-oac-document="'+esc(x.id)+'">Open private evidence</button></div>';
  if(isAdmin&&x.status!=='EXPIRED')html+='<div class="review"><label for="oacNote_'+esc(x.id)+'">Reviewer note</label><input id="oacNote_'+esc(x.id)+'" maxlength="1000" placeholder="Required when rejecting"><div class="actions"><button type="button" class="btn" data-oac-review="VERIFIED" data-oac-id="'+esc(x.id)+'">Verify</button><button type="button" class="btn danger" data-oac-review="REJECTED" data-oac-id="'+esc(x.id)+'">Reject</button>'+(x.expires_on<today()?'<button type="button" class="btn alt" data-oac-review="EXPIRED" data-oac-id="'+esc(x.id)+'">Record expiry</button>':'')+'</div></div>';
  return html+historyHtml+'</article>';
 }).join(''):'<div class="card muted">No accreditation applications to display.</div>';
}
async function adminClick(e){
 var doc=e.target.closest('[data-oac-document]');if(doc){var row=records.find(function(x){return String(x.id)===String(doc.dataset.oacDocument);});if(!row)return;var tab=window.open('about:blank','_blank');if(!tab){say('Allow pop-ups to open the private evidence.',true);return;}tab.opener=null;var signed=await db.storage.from(bucket).createSignedUrl(row.document_path,600);if(signed.error){tab.close();say('Cannot open evidence: '+signed.error.message,true);return;}tab.location=signed.data.signedUrl;return;}
 var btn=e.target.closest('[data-oac-review]');if(!btn)return;
 var row=records.find(function(x){return String(x.id)===String(btn.dataset.oacId);});if(!row)return;
 var state=btn.dataset.oacReview,note=$('oacNote_'+row.id),memo=note?note.value.trim():'';
 if(state==='REJECTED'&&memo.length<5){say('A rejection requires a reason of at least five characters.',true);return;}
 if(state==='VERIFIED'&&row.expires_on<today()){say('This credential has expired and cannot be verified.',true);return;}
 if(state==='EXPIRED'&&row.expires_on>=today()){say('The expiry date has not been reached.',true);return;}
 var r=await db.from('official_accreditations').update({status:state,review_notes:memo||null}).eq('id',row.id).select('id,status,reviewed_at').maybeSingle();
 if(r.error){say('Review could not be saved: '+r.error.message,true);return;}
 if(!r.data){say('No accreditation record was updated. Check your permissions.',true);return;}
 say('Review decision saved. The database records the reviewer and decision history.');await load();
}
function start(){mount();if(observerStarted||!document.body)return;observerStarted=true;new MutationObserver(function(){if(!$(rootId))mount();}).observe(document.body,{childList:true,subtree:true,characterData:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();