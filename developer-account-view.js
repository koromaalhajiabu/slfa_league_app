/* Developer-only read-only account view. Never changes the signed-in identity or grants impersonation. */
(function () {
  'use strict';
  var db = window.slfaDb;
  if (!db) return;
  var PORTALS = {
    SUPER_ADMIN: ['Super Admin', 'super-admin.html', 'Fixtures, results, clubs, seasons and approvals'],
    CLUB_ADMIN: ['Club Admin', 'club.html', 'Assigned club profile, squad and club operations'],
    REFEREE: ['Referee', 'referee.html', 'Assigned match duties, lineups, events and result submissions'],
    MATCH_COMMISSIONER: ['Match Commissioner', 'referee.html', 'Match-day oversight and assigned match reporting'],
    DISCIPLINARY_OFFICER: ['Disciplinary Officer', 'disciplinary.html', 'Disciplinary cases, decisions and suspensions'],
    MEDIA_OFFICER: ['Media Officer', 'media.html', 'News, announcements and media publishing'],
    DEVELOPER: ['Developer', 'developer.html', 'Application controls and account administration']
  };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function ensureModal() {
    var el = document.getElementById('slfaAccountViewModal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'slfaAccountViewModal';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;padding:16px;overflow:auto';
    el.innerHTML = '<section role="dialog" aria-modal="true" aria-labelledby="slfaViewTitle" style="background:var(--card,#10283b);color:inherit;width:min(100%,560px);max-height:90vh;overflow:auto;border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,.2)"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 id="slfaViewTitle">Account view</h2><button type="button" id="slfaViewClose" class="secondary">Close</button></div><div id="slfaViewBody" aria-live="polite">Loading account…</div></section>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el || e.target.id === 'slfaViewClose') el.style.display = 'none'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') el.style.display = 'none'; });
    return el;
  }
  function showAccount(id) {
    var modal = ensureModal(), body = modal.querySelector('#slfaViewBody');
    modal.style.display = 'flex';
    body.textContent = 'Loading account profile…';
    db.from('user_profiles').select('id,full_name,email,photo_url,system_role,status,club_id,official_title').eq('id', id).maybeSingle().then(function (r) {
      if (r.error || !r.data) { body.textContent = r.error ? r.error.message : 'Account not found.'; return; }
      var u = r.data, role = String(u.system_role || 'NONE').toUpperCase();
      var info = PORTALS[role] || ['No assigned portal', 'index.html', 'This account has no active staff role yet'];
      var photo = u.photo_url ? '<img src="' + esc(u.photo_url) + '" alt="" style="width:76px;height:76px;border-radius:50%;object-fit:cover">' : '';
      body.innerHTML = '<div style="display:flex;gap:14px;align-items:center;margin:12px 0">' + photo + '<div><strong>' + esc(u.full_name || 'Unnamed account') + '</strong><div>' + esc(u.email) + '</div><div class="muted">' + esc(u.status) + ' · ' + esc(role) + '</div></div></div>' +
        '<div class="post"><strong>Assigned portal</strong><p>' + esc(info[0]) + '</p><strong>Role workspace</strong><p>' + esc(info[2]) + '</p>' +
        (u.official_title ? '<strong>Official title</strong><p>' + esc(u.official_title) + '</p>' : '') +
        '<strong>Club assignment</strong><p>' + esc(u.club_id || 'No club assigned') + '</p></div>' +
        '<div class="post" style="border-left:4px solid #d69b35"><strong>Read-only account preview</strong><p>This lets you inspect the account identity, assigned role and portal destination without signing in as that person. No password is exposed and no actions are performed under their identity.</p><p><strong>Portal file:</strong> ' + esc(info[1]) + '</p></div>';
    });
  }
  function addButtons() {
    var list = document.getElementById('roleList');
    if (!list) return;
    list.querySelectorAll('[data-role-for]').forEach(function (select) {
      var card = select.closest('.post'), id = select.getAttribute('data-role-for');
      if (!card || !id || card.querySelector('[data-view-account]')) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'small secondary'; b.textContent = 'View as User'; b.setAttribute('data-view-account', id);
      b.addEventListener('click', function () { showAccount(id); });
      var actions = card.querySelector('.btns');
      if (actions) actions.insertBefore(b, actions.firstChild);
      else card.appendChild(b);
    });
  }
  var start = function () {
    var list = document.getElementById('roleList');
    if (!list || list.dataset.viewObserver) return;
    list.dataset.viewObserver = '1';
    new MutationObserver(addButtons).observe(list, { childList: true, subtree: true });
    addButtons();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  new MutationObserver(start).observe(document.body, { childList: true, subtree: true });
})();
