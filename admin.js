// Administration tools, shown after sign-in and based on the signed-in role.
// Super Admin: fixtures, results, news and player approval. Media Officer: news posts. Club Managers: squads.
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
  // A reason is required for every result change or reversal; it is stored in the result log
  function askReason(question) {
    var r = prompt(question);
    if (r === null) return null;
    if (r.trim().length < 5) { msg('Give a reason of at least 5 characters.'); return null; }
    return r.trim();
  }
  var CAT_LABEL = { NEWS: 'News', PRESS_RELEASE: 'Press release', MATCH_REPORT: 'Match report', ANNOUNCEMENT: 'Announcement', FIXTURE: 'Fixture', RESULT: 'Result', PHOTO: 'Photo' };
  var luMatches = {}, LINEUP_LEAD_MS = 20 * 60 * 1000;
  function lineupOpen(m) { return Date.now() < new Date(m.match_date).getTime() - LINEUP_LEAD_MS; }
  function lineupCloses(m) { return new Date(new Date(m.match_date).getTime() - LINEUP_LEAD_MS).toLocaleString(); }
  function input(id, label, type, extra) {
    return '<label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" ' + (extra || '') + '>';
  }

  function currentUser() {
    return db.auth.getUser().then(function (u) {
      if (!u.data || !u.data.user) return null;
      return db.from('user_profiles').select('id, system_role, status, full_name, email, club_id').eq('id', u.data.user.id).maybeSingle()
        .then(function (r) { return r.data && String(r.data.status).toLowerCase() === 'active' ? r.data : null; });
    });
  }

  // Offline referee events are stored on this device and synced with a stable UUID.
  // The unique database key makes retries safe if the connection drops after a server commit.
  function refereeQueueKey(uid) { return 'slfa_referee_event_queue_v1_' + uid; }
  function readRefereeQueue(uid) {
    try { var value = JSON.parse(localStorage.getItem(refereeQueueKey(uid)) || '[]'); return Array.isArray(value) ? value : []; }
    catch (e) { return []; }
  }
  function writeRefereeQueue(uid, rows) {
    try { localStorage.setItem(refereeQueueKey(uid), JSON.stringify(rows)); return true; }
    catch (e) { return false; }
  }
  function makeClientEventId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function queueAndSyncRefereeEvent(event) {
    var queue = readRefereeQueue(event.recorded_by);
    if (!queue.some(function (x) { return x.client_event_id === event.client_event_id; })) queue.push(event);
    if (!writeRefereeQueue(event.recorded_by, queue)) {
      return Promise.resolve({ queued: false, error: new Error('This browser could not save the event offline. Keep this page open and retry when connected.') });
    }
    if (!navigator.onLine) return Promise.resolve({ queued: true });
    return db.from('match_events').upsert([event], { onConflict: 'client_event_id', ignoreDuplicates: true }).select('id').maybeSingle().then(function (r) {
      if (r.error) {
        var networkFailure = !navigator.onLine || r.error.status === 0 || /failed to fetch|network|timeout|load failed/i.test(r.error.message || '');
        return { queued: networkFailure, error: r.error };
      }
      var remaining = readRefereeQueue(event.recorded_by).filter(function (x) { return x.client_event_id !== event.client_event_id; });
      writeRefereeQueue(event.recorded_by, remaining);
      return { queued: false, id: r.data ? r.data.id : null };
    });
  }
  function syncPendingRefereeEvents() {
    if (!navigator.onLine) return;
    db.auth.getUser().then(function (u) {
      var user = u.data && u.data.user;
      if (!user) return;
      var queue = readRefereeQueue(user.id);
      if (!queue.length) return;
      return db.from('match_events').upsert(queue, { onConflict: 'client_event_id', ignoreDuplicates: true }).then(function (r) {
        if (r.error) { msg('Offline match events are still waiting to sync: ' + r.error.message); return; }
        writeRefereeQueue(user.id, []);
        msg(queue.length + ' offline match event(s) synced successfully.');
      });
    }).catch(function () {});
  }
  function refereeResultQueueKey(uid) { return 'slfa_referee_result_queue_v1_' + uid; }
  function readRefereeResultQueue(uid) {
    try { var value = JSON.parse(localStorage.getItem(refereeResultQueueKey(uid)) || '[]'); return Array.isArray(value) ? value : []; }
    catch (e) { return []; }
  }
  function writeRefereeResultQueue(uid, rows) {
    try { localStorage.setItem(refereeResultQueueKey(uid), JSON.stringify(rows)); return true; }
    catch (e) { return false; }
  }
  function submitRefereeResult(submission) {
    return db.rpc('referee_submit_final_idempotent', {
      p_client_submission_id: submission.client_submission_id,
      p_match_id: submission.match_id,
      p_home: submission.home_goals,
      p_away: submission.away_goals
    });
  }
  function queueAndSyncRefereeResult(submission) {
    var queue = readRefereeResultQueue(submission.submitted_by);
    if (!queue.some(function (x) { return x.client_submission_id === submission.client_submission_id; })) queue.push(submission);
    if (!writeRefereeResultQueue(submission.submitted_by, queue)) {
      return Promise.resolve({ queued: false, error: new Error('This browser could not save the final score offline. Keep this page open and retry when connected.') });
    }
    if (!navigator.onLine) return Promise.resolve({ queued: true });
    return submitRefereeResult(submission).then(function (r) {
      if (r.error) {
        var networkFailure = !navigator.onLine || r.error.status === 0 || /failed to fetch|network|timeout|load failed/i.test(r.error.message || '');
        return { queued: networkFailure, error: r.error };
      }
      writeRefereeResultQueue(submission.submitted_by, readRefereeResultQueue(submission.submitted_by).filter(function (x) {
        return x.client_submission_id !== submission.client_submission_id;
      }));
      return { queued: false };
    });
  }
  function syncPendingRefereeResults() {
    if (!navigator.onLine) return;
    db.auth.getUser().then(function (u) {
      var user = u.data && u.data.user;
      if (!user) return;
      var queue = readRefereeResultQueue(user.id);
      if (!queue.length) return;
      return queue.reduce(function (chain, item) {
        return chain.then(function (failed) {
          if (failed) return true;
          return submitRefereeResult(item).then(function (r) {
            if (r.error) { msg('A final score is still waiting to sync: ' + r.error.message); return true; }
            writeRefereeResultQueue(user.id, readRefereeResultQueue(user.id).filter(function (x) {
              return x.client_submission_id !== item.client_submission_id;
            }));
            return false;
          });
        });
      }, Promise.resolve(false)).then(function (failed) {
        if (!failed) msg('All queued referee final scores have synced.');
      });
    }).catch(function () {});
  }
  window.addEventListener('online', function () {
    syncPendingRefereeEvents();
    syncPendingRefereeResults();
  });

  // Called by portal.js on the matching portal page only
  window.slfaRenderRole = function (p) {
    var role = String(p.system_role).toUpperCase();
    var out;
    if (role === 'SUPER_ADMIN') { out = superAdmin(p); if (typeof window.slfaRenderCommissionerReportsAdmin === 'function') window.slfaRenderCommissionerReportsAdmin(p); }
    else if (role === 'MEDIA_OFFICER') out = mediaOfficer(p);
    else if (role === 'DISCIPLINARY_OFFICER') out = disciplinary(p);
    else if (role === 'REFEREE' && String(p.official_title || '').trim().toLowerCase() === 'match commissioner' && typeof window.slfaRenderMatchCommissioner === 'function') out = window.slfaRenderMatchCommissioner(p);
    else if (role === 'REFEREE') out = referee(p);
    else if (role === 'DEVELOPER') out = developer(p);
    accountPrivacy();
    return out;
  };

  // ---------- SUPER ADMIN ----------
  // Downloads (Super Admin only). The database checks the role and writes the export log;
  // the page only turns the returned rows into a file.
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function saveFile(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  var exportNames = { matches: 'slfa-matches-and-results', standings: 'slfa-league-table', suspensions: 'slfa-suspensions', full_backup: 'slfa-full-backup' };
  function runExport(kind) {
    var out = $('exportMsg'); if (out) out.textContent = 'Preparing the download…';
    db.rpc('export_data', { p_name: kind }).then(function (res) {
      if (res.error) { if (out) out.textContent = res.error.message; return; }
      var stamp = new Date().toISOString().slice(0, 10);
      if (kind === 'full_backup') {
        saveFile(exportNames[kind] + '-' + stamp + '.json', JSON.stringify(res.data, null, 2), 'application/json');
      } else {
        var rows = res.data || [];
        var cols = rows.length ? Object.keys(rows[0]) : [];
        var text = [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return csvCell(r[c]); }).join(','); })).join('\r\n');
        saveFile(exportNames[kind] + '-' + stamp + '.csv', '\ufeff' + text, 'text/csv;charset=utf-8');
      }
      if (out) out.textContent = 'Download ready.';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-export]');
    if (b) runExport(b.getAttribute('data-export'));
  });

  function superAdmin(p) {
    box().innerHTML =
      '<section class="sa-command-centre"><h2 class="rt">Super Admin Command Centre</h2><p class="muted">Live operational overview from the connected SLFA database. These are record totals, not performance estimates.</p><div class="sa-metric-grid">'+[['saMetricCompetitions','Competitions'],['saMetricSeasons','Seasons'],['saMetricMatches','Fixtures and results'],['saMetricClubs','Clubs'],['saMetricPlayers','Squad records'],['saMetricReports','Fan reports']].map(function(x){return '<article class="sa-metric"><span>'+x[1]+'</span><strong id="'+x[0]+'">—</strong></article>';}).join('')+'</div><div class="muted" id="saOverviewStatus" role="status">Loading operational totals…</div><button class="secondary" type="button" id="saRefreshOverview">Refresh overview</button></section>' +
      '<h2 class="rt">Downloads</h2>' +
      '<p class="muted">Super Admin only. Each download is recorded in the export log.</p>' +
      '<div class="btns"><button class="secondary" data-export="matches">Matches and results (CSV)</button>' +
      '<button class="secondary" data-export="standings">League table (CSV)</button>' +
      '<button class="secondary" data-export="suspensions">Suspensions (CSV)</button>' +
      '<button class="primary" data-export="full_backup">Full backup (JSON)</button></div>' +
      '<div id="exportMsg" class="muted" role="status"></div>' +
       '<h2 class="rt">Clubs</h2>' +
      '<label for="clName">Club name</label><input id="clName" type="text">' +
      '<label for="clLeague">League</label><select id="clLeague"><option value="">Loading leagues…</option></select>' +
      input('clLogo', 'Logo link (optional)', 'url') +
      '<div class="btns"><button class="primary" id="clAdd">Add club</button></div>' +
      '<div id="clubAdminList" class="muted">Loading clubs…</div>' +
      '<h2 class="rt">Seasons</h2>' +
      '<p class="muted">Past seasons stay visible to fans with their final table. The current season drives the live table and the default view.</p>' +
      '<div id="seasonList" class="muted">Loading seasons…</div>' +
      input('seasonName', 'Season name, for example 2025/26') +
      input('seasonStart', 'Start date', 'date') + input('seasonEnd', 'End date', 'date') +
      '<div class="btns"><button class="primary" id="seasonAdd">Add season</button></div>' +
      '<section id="fixturePlannerPanel" class="fixture-planner-panel" aria-labelledby="fixturePlannerHeading">' +
      '<h2 class="rt" id="fixturePlannerHeading">Fixture planner · Add a fixture</h2>' +
      '<p class="fixture-planner-intro">Schedule a match by selecting its competition and season, then entering both teams, kick-off time and venue.</p>' +
      '<label for="fxLeague">Competition / league</label><select id="fxLeague"><option value="">Loading leagues…</option></select>' +
      '<label for="fxSeason">Season</label><select id="fxSeason"><option value="">Loading seasons…</option></select>' +
      input('fxHome', 'Home team') + input('fxAway', 'Away team') +
      input('fxDate', 'Date and time', 'datetime-local') + input('fxVenue', 'Venue') +
      '<div class="btns"><button class="primary" id="fxSave">Add fixture</button></div>' +
      '</section>' +
      '<h2 class="rt">Import fixtures and results</h2>' +
      '<p class="muted">Add many matches at once from a CSV file, for example a past season. <button type="button" class="secondary" id="impTemplate">Download the template</button> Season, league and club names must match the app exactly.</p>' +
      '<label for="impFile">CSV file</label><input type="file" id="impFile" accept=".csv,text/csv">' +
      '<div class="btns"><button class="secondary" id="impCheck">Check file</button><button class="primary" id="impGo" disabled>Import matches</button></div>' +
      '<div id="impPreview" class="muted" aria-live="polite"></div>' +
      '<section class="hist-standings-admin" aria-labelledby="histStandingsHeading">' +
      '<h2 class="rt" id="histStandingsHeading">Historical league standings</h2>' +
      '<p class="muted">Publish the final table for a completed season. Choose a league and a past season, then use either bulk CSV import or manual entry. Saving replaces only that league’s table for the selected past season; it does not change fixtures, match results or the current live table.</p>' +
      '<label for="histLeague">League competition</label><select id="histLeague"><option value="">Choose a league…</option></select>' +
      '<label for="histSeason">Past season</label><select id="histSeason"><option value="">Choose a past season…</option></select>' +
      '<h3 class="rt">Option 1 · Bulk CSV import</h3>' +
      '<p class="muted">Download the template, fill in one row per club, choose the file and check it before importing.</p>' +
      '<div class="btns"><button type="button" class="secondary" id="histTemplate">Download standings template</button></div>' +
      '<label for="histCsvFile">Historical standings CSV</label><input type="file" id="histCsvFile" accept=".csv,text/csv">' +
      '<div class="btns"><button type="button" class="secondary" id="histCheck">Check CSV</button><button type="button" class="primary" id="histImport" disabled>Import standings</button></div>' +
      '<div id="histCsvPreview" class="muted" aria-live="polite"></div>' +
      '<h3 class="rt">Option 2 · Manual entry</h3>' +
      '<p class="muted">Load the selected season’s table, type or correct each club’s final figures, and add or remove rows as needed. Played must equal wins + draws + losses.</p>' +
      '<div class="hist-standings-scroll"><table class="hist-standings-table"><thead><tr><th>Pos</th><th>Club</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>Pts</th><th></th></tr></thead><tbody id="histRows"><tr><td colspan="10">Choose a league and past season, then load the table.</td></tr></tbody></table></div>' +
      '<div class="btns"><button type="button" class="secondary" id="histLoad">Load table</button><button type="button" class="secondary" id="histAddRow">Add club row</button><button type="button" class="primary" id="histSave">Save manual table</button></div>' +
      '<div class="status" id="histManualMsg" role="status"></div>' +
      '</section>' +
      '<h2 class="rt">Enter a result</h2>' +
      '<label for="resSeason">Season of the match</label><select id="resSeason"><option value="">Loading seasons…</option></select>' +
      '<label for="resMatch">Match</label><select id="resMatch"><option value="">Loading matches…</option></select>' +
      '<div class="scores"><input id="resHome" type="number" min="0" placeholder="Home"><span>–</span><input id="resAway" type="number" min="0" placeholder="Away"></div>' +
      '<div class="btns"><button class="primary" id="resSave">Record result</button><button class="secondary" id="resChange">Change confirmed result</button><button class="secondary" id="resReverse">Reverse result</button></div>' +
      '<h2 class="rt">Match status</h2>' +
      '<label for="msMatch">Match</label><select id="msMatch"><option value="">Loading matches…</option></select>' +
      '<label for="msStatus">Status</label><select id="msStatus"><option value="SCHEDULED">Scheduled</option><option value="POSTPONED">Postponed</option><option value="RESCHEDULED">Rescheduled</option><option value="CANCELLED">Cancelled</option></select>' +
      input('msReason', 'Reason (optional)') +
      '<div class="btns"><button class="primary" id="msSave">Save status</button></div>' +
      '<h2 class="rt">Live match</h2>' +
      '<label for="lvMatch">Match</label><select id="lvMatch"><option value="">Loading matches…</option></select>' +
      '<p class="muted">The referee starts, pauses, times and ends the match.</p>' +
      '<div id="lvPanel" class="hidden"><p class="muted">Goals and cards are recorded by the assigned referees and the match commissioner.</p></div>' +
      '<h2 class="rt">Assign a referee</h2>' +
      '<label for="asMatch">Match</label><select id="asMatch"><option value="">Loading…</option></select>' +
      '<label for="asRef">Referee</label><select id="asRef"><option value="">Loading referees…</option></select>' +
      '<label for="asRole">Role at the match</label><select id="asRole"><option value="MAIN">Main referee</option><option value="ASSISTANT">Assistant referee</option><option value="MATCH_COMMISSIONER">Match commissioner</option></select>' +
      '<div class="btns"><button class="primary" id="asSave">Assign</button></div>' +
      '<h2 class="rt">Final scores awaiting approval</h2><div id="pendingResults" class="muted">Loading…</div>' +
      '<h2 class="rt">News awaiting approval</h2><div id="reviewList" class="muted">Loading…</div>' +
      '<h2 class="rt">Fan comments awaiting approval</h2><div id="pendingComments" class="muted">Loading…</div>' +
      '<h2 class="rt">Audit log</h2>' +
      '<p class="muted">Recent changes across the app, newest first. Read only.</p>' +
      '<label for="auDays">Show</label><select id="auDays"><option value="30">Last 30 days</option><option value="90" selected>Last 90 days</option><option value="365">Last year</option></select>' +
      '<label for="auArea">Area</label><select id="auArea"><option value="">All areas</option></select>' +
      '<div id="auditList" class="muted" aria-live="polite">Loading…</div>' +
      '<div id="usagePanel"><h2 class="rt">App usage, last 30 days</h2><div id="usageCounts" class="muted">Loading…</div></div>' +
      '<h2 class="rt">Problems reported by fans</h2><div id="fanReports" class="muted">Loading…</div>' +
      '<h2 class="rt">Club profile changes awaiting approval</h2><div id="clubProfileReview" class="muted">Loading…</div>' +
      '<h2 class="rt">Player registrations awaiting approval</h2><div id="squadReview" class="muted">Loading…</div>' +
      '<h2 class="rt">Transfer requests awaiting approval</h2><div id="transferReview" class="muted">Loading…</div>' +
      '<div class="status" id="roleMsg"></div>';

    $('fxSave').addEventListener('click', function () {
      var h = $('fxHome').value.trim(), a = $('fxAway').value.trim(), d = $('fxDate').value, v = $('fxVenue').value.trim();
      if (!h || !a || !d) { msg('Enter both teams and the date.'); return; }
      if (!$('fxLeague').value) { msg('Choose the league.'); return; }
      if (!$('fxSeason').value) { msg('Choose the season.'); return; }
      db.from('seasons').select('id').eq('id', Number($('fxSeason').value)).maybeSingle().then(function (s) {
        return db.from('matches').insert([{ home_team: h, away_team: a, match_date: new Date(d).toISOString(), venue: v || null, season_id: s.data ? s.data.id : null, league_id: Number($('fxLeague').value), home_score: null, away_score: null, match_status: 'SCHEDULED' }]);
      }).then(function (r) {
        if (r.error) { msg(r.error.message); return; }
        msg('Fixture added.'); $('fxHome').value = ''; $('fxAway').value = ''; $('fxVenue').value = ''; loadMatchesForResult();
      });
    });

    loadMatchesForResult();
    $('resChange').addEventListener('click', function () {
      var id = $('resMatch').value, h = parseInt($('resHome').value, 10), a = parseInt($('resAway').value, 10);
      if (!id || isNaN(h) || isNaN(a)) { msg('Choose a match and enter both scores.'); return; }
      var reason = askReason('Reason for changing this result (required, logged):'); if (!reason) return;
      db.rpc('change_match_result', { p_match_id: Number(id), p_home: h, p_away: a, p_reason: reason }).then(function (r) {
        msg(r.error ? r.error.message : 'Result changed and logged.'); loadMatchesForResult();
      });
    });
    $('resReverse').addEventListener('click', function () {
      var id = $('resMatch').value; if (!id) { msg('Choose a match.'); return; }
      var reason = askReason('Reason for reversing this result (required, logged):'); if (!reason) return;
      if (!confirm('Reverse this result? The match goes back to half time and the referee can submit again.')) return;
      db.rpc('reverse_match_result', { p_match_id: Number(id), p_reason: reason }).then(function (r) {
        msg(r.error ? r.error.message : 'Result reversed and logged.'); loadMatchesForResult();
      });
    });
    $('resSave').addEventListener('click', function () {
      var id = $('resMatch').value, h = parseInt($('resHome').value, 10), a = parseInt($('resAway').value, 10);
      if (!id || isNaN(h) || isNaN(a)) { msg('Choose a match and enter both scores.'); return; }
      db.rpc('record_match_result', { p_match_id: Number(id), p_home: h, p_away: a }).then(function (r) {
        if (r.error) { msg(r.error.message); return; }
        return setMatch(id, { match_status: 'FT', match_minute: null }).then(function () {
          msg('Result recorded and the table updated.'); $('resHome').value = ''; $('resAway').value = ''; loadMatchesForResult();
        });
      });
    });

    loadLeagueOptions();
    wireCompetitionAdmin();
    wireCupAdmin();
    loadSuperAdminOverview();
    $('saRefreshOverview').onclick=loadSuperAdminOverview;
    wireClubs();
    loadReview();
    loadClubProfileReview();
    loadSquadReview();
    loadTransferReview();
    $('msSave').addEventListener('click', function () {
      var id = $('msMatch').value, st = $('msStatus').value, reason = $('msReason').value.trim();
      if (!id) { msg('Choose a match.'); return; }
      setMatch(id, { match_status: st, status_reason: reason || null, status_set_at: new Date().toISOString() }).then(function (r) {
        msg(r.error ? r.error.message : 'Status saved.'); $('msReason').value = ''; loadStatusOptions();
      });
    });
    loadStatusOptions();
    wireLive();
    loadAssignOptions();
    loadPendingResults();
    loadPendingComments();
    loadFanReports();
    loadSeasonAdmin();
    loadAuditLog();
    wireImport();
    wireHistoricalStandings();
    if ($('resSeason')) $('resSeason').addEventListener('change', loadMatchesForResult);
    if ($('seasonAdd')) $('seasonAdd').addEventListener('click', function () {
      db.rpc('create_season', { p_name: $('seasonName').value.trim(), p_start: $('seasonStart').value, p_end: $('seasonEnd').value }).then(function (res) {
        if (res.error) { msg(res.error.message); return; }
        msg('Season added. Make it current when it starts.');
        $('seasonName').value = ''; $('seasonStart').value = ''; $('seasonEnd').value = '';
        loadSeasonAdmin();
      });
    });
    $('asSave').addEventListener('click', function () {
      var m = $('asMatch').value, r = $('asRef').value, role = $('asRole').value;
      if (!m || !r) { msg('Choose a match and a referee.'); return; }
      db.auth.getUser().then(function (u) {
        return db.from('match_referee_assignments').insert([{ match_id: Number(m), referee_user_id: r, assigned_by: u.data.user.id, official_role: role, assignment_status: 'ACTIVE' }]);
      }).then(function (res) { msg(res.error ? res.error.message : 'Official assigned.'); });
    });
  }

  function loadAssignOptions() {
    db.from('matches').select('id, home_team, away_team, match_date').order('match_date', { ascending: false }).limit(60).then(function (r) {
      $('asMatch').innerHTML = '<option value="">Choose a match…</option>' + (r.data || []).map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + '</option>'; }).join('');
    });
    db.from('user_profiles').select('id, full_name, email, official_title').eq('system_role', 'REFEREE').then(function (r) {
      $('asRef').innerHTML = '<option value="">Choose a referee…</option>' + (r.data || []).map(function (u) {
        return '<option value="' + esc(u.id) + '">' + esc(u.full_name || u.email) + (u.official_title ? ' (' + esc(u.official_title) + ')' : '') + '</option>'; }).join('') || '<option value="">No referees yet</option>';
    });
  }

  function loadPendingResults() {
    db.from('match_results').select('id, home_team, away_team, home_goals, away_goals, recorded_by').eq('status', 'PENDING').order('id', { ascending: true })
      .then(function (r) {
        var rows = r.data || [];
        $('pendingResults').innerHTML = rows.length ? rows.map(function (x) {
          return '<div class="post"><strong>' + esc(x.home_team) + ' ' + x.home_goals + ' – ' + x.away_goals + ' ' + esc(x.away_team) + '</strong>' +
            '<div class="btns"><button class="primary" data-approve="' + x.id + '">Approve</button><button class="secondary" data-reject="' + x.id + '">Reject</button></div></div>';
        }).join('') : 'No final scores waiting.';
        document.querySelectorAll('[data-approve]').forEach(function (b) {
          b.addEventListener('click', function () {
            db.rpc('approve_match_result', { p_result_id: Number(b.dataset.approve) }).then(function (res) {
              msg(res.error ? res.error.message : 'Approved. The table is updated.'); loadPendingResults(); loadMatchesForResult(); });
          });
        });
        document.querySelectorAll('[data-reject]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Reject this score? The referee will need to send it again.')) return;
            db.from('match_results').delete().eq('id', Number(b.dataset.reject)).then(function (res) {
              msg(res.error ? res.error.message : 'Rejected.'); loadPendingResults(); });
          });
        });
      });
  }

  // Problems fans report from match details. Staff mark each one resolved once it is checked.
  // Bulk import of matches from a CSV file. Checks every row first; only valid rows are imported.
  var impRows = [];
  var IMP_HEADERS = ['season', 'league', 'date', 'time', 'home_team', 'away_team', 'home_score', 'away_score', 'status', 'venue'];
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function impTemplate() {
    var sample = ['2025/26', 'Leone Rock Premier League', '2026-01-10', '15:00', 'Bo Rangers', 'Mighty Blackpool', '2', '1', 'FT', 'National Stadium'];
    var csv = IMP_HEADERS.join(',') + '\n' + sample.map(function (x) { return /[",]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',') + '\n';
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'slfa-matches-template.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function impCheck() {
    var f = $('impFile').files && $('impFile').files[0];
    var box = $('impPreview');
    impRows = []; $('impGo').disabled = true;
    if (!f) { box.textContent = 'Choose a CSV file first.'; return; }
    box.textContent = 'Checking…';
    var reader = new FileReader();
    reader.onload = function () {
      var table = parseCsv(String(reader.result || ''));
      if (table.length < 2) { box.textContent = 'The file needs a header row and at least one match.'; return; }
      var head = table[0].map(function (h) { return h.trim().toLowerCase(); });
      var missing = ['season', 'league', 'date', 'home_team', 'away_team'].filter(function (h) { return head.indexOf(h) < 0; });
      if (missing.length) { box.textContent = 'Missing column: ' + missing.join(', ') + '.'; return; }
      Promise.all([
        db.from('seasons').select('id, name').then(function (r) { return r.data || []; }),
        db.from('leagues').select('id, name').then(function (r) { return r.data || []; }),
        db.from('league_clubs').select('club_name').then(function (r) { return r.data || []; }),
        db.from('matches').select('season_id, league_id, home_team, away_team, match_date').limit(5000).then(function (r) { return r.data || []; })
      ]).then(function (res) {
        var seasons = {}, leagues = {}, clubs = {}, existing = {};
        res[0].forEach(function (x) { seasons[x.name.trim().toLowerCase()] = x.id; });
        res[1].forEach(function (x) { leagues[x.name.trim().toLowerCase()] = x.id; });
        res[2].forEach(function (x) { clubs[x.club_name.trim().toLowerCase()] = x.club_name; });
        res[3].forEach(function (m) { existing[[m.season_id, m.league_id, String(m.home_team).trim().toLowerCase(), String(m.away_team).trim().toLowerCase(), String(m.match_date).slice(0, 10)].join('|')] = true; });
        var ok = [], problems = [], skipped = 0, seen = {};
        table.slice(1).forEach(function (cells, idx) {
          var line = idx + 2, g = {};
          head.forEach(function (h, i) { g[h] = (cells[i] || '').trim(); });
          var bad = [];
          var seasonId = seasons[(g.season || '').toLowerCase()], leagueId = leagues[(g.league || '').toLowerCase()];
          if (!seasonId) bad.push('season "' + g.season + '" is not in the app');
          if (!leagueId) bad.push('league "' + g.league + '" is not in the app');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date || '')) bad.push('date must look like 2026-01-10');
          var time = g.time || '15:00';
          if (!/^\d{2}:\d{2}$/.test(time)) bad.push('time must look like 15:00');
          var home = clubs[(g.home_team || '').toLowerCase()], away = clubs[(g.away_team || '').toLowerCase()];
          if (!home) bad.push('home club "' + g.home_team + '" is not in the club list');
          if (!away) bad.push('away club "' + g.away_team + '" is not in the club list');
          if (home && away && home === away) bad.push('home and away clubs are the same');
          var hs = g.home_score === '' ? null : Number(g.home_score), as = g.away_score === '' ? null : Number(g.away_score);
          if ((hs !== null && (!Number.isInteger(hs) || hs < 0)) || (as !== null && (!Number.isInteger(as) || as < 0))) bad.push('scores must be whole numbers');
          var status = (g.status || '').toUpperCase() || (hs !== null && as !== null ? 'FT' : 'SCHEDULED');
          if (status !== 'FT' && status !== 'SCHEDULED') bad.push('status must be FT or SCHEDULED');
          if (status === 'FT' && (hs === null || as === null)) bad.push('a finished match needs both scores');
          if (status === 'SCHEDULED' && (hs !== null || as !== null)) bad.push('a scheduled match cannot have scores');
          if (bad.length) { problems.push('Row ' + line + ': ' + bad.join('; ')); return; }
          var key = [seasonId, leagueId, home.toLowerCase(), away.toLowerCase(), g.date].join('|');
          if (existing[key] || seen[key]) { skipped += 1; return; }
          seen[key] = true;
          ok.push({ home_team: home, away_team: away, match_date: g.date + 'T' + time + ':00Z', venue: g.venue || null,
            season_id: seasonId, league_id: leagueId, home_score: status === 'FT' ? hs : null, away_score: status === 'FT' ? as : null, match_status: status });
        });
        impRows = ok;
        var html = '<p><strong>' + ok.length + ' ready to import</strong>' + (skipped ? ', ' + skipped + ' already in the app and skipped' : '') + (problems.length ? ', ' + problems.length + ' with problems that need fixing first' : '') + '.</p>';
        if (problems.length) html += '<ul>' + problems.slice(0, 30).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + (problems.length > 30 ? '<p>…and ' + (problems.length - 30) + ' more.</p>' : '');
        box.innerHTML = html;
        $('impGo').disabled = ok.length === 0 || problems.length > 0;
      });
    };
    reader.readAsText(f);
  }
  function impGo() {
    if (!impRows.length) return;
    var go = $('impGo'), total = impRows.length, done = 0, failed = 0, i = 0;
    go.disabled = true;
    function next() {
      if (i >= total) {
        $('impPreview').textContent = 'Imported ' + done + ' of ' + total + ' matches' + (failed ? '. ' + failed + ' could not be saved.' : '.');
        msg('Import finished. Check the results in the admin list.');
        loadMatchesForResult();
        return;
      }
      var chunk = impRows.slice(i, i + 50); i += 50;
      db.from('matches').insert(chunk).then(function (r) {
        if (r.error) failed += chunk.length; else done += chunk.length;
        $('impPreview').textContent = 'Importing… ' + Math.min(i, total) + ' of ' + total;
        next();
      });
    }
    next();
  }
  var impWired = false;
  // Document-level handlers, attached once, so they keep working when the panel is redrawn.
  function wireImport() {
    if (impWired) return; impWired = true;
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('#impTemplate, #impCheck, #impGo') : null;
      if (!t) return;
      if (t.id === 'impTemplate') { e.preventDefault(); impTemplate(); }
      else if (t.id === 'impCheck') impCheck();
      else if (t.id === 'impGo') impGo();
    });
    document.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'impFile') { impRows = []; if ($('impGo')) $('impGo').disabled = true; if ($('impPreview')) $('impPreview').textContent = ''; }
    });
  }

  // Audit log (Super Admin only). The database reads the existing audit tables; this page only shows them.
  var auditRows = [];
  function loadAuditLog() {
    wireAudit();
    var list = $('auditList'); if (!list) return;
    list.textContent = 'Loading…';
    Promise.all([
      db.rpc('admin_audit_feed', { p_days: Number($('auDays').value) || 90, p_limit: 200 }),
      db.rpc('admin_activity_audit_feed', { p_days: Number($('auDays').value) || 90, p_limit: 300 })
    ]).then(function (results) {
      if (results[0].error) { list.textContent = 'The audit log could not be loaded.'; return; }
      auditRows = (results[0].data || []).concat(results[1].error ? [] : (results[1].data || []))
        .sort(function(a,b){return new Date(b.at)-new Date(a.at);}).slice(0,500);
      var area = $('auArea'), keep = area.value, areas = {};
      auditRows.forEach(function (x) { areas[x.area] = true; });
      area.innerHTML = '<option value="">All areas</option>' + Object.keys(areas).sort().map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('');
      if (keep && areas[keep]) area.value = keep;
      renderAudit();
    });
  }
  function renderAudit() {
    var list = $('auditList'); if (!list) return;
    var chosen = $('auArea').value;
    var rows = auditRows.filter(function (x) { return !chosen || x.area === chosen; });
    list.innerHTML = rows.length ? rows.map(function (x) {
      var when = new Date(x.at).toLocaleString('en-GB', { timeZone: 'Africa/Freetown', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<div class="post"><strong>' + esc(x.area) + '</strong> · ' + esc(x.action) + '<div class="muted">' + esc(when) + ' · ' + esc(x.actor) + '</div>' +
        (x.summary ? '<p>' + esc(x.summary) + '</p>' : '') + (x.reason ? '<p class="muted">Reason: ' + esc(x.reason) + '</p>' : '') + '</div>';
    }).join('') : 'No changes in this period.';
  }
  var auditWired = false;
  function wireAudit() {
    if (auditWired) return; auditWired = true;
    document.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'auDays') loadAuditLog();
      if (e.target && e.target.id === 'auArea') renderAudit();
    });
  }

  // Staff can export their own data. The protected platform owner does not
  // receive the Super Admin deletion-request workflow.
  function accountPrivacy() {
    var b = $('roleTools'); if (!b || $('accountPrivacy')) return;
    db.auth.getUser().then(function (u) {
      if (!u || u.error || !u.data || !u.data.user) return;
      var sec = document.createElement('div');
      sec.id = 'accountPrivacy';
      sec.innerHTML = '<h2 class="rt">My account data</h2>' +
        '<p class="muted">Download a copy of the account details the app holds for you.</p>' +
        '<div class="btns"><button class="secondary" id="apDownload">Download my account data (JSON)</button></div>' +
        '<div id="apStatus" class="muted" role="status"></div>';
      b.appendChild(sec);
      function say(t) { $('apStatus').textContent = t; }
      $('apDownload').addEventListener('click', function () {
        say('Preparing your copy…');
        db.rpc('staff_my_data').then(function (r) {
          if (r.error) { say('Your data could not be prepared right now.'); return; }
          var out = Object.assign({ exported_at: new Date().toISOString() }, r.data || {});
          var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'slfa-my-account-data.json';
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          say('Your copy has been saved to this device.');
        });
      });

    });
  }

  function loadFanReports() {
    var box = $('fanReports'); if (!box) return;
    var labels = { WRONG_SCORE: 'Wrong score', WRONG_PLAYER: 'Wrong or missing player', OTHER: 'Something else' };
    db.from('fan_reports').select('id, report_type, message, created_at, matches(home_team, away_team)').eq('status', 'OPEN').order('created_at', { ascending: true }).limit(100)
      .then(function (r) {
        if (r.error) { box.textContent = 'Reports could not be loaded.'; return; }
        var rows = r.data || [];
        box.innerHTML = rows.length ? rows.map(function (x) {
          var m = x.matches || {};
          return '<div class="post"><strong>' + esc(labels[x.report_type] || x.report_type) + '</strong>' +
            (m.home_team ? ' · ' + esc(m.home_team) + ' v ' + esc(m.away_team) : '') +
            '<p>' + esc(x.message) + '</p>' +
            '<div class="btns"><button class="primary" data-report-resolve="' + x.id + '">Mark resolved</button></div></div>';
        }).join('') : 'No open reports.';
        box.querySelectorAll('[data-report-resolve]').forEach(function (b) {
          b.addEventListener('click', function () {
            db.from('fan_reports').update({ status: 'RESOLVED', resolved_at: new Date().toISOString() }).eq('id', Number(b.dataset.reportResolve)).then(function (res) {
              msg(res.error ? res.error.message : 'Report marked resolved.'); loadFanReports(); });
          });
        });
      });
  }

  // Fan comments wait here until approved. Approved comments appear on the match details.
  // Usage counts from the privacy-light event log (Super Admins and Developers only)
  var usageLabels = { app_open: 'App opened', tab_matches: 'Matches tab', tab_table: 'Table tab', tab_teams: 'Teams tab', tab_players: 'Players tab', tab_news: 'News tab', tab_videos: 'Videos tab', tab_predict: 'Predict tab', language_en: 'English chosen', language_fr: 'French chosen', language_kri: 'Krio chosen', theme_light: 'Light mode on', theme_dark: 'Dark mode on', favourite_club: 'Favourite club changed', match_details: 'Match details opened', prediction: 'Predictions sent', fan_comment: 'Fan comments sent', fan_report: 'Problem reports sent' };
  function loadUsage() {
    var box = $('usageCounts'); if (!box) return;
    db.rpc('analytics_summary', { p_days: 30 }).then(function (r) {
      if (r.error) { var p = $('usagePanel'); if (p) p.remove(); return; }
      var totals = {};
      (r.data || []).forEach(function (x) { totals[x.event_name] = (totals[x.event_name] || 0) + Number(x.total); });
      var keys = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });
      box.innerHTML = keys.length
        ? '<table class="table"><tbody>' + keys.map(function (k) { return '<tr><td>' + esc(usageLabels[k] || k) + '</td><td><strong>' + esc(totals[k]) + '</strong></td></tr>'; }).join('') + '</tbody></table>'
        : 'No usage recorded yet.';
    });
  }
  function loadPendingComments() {
    var box = $('pendingComments'); if (!box) return;
    db.from('match_comments').select('id, fan_name, body, created_at, matches(home_team, away_team)').eq('status', 'PENDING').order('created_at', { ascending: true }).limit(100)
      .then(function (r) {
        if (r.error) { box.textContent = 'Comments could not be loaded.'; return; }
        var rows = r.data || [];
        box.innerHTML = rows.length ? rows.map(function (x) {
          var m = x.matches || {};
          return '<div class="post"><strong>' + esc(x.fan_name) + '</strong> on ' + esc(m.home_team || '') + ' v ' + esc(m.away_team || '') +
            '<p>' + esc(x.body) + '</p>' +
            '<div class="btns"><button class="primary" data-comment-approve="' + x.id + '">Approve</button><button class="secondary" data-comment-reject="' + x.id + '">Reject</button></div></div>';
        }).join('') : 'No comments waiting.';
        box.querySelectorAll('[data-comment-approve]').forEach(function (b) {
          b.addEventListener('click', function () {
            db.from('match_comments').update({ status: 'APPROVED', reviewed_at: new Date().toISOString() }).eq('id', Number(b.dataset.commentApprove)).then(function (res) {
              msg(res.error ? res.error.message : 'Comment approved.'); loadPendingComments(); });
          });
        });
        box.querySelectorAll('[data-comment-reject]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Reject this comment? It will not be shown.')) return;
            db.from('match_comments').update({ status: 'REJECTED', reviewed_at: new Date().toISOString() }).eq('id', Number(b.dataset.commentReject)).then(function (res) {
              msg(res.error ? res.error.message : 'Comment rejected.'); loadPendingComments(); });
          });
        });
      });
  }

  // Live match: start, record events, end (end saves the score to the table)
  var liveMatch = null;
  function wireLive() {
    loadLiveOptions();
    $('lvMatch').addEventListener('change', function () { liveMatch = null; loadLiveMatch(this.value); });
  }
  var liveEvents = [];
  function goalsFor(team) { return liveEvents.filter(function (e) { return e.event_type === 'GOAL' && e.team_name === team; }).length; }
  function loadLiveOptions() {
    db.from('matches').select('id, home_team, away_team, match_status, match_date').order('match_date', { ascending: false }).limit(60)
      .then(function (r) {
        var rows = r.data || [];
        var cur = $('lvMatch').value;
        $('lvMatch').innerHTML = '<option value="">Choose a match…</option>' + rows.map(function (m) {
          var tag = m.match_status === 'LIVE' ? ' · LIVE' : '';
          return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + tag + '</option>';
        }).join('');
        if (cur) $('lvMatch').value = cur;
      });
  }
  function loadLiveMatch(id) {
    if (!id) { $('lvPanel').classList.add('hidden'); return; }
    db.from('matches').select('id, home_team, away_team, match_status').eq('id', id).maybeSingle().then(function (r) {
      liveMatch = r.data;
      if (!liveMatch) return;
      $('lvPanel').classList.toggle('hidden', liveMatch.match_status !== 'LIVE' && liveMatch.match_status !== 'HT');
      db.from('match_events').select('event_type, team_name, player_name, minute').eq('match_id', String(id)).order('minute', { ascending: true })
        .then(function (e) { liveEvents = e.data || []; });
    });
  }

  // Season helpers for the Super Admin forms. Matches saved without a season count toward the season their date falls in.
  var seasonCache = [];
  function seasonOfMatch(m) {
    if (m.season_id != null) return String(m.season_id);
    var d = String(m.match_date || '').slice(0, 10);
    var hit = seasonCache.filter(function (x) { return d >= String(x.start_date) && d <= String(x.end_date); })[0];
    return hit ? String(hit.id) : '';
  }
  function loadSeasonAdmin() {
    db.from('seasons').select('id, name, start_date, end_date, is_current').order('start_date', { ascending: false }).then(function (r) {
      if (r.error) { if ($('seasonList')) $('seasonList').textContent = 'Seasons could not be loaded.'; return; }
      seasonCache = r.data || [];
      var current = seasonCache.filter(function (x) { return x.is_current; })[0] || null;
      var opts = seasonCache.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + (x.is_current ? ' (current)' : '') + '</option>'; }).join('');
      ['fxSeason', 'resSeason'].forEach(function (id) {
        var el = $(id); if (!el) return;
        el.innerHTML = (id === 'resSeason' ? '<option value="">All seasons</option>' : '<option value="">Choose a season…</option>') + opts;
        if (current) el.value = String(current.id);
      });
      var histSeason = $('histSeason');
      if (histSeason) {
        var previousHistSeason = histSeason.value;
        var pastSeasons = seasonCache.filter(function (x) { return !x.is_current; });
        histSeason.innerHTML = '<option value="">Choose a past season…</option>' + pastSeasons.map(function (x) {
          return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>';
        }).join('');
        if (pastSeasons.some(function (x) { return String(x.id) === String(previousHistSeason); })) histSeason.value = previousHistSeason;
      }
      var list = $('seasonList');
      if (list) {
        list.innerHTML = seasonCache.length ? seasonCache.map(function (x) {
          return '<div class="post"><strong>' + esc(x.name) + '</strong>' + (x.is_current ? ' · <span>Current season</span>' : '') +
            '<div class="muted">' + esc(x.start_date) + ' to ' + esc(x.end_date) + '</div>' +
            (x.is_current ? '' : '<div class="btns"><button class="secondary" data-season-current="' + esc(x.id) + '">Make current</button></div>') + '</div>';
        }).join('') : 'No seasons yet.';
        list.querySelectorAll('[data-season-current]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!window.confirm('Make this the current season? The live table will be recalculated from it.')) return;
            db.rpc('set_current_season', { p_season_id: Number(b.dataset.seasonCurrent) }).then(function (res) {
              msg(res.error ? res.error.message : 'Current season changed. The live table has been recalculated.');
              loadSeasonAdmin(); loadMatchesForResult();
            });
          });
        });
      }
      loadMatchesForResult();
    });
  }
  // Historical final tables are stored separately from the automatically calculated live table.
  var HIST_STANDINGS_HEADERS = ['position','club','played','won','drawn','lost','goals_for','goals_against','points'];
  var histCsvRows = [];
  function validateHistoricalRows(rows) {
    var problems = [], clubs = {}, positions = {};
    if (!rows.length) problems.push('Add at least one club row.');
    if (rows.length > 100) problems.push('A historical table can contain no more than 100 clubs.');
    rows.forEach(function (x, index) {
      var line = index + 1, club = String(x.club || '').trim();
      if (!club) problems.push('Row ' + line + ': enter a club name.');
      else {
        var clubKey = club.toLowerCase();
        if (clubs[clubKey]) problems.push('Row ' + line + ': ' + club + ' appears more than once.');
        clubs[clubKey] = true;
      }
      ['pos','mp','w','d','l','gf','ga','pts'].forEach(function (key) {
        if (!Number.isInteger(x[key]) || x[key] < (key === 'pos' ? 1 : 0)) {
          problems.push('Row ' + line + ': ' + key.toUpperCase() + ' must be a ' + (key === 'pos' ? 'positive' : 'non-negative') + ' whole number.');
        }
      });
      if (Number.isInteger(x.mp) && Number.isInteger(x.w) && Number.isInteger(x.d) && Number.isInteger(x.l) && x.mp !== x.w + x.d + x.l) {
        problems.push('Row ' + line + ': played must equal wins + draws + losses.');
      }
      if (Number.isInteger(x.pos)) {
        if (positions[x.pos]) problems.push('Row ' + line + ': position ' + x.pos + ' is used more than once.');
        positions[x.pos] = true;
      }
    });
    return problems;
  }
  function historicalRowMarkup(x) {
    x = x || {};
    function field(name, value, min) {
      return '<input type="number" min="' + min + '" step="1" inputmode="numeric" data-hist-field="' + name + '" value="' + esc(value == null ? 0 : value) + '" aria-label="' + name.toUpperCase() + '">';
    }
    return '<tr data-hist-row><td>' + field('pos', x.pos == null ? 1 : x.pos, 1) + '</td>' +
      '<td><input type="text" maxlength="120" data-hist-field="club" value="' + esc(x.club || '') + '" aria-label="Club name"></td>' +
      '<td>' + field('mp', x.mp, 0) + '</td><td>' + field('w', x.w, 0) + '</td><td>' + field('d', x.d, 0) + '</td><td>' + field('l', x.l, 0) + '</td>' +
      '<td>' + field('gf', x.gf, 0) + '</td><td>' + field('ga', x.ga, 0) + '</td><td>' + field('pts', x.pts, 0) + '</td>' +
      '<td><button type="button" class="secondary hist-remove-row" aria-label="Remove club row">Remove</button></td></tr>';
  }
  function renderHistoricalRows(rows) {
    var host = $('histRows'); if (!host) return;
    host.innerHTML = (rows.length ? rows : [{}]).map(historicalRowMarkup).join('');
  }
  function loadHistoricalStandingsRows() {
    var leagueId = $('histLeague') && $('histLeague').value;
    var seasonId = $('histSeason') && $('histSeason').value;
    var host = $('histRows'), status = $('histManualMsg');
    histCsvRows = [];
    if ($('histImport')) $('histImport').disabled = true;
    if ($('histCsvPreview')) $('histCsvPreview').textContent = '';
    if (!leagueId || !seasonId) {
      if (host) host.innerHTML = '<tr><td colspan="10">Choose a league and past season, then load the table.</td></tr>';
      if (status) status.textContent = 'Select both a league and a past season.';
      return;
    }
    if (host) host.innerHTML = '<tr><td colspan="10">Loading historical table…</td></tr>';
    if (status) status.textContent = 'Loading saved table and club list…';
    Promise.all([
      db.from('season_standings').select('pos,club,mp,w,d,l,gf,ga,pts').eq('season_id', Number(seasonId)).eq('league_id', Number(leagueId)).order('pos', { ascending: true }),
      db.from('league_clubs').select('club_name,is_active').eq('league_id', Number(leagueId)).order('club_name', { ascending: true })
    ]).then(function (all) {
      if (all[0].error) {
        if (host) host.innerHTML = '<tr><td colspan="10">Historical table storage is not ready. The Super Admin database migration must be applied first.</td></tr>';
        if (status) status.textContent = 'Could not load historical standings: ' + all[0].error.message;
        return;
      }
      var saved = all[0].data || [];
      var clubs = all[1].error ? [] : (all[1].data || []).filter(function (x) { return x.is_active; });
      var rows = saved.length ? saved : clubs.map(function (x, index) {
        return { pos: index + 1, club: x.club_name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      });
      renderHistoricalRows(rows);
      if (status) status.textContent = saved.length
        ? 'Loaded ' + saved.length + ' saved club record(s). You can edit the table before saving.'
        : 'No table is saved for this season yet. Active clubs have been added as a starting list; enter their final figures.';
    }).catch(function (error) {
      if (host) host.innerHTML = '<tr><td colspan="10">Could not load the historical table.</td></tr>';
      if (status) status.textContent = error.message || 'Historical table could not be loaded.';
    });
  }
  function collectManualHistoricalRows() {
    var host = $('histRows'), rows = [];
    if (!host) return rows;
    host.querySelectorAll('[data-hist-row]').forEach(function (tr) {
      var row = {};
      tr.querySelectorAll('[data-hist-field]').forEach(function (el) {
        var key = el.getAttribute('data-hist-field');
        row[key] = key === 'club' ? el.value.trim() : (el.value.trim() === '' ? NaN : Number(el.value));
      });
      rows.push(row);
    });
    return rows;
  }
  function saveHistoricalStandings(rows, source) {
    var leagueId = $('histLeague') && $('histLeague').value;
    var seasonId = $('histSeason') && $('histSeason').value;
    var status = $('histManualMsg');
    if (!leagueId || !seasonId) { if (status) status.textContent = 'Choose a league and a past season first.'; return; }
    var problems = validateHistoricalRows(rows);
    if (problems.length) {
      if (status) status.textContent = problems.slice(0, 12).join(' ');
      return;
    }
    if (!confirm('Save ' + rows.length + ' club record(s) for this past season? This replaces the saved historical table for this league and season only.')) return;
    var manualButton = $('histSave'), importButton = $('histImport');
    if (manualButton) manualButton.disabled = true;
    if (importButton) importButton.disabled = true;
    if (status) status.textContent = 'Saving historical standings…';
    db.rpc('admin_save_season_standings', {
      p_season_id: Number(seasonId),
      p_league_id: Number(leagueId),
      p_rows: rows
    }).then(function (r) {
      if (manualButton) manualButton.disabled = false;
      if (importButton) importButton.disabled = !histCsvRows.length;
      if (r.error) { if (status) status.textContent = r.error.message; return; }
      if (status) status.textContent = (source === 'csv' ? 'CSV import complete. ' : 'Manual table saved. ') + Number(r.data || rows.length) + ' club record(s) published for this past season.';
      loadHistoricalStandingsRows();
    }).catch(function (error) {
      if (manualButton) manualButton.disabled = false;
      if (importButton) importButton.disabled = !histCsvRows.length;
      if (status) status.textContent = error.message || 'Historical standings could not be saved.';
    });
  }
  function historicalStandingsTemplate() {
    var sample = ['1','Bo Rangers','30','20','7','3','55','18','67'];
    var csv = HIST_STANDINGS_HEADERS.join(',') + '\n' + sample.join(',') + '\n';
    saveFile('slfa-historical-standings-template.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }
  function checkHistoricalStandingsCsv() {
    var file = $('histCsvFile').files && $('histCsvFile').files[0];
    var preview = $('histCsvPreview'), button = $('histImport');
    histCsvRows = []; button.disabled = true;
    if (!file) { preview.textContent = 'Choose a CSV file first.'; return; }
    if (!$('histLeague').value || !$('histSeason').value) { preview.textContent = 'Choose a league and past season first.'; return; }
    preview.textContent = 'Checking CSV…';
    var reader = new FileReader();
    reader.onload = function () {
      var table = parseCsv(String(reader.result || ''));
      if (table.length < 2) { preview.textContent = 'The file needs a header row and at least one club row.'; return; }
      var head = table[0].map(function (h) { return String(h).replace(/^\uFEFF/, '').trim().toLowerCase(); });
      var missing = HIST_STANDINGS_HEADERS.filter(function (h) { return head.indexOf(h) < 0; });
      if (missing.length) { preview.textContent = 'Missing CSV column(s): ' + missing.join(', ') + '.'; return; }
      var rows = table.slice(1).map(function (cells) {
        var item = {};
        head.forEach(function (h, index) { item[h] = (cells[index] || '').trim(); });
        return {
          pos: item.position === '' ? NaN : Number(item.position),
          club: item.club,
          mp: item.played === '' ? NaN : Number(item.played),
          w: item.won === '' ? NaN : Number(item.won),
          d: item.drawn === '' ? NaN : Number(item.drawn),
          l: item.lost === '' ? NaN : Number(item.lost),
          gf: item.goals_for === '' ? NaN : Number(item.goals_for),
          ga: item.goals_against === '' ? NaN : Number(item.goals_against),
          pts: item.points === '' ? NaN : Number(item.points)
        };
      });
      var problems = validateHistoricalRows(rows);
      if (problems.length) {
        preview.innerHTML = '<p>CSV check found ' + problems.length + ' issue(s). Correct the file and check it again.</p><ul>' +
          problems.slice(0, 30).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
          '</ul>' + (problems.length > 30 ? '<p>And ' + (problems.length - 30) + ' more issue(s).</p>' : '');
        return;
      }
      histCsvRows = rows;
      preview.textContent = rows.length + ' club row(s) passed validation. Select Import standings to publish this historical table.';
      button.disabled = false;
    };
    reader.onerror = function () { preview.textContent = 'The CSV file could not be read.'; };
    reader.readAsText(file);
  }
  function wireHistoricalStandings() {
    if (!$('histLeague') || !$('histSeason')) return;
    $('histLeague').addEventListener('change', loadHistoricalStandingsRows);
    $('histSeason').addEventListener('change', loadHistoricalStandingsRows);
    $('histLoad').addEventListener('click', loadHistoricalStandingsRows);
    $('histTemplate').addEventListener('click', historicalStandingsTemplate);
    $('histCheck').addEventListener('click', checkHistoricalStandingsCsv);
    $('histImport').addEventListener('click', function () {
      if (histCsvRows.length) saveHistoricalStandings(histCsvRows, 'csv');
    });
    $('histSave').addEventListener('click', function () {
      saveHistoricalStandings(collectManualHistoricalRows(), 'manual');
    });
    $('histAddRow').addEventListener('click', function () {
      var rows = collectManualHistoricalRows(), next = rows.reduce(function (n, x) {
        return Math.max(n, Number.isInteger(x.pos) ? x.pos : 0);
      }, 0) + 1;
      var host = $('histRows');
      if (host && host.querySelector('[data-hist-row]')) host.insertAdjacentHTML('beforeend', historicalRowMarkup({ pos: next }));
      else renderHistoricalRows([{ pos: next }]);
    });
    $('histRows').addEventListener('click', function (event) {
      var remove = event.target.closest && event.target.closest('.hist-remove-row');
      if (!remove) return;
      var row = remove.closest('[data-hist-row]');
      if (row) row.remove();
    });
  }

  function loadMatchesForResult() {
    db.from('matches').select('id, match_date, season_id, home_team, away_team, home_score').order('match_date', { ascending: false }).limit(500)
      .then(function (r) {
        var chosen = $('resSeason') ? $('resSeason').value : '';
        var rows = (r.data || []).filter(function (m) { return !chosen || seasonOfMatch(m) === chosen; }).slice(0, 120);
        $('resMatch').innerHTML = '<option value="">Choose a match…</option>' + rows.map(function (m) {
          return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + (m.home_score != null ? ' (' + m.home_score + ' – ' + m.away_score + ')' : '') + '</option>';
        }).join('');
      });
  }

  function loadStatusOptions() {
    db.from('matches').select('id, home_team, away_team, match_status').order('match_date', { ascending: false }).limit(60).then(function (r) {
      $('msMatch').innerHTML = '<option value="">Choose a match…</option>' + (r.data || []).map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + ' · ' + esc(m.match_status) + '</option>';
      }).join('');
    });
  }
  function wireCompetitionAdmin() {
    var rows = [];
    var edit = $('coEdit');
    if (!edit || !$('coSave') || !$('coNew') || !$('competitionAdminList')) return;
    function resetForm() {
      edit.value = '';
      $('coName').value = '';
      $('coType').value = 'LEAGUE';
      $('coGender').value = 'OPEN';
      $('coDescription').value = '';
      $('coLogo').value = '';
      $('coSort').value = '10';
      $('coActive').checked = true;
      $('coSave').textContent = 'Save competition';
    }
    function load() {
      db.from('leagues').select('id,name,competition_type,gender_category,description,logo_url,sort_order,is_active').order('sort_order').then(function (r) {
        if (r.error) { msg('Competition list could not be loaded: ' + r.error.message); return; }
        rows = r.data || [];
        edit.innerHTML = '<option value="">Create a new competition</option>' + rows.map(function (x) {
          return '<option value="' + esc(x.id) + '">' + esc(x.name) + (x.is_active ? '' : ' · unpublished') + '</option>';
        }).join('');
        $('competitionAdminList').innerHTML = rows.length ? '<div class="scroll"><table class="table"><thead><tr><th>Competition</th><th>Type</th><th>Status</th></tr></thead><tbody>' +
          rows.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.competition_type || 'LEAGUE') + '</td><td>' + (x.is_active ? 'Published' : 'Unpublished') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '<p class="muted">No competitions have been created yet.</p>';
      });
    }
    edit.addEventListener('change', function () {
      var row = rows.find(function (x) { return String(x.id) === String(edit.value); });
      if (!row) { resetForm(); return; }
      $('coName').value = row.name || '';
      $('coType').value = row.competition_type || 'LEAGUE';
      $('coGender').value = row.gender_category || 'OPEN';
      $('coDescription').value = row.description || '';
      $('coLogo').value = row.logo_url || '';
      $('coSort').value = row.sort_order == null ? 10 : row.sort_order;
      $('coActive').checked = !!row.is_active;
      $('coSave').textContent = 'Update competition';
    });
    $('coNew').addEventListener('click', resetForm);
    $('coSave').addEventListener('click', function () {
      var name = $('coName').value.trim();
      var sort = parseInt($('coSort').value, 10);
      if (name.length < 3) { msg('Enter a competition name of at least 3 characters.'); return; }
      if (!Number.isInteger(sort) || sort < 0) { msg('Display order must be a whole number of zero or more.'); return; }
      var selected = edit.value ? Number(edit.value) : null;
      $('coSave').disabled = true;
      db.rpc('admin_upsert_competition', {
        p_id: selected,
        p_name: name,
        p_type: $('coType').value,
        p_gender: $('coGender').value,
        p_description: $('coDescription').value.trim() || null,
        p_logo_url: $('coLogo').value.trim() || null,
        p_sort_order: sort,
        p_is_active: $('coActive').checked
      }).then(function (r) {
        $('coSave').disabled = false;
        if (r.error) { msg('Could not save competition: ' + r.error.message); return; }
        msg(selected ? 'Competition updated.' : 'Competition created and ready for clubs and fixtures.');
        resetForm();
        load();
        if ($('fxLeague')) loadLeagueOptions();
        if ($('clubAdminList')) loadClubAdmin();
      }).catch(function (e) {
        $('coSave').disabled = false;
        msg('Could not save competition: ' + (e && e.message ? e.message : 'Unknown error.'));
      });
    });
    load();
  }

  function wireCupAdmin() {
    var edit=$('cupTieEdit'); if(!edit||!$('cupTieSave')) return;
    var ties=[], matches=[];
    function status(t){$('cupTieMsg').textContent=t;}
    function reset(){edit.value='';$('cupRound').value='';$('cupTieNumber').value='1';$('cupNextTie').value='';$('cupNextSlot').value='HOME';$('cupTieSave').textContent='Save cup tie';}
    function loadTies(){
      db.from('cup_ties').select('id,competition_id,season_id,match_id,round_name,tie_number,next_tie_id,next_slot,winner_team,advanced_at,matches(home_team,away_team,match_status,home_score,away_score)').order('competition_id').order('round_name').order('tie_number').then(function(r){
        if(r.error){status('Cup bracket is not ready yet. Run the knockout cup SQL migration first.');return;}
        ties=r.data||[];
        edit.innerHTML='<option value="">Create a new tie</option>'+ties.map(function(t){var m=t.matches||{};return '<option value="'+esc(t.id)+'">'+esc(t.round_name)+' · Tie '+esc(t.tie_number)+' · '+esc(m.home_team||'TBC')+' v '+esc(m.away_team||'TBC')+'</option>';}).join('');
        $('cupNextTie').innerHTML='<option value="">No next tie / Final</option>'+ties.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(t.round_name)+' · Tie '+esc(t.tie_number)+'</option>';}).join('');
        $('cupTieList').innerHTML=ties.length?ties.map(function(t){
          var m=t.matches||{},done=m.home_score!=null&&m.away_score!=null;
          var options='<option value="">Choose winner…</option>'+[m.home_team,m.away_team].filter(Boolean).map(function(n){return '<option value="'+esc(n)+'" '+(t.winner_team===n?'selected':'')+'>'+esc(n)+'</option>';}).join('');
          return '<div class="post"><strong>'+esc(t.round_name)+' · Tie '+esc(t.tie_number)+'</strong><div class="muted">'+esc(m.home_team||'TBC')+' '+(done?esc(m.home_score)+'–'+esc(m.away_score):'v')+' '+esc(m.away_team||'TBC')+' · '+esc(m.match_status||'Scheduled')+'</div>'+
            (t.winner_team?'<p>Winner: '+esc(t.winner_team)+(t.advanced_at?' · advanced':'')+'</p>':'')+
            '<label>Official winner</label><select data-cup-winner="'+esc(t.id)+'">'+options+'</select><div class="btns"><button type="button" class="small" data-cup-advance="'+esc(t.id)+'">Confirm winner and advance</button></div></div>';
        }).join(''):'No cup ties have been configured yet.';
        $('cupTieList').querySelectorAll('[data-cup-advance]').forEach(function(b){b.addEventListener('click',function(){
          var id=b.getAttribute('data-cup-advance'),sel=$('cupTieList').querySelector('[data-cup-winner="'+id+'"]'),winner=sel&&sel.value;
          if(!winner){status('Choose the officially confirmed winner first.');return;}
          if(!confirm('Advance '+winner+' to the next round? This updates the linked next-round fixture.'))return;
          b.disabled=true;db.rpc('admin_advance_cup_tie',{p_tie_id:Number(id),p_winner_team:winner}).then(function(x){b.disabled=false;if(x.error){status(x.error.message);return;}status('Winner confirmed and advanced.');loadTies();});
        });});
      });
    }
    function loadCupMatches(){
      var comp=$('cupCompetition').value,season=$('cupSeason').value;
      $('cupMatch').innerHTML='<option value="">Loading fixtures…</option>';
      if(!comp){$('cupMatch').innerHTML='<option value="">Choose a cup first…</option>';return;}
      db.from('matches').select('id,home_team,away_team,match_date,season_id').eq('league_id',Number(comp)).order('match_date').limit(500).then(function(r){
        matches=r.data||[];
        if(season)matches=matches.filter(function(m){return String(m.season_id||'')===String(season);});
        $('cupMatch').innerHTML='<option value="">Choose a fixture…</option>'+matches.map(function(m){return '<option value="'+esc(m.id)+'">'+esc(m.home_team)+' v '+esc(m.away_team)+' · '+esc(new Date(m.match_date).toLocaleDateString())+'</option>';}).join('');
      });
    }
    db.from('leagues').select('id,name').eq('is_active',true).eq('competition_type','CUP').order('sort_order').then(function(r){
      $('cupCompetition').innerHTML='<option value="">Choose cup…</option>'+(r.data||[]).map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>';}).join('');
    });
    db.from('seasons').select('id,name,is_current').order('start_date',{ascending:false}).then(function(r){
      $('cupSeason').innerHTML='<option value="">All seasons / no season</option>'+(r.data||[]).map(function(x){return '<option value="'+esc(x.id)+'" '+(x.is_current?'selected':'')+'>'+esc(x.name)+'</option>';}).join('');
    });
    $('cupCompetition').addEventListener('change',loadCupMatches);
    $('cupSeason').addEventListener('change',loadCupMatches);
    edit.addEventListener('change',function(){
      var t=ties.find(function(x){return String(x.id)===String(edit.value);});if(!t){reset();return;}
      $('cupCompetition').value=String(t.competition_id);$('cupSeason').value=t.season_id?String(t.season_id):'';
      loadCupMatches();window.setTimeout(function(){$('cupMatch').value=String(t.match_id);},250);
      $('cupRound').value=t.round_name;$('cupTieNumber').value=t.tie_number;
      $('cupNextTie').value=t.next_tie_id?String(t.next_tie_id):'';$('cupNextSlot').value=t.next_slot||'HOME';$('cupTieSave').textContent='Update cup tie';
    });
    $('cupTieNew').addEventListener('click',reset);
    $('cupTieSave').addEventListener('click',function(){
      var comp=$('cupCompetition').value,match=$('cupMatch').value,round=$('cupRound').value.trim(),num=parseInt($('cupTieNumber').value,10);
      if(!comp||!match||round.length<2||!Number.isInteger(num)||num<1){status('Choose the cup and fixture, then enter a round name and tie number.');return;}
      var selected=edit.value?Number(edit.value):null,next=$('cupNextTie').value?Number($('cupNextTie').value):null;
      $('cupTieSave').disabled=true;
      db.rpc('admin_save_cup_tie',{p_id:selected,p_competition_id:Number(comp),p_season_id:$('cupSeason').value?Number($('cupSeason').value):null,p_match_id:Number(match),p_round_name:round,p_tie_number:num,p_next_tie_id:next,p_next_slot:next?$('cupNextSlot').value:null}).then(function(r){
        $('cupTieSave').disabled=false;if(r.error){status(r.error.message);return;}status('Cup tie saved.');reset();loadTies();
      });
    });
    loadTies();
  }

  function loadLeagueOptions() {
    db.from('leagues').select('id, name, competition_type, is_active').order('sort_order').then(function (r) {
      var leagues = r.data || [];
      $('fxLeague').innerHTML = '<option value="">Choose the league…</option>' + leagues.filter(function (l) { return l.is_active; }).map(function (l) {
        return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>'; }).join('');
      if ($('histLeague')) {
        $('histLeague').innerHTML = '<option value="">Choose a league…</option>' + leagues.filter(function (l) {
          return String(l.competition_type || 'LEAGUE').toUpperCase() === 'LEAGUE';
        }).map(function (l) {
          return '<option value="' + esc(l.id) + '">' + esc(l.name) + (l.is_active ? '' : ' · archived competition') + '</option>';
        }).join('');
      }
    });
  }
  function wireClubs() {
    db.from('leagues').select('id, name').eq('is_active', true).order('sort_order').then(function (r) {
      $('clLeague').innerHTML = '<option value="">Choose the league…</option>' + (r.data || []).map(function (l) {
        return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>'; }).join('');
    });
    $('clAdd').addEventListener('click', function () {
      var name = $('clName').value.trim(), lg = $('clLeague').value;
      if (!name) { msg('Enter the club name.'); return; }
      if (!lg) { msg('Choose the league for this club.'); return; }
      db.from('league_clubs').insert({ club_name: name, league_id: Number(lg), logo_url: $('clLogo').value.trim() || null, is_active: true }).then(function (r) {
        if (r.error) { msg(r.error.message); return; }
        msg('Club added.'); $('clName').value = ''; $('clLogo').value = ''; loadClubAdmin();
      });
    });
    loadClubAdmin();
  }
  function loadClubAdmin() {
    Promise.all([
      db.from('leagues').select('id, name').eq('is_active', true).order('sort_order'),
      db.from('league_clubs').select('id, club_name, league_id, is_active').order('club_name')
    ]).then(function (all) {
      var leagues = all[0].data || [], clubs = all[1].data || [];
      function opts(sel) {
        return '<option value="">No league</option>' + leagues.map(function (l) {
          return '<option value="' + esc(l.id) + '"' + (String(l.id) === String(sel) ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('');
      }
      $('clubAdminList').innerHTML = clubs.length ? clubs.map(function (c) {
        return '<div class="post"><strong>' + esc(c.club_name) + '</strong>' + (c.is_active ? '' : ' <span class="muted">(inactive)</span>') +
          '<label>League</label><select data-club-league="' + esc(c.id) + '">' + opts(c.league_id) + '</select></div>';
      }).join('') : 'No clubs yet.';
      document.querySelectorAll('[data-club-league]').forEach(function (s) {
        s.addEventListener('change', function () {
          db.from('league_clubs').update({ league_id: s.value ? Number(s.value) : null }).eq('id', s.dataset.clubLeague).then(function (res) {
            msg(res.error ? res.error.message : 'League updated.');
          });
        });
      });
    });
  }

  // ---------- CLUB PROFILE CHANGE REVIEW: SUPER ADMIN ----------
  function loadClubProfileReview() {
    Promise.all([
      db.from('club_profile_change_requests').select('id, club_id, submitted_by_name, proposed_profile, submitted_at, status').eq('status', 'SUBMITTED').order('submitted_at', { ascending: true }),
      db.from('league_clubs').select('id, club_name')
    ]).then(function (all) {
      if (all[0].error) { $('clubProfileReview').textContent = all[0].error.message; return; }
      var rows = all[0].data || [], clubs = {};
      (all[1].data || []).forEach(function (c) { clubs[String(c.id)] = c.club_name; });
      $('clubProfileReview').innerHTML = rows.length ? rows.map(function (x) {
        var p = x.proposed_profile || {};
        return '<div class="post"><div class="muted">Submitted by ' + esc(x.submitted_by_name || 'Club Manager') + ' · ' + esc(new Date(x.submitted_at).toLocaleString()) + '</div>' +
          '<strong>' + esc(clubs[String(x.club_id)] || 'Club') + '</strong>' +
          '<p>Home ground: ' + esc(p.stadium || 'Not provided') + '<br>City: ' + esc(p.city || 'Not provided') +
          '<br>Year founded: ' + esc(p.founded_year || 'Not provided') + '</p><p>' + esc(p.about || 'No description provided') + '</p>' +
          '<label for="cprNote' + esc(x.id) + '">Review note (optional)</label><textarea id="cprNote' + esc(x.id) + '" rows="2" placeholder="Reason or guidance for the club"></textarea>' +
          '<div class="btns"><button class="primary" data-club-profile-approve="' + esc(x.id) + '">Approve & publish</button>' +
          '<button class="secondary" data-club-profile-return="' + esc(x.id) + '">Return for changes</button></div></div>';
      }).join('') : 'No club profile changes are waiting for approval.';
      document.querySelectorAll('[data-club-profile-approve]').forEach(function (b) {
        b.addEventListener('click', function () { reviewClubProfile(b.dataset.clubProfileApprove, 'APPROVE'); });
      });
      document.querySelectorAll('[data-club-profile-return]').forEach(function (b) {
        b.addEventListener('click', function () { reviewClubProfile(b.dataset.clubProfileReturn, 'RETURN'); });
      });
    });
  }
  function reviewClubProfile(id, decision) {
    var note = ($('cprNote' + id) || {}).value || '';
    if (decision === 'RETURN' && !note.trim()) { msg('Add a short reason before returning the profile.'); return; }
    var label = decision === 'APPROVE' ? 'Approve and publish this club profile?' : 'Return this profile to the Club Manager?';
    if (!confirm(label)) return;
    db.rpc('review_club_profile_change', { p_request_id: Number(id), p_decision: decision, p_note: note.trim() || null }).then(function (r) {
      if (r.error) { msg(r.error.message); return; }
      msg(decision === 'APPROVE' ? 'Club profile approved and published.' : 'Profile returned to the Club Manager.');
      loadClubProfileReview();
    });
  }

  function loadReview() {
    db.from('media_posts').select('id, title, category, body, image_url, video_url, created_by_name, submitted_at').eq('status', 'SUBMITTED').order('submitted_at', { ascending: true })
      .then(function (r) {
        var rows = r.data || [];
        $('reviewList').innerHTML = rows.length ? rows.map(function (p) {
          return '<article class="post"><div class="muted">' + esc(CAT_LABEL[p.category] || p.category) + ' · submitted by ' + esc(p.created_by_name || 'Media Officer') + '</div>' +
            (p.image_url ? '<img class="review-news-image" src="' + esc(p.image_url) + '" alt="">' : '') +
            '<strong>' + esc(p.title) + '</strong><p>' + esc(p.body || '') + '</p>' +
            (p.video_url ? '<p><a href="' + esc(p.video_url) + '" target="_blank" rel="noopener noreferrer">Review attached video ↗</a></p>' : '') +
            '<div class="muted">Submitted ' + esc(p.submitted_at ? new Date(p.submitted_at).toLocaleString() : 'date unavailable') + '</div>' +
            '<div class="btns"><button class="primary" data-pub="' + esc(p.id) + '">Approve &amp; publish</button><button class="secondary" data-ret="' + esc(p.id) + '">Return to author</button></div></article>';
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

  // ---------- DEVELOPER PANEL ----------
  var devUser = null;
  var ROLE_OPTIONS = [['REFEREE','Referee'],['MATCH_COMMISSIONER','Match Commissioner'],['MEDIA_OFFICER','Media Officer'],['DISCIPLINARY_OFFICER','Disciplinary Officer'],['SUPER_ADMIN','Super Admin / League Admin']];
  function developer(p) {
    devUser=p;
    box().innerHTML =
      '<section class="dev-overview" id="developerOverview"><h2 class="rt">Platform overview</h2><p class="muted">Live database totals and public app activity. Counts are loaded from the connected database.</p><div class="dev-metric-grid">'+[['devMetricAccounts','Accounts'],['devMetricMatches','Fixtures'],['devMetricClubs','Clubs'],['devMetricReports','Fan reports'],['devMetricNews','Media posts']].map(function(x){return '<article class="dev-metric"><span>'+x[1]+'</span><strong id="'+x[0]+'">—</strong></article>';}).join('')+'</div><div class="dev-activity"><strong>Last 30 days · public app activity</strong><div id="devMetricActivity" class="muted">Loading activity…</div></div><button class="secondary" type="button" id="devRefreshOverview">Refresh overview</button><div class="status" id="devOverviewStatus" role="status"></div></section>'+
      '<h2 class="rt">League operations</h2><div id="leagueState" class="muted">Checking…</div><div class="btns"><button class="secondary" id="pauseBtn">Pause league</button><button class="primary" id="resumeBtn">Resume league</button></div>'+
      '<h2 class="rt">Whole application</h2><div id="appState" class="muted">Checking…</div><div class="btns"><button class="secondary" id="freezeAppBtn">Freeze entire app</button><button class="primary" id="unfreezeAppBtn">Unfreeze entire app</button></div>'+
      '<h2 class="rt">Assign a role</h2><p class="muted">Full name, email (unique account ID), and a round photo selected from your phone gallery.</p>'+
      '<label for="ivName">Full name</label><input id="ivName" type="text" autocomplete="name">'+input('ivEmail','Email address','email')+
      '<label for="ivPhoto">Round profile photo</label><input id="ivPhoto" type="file" accept="image/jpeg,image/png,image/webp"><div id="ivPhotoPreview" class="muted">No photo selected.</div>'+
      '<label for="ivRole">Role</label><select id="ivRole">'+ROLE_OPTIONS.map(function(o){return '<option value="'+o[0]+'">'+esc(o[1])+'</option>';}).join('')+'</select>'+
      '<div class="btns"><button class="primary" id="ivSave">Save role</button></div>'+
      '<h2 class="rt">Pending role assignments</h2><div id="ivList" class="muted">Loading…</div>'+
      '<h2 class="rt">All accounts and roles</h2><p class="muted">Change roles, suspend, restore or delete accounts. Actions are logged automatically.</p><div id="roleList" class="muted">Loading…</div>'+
      '<section id="developerRoleAuditHidden" hidden><h2 class="rt">Recent role changes</h2><div id="roleLog" class="muted">Loading…</div></section><div class="status" id="roleMsg"></div>';
    wireCompetitionAdmin();
    wireCupAdmin();
    loadDeveloperOverview();
    $('devRefreshOverview').onclick=loadDeveloperOverview;
    loadLeagueState();loadAppState();loadAccountsDev(p);loadRoleLog();loadInviteForm();
    $('pauseBtn').onclick=function(){setPause(true);};$('resumeBtn').onclick=function(){setPause(false);};
    $('freezeAppBtn').onclick=function(){setAppFreeze(true);};$('unfreezeAppBtn').onclick=function(){setAppFreeze(false);};
    $('ivPhoto').onchange=function(){var f=this.files&&this.files[0];if(!f){$('ivPhotoPreview').textContent='No photo selected.';return;}if(['image/jpeg','image/png','image/webp'].indexOf(f.type)===-1||f.size>4*1024*1024){this.value='';msg('Choose a JPG, PNG or WebP photo no larger than 4 MB.');return;}var u=URL.createObjectURL(f);$('ivPhotoPreview').innerHTML='<img src="'+u+'" alt="Profile preview" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #16834a">';};
  }

  function loadSuperAdminOverview(){
    var specs=[
      ['saMetricCompetitions','leagues'],
      ['saMetricSeasons','seasons'],
      ['saMetricMatches','matches'],
      ['saMetricClubs','league_clubs'],
      ['saMetricPlayers','club_squad'],
      ['saMetricReports','fan_reports']
    ];
    var status=$('saOverviewStatus');
    if(status)status.textContent='Refreshing live operational totals…';
    Promise.all(specs.map(function(s){
      return db.from(s[1]).select('*',{count:'exact',head:true}).then(function(r){
        var el=$(s[0]);
        if(el)el.textContent=r.error?'Unavailable':(r.count==null?'—':Number(r.count).toLocaleString());
        return {name:s[1],error:r.error};
      }).catch(function(){var el=$(s[0]);if(el)el.textContent='Unavailable';return {name:s[1],error:true};});
    })).then(function(results){
      var failed=results.filter(function(x){return x.error;});
      if(status)status.textContent=failed.length?'Some totals are unavailable under the current database permissions: '+failed.map(function(x){return x.name;}).join(', ')+'.':'All operational totals refreshed successfully.';
    });
  }
  function loadDeveloperOverview(){
    var specs=[
      ['devMetricAccounts','user_profiles','*'],
      ['devMetricMatches','matches','*'],
      ['devMetricClubs','league_clubs','*'],
      ['devMetricReports','fan_reports','*'],
      ['devMetricNews','media_posts','*']
    ];
    var status=$('devOverviewStatus');
    if(status)status.textContent='Refreshing live totals…';
    Promise.all(specs.map(function(s){
      return db.from(s[1]).select(s[2],{count:'exact',head:true}).then(function(r){
        var el=$(s[0]);
        if(el)el.textContent=r.error?'—':(r.count==null?'—':Number(r.count).toLocaleString());
        return {name:s[1],error:r.error};
      }).catch(function(){var el=$(s[0]);if(el)el.textContent='—';return {name:s[1],error:true};});
    })).then(function(results){
      var failed=results.filter(function(x){return x.error;});
      if(status)status.textContent=failed.length?('Some totals are unavailable because database permissions or tables prevented reading: '+failed.map(function(x){return x.name;}).join(', ')+'.'):'All database totals refreshed successfully.';
    });
    db.rpc('analytics_summary',{p_days:30}).then(function(r){
      var el=$('devMetricActivity');if(!el)return;
      if(r.error){el.textContent='Activity summary is currently unavailable.';return;}
      var rows=r.data||[];
      var total=rows.reduce(function(sum,x){return sum+Number(x.total||0);},0);
      el.textContent=total.toLocaleString()+' recorded app events across '+rows.length+' event types.';
    }).catch(function(){var el=$('devMetricActivity');if(el)el.textContent='Activity summary is currently unavailable.';});
  }
  function uploadDevPhoto(email,file){
    if(!file)return Promise.resolve(null);
    if(['image/jpeg','image/png','image/webp'].indexOf(file.type)===-1||file.size>4*1024*1024)return Promise.reject(new Error('Choose a JPG, PNG or WebP photo no larger than 4 MB.'));
    var ext=file.type==='image/png'?'png':(file.type==='image/webp'?'webp':'jpg');
    var path=encodeURIComponent(email.toLowerCase())+'/'+Date.now()+'-'+makeClientEventId()+'.'+ext;
    return db.storage.from('developer-profiles').upload(path,file,{upsert:false,contentType:file.type}).then(function(r){
      if(r.error)throw r.error;return db.storage.from('developer-profiles').getPublicUrl(path).data.publicUrl;
    });
  }
  function loadInviteForm(){ $('ivSave').onclick=saveInvite; loadInvites(); }
  function saveInvite(){
    var name=$('ivName').value.trim(),email=$('ivEmail').value.trim().toLowerCase(),role=$('ivRole').value,file=$('ivPhoto').files&&$('ivPhoto').files[0];
    if(!name||!email){msg('Enter the full name and email address.');return;}
    msg('Saving role assignment…');
    uploadDevPhoto(email,file).then(function(photo){
      return db.rpc('invite_user',{p_email:email,p_role:role,p_club:null,p_full_name:name,p_photo_url:photo});
    }).then(function(r){
      if(r.error){msg(r.error.message);return;}msg(r.data||'Role assignment saved.');
      $('ivName').value='';$('ivEmail').value='';$('ivPhoto').value='';$('ivPhotoPreview').textContent='No photo selected.';
      loadInvites();loadRoleLog();if(devUser)loadAccountsDev(devUser);
    }).catch(function(err){msg(err.message||'Photo upload failed.');});
  }
  function loadInvites(){
    db.from('role_invitations').select('email,full_name,system_role,invited_at').order('invited_at',{ascending:false}).then(function(r){
      if(r.error){$('ivList').textContent=r.error.message;return;}var rows=r.data||[];
      $('ivList').innerHTML=rows.length?rows.map(function(x){return '<div class="post"><strong>'+esc(x.full_name||x.email)+'</strong><div class="muted">'+esc(x.email)+' · '+esc(x.system_role)+' · waiting for sign-up</div><button class="small danger" data-cancel="'+esc(x.email)+'">Cancel</button></div>';}).join(''):'No pending role assignments.';
      document.querySelectorAll('[data-cancel]').forEach(function(b){b.onclick=function(){db.from('role_invitations').delete().eq('email',b.dataset.cancel).then(function(x){msg(x.error?x.error.message:'Cancelled.');loadInvites();});};});
    });
  }
  function loadLeagueState(){db.from('system_pause').select('paused').eq('id',1).maybeSingle().then(function(r){if(r.error){$('leagueState').textContent=r.error.message;return;}var v=!!(r.data&&r.data.paused);$('leagueState').innerHTML=v?'<strong style="color:#b7791f">Paused.</strong> League operations are stopped.':'<strong style="color:#16834a">Running.</strong> League operations are active.';});}
  function setPause(v){db.rpc('set_system_pause',{p_paused:v}).then(function(r){msg(r.error?r.error.message:(v?'League paused.':'League resumed.'));loadLeagueState();});}
  function loadAppState(){db.from('application_control').select('app_frozen').eq('id',1).maybeSingle().then(function(r){if(r.error){$('appState').textContent=r.error.message;return;}var v=!!(r.data&&r.data.app_frozen);$('appState').innerHTML=v?'<strong style="color:#b91c1c">Entire app frozen.</strong>':'<strong style="color:#16834a">Application available.</strong>';});}
  function setAppFreeze(v){db.rpc('set_application_freeze',{p_frozen:v}).then(function(r){msg(r.error?r.error.message:(v?'Entire app frozen.':'Application unfrozen.'));loadAppState();});}
  function currentRoleKey(u){var r=String(u.system_role).toUpperCase();return r==='REFEREE'&&u.official_title==='Match Commissioner'?'MATCH_COMMISSIONER':r;}
  function startManagedAccountSession(userId, button){
    if(!confirm('Open this account in a separate, audited session? Your Developer session will remain signed in here. Actions in the new tab will be recorded under the selected account.')) return;
    var target=window.open('about:blank','_blank');
    if(!target){alert('Allow pop-ups for this site, then try again.');return;}
    button.disabled=true;button.textContent='Preparing secure session…';
    db.functions.invoke('developer-login-as-user',{body:{target_user_id:userId}}).then(function(result){
      if(result.error||!result.data||!result.data.token_hash||!result.data.portal){
        target.close();alert((result.data&&result.data.error)||(result.error&&result.error.message)||'Could not start the account session.');return;
      }
      var url=new URL(result.data.portal,location.href);
      url.hash='slfa-login-as='+encodeURIComponent(result.data.token_hash);
      target.location.replace(url.href);
    }).catch(function(error){target.close();alert(error&&error.message?error.message:'Could not start the account session.');})
    .finally(function(){button.disabled=false;button.textContent='Login as User';});
  }
  function loadAccountsDev(p){
    db.from('user_profiles').select('id,full_name,email,photo_url,system_role,status,official_title').order('email').limit(500).then(function(r){
      if(r.error){$('roleList').textContent=r.error.message;return;}var rows=r.data||[];
      $('roleList').innerHTML=rows.length?rows.map(function(u){
        var me=u.id===p.id,dev=String(u.system_role).toUpperCase()==='DEVELOPER',active=String(u.status).toLowerCase()==='active',waiting=String(u.system_role).toUpperCase()==='NONE';
        var opts=(waiting?'<option value="NONE" selected>Waiting for a role</option>':'')+ROLE_OPTIONS.map(function(o){return '<option value="'+o[0]+'"'+(currentRoleKey(u)===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');
        var pic=u.photo_url?'<img src="'+esc(u.photo_url)+'" alt="" style="width:50px;height:50px;border-radius:50%;object-fit:cover;margin-right:10px">':'';
        return '<div class="post"><div style="display:flex;align-items:center">'+pic+'<div><strong>'+esc(u.full_name||u.email)+(me?' (you)':'')+'</strong><div class="muted">'+esc(u.email)+' · '+esc(u.status)+' · '+esc(u.system_role||'NONE')+'</div></div></div>'+
          (dev?'<div class="muted">Developer account · protected</div>':'<label>Role</label><select data-role-for="'+esc(u.id)+'">'+opts+'</select>'+'<div class="btns"><button class="small" data-apply="'+esc(u.id)+'">Apply role</button>'+(me?'':'<button class="small '+(active?'danger':'')+'" data-status="'+esc(u.id)+'" data-next="'+(active?'Suspended':'Active')+'">'+(active?'Suspend':'Restore')+'</button><button class="small danger" data-delete="'+esc(u.id)+'">Delete account</button>')+(dev||!active||me?'':'<button class="small secondary" data-login-as-account="'+esc(u.id)+'">Login as User</button>')+'</div>')+'</div>';
      }).join(''):'No accounts yet.';
      document.querySelectorAll('[data-apply]').forEach(function(b){b.onclick=function(){var id=b.dataset.apply,el=document.querySelector('[data-role-for="'+id+'"]');if(!el)return;db.rpc('set_user_role',{p_user:id,p_role:el.value}).then(function(x){msg(x.error?x.error.message:'Role updated.');loadAccountsDev(p);loadRoleLog();});};});
      document.querySelectorAll('[data-status]').forEach(function(b){b.onclick=function(){var st=b.dataset.next;db.rpc('set_account_status',{p_user:b.dataset.status,p_status:st}).then(function(x){msg(x.error?x.error.message:(st==='Active'?'Account restored.':'Account suspended.'));loadAccountsDev(p);});};});
      document.querySelectorAll('[data-login-as-account]').forEach(function(b){b.onclick=function(){startManagedAccountSession(b.dataset.loginAsAccount,b);};});
      document.querySelectorAll('[data-delete]').forEach(function(b){b.onclick=function(){if(!confirm('Permanently delete this account? This cannot be undone.'))return;db.rpc('delete_user_account',{p_user:b.dataset.delete}).then(function(x){msg(x.error?x.error.message:'Account deleted.');loadAccountsDev(p);});};});
    });
  }
  function loadRoleLog(){db.from('role_change_log').select('user_email,previous_role,new_role,changed_at').order('changed_at',{ascending:false}).limit(15).then(function(r){if(r.error){$('roleLog').textContent=r.error.message;return;}var rows=r.data||[];$('roleLog').innerHTML=rows.length?rows.map(function(x){return '<div class="ev"><span class="etxt">'+esc(x.user_email)+': '+esc(x.previous_role||'—')+' → '+esc(x.new_role)+'<small>'+esc(new Date(x.changed_at).toLocaleString())+'</small></span></div>';}).join(''):'No role changes yet.';});}

  // ---------- MATCH-DAY TOUCH SCREEN (referee) ----------
  // Big buttons: event, then team, then player (and a second player for a substitution). One tap records the event.
  var tp = { id: null, match: null, events: [], players: [], step: 'type', type: null, team: null, on: null, minute: 0, lastId: null };
  var TP_LABEL = { GOAL: 'Goal', YELLOW_CARD: 'Yellow card', RED_CARD: 'Red card', SUB: 'Substitution' };
  function initTouchPad() {
    $('touchPad').addEventListener('click', tpClick);
    $('rfMatch').addEventListener('change', function () { tpLoad(this.value); });
    tpLoad('');
  }
  function tpLoad(id) {
    tp.id = id || null; tp.match = null; tp.events = []; tp.players = []; tp.step = 'type'; tp.type = null; tp.team = null; tp.on = null; tp.lastId = null;
    if (!id) { tpRender('Choose a match above to use the match-day screen.'); return; }
    Promise.all([
      db.from('matches').select('id, home_team, away_team, match_status, match_minute').eq('id', id).maybeSingle(),
      db.from('match_events').select('id, event_type, team_name, player_name, minute').eq('match_id', String(id)).order('minute', { ascending: true }),
      db.from('match_lineups').select('is_starter, league_clubs(club_name), club_squad(player_name, jersey_number)').eq('match_id', id)
    ]).then(function (all) {
      tp.match = all[0].data || null;
      if (!tp.match) { tpRender('This match could not be loaded.'); return; }
      tp.events = all[1].data || [];
      tp.players = (all[2].data || []).filter(function (x) { return x.club_squad; }).map(function (x) {
        return { team: x.league_clubs ? x.league_clubs.club_name : '', name: x.club_squad.player_name, no: x.club_squad.jersey_number };
      });
      tp.minute = tp.match.match_minute || 0;
      tpRender();
    });
  }
  function tpScore(team) { return tp.events.filter(function (e) { return e.event_type === 'GOAL' && e.team_name === team; }).length; }
  function tpRoster(team) { return tp.players.filter(function (x) { return x.team === team; }); }
  function tpRender(note) {
    var m = tp.match, box = $('touchPad');
    if (!m) { box.innerHTML = '<div class="touchpad"><p class="tp-note">' + esc(note || '') + '</p></div>'; return; }
    var live = m.match_status === 'LIVE' || m.match_status === 'HT';
    var h = '<div class="touchpad">';
    h += '<div class="tp-score">' + esc(m.home_team) + ' ' + tpScore(m.home_team) + ' – ' + tpScore(m.away_team) + ' ' + esc(m.away_team) + '</div>';
    h += '<div class="tp-minute"><button class="tp-small" data-tp="min" data-d="-1">−1</button><span>' + esc(tp.minute) + "'</span><button class=\"tp-small\" data-tp=\"min\" data-d=\"1\">+1</button></div>";
    if (!live) {
      h += '<p class="tp-note">Start the match to log events. Status: ' + esc(m.match_status) + '.</p>' +
           '<button class="tp-back" data-tp="refresh">Refresh</button></div>';
      box.innerHTML = h; return;
    }
    if (tp.step === 'type') {
      h += '<button class="tp-btn tp-goal" data-tp="type" data-v="GOAL">GOAL</button>' +
           '<button class="tp-btn tp-yellow" data-tp="type" data-v="YELLOW_CARD">YELLOW CARD</button>' +
           '<button class="tp-btn tp-red" data-tp="type" data-v="RED_CARD">RED CARD</button>' +
           '<button class="tp-btn tp-sub" data-tp="type" data-v="SUB">SUBSTITUTION</button>';
    } else if (tp.step === 'team') {
      h += '<p class="tp-note">' + esc(TP_LABEL[tp.type]) + ': which team?</p>' +
           '<button class="tp-btn tp-team" data-tp="team" data-v="' + esc(m.home_team) + '">' + esc(m.home_team) + '</button>' +
           '<button class="tp-btn tp-team" data-tp="team" data-v="' + esc(m.away_team) + '">' + esc(m.away_team) + '</button>';
    } else {
      var label = tp.type === 'SUB' ? (tp.step === 'on' ? 'Player coming ON' : 'Player going OFF') : 'Player';
      h += '<p class="tp-note">' + esc(label) + ' · ' + esc(tp.team) + '</p>';
      var roster = tpRoster(tp.team).filter(function (x) { return x.name !== tp.on; });
      h += roster.length ? roster.map(function (x) {
        return '<button class="tp-btn tp-player" data-tp="player" data-v="' + esc(x.name) + '">' + (x.no ? '#' + esc(x.no) + ' ' : '') + esc(x.name) + '</button>';
      }).join('') : '<p class="tp-note">No squad list for this team yet. Type the name below.</p>';
      h += '<input class="tp-input" id="tpName" type="text" placeholder="Or type the name" autocomplete="off">' +
           '<button class="tp-btn tp-player" data-tp="typed">Use typed name</button>';
    }
    if (tp.step !== 'type') h += '<button class="tp-back" data-tp="back">Back</button>';
    h += '<button class="tp-back" data-tp="undo"' + (tp.lastId ? '' : ' disabled') + '>Undo last event</button>';
    h += '</div>';
    box.innerHTML = h;
  }
  function tpClick(e) {
    var b = e.target.closest && e.target.closest('[data-tp]'); if (!b || b.disabled) return;
    var act = b.dataset.tp, v = b.dataset.v;
    if (act === 'refresh') { tpLoad(tp.id); return; }
    if (act === 'min') { tp.minute = Math.max(0, Math.min(130, tp.minute + Number(b.dataset.d))); tpRender(); return; }
    if (act === 'type') { tp.type = v; tp.step = 'team'; tpRender(); return; }
    if (act === 'team') { tp.team = v; tp.step = 'on'; tpRender(); return; }
    if (act === 'player' || act === 'typed') {
      var name = act === 'typed' ? ($('tpName') ? $('tpName').value.trim() : '') : v;
      if (!name) { msg('Type the player name.'); return; }
      if (tp.step === 'on') {
        tp.on = name;
        if (tp.type === 'SUB') { tp.step = 'off'; tpRender(); return; }
        tpRecord(name, null); return;
      }
      if (tp.step === 'off') { tpRecord(tp.on, name); return; }
    }
    if (act === 'back') {
      if (tp.step === 'off') { tp.step = 'on'; tp.on = null; }
      else if (tp.step === 'on') { tp.step = 'team'; tp.team = null; }
      else { tp.step = 'type'; tp.type = null; }
      tpRender(); return;
    }
    if (act === 'undo') {
      if (!tp.lastId) return;
      var reason = prompt('Why are you undoing this event? (at least 5 characters)');
      if (reason == null) return;
      if (reason.trim().length < 5) { msg('Give a reason of at least 5 characters.'); return; }
      db.rpc('reverse_match_event', { p_event_id: Number(tp.lastId), p_reason: reason.trim() }).then(function (res) {
        msg(res.error ? res.error.message : 'Reversed and logged.');
        tpLoad(tp.id);
      });
    }
  }
  function tpRecord(player, off) {
    db.auth.getUser().then(function (u) {
      if (!u.data || !u.data.user) throw new Error('Sign in again before recording a match event.');
      var event = {
        client_event_id: makeClientEventId(), match_id: String(tp.id), event_type: tp.type, team_name: tp.team,
        player_name: player, player_off_name: off || null, minute: tp.minute, recorded_by: u.data.user.id,
        recorded_at: new Date().toISOString(), published_at: new Date().toISOString()
      };
      return queueAndSyncRefereeEvent(event).then(function (result) {
        if (result.error && !result.queued) { msg(result.error.message); return; }
        tp.lastId = result.id || null;
        tp.events.push(event);
        msg(result.queued ? 'Saved on this phone. This event will sync automatically when internet returns.' :
          'Recorded: ' + TP_LABEL[tp.type] + ' · ' + tp.team + ' · ' + player + " " + tp.minute + "'");
        tp.step = 'type'; tp.type = null; tp.team = null; tp.on = null; tpRender();
      });
    }).catch(function (err) { msg(err.message || 'Could not save the match event.'); });
  }

  // ---------- REFEREE ----------
  var refEvents = [], currentRefMatch = null;
  var rfRoles = {};
  // Only the main referee starts, pauses, ends or changes the score. Other assigned officials record events.
  function applyRefRole(id) {
    var main = rfRoles[String(id)] === 'MAIN';
    ['rfStart', 'rfEnd', 'rfChange', 'rfReverse'].forEach(function (x) { var el = $(x); if (el) el.style.display = main ? '' : 'none'; });
    return main;
  }
  function referee(p) {
    syncPendingRefereeEvents();
    syncPendingRefereeResults();
    box().innerHTML =
      '<h2 class="rt">My matches</h2>' +
      '<label for="rfMatch">Match</label><select id="rfMatch"><option value="">Loading your matches…</option></select>' +
      '<div class="scores"><span id="rfScore" class="score-big">0 – 0</span></div>' +
      '<div class="btns"><button class="secondary" id="rfStart">Start match</button><button class="primary" id="rfEnd">End and save final score</button></div>' +
      '<div class="btns"><button class="secondary" id="rfChange">Change final score</button><button class="secondary" id="rfReverse">Reverse final score</button></div>' +
      '<h2 class="rt">Events so far</h2><div id="rfEvents" class="muted">No events yet.</div>' +
      '<h2 class="rt">Man of the Match</h2><label for="rfMotm">Player</label><select id="rfMotm"><option value="">Choose a match first…</option></select>' +
      '<div class="btns"><button class="secondary" id="rfMotmSave">Save Man of the Match</button></div>' +
      '<div id="touchPad"></div>' +
      '<div id="rfPanel" class="hidden">' +
        '<div class="btns"><button class="secondary" id="rfHalf">Half time</button><button class="secondary" id="rfSecond">Second half</button></div>' +
        input('rfMin', 'Current minute', 'number', 'min="0" max="130"') + '<div class="btns"><button class="secondary" id="rfMinSave">Update minute</button></div>' +
        '<label for="rfTeam">Team</label><select id="rfTeam"></select>' +
        input('rfPlayer', 'Player') + input('rfAssist', 'Assist (optional)') + input('rfOff', 'Player off (substitutions only)') +
        '<label for="rfType">Event</label><select id="rfType"><option value="GOAL">Goal</option><option value="YELLOW_CARD">Yellow card</option><option value="RED_CARD">Red card</option><option value="SUB">Substitution</option></select>' +
        input('rfMinute', 'Minute', 'number', 'min="0" max="130"') +
        '<div class="btns"><button class="primary" id="rfAdd">Record event</button></div>' +
      '</div>' +
      '<div class="status" id="roleMsg"></div>';

    db.auth.getUser().then(function (u) {
      return db.from('match_referee_assignments').select('match_id, official_role').eq('referee_user_id', u.data.user.id).eq('assignment_status', 'ACTIVE');
    }).then(function (a) {
      rfRoles = {};
      (a.data || []).forEach(function (x) { rfRoles[String(x.match_id)] = x.official_role; });
      var ids = (a.data || []).map(function (x) { return x.match_id; });
      if (!ids.length) { $('rfMatch').innerHTML = '<option value="">No matches assigned to you yet</option>'; return; }
      return db.from('matches').select('id, home_team, away_team, match_status, match_date').in('id', ids).order('match_date', { ascending: true })
        .then(function (r) {
          $('rfMatch').innerHTML = '<option value="">Choose a match…</option>' + (r.data || []).map(function (m) {
            return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + (m.match_status === 'LIVE' ? ' · LIVE' : '') + '</option>'; }).join('');
        });
    });

    $('rfMatch').addEventListener('change', function () { loadRefMatch(this.value); });
    initTouchPad();
    $('rfStart').addEventListener('click', function () {
      var id = $('rfMatch').value; if (!id) { msg('Choose a match.'); return; }
      setMatch(id, { match_status: 'LIVE', match_minute: 0 }).then(function (r) {
        msg(r.error ? r.error.message : 'Match is live.'); loadRefMatch(id); });
    });
    $('rfChange').addEventListener('click', function () {
      var id = $('rfMatch').value; if (!id) { msg('Choose a match.'); return; }
      var h = parseInt(prompt('Home goals'), 10), a = parseInt(prompt('Away goals'), 10);
      if (isNaN(h) || isNaN(a)) { msg('Enter both scores as numbers.'); return; }
      var reason = askReason('Reason for changing the score (required, logged):'); if (!reason) return;
      db.rpc('change_match_result', { p_match_id: Number(id), p_home: h, p_away: a, p_reason: reason }).then(function (r) {
        msg(r.error ? r.error.message : 'Score changed and logged.'); loadRefMatch(id);
      });
    });
    $('rfReverse').addEventListener('click', function () {
      var id = $('rfMatch').value; if (!id) { msg('Choose a match.'); return; }
      var reason = askReason('Reason for reversing the final score (required, logged):'); if (!reason) return;
      if (!confirm('Reverse the final score? The match goes back to half time so you can submit again.')) return;
      db.rpc('reverse_match_result', { p_match_id: Number(id), p_reason: reason }).then(function (r) {
        msg(r.error ? r.error.message : 'Final score reversed and logged.'); loadRefMatch(id);
      });
    });
    $('rfEnd').addEventListener('click', function () {
      var id = $('rfMatch').value; if (!id) { msg('Choose a match.'); return; }
      var cached = currentRefMatch && String(currentRefMatch.id) === String(id) ? currentRefMatch : null;
      var matchRequest = cached ? Promise.resolve({ data: cached }) :
        db.from('matches').select('id, home_team, away_team, match_status, match_date').eq('id', id).maybeSingle();
      matchRequest.then(function (r) {
        var m = r.data;
        if (!m) { msg('Match details are unavailable. Open the match while connected before using offline mode.'); return; }
        var hg = goalsFor(m.home_team), ag = goalsFor(m.away_team);
        if (!confirm('Submit ' + m.home_team + ' ' + hg + ' – ' + ag + ' ' + m.away_team + ' as the final score for approval? This also marks the match as full time.')) return;
        var finish = setMatch(id, { match_status: 'FT', match_minute: null }).then(function (r) {
          return r.error ? r.error.message : '';
        }, function () { return 'Full time could not be set. Set it again when you are back online.'; });
        return db.auth.getUser().then(function (u) {
          if (!u.data || !u.data.user) throw new Error('Sign in again before submitting the final score.');
          var submission = {
            client_submission_id: makeClientEventId(), match_id: Number(id), home_goals: hg, away_goals: ag,
            submitted_by: u.data.user.id
          };
          return queueAndSyncRefereeResult(submission).then(function (res) {
            if (res.error && !res.queued) { msg(res.error.message); return; }
            var text = res.queued ? 'Final score saved on this phone. It will sync automatically when internet returns.' :
              'Final score confirmed and published.';
            finish.then(function (e) { msg(e || text); });
            if (!res.queued) loadRefMatch(id);
          });
        });
      }).catch(function (err) { msg(err.message || 'Could not submit the final score.'); });
    });
    wireMatchTime('rf', 'rfMatch');
    $('rfMotmSave').addEventListener('click', saveMotm);
    $('rfAdd').addEventListener('click', function () {
      var id = $('rfMatch').value; if (!id) { msg('Choose a match.'); return; }
      var type = $('rfType').value, player = $('rfPlayer').value.trim(), minute = parseInt($('rfMinute').value, 10);
      if (!player || isNaN(minute)) { msg('Enter the player and the minute.'); return; }
      if (type === 'SUB' && !$('rfOff').value.trim()) { msg('Enter the player coming off.'); return; }
      db.auth.getUser().then(function (u) {
        if (!u.data || !u.data.user) throw new Error('Sign in again before recording a match event.');
        var event = { client_event_id: makeClientEventId(), match_id: String(id), event_type: type, team_name: $('rfTeam').value, player_name: player,
          assist_player_name: $('rfAssist').value.trim() || null, player_off_name: $('rfOff').value.trim() || null, minute: minute,
          recorded_by: u.data.user.id, recorded_at: new Date().toISOString(), published_at: new Date().toISOString() };
        return queueAndSyncRefereeEvent(event).then(function (res) {
          if (res.error && !res.queued) { msg(res.error.message); return; }
          msg(res.queued ? 'Saved on this phone. This event will sync automatically when internet returns.' : 'Recorded.');
          ['rfPlayer','rfAssist','rfOff','rfMinute'].forEach(function (x) { $(x).value = ''; });
          if (!res.queued) loadRefMatch(id);
          else {
            refEvents.push(event);
            var m = currentRefMatch;
            if (m) $('rfScore').textContent = goalsFor(m.home_team) + ' – ' + goalsFor(m.away_team);
          }
        });
      }).catch(function (err) { msg(err.message || 'Could not save the match event.'); });
    });
  }
  // Every status or minute change stamps status_set_at, so the public clock can count on from it
  function setMatch(id, fields) {
    if (fields && (fields.match_status !== undefined || fields.match_minute !== undefined) && fields.status_set_at === undefined) {
      fields = Object.assign({}, fields, { status_set_at: new Date().toISOString() });
    }
    return db.from('matches').update(fields).eq('id', id);
  }
  // Man of the Match: approved players of both clubs in the match, grouped by club
  function loadMotm(m) {
    var sel = $('rfMotm'); if (!sel) return;
    db.from('league_clubs').select('id, club_name').in('club_name', [m.home_team, m.away_team]).then(function (c) {
      var clubs = c.data || [];
      if (!clubs.length) { sel.innerHTML = '<option value="">No club found for this match</option>'; return; }
      var names = {}; clubs.forEach(function (k) { names[k.id] = k.club_name; });
      return db.from('club_squad').select('id, player_name, jersey_number, club_id').in('club_id', clubs.map(function (k) { return k.id; }))
        .eq('registration_status', 'Approved').order('player_name').then(function (s) {
          var rows = s.data || [];
          var groups = [m.home_team, m.away_team].map(function (team) {
            var opts = rows.filter(function (r) { return names[r.club_id] === team; }).map(function (r) {
              return '<option value="' + esc(r.id) + '"' + (String(r.id) === String(m.motm_player_id) ? ' selected' : '') + '>' +
                (r.jersey_number ? '#' + esc(r.jersey_number) + ' ' : '') + esc(r.player_name) + '</option>';
            }).join('');
            return opts ? '<optgroup label="' + esc(team) + '">' + opts + '</optgroup>' : '';
          }).join('');
          sel.innerHTML = '<option value="">No Man of the Match</option>' + (groups || '<option value="">No approved players yet</option>');
        });
    });
  }
  function saveMotm() {
    var id = $('rfMatch').value; if (!id) { msg('Choose a match.'); return; }
    var v = $('rfMotm').value;
    db.rpc('set_match_motm', { p_match_id: Number(id), p_player_id: v ? Number(v) : null }).then(function (res) {
      msg(res.error ? res.error.message : (v ? 'Man of the Match saved.' : 'Man of the Match cleared.'));
    });
  }
  // Half time, second half and the current minute, for the Super Admin or the referee
  function wireMatchTime(prefix, matchSel) {
    $(prefix + 'Half').addEventListener('click', function () { var id = $(matchSel).value; if (!id) return; setMatch(id, { match_status: 'HT', match_minute: 45 }).then(function (r) { msg(r.error ? r.error.message : 'Half time.'); }); });
    $(prefix + 'Second').addEventListener('click', function () { var id = $(matchSel).value; if (!id) return; setMatch(id, { match_status: 'LIVE', match_minute: 46 }).then(function (r) { msg(r.error ? r.error.message : 'Second half started.'); }); });
    $(prefix + 'MinSave').addEventListener('click', function () {
      var id = $(matchSel).value, n = parseInt($(prefix + 'Min').value, 10);
      if (!id) return;
      if (isNaN(n) || n < 0 || n > 130) { msg('Enter a minute between 0 and 130.'); return; }
      setMatch(id, { match_minute: n }).then(function (r) { msg(r.error ? r.error.message : 'Minute updated.'); });
    });
  }
  function goalsFor(team) { return refEvents.filter(function (e) { return e.event_type === 'GOAL' && e.team_name === team; }).length; }
  function loadRefMatch(id) {
    if (!id) { $('rfPanel').classList.add('hidden'); return; }
    db.from('matches').select('id, home_team, away_team, match_status, motm_player_id').eq('id', id).maybeSingle().then(function (r) {
      var m = r.data; if (!m) return;
      currentRefMatch = m;
      loadMotm(m);
      $('rfTeam').innerHTML = '<option>' + esc(m.home_team) + '</option><option>' + esc(m.away_team) + '</option>';
      $('rfPanel').classList.toggle('hidden', (m.match_status !== 'LIVE' && m.match_status !== 'HT') || !applyRefRole(id));
      db.from('match_events').select('id, event_type, team_name, player_name, player_off_name, minute').eq('match_id', String(id)).order('minute', { ascending: true }).then(function (e) {
        refEvents = e.data || [];
        $('rfScore').textContent = goalsFor(m.home_team) + ' – ' + goalsFor(m.away_team);
        $('rfEvents').innerHTML = refEvents.length ? refEvents.map(function (ev) {
          var label = ev.event_type === 'SUB' ? ev.player_name + ' on, ' + (ev.player_off_name || '') + ' off' : ev.player_name;
          return '<div class="ev"><span class="min">' + esc(ev.minute) + "'</span><span class=\"etxt\">" + esc(String(ev.event_type).replace('_',' ')) + ': ' + esc(label) +
            '<small>' + esc(ev.team_name || '') + '</small></span><button class="small danger" data-rev="' + ev.id + '">Reverse</button></div>';
        }).join('') : 'No events yet.';
        document.querySelectorAll('[data-rev]').forEach(function (b) {
          b.addEventListener('click', function () {
            var reason = prompt('Why is this being reversed? For example: goal disallowed for offside. Kept in the log.');
            if (reason == null) return;
            if (reason.trim().length < 5) { msg('Give a reason of at least 5 characters.'); return; }
            db.rpc('reverse_match_event', { p_event_id: Number(b.dataset.rev), p_reason: reason.trim() }).then(function (res) {
              msg(res.error ? res.error.message : 'Reversed and logged. The score is updated.'); loadRefMatch(id);
            });
          });
        });
      });
    });
  }

  // ---------- DISCIPLINARY OFFICER ----------
  var REASON = { YELLOW_ACCUMULATION: 'Yellow card accumulation', RED_CARD: 'Straight red card', OFFICIAL_RULING: 'Official ruling' };
  var ACTION = { FINE: 'Fine', PROTEST: 'Protest', BAN: 'Match ban', RULING: 'Official ruling', NOTE: 'Note' };
  function disciplinary(p) {
    box().innerHTML =
      '<h2 class="rt">Suspensions</h2><div id="suspList" class="muted">Loading…</div>' +
      '<h2 class="rt">Record a decision</h2>' +
      '<label for="dsPlayer">Player</label><select id="dsPlayer"><option value="">Loading players…</option></select>' +
      '<label for="dsType">Decision</label><select id="dsType"><option value="NOTE">Note</option><option value="PROTEST">Protest</option><option value="RULING">Official ruling</option><option value="FINE">Fine</option><option value="BAN">Match ban</option></select>' +
      input('dsAmount', 'Fine amount (fines only)', 'number', 'min="0" step="0.01"') +
      input('dsMatches', 'Number of matches (bans only)', 'number', 'min="1" max="10"') +
      '<label for="dsMatch">Related match (optional)</label><select id="dsMatch"><option value="">None</option></select>' +
      '<label for="dsReason">Reason and ruling</label><textarea id="dsReason" rows="3"></textarea>' +
      '<label><input id="dsPublish" type="checkbox" checked> Show on the public player profile</label>' +
      '<div class="btns"><button class="primary" id="dsSave">Record decision</button></div>' +
      '<h2 class="rt">Rules</h2>' +
      input('ruYellow', 'Yellow cards that trigger a ban', 'number', 'min="1" max="20"') +
      input('ruYellowBan', 'Matches banned for that accumulation', 'number', 'min="0" max="10"') +
      input('ruRedBan', 'Matches banned for a straight red card', 'number', 'min="0" max="10"') +
      '<div class="btns"><button class="secondary" id="ruSave">Save rules</button></div>' +
      '<h2 class="rt">Recent decisions</h2><div id="actionList" class="muted">Loading…</div>' +
      '<div class="status" id="roleMsg"></div>';
    loadRules(); loadSuspensions(); loadDecisionPlayers(); loadDecisionMatches(); loadActions();
    $('dsSave').addEventListener('click', saveDecision);
    $('ruSave').addEventListener('click', saveRules);
  }
  function loadRules() {
    db.from('disciplinary_rules').select('yellow_threshold, yellow_ban, red_ban').eq('id', 1).maybeSingle().then(function (r) {
      var d = r.data || { yellow_threshold: 3, yellow_ban: 1, red_ban: 1 };
      $('ruYellow').value = d.yellow_threshold; $('ruYellowBan').value = d.yellow_ban; $('ruRedBan').value = d.red_ban;
    });
  }
  function saveRules() {
    var y = Number($('ruYellow').value), yb = Number($('ruYellowBan').value), rb = Number($('ruRedBan').value);
    if (!(y >= 1 && y <= 20) || !(yb >= 0 && yb <= 10) || !(rb >= 0 && rb <= 10)) { msg('Check the rules: yellow cards 1 to 20, bans 0 to 10 matches.'); return; }
    db.from('disciplinary_rules').update({ yellow_threshold: y, yellow_ban: yb, red_ban: rb }).eq('id', 1).then(function (r) {
      msg(r.error ? r.error.message : 'Rules saved. They apply to cards given from now on.');
    });
  }
  function loadSuspensions() {
    db.from('suspensions').select('id, reason, matches_total, matches_served, club_squad(player_name, league_clubs(club_name))')
      .eq('status', 'ACTIVE').order('created_at', { ascending: false }).then(function (r) {
        var rows = r.data || [];
        $('suspList').innerHTML = rows.length ? rows.map(function (x) {
          var pl = x.club_squad || {}, club = pl.league_clubs ? pl.league_clubs.club_name : '';
          var left = x.matches_total - x.matches_served;
          return '<div class="post"><strong>' + esc(pl.player_name || 'Player') + '</strong> <span class="muted">' + esc(club) + '</span>' +
            '<div class="muted">' + esc(REASON[x.reason] || x.reason) + ' · ' + left + ' match' + (left === 1 ? '' : 'es') + ' left (' + x.matches_served + ' of ' + x.matches_total + ' served)</div>' +
            '<div class="btns"><button class="small" data-overturn="' + esc(x.id) + '">Overturn</button></div></div>';
        }).join('') : 'No active suspensions.';
        document.querySelectorAll('[data-overturn]').forEach(function (b) {
          b.addEventListener('click', function () {
            var reason = prompt('Why is this suspension being overturned? (at least 5 characters)');
            if (reason == null) return;
            db.rpc('overturn_suspension', { p_id: Number(b.dataset.overturn), p_reason: reason.trim() }).then(function (res) {
              msg(res.error ? res.error.message : 'Suspension overturned and logged.'); loadSuspensions(); loadActions();
            });
          });
        });
      });
  }
  function loadDecisionPlayers() {
    db.from('club_squad').select('id, player_name, league_clubs(club_name)').eq('registration_status', 'Approved').eq('status', 'Active').order('player_name').limit(500)
      .then(function (r) {
        $('dsPlayer').innerHTML = '<option value="">Choose a player…</option>' + (r.data || []).map(function (x) {
          return '<option value="' + esc(x.id) + '">' + esc(x.player_name) + ' · ' + esc(x.league_clubs ? x.league_clubs.club_name : '') + '</option>';
        }).join('');
      });
  }
  function loadDecisionMatches() {
    db.from('matches').select('id, home_team, away_team, match_date').order('match_date', { ascending: false }).limit(40).then(function (r) {
      $('dsMatch').innerHTML = '<option value="">None</option>' + (r.data || []).map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + ' · ' + esc(new Date(m.match_date).toLocaleDateString()) + '</option>';
      }).join('');
    });
  }
  function saveDecision() {
    var player = $('dsPlayer').value, type = $('dsType').value, reason = $('dsReason').value.trim();
    if (!player) { msg('Choose the player.'); return; }
    if (reason.length < 5) { msg('Give a reason of at least 5 characters.'); return; }
    db.rpc('disciplinary_decide', {
      p_player_id: Number(player), p_action: type,
      p_amount: $('dsAmount').value ? Number($('dsAmount').value) : null,
      p_reason: reason,
      p_matches: $('dsMatches').value ? parseInt($('dsMatches').value, 10) : null,
      p_match_id: $('dsMatch').value ? Number($('dsMatch').value) : null,
      p_publish: $('dsPublish').checked
    }).then(function (r) {
      if (r.error) { msg(r.error.message); return; }
      msg('Decision recorded.' + (type === 'BAN' ? ' The ban is now in the suspension list.' : ''));
      $('dsReason').value = ''; $('dsAmount').value = ''; $('dsMatches').value = '';
      loadSuspensions(); loadActions();
    });
  }
  function loadActions() {
    db.from('disciplinary_actions').select('id, action_type, amount, currency, reason, published, decided_at, club_squad(player_name)')
      .order('decided_at', { ascending: false }).limit(30).then(function (r) {
        var rows = r.data || [];
        $('actionList').innerHTML = rows.length ? rows.map(function (x) {
          return '<div class="post"><strong>' + esc(ACTION[x.action_type] || x.action_type) + '</strong> · ' + esc(x.club_squad ? x.club_squad.player_name : 'Player') +
            (x.amount ? ' · ' + esc(x.currency) + ' ' + esc(x.amount) : '') + (x.published ? '' : ' <span class="muted">(not shown publicly)</span>') +
            '<div class="muted">' + esc(new Date(x.decided_at).toLocaleString()) + '</div><p>' + esc(x.reason) + '</p></div>';
        }).join('') : 'No decisions yet.';
      });
  }

  // ---------- MEDIA OFFICER ----------
  function mediaOfficer(p) {
    box().innerHTML =
      '<h2 class="rt">New news post</h2>' +
      '<label for="npCat">Category</label><select id="npCat"><option value="NEWS">News</option><option value="PRESS_RELEASE">Press release</option><option value="MATCH_REPORT">Match report</option><option value="ANNOUNCEMENT">Announcement</option></select>' +
      '<label for="npMatch">Match (for match reports, optional)</label><select id="npMatch"><option value="">Not linked to a match</option></select>' +
      '<label for="npLeague">League (leave as All leagues for general news)</label><select id="npLeague"><option value="">All leagues (general)</option></select>' +
      input('npTitle', 'Title') +
      '<label for="npBody">Story</label><textarea id="npBody" rows="5"></textarea>' +
      input('npImage', 'Photo link (optional)', 'url') + input('npVideo', 'Video link (optional)', 'url') +
      '<p class="muted">All posts are reviewed by a Super Admin before they appear in the public News Centre. Save a draft or submit it for approval.</p>' +
      '<div class="btns"><button class="secondary" id="npDraft">Save draft</button><button class="primary" id="npSubmit">Submit for approval</button></div>' +
      '<h2 class="rt">My posts</h2><div id="myPosts" class="muted">Loading…</div>' +
      '<h2 class="rt">Fan poll</h2>' +
      input('pqQ', 'Question') + input('pqO1', 'Option 1') + input('pqO2', 'Option 2') + input('pqO3', 'Option 3 (optional)') + input('pqO4', 'Option 4 (optional)') +
      '<div class="btns"><button class="primary" id="pqSave">Publish poll</button></div>' +
      '<div id="pollList" class="muted">Loading…</div>' +
      '<div class="status" id="roleMsg"></div>';

    function save(status) {
      var t = $('npTitle').value.trim();
      if (!t) { msg('Give the post a title.'); return; }
      db.auth.getUser().then(function (u) {
        return db.from('media_posts').insert([{
          category: $('npCat').value, title: t, body: $('npBody').value.trim(), match_id: $('npMatch').value || null,
          league_id: $('npLeague').value ? Number($('npLeague').value) : null,
          image_url: $('npImage').value.trim() || null, video_url: $('npVideo').value.trim() || null,
          status: status, created_by: u.data.user.id, created_by_name: p.full_name || p.email,
          submitted_at: status === 'SUBMITTED' ? new Date().toISOString() : null,
          published_at: status === 'PUBLISHED' ? new Date().toISOString() : null
        }]);
      }).then(function (r) {
        if (r.error) { msg(r.error.message); return; }
        msg(status === 'SUBMITTED' ? 'Sent to the Super Admin for approval.' : status === 'PUBLISHED' ? 'Published.' : 'Draft saved.');
        $('npTitle').value = ''; $('npBody').value = ''; $('npImage').value = ''; $('npVideo').value = ''; $('npMatch').value = ''; $('npLeague').value = ''; loadMine();
      });
    }
    $('npDraft').addEventListener('click', function () { save('DRAFT'); });
    $('npSubmit').addEventListener('click', function () { save('SUBMITTED'); });
    $('npMatch').addEventListener('change', function () {
      var opt = this.options[this.selectedIndex];
      if (opt && opt.value) $('npCat').value = 'MATCH_REPORT';
      if (opt && opt.dataset.title && !$('npTitle').value.trim()) $('npTitle').value = opt.dataset.title;
    });
    db.from('matches').select('id, home_team, away_team, home_score, away_score, match_date').eq('match_status', 'FT').order('match_date', { ascending: false }).limit(40).then(function (r) {
      $('npMatch').innerHTML = '<option value="">Not linked to a match</option>' + (r.data || []).map(function (m) {
        var t = 'Match report: ' + m.home_team + ' ' + m.home_score + '–' + m.away_score + ' ' + m.away_team;
        return '<option value="' + esc(m.id) + '" data-title="' + esc(t) + '">' + esc(m.home_team) + ' ' + esc(m.home_score) + '–' + esc(m.away_score) + ' ' + esc(m.away_team) + ' · ' + esc(new Date(m.match_date).toLocaleDateString()) + '</option>';
      }).join('');
    });
    $('pqSave').addEventListener('click', savePoll);
    db.from('leagues').select('id, name').eq('is_active', true).order('sort_order').then(function (r) {
      $('npLeague').innerHTML = '<option value="">All leagues (general)</option>' + (r.data || []).map(function (l) {
        return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>'; }).join('');
    });
    loadMine();
    loadPolls();
  }
  function savePoll() {
    var q = $('pqQ').value.trim();
    var opts = ['pqO1', 'pqO2', 'pqO3', 'pqO4'].map(function (x) { return $(x).value.trim(); }).filter(Boolean);
    if (!q) { msg('Write the poll question.'); return; }
    if (opts.length < 2) { msg('Give at least two options.'); return; }
    db.auth.getUser().then(function (u) {
      return db.from('polls').insert({ question: q, created_by: u.data.user.id }).select('id').single();
    }).then(function (r) {
      if (r.error) throw r.error;
      return db.from('poll_options').insert(opts.map(function (label, i) { return { poll_id: r.data.id, label: label, sort_order: i }; }));
    }).then(function (r) {
      if (r.error) throw r.error;
      msg('Poll published.');
      ['pqQ', 'pqO1', 'pqO2', 'pqO3', 'pqO4'].forEach(function (x) { $(x).value = ''; });
      loadPolls();
    }).catch(function (e) { msg((e && e.message) || 'Could not create the poll.'); });
  }
  function loadPolls() {
    db.from('polls').select('id, question, is_open').order('created_at', { ascending: false }).limit(20).then(function (r) {
      var rows = r.data || [];
      $('pollList').innerHTML = rows.length ? rows.map(function (x) {
        return '<div class="post"><strong>' + esc(x.question) + '</strong><div class="muted">' + (x.is_open ? 'Open for votes' : 'Closed') + '</div>' +
          '<div class="btns"><button class="small" data-poll-toggle="' + esc(x.id) + '" data-next="' + (x.is_open ? 'false' : 'true') + '">' + (x.is_open ? 'Close poll' : 'Reopen poll') + '</button></div></div>';
      }).join('') : 'No polls yet.';
      document.querySelectorAll('[data-poll-toggle]').forEach(function (b) {
        b.addEventListener('click', function () {
          db.from('polls').update({ is_open: b.dataset.next === 'true' }).eq('id', b.dataset.pollToggle).then(function (res) {
            msg(res.error ? res.error.message : 'Poll updated.'); loadPolls();
          });
        });
      });
    });
  }
  function loadMine() {
    db.auth.getUser().then(function (u) {
      return db.from('media_posts').select('id, title, status, category').eq('created_by', u.data.user.id).order('created_at', { ascending: false }).limit(30);
    }).then(function (r) {
      var rows = r.data || [];
      $('myPosts').innerHTML = rows.length ? rows.map(function (x) {
        var open = x.status !== 'PUBLISHED';
        return '<div class="post"><strong>' + esc(x.title) + '</strong><div class="muted">' + esc(CAT_LABEL[x.category] || x.category) + ' · ' + esc(x.status) + '</div>' +
          (open ? '<div class="btns"><button class="small" data-sub="' + esc(x.id) + '">Submit for approval</button></div>' : '') + '</div>';
      }).join('') : 'No posts yet.';
      document.querySelectorAll('[data-sub]').forEach(function (b) {
        b.addEventListener('click', function () {
          db.from('media_posts').update({ status: 'SUBMITTED', submitted_at: new Date().toISOString() }).eq('id', b.dataset.sub)
            .then(function (res) { msg(res.error ? res.error.message : 'Sent for approval.'); loadMine(); });
        });
      });
    });
  }


  // LIVE ADMIN: lists update when a result, news post, event or assignment changes
  var adminTimer = null;
  function refreshAdmin() {
    if ($('pendingResults')) loadPendingResults();
    if ($('pendingComments')) loadPendingComments();
    if ($('usageCounts')) loadUsage();
    if ($('fanReports')) loadFanReports();
    if ($('reviewList')) loadReview();
    if ($('squadReview')) loadSquadReview();
    if ($('transferReview')) loadTransferReview();
    if ($('myPosts')) loadMine();
    if ($('rfMatch') && $('rfMatch').value) loadRefMatch($('rfMatch').value);
    if ($('lvMatch') && $('lvMatch').value) loadLiveMatch($('lvMatch').value);
  }
  db.channel('admin-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_results' }, function () { clearTimeout(adminTimer); adminTimer = setTimeout(refreshAdmin, 400); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'media_posts' }, function () { clearTimeout(adminTimer); adminTimer = setTimeout(refreshAdmin, 400); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events' }, function () { clearTimeout(adminTimer); adminTimer = setTimeout(refreshAdmin, 400); })
    .subscribe();
})();
