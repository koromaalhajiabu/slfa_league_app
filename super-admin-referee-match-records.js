/* SLFA Super Admin inbox for photographed referee match records.
   Private evidence; PDF reports are rendered on demand from submitted metadata and images. */
(function () {
  'use strict';
  var db = window.slfaDb, BUCKET = 'referee-match-records', ID = 'slfaRefereeMatchRecordInbox';
  var rows = [], matches = {}, profiles = {}, channel = null, observing = false;
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function fmt(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleString('en-GB', { timeZone:'Africa/Freetown', dateStyle:'medium', timeStyle:'short' }); }
    catch (e) { return String(v); }
  }
  function pill(status) {
    var s = String(status || '').toUpperCase(), cls = s === 'ACKNOWLEDGED' ? 'good' : (s === 'RETURNED' ? 'warn' : 'neutral');
    return '<span class="srm-pill '+cls+'">'+esc(s.replace(/_/g,' '))+'</span>';
  }
  function style() {
    if ($('srmStyle')) return;
    var s = document.createElement('style');
    s.id = 'srmStyle';
    s.textContent = [
      '#'+ID+'{margin:18px 0;padding:17px;border:1px solid var(--border,#dce4eb);border-radius:15px;background:var(--panel,#fff);color:var(--text,#182a3d);box-shadow:0 8px 24px rgba(8,28,48,.06)}',
      '#'+ID+' *{box-sizing:border-box}',
      '#'+ID+' .srm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}',
      '#'+ID+' .srm-kicker{font-size:9px;letter-spacing:1.4px;font-weight:850;color:#b18a3f}',
      '#'+ID+' h2{font-size:19px;margin:5px 0 6px}',
      '#'+ID+' h3{font-size:13px;margin:0 0 9px}',
      '#'+ID+' p,#'+ID+' .srm-muted{font-size:11px;line-height:1.5;color:var(--muted,#718096)}',
      '#'+ID+' .srm-actions{display:flex;gap:7px;flex-wrap:wrap}',
      '#'+ID+' button{border:0;border-radius:8px;background:#096447;color:#fff;padding:9px 12px;font-size:10px;font-weight:800;cursor:pointer}',
      '#'+ID+' button.alt{background:transparent;color:inherit;border:1px solid var(--border,#dce4eb)}',
      '#'+ID+' button:disabled{opacity:.5}',
      '#'+ID+' .srm-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:13px 0}',
      '#'+ID+' .srm-stat{border:1px solid var(--border,#e0e6ed);border-radius:10px;padding:12px;background:var(--surface,#f7f9fb)}',
      '#'+ID+' .srm-stat small{font-size:9px;color:var(--muted,#718096);font-weight:800;text-transform:uppercase}',
      '#'+ID+' .srm-stat strong{display:block;font-size:22px;margin-top:5px}',
      '#'+ID+' .srm-tools{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}',
      '#'+ID+' select,#'+ID+' textarea{border:1px solid var(--border,#dce4eb);border-radius:8px;padding:8px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:11px;min-width:120px}',
      '#'+ID+' textarea{width:100%;min-height:50px;margin-top:6px}',
      '#'+ID+' .srm-table{overflow:auto;border:1px solid var(--border,#e0e6ed);border-radius:10px}',
      '#'+ID+' table{border-collapse:collapse;width:100%;min-width:850px}',
      '#'+ID+' th{text-align:left;padding:9px;background:var(--surface,#f6f8fa);font-size:9px;text-transform:uppercase;color:var(--muted,#718096)}',
      '#'+ID+' td{padding:10px;border-top:1px solid var(--border,#e6ebf1);font-size:10px;vertical-align:top}',
      '#'+ID+' .srm-pill{display:inline-block;padding:4px 7px;border-radius:20px;font-size:9px;font-weight:850}',
      '#'+ID+' .srm-pill.good{background:#e7f5ed;color:#176743}#'+ID+' .srm-pill.warn{background:#fff0dc;color:#8a5b0b}#'+ID+' .srm-pill.neutral{background:#eaf0f6;color:#445970}',
      '#'+ID+' .srm-empty{padding:20px;text-align:center;color:var(--muted,#718096);font-size:11px}',
      '#'+ID+' .srm-state{margin:8px 0;font-size:11px}',
      '@media(max-width:600px){#'+ID+'{padding:12px}#'+ID+' .srm-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}'
    ].join('');
    document.head.appendChild(s);
  }
  function removePrivatePanel() {
    var p = $(ID); if (p) p.remove();
    if (channel) { try { db.removeChannel(channel); } catch (_) {} channel = null; }
    rows = []; matches = {}; profiles = {};
  }
  function mount() {
    var role = $('whoRole'), target = $('roleTools');
    var isAdmin = role && String(role.textContent || '').trim().toUpperCase().replace(/\s+/g,'_') === 'SUPER_ADMIN';
    if (!isAdmin || !target || !target.querySelector('.sa-command-centre')) { removePrivatePanel(); return; }
    if ($(ID)) return;
    style();
    var p = document.createElement('section');
    p.id = ID;
    p.innerHTML = '<div class="srm-head"><div><span class="srm-kicker">SLFA · PRIVATE OFFICIAL RECORDS</span><h2>Referee Match Record Inbox</h2><p>Photographed match sheets and supporting records sent by assigned Main and Assistant Referees.</p></div><div class="srm-actions"><button id="srmRefresh" type="button">Refresh inbox</button><button id="srmExport" type="button" class="alt">Export register CSV</button></div></div><div class="srm-muted" id="srmStatus" role="status" aria-live="polite">Loading submitted records…</div><div id="srmContent"></div>';
    var anchor = $('slfaCompetitionOpsBoard') || target.querySelector('.sa-command-centre');
    if (anchor) anchor.insertAdjacentElement('afterend', p); else target.appendChild(p);
    $('srmRefresh').addEventListener('click', function () { load(false); });
    $('srmExport').addEventListener('click', exportCSV);
    p.addEventListener('click', onClick);
    p.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'srmFilter') render();
    });
    load(false);
    subscribe();
  }
  async function load(silent) {
    if (!$(ID)) return;
    var status = $('srmStatus'), content = $('srmContent');
    if (!silent && status) status.textContent = 'Loading private referee submissions…';
    try {
      var r = await db.from('referee_match_record_submissions').select('*')
        .neq('status','DRAFT').order('submitted_at',{ascending:false}).limit(300);
      if (r.error) throw r.error;
      rows = r.data || [];
      var matchIds = Array.from(new Set(rows.map(function (x) { return x.match_id; })));
      var userIds = Array.from(new Set(rows.map(function (x) { return x.submitted_by; })));
      matches = {}; profiles = {};
      if (matchIds.length) {
        var mr = await db.from('matches').select('id,match_date,new_match_date,home_team,away_team,venue,home_score,away_score,match_status').in('id',matchIds);
        if (mr.error) throw mr.error;
        (mr.data || []).forEach(function (m) { matches[String(m.id)] = m; });
      }
      if (userIds.length) {
        var ur = await db.from('user_profiles').select('id,full_name,email,official_title').in('id',userIds);
        if (ur.error) throw ur.error;
        (ur.data || []).forEach(function (u) { profiles[String(u.id)] = u; });
      }
      render();
      if (status) status.textContent = rows.length ? rows.length + ' submitted report(s) in the private inbox. New submissions appear here automatically while this panel is open.' : 'No referee match records have been submitted yet.';
    } catch (e) {
      if (status) status.textContent = 'Could not load the referee inbox: ' + (e.message || e);
      if (content) content.innerHTML = '';
    }
  }
  function subscribe() {
    if (channel || !db.channel) return;
    channel = db.channel('slfa-referee-match-records-superadmin')
      .on('postgres_changes',{event:'*',schema:'public',table:'referee_match_record_submissions'},function (payload) {
        if (payload && payload.eventType === 'INSERT') {
          var status = $('srmStatus');
          if (status) status.textContent = 'New referee match record received. Updating the inbox…';
        }
        load(true);
      }).subscribe();
  }
  function render() {
    var host = $('srmContent'); if (!host) return;
    var counts = {
      submitted: rows.filter(function (x) { return x.status === 'SUBMITTED'; }).length,
      review: rows.filter(function (x) { return x.status === 'UNDER_REVIEW'; }).length,
      returned: rows.filter(function (x) { return x.status === 'RETURNED'; }).length,
      acknowledged: rows.filter(function (x) { return x.status === 'ACKNOWLEDGED'; }).length
    };
    var filter = $('srmFilter') ? $('srmFilter').value : '';
    var list = rows.filter(function (x) { return !filter || x.status === filter; });
    host.innerHTML = '<div class="srm-stats"><article class="srm-stat"><small>New submissions</small><strong>'+counts.submitted+'</strong></article><article class="srm-stat"><small>Under review</small><strong>'+counts.review+'</strong></article><article class="srm-stat"><small>Returned for correction</small><strong>'+counts.returned+'</strong></article><article class="srm-stat"><small>Acknowledged</small><strong>'+counts.acknowledged+'</strong></article></div><div class="srm-tools"><select id="srmFilter"><option value="">All submitted reports</option>'+['SUBMITTED','UNDER_REVIEW','RETURNED','ACKNOWLEDGED'].map(function(s){return '<option value="'+s+'" '+(filter===s?'selected':'')+'>'+s.replace(/_/g,' ')+'</option>';}).join('')+'</select></div><div class="srm-table"><table><thead><tr><th>Reference / fixture</th><th>Submitting official</th><th>Match record</th><th>Photos</th><th>Status / review</th><th>Report</th></tr></thead><tbody>'+(list.length ? list.map(function (x) {
      var m = matches[String(x.match_id)] || {}, u = profiles[String(x.submitted_by)] || {};
      var fixture = (m.home_team || 'Match #'+x.match_id) + ' v ' + (m.away_team || '');
      var date = m.new_match_date || m.match_date;
      var score = x.observed_home_score == null ? 'Not entered' : x.observed_home_score+' – '+x.observed_away_score;
      return '<tr><td><strong>'+esc(x.reference_code)+'</strong><span class="srm-muted" style="display:block;margin-top:4px">'+esc(fixture)+'</span><span class="srm-muted">'+esc(fmt(date))+' · '+esc(m.venue || 'Venue not recorded')+'</span></td><td>'+esc(u.full_name || u.email || 'Referee')+'<span class="srm-muted" style="display:block">'+esc(x.official_role === 'MAIN' ? 'Main Referee' : 'Assistant Referee')+'</span><span class="srm-muted">'+esc(fmt(x.submitted_at))+'</span></td><td>'+esc(x.report_type.replace(/_/g,' '))+'<span class="srm-muted" style="display:block">Observed score: '+esc(score)+'</span>'+(x.incident_flag?'<span class="srm-pill warn">Incident flagged</span>':'')+'<span class="srm-muted" style="display:block">'+esc(x.referee_notes || x.incident_details || 'No additional notes')+'</span><span class="srm-muted" style="display:block">OCR: '+esc(x.ocr_status||'NOT RUN')+(x.ocr_confidence==null?'':' · '+esc(x.ocr_confidence)+'%')+'</span>'+(x.ocr_text?'<details><summary>View machine-read text</summary><pre style="white-space:pre-wrap">'+esc(x.ocr_text)+'</pre></details>':'')+'</td><td>'+((x.image_paths||[]).length)+' image(s)</td><td>'+pill(x.status)+'<select id="srmState_'+esc(x.id)+'" style="display:block;margin-top:7px;width:100%">'+['SUBMITTED','UNDER_REVIEW','ACKNOWLEDGED','RETURNED'].map(function(s){return '<option value="'+s+'" '+(s===x.status?'selected':'')+'>'+s.replace(/_/g,' ')+'</option>';}).join('')+'</select><textarea id="srmNote_'+esc(x.id)+'" maxlength="2000" placeholder="Review note / correction instructions">'+esc(x.review_notes||'')+'</textarea><button type="button" data-srm-save="'+esc(x.id)+'" style="margin-top:5px">Save review</button></td><td><button type="button" class="alt" data-srm-pdf="'+esc(x.id)+'">Print / Save PDF</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="srm-empty">No submitted referee records match this filter.</td></tr>')+'</tbody></table></div><p class="srm-muted">PDF reports combine the submitted details and private photographs. Use the browser print window and choose “Save as PDF” to download a copy. These submissions do not automatically alter or publish match results.</p>';
  }
  async function onClick(e) {
    var save = e.target.closest('[data-srm-save]'), pdf = e.target.closest('[data-srm-pdf]');
    if (save) { await saveReview(save.dataset.srmSave); return; }
    if (pdf) { await printReport(pdf.dataset.srmPdf); }
  }
  async function saveReview(id) {
    var row = rows.find(function (x) { return x.id === id; });
    var state = $('srmState_'+id), note = $('srmNote_'+id);
    if (!row || !state) return;
    var allowed = ['SUBMITTED','UNDER_REVIEW','ACKNOWLEDGED','RETURNED'];
    if (allowed.indexOf(state.value) < 0) return;
    var payload = { status:state.value, review_notes:(note && note.value.trim()) || null, reviewed_by:null, reviewed_at:new Date().toISOString(), updated_at:new Date().toISOString() };
    var user = await db.auth.getUser();
    payload.reviewed_by = user.data && user.data.user ? user.data.user.id : null;
    var r = await db.from('referee_match_record_submissions').update(payload).eq('id',id).select('id').single();
    if (r.error) { window.alert('Review could not be saved: '+r.error.message); return; }
    await load(true);
  }
  async function printReport(id) {
    var row = rows.find(function (x) { return x.id === id; });
    if (!row) return;
    var popup = window.open('', '_blank');
    if (!popup) { window.alert('Allow pop-ups for this site to create the PDF report.'); return; }
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(row.reference_code)+'</title><style>body{font-family:Arial,sans-serif;color:#152536;margin:28px;line-height:1.45}h1{font-size:22px;margin:5px 0}h2{font-size:15px;margin-top:22px;border-bottom:1px solid #ccd4dc;padding-bottom:6px}.top{border-bottom:4px solid #075c3f;padding-bottom:15px}.tag{font-size:10px;letter-spacing:2px;color:#8a6a2d;font-weight:bold}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px}.cell{border:1px solid #dce2e8;padding:10px;border-radius:6px}.label{font-size:9px;color:#667788;text-transform:uppercase}.value{font-size:12px;font-weight:bold;margin-top:3px}.note{white-space:pre-wrap;font-size:12px}.photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.photos img{width:100%;max-height:420px;object-fit:contain;border:1px solid #dce2e8}.disclaimer{margin-top:24px;padding:10px;background:#f5f1e7;border:1px solid #d9c99e;font-size:10px}@media print{body{margin:12mm}.photos{break-inside:avoid}}</style></head><body><div class="top"><span class="tag">SIERRA LEONE FOOTBALL ASSOCIATION · PRIVATE ADMINISTRATIVE COPY</span><h1>Referee Match Record Submission</h1><div>'+esc(row.reference_code)+'</div></div>');
    try {
      var paths = row.image_paths || [], urls = [];
      for (var i=0;i<paths.length;i++) {
        var signed = await db.storage.from(BUCKET).createSignedUrl(paths[i],3600);
        if (signed.error) throw signed.error;
        urls.push(signed.data.signedUrl);
      }
      var m = matches[String(row.match_id)] || {}, u = profiles[String(row.submitted_by)] || {};
      var eventQuery = await db.from('match_events').select('event_type,team_name,player_name,minute,assist_player_name,player_off_name').eq('match_id',String(row.match_id)).order('minute',{ascending:true});
      var matchEvents = eventQuery.error ? [] : (eventQuery.data || []);
      var fixture = (m.home_team || 'Match #'+row.match_id)+' v '+(m.away_team || '');
      var score = row.observed_home_score == null ? 'Not recorded' : row.observed_home_score+' – '+row.observed_away_score;
      var officialScore = m.home_score == null || m.away_score == null ? 'Not yet stored as an official result' : m.home_score+' – '+m.away_score;
      var eventHtml = matchEvents.length ? '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;border-bottom:1px solid #ccd4dc;padding:7px">Minute</th><th style="text-align:left;border-bottom:1px solid #ccd4dc;padding:7px">Event</th><th style="text-align:left;border-bottom:1px solid #ccd4dc;padding:7px">Team</th><th style="text-align:left;border-bottom:1px solid #ccd4dc;padding:7px">Player(s)</th></tr></thead><tbody>'+matchEvents.map(function(e){var kind=({GOAL:'Goal',YELLOW_CARD:'Yellow card',RED_CARD:'Red card',SUB:'Substitution'})[e.event_type]||String(e.event_type||'Event').replace(/_/g,' ');var player=e.event_type==='SUB'?(e.player_name||'')+(e.player_off_name?' (on / off: '+e.player_off_name+')':''):(e.player_name||'—');if(e.assist_player_name)player+=' · Assist: '+e.assist_player_name;return '<tr><td style="border-bottom:1px solid #e3e8ee;padding:7px">'+esc(e.minute==null?'—':e.minute)+'</td><td style="border-bottom:1px solid #e3e8ee;padding:7px">'+esc(kind)+'</td><td style="border-bottom:1px solid #e3e8ee;padding:7px">'+esc(e.team_name||'—')+'</td><td style="border-bottom:1px solid #e3e8ee;padding:7px">'+esc(player)+'</td></tr>';}).join('')+'</tbody></table>' : '<p>No match events are currently recorded in the event register for this fixture.</p>';
      var html = '<div class="meta">'+
        cell('Fixture',fixture)+cell('Competition / venue',m.venue||'Venue not recorded')+
        cell('Kick-off · Freetown',fmt(m.new_match_date||m.match_date))+cell('Submitted at',fmt(row.submitted_at))+
        cell('Submitting official',(u.full_name||u.email||'Referee')+' · '+row.official_role)+cell('Record type',row.report_type.replace(/_/g,' '))+
        cell('Observed score',score)+cell('Current official stored score',officialScore)+cell('Match minute',row.match_minute == null ? 'Not recorded' : row.match_minute)+
        cell('Submission status',row.status.replace(/_/g,' '))+cell('Incident flagged',row.incident_flag?'Yes':'No')+cell('OCR status / confidence',(row.ocr_status||'NOT RUN')+(row.ocr_confidence==null?'':' · '+row.ocr_confidence+'%'))+
        '</div><h2>OCR extraction from photographs · unverified</h2><div class="note">'+esc(row.ocr_text||'No OCR text extracted.')+'</div><h2>Recorded match events</h2>'+eventHtml+'<h2>Referee notes</h2><div class="note">'+esc(row.referee_notes||'No additional referee notes recorded.')+'</div><h2>Incident details</h2><div class="note">'+esc(row.incident_details||'No incident details recorded.')+'</div><h2>Photographed match records ('+urls.length+')</h2><div class="photos">'+urls.map(function(url,i){return '<div><div class="label">Photograph '+(i+1)+'</div><img src="'+esc(url)+'" alt="Submitted match record photograph '+(i+1)+'"></div>';}).join('')+'</div><h2>Super Admin review</h2><div class="note">'+esc(row.review_notes||'No review note recorded.')+'</div><div class="disclaimer"><strong>Administrative evidence only.</strong> This report compiles a referee submission and its attached photographs. It is not itself an official published result, a disciplinary decision or a replacement for the referee-only official result workflow. Verify the original record before taking administrative action.</div>';
      popup.document.write(html+'</body></html>');
      popup.document.close();
      popup.onload = function () { setTimeout(function () { popup.focus(); popup.print(); }, 900); };
    } catch (err) {
      popup.document.write('<p>Could not create report: '+esc(err.message||err)+'</p></body></html>');
      popup.document.close();
    }
    function cell(label,value) { return '<div class="cell"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div></div>'; }
  }
  function exportCSV() {
    var headers=['Reference','Fixture','Kickoff','Referee','Role','Record type','Observed home score','Observed away score','Match minute','Incident flagged','Photo count','Status','Submitted at','Review note'];
    var data=[headers].concat(rows.map(function (x) {
      var m=matches[String(x.match_id)]||{},u=profiles[String(x.submitted_by)]||{};
      return [x.reference_code,(m.home_team||'')+' v '+(m.away_team||''),fmt(m.new_match_date||m.match_date),u.full_name||u.email||'',x.official_role,x.report_type,x.observed_home_score,x.observed_away_score,x.match_minute,x.incident_flag,(x.image_paths||[]).length,x.status,fmt(x.submitted_at),x.review_notes||''];
    }));
    var csv=data.map(function(r){return r.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
    var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='slfa-referee-match-record-inbox-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove();},1000);
  }
  function start() {
    mount();
    if (observing || !document.body) return;
    observing = true;
    var mo = new MutationObserver(mount);
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start);
  else start();
})();
