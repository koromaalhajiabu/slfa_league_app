// Dedicated Match Commissioner workspace; does not expose referee match-control actions.
(function () {
  'use strict';
  var db = window.slfaDb, bucket = 'match-commissioner-evidence';
  var uid = null, matches = [], reports = {}, activeMatch = null, evidencePaths = [], activeStatus = 'DRAFT';
  var fields = [
    ['pitch_condition','Pitch and playing surface condition'],
    ['facilities_condition','Dressing rooms and match facilities'],
    ['security_arrangements','Security and safety arrangements'],
    ['home_team_arrival','Home team arrival and readiness'],
    ['away_team_arrival','Away team arrival and readiness'],
    ['officials_arrival','Match officials arrival and readiness'],
    ['pre_match_notes','Pre-match coordination notes'],
    ['crowd_behaviour','Crowd behaviour and spectator management'],
    ['match_interruptions','Delays, interruptions or unusual occurrences'],
    ['match_conduct','General conduct of teams and officials'],
    ['incident_details','Incidents, misconduct or regulations breaches'],
    ['post_match_summary','Post-match summary'],
    ['recommendations','Recommendations for the competition organiser']
  ];
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function say(text, error) {
    var n = $('mcMessage'); if (!n) return;
    n.textContent = text || '';
    n.className = 'status mc-message' + (error ? ' is-error' : '');
  }
  function dateText(v) {
    if (!v) return 'Date to be confirmed';
    var d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
  }
  function formField(f) {
    return '<div class="mc-field"><label for="mc_' + f[0] + '">' + esc(f[1]) +
      '</label><textarea id="mc_' + f[0] + '" rows="3" maxlength="3000" placeholder="Enter your observations…"></textarea></div>';
  }
  function disableForm(disabled) {
    fields.forEach(function (f) { if ($('mc_' + f[0])) $('mc_' + f[0]).disabled = disabled; });
    ['mcEvidenceFiles','mcUploadEvidence','mcSaveDraft','mcSubmitReport'].forEach(function (id) {
      if ($(id)) $(id).disabled = disabled;
    });
  }
  function renderEvidence() {
    var node = $('mcEvidenceList'); if (!node) return;
    if (!evidencePaths.length) { node.innerHTML = '<span class="muted">No photographs or evidence attached.</span>'; return; }
    node.innerHTML = evidencePaths.map(function (path) {
      var name = path.split('/').pop();
      return '<div class="mc-evidence-item"><span>' + esc(name) + '</span><a href="#" data-mc-evidence="' + esc(path) + '">Open private image</a></div>';
    }).join('');
    node.querySelectorAll('[data-mc-evidence]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        db.storage.from(bucket).createSignedUrl(a.getAttribute('data-mc-evidence'), 900).then(function (r) {
          if (r.error) { say('Could not open evidence: ' + r.error.message, true); return; }
          window.open(r.data.signedUrl, '_blank', 'noopener');
        });
      });
    });
  }
  function renderHistory() {
    var node = $('mcHistory'); if (!node) return;
    var rows = Object.keys(reports).map(function (k) { return reports[k]; });
    rows.sort(function (a,b) { return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0); });
    node.innerHTML = rows.length ? rows.map(function (r) {
      var m = matches.filter(function (x) { return String(x.id) === String(r.match_id); })[0] || {};
      return '<article class="mc-history-item"><div><strong>' + esc((m.home_team || 'Home') + ' v ' + (m.away_team || 'Away')) +
        '</strong><span class="mc-status mc-status-' + esc(String(r.report_status || 'DRAFT').toLowerCase()) + '">' +
        esc(r.report_status || 'DRAFT') + '</span></div><small>' + esc(dateText(m.match_date)) + ' · Updated ' +
        esc(dateText(r.updated_at || r.created_at)) + '</small></article>';
    }).join('') : '<p class="muted">No reports have been saved yet.</p>';
  }
  function showMatch(m) {
    var n = $('mcMatchSummary'); if (!n) return;
    if (!m) { n.innerHTML = '<p class="muted">Choose an assigned match to open its report.</p>'; return; }
    n.innerHTML = '<div class="mc-fixture-teams"><strong>' + esc(m.home_team) + '</strong><span>v</span><strong>' +
      esc(m.away_team) + '</strong></div><div class="mc-fixture-meta"><span>' + esc(dateText(m.match_date)) +
      '</span><span>' + esc(m.venue || 'Venue to be confirmed') + '</span><span>' + esc(m.match_status || 'SCHEDULED') + '</span></div>';
  }
  function fillReport(r) {
    fields.forEach(function (f) { $('mc_' + f[0]).value = r && r[f[0]] ? r[f[0]] : ''; });
    evidencePaths = r && Array.isArray(r.evidence_paths) ? r.evidence_paths.slice() : [];
    activeStatus = r && r.report_status ? r.report_status : 'DRAFT';
    renderEvidence();
    $('mcCurrentStatus').textContent = 'Report status: ' + activeStatus;
    disableForm(activeStatus === 'REVIEWED');
    if (activeStatus === 'REVIEWED') say('This report has been reviewed and locked. Contact the competition administrator for any correction.');
    else say('');
  }
  function chooseMatch(id) {
    activeMatch = matches.filter(function (m) { return String(m.id) === String(id); })[0] || null;
    showMatch(activeMatch);
    fillReport(activeMatch ? reports[String(activeMatch.id)] : null);
  }
  function collect(status) {
    var row = {match_id:Number(activeMatch.id), commissioner_user_id:uid, report_status:status,
      evidence_paths:evidencePaths.slice(),
      submitted_at:status === 'SUBMITTED' ? ((reports[String(activeMatch.id)] || {}).submitted_at || new Date().toISOString()) : null};
    fields.forEach(function (f) { row[f[0]] = $('mc_' + f[0]).value.trim() || null; });
    return row;
  }
  function save(status, quiet) {
    if (!activeMatch) { say('Choose one of your assigned matches first.', true); return Promise.resolve(false); }
    if (activeStatus === 'REVIEWED') { say('This report has already been reviewed and is locked.', true); return Promise.resolve(false); }
    var row = collect(status);
    if (status === 'SUBMITTED' && !row.post_match_summary && !row.incident_details) {
      say('Add a post-match summary or incident details before submitting.', true); return Promise.resolve(false);
    }
    say(status === 'SUBMITTED' ? 'Submitting report…' : 'Saving report…');
    return db.from('match_commissioner_reports').upsert(row, {onConflict:'match_id,commissioner_user_id'}).select('*').single()
      .then(function (r) {
        if (r.error) { say('Could not save the report: ' + r.error.message, true); return false; }
        reports[String(activeMatch.id)] = r.data; activeStatus = r.data.report_status;
        $('mcCurrentStatus').textContent = 'Report status: ' + activeStatus;
        renderHistory();
        if (!quiet) say(status === 'SUBMITTED' ? 'Official Match Commissioner Report submitted.' : 'Draft saved successfully.');
        return true;
      });
  }
  function uploadEvidence() {
    if (!activeMatch) { say('Choose an assigned match first.', true); return; }
    if (activeStatus === 'REVIEWED') { say('This report has already been reviewed and is locked.', true); return; }
    var input = $('mcEvidenceFiles'), files = input && input.files ? Array.prototype.slice.call(input.files) : [];
    if (!files.length) { say('Choose one or more photographs first.', true); return; }
    if (files.some(function (f) { return ['image/jpeg','image/png','image/webp'].indexOf(f.type) < 0 || f.size > 8388608; })) {
      say('Only JPG, PNG or WEBP photographs up to 8 MB each are accepted.', true); return;
    }
    say('Uploading private evidence…');
    files.reduce(function (chain, file) {
      return chain.then(function () {
        var ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        var path = uid + '/' + activeMatch.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2,9) + '.' + ext;
        return db.storage.from(bucket).upload(path, file, {contentType:file.type, upsert:false}).then(function (r) {
          if (r.error) throw r.error;
          evidencePaths.push(path);
        });
      });
    }, Promise.resolve()).then(function () {
      renderEvidence(); input.value = '';
      return save(activeStatus === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT', true);
    }).then(function (ok) { if (ok) say('Evidence uploaded and attached to this match report.'); })
      .catch(function (e) { say('Evidence upload failed: ' + (e.message || 'Please try again.'), true); });
  }
  function metrics() {
    $('mcMetricAssigned').textContent = String(matches.length);
    $('mcMetricUpcoming').textContent = String(matches.filter(function (m) { return new Date(m.match_date).getTime() >= Date.now() && m.match_status !== 'FT'; }).length);
    $('mcMetricLive').textContent = String(matches.filter(function (m) { return m.match_status === 'LIVE' || m.match_status === 'HT'; }).length);
    $('mcMetricReports').textContent = String(Object.keys(reports).filter(function (k) { return ['SUBMITTED','REVIEWED'].indexOf(reports[k].report_status) >= 0; }).length);
  }
  function load() {
    return db.from('match_referee_assignments').select('match_id,official_role,assignment_status')
      .eq('referee_user_id', uid).eq('assignment_status','ACTIVE').eq('official_role','MATCH_COMMISSIONER')
      .then(function (a) {
        if (a.error) throw a.error;
        var ids = (a.data || []).map(function (x) { return x.match_id; });
        if (!ids.length) {
          matches = []; reports = {};
          $('mcMatch').innerHTML = '<option value="">No matches assigned to you yet</option>';
          showMatch(null); renderHistory(); metrics(); return;
        }
        return Promise.all([
          db.from('matches').select('id,home_team,away_team,match_date,venue,match_status').in('id',ids).order('match_date',{ascending:true}),
          db.from('match_commissioner_reports').select('*').eq('commissioner_user_id',uid)
        ]).then(function (rs) {
          if (rs[0].error) throw rs[0].error;
          if (rs[1].error) throw rs[1].error;
          matches = rs[0].data || []; reports = {};
          (rs[1].data || []).forEach(function (r) { reports[String(r.match_id)] = r; });
          $('mcMatch').innerHTML = '<option value="">Choose an assigned match…</option>' + matches.map(function (m) {
            var status = reports[String(m.id)] ? ' · ' + reports[String(m.id)].report_status : '';
            return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) +
              ' · ' + esc(new Date(m.match_date).toLocaleDateString()) + esc(status) + '</option>';
          }).join('');
          renderHistory(); metrics();
        });
      });
  }
  function render(p) {
    if (String(p.system_role || '').toUpperCase() !== 'REFEREE' ||
        String(p.official_title || '').trim().toLowerCase() !== 'match commissioner') {
      $('roleTools').innerHTML = '<p class="muted">This workspace is reserved for appointed Match Commissioners.</p>'; return;
    }
    document.title = 'Match Commissioner · The SLFA League App';
    var h = document.querySelector('.portal-head h1'); if (h) h.textContent = 'Match Commissioner';
    $('roleTools').innerHTML =
      '<section class="mc-hero"><div><span class="mc-eyebrow">SLFA MATCH-DAY OPERATIONS</span><h2 class="rt">Match Commissioner Workspace</h2>' +
      '<p>Supervise match-day arrangements, document incidents and submit an official report for every assigned fixture.</p></div><span class="mc-hero-mark">MC</span></section>' +
      '<div class="mc-metrics"><article><span>Assigned matches</span><strong id="mcMetricAssigned">—</strong></article><article><span>Upcoming</span><strong id="mcMetricUpcoming">—</strong></article>' +
      '<article><span>Live / in progress</span><strong id="mcMetricLive">—</strong></article><article><span>Reports submitted</span><strong id="mcMetricReports">—</strong></article></div>' +
      '<section class="mc-panel"><div class="mc-section-head"><div><h2 class="rt">My assigned matches</h2><p class="muted">Only matches appointed to you as Match Commissioner appear here.</p></div><button class="secondary" id="mcRefresh" type="button">Refresh</button></div>' +
      '<label for="mcMatch">Select match</label><select id="mcMatch"><option value="">Loading appointments…</option></select><div id="mcMatchSummary" class="mc-match-summary"><p class="muted">Loading…</p></div></section>' +
      '<section class="mc-panel"><div class="mc-section-head"><div><h2 class="rt">Official Match Commissioner Report</h2><p class="muted">Complete the inspection and match report. Save a draft or submit it to the competition authority.</p></div><span id="mcCurrentStatus" class="mc-status">Report status: DRAFT</span></div>' +
      '<h3 class="mc-subhead">Pre-match inspection</h3><div class="mc-form-grid">' + fields.slice(0,7).map(formField).join('') + '</div>' +
      '<h3 class="mc-subhead">During and after the match</h3><div class="mc-form-grid">' + fields.slice(7).map(formField).join('') + '</div>' +
      '<div class="mc-evidence"><div><strong>Photographic evidence</strong><p class="muted">Private uploads: JPG, PNG or WEBP, up to 8 MB per image.</p></div><input id="mcEvidenceFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple>' +
      '<button type="button" class="secondary" id="mcUploadEvidence">Upload and attach evidence</button><div id="mcEvidenceList" class="mc-evidence-list"></div></div>' +
      '<div class="mc-actions"><button type="button" class="secondary" id="mcSaveDraft">Save draft</button><button type="button" class="primary" id="mcSubmitReport">Submit official report</button><button type="button" class="secondary" id="mcPrint">Print report</button></div>' +
      '<div id="mcMessage" class="status mc-message" role="status"></div></section>' +
      '<section class="mc-panel"><h2 class="rt">Report history</h2><p class="muted">Track draft, submitted and reviewed reports for your assigned fixtures.</p><div id="mcHistory"></div></section>' +
      '<p class="mc-boundary-note">Commissioners cannot control the match clock, submit or change results, issue cards, select Man of the Match, alter standings or impose disciplinary sanctions. Those duties remain with the authorised match officials and competition authorities.</p>';
    db.auth.getUser().then(function (u) {
      if (!u.data || !u.data.user) throw new Error('Please sign in again to use this workspace.');
      uid = u.data.user.id; return load();
    }).then(function () {
      $('mcMatch').addEventListener('change', function () { chooseMatch(this.value); });
      $('mcRefresh').addEventListener('click', function () {
        say('Refreshing appointments and reports…');
        load().then(function () { chooseMatch($('mcMatch').value); say('Workspace refreshed.'); })
          .catch(function (e) { say(e.message || 'Could not refresh.', true); });
      });
      $('mcSaveDraft').addEventListener('click', function () { save('DRAFT', false); });
      $('mcSubmitReport').addEventListener('click', function () {
        if (window.confirm('Submit this Match Commissioner Report to the competition records?')) save('SUBMITTED', false);
      });
      $('mcUploadEvidence').addEventListener('click', uploadEvidence);
      $('mcPrint').addEventListener('click', function () { window.print(); });
      if (matches.length) { $('mcMatch').value = String(matches[0].id); chooseMatch(matches[0].id); }
    }).catch(function (e) { say('Workspace could not load: ' + (e.message || 'Check the database migration and your assignment.'), true); });
  }
  window.slfaRenderMatchCommissioner = render;
})();