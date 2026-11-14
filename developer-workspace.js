/* Developer-only isolated test workspace. It never writes to official league tables. */
(function(){
  function $(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  var db=window.slfaDb, records=[], editing=null;
  var roles=[
    ['SUPER_ADMIN','Super Admin'],['CLUB_ADMIN','Club Admin'],['REFEREE','Referee'],
    ['DISCIPLINARY_OFFICER','Disciplinary Officer'],['MEDIA_OFFICER','Media Officer']
  ];
  var descriptions={
    SUPER_ADMIN:'Fixture, result, club and season workflow test data.',
    CLUB_ADMIN:'Club profile, squad and announcement workflow test data.',
    REFEREE:'Match event, lineup and final-score workflow test data.',
    DISCIPLINARY_OFFICER:'Disciplinary decision, fine and suspension workflow test data.',
    MEDIA_OFFICER:'News post, announcement and poll workflow test data.'
  };
  function panel(p){
    if(!p||String(p.system_role).toUpperCase()!=='DEVELOPER')return;
    var root=document.createElement('section');root.id='developerWorkspace';root.className='post';
    root.innerHTML='<h2 class="rt">SLFA Test Accounts Centre</h2><p class="muted">Create genuine Supabase Auth users with TEST-only roles. They sign in through the separate Test Portal and have no production staff role.</p>'+
      '<label for="taName">Test account full name</label><input id="taName" maxlength="120" placeholder="e.g. Test Super Admin">'+
      '<label for="taEmail">Unique email address</label><input id="taEmail" type="email" autocomplete="off" placeholder="Use an email address you control">'+
      '<label for="taPassword">Temporary password (minimum 10 characters)</label><input id="taPassword" type="password" minlength="10" autocomplete="new-password">'+
      '<label for="taRole">Test role</label><select id="taRole"><option value="TEST_SUPER_ADMIN">Test Super Admin</option><option value="TEST_CLUB_ADMIN">Test Club Admin</option><option value="TEST_REFEREE">Test Referee</option><option value="TEST_DISCIPLINARY_OFFICER">Test Disciplinary Officer</option><option value="TEST_MEDIA_OFFICER">Test Media Officer</option></select>'+
      '<div class="btns"><button type="button" class="primary" id="taCreate">Create real test account</button><button type="button" class="secondary" id="taRefresh">Refresh accounts</button></div><div id="taStatus" class="muted" role="status"></div><div id="taList" class="muted">Loading test accounts…</div>'+
      '<p><a href="test-portal.html" target="_blank" rel="noopener">Open the separate SLFA Test Portal</a></p>'+
      '<h2 class="rt">Developer Workspace · Safe Test Centre</h2>'+
      '<p class="muted"><strong>Isolated test data only.</strong> These entries are stored separately and do not create fixtures, scores, suspensions, posts, or other official league records. This is not an impersonation of another user.</p>'+
      '<h3>Inspect a staff panel</h3><label for="dwRole">Panel</label><select id="dwRole">'+roles.map(function(r){return '<option value="'+r[0]+'">'+r[1]+'</option>';}).join('')+'</select>'+
      '<div id="dwDescription" class="muted"></div><div class="btns"><button type="button" class="secondary" id="dwPreview">Open safe panel preview</button></div><div id="dwPreviewArea" class="post" hidden></div>'+
      '<h3>Editable test record</h3><p class="muted">Use the form to create, edit and remove sample data for the selected panel. Store structured fields as JSON.</p>'+
      '<label for="dwTitle">Test record title</label><input id="dwTitle" maxlength="160" placeholder="e.g. Sample referee match event">'+
      '<label for="dwPayload">Test data (JSON object)</label><textarea id="dwPayload" rows="7" spellcheck="false">{\n  "notes": "Sample test data only"\n}</textarea>'+
      '<div class="btns"><button type="button" class="primary" id="dwSave">Save test record</button><button type="button" class="secondary" id="dwCancel" hidden>Cancel edit</button></div>'+
      '<div id="dwStatus" class="muted" role="status"></div><h3>Saved test records</h3><div id="dwRecords" class="muted">Loading…</div>';
    var roleTools=$('roleTools');if(roleTools)roleTools.appendChild(root);
    function status(t){$('dwStatus').textContent=t;}
    function selected(){return $('dwRole').value;}
    function updateDescription(){$('dwDescription').textContent=descriptions[selected()];}
    function reset(){editing=null;$('dwTitle').value='';$('dwPayload').value='{"notes":"Sample test data only"}';$('dwSave').textContent='Save test record';$('dwCancel').hidden=true;}
    function render(){
      $('dwRecords').innerHTML=records.length?records.map(function(x){
        return '<div class="post"><strong>'+esc(x.title)+'</strong><div class="muted">'+esc(x.target_role)+' · Updated '+esc(new Date(x.updated_at).toLocaleString())+'</div><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(x.payload,null,2))+'</pre><div class="btns"><button type="button" class="small" data-edit="'+esc(x.id)+'">Edit</button><button type="button" class="small danger" data-remove="'+esc(x.id)+'">Delete</button></div></div>';
      }).join(''):'No test records saved yet.';
      root.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){var x=records.find(function(z){return z.id===b.dataset.edit;});if(!x)return;editing=x.id;$('dwRole').value=x.target_role;$('dwTitle').value=x.title;$('dwPayload').value=JSON.stringify(x.payload,null,2);$('dwSave').textContent='Update test record';$('dwCancel').hidden=false;updateDescription();};});
      root.querySelectorAll('[data-remove]').forEach(function(b){b.onclick=function(){var x=records.find(function(z){return z.id===b.dataset.remove;});if(!x||!confirm('Delete this isolated test record?'))return;db.rpc('developer_test_delete',{p_id:x.id}).then(function(r){if(r.error){status(r.error.message);return;}status('Test record deleted. Audit entry retained.');load();});};});
    }
    function load(){db.rpc('developer_test_list').then(function(r){if(r.error){status('Test Centre database setup required: '+r.error.message);$('dwRecords').textContent='Run the supplied SQL migration in Supabase before using this workspace.';return;}records=Array.isArray(r.data)?r.data:[];render();});}
    $('dwRole').addEventListener('change',updateDescription);
    $('dwPreview').onclick=function(){var role=selected(),name=roles.filter(function(x){return x[0]===role;})[0][1];var a=$('dwPreviewArea');a.hidden=false;a.innerHTML='<strong>'+esc(name)+' · Safe preview</strong><p>'+esc(descriptions[role])+'</p><p class="muted">This preview shows the panel purpose and test-data boundary. Official account data and live action controls are intentionally not loaded here.</p><span class="badge">PREVIEW ONLY</span>';};
    $('dwSave').onclick=function(){
      var title=$('dwTitle').value.trim(),payload;
      try{payload=JSON.parse($('dwPayload').value);}catch(e){status('The test data is not valid JSON.');return;}
      if(!payload||Array.isArray(payload)||typeof payload!=='object'){status('Enter a JSON object.');return;}
      if(!title){status('Enter a test record title.');return;}
      status('Saving isolated test data…');
      db.rpc('developer_test_save',{p_id:editing,p_target_role:selected(),p_title:title,p_payload:payload}).then(function(r){if(r.error){status(r.error.message);return;}status(editing?'Test record updated.':'Test record saved.');reset();load();});
    };
    function taStatus(t){$('taStatus').textContent=t;}
    function taInvoke(body){return db.functions.invoke('manage-test-accounts',{body:body});}
    function taLoad(){
      $('taList').textContent='Loading test accounts…';
      taInvoke({action:'list'}).then(function(r){
        if(r.error){$('taList').textContent='Test account service is not deployed or configured: '+r.error.message;return;}
        var rows=r.data&&r.data.accounts||[];
        $('taList').innerHTML=rows.length?rows.map(function(a){
          return '<div class="post"><strong>'+esc(a.full_name)+'</strong><div class="muted">'+esc(a.email)+' · '+esc(a.test_role)+' · '+esc(a.status)+'</div><div class="btns">'+
          (a.status==='ACTIVE'?'<button type="button" class="small" data-ta-disable="'+esc(a.user_id)+'">Disable</button>':'<button type="button" class="small" data-ta-enable="'+esc(a.user_id)+'">Enable</button>')+
          '<button type="button" class="small danger" data-ta-delete="'+esc(a.user_id)+'">Delete test account</button></div></div>';
        }).join(''):'No real test accounts created yet.';
        root.querySelectorAll('[data-ta-disable],[data-ta-enable]').forEach(function(b){b.onclick=function(){var disable=b.hasAttribute('data-ta-disable'),id=disable?b.dataset.taDisable:b.dataset.taEnable;if(!confirm((disable?'Disable':'Enable')+' this test account?'))return;taInvoke({action:'set_status',user_id:id,status:disable?'DISABLED':'ACTIVE'}).then(function(x){taStatus(x.error?x.error.message:'Test account status updated.');taLoad();});};});
        root.querySelectorAll('[data-ta-delete]').forEach(function(b){b.onclick=function(){if(!confirm('Permanently delete this test Auth account and its test-only data?'))return;taInvoke({action:'delete',user_id:b.dataset.taDelete}).then(function(x){taStatus(x.error?x.error.message:'Test account deleted.');taLoad();});};});
      });
    }
    $('taCreate').onclick=function(){
      var full_name=$('taName').value.trim(),email=$('taEmail').value.trim().toLowerCase(),password=$('taPassword').value,test_role=$('taRole').value;
      if(!full_name||!email||password.length<10){taStatus('Enter a name, valid email and password of at least 10 characters.');return;}
      $('taCreate').disabled=true;taStatus('Creating Supabase Auth test account…');
      taInvoke({action:'create',full_name:full_name,email:email,password:password,test_role:test_role}).then(function(r){
        $('taCreate').disabled=false;
        if(r.error){taStatus(r.data&&r.data.error||r.error.message);return;}
        taStatus('Real test account created. Save its email and password securely.');$('taName').value='';$('taEmail').value='';$('taPassword').value='';taLoad();
      }).catch(function(e){$('taCreate').disabled=false;taStatus(e.message||'Could not create test account.');});
    };
    $('taRefresh').onclick=taLoad;taLoad();
    $('dwCancel').onclick=reset;updateDescription();load();
  }
  window.slfaDeveloperWorkspace=panel;
})();