// Portal pages: role access plus Developer-only application maintenance bypass.
(function () {
  var cfg=window.SLFA_CONFIG;
  var db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  window.slfaDb=db;
  var PAGES={DEVELOPER:'developer.html',SUPER_ADMIN:'super-admin.html',REFEREE:'referee.html',MEDIA_OFFICER:'media.html',DISCIPLINARY_OFFICER:'disciplinary.html',CLUB_ADMIN:'club.html'};
  var portal=document.body.dataset.portal;
  function $(id){return document.getElementById(id);}
  function showSignIn(message){$('signIn').hidden=false;$('portalArea').hidden=true;$('pStatus').textContent=message||'';}
  function showMaintenance(p,role,message){
    $('signIn').hidden=true;$('portalArea').hidden=false;
    $('whoName').textContent=p.full_name||p.email;$('whoRole').textContent=role.replace(/_/g,' ');
    $('roleTools').innerHTML='<div class="post" style="text-align:center;padding:28px;border-top:5px solid #16834a"><h2>Application temporarily unavailable</h2><p>'+String(message||'The SLFA League App is in maintenance mode. Please try again later.').replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];})+'</p></div>';
  }
  $('pSignIn').addEventListener('click',function(){
    $('pStatus').textContent='Signing in…';
    db.auth.signInWithPassword({email:$('pEmail').value.trim(),password:$('pPass').value}).then(function(r){
      if(r.error){$('pStatus').textContent='Sign-in failed. Check your email and password.';return;}
      $('pPass').value='';gate();
    });
  });
  $('pPass').addEventListener('keydown',function(e){if(e.key==='Enter')$('pSignIn').click();});
  $('pSignOut').addEventListener('click',function(){db.auth.signOut().then(function(){location.href='index.html';});});
  function gate(){
    db.auth.getUser().then(function(u){
      if(!u.data||!u.data.user)return showSignIn('');
      return db.from('user_profiles').select('id,system_role,status,full_name,email,club_id,official_title').eq('id',u.data.user.id).maybeSingle().then(function(r){
        var p=r.data;
        if(!p||String(p.status).toLowerCase()!=='active'){
          var m=p&&String(p.status)==='Pending'?'Your account is waiting for a role. Ask the Technical Director to assign one.':'This account is not active. Ask the Technical Director to check it.';
          return db.auth.signOut().then(function(){showSignIn(m);});
        }
        var role=String(p.system_role).toUpperCase();
        if(role!=='DEVELOPER'){
          return db.from('application_control').select('app_frozen').eq('id',1).maybeSingle().then(function(fr){
            if(fr.error||!fr.data){
              var cached=null;try{cached=localStorage.getItem('slfa_app_frozen_v1');}catch(e){}
              if(!navigator.onLine&&cached==='false'){continuePortal(p,role);return;}
              showMaintenance(p,role,!navigator.onLine?'Maintenance status is not available offline on this device. Connect to the internet to verify access.':'The application security status could not be verified. Access is blocked until the connection is restored.');return;
            }
            try{localStorage.setItem('slfa_app_frozen_v1',String(!!fr.data.app_frozen));}catch(e){}
            if(fr.data.app_frozen){showMaintenance(p,role);return;}
            continuePortal(p,role);
          });
        }
        continuePortal(p,role);
      });
    });
  }
  function continuePortal(p,role){
    if(role!==portal){
      if(PAGES[role]&&PAGES[role]!==location.pathname.split('/').pop()){location.replace(PAGES[role]);return;}
      $('signIn').hidden=true;$('portalArea').hidden=false;$('whoName').textContent=p.full_name||p.email;
      $('whoRole').textContent=p.official_title||role.replace(/_/g,' ');
      $('roleTools').innerHTML='<p class="muted">Your role does not have a portal yet. Ask the Technical Director.</p>';return;
    }
    $('signIn').hidden=true;$('portalArea').hidden=false;$('whoName').textContent=p.full_name||p.email;
    $('whoRole').textContent=p.official_title||role.replace(/_/g,' ');window.slfaRenderRole(p);
  }
  gate();
  // Apply a freeze immediately to already-open staff portals, not only at sign-in.
  db.channel('portal-application-control').on('postgres_changes',{event:'*',schema:'public',table:'application_control'},function(){gate();}).subscribe();
})();
