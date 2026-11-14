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
    root.innerHTML='<h2 class="rt">Developer Workspace · Safe Test Centre</h2>'+
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
    $('dwCancel').onclick=reset;updateDescription();load();
  }
  window.slfaDeveloperWorkspace=panel;
})();