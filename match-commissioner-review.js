// Review queue for submitted Match Commissioner Reports (Super Admin only).
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }); }
  async function printMCReport(db,x,m,u) {
    var popup=window.open('','_blank');
    if(!popup){window.alert('Allow pop-ups for this site to create the PDF report.');return;}
    try {
      var urls=[];
      for(var i=0;i<(x.evidence_paths||[]).length;i++){
        var signed=await db.storage.from('match-commissioner-evidence').createSignedUrl(x.evidence_paths[i],3600);
        if(signed.error)throw signed.error;
        urls.push(signed.data.signedUrl);
      }
      var fields=[
        ['Pitch condition',x.pitch_condition],['Facilities condition',x.facilities_condition],
        ['Security arrangements',x.security_arrangements],['Home team arrival',x.home_team_arrival],
        ['Away team arrival',x.away_team_arrival],['Officials arrival',x.officials_arrival],
        ['Pre-match notes',x.pre_match_notes],['Crowd behaviour',x.crowd_behaviour],
        ['Match interruptions',x.match_interruptions],['Match conduct',x.match_conduct],
        ['Incident details',x.incident_details],['Post-match summary',x.post_match_summary],
        ['Recommendations',x.recommendations]
      ];
      var sections=fields.map(function(f){return '<h2>'+esc(f[0])+'</h2><div class="txt">'+esc(f[1]||'Not recorded')+'</div>';}).join('');
      var photoHtml=urls.map(function(url,n){return '<div><small>Evidence '+(n+1)+'</small><img src="'+esc(url)+'" alt="Match report evidence '+(n+1)+'"></div>';}).join('');
      var html='<!doctype html><html><head><meta charset="utf-8"><title>SLFA Match Commissioner Report</title><style>body{font-family:Arial,sans-serif;color:#172b3d;margin:26px;line-height:1.45}.tag{font-size:10px;letter-spacing:1.5px;font-weight:bold;color:#96742e}h1{font-size:22px}h2{font-size:14px;border-bottom:1px solid #ccd6df;padding-bottom:5px;margin-top:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cell{border:1px solid #dce4eb;border-radius:6px;padding:9px}.label{font-size:9px;color:#68788a;text-transform:uppercase}.value{font-size:12px;font-weight:bold}.txt{white-space:pre-wrap;font-size:12px}.photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.photos img{width:100%;max-height:430px;object-fit:contain;border:1px solid #dce4eb}.warning{padding:10px;background:#fff5df;border:1px solid #e3d1a3;font-size:10px;margin-top:20px}@media print{body{margin:12mm}}</style></head><body>'+
        '<div class="tag">SIERRA LEONE FOOTBALL ASSOCIATION · PRIVATE ADMINISTRATIVE COPY</div><h1>Match Commissioner Report</h1><p><strong>'+esc((m.home_team||'Home')+' v '+(m.away_team||'Away'))+'</strong></p>'+
        '<div class="grid">'+
        cell('Match date',m.match_date?new Date(m.match_date).toLocaleString():'—')+
        cell('Venue',m.venue||'—')+
        cell('Commissioner',u.full_name||u.email||'Staff account')+
        cell('Submitted at',x.submitted_at?new Date(x.submitted_at).toLocaleString():'—')+
        cell('OCR status / confidence',(x.ocr_status||'NOT RUN')+(x.ocr_confidence==null?'':' · '+x.ocr_confidence+'%'))+
        '</div>'+sections+
        '<h2>OCR extraction from photographs · unverified</h2><div class="txt">'+esc(x.ocr_text||'No OCR text extracted.')+'</div>'+
        '<h2>Original photographic evidence ('+urls.length+')</h2><div class="photos">'+photoHtml+'</div>'+
        '<div class="warning"><strong>Verification required.</strong> Handwriting OCR can misread names, numbers, scores and incidents. Compare extracted text with the original photographs before taking administrative action. This report does not itself alter match results or impose disciplinary sanctions.</div>'+
        '</body></html>';
      popup.document.write(html);popup.document.close();
      popup.onload=function(){setTimeout(function(){popup.focus();popup.print();},900);};
    } catch(e) {
      popup.document.write('<p>Could not prepare report: '+esc(e.message||e)+'</p></body></html>');popup.document.close();
    }
    function cell(label,value){return '<div class="cell"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value||'—')+'</div></div>';}
  }
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
                '<p class="muted"><strong>OCR: ' + esc(x.ocr_status || 'NOT RUN') + (x.ocr_confidence == null ? '' : ' · ' + esc(x.ocr_confidence) + '%') + '</strong></p>' +
                (x.ocr_text ? '<details><summary>View machine-read text (verify against photograph)</summary><pre style="white-space:pre-wrap;font-size:11px">' + esc(x.ocr_text) + '</pre></details>' : '<p class="muted">No OCR text extracted.</p>') +
                (((x.evidence_paths || []).map(function (path) {
                  return '<button type="button" class="secondary small" data-mc-evidence="' + esc(path) + '">Open ' + esc(path.split('/').pop()) + '</button>';
                }).join(' ')) || '<p class="muted">No evidence files attached.</p>') +
                '<button type="button" class="secondary small" data-mc-pdf="' + esc(x.id) + '">Print / Save PDF</button>' +
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
            $('mcAdminList').querySelectorAll('[data-mc-pdf]').forEach(function (b) {
              b.addEventListener('click', function () {
                var report=rows.filter(function(z){return String(z.id)===String(b.getAttribute('data-mc-pdf'));})[0];
                var match=matchMap[String(report.match_id)]||{}, commissioner=userMap[String(report.commissioner_user_id)]||{};
                printMCReport(db,report,match,commissioner);
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