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
    var role = String(p.system_role).toUpperCase()==='LEAGUE_ADMIN'?'SUPER_ADMIN':String(p.system_role).toUpperCase();
    var out;
    if (role === 'SUPER_ADMIN') { out = superAdmin(p); if (typeof window.slfaRenderCommissionerReportsAdmin === 'function') window.slfaRenderCommissionerReportsAdmin(p); }
    else if (role === 'MEDIA_OFFICER') out = mediaOfficer(p);
    else if (role === 'DISCIPLINARY_OFFICER') out = disciplinary(p);
    else if (role === 'REFEREE' && String(p.official_title || '').trim().toLowerCase() === 'match commissioner' && typeof window.slfaRenderMatchCommissioner === 'function') out = window.slfaRenderMatchCommissioner(p);
    else if (role === 'REFEREE') out = referee(p);
    else if (role === 'MATCH_DATA_OPERATOR' && typeof window.slfaRenderMatchDataOperator === 'function') out = window.slfaRenderMatchDataOperator(p);
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
      '<section class="sa-command-centre"><h2 class="rt">Super Admin Command Centre</h2><p class="muted">Live operational overview from the connected SLFA database. These are record totals, not performance estimates.</p><div class="sa-metric-grid">'+[['saMetricCompetitions','Competitions'],['saMetricSeasons','Seasons'],['saMetricMatches','Fixtures and results'],['saMetricClubs','Clubs'],['saMetricPlayers','Squad records']].map(function(x){return '<article class="sa-metric"><span>'+x[1]+'</span><strong id="'+x[0]+'">—</strong></article>';}).join('')+'</div><div class="muted" id="saOverviewStatus" role="status">Loading operational totals…</div><button class="secondary" type="button" id="saRefreshOverview">Refresh overview</button></section>' +
      '<section class="sa-staff-management" id="superAdminStaffManagement"><h2 class="rt">User &amp; Role Management</h2><p class="muted">Manage operational administrators and staff. Super Admin accounts and the Developer account are protected; only the Developer can appoint or change Super Admins.</p>' +
      '<h3>Invite operational staff</h3><label for="saStaffName">Full name</label><input id="saStaffName" type="text" autocomplete="name">' +
      '<label for="saStaffEmail">Email address</label><input id="saStaffEmail" type="email" autocomplete="email">' +
      '<label for="saStaffRole">Operational role</label><select id="saStaffRole"><option value="REFEREE">Referee</option><option value="MATCH_COMMISSIONER">Match Commissioner</option><option value="TEAM_OFFICIAL">Team Official / Club Representative</option><option value="MATCH_DATA_OPERATOR">Match Data Operator</option><option value="MEDIA_OFFICER">Media Officer</option><option value="DISCIPLINARY_OFFICER">Disciplinary Officer</option><option value="LEAGUE_ADMIN">League Administrator</option></select>' +
      '<div id="saStaffClubWrap" hidden><label for="saStaffClub">Club represented</label><select id="saStaffClub"><option value="">Choose a club…</option></select></div>' +
      '<div class="btns"><button type="button" class="primary" id="saStaffInvite">Save invitation</button><button type="button" class="secondary" id="saStaffRefresh">Refresh staff register</button></div><div class="status" id="saStaffStatus" role="status"></div>' +
      '<h3>Pending invitations</h3><div id="saStaffInvites" class="muted">Loading invitations…</div>' +
      '<h3>Operational accounts</h3><div id="saStaffAccounts" class="muted">Loading accounts…</div>' +
      '<h3>Role and account activity</h3><div id="saStaffAudit" class="muted">Loading activity…</div></section>' +
      '<h2 class="rt">Downloads</h2>' +
      '<p class="muted">Super Admin only. Each download is recorded in the export log.</p>' +
      '<div class="btns"><button class="secondary" data-export="matches">Matches and results (CSV)</button>' +
      '<button class="secondary" data-export="standings">League table (CSV)</button>' +
      '<button class="secondary" data-export="suspensions">Suspensions (CSV)</button>' +
      '<button class="primary" data-export="full_backup">Full backup (JSON)</button></div>' +
      '<div id="exportMsg" class="muted" role="status"></div>' +
       '<h2 class="rt">Club Information Management</h2>' +
      '<p class="muted">Super Admin only. Maintain official club profiles shown on public club pages. Use approved club information and official crest links.</p>' +
      '<label for="clubProfileSelect">Select club to edit</label><select id="clubProfileSelect"><option value="">Loading clubs…</option></select>' +
      '<label for="clubProfileName">Official club name</label><input id="clubProfileName" type="text" maxlength="160">' +
      '<label for="clubProfileLeague">Competition</label><select id="clubProfileLeague"><option value="">No competition</option></select>' +
      '<label for="clubProfileLogo">Official club crest URL</label><input id="clubProfileLogo" type="url" maxlength="1000" placeholder="Paste the verified official crest URL">' +
      '<label for="clubProfileGround">Home ground / stadium</label><input id="clubProfileGround" type="text" maxlength="160">' +
      '<label for="clubProfileCity">Club city / district</label><input id="clubProfileCity" type="text" maxlength="120">' +
      '<label for="clubProfileFounded">Year founded</label><input id="clubProfileFounded" type="number" min="1850" max="2100">' +
      '<label for="clubProfileAbout">Official club description</label><textarea id="clubProfileAbout" rows="4" maxlength="1500" placeholder="Enter approved club history and profile details"></textarea>' +
      '<label class="terms-row"><input id="clubProfileActive" type="checkbox" checked> <span>Show club in public competition pages</span></label>' +
      '<div class="btns"><button class="primary" id="clubProfileSave" type="button">Save club profile</button><button class="secondary" id="clubProfileReset" type="button">Clear selection</button></div>' +
      '<div class="status" id="clubProfileStatus" role="status"></div>' +
      '<h3 class="rt">Add a club</h3>' +
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
      '<h2 class="rt">Match status</h2>' +
      '<label for="msMatch">Match</label><select id="msMatch"><option value="">Loading matches…</option></select>' +
      '<label for="msStatus">Status</label><select id="msStatus"><option value="SCHEDULED">Scheduled</option><option value="POSTPONED">Postponed</option><option value="RESCHEDULED">Rescheduled</option><option value="CANCELLED">Cancelled</option></select>' +
      input('msReason', 'Reason (optional)') +
      '<div class="btns"><button class="primary" id="msSave">Save status</button></div>' +
      '<section class="match-information-admin" aria-labelledby="matchInformationHeading"><h2 class="rt" id="matchInformationHeading">Match Information Management</h2><p class="muted">Edit published fixture details. This editor does not change scores, match events or referee submissions. Give an official reason when postponing, rescheduling or cancelling a match.</p>' +
      '<label for="miMatch">Select fixture to edit</label><select id="miMatch"><option value="">Loading fixtures…</option></select>' +
      '<label for="miLeague">Competition</label><select id="miLeague"><option value="">Choose competition…</option></select>' +
      '<label for="miSeason">Season</label><select id="miSeason"><option value="">Choose season…</option></select>' +
      input('miHome', 'Home team') + input('miAway', 'Away team') + input('miDate', 'Kick-off date and time', 'datetime-local') + input('miVenue', 'Match venue') +
      '<label for="miStatus">Fixture status</label><select id="miStatus"><option value="SCHEDULED">Scheduled</option><option value="POSTPONED">Postponed</option><option value="RESCHEDULED">Rescheduled</option><option value="CANCELLED">Cancelled</option><option value="LIVE" disabled>Live · referee controlled</option><option value="HT" disabled>Half Time · referee controlled</option><option value="FT" disabled>Full Time · referee controlled</option></select>' +
      '<label for="miReason">Official reason / status note</label><textarea id="miReason" rows="3" maxlength="1000" placeholder="Required for postponement, rescheduling or cancellation"></textarea>' +
      '<div class="btns"><button class="primary" id="miSave" type="button">Save match information</button><button class="secondary" id="miReset" type="button">Clear selection</button></div><div class="status" id="miStatusMsg" role="status"></div></section>' +
      '<h2 class="rt">Live match</h2>' +
      '<label for="lvMatch">Match</label><select id="lvMatch"><option value="">Loading matches…</option></select>' +
      '<p class="muted">The referee starts, pauses, times and ends the match.</p>' +
      '<div id="lvPanel" class="hidden"><p class="muted">Goals and cards are recorded by the assigned referees and the match commissioner.</p></div>' +
      '<section class="match-officials-admin" aria-labelledby="matchOfficialsHeading"><h2 class="rt" id="matchOfficialsHeading">Match Officials Management</h2><p class="muted">Super Admin only. Appoint Main and Assistant Referees, Match Commissioners and one Live Match Data Operator to each fixture. The Data Operator records live goals, cards and substitutions; the Main Referee alone controls the match clock and official result. Changes and cancellations are logged.</p>' +
      '<label for="asAssignment">Existing active appointment (optional)</label><select id="asAssignment"><option value="">Create a new appointment…</option></select>' +
      '<label for="asMatch">Fixture</label><select id="asMatch"><option value="">Loading fixtures…</option></select>' +
      '<label for="asRole">Official duty</label><select id="asRole"><option value="MAIN">Main referee</option><option value="ASSISTANT">Assistant referee</option><option value="MATCH_COMMISSIONER">Match Commissioner</option><option value="DATA_OPERATOR">Live Match Data Operator</option></select>' +
      '<label for="asRef">Staff member</label><select id="asRef"><option value="">Choose a duty first…</option></select>' +
      '<label for="asReason">Change / cancellation reason</label><textarea id="asReason" rows="2" maxlength="500" placeholder="Required when changing or cancelling an existing appointment"></textarea>' +
      '<div class="btns"><button class="primary" id="asSave" type="button">Save appointment</button><button class="secondary" id="asCancel" type="button" disabled>Cancel appointment</button><button class="secondary" id="asClear" type="button">Clear</button></div>' +
      '<div class="status" id="asStatus" role="status"></div><h3 class="rt">Appointment register</h3><div id="asAssignmentList" class="muted" aria-live="polite">Loading appointments…</div></section>' +
      '<h2 class="rt">News awaiting approval</h2><div id="reviewList" class="muted">Loading…</div>' +
      '<h2 class="rt">Published media</h2><div id="publishedMediaList" class="muted">Loading…</div>' +
      '<h2 class="rt">Media engagement · last 30 days</h2><div id="mediaAnalytics" class="muted">Loading…</div>' +
      '<h2 class="rt">Audit log</h2>' +
      '<p class="muted">Recent changes across the app, newest first. Read only.</p>' +
      '<label for="auDays">Show</label><select id="auDays"><option value="30">Last 30 days</option><option value="90" selected>Last 90 days</option><option value="365">Last year</option></select>' +
      '<label for="auArea">Area</label><select id="auArea"><option value="">All areas</option></select>' +
      '<div id="auditList" class="muted" aria-live="polite">Loading…</div>' +
      '<div id="usagePanel"><h2 class="rt">App usage, last 30 days</h2><div id="usageCounts" class="muted">Loading…</div></div>' +
      '<div class="status" id="roleMsg"></div>';

    $('fxSave').addEventListener('click', function () {
      var h = $('fxHome').value.trim(), a = $('fxAway').value.trim(), d = $('fxDate').value, v = $('fxVenue').value.trim();
      var leagueId = Number($('fxLeague').value), seasonId = Number($('fxSeason').value);
      if (!h || !a || !d) { msg('Enter both teams and the date.'); return; }
      if (!leagueId) { msg('Choose the league.'); return; }
      if (!seasonId) { msg('Choose the season.'); return; }
      var start = $('fxSave'); start.disabled = true;
      db.from('league_clubs').select('id,club_name,league_id,is_active').eq('league_id', leagueId).eq('is_active', true)
        .then(function (clubsResult) {
          if (clubsResult.error) throw clubsResult.error;
          var clubs = clubsResult.data || [];
          var home = clubs.filter(function (x) { return String(x.club_name).trim().toLowerCase() === h.toLowerCase(); })[0];
          var away = clubs.filter(function (x) { return String(x.club_name).trim().toLowerCase() === a.toLowerCase(); })[0];
          if (!home || !away) throw new Error('Both teams must match active club records in the selected competition.');
          if (String(home.id) === String(away.id)) throw new Error('A club cannot play itself.');
          return db.rpc('admin_import_fixtures', {p_rows:[{
            season_id:seasonId,league_id:leagueId,
            home_team:home.club_name,away_team:away.club_name,
            home_club_id:home.id,away_club_id:away.id,
            match_date:new Date(d).toISOString(),venue:v||null
          }]});
        }).then(function (r) {
          if (r && r.error) throw r.error;
          msg('Fixture added and both club records linked. Club Representatives can now see this fixture.');
          $('fxHome').value = ''; $('fxAway').value = ''; $('fxVenue').value = '';
          loadSuperAdminOverview(); loadStatusOptions(); loadAssignOptions();
        }).catch(function (error) {
          msg('Fixture was not saved: ' + (error.message || 'Check the selected clubs, season and kick-off time.'));
        }).finally(function () { start.disabled = false; });
    });

    
    loadLeagueOptions();
    var competitionPanel = $('superAdminCompetitionAdmin');
    if (competitionPanel) box().insertBefore(competitionPanel, box().firstChild);
    wireCompetitionAdmin();
    loadSuperAdminOverview();
    $('saRefreshOverview').onclick=loadSuperAdminOverview;
    wireSuperAdminStaffManagement();
    wireClubs();
    wireMatchInformationAdmin();
    loadReview();
    $('msSave').addEventListener('click', function () {
      var id = $('msMatch').value, st = $('msStatus').value, reason = $('msReason').value.trim();
      if (!id) { msg('Choose a match.'); return; }
      setMatch(id, { match_status: st, status_reason: reason || null, status_set_at: new Date().toISOString() }).then(function (r) {
        msg(r.error ? r.error.message : 'Status saved.'); $('msReason').value = ''; loadStatusOptions();
      });
    });
    loadStatusOptions();
    wireLive();
    wireOfficialAssignments();
    loadSeasonAdmin();
    loadAuditLog();
    wireImport();
    wireHistoricalStandings();
    wireCompetitionRulesAdmin();
    if ($('seasonAdd')) $('seasonAdd').addEventListener('click', function () {
      db.rpc('create_season', { p_name: $('seasonName').value.trim(), p_start: $('seasonStart').value, p_end: $('seasonEnd').value }).then(function (res) {
        if (res.error) { msg(res.error.message); return; }
        msg('Season added. Make it current when it starts.');
        $('seasonName').value = ''; $('seasonStart').value = ''; $('seasonEnd').value = '';
        loadSeasonAdmin();
      });
    });

  }

  function wireCompetitionRulesAdmin() {
    var selected = '', rules = [];
    function status(s) { $('rrRuleMsg').textContent = s || ''; }
    function reset() {
      selected = ''; $('rrRuleSelect').value = ''; $('rrRuleName').value = ''; $('rrRuleSeason').value = '';
      $('rrWin').value = 3; $('rrDraw').value = 1; $('rrLoss').value = 0;
      $('rrTieOrder').value = 'HEAD_TO_HEAD,GOAL_DIFFERENCE,GOALS_FOR';
      $('rrHeadToHead').checked = true; $('rrExtraTime').checked = true; $('rrPenalties').checked = true;
      $('rrRuleSave').textContent = 'Save and publish rule profile';
      status('New profile. Confirm official settings before publishing.');
    }
    function load() {
      Promise.all([
        db.from('competition_rules').select('id,season_id,competition_name,points_win,points_draw,points_loss,use_head_to_head,tiebreaker_order,knockout_extra_time,knockout_penalties,updated_at').order('updated_at',{ascending:false}),
        db.from('seasons').select('id,name').order('start_date',{ascending:false})
      ]).then(function (res) {
        if(res[0].error) throw res[0].error; if(res[1].error) throw res[1].error;
        rules=res[0].data||[];
        $('rrRuleSeason').innerHTML='<option value="">No season assigned</option>'+(res[1].data||[]).map(function(s){return '<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>';}).join('');
        $('rrRuleSelect').innerHTML='<option value="">Create a new rule profile…</option>'+rules.map(function(r){return '<option value="'+esc(r.id)+'">'+esc(r.competition_name)+' · '+esc(r.id)+'</option>';}).join('');
        $('rrRuleList').innerHTML=rules.length?rules.map(function(r){return '<div class="post"><strong>'+esc(r.competition_name)+'</strong><div class="muted">Season: '+esc(r.season_id||'Unassigned')+' · Points: '+esc(r.points_win)+'/'+esc(r.points_draw)+'/'+esc(r.points_loss)+' · Updated: '+esc(r.updated_at||'Unknown')+'</div></div>';}).join(''):'No rule profiles have been created.';
      }).catch(function(e){status('Could not load rule profiles: '+(e.message||'Unknown error'));});
    }
    function choose(id) {
      var r=rules.filter(function(x){return String(x.id)===String(id);})[0];
      if(!r){reset();return;} selected=String(r.id);
      $('rrRuleName').value=r.competition_name||''; $('rrRuleSeason').value=r.season_id==null?'':String(r.season_id);
      $('rrWin').value=r.points_win; $('rrDraw').value=r.points_draw; $('rrLoss').value=r.points_loss;
      $('rrTieOrder').value=Array.isArray(r.tiebreaker_order)?r.tiebreaker_order.join(','):'';
      $('rrHeadToHead').checked=!!r.use_head_to_head; $('rrExtraTime').checked=!!r.knockout_extra_time; $('rrPenalties').checked=!!r.knockout_penalties;
      $('rrRuleSave').textContent='Update and publish rule profile'; status('Editing selected profile. Changes appear in the public Records and Rules panel.');
    }
    $('rrRuleSelect').addEventListener('change',function(){choose(this.value);});
    $('rrRuleNew').addEventListener('click',reset);
    $('rrRuleSave').addEventListener('click',function(){
      var name=$('rrRuleName').value.trim(), win=Number($('rrWin').value), draw=Number($('rrDraw').value), loss=Number($('rrLoss').value);
      var order=$('rrTieOrder').value.split(',').map(function(x){return x.trim().toUpperCase();}).filter(Boolean);
      var allowed=['HEAD_TO_HEAD','GOAL_DIFFERENCE','GOALS_FOR','FAIR_PLAY','DRAW'];
      if(!name){status('Enter the official competition name.');return;}
      if(![win,draw,loss].every(function(x){return Number.isInteger(x)&&x>=0&&x<=20;})){status('Points must be whole numbers from 0 to 20.');return;}
      if(!order.length||order.some(function(x){return allowed.indexOf(x)===-1;})||new Set(order).size!==order.length){status('Enter a valid, non-duplicated tie-break order.');return;}
      var payload={competition_name:name,season_id:$('rrRuleSeason').value?Number($('rrRuleSeason').value):null,points_win:win,points_draw:draw,points_loss:loss,use_head_to_head:$('rrHeadToHead').checked,tiebreaker_order:order,knockout_extra_time:$('rrExtraTime').checked,knockout_penalties:$('rrPenalties').checked,updated_at:new Date().toISOString()};
      if(selected)payload.id=Number(selected);
      $('rrRuleSave').disabled=true;
      db.from('competition_rules').upsert(payload).select('id').single().then(function(r){
        $('rrRuleSave').disabled=false;if(r.error){status('Save failed: '+r.error.message);return;}
        status('Rule profile saved and published.');load();
      }).catch(function(e){$('rrRuleSave').disabled=false;status('Save failed: '+(e.message||'Unknown error'));});
    });
    $('rrRuleDelete').addEventListener('click',function(){
      if(!selected){status('Select an existing profile first.');return;}
      if(!window.confirm('Delete this competition rule profile?'))return;
      db.from('competition_rules').delete().eq('id',Number(selected)).then(function(r){
        if(r.error){status('Delete failed: '+r.error.message);return;}status('Rule profile deleted.');reset();load();
      });
    });
    load();
  }

  var officialMatches = [], officialProfiles = [], officialAssignments = [];
  function officialDutyOptions() {
    var role = $('asRole').value;
    var people = officialProfiles.filter(function (u) {
      var title = String(u.official_title || '').trim().toLowerCase();
      var systemRole = String(u.system_role || '').toUpperCase();
      if (String(u.status || '').toLowerCase() !== 'active') return false;
      if (role === 'MATCH_COMMISSIONER') return systemRole === 'REFEREE' && title === 'match commissioner';
      if (role === 'DATA_OPERATOR') return systemRole === 'MATCH_DATA_OPERATOR';
      return systemRole === 'REFEREE' && title !== 'match commissioner';
    });
    $('asRef').innerHTML = '<option value="">Choose a staff member…</option>' + people.map(function (u) {
      return '<option value="' + esc(u.id) + '">' + esc(u.full_name || u.email) + (u.official_title ? ' (' + esc(u.official_title) + ')' : '') + '</option>';
    }).join('') + (people.length ? '' : '<option value="">No eligible active staff accounts found</option>');
  }
  function renderOfficialAssignments() {
    var active = officialAssignments.filter(function (x) { return x.assignment_status === 'ACTIVE'; });
    var cancelled = officialAssignments.filter(function (x) { return x.assignment_status === 'CANCELLED'; });
    $('asAssignment').innerHTML = '<option value="">Create a new appointment…</option>' + active.map(function (x) {
      var m = officialMatches.filter(function (v) { return String(v.id) === String(x.match_id); })[0] || {};
      var u = officialProfiles.filter(function (v) { return String(v.id) === String(x.referee_user_id); })[0] || {};
      return '<option value="' + esc(x.id) + '">' + esc(m.home_team || 'Fixture') + ' v ' + esc(m.away_team || '') + ' · ' + esc(x.official_role.replace(/_/g,' ')) + ' · ' + esc(u.full_name || u.email || 'Staff account') + '</option>';
    }).join('');
    var markup = active.map(function (x) {
      var m = officialMatches.filter(function (v) { return String(v.id) === String(x.match_id); })[0] || {};
      var u = officialProfiles.filter(function (v) { return String(v.id) === String(x.referee_user_id); })[0] || {};
      return '<article class="post"><strong>' + esc(m.home_team || 'Fixture') + ' v ' + esc(m.away_team || '') + '</strong><div class="muted">' +
        esc(x.official_role.replace(/_/g,' ')) + ' · ' + esc(u.full_name || u.email || 'Staff account') + ' · Active</div>' +
        '<div class="btns"><button type="button" class="secondary" data-as-edit="' + esc(x.id) + '">Edit appointment</button><button type="button" class="secondary" data-as-cancel="' + esc(x.id) + '">Cancel appointment</button></div></article>';
    }).join('');
    if (cancelled.length) markup += '<h4>Cancelled appointment history</h4>' + cancelled.map(function (x) {
      var m = officialMatches.filter(function (v) { return String(v.id) === String(x.match_id); })[0] || {};
      var u = officialProfiles.filter(function (v) { return String(v.id) === String(x.referee_user_id); })[0] || {};
      return '<article class="post"><strong>' + esc(m.home_team || 'Fixture') + ' v ' + esc(m.away_team || '') + '</strong><div class="muted">' +
        esc(x.official_role.replace(/_/g,' ')) + ' · ' + esc(u.full_name || u.email || 'Staff account') + ' · Cancelled</div><p>' + esc(x.change_reason || 'No reason recorded') + '</p></article>';
    }).join('');
    $('asAssignmentList').innerHTML = markup || 'No match officials have been appointed yet.';
  }
  function loadAssignOptions() {
    Promise.all([
      db.from('matches').select('id, home_team, away_team, match_date').order('match_date', { ascending: false }).limit(500),
      db.from('user_profiles').select('id, full_name, email, official_title, status, system_role').in('system_role', ['REFEREE','MATCH_DATA_OPERATOR']).order('full_name'),
      db.from('match_referee_assignments').select('id,match_id,referee_user_id,official_role,assignment_status,assigned_at,change_reason').order('assigned_at', { ascending: false }).limit(500)
    ]).then(function (all) {
      if (all[0].error || all[1].error || all[2].error) {
        $('asStatus').textContent = 'Appointments could not be loaded: ' + ((all[0].error || all[1].error || all[2].error).message || 'Unknown error');
        return;
      }
      officialMatches = all[0].data || [];
      officialProfiles = all[1].data || [];
      officialAssignments = all[2].data || [];
      var currentMatch = $('asMatch').value;
      $('asMatch').innerHTML = '<option value="">Choose a fixture…</option>' + officialMatches.map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + ' · ' + esc(new Date(m.match_date).toLocaleDateString()) + '</option>';
      }).join('');
      if (currentMatch) $('asMatch').value = currentMatch;
      officialDutyOptions();
      renderOfficialAssignments();
    });
  }
  function wireOfficialAssignments() {
    if (!$('asSave') || $('asSave').dataset.wired) return;
    $('asSave').dataset.wired = '1';
    function status(s) { $('asStatus').textContent = s || ''; }
    function clear() {
      $('asAssignment').value = ''; $('asMatch').value = ''; $('asReason').value = '';
      $('asCancel').disabled = true; $('asSave').textContent = 'Save appointment';
      officialDutyOptions(); status('Select a fixture and duty to create an appointment.');
    }
    function choose(id) {
      var row = officialAssignments.filter(function (x) { return String(x.id) === String(id) && x.assignment_status === 'ACTIVE'; })[0];
      if (!row) { clear(); return; }
      $('asAssignment').value = String(row.id); $('asMatch').value = String(row.match_id);
      $('asRole').value = row.official_role; officialDutyOptions(); $('asRef').value = row.referee_user_id;
      $('asReason').value = ''; $('asCancel').disabled = false;
      $('asSave').textContent = 'Save changes'; status('Editing an active appointment. Enter a reason before saving changes.');
    }
    $('asRole').addEventListener('change', function () { officialDutyOptions(); });
    $('asAssignment').addEventListener('change', function () { choose(this.value); });
    $('asAssignmentList').addEventListener('click', function (e) {
      var edit = e.target.closest('[data-as-edit]'), cancel = e.target.closest('[data-as-cancel]');
      if (edit) { choose(edit.getAttribute('data-as-edit')); $('asAssignment').scrollIntoView({behavior:'smooth',block:'center'}); }
      if (cancel) { choose(cancel.getAttribute('data-as-cancel')); status('Enter a cancellation reason, then select Cancel appointment.'); $('asReason').focus(); }
    });
    $('asClear').addEventListener('click', clear);
    $('asSave').addEventListener('click', function () {
      var matchId = $('asMatch').value, officialId = $('asRef').value, role = $('asRole').value;
      var assignmentId = $('asAssignment').value, reason = $('asReason').value.trim();
      if (!matchId || !officialId) { status('Choose a fixture and an eligible staff member.'); return; }
      if (assignmentId && reason.length < 5) { status('Enter a change reason of at least 5 characters.'); return; }
      db.auth.getUser().then(function (u) {
        if (!u.data || !u.data.user) throw new Error('Your session has expired. Sign in again.');
        var payload = { match_id:Number(matchId), referee_user_id:officialId, official_role:role, assignment_status:'ACTIVE' };
        if (assignmentId) {
          payload.change_reason = reason;
          return db.from('match_referee_assignments').update(payload).eq('id', assignmentId).select('id').single();
        }
        payload.assigned_by = u.data.user.id;
        return db.from('match_referee_assignments').insert([payload]).select('id').single();
      }).then(function (r) {
        if (r && r.error) throw r.error;
        status(assignmentId ? 'Appointment updated.' : 'Official appointed to the fixture.');
        clear(); loadAssignOptions();
      }).catch(function (e) { status('Appointment was not saved: ' + (e.message || 'Check the fixture and existing appointments.')); });
    });
    $('asCancel').addEventListener('click', function () {
      var id = $('asAssignment').value, reason = $('asReason').value.trim();
      if (!id) { status('Select an active appointment first.'); return; }
      if (reason.length < 5) { status('Enter a cancellation reason of at least 5 characters.'); return; }
      if (!window.confirm('Cancel this match-official appointment? The history will be retained.')) return;
      db.from('match_referee_assignments').update({ assignment_status:'CANCELLED', change_reason:reason }).eq('id', id).then(function (r) {
        if (r.error) { status('Cancellation failed: ' + r.error.message); return; }
        status('Appointment cancelled. The record remains in the history.');
        clear(); loadAssignOptions();
      });
    });
    loadAssignOptions();
  }

  // Problems fans report from match details. Staff mark each one resolved once it is checked.
  // Bulk import of matches from a CSV file. Checks every row first; only valid rows are imported.
  var impRows = [];
  var IMP_HEADERS = ['season', 'league', 'date', 'time', 'home_team', 'away_team', 'venue'];
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
    // Header-only template prevents example fixtures from being imported as real SLFA match records.
    var csv = IMP_HEADERS.join(',') + '\r\n';
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
      if (head.indexOf('home_score') !== -1 || head.indexOf('away_score') !== -1 || head.indexOf('status') !== -1) { box.textContent = 'This importer schedules fixtures only. Remove score and status columns; official final scores are submitted by the assigned referee.'; return; }
      var missing = ['season', 'league', 'date', 'home_team', 'away_team'].filter(function (h) { return head.indexOf(h) < 0; });
      if (missing.length) { box.textContent = 'Missing column: ' + missing.join(', ') + '.'; return; }
      Promise.all([
        db.from('seasons').select('id, name').then(function (r) { if (r.error) throw r.error; return r.data || []; }),
        db.from('leagues').select('id, name, is_active').then(function (r) { if (r.error) throw r.error; return r.data || []; }),
        db.from('league_clubs').select('id,club_name,league_id,is_active').then(function (r) { if (r.error) throw r.error; return r.data || []; }),
        db.from('matches').select('season_id, league_id, home_team, away_team, home_club_id, away_club_id, match_date').limit(5000).then(function (r) { if (r.error) throw r.error; return r.data || []; })
      ]).then(function (res) {
        var seasons = {}, leagues = {}, clubs = {}, existing = {};
        res[0].forEach(function (x) { seasons[x.name.trim().toLowerCase()] = x.id; });
        res[1].forEach(function (x) { if (x.is_active) leagues[x.name.trim().toLowerCase()] = x.id; });
        res[2].forEach(function (x) { clubs[x.club_name.trim().toLowerCase()] = x; });
        res[3].forEach(function (m) {
          existing[[m.season_id, m.league_id, String(m.home_team).trim().toLowerCase(), String(m.away_team).trim().toLowerCase(), String(m.match_date).slice(0, 10)].join('|')] = true;
        });
        var ok = [], problems = [], skipped = 0, seen = {};
        table.slice(1).forEach(function (cells, idx) {
          var line = idx + 2, g = {};
          head.forEach(function (h, i) { g[h] = (cells[i] || '').trim(); });
          var bad = [];
          var seasonId = seasons[(g.season || '').toLowerCase()], leagueId = leagues[(g.league || '').toLowerCase()];
          if (!seasonId) bad.push('season "' + g.season + '" is not in the app');
          if (!leagueId) bad.push('active league "' + g.league + '" is not in the app');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date || '')) bad.push('date must look like 2026-01-10');
          else {
            var dp=g.date.split('-').map(Number), validDate=new Date(Date.UTC(dp[0],dp[1]-1,dp[2]));
            if (validDate.toISOString().slice(0,10)!==g.date) bad.push('date is not a valid calendar date');
          }
          var time = g.time || '15:00';
          if (!/^\d{2}:\d{2}$/.test(time)) bad.push('time must look like 15:00');
          else {
            var tp=time.split(':').map(Number);
            if (tp[0]>23 || tp[1]>59) bad.push('time must be between 00:00 and 23:59');
          }
          var home = clubs[(g.home_team || '').toLowerCase()], away = clubs[(g.away_team || '').toLowerCase()];
          if (!home || !home.is_active) bad.push('home club "' + g.home_team + '" is not an active club in the app');
          if (!away || !away.is_active) bad.push('away club "' + g.away_team + '" is not an active club in the app');
          if (home && away && String(home.id)===String(away.id)) bad.push('home and away clubs are the same');
          if (home && leagueId && Number(home.league_id)!==Number(leagueId)) bad.push('home club "'+g.home_team+'" does not belong to "'+g.league+'"');
          if (away && leagueId && Number(away.league_id)!==Number(leagueId)) bad.push('away club "'+g.away_team+'" does not belong to "'+g.league+'"');
          if (bad.length) { problems.push('Row ' + line + ': ' + bad.join('; ')); return; }
          var key = [seasonId, leagueId, home.club_name.toLowerCase(), away.club_name.toLowerCase(), g.date].join('|');
          if (existing[key] || seen[key]) { skipped += 1; return; }
          seen[key] = true;
          ok.push({
            home_team:home.club_name, away_team:away.club_name,
            home_club_id:home.id, away_club_id:away.id,
            match_date:g.date + 'T' + time + ':00Z', venue:g.venue || null,
            season_id:seasonId, league_id:leagueId
          });
        });
        impRows = ok;
        var html = '<p><strong>' + ok.length + ' ready to import</strong>' + (skipped ? ', ' + skipped + ' already in the app and skipped' : '') + (problems.length ? ', ' + problems.length + ' with problems that need fixing first' : '') + '.</p>';
        if (problems.length) html += '<ul>' + problems.slice(0, 30).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + (problems.length > 30 ? '<p>…and ' + (problems.length - 30) + ' more.</p>' : '');
        box.innerHTML = html;
        $('impGo').disabled = ok.length === 0 || problems.length > 0 || ok.length > 1000;
        if (ok.length > 1000) box.innerHTML += '<p>Import up to 1,000 fixtures in one batch. Split this file into smaller files.</p>';
      }).catch(function (error) {
        impRows = []; $('impGo').disabled = true;
        box.textContent = 'Could not validate the fixture file: ' + (error.message || 'Check the database connection and retry.');
      });
    };
    reader.readAsText(f);
  }
  function impGo() {
    if (!impRows.length || impRows.length>1000) return;
    var go=$('impGo'), rows=impRows.slice();
    go.disabled=true; go.textContent='Importing safely…';
    db.rpc('admin_import_fixtures',{p_rows:rows}).then(function(r){
      if(r.error) throw r.error;
      var data=r.data||{};
      $('impPreview').textContent='Import complete. '+Number(data.inserted||rows.length)+' fixture(s) saved. Both club IDs, competition and season were linked. No partial import was committed.';
      msg('Fixture import completed successfully.');
      impRows=[];
      $('impFile').value='';
      loadSuperAdminOverview(); loadStatusOptions(); loadAssignOptions();
    }).catch(function(error){
      $('impPreview').textContent='Import failed. No fixture rows were saved. '+(error.message||'Correct the file and retry.');
      msg('Fixture import failed. No partial import was committed.');
    }).finally(function(){
      go.disabled=false; go.textContent='Import matches';
    });
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

  // Usage counts from the privacy-light event log (Super Admins and Developers only)
  var usageLabels = { app_open: 'App opened', tab_matches: 'Matches tab', tab_table: 'Table tab', tab_teams: 'Teams tab', tab_players: 'Players tab', tab_news: 'News tab', tab_videos: 'Videos tab', 'tab_records-rules': 'Records & Rules tab', 'tab_publications': 'Publications tab', language_en: 'English chosen', language_fr: 'French chosen', language_kri: 'Krio chosen', theme_light: 'Light mode on', theme_dark: 'Dark mode on', favourite_club: 'Favourite club changed', match_details: 'Match details opened' };
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
      ['fxSeason'].forEach(function (id) {
        var el = $(id); if (!el) return;
        el.innerHTML = '<option value="">Choose a season…</option>' + opts;
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
              loadSeasonAdmin(); 
            });
          });
        });
      }
      
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

  function wireMatchInformationAdmin() {
    var select = $('miMatch'), status = $('miStatusMsg'), matches = [], leagues = [], seasons = [];
    if (!select || !$('miSave')) return;
    function note(s) { if (status) status.textContent = s || ''; }
    function toLocalDate(value) {
      if (!value) return '';
      var d = new Date(value);
      if (isNaN(d.getTime())) return '';
      var pad = function(n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function clear() {
      select.value = ''; $('miLeague').value = ''; $('miSeason').value = '';
      $('miHome').value = ''; $('miAway').value = ''; $('miDate').value = '';
      $('miVenue').value = ''; $('miStatus').disabled = false; $('miStatus').value = 'SCHEDULED'; $('miReason').value = '';
      note('Select a fixture to edit its official information.');
    }
    function load() {
      Promise.all([
        db.from('matches').select('id,match_date,home_team,away_team,home_club_id,away_club_id,venue,match_status,status_reason,season_id,league_id,home_score,away_score').order('match_date',{ascending:false}).limit(500),
        db.from('leagues').select('id,name,is_active').order('sort_order'),
        db.from('seasons').select('id,name,start_date,end_date').order('start_date',{ascending:false})
      ]).then(function(all) {
        if (all[0].error) { note('Fixtures could not be loaded: ' + all[0].error.message); return; }
        if (all[1].error) { note('Competitions could not be loaded: ' + all[1].error.message); return; }
        if (all[2].error) { note('Seasons could not be loaded: ' + all[2].error.message); return; }
        matches = all[0].data || []; leagues = all[1].data || []; seasons = all[2].data || [];
        $('miLeague').innerHTML = '<option value="">No competition assigned</option>' + leagues.map(function(l) {
          return '<option value="' + esc(l.id) + '">' + esc(l.name) + (l.is_active ? '' : ' · archived') + '</option>';
        }).join('');
        $('miSeason').innerHTML = '<option value="">No season assigned</option>' + seasons.map(function(s) {
          return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>';
        }).join('');
        select.innerHTML = '<option value="">Choose a fixture…</option>' + matches.map(function(m) {
          return '<option value="' + esc(m.id) + '">' + esc(m.home_team || 'TBC') + ' v ' + esc(m.away_team || 'TBC') + ' · ' + esc(m.match_date ? new Date(m.match_date).toLocaleString() : 'Date not set') + ' · ' + esc(m.match_status) + '</option>';
        }).join('');
        note(matches.length + ' fixture(s) loaded.');
      }).catch(function(e) { note('Could not load fixtures: ' + (e.message || 'Unknown error')); });
    }
    function choose(id) {
      var m = matches.filter(function(x) { return String(x.id) === String(id); })[0];
      if (!m) { clear(); return; }
      $('miLeague').value = m.league_id == null ? '' : String(m.league_id);
      $('miSeason').value = m.season_id == null ? '' : String(m.season_id);
      $('miHome').value = m.home_team || ''; $('miAway').value = m.away_team || '';
      $('miDate').value = toLocalDate(m.match_date); $('miVenue').value = m.venue || '';
      var currentStatus = String(m.match_status || 'SCHEDULED').toUpperCase();
      $('miStatus').value = ['SCHEDULED','POSTPONED','RESCHEDULED','CANCELLED','LIVE','HT','FT'].indexOf(currentStatus) >= 0 ? currentStatus : 'SCHEDULED';
      $('miStatus').disabled = ['LIVE','HT','FT'].indexOf(currentStatus) >= 0;
      $('miReason').value = m.status_reason || '';
      note('Editing fixture #' + m.id + '. Score and match events are protected from this editor.');
    }
    select.addEventListener('change', function() { choose(this.value); });
    $('miReset').addEventListener('click', clear);
    $('miSave').addEventListener('click', function() {
      var id = select.value, home = $('miHome').value.trim(), away = $('miAway').value.trim();
      var date = $('miDate').value, nextStatus = $('miStatus').value, reason = $('miReason').value.trim();
      if (!id) { note('Select a fixture first.'); return; }
      if (!home || !away || !date || isNaN(new Date(date).getTime())) { note('Enter both teams and a valid kick-off date and time.'); return; }
      if (home.toLowerCase() === away.toLowerCase()) { note('Home and away teams must be different.'); return; }
      if (['POSTPONED','RESCHEDULED','CANCELLED'].indexOf(nextStatus) >= 0 && reason.length < 5) {
        note('Enter an official reason of at least 5 characters for this status.'); return;
      }
      var previous = matches.filter(function(x) { return String(x.id) === String(id); })[0];
      var leagueId = $('miLeague').value ? Number($('miLeague').value) : null;
      var seasonId = $('miSeason').value ? Number($('miSeason').value) : null;
      if (!leagueId || !seasonId) { note('Choose the competition and season for this fixture.'); return; }
      if (previous && ['LIVE','HT','FT'].indexOf(String(previous.match_status).toUpperCase()) >= 0) {
        note('A live or completed fixture cannot have its clubs, competition, season or kick-off changed here.');
        return;
      }
      var payload = {
        league_id: leagueId, season_id: seasonId,
        home_team: home, away_team: away, match_date: new Date(date).toISOString(),
        venue: $('miVenue').value.trim() || null, match_status: nextStatus,
        status_reason: reason || null,
        change_reason: (reason || 'Fixture information updated by Super Admin') + ' · ' + new Date().toISOString()
      };
      if (!previous || String(previous.match_status).toUpperCase() !== nextStatus || ['POSTPONED','RESCHEDULED','CANCELLED'].indexOf(nextStatus) >= 0) {
        payload.status_set_at = new Date().toISOString();
        payload.status_set_by = null;
      }
      $('miSave').disabled = true; note('Checking both club records…');
      db.from('league_clubs').select('id,club_name,league_id,is_active').eq('league_id', leagueId).eq('is_active', true)
        .then(function(clubResult) {
          if (clubResult.error) throw clubResult.error;
          var clubs = clubResult.data || [];
          var homeClub = clubs.filter(function(x) { return String(x.club_name).trim().toLowerCase() === home.toLowerCase(); })[0];
          var awayClub = clubs.filter(function(x) { return String(x.club_name).trim().toLowerCase() === away.toLowerCase(); })[0];
          if (!homeClub || !awayClub) throw new Error('Both team names must match active clubs in the selected competition.');
          if (String(homeClub.id) === String(awayClub.id)) throw new Error('A club cannot play itself.');
          payload.home_team = homeClub.club_name; payload.away_team = awayClub.club_name;
          payload.home_club_id = homeClub.id; payload.away_club_id = awayClub.id;
          return db.auth.getUser();
        }).then(function(u) {
          if (!u || !u.data || !u.data.user) throw new Error('Your session has expired. Sign in again.');
          if (payload.status_set_at) payload.status_set_by = u.data.user.id;
          return db.from('matches').update(payload).eq('id', Number(id)).select('id').maybeSingle();
        }).then(function(r) {
          $('miSave').disabled = false;
          if (r.error) { note('Save failed: ' + r.error.message); return; }
          if (!r.data) { note('No fixture was updated. Check your Super Admin access.'); return; }
          note('Match information saved. Both club records remain linked. Scores and referee event records were not changed.');
          loadStatusOptions(); loadAssignOptions(); load();
        }).catch(function(e) { $('miSave').disabled = false; note('Save failed: ' + (e.message || 'Unknown error')); });
    });
    load();
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
      $('coSeason').value = '';
      $('coStartDate').value = '';
      $('coEndDate').value = '';
      $('coVenue').value = '';
      $('coFormatDetails').value = '';
      $('coLogo').value = '';
      $('coSort').value = '10';
      $('coActive').checked = true;
      $('coSave').textContent = 'Save competition';
    }
    function load() {
      Promise.all([db.from('leagues').select('id,name,competition_type,gender_category,description,logo_url,sort_order,is_active,season_id,start_date,end_date,venue,format_details').order('sort_order'),db.from('seasons').select('id,name,start_date,end_date').order('start_date',{ascending:false})]).then(function (all) {
        var r=all[0], seasonsResult=all[1];
        if (seasonsResult.error) { msg('Season list could not be loaded: '+seasonsResult.error.message); return; }
        $('coSeason').innerHTML='<option value="">No season assigned</option>'+(seasonsResult.data||[]).map(function(s){return '<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>';}).join('');
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
      $('coSeason').value = row.season_id == null ? '' : String(row.season_id);
      $('coStartDate').value = row.start_date || '';
      $('coEndDate').value = row.end_date || '';
      $('coVenue').value = row.venue || '';
      $('coFormatDetails').value = row.format_details || '';
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
      var start=$('coStartDate').value, end=$('coEndDate').value;
      if(start && end && end<start){msg('Competition end date cannot be earlier than its start date.');return;}
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
        p_is_active: $('coActive').checked,
        p_season_id: $('coSeason').value ? Number($('coSeason').value) : null,
        p_start_date: start || null,
        p_end_date: end || null,
        p_venue: $('coVenue').value.trim() || null,
        p_format_details: $('coFormatDetails').value.trim() || null
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
    wireClubProfileEditor();
  }
  function wireClubProfileEditor() {
    var select = $('clubProfileSelect'), status = $('clubProfileStatus'), clubs = [];
    if (!select || !$('clubProfileSave')) return;
    function note(s) { if (status) status.textContent = s || ''; }
    function clear() {
      select.value = ''; $('clubProfileName').value = ''; $('clubProfileLeague').value = '';
      $('clubProfileLogo').value = ''; $('clubProfileGround').value = ''; $('clubProfileCity').value = '';
      $('clubProfileFounded').value = ''; $('clubProfileAbout').value = ''; $('clubProfileActive').checked = true;
      note('Select a club to edit its official profile.');
    }
    function load() {
      Promise.all([
        db.from('league_clubs').select('id,club_name,league_id,logo_url,stadium,city,founded_year,about,is_active').order('club_name'),
        db.from('leagues').select('id,name').order('sort_order')
      ]).then(function(all) {
        if (all[0].error) { note('Club profiles could not be loaded: ' + all[0].error.message); return; }
        if (all[1].error) { note('Competitions could not be loaded: ' + all[1].error.message); return; }
        clubs = all[0].data || [];
        select.innerHTML = '<option value="">Choose a club…</option>' + clubs.map(function(c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.club_name) + (c.is_active ? '' : ' · unpublished') + '</option>';
        }).join('');
        $('clubProfileLeague').innerHTML = '<option value="">No competition</option>' + (all[1].data || []).map(function(l) {
          return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>';
        }).join('');
        note(clubs.length + ' club profile(s) available.');
      }).catch(function(e) { note(e.message || 'Club profiles could not be loaded.'); });
    }
    select.addEventListener('change', function() {
      var c = clubs.find(function(x) { return String(x.id) === String(select.value); });
      if (!c) { clear(); return; }
      $('clubProfileName').value = c.club_name || '';
      $('clubProfileLeague').value = c.league_id == null ? '' : String(c.league_id);
      $('clubProfileLogo').value = c.logo_url || '';
      $('clubProfileGround').value = c.stadium || '';
      $('clubProfileCity').value = c.city || '';
      $('clubProfileFounded').value = c.founded_year == null ? '' : String(c.founded_year);
      $('clubProfileAbout').value = c.about || '';
      $('clubProfileActive').checked = !!c.is_active;
      note('Editing ' + c.club_name + '.');
    });
    $('clubProfileReset').addEventListener('click', clear);
    $('clubProfileSave').addEventListener('click', function() {
      var id = select.value, name = $('clubProfileName').value.trim();
      var foundedRaw = $('clubProfileFounded').value.trim();
      var founded = foundedRaw ? Number(foundedRaw) : null;
      if (!id) { note('Select a club first.'); return; }
      if (name.length < 2) { note('Enter the official club name.'); return; }
      if (founded !== null && (!Number.isInteger(founded) || founded < 1850 || founded > 2100)) { note('Enter a valid founding year between 1850 and 2100.'); return; }
      var payload = {
        club_name: name,
        league_id: $('clubProfileLeague').value ? Number($('clubProfileLeague').value) : null,
        logo_url: $('clubProfileLogo').value.trim() || null,
        stadium: $('clubProfileGround').value.trim() || null,
        city: $('clubProfileCity').value.trim() || null,
        founded_year: founded,
        about: $('clubProfileAbout').value.trim() || null,
        is_active: $('clubProfileActive').checked
      };
      var button = $('clubProfileSave'); button.disabled = true; note('Saving official club profile…');
      db.from('league_clubs').update(payload).eq('id', id).then(function(res) {
        button.disabled = false;
        if (res.error) { note('Save failed: ' + res.error.message); return; }
        note('Club profile saved. Public club pages will show the updated information.');
        load(); loadClubAdmin();
      }).catch(function(e) { button.disabled = false; note(e.message || 'Club profile save failed.'); });
    });
    load();
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
  function loadReview(){
    var host=$('reviewList');if(!host)return;
    db.from('media_posts').select('id,title,category,body,image_url,video_url,gallery_urls,media_type,interviewee,media_metadata,created_by_name,submitted_at').eq('status','SUBMITTED').order('submitted_at',{ascending:true}).then(function(r){
      if(r.error){host.textContent='Could not load submissions: '+r.error.message;return;}var rows=r.data||[];
      return Promise.all(rows.map(function(p){var staged=p.media_metadata&&p.media_metadata.staged_assets||{},photoPaths=staged.photos||[];var photoJobs=photoPaths.map(function(path){return db.storage.from('slfa-media-staging').createSignedUrl(path,3600).then(function(x){return x.data&&x.data.signedUrl||'';});});var videoJob=staged.video?db.storage.from('slfa-media-staging').createSignedUrl(staged.video,3600).then(function(x){return x.data&&x.data.signedUrl||'';}):Promise.resolve('');return Promise.all([Promise.all(photoJobs),videoJob]).then(function(v){p._stagedPhotos=v[0].filter(Boolean);p._stagedVideo=v[1];return p;});})).then(function(prepared){
        host.innerHTML=prepared.length?prepared.map(function(p){var pics=(Array.isArray(p.gallery_urls)?p.gallery_urls:[]).concat(p._stagedPhotos||[]);if(p.image_url&&pics.indexOf(p.image_url)<0)pics.unshift(p.image_url);var report=p.media_metadata&&p.media_metadata.report,reportText=report&&typeof report==='object'?Object.keys(report).map(function(k){return k.replace(/_/g,' ').toUpperCase()+': '+(report[k]||'');}).join('\n'):String(report||'');var previewVideo=p.video_url||p._stagedVideo;
          return '<article class="post pm-review-card"><div class="muted">'+esc(p.media_type||p.category)+' · submitted by '+esc(p.created_by_name||'Media Officer')+'</div><strong>'+esc(p.title)+'</strong><p>'+esc(p.body||'')+'</p>'+(pics.length?'<div class="pm-review-thumbs">'+pics.map(function(u){return '<a href="'+esc(u)+'" target="_blank" rel="noopener"><img src="'+esc(u)+'" alt="Submitted media"></a>';}).join('')+'</div>':'')+(previewVideo?'<p><a href="'+esc(previewVideo)+'" target="_blank" rel="noopener">Preview uploaded or linked video ↗</a></p>':'')+(p.interviewee?'<p>Interview subject: '+esc(p.interviewee)+'</p>':'')+(reportText?'<pre class="pm-review-report">'+esc(reportText)+'</pre>':'')+'<label for="mediaReviewNote'+esc(p.id)+'">Review note</label><textarea id="mediaReviewNote'+esc(p.id)+'" rows="2" placeholder="Required when returning or rejecting"></textarea><div class="btns"><button class="primary" data-pub="'+esc(p.id)+'">Approve &amp; publish</button><button class="secondary" data-ret="'+esc(p.id)+'">Return for changes</button><button class="secondary" data-rej="'+esc(p.id)+'">Reject</button></div></article>';
        }).join(''):'Nothing waiting for approval.';
        host.querySelectorAll('[data-pub]').forEach(function(b){b.onclick=function(){decide(b.dataset.pub,'PUBLISHED','');};});host.querySelectorAll('[data-ret]').forEach(function(b){b.onclick=function(){decide(b.dataset.ret,'RETURNED',($('mediaReviewNote'+b.dataset.ret)||{}).value||'');};});host.querySelectorAll('[data-rej]').forEach(function(b){b.onclick=function(){decide(b.dataset.rej,'REJECTED',($('mediaReviewNote'+b.dataset.rej)||{}).value||'');};});
      });
    });loadPublishedMedia();loadMediaAnalytics();
  }
  function decide(id,status,note,skipConfirm){
    if((status==='RETURNED'||status==='REJECTED')&&!String(note||'').trim()){msg('Add a review note before returning or rejecting.');return;}if(status==='REJECTED'&&!skipConfirm&&!confirm('Remove this item from public view?'))return;
    db.auth.getUser().then(function(u){if(!u.data||!u.data.user)throw new Error('Session expired. Sign in again.');var reviewer=u.data.user.id,upd={status:status,review_note:String(note||'').trim()||null,reviewed_by:reviewer,reviewed_at:new Date().toISOString()};
      if(status!=='PUBLISHED')return db.from('media_posts').update(upd).eq('id',id);
      return db.from('media_posts').select('id,image_url,video_url,gallery_urls,media_metadata').eq('id',id).single().then(function(rowResult){if(rowResult.error)throw rowResult.error;var row=rowResult.data,staged=row.media_metadata&&row.media_metadata.staged_assets||{},photoPaths=staged.photos||[],videoPath=staged.video||null;
        function publishPath(path,index,label){var leaf=path.split('/').pop(),dest=reviewer+'/'+id+'/'+Date.now()+'-'+label+'-'+index+'-'+leaf;return db.storage.from('slfa-media-staging').copy(path,dest,{destinationBucket:'slfa-media'}).then(function(copy){if(copy.error)throw copy.error;return db.storage.from('slfa-media').getPublicUrl(dest).data.publicUrl;});}
        return Promise.all(photoPaths.map(function(path,i){return publishPath(path,i,'photo');})).then(function(photoUrls){return (videoPath?publishPath(videoPath,0,'video').then(function(url){return {photoUrls:photoUrls,videoUrl:url};}):Promise.resolve({photoUrls:photoUrls,videoUrl:null}));}).then(function(published){
          var metadata=Object.assign({},row.media_metadata||{});delete metadata.staged_assets;upd.published_at=new Date().toISOString();upd.image_url=row.image_url||published.photoUrls[0]||null;upd.gallery_urls=(row.gallery_urls||[]).concat(published.photoUrls);upd.video_url=row.video_url||published.videoUrl||null;upd.media_metadata=metadata;
          return db.from('media_posts').update(upd).eq('id',id).then(function(saved){if(saved.error)throw saved.error;var paths=photoPaths.concat(videoPath?[videoPath]:[]);return paths.length?db.storage.from('slfa-media-staging').remove(paths).then(function(del){if(del.error)throw del.error;return saved;}):saved;});
        });
      });
    }).then(function(r){if(r&&r.error){msg(r.error.message);return;}msg(status==='PUBLISHED'?'Media approved, assets published and staging files secured.':status==='RETURNED'?'Returned to author.':'Media rejected and hidden.');loadReview();}).catch(function(e){msg(e.message||'Review action failed.');});
  }
  function loadPublishedMedia(){var host=$('publishedMediaList');if(!host)return;db.from('media_posts').select('id,title,media_type,published_at').eq('status','PUBLISHED').order('published_at',{ascending:false}).limit(25).then(function(r){if(r.error){host.textContent='Published media list unavailable.';return;}host.innerHTML=(r.data||[]).length?r.data.map(function(p){return '<div class="pm-published-row"><span><strong>'+esc(p.title)+'</strong><small>'+esc(p.media_type||'MEDIA')+' · '+esc(p.published_at?new Date(p.published_at).toLocaleDateString():'')+'</small></span><button class="secondary" data-unpublish="'+esc(p.id)+'">Unpublish</button><button class="secondary" data-remove-media="'+esc(p.id)+'">Remove</button></div>';}).join(''):'No published media yet.';host.querySelectorAll('[data-unpublish]').forEach(function(b){b.onclick=function(){decide(b.dataset.unpublish,'RETURNED','Unpublished by an authorised reviewer.');};});host.querySelectorAll('[data-remove-media]').forEach(function(b){b.onclick=function(){removePublishedMedia(b.dataset.removeMedia);};});});}
  function removePublishedMedia(id){
    if(!confirm('Remove this media item and its uploaded files from public access?'))return;
    db.from('media_posts').select('image_url,video_url,gallery_urls').eq('id',id).single().then(function(r){
      if(r.error)throw r.error;var row=r.data,urls=[row.image_url,row.video_url].concat(row.gallery_urls||[]).filter(Boolean),base=window.SLFA_CONFIG.supabaseUrl;
      if(base.charAt(base.length-1)==='/')base=base.slice(0,-1);base+='/storage/v1/object/public/slfa-media/';
      var paths=urls.filter(function(u){return u.indexOf(base)===0;}).map(function(u){return decodeURIComponent(u.slice(base.length).split('?')[0]);});
      return (paths.length?db.storage.from('slfa-media').remove(paths):Promise.resolve({error:null})).then(function(del){if(del.error)throw del.error;return decide(id,'REJECTED','Removed from public view and uploaded storage by an authorised reviewer.',true);});
    }).catch(function(e){msg(e.message||'Could not remove uploaded media files.');});
  }
  function loadMediaAnalytics(){var host=$('mediaAnalytics');if(!host)return;var since=new Date(Date.now()-30*86400000).toISOString();db.from('media_engagement').select('event_type,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(10000).then(function(r){if(r.error){host.textContent='Engagement data unavailable.';return;}var n={IMPRESSION:0,VIDEO_PLAY:0,VIDEO_CLICK:0,SHARE:0};(r.data||[]).forEach(function(x){if(n[x.event_type]!=null)n[x.event_type]++;});host.innerHTML='<div class="pm-analytics-grid">'+[['Impressions',n.IMPRESSION],['Video plays / clicks',n.VIDEO_PLAY+n.VIDEO_CLICK],['Shares',n.SHARE]].map(function(x){return '<div><strong>'+x[1]+'</strong><span>'+x[0]+'</span></div>';}).join('')+'</div><p class="muted">Last 30 days · deduplicated browser engagement signals, not verified unique audience figures.</p>';});}

  // ---------- SUPER ADMIN: OPERATIONAL STAFF MANAGEMENT ----------
  var SA_OPERATIONAL_ROLES = [
    ['REFEREE','Referee'],['MATCH_COMMISSIONER','Match Commissioner'],
    ['TEAM_OFFICIAL','Team Official / Club Representative'],['MATCH_DATA_OPERATOR','Match Data Operator'],
    ['MEDIA_OFFICER','Media Officer'],['DISCIPLINARY_OFFICER','Disciplinary Officer']
  ];
  function saStaffSay(text){var el=$('saStaffStatus');if(el)el.textContent=text||'';}
  function saStaffRoleKey(row){return String(row.system_role||'').toUpperCase()==='REFEREE'&&String(row.official_title||'').trim().toLowerCase()==='match commissioner'?'MATCH_COMMISSIONER':String(row.system_role||'').toUpperCase();}
  function wireSuperAdminStaffManagement(){
    if(!$('saStaffInvite')||$('saStaffInvite').dataset.wired)return;
    $('saStaffInvite').dataset.wired='1';
    function refresh(){refreshSuperAdminStaff();}
    $('saStaffRole').addEventListener('change',function(){$('saStaffClubWrap').hidden=this.value!=='TEAM_OFFICIAL';});
    db.from('league_clubs').select('id,club_name').eq('is_active',true).order('club_name').then(function(r){
      if(r.error){saStaffSay('Club list unavailable: '+r.error.message);return;}
      $('saStaffClub').innerHTML='<option value="">Choose a club…</option>'+(r.data||[]).map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.club_name)+'</option>';}).join('');
    });
    $('saStaffInvite').addEventListener('click',function(){
      var name=$('saStaffName').value.trim(),email=$('saStaffEmail').value.trim().toLowerCase(),role=$('saStaffRole').value,club=role==='TEAM_OFFICIAL'?($('saStaffClub').value||null):null;
      if(!name||!email){saStaffSay('Enter the full name and email address.');return;}
      if(role==='TEAM_OFFICIAL'&&!club){saStaffSay('Choose the club represented by this Team Official.');return;}
      var button=$('saStaffInvite');button.disabled=true;saStaffSay('Saving operational role…');
      db.rpc('invite_user',{p_email:email,p_role:role,p_club:club,p_full_name:name,p_photo_url:null}).then(function(r){
        if(r.error)throw r.error;
        saStaffSay(r.data||'Role saved.');
        return db.from('role_invitations').select('email').eq('email',email).maybeSingle().then(function(check){
          if(check.error)throw check.error;
          if(!check.data){saStaffSay((r.data||'Role saved.')+' Existing account updated; no invitation email is needed.');return;}
          saStaffSay('Invitation saved. Sending the invitation email…');
          return sendRoleInvitation(email).then(function(result){saStaffSay(result.message||'Invitation email sent.');})
            .catch(function(error){saStaffSay('Invitation saved, but email delivery failed. Retry it below. '+(error.message||''));});
        });
      }).then(function(){ $('saStaffName').value='';$('saStaffEmail').value='';$('saStaffClub').value='';refresh(); })
        .catch(function(error){saStaffSay('Could not save invitation: '+(error.message||'Unknown error.'));})
        .finally(function(){button.disabled=false;});
    });
    $('saStaffRefresh').addEventListener('click',refresh);refresh();
  }
  function refreshSuperAdminStaff(){loadSuperAdminStaffAccounts();loadSuperAdminStaffInvites();loadSuperAdminStaffAudit();}
  function loadSuperAdminStaffAccounts(){
    var host=$('saStaffAccounts');if(!host)return;
    Promise.all([
      db.from('user_profiles').select('id,full_name,email,photo_url,system_role,status,official_title,club_id').order('email').limit(500),
      db.from('league_clubs').select('id,club_name').eq('is_active',true).order('club_name')
    ]).then(function(all){
      if(all[0].error){host.textContent='Account register unavailable: '+all[0].error.message;return;}
      if(all[1].error){host.textContent='Club assignments unavailable: '+all[1].error.message;return;}
      var rows=(all[0].data||[]).filter(function(u){return ['SUPER_ADMIN','LEAGUE_ADMIN','DEVELOPER'].indexOf(String(u.system_role||'').toUpperCase())===-1;}),clubs=all[1].data||[];
      host.innerHTML=rows.length?rows.map(function(u){
        var active=String(u.status||'').toLowerCase()==='active',role=saStaffRoleKey(u);
        var options=SA_OPERATIONAL_ROLES.map(function(o){return '<option value="'+o[0]+'"'+(role===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');
        var clubControl=role==='TEAM_OFFICIAL'?'<label>Assigned club</label><select data-sa-club-for="'+esc(u.id)+'"><option value="">Choose a club…</option>'+clubs.map(function(x){return '<option value="'+esc(x.id)+'"'+(String(x.id)===String(u.club_id)?' selected':'')+'>'+esc(x.club_name)+'</option>';}).join('')+'</select><button class="small" type="button" data-sa-club-save="'+esc(u.id)+'">Save club assignment</button>':'';
        return '<article class="post"><strong>'+esc(u.full_name||u.email||'Staff account')+'</strong><div class="muted">'+esc(u.email)+' · '+esc(u.status)+' · '+esc(u.official_title||u.system_role)+'</div><label>Operational role</label><select data-sa-role-for="'+esc(u.id)+'">'+options+'</select>'+clubControl+'<div class="btns"><button class="small" type="button" data-sa-role-save="'+esc(u.id)+'">Save role</button><button class="small '+(active?'danger':'')+'" type="button" data-sa-status="'+esc(u.id)+'" data-sa-next="'+(active?'Suspended':'Active')+'">'+(active?'Suspend account':'Restore account')+'</button></div></article>';
      }).join(''):'No operational staff accounts found.';
      host.querySelectorAll('[data-sa-role-save]').forEach(function(b){b.onclick=function(){
        var id=b.dataset.saRoleSave,select=host.querySelector('[data-sa-role-for="'+id+'"]');if(!select)return;
        if(!confirm('Apply this operational role to the selected account?'))return;
        b.disabled=true;db.rpc('set_user_role',{p_user:id,p_role:select.value}).then(function(r){
          if(r.error){saStaffSay(r.error.message);return;}saStaffSay(r.data||'Role updated.');refreshSuperAdminStaff();
        }).finally(function(){b.disabled=false;});
      };});
      host.querySelectorAll('[data-sa-club-save]').forEach(function(b){b.onclick=function(){
        var id=b.dataset.saClubSave,select=host.querySelector('[data-sa-club-for="'+id+'"]');if(!select)return;
        db.rpc('set_team_official_club',{p_user:id,p_club:select.value||null}).then(function(r){
          if(r.error){saStaffSay(r.error.message);return;}saStaffSay(r.data||'Club assignment saved.');refreshSuperAdminStaff();
        });
      };});
      host.querySelectorAll('[data-sa-status]').forEach(function(b){b.onclick=function(){
        var reason=prompt('Enter the reason for this account status change (at least 5 characters).');if(reason===null)return;
        if(reason.trim().length<5){saStaffSay('Give a reason of at least 5 characters.');return;}
        var next=b.dataset.saNext;if(!confirm((next==='Suspended'?'Suspend':'Restore')+' this staff account?'))return;
        db.rpc('set_account_status',{p_user:b.dataset.saStatus,p_status:next,p_reason:reason.trim()}).then(function(r){
          if(r.error){saStaffSay(r.error.message);return;}saStaffSay('Account status updated and logged.');refreshSuperAdminStaff();
        });
      };});
    });
  }
  function loadSuperAdminStaffInvites(){
    var host=$('saStaffInvites');if(!host)return;
    db.from('role_invitations').select('email,full_name,system_role,official_title,invited_at,email_delivery_status,email_sent_at,email_delivery_error,invitation_status')
      .neq('system_role','SUPER_ADMIN').neq('system_role','LEAGUE_ADMIN').in('invitation_status',['PENDING','ACCOUNT_CREATED']).order('invited_at',{ascending:false}).limit(200).then(function(r){
        if(r.error){host.textContent='Pending invitations unavailable: '+r.error.message;return;}
        var rows=r.data||[];
        host.innerHTML=rows.length?rows.map(function(x){
          var sent=String(x.email_delivery_status||'').toUpperCase()==='SENT';
          return '<article class="post"><strong>'+esc(x.full_name||x.email)+'</strong><div class="muted">'+esc(x.email)+' · '+esc(x.official_title||x.system_role)+' · '+(sent?'Email sent':'Email not sent')+'</div>'+
            (sent?'<span class="muted">Invitation email sent</span>':'<button class="small" type="button" data-sa-send="'+esc(x.email)+'">Send / retry email</button>')+
            ' <button class="small danger" type="button" data-sa-cancel="'+esc(x.email)+'">Cancel invitation</button></article>';
        }).join(''):'No pending operational invitations.';
        host.querySelectorAll('[data-sa-send]').forEach(function(b){b.onclick=function(){
          var email=b.dataset.saSend;b.disabled=true;sendRoleInvitation(email).then(function(x){saStaffSay(x.message||'Invitation email sent.');})
            .catch(function(e){saStaffSay('Email delivery failed: '+(e.message||'Unknown error.'));}).finally(function(){loadSuperAdminStaffInvites();});
        };});
        host.querySelectorAll('[data-sa-cancel]').forEach(function(b){b.onclick=function(){
          var email=b.dataset.saCancel;if(!confirm('Cancel this operational staff invitation?'))return;
          db.from('role_invitations').update({invitation_status:'CANCELLED'}).eq('email',email).neq('system_role','SUPER_ADMIN')
            .then(function(x){if(x.error){saStaffSay(x.error.message);return;}saStaffSay('Invitation cancelled.');refreshSuperAdminStaff();});
        };});
      });
  }
  function loadSuperAdminStaffAudit(){
    var host=$('saStaffAudit');if(!host)return;
    db.from('role_change_log').select('user_email,previous_role,new_role,reason,changed_at,changed_by')
      .order('changed_at',{ascending:false}).limit(30).then(function(r){
        if(r.error){host.textContent='Staff activity log unavailable: '+r.error.message;return;}
        var rows=r.data||[];
        host.innerHTML=rows.length?rows.map(function(x){return '<div class="ev"><span class="etxt">'+esc(x.user_email)+': '+esc(x.previous_role||'—')+' → '+esc(x.new_role)+'<small>'+esc(new Date(x.changed_at).toLocaleString())+' · '+esc(x.reason||'Role change')+'</small></span></div>';}).join(''):'No role changes recorded.';
      });
  }

  // ---------- DEVELOPER PANEL ----------
  var devUser = null;
  var ROLE_OPTIONS = [['SUPER_ADMIN','Super Admin / League Administrator']];
  function developer(p) {
    devUser=p;
    box().innerHTML =
      '<section class="dev-overview" id="developerOverview"><h2 class="rt">Platform overview</h2><p class="muted">Live database totals and public app activity. Counts are loaded from the connected database.</p><div class="dev-metric-grid">'+[['devMetricAccounts','Accounts'],['devMetricMatches','Fixtures'],['devMetricClubs','Clubs'],['devMetricResults','Confirmed results']].map(function(x){return '<article class="dev-metric"><span>'+x[1]+'</span><strong id="'+x[0]+'">—</strong></article>';}).join('')+'</div><div class="dev-activity"><strong>Last 30 days · public app activity</strong><div id="devMetricActivity" class="muted">Loading activity…</div></div><button class="secondary" type="button" id="devRefreshOverview">Refresh overview</button><div class="status" id="devOverviewStatus" role="status"></div></section>'+
      '<h2 class="rt">Whole application</h2><div id="appState" class="muted">Checking…</div><div class="btns"><button class="secondary" id="freezeAppBtn">Freeze entire app</button><button class="primary" id="unfreezeAppBtn">Unfreeze entire app</button></div>'+
      '<h2 class="rt">Appoint the Super Admin</h2><p class="muted">The Developer can appoint only one Super Admin. The Super Admin is also the League Administrator and controls all operational staff roles. Operational roles cannot be assigned from this Developer panel.</p>'+
      '<label for="ivName">Full name</label><input id="ivName" type="text" autocomplete="name">'+input('ivEmail','Email address','email')+
      '<label for="ivPhoto">Round profile photo</label><input id="ivPhoto" type="file" accept="image/jpeg,image/png,image/webp"><div id="ivPhotoPreview" class="muted">No photo selected.</div>'+
      '<label for="ivRole">Role</label><select id="ivRole">'+ROLE_OPTIONS.map(function(o){return '<option value="'+o[0]+'">'+esc(o[1])+'</option>';}).join('')+'</select><div id="devSuperAdminSlot" class="muted" role="status">Checking Super Admin appointment availability…</div>'+
      
      '<div class="btns"><button class="primary" id="ivSave">Save invitation</button></div>'+
      '<h2 class="rt">Pending role assignments</h2><div id="ivList" class="muted">Loading…</div>'+
      '<h2 class="rt">Super Admin appointment</h2><div id="roleList" class="muted">The Super Admin / League Administrator is the single league authority. Only this appointment is managed here.</div>'+
      '<section id="developerRoleAuditHidden" hidden><h2 class="rt">Recent role changes</h2><div id="roleLog" class="muted">Loading…</div></section><div class="status" id="roleMsg"></div>';
    loadDeveloperOverview();
    $('devRefreshOverview').onclick=loadDeveloperOverview;
    loadAppState();loadInviteForm();
    $('freezeAppBtn').onclick=function(){setAppFreeze(true);};$('unfreezeAppBtn').onclick=function(){setAppFreeze(false);};
    $('ivPhoto').onchange=function(){var f=this.files&&this.files[0];if(!f){$('ivPhotoPreview').textContent='No photo selected.';return;}if(['image/jpeg','image/png','image/webp'].indexOf(f.type)===-1||f.size>4*1024*1024){this.value='';msg('Choose a JPG, PNG or WebP photo no larger than 4 MB.');return;}var u=URL.createObjectURL(f);$('ivPhotoPreview').innerHTML='<img src="'+u+'" alt="Profile preview" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #16834a">';};
  }

  function loadSuperAdminOverview(){
    var specs=[
      ['saMetricCompetitions','leagues'],
      ['saMetricSeasons','seasons'],
      ['saMetricMatches','matches'],
      ['saMetricClubs','league_clubs'],
      ['saMetricPlayers','club_squad']
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
      ['devMetricResults','match_results','*'],
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
  function loadInviteForm(){
    $('ivSave').onclick=saveInvite;$('ivRole').addEventListener('change',updateInviteClubVisibility);
    loadInvites();refreshDeveloperSuperAdminSlot();
  }
  function refreshDeveloperSuperAdminSlot(){
    var note=$('devSuperAdminSlot'),select=$('ivRole');if(!note||!select)return;
    Promise.all([
      db.from('user_profiles').select('id',{count:'exact',head:true}).in('system_role',['SUPER_ADMIN','LEAGUE_ADMIN']),
      db.from('role_invitations').select('email',{count:'exact',head:true}).in('system_role',['SUPER_ADMIN','LEAGUE_ADMIN']).in('invitation_status',['PENDING','ACCOUNT_CREATED'])
    ]).then(function(results){
      var failed=results.some(function(r){return r.error;});
      var occupied=!failed&&((results[0].count||0)+(results[1].count||0)>0);
      var option=select.querySelector('option[value="SUPER_ADMIN"]');
      if(failed||occupied){
        if(option)option.remove();
        if(select.value==='SUPER_ADMIN')select.value='REFEREE';
        note.textContent=failed
          ?'Super Admin appointment is temporarily disabled because the current appointment status could not be verified.'
          :'The single Super Admin position is already assigned or has a pending invitation. Revoke that appointment before appointing a replacement.';
      }else{
        note.textContent='One Super Admin appointment is available. Only one Super Admin account or pending invitation is permitted.';
      }
    }).catch(function(){
      var option=select.querySelector('option[value="SUPER_ADMIN"]');if(option)option.remove();
      if(select.value==='SUPER_ADMIN')select.value='REFEREE';
      note.textContent='Super Admin appointment is disabled until the existing appointment status can be verified.';
    });
  }
  function loadInviteClubs(){
    db.from('league_clubs').select('id,club_name').eq('is_active',true).order('club_name').then(function(r){
      var el=$('ivClub');if(!el)return;
      if(r.error){el.innerHTML='<option value="">Club list unavailable</option>';msg('Could not load clubs for the Team Official invitation: '+r.error.message);return;}
      el.innerHTML='<option value="">Choose the club…</option>'+(r.data||[]).map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.club_name)+'</option>';}).join('');
    });
  }
  function updateInviteClubVisibility(){}
  function sendRoleInvitation(email){
    return db.functions.invoke('send-staff-invitation',{body:{email:email}})
      .then(function(r){
        if(r.error)throw r.error;
        var data=r.data||{};
        if(data.error)throw new Error(data.error);
        return data;
      });
  }
  function saveInvite(){
    var name=$('ivName').value.trim(),email=$('ivEmail').value.trim().toLowerCase(),role='SUPER_ADMIN',file=$('ivPhoto').files&&$('ivPhoto').files[0];
    var club=null;
    if(!name||!email){msg('Enter the full name and email address.');return;}
    if(role!=='SUPER_ADMIN'){msg('The Developer can appoint only the Super Admin.');return;}
    var save=$('ivSave');if(save)save.disabled=true;
    msg('Saving role and preparing the secure invitation…');
    uploadDevPhoto(email,file).then(function(photo){
      return db.rpc('invite_user',{p_email:email,p_role:role,p_club:club,p_full_name:name,p_photo_url:photo});
    }).then(function(r){
      if(r.error)throw r.error;
      var savedMessage=r.data||'Role assignment saved.';
      return db.from('role_invitations').select('email').eq('email',email).eq('invitation_status','PENDING').maybeSingle()
        .then(function(check){
          if(check.error)throw check.error;
          if(!check.data){msg(savedMessage);return;}
          msg('Role saved. Sending the invitation email…');
          return sendRoleInvitation(email).then(function(result){
            msg(result.message||'Invitation email sent.');
          }).catch(function(error){
            msg('The role is saved, but the invitation email could not be sent. The pending invitation is still available for retry. '+
              (error.message||'Check Supabase Auth email settings.'));
          });
        });
    }).then(function(){
      $('ivName').value='';$('ivEmail').value='';$('ivPhoto').value='';
      $('ivPhotoPreview').textContent='No photo selected.';
      
      loadInvites();loadRoleLog();refreshDeveloperSuperAdminSlot();
    }).catch(function(err){msg(err.message||'Could not save this invitation.');})
      .finally(function(){if(save)save.disabled=false;});
  }
  function loadInvites(){
    db.from('role_invitations')
      .select('email,full_name,system_role,official_title,invited_at,email_delivery_status,email_sent_at,email_delivery_error,invitation_status')
      .eq('system_role','SUPER_ADMIN').in('invitation_status',['PENDING','ACCOUNT_CREATED'])
      .order('invited_at',{ascending:false})
      .then(function(r){
        if(r.error){$('ivList').textContent=r.error.message;return;}
        var rows=r.data||[];
        $('ivList').innerHTML=rows.length?rows.map(function(x){
          var delivery=String(x.email_delivery_status||'NOT_SENT').toUpperCase();
          var accountState=String(x.invitation_status||'PENDING')==='ACCOUNT_CREATED'
            ? 'Account created · awaiting email verification'
            : 'Waiting for account creation';
          var state=delivery==='SENT'
            ? 'Invitation email sent'+(x.email_sent_at?' · '+new Date(x.email_sent_at).toLocaleString():'')
            : delivery==='FAILED'?'Email delivery failed'+(x.email_delivery_error?' · '+x.email_delivery_error:'')
            : 'Invitation email not sent yet';
          var sendButton=delivery==='SENT'
            ? '<span class="muted">Email sent · use Forgot password if its link expires</span>'
            : '<button class="small" type="button" data-send-invite="'+esc(x.email)+'">'+(delivery==='FAILED'?'Retry invitation email':'Send invitation email')+'</button>';
          return '<div class="post"><strong>'+esc(x.full_name||x.email)+'</strong>'+
            '<div class="muted">'+esc(x.email)+' · '+esc(x.official_title||x.system_role)+' · '+esc(accountState)+' · '+esc(state)+'</div>'+
            sendButton+' <button class="small danger" type="button" data-cancel="'+esc(x.email)+'">Cancel invitation</button></div>';
        }).join(''):'No pending staff activations.';
        document.querySelectorAll('[data-send-invite]').forEach(function(b){
          b.onclick=function(){
            var email=b.dataset.sendInvite;b.disabled=true;b.textContent='Sending…';
            sendRoleInvitation(email).then(function(result){
              msg(result.message||'Invitation email sent.');loadInvites();
            }).catch(function(error){
              msg('Invitation email was not sent: '+(error.message||'Check Supabase Auth email settings.'));
              loadInvites();
            });
          };
        });
        document.querySelectorAll('[data-cancel]').forEach(function(b){
          b.onclick=function(){
            var email=b.dataset.cancel;
            if(!confirm('Cancel this staff invitation? Any account already created for it will also be suspended.'))return;
            db.from('role_invitations').update({invitation_status:'CANCELLED'})
              .eq('email',email).in('invitation_status',['PENDING','ACCOUNT_CREATED'])
              .then(function(x){
                if(x.error){msg(x.error.message);return;}
                return db.from('user_profiles').select('id,status').eq('email',email).maybeSingle().then(function(p){
                  if(p.error)throw p.error;
                  if(p.data&&String(p.data.status).toLowerCase()==='active')
                    return db.rpc('set_account_status',{p_user:p.data.id,p_status:'Suspended'});
                });
              }).then(function(x){
                msg(x&&x.error?x.error.message:'Invitation cancelled. Any pre-created account has been suspended.');
                loadInvites();
              }).catch(function(error){msg('Could not complete cancellation: '+(error.message||'Unknown error.'));});
          };
        });
      });
  }
  function loadAppState(){db.from('application_control').select('app_frozen').eq('id',1).maybeSingle().then(function(r){if(r.error){$('appState').textContent=r.error.message;return;}var v=!!(r.data&&r.data.app_frozen);$('appState').innerHTML=v?'<strong style="color:#b91c1c">Entire app frozen.</strong>':'<strong style="color:#16834a">Application available.</strong>';});}
  function setAppFreeze(v){db.rpc('set_application_freeze',{p_frozen:v}).then(function(r){msg(r.error?r.error.message:(v?'Entire app frozen.':'Application unfrozen.'));loadAppState();});}
  function currentRoleKey(u){var r=String(u.system_role).toUpperCase();return r==='REFEREE'&&u.official_title==='Match Commissioner'?'MATCH_COMMISSIONER':r;}
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
        client_event_id: makeClientEventId(), match_id: Number(tp.id), event_type: tp.type, team_name: tp.team,
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
      setMatch(id, { match_status: 'LIVE', match_minute: 0, current_half: 1 }).then(function (r) {
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
        if (!confirm('Submit ' + m.home_team + ' ' + hg + ' – ' + ag + ' ' + m.away_team + ' as the official final score? The system will confirm and publish it.')) return;
        return db.auth.getUser().then(function (u) {
          if (!u.data || !u.data.user) throw new Error('Sign in again before submitting the final score.');
          var submission = {
            client_submission_id: makeClientEventId(), match_id: Number(id), home_goals: hg, away_goals: ag,
            submitted_by: u.data.user.id
          };
          return queueAndSyncRefereeResult(submission).then(function (res) {
            if (res.error && !res.queued) { msg(res.error.message); return; }
            if (res.queued) {
              msg('Final score saved on this phone. It will sync automatically when internet returns.');
            } else {
              msg('Final score confirmed and published.');
              loadRefMatch(id);
            }
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
        var event = { client_event_id: makeClientEventId(), match_id: Number(id), event_type: type, team_name: $('rfTeam').value, player_name: player,
          assist_player_name: $('rfAssist').value.trim() || null, player_off_name: $('rfOff').value.trim() || null, minute: minute,
          half: (currentRefMatch && Number(currentRefMatch.current_half) === 2) ? 2 : 1,
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
    if (fields && (fields.match_status !== undefined || fields.match_minute !== undefined)) {
      var stamp = new Date().toISOString();
      fields = Object.assign({}, fields, {
        status_set_at: fields.status_set_at === undefined ? stamp : fields.status_set_at,
        change_reason: fields.change_reason || ('Match status or clock updated through authorised official controls at ' + stamp)
      });
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
    $(prefix + 'Second').addEventListener('click', function () { var id = $(matchSel).value; if (!id) return; setMatch(id, { match_status: 'LIVE', match_minute: 46, current_half: 2 }).then(function (r) { msg(r.error ? r.error.message : 'Second half started.'); }); });
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
    db.from('matches').select('id, home_team, away_team, match_status, motm_player_id, current_half').eq('id', id).maybeSingle().then(function (r) {
      var m = r.data; if (!m) return;
      currentRefMatch = m;
      loadMotm(m);
      $('rfTeam').innerHTML = '<option>' + esc(m.home_team) + '</option><option>' + esc(m.away_team) + '</option>';
      $('rfPanel').classList.toggle('hidden', (m.match_status !== 'LIVE' && m.match_status !== 'HT') || !applyRefRole(id));
      db.from('match_events').select('id, event_type, team_name, player_name, player_off_name, minute, half').eq('match_id', String(id)).order('minute', { ascending: true }).then(function (e) {
        refEvents = e.data || [];
        $('rfScore').textContent = goalsFor(m.home_team) + ' – ' + goalsFor(m.away_team);
        $('rfEvents').innerHTML = refEvents.length ? refEvents.map(function (ev) {
          var label = ev.event_type === 'SUB' ? ev.player_name + ' on, ' + (ev.player_off_name || '') + ' off' : ev.player_name;
          var minLabel = window.slfaFormatMinute ? window.slfaFormatMinute(ev.minute, ev.half) : esc(ev.minute) + "'";
          return '<div class="ev"><span class="min">' + minLabel + "</span><span class=\"etxt\">" + esc(String(ev.event_type).replace('_',' ')) + ': ' + esc(label) +
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
      '<h2 class="rt">Premium Media Studio</h2>' +
      '<label for="npCat">Category</label><select id="npCat"><option value="NEWS">News</option><option value="PRESS_RELEASE">Press release</option><option value="MATCH_REPORT">Match report</option><option value="ANNOUNCEMENT">Announcement</option></select>' +
      '<label for="npMatch">Match (for match reports, optional)</label><select id="npMatch"><option value="">Not linked to a match</option></select>' +
      '<label for="npLeague">Competition</label><select id="npLeague"><option value="">All competitions</option></select>' +
      '<label for="npMediaType">Media format</label><select id="npMediaType"><option value="NEWS">News / announcement</option><option value="GALLERY">Match photo gallery</option><option value="VIDEO">Video highlights</option><option value="INTERVIEW">Player / coach interview</option><option value="MATCH_REPORT">Professional match report</option></select>' +
      input('npTitle', 'Headline / title') +
      '<label for="npInterviewee">Interview subject (optional)</label><input id="npInterviewee" type="text" maxlength="120" placeholder="Player, coach or official">' +
      '<label for="npBody">Story / editorial summary</label><textarea id="npBody" rows="5" placeholder="Write the introduction and key context…"></textarea>' +
      '<label for="npGallery">Additional gallery image URLs (one HTTPS link per line)</label><textarea id="npGallery" rows="3" placeholder="https://…"></textarea>' +
      '<label for="npGalleryFiles">Upload match photographs from your phone (up to 12 images, 8 MB each)</label><input id="npGalleryFiles" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple>' +
      '<div id="npGalleryNames" class="muted">No photos selected.</div>' +
      input('npImage', 'Cover photo URL (optional)', 'url') + input('npVideo', 'Video link (optional)', 'url') +
      '<label for="npVideoFile">Or upload a video (MP4, WebM or MOV · maximum 45 MB)</label><input id="npVideoFile" type="file" accept="video/mp4,video/webm,video/quicktime">' +
      '<div id="npVideoName" class="muted">No video selected.</div><div id="npUploadStatus" class="status" role="status"></div>' +
      '<section class="pm-report-form"><h3>Professional match report</h3>' +
      '<label for="npReport">Match summary</label><textarea id="npReport" rows="3" placeholder="Verified account of the match…"></textarea>' +
      '<label for="npKeyMoments">Key moments</label><textarea id="npKeyMoments" rows="3" placeholder="Goals, cards, substitutions and decisive moments…"></textarea>' +
      '<label for="npLineups">Recorded starting line-ups and substitutes</label><textarea id="npLineups" rows="4" placeholder="Automatically populated from recorded match sheets where available."></textarea>' +
      input('npPOTM','Player of the match') +
      '<label for="npManagerComments">Manager comments</label><textarea id="npManagerComments" rows="2"></textarea>' +
      '<label for="npAnalysis">Post-match analysis</label><textarea id="npAnalysis" rows="3"></textarea></section>' +
      '<p class="muted">Submitted posts are reviewed by a Super Admin before appearing in the public Media Centre. Save a draft or submit it for approval.</p>' +
      '<div class="btns"><button class="secondary" id="npDraft">Save draft</button><button class="primary" id="npSubmit">Submit for approval</button></div>' +
      '<h2 class="rt">My posts</h2><div id="myPosts" class="muted">Loading…</div>' +
      '<div class="status" id="roleMsg"></div>';

    function save(status) {
      var t=$('npTitle').value.trim(),imageLink=$('npImage').value.trim(),videoLink=$('npVideo').value.trim();
      var photoInput=$('npGalleryFiles'),videoInput=$('npVideoFile'),photos=Array.prototype.slice.call(photoInput.files||[]),videoFile=videoInput.files&&videoInput.files[0];
      if(!t){msg('Give the post a title.');return;}
      if(imageLink&&imageLink.indexOf('https://')!==0){msg('Cover photo links must use HTTPS.');return;}
      if(videoLink){try{var vhost=new URL(videoLink).hostname.toLowerCase();if(videoLink.indexOf('https://')!==0||!['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','vimeo.com','www.vimeo.com','player.vimeo.com','tiktok.com','www.tiktok.com','facebook.com','www.facebook.com','fb.watch'].some(function(h){return vhost===h||vhost.endsWith('.'+h);}))throw new Error();}catch(e){msg('Use a valid HTTPS YouTube, Vimeo, TikTok or Facebook video link.');return;}}
      if(photos.length>12){msg('Select no more than 12 gallery photographs.');return;}if(photos.reduce(function(n,f){return n+f.size;},0)>40*1024*1024){msg('The combined gallery upload must be 40 MB or less.');return;}
      if(photos.some(function(f){return ['image/jpeg','image/png','image/webp','image/gif'].indexOf(f.type)<0||f.size>8*1024*1024;})){msg('Each photograph must be JPG, PNG, WebP or GIF and no larger than 8 MB.');return;}
      if(videoFile&&(['video/mp4','video/webm','video/quicktime'].indexOf(videoFile.type)<0||videoFile.size>45*1024*1024)){msg('Video must be MP4, WebM or MOV and no larger than 45 MB.');return;}
      if(videoLink&&videoFile){msg('Use either a video link or an uploaded video, not both.');return;}
      var externalGallery=$('npGallery').value.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
      if(externalGallery.some(function(x){return x.indexOf('https://')!==0;})){msg('Gallery links must use HTTPS.');return;}
      db.auth.getUser().then(function(u){
        if(!u.data||!u.data.user)throw new Error('Your session has expired. Sign in again.');
        var userId=u.data.user.id,folder=userId+'/'+Date.now()+'-'+Math.random().toString(36).slice(2),jobs=[];
        photos.forEach(function(file,i){var safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-').slice(-80)||('photo-'+i+'.jpg'),path=folder+'/photo-'+i+'-'+safe;jobs.push(db.storage.from('slfa-media-staging').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type}).then(function(up){if(up.error)throw up.error;return up.data.path;}));});
        if(videoFile){var vn=videoFile.name.replace(/[^a-zA-Z0-9._-]/g,'-').slice(-80)||'match-video.mp4',vp=folder+'/video-'+vn;jobs.push(db.storage.from('slfa-media-staging').upload(vp,videoFile,{cacheControl:'3600',upsert:false,contentType:videoFile.type}).then(function(up){if(up.error)throw up.error;return {uploadedVideoPath:up.data.path};}));}
        $('npUploadStatus').textContent=jobs.length?'Uploading media files…':'Preparing submission…';
        return Promise.all(jobs).then(function(uploaded){
          var uploadedPhotos=uploaded.filter(function(x){return typeof x==='string';}),uploadedVideo=uploaded.filter(function(x){return x&&x.uploadedVideoPath;})[0];
          var gallery=externalGallery,cover=imageLink||null,videoUrl=videoLink||null;
          var report={summary:$('npReport').value.trim(),key_moments:$('npKeyMoments').value.trim(),lineups:$('npLineups').value.trim(),player_of_the_match:$('npPOTM').value.trim(),manager_comments:$('npManagerComments').value.trim(),analysis:$('npAnalysis').value.trim()};
          return db.from('media_posts').insert([{category:$('npMediaType').value==='GALLERY'?'PHOTO':($('npMediaType').value==='MATCH_REPORT'?'MATCH_REPORT':$('npCat').value),media_type:$('npMediaType').value,interviewee:$('npInterviewee').value.trim()||null,gallery_urls:gallery,media_metadata:{report:$('npMediaType').value==='MATCH_REPORT'?report:null,staged_assets:{photos:uploadedPhotos,video:uploadedVideo?uploadedVideo.uploadedVideoPath:null}},title:t,body:$('npBody').value.trim(),match_id:$('npMatch').value||null,league_id:$('npLeague').value?Number($('npLeague').value):null,image_url:cover,video_url:videoUrl,status:status,created_by:userId,created_by_name:p.full_name||p.email,submitted_at:status==='SUBMITTED'?new Date().toISOString():null}]);
        });
      }).then(function(r){
        if(r.error){msg(r.error.message);$('npUploadStatus').textContent='Submission failed. Check the file size and connection.';return;}
        msg(status==='SUBMITTED'?'Media submitted for approval.':'Draft saved.');$('npUploadStatus').textContent='Upload and save completed.';
        ['npTitle','npBody','npImage','npVideo','npGallery','npInterviewee','npReport','npKeyMoments','npLineups','npPOTM','npManagerComments','npAnalysis'].forEach(function(id){if($(id))$(id).value='';});
        $('npMatch').value='';$('npLeague').value='';photoInput.value='';videoInput.value='';$('npGalleryNames').textContent='No photos selected.';$('npVideoName').textContent='No video selected.';loadMine();
      }).catch(function(e){msg(e.message||'Upload or submission failed.');$('npUploadStatus').textContent='Upload failed. Check your connection and try again.';});
    }
    function toggleReportFields(){var section=document.querySelector('.pm-report-form');if(section)section.hidden=$('npMediaType').value!=='MATCH_REPORT';if($('npMediaType').value==='MATCH_REPORT'&&$('npMatch').value)prefillReportFromMatch($('npMatch').value);}
    $('npMediaType').addEventListener('change',toggleReportFields);toggleReportFields();
    $('npGalleryFiles').addEventListener('change',function(){var fs=Array.prototype.slice.call(this.files||[]);$('npGalleryNames').textContent=fs.length?fs.map(function(f){return f.name+' ('+(f.size/1048576).toFixed(1)+' MB)';}).join(' · '):'No photos selected.';});
    $('npVideoFile').addEventListener('change',function(){var f=this.files&&this.files[0];$('npVideoName').textContent=f?f.name+' ('+(f.size/1048576).toFixed(1)+' MB)':'No video selected.';});
    $('npDraft').addEventListener('click', function () { save('DRAFT'); });
    $('npSubmit').addEventListener('click', function () { save('SUBMITTED'); });
    function prefillReportFromMatch(matchId){
      if(!matchId||$('npMediaType').value!=='MATCH_REPORT')return;
      Promise.all([
        db.from('matches').select('id,home_team,away_team,home_score,away_score,match_date,venue,match_status,motm_name').eq('id',Number(matchId)).maybeSingle(),
        db.from('match_events').select('event_type,team_name,player_name,minute,assist_player_name,published_at').eq('match_id',String(matchId)).not('published_at','is',null).order('minute',{ascending:true}),
        db.from('match_lineups').select('is_starter,league_clubs(club_name),club_squad(player_name,jersey_number)').eq('match_id',Number(matchId))
      ]).then(function(all){
        var m=all[0].data,events=all[1].data||[],lineups=all[2].data||[];if(!m)return;
        if(!$('npReport').value.trim()&&m.match_status==='FT'&&m.home_score!=null&&m.away_score!=null){$('npReport').value='Verified result: '+m.home_team+' '+m.home_score+'–'+m.away_score+' '+m.away_team+'. Played '+new Date(m.match_date).toLocaleDateString()+(m.venue?' at '+m.venue:'')+'.';}
        if(!$('npKeyMoments').value.trim()&&events.length){$('npKeyMoments').value=events.map(function(e){return (e.minute!=null?e.minute+"' ":'')+String(e.event_type||'EVENT').replace(/_/g,' ').toLowerCase()+' — '+(e.player_name||'Player not recorded')+' ('+(e.team_name||'Team not recorded')+')'+(e.assist_player_name?' · Assist: '+e.assist_player_name:'');}).join('\n');}
        if(!$('npLineups').value.trim()&&lineups.length){var grouped={};lineups.forEach(function(x){var club=x.league_clubs&&x.league_clubs.club_name||'Team';(grouped[club]=grouped[club]||[]).push((x.is_starter?'Starting':'Substitute')+': '+(x.club_squad&&x.club_squad.player_name||'Player')+(x.club_squad&&x.club_squad.jersey_number?' #'+x.club_squad.jersey_number:''));});$('npLineups').value=Object.keys(grouped).map(function(club){return club+'\n'+grouped[club].join('\n');}).join('\n\n');}
        if(!$('npPOTM').value.trim()&&m.motm_name)$('npPOTM').value=m.motm_name;
        $('npUploadStatus').textContent='Verified match result, published events and available team sheets loaded. Review all details before submission.';
      }).catch(function(){msg('Match-linked data could not be loaded. You can complete the report manually.');});
    }
    $('npMatch').addEventListener('change', function () {
      var opt = this.options[this.selectedIndex];
      if (opt && opt.value && $('npMediaType').value === 'NEWS') { $('npCat').value = 'MATCH_REPORT'; $('npMediaType').value = 'MATCH_REPORT'; }
      if (opt && opt.dataset.league) $('npLeague').value = opt.dataset.league;
      if (opt && opt.dataset.title && !$('npTitle').value.trim()) $('npTitle').value = opt.dataset.title;
      if (opt && opt.value) prefillReportFromMatch(opt.value);
    });
    db.from('matches').select('id, home_team, away_team, home_score, away_score, match_date, league_id').eq('match_status', 'FT').order('match_date', { ascending: false }).limit(40).then(function (r) {
      $('npMatch').innerHTML = '<option value="">Not linked to a match</option>' + (r.data || []).map(function (m) {
        var t = 'Match report: ' + m.home_team + ' ' + m.home_score + '–' + m.away_score + ' ' + m.away_team;
        return '<option value="' + esc(m.id) + '" data-title="' + esc(t) + '" data-league="' + esc(m.league_id || '') + '">' + esc(m.home_team) + ' ' + esc(m.home_score) + '–' + esc(m.away_score) + ' ' + esc(m.away_team) + ' · ' + esc(new Date(m.match_date).toLocaleDateString()) + '</option>';
      }).join('');
    });
    db.from('leagues').select('id, name').eq('is_active', true).order('sort_order').then(function (r) {
      $('npLeague').innerHTML = '<option value="">All leagues (general)</option>' + (r.data || []).map(function (l) {
        return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>'; }).join('');
    });
    loadMine();
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
    if ($('usageCounts')) loadUsage();
    if ($('reviewList')) loadReview();
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
