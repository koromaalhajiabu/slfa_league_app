// Portal pages: each role has its own page. This checks the sign-in and opens the matching tools.
(function () {
  var cfg = window.SLFA_CONFIG;
  var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  window.slfaDb = db;
  var PAGES = { DEVELOPER: 'developer.html', SUPER_ADMIN: 'super-admin.html', REFEREE: 'referee.html', MEDIA_OFFICER: 'media.html', CLUB_ADMIN: 'club.html' };
  var portal = document.body.dataset.portal;

  function $(id) { return document.getElementById(id); }
  function showSignIn(message) {
    $('signIn').hidden = false; $('portalArea').hidden = true;
    $('pStatus').textContent = message || '';
  }

  $('pSignIn').addEventListener('click', function () {
    $('pStatus').textContent = 'Signing in…';
    db.auth.signInWithPassword({ email: $('pEmail').value.trim(), password: $('pPass').value }).then(function (res) {
      if (res.error) { $('pStatus').textContent = 'Sign-in failed. Check your email and password.'; return; }
      $('pPass').value = '';
      gate();
    });
  });
  $('pPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('pSignIn').click(); });
  $('pSignOut').addEventListener('click', function () {
    db.auth.signOut().then(function () { location.href = 'index.html'; });
  });

  function gate() {
    db.auth.getUser().then(function (u) {
      if (!u.data || !u.data.user) return showSignIn('');
      return db.from('user_profiles').select('id, system_role, status, full_name, email, club_id').eq('id', u.data.user.id).maybeSingle()
        .then(function (r) {
          var p = r.data;
          if (!p || String(p.status).toLowerCase() !== 'active') {
            var msg = p && String(p.status) === 'Pending' ? 'Your account is waiting for a role. Ask the Technical Director to assign one.' : 'This account is not active. Ask the Technical Director to check it.';
            return db.auth.signOut().then(function () { showSignIn(msg); });
          }
          var role = String(p.system_role).toUpperCase();
          if (role !== portal) {
            if (PAGES[role] && PAGES[role] !== location.pathname.split('/').pop()) { location.replace(PAGES[role]); return; }
            $('signIn').hidden = true; $('portalArea').hidden = false;
            $('whoName').textContent = p.full_name || p.email;
            $('whoRole').textContent = role.replace(/_/g, ' ');
            $('roleTools').innerHTML = '<p class="muted">Your role does not have a portal yet. Ask the Technical Director.</p>';
            return;
          }
          $('signIn').hidden = true; $('portalArea').hidden = false;
          $('whoName').textContent = p.full_name || p.email;
          $('whoRole').textContent = role.replace(/_/g, ' ');
          window.slfaRenderRole(p);
        });
    });
  }
  gate();
})();
