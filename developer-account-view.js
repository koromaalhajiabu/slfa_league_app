/* Secure Developer account access: creates an isolated, audited session for another active SLFA account. */
(function () {
  'use strict';
  var db = window.slfaDb;
  if (!db) return;
  var PORTALS = {
    SUPER_ADMIN: 'super-admin.html',
    CLUB_ADMIN: 'club.html',
    REFEREE: 'referee.html',
    MATCH_COMMISSIONER: 'referee.html',
    DISCIPLINARY_OFFICER: 'disciplinary.html',
    MEDIA_OFFICER: 'media.html'
  };
  function ensureButton(select) {
    var card = select.closest('.post'), id = select.getAttribute('data-role-for');
    if (!card || !id || card.querySelector('[data-login-as-account]')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'small secondary';
    b.textContent = 'Login as User'; b.setAttribute('data-login-as-account', id);
    b.addEventListener('click', function () { loginAs(id, b); });
    var actions = card.querySelector('.btns');
    if (actions) actions.insertBefore(b, actions.firstChild); else card.appendChild(b);
  }
  function loginAs(id, button) {
    if (!confirm('Open a separate authenticated session as this account? Your Developer session will remain signed in in this tab. Actions in the new tab will be performed under the selected account and recorded in the audit trail.')) return;
    // Open synchronously to avoid mobile-browser popup blocking; this tab is not given Developer credentials.
    var target = window.open('about:blank', '_blank');
    if (!target) { alert('Allow pop-ups for this site, then try again.'); return; }
    button.disabled = true; button.textContent = 'Preparing secure session…';
    db.functions.invoke('developer-login-as-user', { body: { target_user_id: id } }).then(function (result) {
      if (result.error || !result.data || !result.data.token_hash || !result.data.portal) {
        target.close();
        alert((result.data && result.data.error) || (result.error && result.error.message) || 'Could not start the account session.');
        return;
      }
      var url = new URL(result.data.portal, location.href);
      // The one-time token is carried only in the URL fragment, never sent to the web server.
      url.hash = 'slfa-login-as=' + encodeURIComponent(result.data.token_hash);
      target.location.replace(url.href);
    }).catch(function (error) {
      target.close(); alert(error && error.message ? error.message : 'Could not start the account session.');
    }).finally(function () {
      button.disabled = false; button.textContent = 'Login as User';
    });
  }
  function attach() {
    var list = document.getElementById('roleList');
    if (!list) return;
    list.querySelectorAll('[data-role-for]').forEach(ensureButton);
  }
  function start() {
    var list = document.getElementById('roleList');
    if (list && !list.dataset.loginAsObserver) {
      list.dataset.loginAsObserver = '1';
      new MutationObserver(attach).observe(list, { childList: true, subtree: true });
    }
    attach();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  new MutationObserver(start).observe(document.body, { childList: true, subtree: true });
})();