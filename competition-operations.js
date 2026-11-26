/* SLFA Competition Operations & Match Compliance Board.
   Super Admin only. Read-only dashboard built from existing authorised records.
   It does not change match results, assignments, reports or regulations. */
(function () {
  'use strict';
  var db = window.slfaDb;
  if (!db) return;
  var ROOT_ID = 'slfaCompetitionOpsBoard';
  var current = { matches: [], assignments: [], reports: [], sheets: [], changes: [], leagues: [], seasons: [] };
  var lastLoad = null;
  var observer = null;

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function fmt(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('en-GB', {
      timeZone: 'Africa/Freetown', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }); } catch (e) { return String(value); }
  }
  function day(value) {
    if (!value) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  function upper(v) { return String(v || '').trim().toUpperCase(); }
  function activeRows(rows) {
    return (rows || []).filter(function (x) { return upper(x.assignment_status) === 'ACTIVE'; });
  }
  function statusClass(ok) { return ok ? 'ok' : 'flag'; }
  function pill(text, ok) { return '<span class="co-pill ' + statusClass(ok) + '">' + esc(text) + '</span>'; }
  function matchTime(m) { return day(m.new_match_date || m.match_date); }
  function isCancelled(m) { return ['CANCELLED','POSTPONED','ABANDONED','VOID'].indexOf(upper(m.match_status)) >= 0; }
  function hasScore(m) { return m.home_score !== null && m.home_score !== undefined && m.away_score !== null && m.away_score !== undefined; }
  function statusName(m) {
    var s = upper(m.match_status);
    if (s) return s.replace(/_/g, ' ');
    return hasScore(m) ? 'RESULT RECORDED' : 'SCHEDULED';
  }
  function addStyle() {
    if ($('coOpsStyle')) return;
    var st = document.createElement('style');
    st.id = 'coOpsStyle';
    st.textContent = [
      '#'+ROOT_ID+'{margin:20px 0 26px;padding:18px;border:1px solid var(--border,#dce4eb);border-radius:16px;background:var(--panel,#fff);color:var(--text,#182a3d);box-shadow:0 8px 26px rgba(8,28,48,.07)}',
      '#'+ROOT_ID+' *{box-sizing:border-box}',
      '#'+ROOT_ID+' .co-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}',
      '#'+ROOT_ID+' .co-kicker{font-size:10px;letter-spacing:1.5px;font-weight:800;color:#b18a3f}',
      '#'+ROOT_ID+' h2{font-size:20px;margin:5px 0 6px}',
      '#'+ROOT_ID+' h3{font-size:14px;margin:0 0 11px}',
      '#'+ROOT_ID+' p{font-size:12px;line-height:1.55;color:var(--muted,#718096)}',
      '#'+ROOT_ID+' .co-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '#'+ROOT_ID+' button,#'+ROOT_ID+' select,#'+ROOT_ID+' input{font:inherit}',
      '#'+ROOT_ID+' button{border:1px solid #cbd5df;border-radius:9px;padding:9px 12px;background:#0c6848;color:#fff;font-weight:700;font-size:11px;cursor:pointer}',
      '#'+ROOT_ID+' button.co-secondary{background:transparent;color:inherit}',
      '#'+ROOT_ID+' .co-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:15px 0}',
      '#'+ROOT_ID+' .co-metric{padding:13px;border:1px solid var(--border,#e0e6ed);border-radius:12px;background:var(--surface,#f7f9fb);min-width:0}',
      '#'+ROOT_ID+' .co-metric span{display:block;font-size:10px;color:var(--muted,#718096);font-weight:700}',
      '#'+ROOT_ID+' .co-metric strong{display:block;font-size:25px;margin-top:6px}',
      '#'+ROOT_ID+' .co-note{padding:10px 12px;border-radius:10px;background:rgba(177,138,63,.09);border:1px solid rgba(177,138,63,.28);font-size:11px;line-height:1.5;margin:10px 0}',
      '#'+ROOT_ID+' .co-controls{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}',
      '#'+ROOT_ID+' .co-controls input,#'+ROOT_ID+' .co-controls select{padding:9px 10px;border-radius:9px;border:1px solid var(--border,#dce4eb);background:var(--panel,#fff);color:inherit;font-size:11px;min-width:150px}',
      '#'+ROOT_ID+' .co-table-wrap{overflow:auto;border:1px solid var(--border,#e1e7ee);border-radius:10px}',
      '#'+ROOT_ID+' table{border-collapse:collapse;width:100%;min-width:840px}',
      '#'+ROOT_ID+' th{text-align:left;padding:10px;background:var(--surface,#f6f8fa);font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted,#718096)}',
      '#'+ROOT_ID+' td{padding:10px;border-top:1px solid var(--border,#e7ebf0);font-size:11px;vertical-align:top}',
      '#'+ROOT_ID+' .co-sub{display:block;font-size:10px;color:var(--muted,#718096);margin-top:4px}',
      '#'+ROOT_ID+' .co-pill{display:inline-block;border-radius:30px;padding:4px 7px;font-size:9px;font-weight:800;margin:2px 2px 2px 0}',
      '#'+ROOT_ID+' .co-pill.ok{background:#e7f5ed;color:#176743}',
      '#'+ROOT_ID+' .co-pill.flag{background:#fff0dc;color:#8a5b0b}',
      '#'+ROOT_ID+' .co-empty{padding:20px;text-align:center;color:var(--muted,#718096);font-size:12px}',
      '#'+ROOT_ID+' .co-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:12px;margin-top:14px}',
      '#'+ROOT_ID+' .co-card{border:1px solid var(--border,#e1e7ee);border-radius:12px;padding:13px;min-width:0}',
      '#'+ROOT_ID+' .co-list{display:grid;gap:8px}',
      '#'+ROOT_ID+' .co-item{padding:9px;border-radius:9px;background:var(--surface,#f7f9fb);font-size:11px;line-height:1.45}',
      '#'+ROOT_ID+' .co-item small{display:block;color:var(--muted,#718096);margin-top:3px}',
      '@media(max-width:760px){#'+ROOT_ID+' .co-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ROOT_ID+' .co-grid{grid-template-columns:1fr}#'+ROOT_ID+'{padding:13px}}'
    ].join('');
    document.head.appendChild(st);
  }
  function mount() {
    var role = $('whoRole'), target = $('roleTools');
    if (!target || !role || upper(role.textContent).replace(/\s+/g, '_') !== 'SUPER_ADMIN') return;
    if (!target.querySelector('.sa-command-centre')) return;
    addStyle();
    var panel = $(ROOT_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = ROOT_ID;
      panel.setAttribute('aria-labelledby', 'coOpsTitle');
      var anchor = target.querySelector('.sa-command-centre');
      if (anchor && anchor.parentNode === target) anchor.insertAdjacentElement('afterend', panel);
      else target.insertBefore(panel, target.firstChild);
    }
    if (!panel.dataset.initialized) {
      panel.dataset.initialized = '1';
      panel.innerHTML = '<div class="co-head"><div><span class="co-kicker">SLFA · COMPETITION GOVERNANCE</span><h2 id="coOpsTitle">Matchday Operations &amp; Compliance Board</h2><p>One view of fixture readiness, appointed officials, team-sheet filing, match reports and result amendments.</p></div><div class="co-actions"><button type="button" id="coOpsRefresh">Refresh records</button><button type="button" class="co-secondary" id="coOpsExport">Export CSV</button></div></div><div class="co-note">Read-only oversight. This board does not alter official scores, assign officials or decide disciplinary matters. Readiness flags are operational prompts, not a substitute for SLFA competition regulations.</div><div id="coOpsStatus" role="status" aria-live="polite">Checking access…</div><div id="coOpsContent"></div>';
      $('coOpsRefresh').addEventListener('click', load);
      $('coOpsExport').addEventListener('click', exportCSV);
      load();
    }
  }
  function mapBy(rows, key) {
    var out = {};
    (rows || []).forEach(function (r) { var k = String(r[key]); (out[k] || (out[k] = [])).push(r); });
    return out;
  }
  function query(table, fields, orderColumn) {
    var q = db.from(table).select(fields);
    if (orderColumn) q = q.order(orderColumn, { ascending: false });
    return q.limit(1000);
  }
  function load() {
    var status = $('coOpsStatus'), content = $('coOpsContent');
    if (!status || !content) return;
    status.textContent = 'Loading authorised competition records…';
    content.innerHTML = '';
    Promise.all([
      query('matches', 'id,match_date,new_match_date,home_team,away_team,home_score,away_score,match_status,venue,season_id,league_id'),
      query('match_referee_assignments', 'match_id,referee_user_id,official_role,assignment_status'),
      query('match_commissioner_reports', 'match_id,report_status,submitted_at,reviewed_at,updated_at', 'updated_at'),
      query('match_team_sheets', 'match_id,club_id,submitted_at', 'submitted_at'),
      query('match_result_changes', 'match_id,action,reason,changed_by_role,changed_at', 'changed_at'),
      query('leagues', 'id,name'),
      query('seasons', 'id,name,is_current')
    ]).then(function (results) {
      var names = ['fixtures','official assignments','commissioner reports','team sheets','result-change history','competitions','seasons'];
      var failures = [];
      results.forEach(function (r, i) { if (r.error) failures.push(names[i] + ': ' + r.error.message); });
      if (results[0].error) throw new Error('Fixture records could not be read. ' + results[0].error.message);
      current.matches = results[0].data || [];
      current.assignments = results[1].data || [];
      current.reports = results[2].data || [];
      current.sheets = results[3].data || [];
      current.changes = results[4].data || [];
      current.leagues = results[5].data || [];
      current.seasons = results[6].data || [];
      lastLoad = new Date();
      render(failures);
    }).catch(function (e) {
      status.textContent = 'Dashboard could not load: ' + (e.message || e);
    });
  }
  function buildRows() {
    var now = new Date(), pastLimit = new Date(now.getTime() - 30 * 86400000), futureLimit = new Date(now.getTime() + 21 * 86400000);
    var assignments = mapBy(current.assignments, 'match_id');
    var reports = mapBy(current.reports, 'match_id');
    var sheets = mapBy(current.sheets, 'match_id');
    var changes = mapBy(current.changes, 'match_id');
    var leagueNames = {};
    current.leagues.forEach(function (l) { leagueNames[String(l.id)] = l.name; });
    return current.matches.map(function (m) {
      var dt = matchTime(m), as = activeRows(assignments[m.id] || []), rs = reports[m.id] || [], ts = sheets[m.id] || [], cs = changes[m.id] || [];
      var latestReport = rs[0] || null;
      var main = as.filter(function (x) { return upper(x.official_role) === 'MAIN'; }).length;
      var assistants = as.filter(function (x) { return upper(x.official_role) === 'ASSISTANT'; }).length;
      var commissioner = as.filter(function (x) { return upper(x.official_role) === 'MATCH_COMMISSIONER'; }).length;
      var teamIds = [];
      ts.forEach(function (x) { if (x.club_id && teamIds.indexOf(String(x.club_id)) < 0) teamIds.push(String(x.club_id)); });
      var status = statusName(m), past = !!dt && dt < now, upcoming = !!dt && dt >= now && dt <= futureLimit;
      var complete = hasScore(m) || ['FT','FINISHED','COMPLETED'].indexOf(upper(m.match_status)) >= 0;
      var cancelled = isCancelled(m);
      var ageHours = dt && past ? (now.getTime() - dt.getTime()) / 3600000 : 0;
      var flags = [];
      if (!cancelled && upcoming) {
        if (!main) flags.push('Main referee not appointed');
        if (assistants < 2) flags.push('Assistant referees: ' + assistants + '/2');
        if (!commissioner) flags.push('Match Commissioner not appointed');
        if (!String(m.venue || '').trim()) flags.push('Venue not recorded');
      }
      if (!cancelled && past && ageHours > 6 && !complete) flags.push('Final result not recorded');
      if (!cancelled && past && ageHours > 24 && (!latestReport || !['SUBMITTED','REVIEWED'].includes(upper(latestReport.report_status)))) flags.push('Commissioner report follow-up due');
      if (!cancelled && upcoming && dt && (dt.getTime() - now.getTime()) <= 3 * 3600000 && teamIds.length < 2) {
        flags.push('Team sheets filed: ' + teamIds.length + '/2');
      }
      return {
        id: m.id, date: dt, home: m.home_team || 'Home team', away: m.away_team || 'Away team',
        venue: m.venue || '', score: hasScore(m) ? (m.home_score + '–' + m.away_score) : '—',
        status: status, league: leagueNames[String(m.league_id)] || 'Competition not labelled',
        season: m.season_id, main: main, assistants: assistants, commissioner: commissioner,
        sheets: teamIds.length, report: latestReport ? upper(latestReport.report_status) : 'NOT FILED',
        changes: cs.length, flags: flags, cancelled: cancelled, upcoming: upcoming, past: past,
        withinWindow: (!!dt && dt >= pastLimit && dt <= futureLimit)
      };
    }).filter(function (m) { return m.withinWindow; }).sort(function (a, b) {
      return (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0);
    });
  }
  function render(failures) {
    var status = $('coOpsStatus'), content = $('coOpsContent');
    if (!status || !content) return;
    var rows = buildRows(), now = new Date();
    var upcoming = rows.filter(function (m) { return m.upcoming && !m.cancelled; });
    var live = rows.filter(function (m) { return ['LIVE','HT','HALF TIME'].includes(m.status); });
    var gaps = upcoming.filter(function (m) { return m.flags.length > 0; });
    var reportFollowups = rows.filter(function (m) { return m.flags.indexOf('Commissioner report follow-up due') >= 0; });
    var missingResults = rows.filter(function (m) { return m.flags.indexOf('Final result not recorded') >= 0; });
    var submittedReports = current.reports.filter(function (r) { return ['SUBMITTED','REVIEWED'].includes(upper(r.report_status)); }).length;
    var pendingReview = current.reports.filter(function (r) { return upper(r.report_status) === 'SUBMITTED'; }).length;
    var recentChanges = current.changes.filter(function (c) { var d = day(c.changed_at); return d && d >= new Date(now.getTime() - 30 * 86400000); });
    var leagueOptions = '<option value="">All competitions</option>' + current.leagues.map(function (l) {
      return '<option value="' + esc(l.name) + '">' + esc(l.name) + '</option>';
    }).join('');
    var metrics = [
      ['Upcoming fixtures · 21 days', upcoming.length],
      ['Fixtures needing attention', gaps.length],
      ['Reports awaiting review', pendingReview],
      ['Post-match follow-ups due', reportFollowups.length],
      ['Past matches without results', missingResults.length],
      ['Result amendments · 30 days', recentChanges.length],
      ['Live / half-time matches', live.length],
      ['Reports submitted or reviewed', submittedReports]
    ];
    var recentItems = recentChanges.slice(0, 8).map(function (c) {
      var m = current.matches.find(function (x) { return String(x.id) === String(c.match_id); });
      return '<div class="co-item"><strong>' + esc(m ? m.home_team + ' v ' + m.away_team : 'Match #' + c.match_id) + '</strong><small>' + esc(upper(c.action)) + ' · ' + esc(c.changed_by_role || 'Authorised role') + ' · ' + esc(fmt(c.changed_at)) + '</small>' + (c.reason ? '<small>Reason: ' + esc(c.reason) + '</small>' : '') + '</div>';
    }).join('');
    content.innerHTML = '<div class="co-metrics">' + metrics.map(function (x) {
      return '<article class="co-metric"><span>' + esc(x[0]) + '</span><strong>' + x[1] + '</strong></article>';
    }).join('') + '</div>' +
      (failures && failures.length ? '<div class="co-note">Some optional records could not be read: ' + esc(failures.join(' · ')) + '. The figures above may be incomplete.</div>' : '') +
      '<div class="co-controls"><select id="coLeagueFilter">' + leagueOptions + '</select><input id="coSearch" type="search" placeholder="Find club, venue or match status" aria-label="Search fixtures"></div>' +
      '<div class="co-table-wrap"><table><thead><tr><th>Kick-off · Freetown</th><th>Fixture / competition</th><th>Assigned officials</th><th>Team sheets</th><th>Commissioner report</th><th>Score / status</th><th>Operational checks</th></tr></thead><tbody id="coRows"></tbody></table></div>' +
      '<div class="co-grid"><section class="co-card"><h3>Recent result amendments</h3><div class="co-list">' + (recentItems || '<div class="co-empty">No result amendments recorded in the last 30 days.</div>') + '</div></section>' +
      '<section class="co-card"><h3>How to read this board</h3><p><strong>Upcoming:</strong> checks for a main referee, two assistant referees, a Match Commissioner and a recorded venue.</p><p><strong>After a match:</strong> a missing final result is flagged after six hours; a missing submitted commissioner report is flagged for follow-up after 24 hours.</p><p><strong>Team sheets:</strong> shown as filed by the two club IDs when fixtures are within three hours of kick-off.</p><p>Six-hour and 24-hour periods are operational follow-up prompts only. They are not represented as official SLFA deadlines and should be aligned with competition policy.</p></section></div>' +
      '<p class="co-sub">Last refreshed: ' + esc(fmt(lastLoad)) + ' · Read-only view · ' + current.matches.length + ' match records loaded</p>';
    var leagueFilter = $('coLeagueFilter'), search = $('coSearch');
    function drawRows() {
      var l = leagueFilter ? leagueFilter.value : '', term = search ? search.value.trim().toLowerCase() : '';
      var filtered = rows.filter(function (m) {
        var hay = [m.home,m.away,m.venue,m.status,m.league].join(' ').toLowerCase();
        return (!l || m.league === l) && (!term || hay.indexOf(term) >= 0);
      });
      var body = $('coRows');
      if (!body) return;
      body.innerHTML = filtered.length ? filtered.map(function (m) {
        var officials = '<div>' + pill('Main ' + (m.main ? '✓' : '—'), !!m.main) + '</div><div>' + pill('Assistants ' + m.assistants + '/2', m.assistants >= 2) + '</div><div>' + pill('Commissioner ' + (m.commissioner ? '✓' : '—'), !!m.commissioner) + '</div>';
        var checks = m.flags.length ? m.flags.map(function (f) { return pill(f, false); }).join('') : pill(m.cancelled ? 'Cancelled / postponed' : 'No flagged checks', true);
        return '<tr><td>' + esc(fmt(m.date)) + '</td><td><strong>' + esc(m.home + ' v ' + m.away) + '</strong><span class="co-sub">' + esc(m.league) + '</span><span class="co-sub">' + esc(m.venue || 'Venue not recorded') + '</span></td><td>' + officials + '</td><td>' + m.sheets + '/2 filed</td><td>' + pill(m.report, ['SUBMITTED','REVIEWED'].includes(m.report)) + '</td><td><strong>' + esc(m.score) + '</strong><span class="co-sub">' + esc(m.status) + '</span></td><td>' + checks + (m.changes ? '<span class="co-sub">' + m.changes + ' result change record(s)</span>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="co-empty">No fixtures match the selected period or filter.</td></tr>';
    }
    if (leagueFilter) leagueFilter.addEventListener('change', drawRows);
    if (search) search.addEventListener('input', drawRows);
    drawRows();
    status.textContent = current.matches.length ? 'Operational records loaded. Review flagged items and open the relevant management workspace to take action.' : 'No match records are currently stored in this database. The board is ready and will populate when fixtures are entered.';
  }
  function exportCSV() {
    var rows = buildRows();
    var headers = ['Kickoff Freetown','Competition','Home team','Away team','Venue','Match status','Score','Main referee count','Assistant referee count','Match Commissioner count','Team sheets filed','Commissioner report status','Result change records','Operational flags'];
    var lines = [headers].concat(rows.map(function (m) {
      return [fmt(m.date),m.league,m.home,m.away,m.venue,m.status,m.score,m.main,m.assistants,m.commissioner,m.sheets,m.report,m.changes,m.flags.join('; ')];
    }));
    var csv = lines.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"'; }).join(','); }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'slfa-matchday-operations-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function start() {
    mount();
    if (observer || !document.body) return;
    observer = new MutationObserver(function () { mount(); });
    observer.observe(document.body, { childList: true, subtree: true });
    if (window.slfaDb && db.auth) {
      db.auth.onAuthStateChange(function () { setTimeout(mount, 0); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
