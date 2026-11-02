// Administration tools, shown after sign-in and based on the signed-in role.
// Super Admin: fixtures, results, news approval. Media Officer: news posts. Club admins: squads (next).
(function () {
  var db = window.slfaDb;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function box() {
    var b = $('roleTools');
    if (!b) { b = document.createElement('div'); b.id = 'roleTools'; $('signedIn').insertBefore(b, $('signedIn').querySelector('.btns')); }
    return b;
  }
  function msg(text) { var m = $('roleMsg'); if (m) m.textContent = text; }
  function input(id, label, type, extra) {
    return '<label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" ' + (extra || '') + '>';
  }

  function currentUser() {
    return db.auth.getUser().then(function (u) {
      if (!u.data || !u.data.user) return null;
      return db.from('user_profiles').select('id, system_role, status, full_name, email').eq('id', u.data.user.id).maybeSingle()
        .then(function (r) { return r.data && String(r.data.status).toLowerCase() === 'active' ? r.data : null; });
    });
  }

  function render() {
    currentUser().then(function (p) {
      if (!p) { var old = $('roleTools'); if (old) old.remove(); return; }
      var role = String(p.system_role).toUpperCase();
      if (role === 'SUPER_ADMIN') return superAdmin(p);
      if (role === 'MEDIA_OFFICER') return mediaOfficer(p);
      if (role === 'CLUB_ADMIN') { box().innerHTML = '<h2 class="rt">Club squad</h2><p class="muted">Squad entry for clubs will be added next.</p>'; return; }
      box().innerHTML = '';
    });
  }

  // ---------- SUPER ADMIN ----------
  function superAdmin(p) {
    box().innerHTML =
      '<h2 class="rt">Add a fixture</h2>' +
      input('fxHome', 'Home team') + input('fxAway', 'Away team') +
      input('fxDate', 'Date and time', 'datetime-local') + input('fxVenue', 'Venue') +
      '<div class="btns"><button class="primary" id="fxSave">Add fixture</button></div>' +
      '<h2 class="rt">Enter a result</h2>' +
      '<label for="resMatch">Match</label><select id="resMatch"><option value="">Loading matches…</option></select>' +
      '<div class="scores"><input id="resHome" type="number" min="0" placeholder="Home"><span>–</span><input id="resAway" type="number" min="0" placeholder="Away"></div>' +
      '<div class="btns"><button class="primary" id="resSave">Record result</button></div>' +
      '<h2 class="rt">News awaiting approval</h2><div id="reviewList" class="muted">Loading…</div>' +
      '<div class="status" id="roleMsg"></div>';

    $('fxSave').addEventListener('click', function () {
      var h = $('fxHome').value.trim(), a = $('fxAway').value.trim(), d = $('fxDate').value, v = $('fxVenue').value.trim();
      if (!h || !a || !d) { msg('Enter both teams and the date.'); return; }
      db.from('seasons').select('id').order('id', { ascending: false }).limit(1).maybeSingle().then(function (s) {
        return db.from('matches').insert([{ home_team: h, away_team: a, match_date: new Date(d).toISOString(), venue: v || null, season_id: s.data ? s.data.id : null }]);
      }).then(function (r) {
        if (r.error) { msg(r.error.message); return; }
        msg('Fixture added.'); $('fxHome').value = ''; $('fxAway').value = ''; $('fxVenue').value = ''; loadMatchesForResult();
      });
    });

    loadMatchesForResult();
    $('resSave').addEventListener('click', function () {
      var id = $('resMatch').value, h = parseInt($('resHome').value, 10), a = parseInt($('resAway').value, 10);
      if (!id || isNaN(h) || isNaN(a)) { msg('Choose a match and enter both scores.'); return; }
      db.rpc('record_match_result', { p_match_id: Number(id), p_home: h, p_away: a }).then(function (r) {
        if (r.error) { msg(r.error.message); return; }
        msg('Result recorded and the table updated.'); $('resHome').value = ''; $('resAway').value = ''; loadMatchesForResult();
      });
    });

    loadReview();
  }

  function loadMatchesForResult() {
    db.from('matches').select('id, match_date, home_team, away_team, home_score').order('match_date', { ascending: false }).limit(60)
      .then(function (r) {
        var rows = r.data || [];
        $('resMatch').innerHTML = '<option value="">Choose a match…</option>' + rows.map(function (m) {
          return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + (m.home_score != null ? ' (' + m.home_score + ' – ' + m.away_score + ')' : '') + '</option>';
        }).join('');
      });
  }

  function loadReview() {
    db.from('media_posts').select('id, title, category, body, created_by_name, submitted_at').eq('status', 'SUBMITTED').order('submitted_at', { ascending: true })
      .then(function (r) {
        var rows = r.data || [];
        $('reviewList').innerHTML = rows.length ? rows.map(function (p) {
          return '<div class="post"><div class="muted">' + esc(p.category) + ' · by ' + esc(p.created_by_name || 'Media Officer') + '</div>' +
            '<strong>' + esc(p.title) + '</strong><p>' + esc(p.body) + '</p>' +
            '<div class="btns"><button class="primary" data-pub="' + esc(p.id) + '">Publish</button><button class="secondary" data-ret="' + esc(p.id) + '">Return</button></div></div>';
        }).join('') : 'Nothing waiting for approval.';
        document.querySelectorAll('[data-pub]').forEach(function (b) { b.addEventListener('click', function () { decide(b.dataset.pub, 'PUBLISHED'); }); });
        document.querySelectorAll('[data-ret]').forEach(function (b) { b.addEventListener('click', function () { decide(b.dataset.ret, 'RETURNED'); }); });
      });
  }
  function decide(id, status) {
    var upd = { status: status };
    if (status === 'PUBLISHED') upd.published_at = new Date().toISOString();
    db.auth.getUser().then(function (u) {
      upd.reviewed_by = u.data.user.id; upd.reviewed_at = new Date().toISOString();
      return db.from('media_posts').update(upd).eq('id', id);
    }).then(function (r) {
      if (r.error) { msg(r.error.message); return; }
      msg(status === 'PUBLISHED' ? 'Published.' : 'Returned to the Media Officer.'); loadReview();
    });
  }

  // ---------- MEDIA OFFICER ----------
  function mediaOfficer(p) {
    box().innerHTML =
      '<h2 class="rt">New news post</h2>' +
      '<label for="npCat">Category</label><select id="npCat"><option>News</option><option>Match report</option><option>Announcement</option></select>' +
      input('npTitle', 'Title') +
      '<label for="npBody">Story</label><textarea id="npBody" rows="5"></textarea>' +
      input('npImage', 'Photo link (optional)', 'url') + input('npVideo', 'Video link (optional)', 'url') +
      '<div class="btns"><button class="secondary" id="npDraft">Save draft</button><button class="primary" id="npSubmit">Submit for approval</button></div>' +
      '<h2 class="rt">My posts</h2><div id="myPosts" class="muted">Loading…</div>' +
      '<div class="status" id="roleMsg"></div>';

    function save(status) {
      var t = $('npTitle').value.trim();
      if (!t) { msg('Give the post a title.'); return; }
      db.auth.getUser().then(function (u) {
        return db.from('media_posts').insert([{
          category: $('npCat').value, title: t, body: $('npBody').value.trim(),
          image_url: $('npImage').value.trim() || null, video_url: $('npVideo').value.trim() || null,
          status: status, created_by: u.data.user.id, created_by_name: p.full_name || p.email, submitted_at: status === 'SUBMITTED' ? new Date().toISOString() : null
        }]);
      }).then(function (r) {
        if (r.error) { msg(r.error.message); return; }
        msg(status === 'SUBMITTED' ? 'Sent to the Super Admin for approval.' : 'Draft saved.');
        $('npTitle').value = ''; $('npBody').value = ''; $('npImage').value = ''; $('npVideo').value = ''; loadMine();
      });
    }
    $('npDraft').addEventListener('click', function () { save('DRAFT'); });
    $('npSubmit').addEventListener('click', function () { save('SUBMITTED'); });
    loadMine();
  }
  function loadMine() {
    db.auth.getUser().then(function (u) {
      return db.from('media_posts').select('id, title, status, category').eq('created_by', u.data.user.id).order('created_at', { ascending: false }).limit(30);
    }).then(function (r) {
      var rows = r.data || [];
      $('myPosts').innerHTML = rows.length ? rows.map(function (x) {
        var canSubmit = x.status === 'DRAFT' || x.status === 'RETURNED';
        return '<div class="post"><strong>' + esc(x.title) + '</strong><div class="muted">' + esc(x.category) + ' · ' + esc(x.status) + '</div>' +
          (canSubmit ? '<div class="btns"><button class="small" data-sub="' + esc(x.id) + '">Submit for approval</button></div>' : '') + '</div>';
      }).join('') : 'No posts yet.';
      document.querySelectorAll('[data-sub]').forEach(function (b) {
        b.addEventListener('click', function () {
          db.from('media_posts').update({ status: 'SUBMITTED', submitted_at: new Date().toISOString() }).eq('id', b.dataset.sub)
            .then(function (res) { msg(res.error ? res.error.message : 'Sent for approval.'); loadMine(); });
        });
      });
    });
  }

  db.auth.onAuthStateChange(function () { setTimeout(render, 0); });
  render();
})();
