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
    if (role === 'SUPER_ADMIN') out = superAdmin(p);
    else if (role === 'MEDIA_OFFICER') out = mediaOfficer(p);
    else if (role === 'DISCIPLINARY_OFFICER') out = disciplinary(p);
    else if (role === 'REFEREE') out = referee(p);
    else if (role === 'DEVELOPER') out = developer(p);
    else if (role === 'CLUB_ADMIN') out = clubManager(p);
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
      '<h2 class="rt">Add a fixture</h2>' +
      '<label for="fxLeague">League</label><select id="fxLeague"><option value="">Loading leagues…</option></select>' +
      input('fxHome', 'Home team') + input('fxAway', 'Away team') +
      input('fxDate', 'Date and time', 'datetime-local') + input('fxVenue', 'Venue') +
      '<div class="btns"><button class="primary" id="fxSave">Add fixture</button></div>' +
      '<h2 class="rt">Enter a result</h2>' +
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
      '<div id="lvPanel" class="hidden">' +
        '<label for="lvTeam">Team</label><select id="lvTeam"></select>' +
        input('lvPlayer', 'Player') + input('lvAssist', 'Assist (optional)') + input('lvOff', 'Player off (substitutions only)') +
        '<label for="lvType">Event</label><select id="lvType"><option value="GOAL">Goal</option><option value="YELLOW_CARD">Yellow card</option><option value="RED_CARD">Red card</option><option value="SUB">Substitution</option></select>' +
        input('lvMinute', 'Minute', 'number', 'min="0" max="130"') +
        '<div class="btns"><button class="primary" id="lvAdd">Record event</button></div>' +
      '</div>' +
      '<h2 class="rt">Assign a referee</h2>' +
      '<label for="asMatch">Match</label><select id="asMatch"><option value="">Loading…</option></select>' +
      '<label for="asRef">Referee</label><select id="asRef"><option value="">Loading referees…</option></select>' +
      '<div class="btns"><button class="primary" id="asSave">Assign</button></div>' +
      '<h2 class="rt">Final scores awaiting approval</h2><div id="pendingResults" class="muted">Loading…</div>' +
      '<h2 class="rt">News awaiting approval</h2><div id="reviewList" class="muted">Loading…</div>' +
      '<h2 class="rt">Fan comments awaiting approval</h2><div id="pendingComments" class="muted">Loading…</div>' +
      '<h2 class="rt">Privacy requests from staff</h2><div id="privacyRequests" class="muted">Loading…</div>' +
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
      db.from('seasons').select('id').order('id', { ascending: false }).limit(1).maybeSingle().then(function (s) {
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
    loadPrivacyRequests();
    $('asSave').addEventListener('click', function () {
      var m = $('asMatch').value, r = $('asRef').value;
      if (!m || !r) { msg('Choose a match and a referee.'); return; }
      db.auth.getUser().then(function (u) {
        return db.from('match_referee_assignments').insert([{ match_id: Number(m), referee_user_id: r, assigned_by: u.data.user.id, official_role: 'MAIN', assignment_status: 'ACTIVE' }]);
      }).then(function (res) { msg(res.error ? res.error.message : 'Referee assigned.'); });
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
  // Staff privacy requests. A Super Admin marks each one done after reviewing it. Nothing is deleted automatically.
  function loadPrivacyRequests() {
    var box = $('privacyRequests'); if (!box) return;
    db.from('privacy_requests').select('id, request_type, note, created_at, user_profiles(full_name, email, system_role)').eq('status', 'OPEN').order('created_at', { ascending: true }).limit(100)
      .then(function (r) {
        if (r.error) { box.textContent = 'Requests could not be loaded.'; return; }
        var rows = r.data || [];
        box.innerHTML = rows.length ? rows.map(function (x) {
          var u = x.user_profiles || {};
          return '<div class="post"><strong>Account deletion</strong> · ' + esc(u.full_name || 'Staff member') + ' (' + esc(u.system_role || '') + ')' +
            '<p>' + esc(u.email || '') + '</p>' + (x.note ? '<p>' + esc(x.note) + '</p>' : '') +
            '<div class="btns"><button class="primary" data-privacy-done="' + x.id + '">Mark done</button></div></div>';
        }).join('') : 'No open requests.';
        box.querySelectorAll('[data-privacy-done]').forEach(function (b) {
          b.addEventListener('click', function () {
            db.from('privacy_requests').update({ status: 'DONE', resolved_at: new Date().toISOString() }).eq('id', Number(b.dataset.privacyDone)).then(function (res) {
              msg(res.error ? res.error.message : 'Request marked done. Remove the account in the Supabase dashboard if it should be deleted.'); loadPrivacyRequests(); });
          });
        });
      });
  }

  // Every signed-in staff member can download their own account data and ask for deletion.
  function accountPrivacy() {
    var b = $('roleTools'); if (!b || $('accountPrivacy')) return;
    var sec = document.createElement('div');
    sec.id = 'accountPrivacy';
    sec.innerHTML = '<h2 class="rt">My account data</h2>' +
      '<p class="muted">Download a copy of the account details the app holds for you, or ask a Super Admin to delete your account.</p>' +
      '<div class="btns"><button class="secondary" id="apDownload">Download my account data (JSON)</button></div>' +
      '<label for="apNote">Reason for deletion (optional)</label><textarea id="apNote" rows="2" maxlength="500"></textarea>' +
      '<div class="btns"><button class="secondary" id="apDelete">Ask for my account to be deleted</button></div>' +
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
    $('apDelete').addEventListener('click', function () {
      if (!window.confirm('Ask a Super Admin to delete your account? You will keep access until it is done.')) return;
      say('Sending your request…');
      db.rpc('staff_request_deletion', { p_note: $('apNote').value.trim() }).then(function (r) {
        say(r.error ? r.error.message : 'Request sent. A Super Admin will review it.');
        if (!r.error) $('apNote').value = '';
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
    $('lvAdd').addEventListener('click', function () {
      if (!liveMatch) { msg('Choose a live match.'); return; }
      var type = $('lvType').value, player = $('lvPlayer').value.trim(), minute = parseInt($('lvMinute').value, 10);
      if (!player || isNaN(minute)) { msg('Enter the player and the minute.'); return; }
      if (type === 'SUB' && !$('lvOff').value.trim()) { msg('Enter the player coming off.'); return; }
      db.auth.getUser().then(function (u) {
        return db.from('match_events').insert([{
          match_id: String($('lvMatch').value), event_type: type, team_name: $('lvTeam').value, player_name: player,
          assist_player_name: $('lvAssist').value.trim() || null, player_off_name: $('lvOff').value.trim() || null,
          minute: minute, recorded_by: u.data.user.id, recorded_at: new Date().toISOString(), published_at: new Date().toISOString()
        }]);
      }).then(function (r) {
        if (r.error) { msg(r.error.message); return; }
        msg('Recorded.'); ['lvPlayer','lvAssist','lvOff','lvMinute'].forEach(function (x) { $(x).value = ''; });
        loadLiveMatch($('lvMatch').value);
      });
    });
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
      $('lvTeam').innerHTML = '<option>' + esc(liveMatch.home_team) + '</option><option>' + esc(liveMatch.away_team) + '</option>';
      $('lvPanel').classList.toggle('hidden', liveMatch.match_status !== 'LIVE' && liveMatch.match_status !== 'HT');
      db.from('match_events').select('event_type, team_name, player_name, minute').eq('match_id', String(id)).order('minute', { ascending: true })
        .then(function (e) { liveEvents = e.data || []; });
    });
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

  function loadStatusOptions() {
    db.from('matches').select('id, home_team, away_team, match_status').order('match_date', { ascending: false }).limit(60).then(function (r) {
      $('msMatch').innerHTML = '<option value="">Choose a match…</option>' + (r.data || []).map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + ' · ' + esc(m.match_status) + '</option>';
      }).join('');
    });
  }
  function loadLeagueOptions() {
    db.from('leagues').select('id, name').eq('is_active', true).order('sort_order').then(function (r) {
      $('fxLeague').innerHTML = '<option value="">Choose the league…</option>' + (r.data || []).map(function (l) {
        return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>'; }).join('');
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

  // ---------- CLUB MANAGER: squad ----------
  var myClub = null;
  function clubManager(p) {
    if (!p.club_id) {
      box().innerHTML = '<h2 class="rt">Club squad</h2><p class="muted">Your account is not linked to a club yet. The Technical Director needs to assign your club.</p>';
      return;
    }
    box().innerHTML =
      '<h2 class="rt">Club squad</h2><div id="clubName" class="muted">Loading club…</div>' +
      '<h2 class="rt">Add a player</h2>' +
      input('spName', 'Full name') + input('spNin', 'National ID number') + input('spDob', 'Date of birth', 'date') +
      '<label for="spPos">Position</label><select id="spPos"><option value="GK">Goalkeeper</option><option value="DF">Defender</option><option value="MF">Midfielder</option><option value="FW">Forward</option></select>' +
      input('spJersey', 'Jersey number (1–99, optional)', 'number', 'min="1" max="99"') +
      '<label for="spPhoto">Photo (optional)</label><input id="spPhoto" type="file" accept="image/*">' +
      '<div class="btns"><button class="primary" id="spSave">Add player</button></div>' +
      '<h2 class="rt">Your players</h2><div id="squadList" class="muted">Loading…</div>' +
      '<h2 class="rt">Club profile</h2><p class="muted">Submit proposed changes for Super Admin review. The public profile changes only after approval.</p>' +
      input('cpStadium', 'Stadium / home ground') + input('cpCity', 'City or town') + input('cpFounded', 'Year founded', 'number', 'min="1850" max="2100"') +
      '<label for="cpAbout">About the club</label><textarea id="cpAbout" rows="3"></textarea>' +
      '<div class="btns"><button class="secondary" id="cpSave">Submit changes for approval</button></div>' +
      '<div id="clubProfileRequests" class="muted">Loading profile submission history…</div>' +
      '<h2 class="rt">Club announcements</h2>' +
      input('anTitle', 'Announcement title') +
      '<label for="anBody">Message (optional)</label><textarea id="anBody" rows="3"></textarea>' +
      '<div class="btns"><button class="secondary" id="anSave">Post announcement</button></div>' +
      '<div id="announceList" class="muted">Loading…</div>' +
      '<h2 class="rt">Matchday lineup</h2>' +
      '<label for="luMatch">Upcoming match</label><select id="luMatch"><option value="">Loading…</option></select>' +
      '<div id="luPlayers" class="muted"></div>' +
      '<div class="btns"><button class="primary" id="luSave">Save lineup</button></div>' +
      '<h2 class="rt">Transfers</h2><div id="transferList" class="muted">Loading…</div>' +
      '<div class="status" id="roleMsg"></div>';
    $('spSave').addEventListener('click', function () { addPlayer(p); });
    $('cpSave').addEventListener('click', function () { saveProfile(); });
    $('anSave').addEventListener('click', function () { postAnnouncement(); });
    $('luSave').addEventListener('click', function () { saveLineup(); });
    $('luMatch').addEventListener('change', loadLineupPlayers);
    Promise.all([
      db.from('league_clubs').select('id, club_name, stadium, city, founded_year, about').eq('id', p.club_id).maybeSingle(),
      loadCurrentSeason(),
      db.from('league_clubs').select('id, club_name').eq('is_active', true).order('club_name')
    ]).then(function (all) {
      myClub = all[0].data || null;
      clubsList = all[2].data || [];
      $('clubName').innerHTML = '<strong>' + esc(myClub ? myClub.club_name : 'Your club') + '</strong>';
      if (myClub) {
        $('cpStadium').value = myClub.stadium || ''; $('cpCity').value = myClub.city || '';
        $('cpFounded').value = myClub.founded_year || ''; $('cpAbout').value = myClub.about || '';
      }
      loadSquad(p);
      loadClubProfileRequests();
      loadAnnouncements();
      loadLineupMatches();
    });
  }
  function saveProfile() {
    if (!myClub) { msg('The club has not loaded yet.'); return; }
    var founded = $('cpFounded').value ? Number($('cpFounded').value) : null;
    if (founded !== null && (founded < 1850 || founded > new Date().getFullYear())) { msg('Enter a valid founding year.'); return; }
    var stadium = $('cpStadium').value.trim(), city = $('cpCity').value.trim(), about = $('cpAbout').value.trim();
    if (about.length > 2000 || stadium.length > 160 || city.length > 120) { msg('One or more fields are too long.'); return; }
    db.rpc('submit_club_profile_change', {
      p_stadium: stadium || null, p_city: city || null, p_founded_year: founded, p_about: about || null
    }).then(function (r) {
      if (r.error) { msg(r.error.message); return; }
      msg('Profile changes submitted. They will appear publicly after Super Admin approval.');
      loadClubProfileRequests();
    });
  }
  function loadClubProfileRequests() {
    if (!myClub) return;
    db.from('club_profile_change_requests')
      .select('id, proposed_profile, status, submitted_at, reviewed_at, review_note')
      .eq('club_id', myClub.id).order('submitted_at', { ascending: false }).limit(8)
      .then(function (r) {
        if (r.error) { $('clubProfileRequests').textContent = r.error.message; return; }
        var rows = r.data || [];
        $('clubProfileRequests').innerHTML = rows.length ? '<p><strong>Submission history</strong></p>' + rows.map(function (x) {
          var status = x.status === 'SUBMITTED' ? 'Awaiting Super Admin review' : (x.status === 'APPROVED' ? 'Approved and published' : 'Returned for changes');
          return '<div class="post"><strong>' + esc(status) + '</strong><div class="muted">' + esc(new Date(x.submitted_at).toLocaleString()) + '</div>' +
            (x.reviewed_at ? '<div class="muted">Reviewed ' + esc(new Date(x.reviewed_at).toLocaleString()) + '</div>' : '') +
            (x.review_note ? '<p>Review note: ' + esc(x.review_note) + '</p>' : '') + '</div>';
        }).join('') : '<p>No profile submissions yet.</p>';
      });
  }
  function postAnnouncement() {
    if (!myClub) { msg('The club has not loaded yet.'); return; }
    var t = $('anTitle').value.trim();
    if (!t) { msg('Give the announcement a title.'); return; }
    db.from('club_announcements').insert({ club_id: myClub.id, title: t, body: $('anBody').value.trim() || null }).then(function (r) {
      if (r.error) { msg(r.error.message); return; }
      msg('Announcement posted.'); $('anTitle').value = ''; $('anBody').value = ''; loadAnnouncements();
    });
  }
  function loadAnnouncements() {
    if (!myClub) return;
    db.from('club_announcements').select('id, title, body, created_at').eq('club_id', myClub.id).order('created_at', { ascending: false }).limit(20).then(function (r) {
      var rows = r.data || [];
      $('announceList').innerHTML = rows.length ? rows.map(function (x) {
        return '<div class="post"><strong>' + esc(x.title) + '</strong><div class="muted">' + esc(new Date(x.created_at).toLocaleDateString()) + '</div>' +
          (x.body ? '<p>' + esc(x.body) + '</p>' : '') +
          '<div class="btns"><button class="small" data-del-ann="' + esc(x.id) + '">Delete</button></div></div>';
      }).join('') : 'No announcements yet.';
      document.querySelectorAll('[data-del-ann]').forEach(function (b) {
        b.addEventListener('click', function () {
          db.from('club_announcements').delete().eq('id', b.dataset.delAnn).then(function (res) { msg(res.error ? res.error.message : 'Deleted.'); loadAnnouncements(); });
        });
      });
    });
  }
  function loadLineupMatches() {
    if (!myClub) return;
    db.from('matches').select('id, home_team, away_team, match_date, match_status').in('match_status', ['SCHEDULED', 'RESCHEDULED']).order('match_date', { ascending: true }).limit(60).then(function (r) {
      var mine = (r.data || []).filter(function (m) { return m.home_team === myClub.club_name || m.away_team === myClub.club_name; });
      mine.forEach(function (m) { luMatches[m.id] = m; });
      $('luMatch').innerHTML = mine.length ? '<option value="">Choose a match…</option>' + mine.map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.home_team) + ' v ' + esc(m.away_team) + ' · ' + esc(new Date(m.match_date).toLocaleString()) + (lineupOpen(m) ? '' : ' · lineup closed') + '</option>';
      }).join('') : '<option value="">No upcoming matches for your club</option>';
      loadLineupPlayers();
    });
  }
  function loadLineupPlayers() {
    var id = $('luMatch').value;
    if (!id || !myClub) { $('luPlayers').innerHTML = ''; $('luSave').disabled = false; return; }
    if (!currentSeason) { $('luPlayers').innerHTML = 'No season is set yet. Ask the Super Admin to set the current season.'; return; }
    var chosen = luMatches[id];
    if (chosen && !lineupOpen(chosen)) {
      $('luSave').disabled = true;
      $('luPlayers').innerHTML = '<p class="muted">Lineups are closed for this match. They close 20 minutes before kick-off.</p>';
      return;
    }
    $('luSave').disabled = false;
    Promise.all([
      db.from('club_squad').select('id, player_name, position, jersey_number').eq('club_id', myClub.id).eq('season_id', currentSeason.id)
        .eq('registration_status', 'Approved').eq('status', 'Active').order('jersey_number', { ascending: true, nullsFirst: false }).order('player_name'),
      db.from('match_lineups').select('player_id, is_starter').eq('match_id', id).eq('club_id', myClub.id),
      db.from('suspensions').select('player_id, matches_total, matches_served').eq('status', 'ACTIVE')
    ]).then(function (all) {
      var players = all[0].data || [];
      var suspended = {};
      (all[2].data || []).forEach(function (s) { if (s.matches_served < s.matches_total) suspended[s.player_id] = true; });
      var existing = {};
      (all[1].data || []).forEach(function (l) { existing[l.player_id] = l.is_starter ? 'XI' : 'BENCH'; });
      var closes = chosen ? '<p class="muted">Lineup closes ' + esc(lineupCloses(chosen)) + ' (20 minutes before kick-off).</p>' : '';
      $('luPlayers').innerHTML = players.length ? closes + '<p class="muted">Pick up to 11 for the Starting XI and up to 23 in total. Players left blank are not in the matchday squad.</p>' + players.map(function (x) {
        if (suspended[x.id]) { return '<div class="row"><span>' + (x.jersey_number ? '#' + esc(x.jersey_number) + ' ' : '') + esc(x.player_name) + ' <strong class="muted">Suspended</strong></span></div>'; }
        var v = existing[x.id] || '';
        return '<div class="row"><span>' + (x.jersey_number ? '#' + esc(x.jersey_number) + ' ' : '') + esc(x.player_name) + ' <span class="muted">' + esc(x.position) + '</span></span>' +
          '<select data-lu="' + esc(x.id) + '"><option value="">Not in squad</option><option value="XI"' + (v === 'XI' ? ' selected' : '') + '>Starting XI</option><option value="BENCH"' + (v === 'BENCH' ? ' selected' : '') + '>Bench</option></select></div>';
      }).join('') : 'No approved players for this season yet.';
    });
  }
  function saveLineup() {
    var id = $('luMatch').value;
    if (!id || !myClub) { msg('Choose a match first.'); return; }
    if (luMatches[id] && !lineupOpen(luMatches[id])) { msg('Lineups closed 20 minutes before kick-off.'); return; }
    var picks = [];
    document.querySelectorAll('[data-lu]').forEach(function (s) { if (s.value) picks.push({ player_id: Number(s.dataset.lu), is_starter: s.value === 'XI' }); });
    if (!picks.length) { msg('Choose the players for this match.'); return; }
    if (picks.filter(function (x) { return x.is_starter; }).length > 11) { msg('A starting XI can have at most 11 players.'); return; }
    if (picks.length > 23) { msg('A matchday squad can have at most 23 players.'); return; }
    db.from('match_lineups').delete().eq('match_id', id).eq('club_id', myClub.id).then(function (d) {
      if (d.error) throw d.error;
      return db.from('match_lineups').insert(picks.map(function (x) {
        return { match_id: Number(id), club_id: myClub.id, player_id: x.player_id, is_starter: x.is_starter };
      }));
    }).then(function (r) {
      if (r.error) throw r.error;
      msg('Lineup saved. You can change it until kick-off.');
    }).catch(function (e) { msg((e && e.message) || 'Could not save the lineup. Check the lineup and try again.'); });
  }
  var currentSeason = null, clubsList = [];
  function loadCurrentSeason() {
    return db.from('seasons').select('id, name').eq('is_current', true).maybeSingle().then(function (r) { currentSeason = r.data || null; });
  }
  function clubOptions(exceptId) {
    return clubsList.filter(function (c) { return c.id !== exceptId; }).map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.club_name) + '</option>';
    }).join('');
  }
  function uploadPhoto(clubId, file, playerId) {
    var clean = String(file.name || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = clubId + '/' + Date.now() + '-' + clean;
    return db.storage.from('player-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false }).then(function (up) {
      if (up.error) throw up.error;
      var url = db.storage.from('player-photos').getPublicUrl(path).data.publicUrl;
      return db.from('club_squad').update({ photo_url: url }).eq('id', playerId).then(function (res) { if (res.error) throw res.error; });
    });
  }
  function addPlayer(p) {
    var name = $('spName').value.trim(), nin = $('spNin').value.trim(), dob = $('spDob').value, pos = $('spPos').value;
    var jersey = $('spJersey').value ? Number($('spJersey').value) : null;
    var file = $('spPhoto').files[0];
    if (!name || !nin || !dob) { msg('Enter the name, ID number and date of birth.'); return; }
    if (jersey !== null && (!Number.isInteger(jersey) || jersey < 1 || jersey > 99)) { msg('The jersey number must be between 1 and 99.'); return; }
    if (!currentSeason) { msg('No season is set yet. Ask the Super Admin to set the current season.'); return; }
    db.auth.getUser().then(function (u) {
      return db.from('club_squad').insert({ player_name: name, player_nin: nin, date_of_birth: dob, position: pos, jersey_number: jersey,
        status: 'Active', registration_status: 'Pending', club_id: p.club_id, created_by: u.data.user.id, season_id: currentSeason.id })
        .select('id').single();
    }).then(function (r) {
      if (r.error) throw r.error;
      return file ? uploadPhoto(p.club_id, file, r.data.id) : null;
    }).then(function () {
      msg('Player added. The Super Admin will approve the registration.');
      ['spName', 'spNin', 'spDob', 'spJersey', 'spPhoto'].forEach(function (x) { $(x).value = ''; });
      loadSquad(p);
    }).catch(function (e) { msg(e.message || 'Could not save the player.'); });
  }
  function loadSquad(p) {
    db.from('club_squad').select('id, player_name, position, status, registration_status, photo_url, season_id, jersey_number').eq('club_id', p.club_id).order('player_name')
      .then(function (r) {
        var rows = r.data || [];
        $('squadList').innerHTML = rows.length ? rows.map(function (x) {
          var on = String(x.status) === 'Active';
          var needsRenewal = currentSeason && x.season_id !== currentSeason.id;
          var img = x.photo_url ? '<img class="badge" src="' + esc(x.photo_url) + '" alt="">' : '<span class="badge ph">' + esc(String(x.player_name).charAt(0)) + '</span>';
          return '<div class="post"><div class="row">' + img + '<span><strong>' + (x.jersey_number ? '#' + esc(x.jersey_number) + ' ' : '') + esc(x.player_name) + '</strong> <span class="muted">' + esc(x.position) + '</span>' +
            '<div class="muted">' + esc(x.registration_status) + ' · ' + (on ? 'Active' : 'Inactive') + (needsRenewal ? ' · from an earlier season' : '') + '</div></span></div>' +
            '<div class="btns"><button class="small" data-toggle="' + esc(x.id) + '" data-next="' + (on ? 'Inactive' : 'Active') + '">' + (on ? 'Mark inactive' : 'Mark active') + '</button>' +
            (needsRenewal ? '<button class="small" data-renew="' + esc(x.id) + '">Renew for ' + esc(currentSeason.name) + '</button>' : '') + '</div>' +
            '<label>Jersey number (1–99)</label><input type="number" min="1" max="99" value="' + esc(x.jersey_number || '') + '" data-jersey-for="' + esc(x.id) + '">' +
            '<label>Change photo</label><input type="file" accept="image/*" data-photo-for="' + esc(x.id) + '">' +
            '<label>Transfer to</label><select data-transfer-for="' + esc(x.id) + '"><option value="">Choose a club…</option>' + clubOptions(p.club_id) + '</select>' +
            '<div class="btns"><button class="small" data-transfer="' + esc(x.id) + '">Request transfer</button></div>' +
            '</div>';
        }).join('') : 'No players yet.';
        wireSquadRows(p);
      });
    loadMyTransfers(p);
  }
  function wireSquadRows(p) {
    document.querySelectorAll('[data-jersey-for]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = inp.value.trim() ? Number(inp.value) : null;
        if (v !== null && (!Number.isInteger(v) || v < 1 || v > 99)) { msg('The jersey number must be between 1 and 99.'); loadSquad(p); return; }
        db.from('club_squad').update({ jersey_number: v }).eq('id', inp.dataset.jerseyFor).then(function (res) {
          msg(res.error ? 'That jersey number is already taken in your squad this season.' : 'Jersey number saved.'); loadSquad(p);
        });
      });
    });
    document.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        db.from('club_squad').update({ status: b.dataset.next }).eq('id', b.dataset.toggle).then(function (res) {
          msg(res.error ? res.error.message : 'Updated.'); loadSquad(p);
        });
      });
    });
    document.querySelectorAll('[data-renew]').forEach(function (b) {
      b.addEventListener('click', function () {
        db.from('club_squad').update({ season_id: currentSeason.id, registration_status: 'Pending' }).eq('id', b.dataset.renew).then(function (res) {
          msg(res.error ? res.error.message : 'Renewal sent to the Super Admin for approval.'); loadSquad(p);
        });
      });
    });
    document.querySelectorAll('[data-photo-for]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var f = inp.files[0]; if (!f) return;
        msg('Uploading photo…');
        uploadPhoto(p.club_id, f, inp.dataset.photoFor).then(function () { msg('Photo saved.'); loadSquad(p); })
          .catch(function (e) { msg(e.message || 'Photo could not be saved.'); });
      });
    });
    document.querySelectorAll('[data-transfer]').forEach(function (b) {
      b.addEventListener('click', function () {
        var to = document.querySelector('[data-transfer-for="' + b.dataset.transfer + '"]').value;
        if (!to) { msg('Choose the club the player is moving to.'); return; }
        db.from('squad_transfers').insert({ player_id: Number(b.dataset.transfer), from_club: p.club_id, to_club: to }).then(function (res) {
          msg(res.error ? res.error.message : 'Transfer request sent to the Super Admin.'); loadMyTransfers(p);
        });
      });
    });
  }
  function loadMyTransfers(p) {
    db.from('squad_transfers').select('id, status, from_club, to_club, club_squad(player_name)').order('requested_at', { ascending: false }).limit(20).then(function (r) {
      var rows = r.data || [];
      var names = {}; clubsList.forEach(function (k) { names[k.id] = k.club_name; });
      $('transferList').innerHTML = rows.length ? rows.map(function (x) {
        var dir = x.from_club === p.club_id ? 'Out to ' + (names[x.to_club] || 'another club') : 'In from ' + (names[x.from_club] || 'another club');
        return '<div class="ev"><span class="etxt">' + esc(x.club_squad ? x.club_squad.player_name : 'Player') + ' · ' + esc(dir) + '<small>' + esc(x.status) + '</small></span></div>';
      }).join('') : 'No transfer requests yet.';
    });
  }

  // ---------- SUPER ADMIN: player registrations ----------
  function loadSquadReview() {
    db.from('club_squad').select('id, player_name, player_nin, position, club_id, date_of_birth').eq('registration_status', 'Pending').order('created_at', { ascending: true })
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) { $('squadReview').innerHTML = 'No players waiting.'; return; }
        db.from('league_clubs').select('id, club_name').then(function (c) {
          var names = {}; (c.data || []).forEach(function (k) { names[k.id] = k.club_name; });
          $('squadReview').innerHTML = rows.map(function (x) {
            return '<div class="post"><strong>' + esc(x.player_name) + '</strong> <span class="muted">' + esc(x.position) + '</span>' +
              '<div class="muted">' + esc(names[x.club_id] || 'Unknown club') + ' · ID ' + esc(x.player_nin) + ' · born ' + esc(x.date_of_birth) + '</div>' +
              '<div class="btns"><button class="primary" data-sq="' + esc(x.id) + '" data-to="Approved">Approve</button><button class="secondary" data-sq="' + esc(x.id) + '" data-to="Rejected">Reject</button></div></div>';
          }).join('');
          document.querySelectorAll('[data-sq]').forEach(function (b) {
            b.addEventListener('click', function () {
              db.from('club_squad').update({ registration_status: b.dataset.to }).eq('id', b.dataset.sq).then(function (res) {
                msg(res.error ? res.error.message : (b.dataset.to === 'Approved' ? 'Player approved.' : 'Player rejected.')); loadSquadReview();
              });
            });
          });
        });
      });
  }

  function loadTransferReview() {
    db.from('squad_transfers').select('id, from_club, to_club, club_squad(player_name, position)').eq('status', 'Pending').order('requested_at', { ascending: true })
      .then(function (r) {
        var rows = r.data || [];
        if (!rows.length) { $('transferReview').innerHTML = 'No transfer requests waiting.'; return; }
        db.from('league_clubs').select('id, club_name').then(function (c) {
          var names = {}; (c.data || []).forEach(function (k) { names[k.id] = k.club_name; });
          $('transferReview').innerHTML = rows.map(function (x) {
            return '<div class="post"><strong>' + esc(x.club_squad ? x.club_squad.player_name : 'Player') + '</strong> <span class="muted">' + esc(x.club_squad ? x.club_squad.position : '') + '</span>' +
              '<div class="muted">' + esc(names[x.from_club] || '?') + ' → ' + esc(names[x.to_club] || '?') + '</div>' +
              '<div class="btns"><button class="primary" data-tr="' + esc(x.id) + '" data-ok="1">Approve</button><button class="secondary" data-tr="' + esc(x.id) + '" data-ok="0">Reject</button></div></div>';
          }).join('');
          document.querySelectorAll('[data-tr]').forEach(function (b) {
            b.addEventListener('click', function () {
              db.rpc('decide_transfer', { p_id: Number(b.dataset.tr), p_approve: b.dataset.ok === '1' }).then(function (res) {
                msg(res.error ? res.error.message : (b.dataset.ok === '1' ? 'Transfer approved.' : 'Transfer rejected.')); loadTransferReview();
              });
            });
          });
        });
      });
  }

  // ---------- DEVELOPER PANEL ----------
  var clubsCache = [], devUser = null;
  var ROLE_OPTIONS = [['CLUB_ADMIN','Club Manager'],['REFEREE','Referee'],['MATCH_COMMISSIONER','Match Commissioner'],['MEDIA_OFFICER','Media Officer'],['DISCIPLINARY_OFFICER','Disciplinary Officer'],['SUPER_ADMIN','Super Admin']];
  function developer(p) {
    devUser=p;
    box().innerHTML =
      '<h2 class="rt">League operations</h2><div id="leagueState" class="muted">Checking…</div><div class="btns"><button class="secondary" id="pauseBtn">Pause league</button><button class="primary" id="resumeBtn">Resume league</button></div>'+
      '<h2 class="rt">Whole application</h2><div id="appState" class="muted">Checking…</div><div class="btns"><button class="secondary" id="freezeAppBtn">Freeze entire app</button><button class="primary" id="unfreezeAppBtn">Unfreeze entire app</button></div>'+
      '<h2 class="rt">Assign a role</h2><p class="muted">Full name, email (unique account ID), and a round photo selected from your phone gallery.</p>'+
      '<label for="ivName">Full name</label><input id="ivName" type="text" autocomplete="name">'+input('ivEmail','Email address','email')+
      '<label for="ivPhoto">Round profile photo</label><input id="ivPhoto" type="file" accept="image/jpeg,image/png,image/webp"><div id="ivPhotoPreview" class="muted">No photo selected.</div>'+
      '<label for="ivRole">Role</label><select id="ivRole">'+ROLE_OPTIONS.map(function(o){return '<option value="'+o[0]+'">'+esc(o[1])+'</option>';}).join('')+'</select>'+
      '<label for="ivClub">Club (Club Managers only)</label><select id="ivClub"><option value="">Loading clubs…</option></select><div class="btns"><button class="primary" id="ivSave">Save role</button></div>'+
      '<h2 class="rt">Pending role assignments</h2><div id="ivList" class="muted">Loading…</div>'+
      '<h2 class="rt">All accounts and roles</h2><p class="muted">Change roles, suspend, restore or delete accounts. Actions are logged automatically.</p><div id="roleList" class="muted">Loading…</div>'+
      '<h2 class="rt">Recent role changes</h2><div id="roleLog" class="muted">Loading…</div><div class="status" id="roleMsg"></div>';
    loadLeagueState();loadAppState();loadAccountsDev(p);loadRoleLog();loadInviteForm();
    $('pauseBtn').onclick=function(){setPause(true);};$('resumeBtn').onclick=function(){setPause(false);};
    $('freezeAppBtn').onclick=function(){setAppFreeze(true);};$('unfreezeAppBtn').onclick=function(){setAppFreeze(false);};
    $('ivPhoto').onchange=function(){var f=this.files&&this.files[0];if(!f){$('ivPhotoPreview').textContent='No photo selected.';return;}if(['image/jpeg','image/png','image/webp'].indexOf(f.type)===-1||f.size>4*1024*1024){this.value='';msg('Choose a JPG, PNG or WebP photo no larger than 4 MB.');return;}var u=URL.createObjectURL(f);$('ivPhotoPreview').innerHTML='<img src="'+u+'" alt="Profile preview" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #16834a">';};
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
    db.from('league_clubs').select('id,club_name').order('club_name').then(function(c){
      $('ivClub').innerHTML='<option value="">No club</option>'+(c.data||[]).map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.club_name)+'</option>';}).join('');
    });
    $('ivSave').onclick=saveInvite;loadInvites();
  }
  function saveInvite(){
    var name=$('ivName').value.trim(),email=$('ivEmail').value.trim().toLowerCase(),role=$('ivRole').value,club=$('ivClub').value||null,file=$('ivPhoto').files&&$('ivPhoto').files[0];
    if(!name||!email){msg('Enter the full name and email address.');return;}
    if(role==='CLUB_ADMIN'&&!club){msg('Choose the club for this Club Manager.');return;}
    msg('Saving role assignment…');
    uploadDevPhoto(email,file).then(function(photo){
      return db.rpc('invite_user',{p_email:email,p_role:role,p_club:club,p_full_name:name,p_photo_url:photo});
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
  function clubPicker(u){var opts='<option value="">No club</option>'+clubsCache.map(function(c){return '<option value="'+esc(c.id)+'"'+(c.id===u.club_id?' selected':'')+'>'+esc(c.club_name)+'</option>';}).join('');return '<label>Club</label><select data-club-for="'+esc(u.id)+'">'+opts+'</select><button class="small" data-club-apply="'+esc(u.id)+'">Apply club</button>';}
  function currentRoleKey(u){var r=String(u.system_role).toUpperCase();return r==='REFEREE'&&u.official_title==='Match Commissioner'?'MATCH_COMMISSIONER':r;}
  function loadAccountsDev(p){
    db.from('league_clubs').select('id,club_name').order('club_name').then(function(c){
      clubsCache=c.data||[];return db.from('user_profiles').select('id,full_name,email,photo_url,system_role,status,club_id,official_title').order('email').limit(500);
    }).then(function(r){
      if(r.error){$('roleList').textContent=r.error.message;return;}var rows=r.data||[];
      $('roleList').innerHTML=rows.length?rows.map(function(u){
        var me=u.id===p.id,dev=String(u.system_role).toUpperCase()==='DEVELOPER',active=String(u.status).toLowerCase()==='active',waiting=String(u.system_role).toUpperCase()==='NONE';
        var opts=(waiting?'<option value="NONE" selected>Waiting for a role</option>':'')+ROLE_OPTIONS.map(function(o){return '<option value="'+o[0]+'"'+(currentRoleKey(u)===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('');
        var pic=u.photo_url?'<img src="'+esc(u.photo_url)+'" alt="" style="width:50px;height:50px;border-radius:50%;object-fit:cover;margin-right:10px">':'';
        return '<div class="post"><div style="display:flex;align-items:center">'+pic+'<div><strong>'+esc(u.full_name||u.email)+(me?' (you)':'')+'</strong><div class="muted">'+esc(u.email)+' · '+esc(u.status)+' · '+esc(u.system_role||'NONE')+'</div></div></div>'+
          (dev?'<div class="muted">Developer account · protected</div>':'<label>Role</label><select data-role-for="'+esc(u.id)+'">'+opts+'</select>'+(String(u.system_role).toUpperCase()==='CLUB_ADMIN'?clubPicker(u):'')+
          '<div class="btns"><button class="small" data-apply="'+esc(u.id)+'">Apply role</button>'+(me?'':'<button class="small '+(active?'danger':'')+'" data-status="'+esc(u.id)+'" data-next="'+(active?'Suspended':'Active')+'">'+(active?'Suspend':'Restore')+'</button><button class="small danger" data-delete="'+esc(u.id)+'">Delete account</button>')+'</div>')+'</div>';
      }).join(''):'No accounts yet.';
      document.querySelectorAll('[data-apply]').forEach(function(b){b.onclick=function(){var id=b.dataset.apply,el=document.querySelector('[data-role-for="'+id+'"]');if(!el)return;db.rpc('set_user_role',{p_user:id,p_role:el.value}).then(function(x){msg(x.error?x.error.message:'Role updated.');loadAccountsDev(p);loadRoleLog();});};});
      document.querySelectorAll('[data-club-apply]').forEach(function(b){b.onclick=function(){var id=b.dataset.clubApply,cl=document.querySelector('[data-club-for="'+id+'"]').value||null;db.rpc('set_user_club',{p_user:id,p_club:cl}).then(function(x){msg(x.error?x.error.message:'Club updated.');loadAccountsDev(p);});};});
      document.querySelectorAll('[data-status]').forEach(function(b){b.onclick=function(){var st=b.dataset.next;db.rpc('set_account_status',{p_user:b.dataset.status,p_status:st}).then(function(x){msg(x.error?x.error.message:(st==='Active'?'Account restored.':'Account suspended.'));loadAccountsDev(p);});};});
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
      return db.from('match_referee_assignments').select('match_id').eq('referee_user_id', u.data.user.id).eq('assignment_status', 'ACTIVE').eq('official_role', 'MAIN');
    }).then(function (a) {
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
      $('rfPanel').classList.toggle('hidden', m.match_status !== 'LIVE' && m.match_status !== 'HT');
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
