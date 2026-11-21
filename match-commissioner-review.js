// Review queue for submitted Match Commissioner Reports (Super Admin only).
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }); }
  window.slfaRenderCommissionerReportsAdmin = function () {
    var db = window.slfaDb, root = $('roleTools');
    if (!db || !root || $('mcAdminReviewPanel')) return;
    var panel = document.createElement('section');
    panel.id = 'mcAdminReviewPanel'; panel.className = 'card mc-admin-review';
    panel.innerHTML = '<h2 class="rt">Match Commissioner reports</h2><p class="muted">Review submitted match-day reports and record the competition authority’s review notes. Marking a report reviewed locks it for the commissioner.</p>' +
      '<button class="secondary" type="button" id="mcAdminRefresh">Refresh reports</button><div id="mcAdminList" class="muted" aria-live="polite">Loading submitted reports…</div><div id="mcAdminMsg" class="status" role="status"></div>';
    root.appendChild(panel);
    function load() {
      $('mcAdminList').textContent = 'Loading submitted reports…';
      db.from('match_commissioner_reports').select('*').eq('report_status','SUBMITTED').order('submitted_at',{ascending:false})
        .then(function (r) {
          if (r.error) { $('mcAdminList').textContent = 'Could not load reports: ' + r.error.message; return; }
          var rows = r.data || [];
          if (!rows.length) { $('mcAdminList').innerHTML = '<p class="muted">No submitted Match Commissioner reports are awaiting review.</p>'; return; }
          var matchIds = rows.map(function (x) { return x.match_id; });
          var userIds = rows.map(function (x) { return x.commissioner_user_id; });
          return Promise.all([
            db.from('matches').select('id,home_team,away_team,match_date,venue').in('id',matchIds),
            db.from('user_profiles').select('id,full_name,email').in('id',userIds)
          ]).then(function (extra) {
            var matchMap={}, userMap={};
            (extra[0].data || []).forEach(function (x) { matchMap[String(x.id)] = x; });
            (extra[1].data || []).forEach(function (x) { userMap[String(x.id)] = x; });
            $('mcAdminList').innerHTML = rows.map(function (x) {
              var m=matchMap[String(x.match_id)] || {}, u=userMap[String(x.commissioner_user_id)] || {};
              return '<article class="mc-admin-report"><h3>' + esc((m.home_team || 'Home') + ' v ' + (m.away_team || 'Away')) + '</h3>' +
                '<p class="muted">' + esc(m.match_date ? new Date(m.match_date).toLocaleString() : 'Date unavailable') + ' · ' +
                esc(m.venue || 'Venue not listed') + '<br>Commissioner: ' + esc(u.full_name || u.email || 'Staff account') + '</p>' +
                '<p><strong>Post-match summary</strong><br>' + esc(x.post_match_summary || 'Not provided') + '</p>' +
                '<p><strong>Incidents</strong><br>' + esc(x.incident_details || 'None recorded') + '</p>' +
                '<p><strong>Security / crowd</strong><br>' + esc(x.security_arrangements || 'Not recorded') + ' · ' + esc(x.crowd_behaviour || 'Not recorded') + '</p>' +
                '<p><strong>Recommendations</strong><br>' + esc(x.recommendations || 'None provided') + '</p>' +
                '<p><strong>Photographic evidence</strong></p>' +
                (((x.evidence_paths || []).map(function (path) {
                  return '<button type="button" class="secondary small" data-mc-evidence="' + esc(path) + '">Open ' + esc(path.split('/').pop()) + '</button>';
                }).join(' ')) || '<p class="muted">No evidence files attached.</p>') +
                '<label for="mcReview_' + esc(x.id) + '">Review notes</label><textarea id="mcReview_' + esc(x.id) + '" rows="2" maxlength="2000"></textarea>' +
                '<button type="button" class="primary" data-mc-review="' + esc(x.id) + '">Mark reviewed and lock report</button></article>';
            }).join('');
            $('mcAdminList').querySelectorAll('[data-mc-evidence]').forEach(function (b) {
              b.addEventListener('click', function () {
                db.storage.from('match-commissioner-evidence').createSignedUrl(b.getAttribute('data-mc-evidence'), 900).then(function (r) {
                  if (r.error) { $('mcAdminMsg').textContent = 'Could not open evidence: ' + r.error.message; return; }
                  window.open(r.data.signedUrl, '_blank', 'noopener');
                });
              });
            });
            $('mcAdminList').querySelectorAll('[data-mc-review]').forEach(function (b) {
              b.addEventListener('click', function () {
                var id=b.getAttribute('data-mc-review'), note=$('mcReview_'+id).value.trim();
                if (!window.confirm('Mark this Match Commissioner Report as reviewed? The commissioner will no longer be able to edit it.')) return;
                db.auth.getUser().then(function (u) {
                  return db.from('match_commissioner_reports').update({
                    report_status:'REVIEWED', reviewed_at:new Date().toISOString(),
                    reviewed_by:u.data.user.id, review_notes:note || null
                  }).eq('id',Number(id));
                }).then(function (save) {
                  if (save.error) { $('mcAdminMsg').textContent='Review failed: '+save.error.message; return; }
                  $('mcAdminMsg').textContent='Report marked reviewed and locked.';
                  load();
                });
              });
            });
          });
        });
    }
    $('mcAdminRefresh').addEventListener('click',load);
    load();
  };
})();