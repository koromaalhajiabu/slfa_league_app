/* SLFA Match Operations notifications.
   Each signed-in official can read and mark read only their own notifications.
   The database notification generator is private and scheduled by pg_cron. */
(function () {
  'use strict';
  var db = window.slfaDb;
  if (!db) return;
  var ROOT_ID = 'slfaMatchOpsNotifications';
  var uid = null, channel = null, loading = false, observer = null, timer = null;

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function safeUrl(value) {
    var allowed = ['super-admin.html','referee.html','team-official.html'];
    return allowed.indexOf(String(value || '')) >= 0 ? String(value) : 'super-admin.html';
  }
  function addStyle() {
    if ($('slfaMatchOpsNotificationStyle')) return;
    var style = document.createElement('style');
    style.id = 'slfaMatchOpsNotificationStyle';
    style.textContent = [
      '#'+ROOT_ID+'{margin:12px 0;padding:13px;border:1px solid rgba(125,190,160,.28);border-radius:13px;background:rgba(8,40,48,.32);color:inherit}',
      '#'+ROOT_ID+' *{box-sizing:border-box}',
      '#'+ROOT_ID+' .mon-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}',
      '#'+ROOT_ID+' .mon-head h3{margin:0;font-size:13px}',
      '#'+ROOT_ID+' .mon-count{display:inline-flex;min-width:22px;height:22px;align-items:center;justify-content:center;padding:0 6px;border-radius:20px;background:#ccefdc;color:#125b3b;font-size:10px;font-weight:900}',
      '#'+ROOT_ID+' .mon-refresh{border:1px solid rgba(190,220,205,.35);border-radius:8px;padding:6px 9px;background:transparent;color:inherit;font-size:10px;font-weight:800}',
      '#'+ROOT_ID+' .mon-list{display:grid;gap:7px;margin-top:10px}',
      '#'+ROOT_ID+' .mon-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px;border:1px solid rgba(190,220,205,.18);border-radius:9px;background:rgba(0,0,0,.12)}',
      '#'+ROOT_ID+' .mon-item.unread{border-left:3px solid #9ad9b3}',
      '#'+ROOT_ID+' .mon-item b{display:block;font-size:11px}',
      '#'+ROOT_ID+' .mon-item small{display:block;margin-top:3px;line-height:1.5;font-size:10px;opacity:.78}',
      '#'+ROOT_ID+' .mon-item button{border:1px solid rgba(190,220,205,.35);border-radius:7px;padding:6px 8px;background:transparent;color:inherit;font-size:9px;font-weight:800}',
      '#'+ROOT_ID+' .mon-empty,#'+ROOT_ID+' .mon-status{font-size:10px;opacity:.75;padding:9px 0}',
      '@media(max-width:560px){#'+ROOT_ID+' .mon-item{grid-template-columns:1fr}#'+ROOT_ID+' .mon-item button{justify-self:start}}'
    ].join('');
    document.head.appendChild(style);
  }
  function roleAllowed() {
    var role = $('whoRole');
    var text = role ? String(role.textContent || '').toUpperCase().replace(/[^A-Z_ ]/g,' ').replace(/\s+/g,' ').trim() : '';
    var title = document.querySelector('[data-official-title]');
    var officialTitle = title ? String(title.getAttribute('data-official-title') || '').toLowerCase() : '';
    return text.indexOf('SUPER ADMIN') >= 0 || text.indexOf('REFEREE') >= 0 ||
      text.indexOf('TEAM OFFICIAL') >= 0 || text.indexOf('MATCH COMMISSIONER') >= 0 || text.indexOf('MATCH DATA OPERATOR') >= 0 ||
      officialTitle === 'match commissioner';
  }
  function ensurePanel() {
    var target = $('roleTools');
    if (!target || !roleAllowed()) return null;
    addStyle();
    var panel = $(ROOT_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = ROOT_ID;
      panel.setAttribute('aria-label','Match Operations notifications');
      panel.innerHTML = '<div class="mon-head"><h3>Match Operations alerts <span class="mon-count" id="slfaMonCount">0</span></h3><button type="button" class="mon-refresh" id="slfaMonRefresh">Refresh</button></div><div class="mon-status" id="slfaMonStatus" role="status" aria-live="polite">Checking notifications…</div><div class="mon-list" id="slfaMonList"></div>';
      target.appendChild(panel);
      $('slfaMonRefresh').addEventListener('click',load);
    }
    return panel;
  }
  async function load() {
    if (loading) return;
    var panel = ensurePanel();
    if (!panel) return;
    loading = true;
    var status = $('slfaMonStatus'), list = $('slfaMonList');
    try {
      var auth = await db.auth.getUser();
      if (auth.error) throw auth.error;
      uid = auth.data && auth.data.user ? auth.data.user.id : null;
      if (!uid) { status.textContent = 'Sign in to view match alerts.'; list.innerHTML=''; return; }
      var result = await db.from('match_ops_notifications')
        .select('id,match_id,alert_type,title,body,action_url,read_at,created_at')
        .eq('recipient_user_id',uid)
        .order('created_at',{ascending:false})
        .limit(15);
      if (result.error) throw result.error;
      var rows = result.data || [];
      var unread = rows.filter(function (r) { return !r.read_at; }).length;
      $('slfaMonCount').textContent = String(unread);
      status.textContent = rows.length ? (unread ? unread+' unread · latest '+rows.length+' alerts' : 'No unread alerts') : 'No match operations alerts yet.';
      list.innerHTML = rows.map(function (r) {
        return '<article class="mon-item '+(!r.read_at?'unread':'')+'"><div><b>'+esc(r.title)+'</b><small>'+esc(r.body)+'<br>'+esc(new Date(r.created_at).toLocaleString('en-GB',{timeZone:'Africa/Freetown'}))+'</small></div><div><button type="button" data-mon-open="'+esc(r.action_url)+'" data-mon-id="'+esc(r.id)+'">'+(r.read_at?'Open workspace':'Open & mark read')+'</button></div></article>';
      }).join('');
      list.querySelectorAll('[data-mon-open]').forEach(function (button) {
        button.addEventListener('click',async function () {
          var id = button.getAttribute('data-mon-id');
          button.disabled = true;
          try {
            var update = await db.from('match_ops_notifications')
              .update({read_at:new Date().toISOString()})
              .eq('id',id).eq('recipient_user_id',uid);
            if (update.error) throw update.error;
            window.location.href = safeUrl(button.getAttribute('data-mon-open'));
          } catch (e) {
            button.disabled = false;
            if (status) status.textContent = 'Could not update this alert: '+(e.message||'Try again.');
          }
        });
      });
    } catch (error) {
      if (status) status.textContent = 'Match alerts are temporarily unavailable: '+(error.message||'Check your connection.');
    } finally {
      loading = false;
    }
  }
  function subscribe() {
    if (!db.channel || !uid) return;
    if (channel) { try { db.removeChannel(channel); } catch (_) {} channel=null; }
    channel = db.channel('slfa-match-ops-notifications-'+uid)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_ops_notifications',filter:'recipient_user_id=eq.'+uid},function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(load,250);
      }).subscribe();
  }
  function start() {
    ensurePanel();
    if (observer || !document.body) return;
    observer = new MutationObserver(function () {
      var before = !!$(ROOT_ID);
      var panel = ensurePanel();
      if (panel && !before) load();
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    if (db.auth && db.auth.onAuthStateChange) {
      db.auth.onAuthStateChange(function () {
        uid=null;
        window.setTimeout(async function () { await load(); subscribe(); },0);
      });
    }
    load().then(subscribe);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start);
  else start();
})();
