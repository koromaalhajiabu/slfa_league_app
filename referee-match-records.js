/* SLFA Referee Match Record Submission.
   Assigned Main and Assistant Referees can photograph match sheets and submit them
   privately to the Super Admin inbox. These submissions never write public scores. */
(function () {
  'use strict';
  var db = window.slfaDb;
  var BUCKET = 'referee-match-records';
  var panelId = 'slfaRefereeRecordPanel';
  var wired = false;
  var assignments = [];
  var matchMap = {};
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function niceDate(v) {
    if (!v) return 'Date not set';
    try { return new Date(v).toLocaleString('en-GB', { timeZone:'Africa/Freetown', dateStyle:'medium', timeStyle:'short' }); }
    catch (e) { return String(v); }
  }
  function say(message, bad) {
    var n = $('rmrStatus');
    if (n) { n.textContent = message; n.style.color = bad ? '#a33333' : 'inherit'; }
  }
  function style() {
    if ($('slfaRefereeRecordStyle')) return;
    var s = document.createElement('style');
    s.id = 'slfaRefereeRecordStyle';
    s.textContent = [
      '#'+panelId+'{margin:18px 0;padding:16px;border:1px solid var(--border,#dce4eb);border-radius:14px;background:var(--panel,#fff);color:var(--text,#182a3d)}',
      '#'+panelId+' *{box-sizing:border-box}',
      '#'+panelId+' h2{font-size:19px;margin:4px 0 8px}',
      '#'+panelId+' h3{font-size:14px;margin:0 0 10px}',
      '#'+panelId+' p,#'+panelId+' .rmr-muted{font-size:11px;color:var(--muted,#718096);line-height:1.5}',
      '#'+panelId+' .rmr-kicker{font-size:9px;letter-spacing:1.4px;color:#b18a3f;font-weight:850}',
      '#'+panelId+' .rmr-note{padding:10px 12px;border:1px solid rgba(177,138,63,.28);background:rgba(177,138,63,.08);border-radius:9px;font-size:11px;margin:10px 0}',
      '#'+panelId+' .rmr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
      '#'+panelId+' .rmr-field{display:grid;gap:5px;min-width:0}',
      '#'+panelId+' .rmr-field.full{grid-column:1/-1}',
      '#'+panelId+' label{font-size:10px;font-weight:800;color:var(--muted,#64748b)}',
      '#'+panelId+' input,#'+panelId+' select,#'+panelId+' textarea{width:100%;min-width:0;padding:10px;border:1px solid var(--border,#dbe2ea);border-radius:9px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:12px}',
      '#'+panelId+' input[type=file]{padding:9px}',
      '#'+panelId+' .rmr-btn{border:0;border-radius:9px;background:#096447;color:#fff;padding:11px 14px;font-size:11px;font-weight:800;cursor:pointer}',
      '#'+panelId+' .rmr-btn:disabled{opacity:.55;cursor:wait}',
      '#'+panelId+' .rmr-history{display:grid;gap:8px;margin-top:12px}',
      '#'+panelId+' .rmr-card{border:1px solid var(--border,#e0e6ed);border-radius:10px;padding:11px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}',
      '#'+panelId+' .rmr-card strong{font-size:11px}',
      '#'+panelId+' .rmr-card small{display:block;color:var(--muted,#718096);font-size:10px;margin-top:4px}',
      '#'+panelId+' .rmr-pill{display:inline-block;border-radius:20px;padding:4px 8px;background:#eaf1f8;color:#445970;font-size:9px;font-weight:800}',
      '#'+panelId+' .rmr-preview{display:flex;flex-wrap:wrap;gap:7px}',
      '#'+panelId+' .rmr-preview img{width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid var(--border,#dce4eb)}',
      '@media(max-width:580px){#'+panelId+'{padding:12px}#'+panelId+' .rmr-grid{grid-template-columns:1fr}#'+panelId+' .rmr-field.full{grid-column:auto}#'+panelId+' .rmr-card{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(s);
  }
  function mount() {
    var role = $('whoRole'), target = $('roleTools');
    if (!target || !role || String(role.textContent || '').trim().toUpperCase() !== 'REFEREE') return;
    if ($(panelId)) return;
    style();
    var panel = document.createElement('section');
    panel.id = panelId;
    panel.innerHTML = '<span class="rmr-kicker">SLFA · OFFICIAL MATCH RECORDS</span><h2>Photograph &amp; Submit Match Records</h2><p>Use your phone camera to capture the signed match sheet or supporting record. Your submission goes privately to the Super Admin for review.</p><div class="rmr-note">This is an administrative evidence submission. It does not publish or change the official score. The official referee result process remains unchanged.</div><div id="rmrStatus" class="rmr-muted" role="status">Loading your active match appointments…</div><div id="rmrFormHost"></div><div id="rmrHistoryHost"></div>';
    target.insertAdjacentElement('afterend', panel);
    load();
  }
  async function load() {
    var host = $('rmrFormHost'), history = $('rmrHistoryHost');
    if (!host || !db) return;
    try {
      var auth = await db.auth.getUser();
      var user = auth.data && auth.data.user;
      if (!user) { say('Sign in with your active referee account to submit records.', true); return; }
      var profile = await db.from('user_profiles').select('id,system_role,status').eq('id', user.id).maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data || profile.data.system_role !== 'REFEREE' || profile.data.status !== 'Active') {
        say('This submission workspace is available to active referee accounts only.', true); return;
      }
      var ar = await db.from('match_referee_assignments')
        .select('match_id,official_role,assignment_status')
        .eq('referee_user_id', user.id).eq('assignment_status', 'ACTIVE')
        .in('official_role', ['MAIN','ASSISTANT']);
      if (ar.error) throw ar.error;
      assignments = ar.data || [];
      if (assignments.length) {
        var ids = Array.from(new Set(assignments.map(function (a) { return a.match_id; })));
        var mr = await db.from('matches')
          .select('id,match_date,new_match_date,home_team,away_team,venue,match_status,home_score,away_score')
          .in('id', ids).order('match_date', { ascending:false });
        if (mr.error) throw mr.error;
        (mr.data || []).forEach(function (m) { matchMap[String(m.id)] = m; });
      }
      renderForm(user.id);
      await loadHistory(user.id);
      say(assignments.length ? 'Your assigned matches are ready. Choose the fixture and submit clear photographs.' : 'No active Main Referee or Assistant Referee appointments were found for this account.');
    } catch (e) {
      say('Could not load your match submissions: ' + (e.message || e), true);
    }
  }
  function renderForm(uid) {
    var host = $('rmrFormHost');
    var options = assignments.map(function (a) {
      var m = matchMap[String(a.match_id)];
      if (!m) return '';
      var when = niceDate(m.new_match_date || m.match_date);
      return '<option value="'+esc(a.match_id)+'" data-official-role="'+esc(a.official_role)+'">'+esc(m.home_team)+' v '+esc(m.away_team)+' · '+esc(when)+' · '+esc(a.official_role === 'MAIN' ? 'Main Referee' : 'Assistant Referee')+'</option>';
    }).join('');
    if (!options) {
      host.innerHTML = '<div class="rmr-note">Your account has no active fixture appointment for match-record submission. Contact the Super Admin to check your appointment.</div>';
      return;
    }
    host.innerHTML = '<form id="rmrForm"><div class="rmr-grid">'+
      '<div class="rmr-field full"><label for="rmrMatch">Assigned fixture *</label><select id="rmrMatch" required>'+options+'</select></div>'+
      '<div class="rmr-field"><label for="rmrType">Record type *</label><select id="rmrType"><option value="MATCH_RECORD">Official match record / signed sheet</option><option value="INCIDENT_REPORT">Incident report</option><option value="SUPPORTING_EVIDENCE">Supporting evidence</option></select></div>'+
      '<div class="rmr-field"><label for="rmrMinute">Match minute (optional)</label><input id="rmrMinute" type="number" min="0" max="150" inputmode="numeric" placeholder="e.g. 90"></div>'+
      '<div class="rmr-field"><label for="rmrHomeScore">Observed home score (optional)</label><input id="rmrHomeScore" type="number" min="0" max="99" inputmode="numeric"></div>'+
      '<div class="rmr-field"><label for="rmrAwayScore">Observed away score (optional)</label><input id="rmrAwayScore" type="number" min="0" max="99" inputmode="numeric"></div>'+
      '<div class="rmr-field full"><label><input id="rmrIncident" type="checkbox" style="width:auto"> This submission includes an incident or disciplinary matter</label></div>'+
      '<div class="rmr-field full"><label for="rmrIncidentDetails">Incident details (optional)</label><textarea id="rmrIncidentDetails" rows="3" maxlength="4000" placeholder="Record the facts, time, persons involved and action taken."></textarea></div>'+
      '<div class="rmr-field full"><label for="rmrNotes">Referee notes (optional)</label><textarea id="rmrNotes" rows="3" maxlength="4000" placeholder="Additional match-record notes for the Super Admin."></textarea></div>'+
      '<div class="rmr-field full"><label for="rmrPhotos">Photograph match sheets / records (1–6 images, up to 10 MB each) *</label><input id="rmrPhotos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple required><span class="rmr-muted">On Android, the camera may open directly. You can also choose images from your gallery. Use clear, readable photos.</span><div id="rmrPreview" class="rmr-preview"></div></div>'+
      '<div class="rmr-field full"><button id="rmrSubmit" class="rmr-btn" type="submit">Send match record to Super Admin</button></div>'+
      '</div></form>';
    $('rmrPhotos').addEventListener('change', preview);
    $('rmrForm').addEventListener('submit', function (e) { e.preventDefault(); submit(uid); });
  }
  function preview() {
    var input = $('rmrPhotos'), host = $('rmrPreview');
    if (!input || !host) return;
    Array.from(input.files || []).forEach(function (f) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return;
      var img = document.createElement('img');
      img.alt = 'Selected match record photo';
      img.src = URL.createObjectURL(f);
      host.appendChild(img);
    });
  }
  async function submit(uid) {
    var btn = $('rmrSubmit'), files = Array.from(($('rmrPhotos') || {}).files || []);
    if (!files.length || files.length > 6) { say('Select between one and six match-record photographs.', true); return; }
    if (files.some(function (f) { return !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 10485760; })) {
      say('Only JPG, PNG or WEBP images up to 10 MB each are accepted.', true); return;
    }
    var matchId = Number($('rmrMatch').value);
    var assignment = assignments.find(function (a) { return Number(a.match_id) === matchId; });
    if (!assignment) { say('Select a match assigned to your account.', true); return; }
    var home = $('rmrHomeScore').value, away = $('rmrAwayScore').value;
    if ((home === '') !== (away === '')) { say('Enter both observed score values or leave both blank.', true); return; }
    btn.disabled = true; say('Creating a secure submission…');
    var draft = null, uploaded = [];
    try {
      var user = (await db.auth.getUser()).data.user;
      var payload = {
        match_id: matchId, submitted_by: user.id, official_role: assignment.official_role,
        report_type: $('rmrType').value,
        observed_home_score: home === '' ? null : Number(home),
        observed_away_score: away === '' ? null : Number(away),
        match_minute: $('rmrMinute').value === '' ? null : Number($('rmrMinute').value),
        incident_flag: $('rmrIncident').checked,
        incident_details: $('rmrIncidentDetails').value.trim() || null,
        referee_notes: $('rmrNotes').value.trim() || null,
        status: 'DRAFT'
      };
      var created = await db.from('referee_match_record_submissions').insert(payload).select('*').single();
      if (created.error) throw created.error;
      draft = created.data;
      for (var i = 0; i < files.length; i++) {
        say('Uploading photograph ' + (i+1) + ' of ' + files.length + '…');
        var ext = files[i].type === 'image/png' ? 'png' : (files[i].type === 'image/webp' ? 'webp' : 'jpg');
        var path = user.id + '/' + matchId + '/' + draft.id + '/' + String(i+1).padStart(2,'0') + '-' + Date.now() + '.' + ext;
        var up = await db.storage.from(BUCKET).upload(path, files[i], { contentType:files[i].type, upsert:false });
        if (up.error) throw up.error;
        uploaded.push(path);
      }
      var ocr = window.slfaRunOCR
        ? await window.slfaRunOCR(files, function (msg) { say('OCR: ' + msg); })
        : { text:'', confidence:null, status:'FAILED' };
      say('Sending your report and OCR text to the Super Admin…');
      var sent = await db.from('referee_match_record_submissions').update({
        image_paths: uploaded,
        ocr_text: ocr.text || null,
        ocr_status: ocr.status || 'FAILED',
        ocr_confidence: ocr.confidence,
        ocr_processed_at: new Date().toISOString(),
        status:'SUBMITTED', submitted_at:new Date().toISOString(), updated_at:new Date().toISOString()
      }).eq('id', draft.id).eq('status','DRAFT').select('id').single();
      if (sent.error) throw sent.error;
      if (!sent.data) throw new Error('Submission was not confirmed by the server.');
      $('rmrForm').reset();
      $('rmrPreview').innerHTML = '';
      say('Submitted successfully. Reference: ' + draft.reference_code + '. The Super Admin can now review and download your report.');
      await loadHistory(user.id);
    } catch (e) {
      if (draft) {
        try { if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded); } catch (_) {}
        try { await db.from('referee_match_record_submissions').delete().eq('id', draft.id).eq('status','DRAFT'); } catch (_) {}
      }
      say('Could not submit the record: ' + (e.message || e) + '. You can retry when the connection is stable.', true);
    } finally {
      if ($('rmrSubmit')) $('rmrSubmit').disabled = false;
    }
  }
  async function loadHistory(uid) {
    var host = $('rmrHistoryHost');
    if (!host) return;
    var r = await db.from('referee_match_record_submissions')
      .select('id,reference_code,match_id,official_role,report_type,status,submitted_at,created_at,image_paths,review_notes,ocr_status,ocr_text,ocr_confidence')
      .eq('submitted_by', uid).order('created_at', { ascending:false }).limit(15);
    if (r.error) throw r.error;
    var rows = r.data || [];
    host.innerHTML = '<h3 style="margin-top:18px">My submitted match records</h3><div class="rmr-history">'+(rows.length ? rows.map(function (x) {
      var m = matchMap[String(x.match_id)] || {};
      return '<article class="rmr-card"><div><strong>'+esc(x.reference_code)+' · '+esc(m.home_team || 'Match #'+x.match_id)+' v '+esc(m.away_team || '')+'</strong><small>'+esc(niceDate(x.submitted_at || x.created_at))+' · '+esc(x.official_role)+' · '+esc(x.report_type.replace(/_/g,' '))+'</small><small>'+((x.image_paths || []).length)+' photo(s) attached · OCR '+esc(x.ocr_status||'NOT RUN')+(x.ocr_confidence==null?'':' · '+esc(x.ocr_confidence)+'%')+'</small>'+(x.ocr_text?'<small><strong>Machine-read text (verify):</strong> '+esc(x.ocr_text.slice(0,220))+'</small>':'')+(x.review_notes?'<small><strong>Super Admin review:</strong> '+esc(x.review_notes)+'</small>':'')+'</div><span class="rmr-pill">'+esc(x.status.replace(/_/g,' '))+'</span></article>';
    }).join('') : '<div class="rmr-muted">No match records submitted yet.</div>')+'</div>';
  }
  function start() {
    mount();
    if (!document.body || wired) return;
    wired = true;
    var mo = new MutationObserver(mount);
    mo.observe(document.body, { childList:true, subtree:true, characterData:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
