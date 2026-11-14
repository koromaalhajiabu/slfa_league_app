// Portal pages: role access plus Developer-only application maintenance bypass.
(function () {
  var cfg=window.SLFA_CONFIG;
  // Developer account access runs in a separate tab with sessionStorage, never the Developer tab's localStorage session.
  var impersonationParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  var isDeveloperSession = impersonationParams.has('slfa-login-as');
  var authOptions = {persistSession:true,autoRefreshToken:true};
  if (isDeveloperSession) { authOptions.storage = window.sessionStorage; authOptions.storageKey = 'slfa-developer-account-session'; }
  var db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:authOptions});
  window.slfaDb=db;
  var PAGES={DEVELOPER:'developer.html',SUPER_ADMIN:'super-admin.html',REFEREE:'referee.html',MEDIA_OFFICER:'media.html',DISCIPLINARY_OFFICER:'disciplinary.html',CLUB_ADMIN:'club.html'};
  var portal=document.body.dataset.portal;
  var lastFreezeState=null;
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
  (function(){
    var a=document.createElement('p');a.className='forgot-line';a.style.cssText='margin:8px 0 0;text-align:center;font-size:.92rem';
    a.innerHTML='<a href="#" id="pForgot">Forgot password?</a>';
    $('pPass').parentNode.insertBefore(a,$('pSignIn').parentNode);
    $('pForgot').addEventListener('click',function(e){
      e.preventDefault();
      var email=$('pEmail').value.trim();
      if(!email){$('pStatus').textContent='Type your email above first, then tap Forgot password again.';return;}
      $('pStatus').textContent='Sending reset link…';
      db.auth.resetPasswordForEmail(email,{redirectTo:new URL('reset-password.html',location.href).href}).then(function(){
        $('pStatus').textContent='If that email has an account, a reset link is on its way. Check your inbox and spam folder.';
      });
    });
  })();
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
              if(navigator.onLine)lastFreezeState=true;
              showMaintenance(p,role,!navigator.onLine?'Maintenance status is not available offline on this device. Connect to the internet to verify access.':'The application security status could not be verified. Access is blocked until the connection is restored.');return;
            }
            lastFreezeState=!!fr.data.app_frozen;
            try{localStorage.setItem('slfa_app_frozen_v1',String(lastFreezeState));}catch(e){}
            if(lastFreezeState){showMaintenance(p,role);return;}
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
  function finishDeveloperAccountSession() {
    if (!isDeveloperSession) { gate(); return; }
    var tokenHash = impersonationParams.get('slfa-login-as');
    // Remove the one-time token from the address bar before exchanging it.
    history.replaceState(null, document.title, location.pathname + location.search);
    if (!tokenHash) { showSignIn('The secure account session link is missing. Start again from the Developer panel.'); return; }
    db.auth.verifyOtp({type:'magiclink', token_hash:tokenHash}).then(function(result) {
      if (result.error) { showSignIn('Secure account sign-in failed or expired. Return to your Developer tab and try again.'); return; }
      var banner=document.createElement('div');
      banner.className='post';
      banner.style.cssText='margin:12px 0;border-left:4px solid #d69b35;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';
      banner.innerHTML='<div><strong>Developer-managed account session</strong><div class="muted">You are operating as this account in an isolated tab. Your original Developer session remains open in its own tab.</div></div><button type="button" class="secondary" id="slfaEndManagedSession">End session</button>';
      var tools=$('roleTools'); if(tools&&tools.parentNode) tools.parentNode.insertBefore(banner,tools);
      $('slfaEndManagedSession').addEventListener('click',function(){
        db.auth.signOut().then(function(){location.replace('developer.html');});
      });
      gate();
    });
  }
  finishDeveloperAccountSession();
  // Apply a freeze immediately to already-open staff portals, not only at sign-in.
  if(portal!=='DEVELOPER'){
    db.channel('portal-application-control').on('postgres_changes',{event:'*',schema:'public',table:'application_control'},function(){gate();}).subscribe();
    // Poll as a fallback if database realtime is unavailable on the current Supabase project.
    setInterval(function(){
      if(!navigator.onLine)return;
      db.from('application_control').select('app_frozen').eq('id',1).maybeSingle().then(function(fr){
        if(fr.error||!fr.data){if(lastFreezeState!==true){lastFreezeState=true;gate();}return;}
        var frozen=!!fr.data.app_frozen;
        if(lastFreezeState!==frozen){lastFreezeState=frozen;gate();}
      });
    },30000);
  }
})();
