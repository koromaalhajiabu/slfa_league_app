/* SLFA Matchday Command & Compliance Centre.
   Super Admin oversight only. This module reads approved operational records and
   never changes official scores, appointments, disciplinary decisions or publications. */
(function () {
  'use strict';
  var db = window.slfaDb;
  if (!db) return;
  var ROOT_ID = 'slfaCompetitionOpsBoard';
  var current = {
    matches:[], assignments:[], commissionerReports:[], sheets:[], records:[],
    lineups:[], events:[], changes:[], leagues:[], seasons:[], profiles:{}, players:{}
  };
  var lastLoad = null, observer = null, loading = false;

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function upper(v) { return String(v || '').trim().toUpperCase(); }
  function norm(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g,' '); }
  function fmt(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Freetown',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
    catch (_) { return String(value); }
  }
  function date(value) { if (!value) return null; var d=new Date(value); return isNaN(d.getTime())?null:d; }
  function matchTime(m) { return date(m.new_match_date || m.match_date); }
  function cancelled(m) { return ['CANCELLED','POSTPONED','ABANDONED','VOID'].indexOf(upper(m.match_status))>=0; }
  function live(m) { return ['LIVE','HT','HALF TIME','HALF_TIME'].indexOf(upper(m.match_status))>=0; }
  function hasScore(m) { return m.home_score!==null&&m.home_score!==undefined&&m.away_score!==null&&m.away_score!==undefined; }
  function matchLabel(m) { return (m.home_team||'Home team')+' v '+(m.away_team||'Away team'); }
  function pill(label,ok) { return '<span class="co-pill '+(ok?'ok':'flag')+'">'+esc(label)+'</span>'; }
  function mapBy(rows,key) {
    var out={};
    (rows||[]).forEach(function(r){var k=String(r[key]);(out[k]||(out[k]=[])).push(r);});
    return out;
  }
  function latest(rows,stamp) {
    return (rows||[]).slice().sort(function(a,b){return new Date(b[stamp]||0)-new Date(a[stamp]||0);})[0]||null;
  }
  function names(ids) {
    return (ids||[]).map(function(id){var p=current.players[String(id)]||{};return p.player_name||('Player #'+id);});
  }
  function profileName(id) {
    var p=current.profiles[String(id)]||{};
    return p.full_name||p.email||String(id||'Unassigned');
  }
  function assignmentsFor(matchId) {
    return current.assignments.filter(function(a){return String(a.match_id)===String(matchId)&&upper(a.assignment_status)==='ACTIVE';});
  }
  function sheetsFor(matchId) { return current.sheets.filter(function(s){return String(s.match_id)===String(matchId);}); }
  function lineupsFor(matchId) { return current.lineups.filter(function(x){return String(x.match_id)===String(matchId);}); }
  function eventsFor(matchId) { return current.events.filter(function(x){return String(x.match_id)===String(matchId);}); }
  function recordsFor(matchId) { return current.records.filter(function(x){return String(x.match_id)===String(matchId);}); }
  function commissionerFor(matchId) { return current.commissionerReports.filter(function(x){return String(x.match_id)===String(matchId);}); }
  function addStyle() {
    if ($('coOpsStyle')) return;
    var st=document.createElement('style'); st.id='coOpsStyle';
    st.textContent=[
      '#'+ROOT_ID+'{margin:20px 0 26px;padding:18px;border:1px solid var(--border,#dce4eb);border-radius:16px;background:var(--panel,#fff);color:var(--text,#182a3d);box-shadow:0 8px 26px rgba(8,28,48,.07)}',
      '#'+ROOT_ID+' *{box-sizing:border-box}',
      '#'+ROOT_ID+' .co-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}',
      '#'+ROOT_ID+' .co-kicker{font-size:10px;letter-spacing:1.5px;font-weight:800;color:#b18a3f}',
      '#'+ROOT_ID+' h2{font-size:20px;margin:5px 0 6px}#'+ROOT_ID+' h3{font-size:14px;margin:0 0 8px}',
      '#'+ROOT_ID+' p{font-size:12px;line-height:1.55;color:var(--muted,#718096)}',
      '#'+ROOT_ID+' .co-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '#'+ROOT_ID+' button,#'+ROOT_ID+' select,#'+ROOT_ID+' input{font:inherit}',
      '#'+ROOT_ID+' button{border:1px solid #cbd5df;border-radius:9px;padding:9px 12px;background:#0c6848;color:#fff;font-weight:700;font-size:11px;cursor:pointer}',
      '#'+ROOT_ID+' button.co-secondary{background:transparent;color:inherit}#'+ROOT_ID+' button:disabled{opacity:.5}',
      '#'+ROOT_ID+' .co-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:15px 0}',
      '#'+ROOT_ID+' .co-metric{padding:13px;border:1px solid var(--border,#e0e6ed);border-radius:12px;background:var(--surface,#f7f9fb);min-width:0}',
      '#'+ROOT_ID+' .co-metric span{display:block;font-size:10px;color:var(--muted,#718096);font-weight:700}#'+ROOT_ID+' .co-metric strong{display:block;font-size:25px;margin-top:6px}',
      '#'+ROOT_ID+' .co-note{padding:10px 12px;border-radius:10px;background:rgba(177,138,63,.09);border:1px solid rgba(177,138,63,.28);font-size:11px;line-height:1.5;margin:10px 0}',
      '#'+ROOT_ID+' .co-controls{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}',
      '#'+ROOT_ID+' .co-controls input,#'+ROOT_ID+' .co-controls select{padding:9px 10px;border-radius:9px;border:1px solid var(--border,#dce4eb);background:var(--panel,#fff);color:inherit;font-size:11px;min-width:150px}',
      '#'+ROOT_ID+' .co-table-wrap{overflow:auto;border:1px solid var(--border,#e1e7ee);border-radius:10px}',
      '#'+ROOT_ID+' table{border-collapse:collapse;width:100%;min-width:1180px}#'+ROOT_ID+' th{text-align:left;padding:10px;background:var(--surface,#f6f8fa);font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted,#718096)}',
      '#'+ROOT_ID+' td{padding:10px;border-top:1px solid var(--border,#e7ebf0);font-size:10px;vertical-align:top}',
      '#'+ROOT_ID+' .co-sub{display:block;font-size:10px;color:var(--muted,#718096);margin-top:4px}#'+ROOT_ID+' .co-pill{display:inline-block;border-radius:30px;padding:4px 7px;font-size:9px;font-weight:800;margin:2px 2px 2px 0}',
      '#'+ROOT_ID+' .co-pill.ok{background:#e7f5ed;color:#176743}#'+ROOT_ID+' .co-pill.flag{background:#fff0dc;color:#8a5b0b}',
      '#'+ROOT_ID+' .co-empty{padding:20px;text-align:center;color:var(--muted,#718096);font-size:12px}',
      '#'+ROOT_ID+' .co-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin-top:14px}#'+ROOT_ID+' .co-card{border:1px solid var(--border,#e1e7ee);border-radius:12px;padding:13px;min-width:0}',
      '#'+ROOT_ID+' .co-list{display:grid;gap:8px}#'+ROOT_ID+' .co-item{padding:9px;border-radius:9px;background:var(--surface,#f7f9fb);font-size:11px;line-height:1.45}',
      '#'+ROOT_ID+' .co-item small{display:block;color:var(--muted,#718096);margin-top:3px}',
      '#'+ROOT_ID+' .co-issues{margin:5px 0 0;padding-left:15px;font-size:9px;line-height:1.55;color:#8a5b0b}',
      '@media(max-width:760px){#'+ROOT_ID+' .co-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ROOT_ID+' .co-grid{grid-template-columns:1fr}#'+ROOT_ID+'{padding:13px}}',
      '@media print{#'+ROOT_ID+' .co-actions,#'+ROOT_ID+' .co-controls{display:none}}'
    ].join('');
    document.head.appendChild(st);
  }
  function mount() {
    var role=$('whoRole'),target=$('roleTools');
    if(!target||!role||upper(role.textContent).replace(/\s+/g,'_')!=='SUPER_ADMIN')return;
    if(!target.querySelector('.sa-command-centre'))return;
    addStyle();
    var panel=$(ROOT_ID);
    if(!panel){
      panel=document.createElement('section');panel.id=ROOT_ID;panel.setAttribute('aria-labelledby','coOpsTitle');
      var anchor=target.querySelector('.sa-command-centre');
      if(anchor&&anchor.parentNode===target)anchor.insertAdjacentElement('afterend',panel);else target.insertBefore(panel,target.firstChild);
    }
    if(!panel.dataset.initialized){
      panel.dataset.initialized='1';
      panel.innerHTML='<div class="co-head"><div><span class="co-kicker">SLFA · MATCHDAY COMMAND &amp; COMPLIANCE</span><h2 id="coOpsTitle">Matchday Operations Command Centre</h2><p>Cross-check team sheets, official appointments, match reports, evidence, OCR verification and result changes in one place.</p></div><div class="co-actions"><button type="button" id="coOpsRefresh">Refresh records</button><button type="button" class="co-secondary" id="coOpsExport">Export CSV</button></div></div><div class="co-note">This is an operational control board. It does not write or amend official scores, appoint officials, decide disciplinary matters or replace SLFA regulations. Readiness checks flag records for authorised human review; they are not automatic rulings.</div><div id="coOpsStatus" role="status" aria-live="polite">Checking access…</div><div id="coOpsContent"></div>';
      $('coOpsRefresh').addEventListener('click',load);$('coOpsExport').addEventListener('click',exportCSV);load();
    }
  }
  function query(table,fields,orderColumn){
    var q=db.from(table).select(fields);
    if(orderColumn)q=q.order(orderColumn,{ascending:false});
    return q.limit(1500);
  }
  async function load(){
    var status=$('coOpsStatus'),content=$('coOpsContent');
    if(!status||!content||loading)return;
    loading=true;status.textContent='Loading fixtures, reports, approved sheets and evidence metadata…';content.innerHTML='';
    try{
      var specs=[
        ['matches','id,match_date,new_match_date,home_team,away_team,home_score,away_score,match_status,venue,season_id,league_id,home_club_id,away_club_id,match_minute,current_half'],
        ['match_referee_assignments','match_id,referee_user_id,official_role,assignment_status,assigned_at,assigned_by'],
        ['match_commissioner_reports','id,match_id,commissioner_user_id,report_status,pitch_condition,facilities_condition,security_arrangements,home_team_arrival,away_team_arrival,officials_arrival,pre_match_notes,crowd_behaviour,match_interruptions,match_conduct,incident_details,post_match_summary,recommendations,evidence_paths,submitted_at,reviewed_at,reviewed_by,review_notes,ocr_text,ocr_status,ocr_confidence,ocr_processed_at,ocr_verified_text,ocr_verified_by,ocr_verified_at,updated_at'],
        ['match_team_sheets','id,match_id,club_id,starting_player_ids,substitute_player_ids,submitted_by,submitted_at,reference_code,status,reviewed_by,reviewed_at,review_notes,updated_at'],
        ['referee_match_record_submissions','id,reference_code,match_id,submitted_by,official_role,report_type,observed_home_score,observed_away_score,match_minute,incident_flag,incident_details,referee_notes,image_paths,status,submitted_at,reviewed_by,reviewed_at,review_notes,ocr_text,ocr_status,ocr_confidence,ocr_processed_at,ocr_verified_text,ocr_verified_by,ocr_verified_at,created_at,updated_at'],
        ['match_lineups','match_id,club_id,player_id,is_starter,submitted_by,submitted_at'],
        ['match_events','match_id,event_type,team_name,player_name,minute,assist_player_name,player_off_name,published_at,recorded_at'],
        ['match_result_changes','match_id,action,reason,changed_by_role,changed_at,old_home,old_away,new_home,new_away'],
        ['leagues','id,name'],['seasons','id,name,is_current']
      ];
      var results=await Promise.all(specs.map(function(s){return query(s[0],s[1],s[0]==='match_events'?'recorded_at':(s[0]==='match_result_changes'?'changed_at':(s[0]==='match_commissioner_reports'||s[0]==='match_team_sheets'||s[0]==='referee_match_record_submissions'?'updated_at':null)));}));
      var failures=[];
      results.forEach(function(r,i){if(r.error)failures.push(specs[i][0]+': '+r.error.message);});
      if(results[0].error)throw new Error('Fixture records could not be read. '+results[0].error.message);
      current.matches=results[0].data||[];
      current.assignments=results[1].data||[];
      current.commissionerReports=results[2].data||[];
      current.sheets=results[3].data||[];
      current.records=results[4].data||[];
      current.lineups=results[5].data||[];
      current.events=results[6].data||[];
      current.changes=results[7].data||[];
      current.leagues=results[8].data||[];
      current.seasons=results[9].data||[];
      var userIds=[];
      current.assignments.forEach(function(a){userIds.push(a.referee_user_id,a.assigned_by);});
      current.sheets.forEach(function(s){userIds.push(s.submitted_by,s.reviewed_by);});
      current.records.forEach(function(r){userIds.push(r.submitted_by,r.reviewed_by,r.ocr_verified_by);});
      current.commissionerReports.forEach(function(r){userIds.push(r.commissioner_user_id,r.reviewed_by,r.ocr_verified_by);});
      current.changes.forEach(function(c){userIds.push(c.changed_by);});
      userIds=Array.from(new Set(userIds.filter(Boolean)));
      current.profiles={};current.players={};
      var optional=[];
      if(userIds.length)optional.push(db.from('user_profiles').select('id,full_name,email,official_title').in('id',userIds).then(function(r){if(r.error)throw r.error;(r.data||[]).forEach(function(p){current.profiles[String(p.id)]=p;});}));
      var playerIds=[];
      current.sheets.forEach(function(s){playerIds=playerIds.concat(s.starting_player_ids||[],s.substitute_player_ids||[]);});
      current.lineups.forEach(function(x){playerIds.push(x.player_id);});
      playerIds=Array.from(new Set(playerIds.filter(Boolean)));
      if(playerIds.length)optional.push(db.from('club_squad').select('id,player_name,jersey_number,position,club_id,season_id,status,registration_status').in('id',playerIds).then(function(r){if(r.error)throw r.error;(r.data||[]).forEach(function(p){current.players[String(p.id)]=p;});}));
      var optionalResults=await Promise.allSettled(optional);
      optionalResults.forEach(function(x){if(x.status==='rejected')failures.push('people lookup: '+(x.reason&&x.reason.message||'unavailable'));});
      lastLoad=new Date();render(failures);
    }catch(e){status.textContent='Command Centre could not load: '+(e.message||e);}
    finally{loading=false;}
  }
  function officialSummary(m){
    var rows=assignmentsFor(m.id);
    var mains=rows.filter(function(a){return upper(a.official_role)==='MAIN';});
    var assistants=rows.filter(function(a){return upper(a.official_role)==='ASSISTANT';});
    var commissioners=rows.filter(function(a){return upper(a.official_role)==='MATCH_COMMISSIONER';});
    var dataOperators=rows.filter(function(a){return upper(a.official_role)==='DATA_OPERATOR';});
    return {rows:rows,mains:mains,assistants:assistants,commissioners:commissioners,dataOperators:dataOperators};
  }
  function analyse(m){
    var now=new Date(),kick=matchTime(m),future=kick&&kick>now,elapsed=kick&&kick<=now,
      ageHours=kick&&elapsed?(now.getTime()-kick.getTime())/3600000:0;
    var ops=officialSummary(m),sheets=sheetsFor(m.id),lineups=lineupsFor(m.id),records=recordsFor(m.id),
      mcs=commissionerFor(m.id),events=eventsFor(m.id),issues=[],discrepancies=[];
    var latestByClub={};
    sheets.forEach(function(s){if(!latestByClub[String(s.club_id)]||new Date(s.updated_at||s.submitted_at)>new Date(latestByClub[String(s.club_id)].updated_at||latestByClub[String(s.club_id)].submitted_at))latestByClub[String(s.club_id)]=s;});
    var homeSheet=m.home_club_id?latestByClub[String(m.home_club_id)]:null;
    var awaySheet=m.away_club_id?latestByClub[String(m.away_club_id)]:null;
    var mc=latest(mcs,'updated_at');
    var mainRecord=latest(records.filter(function(r){return r.official_role==='MAIN'&&r.report_type==='MATCH_RECORD'&&['SUBMITTED','UNDER_REVIEW','ACKNOWLEDGED','RETURNED'].indexOf(upper(r.status))>=0;}),'created_at');
    if(!kick)issues.push('Kick-off date/time is missing.');
    if(!String(m.venue||'').trim())issues.push('Venue is not recorded.');
    if(ops.mains.length===0)issues.push('Main Referee is not appointed.');
    if(ops.mains.length>1)issues.push('More than one active Main Referee appointment exists.');
    if(ops.assistants.length<2)issues.push('Assistant Referees appointed: '+ops.assistants.length+'/2.');
    if(ops.commissioners.length===0)issues.push('Match Commissioner is not appointed.');
    if(ops.commissioners.length>1)issues.push('More than one active Match Commissioner appointment exists.');
    if(future&&ops.dataOperators.length===0)issues.push('Live Match Data Operator is not appointed.');
    if(ops.dataOperators.length>1)issues.push('More than one active Live Match Data Operator appointment exists.');
    var sheetState=function(s,label){
      if(!s){issues.push(label+' team sheet is missing.');return 'MISSING';}
      if(s.status==='RETURNED'){issues.push(label+' team sheet was returned for correction.');return 'RETURNED';}
      if(s.status==='SUBMITTED'){issues.push(label+' team sheet is awaiting Super Admin approval.');return 'SUBMITTED';}
      if(s.status!=='APPROVED'){issues.push(label+' team sheet status is not approved.');return upper(s.status||'UNKNOWN');}
      var starters=s.starting_player_ids||[],subs=s.substitute_player_ids||[];
      if(starters.length!==11)issues.push(label+' approved sheet does not contain exactly 11 starters.');
      if(subs.length>9)issues.push(label+' approved sheet has more than 9 substitutes.');
      if(starters.some(function(id){return subs.map(String).indexOf(String(id))>=0;}))issues.push(label+' sheet repeats a player as starter and substitute.');
      var ids=starters.concat(subs);
      var unregistered=ids.filter(function(id){var p=current.players[String(id)];return !p||String(p.club_id)!==String(s.club_id)||p.status!=='Active'||p.registration_status!=='Approved'||(m.season_id!=null&&p.season_id!=null&&String(p.season_id)!==String(m.season_id));});
      if(unregistered.length)issues.push(label+' sheet contains a player not verified against the current registered squad.');
      var published=lineups.filter(function(l){return String(l.club_id)===String(s.club_id);});
      var publishedIds=published.map(function(l){return String(l.player_id);}).sort();
      var approvedIds=ids.map(String).sort();
      if(publishedIds.length!==approvedIds.length||publishedIds.some(function(id,i){return id!==approvedIds[i];}))
        issues.push(label+' approved team sheet does not match the published match lineup.');
      return 'APPROVED';
    };
    var homeState=sheetState(homeSheet,'Home'),awayState=sheetState(awaySheet,'Away');
    var reportRows=records.filter(function(r){return r.report_type==='MATCH_RECORD';});
    var acknowledged=reportRows.some(function(r){return r.official_role==='MAIN'&&r.status==='ACKNOWLEDGED';});
    if(!future&&!cancelled(m)){
      if(!mainRecord)issues.push(ageHours>1.5?'Main Referee match record is overdue.':'Main Referee match record has not been filed.');
      if(mainRecord&&mainRecord.status==='RETURNED')issues.push('Main Referee match record was returned.');
      if(mainRecord&&mainRecord.ocr_status!=='NOT_RUN'&&!mainRecord.ocr_verified_at)issues.push('Main Referee OCR text has not been human-verified.');
      if(mainRecord&&mainRecord.ocr_verified_at&&!String(mainRecord.ocr_verified_text||'').trim())issues.push('OCR is marked verified but verified text is empty.');
      if(mainRecord&&mainRecord.status!=='ACKNOWLEDGED')issues.push('Main Referee match record is not yet acknowledged by Super Admin.');
      if(!mc||mc.report_status==='DRAFT')issues.push(ageHours>1.5?'Match Commissioner report is overdue.':'Match Commissioner report has not been submitted.');
      if(mc&&mc.report_status!=='REVIEWED')issues.push('Match Commissioner report is awaiting Super Admin review.');
    }
    if(mainRecord&&hasScore(m)&&mainRecord.observed_home_score!=null&&mainRecord.observed_away_score!=null){
      if(Number(mainRecord.observed_home_score)!==Number(m.home_score)||Number(mainRecord.observed_away_score)!==Number(m.away_score))
        discrepancies.push('Referee photographed score '+mainRecord.observed_home_score+'–'+mainRecord.observed_away_score+' differs from official fixture score '+m.home_score+'–'+m.away_score+'.');
    }
    var approvedIds=new Set();
    [homeSheet,awaySheet].filter(function(s){return s&&s.status==='APPROVED';}).forEach(function(s){
      (s.starting_player_ids||[]).concat(s.substitute_player_ids||[]).forEach(function(id){approvedIds.add(String(id));});
    });
    if(approvedIds.size){
      events.forEach(function(ev){
        [ev.player_name,ev.assist_player_name,ev.player_off_name].filter(Boolean).forEach(function(name){
          var found=Object.keys(current.players).some(function(id){return approvedIds.has(id)&&norm(current.players[id].player_name)===norm(name);});
          if(!found)discrepancies.push('Match event player "'+name+'" was not matched to either approved team sheet. Check spelling or eligibility.');
        });
      });
    }
    var publishedEvents=events.filter(function(e){return !e.published_at;});
    if(!future&&publishedEvents.length)issues.push(publishedEvents.length+' match event(s) are not published.');
    var closed=!cancelled(m)&&hasScore(m)&&homeState==='APPROVED'&&awayState==='APPROVED'&&
      mainRecord&&mainRecord.status==='ACKNOWLEDGED'&&mainRecord.ocr_verified_at&&mc&&mc.report_status==='REVIEWED'&&
      !issues.length&&!discrepancies.length;
    var state;
    if(cancelled(m))state=upper(m.match_status).replace(/_/g,' ');
    else if(live(m))state='In progress';
    else if(discrepancies.length)state='Under review';
    else if(future){
      if(issues.some(function(x){return /Main Referee|Assistant Referees|Match Commissioner|Match Data Operator|Kick-off|Venue/.test(x);}))state='Awaiting preparation';
      else if(homeState!=='APPROVED'||awayState!=='APPROVED')state='Awaiting team sheets';
      else if(issues.length)state='Under review';
      else state='Ready for match';
    }else if(closed)state='Closed';
    else if(!hasScore(m))state='Awaiting final result';
    else if(!mainRecord||mainRecord.status==='RETURNED')state='Awaiting referee report';
    else if(mainRecord.status!=='ACKNOWLEDGED'||!mainRecord.ocr_verified_at)state='Under review';
    else if(!mc||mc.report_status==='DRAFT')state='Awaiting commissioner report';
    else if(mc.report_status!=='REVIEWED'||issues.length)state='Under review';
    else state='Closed';
    return {state,issues:issues.concat(discrepancies),discrepancies:discrepancies,
      homeSheet:homeSheet,awaySheet:awaySheet,homeState:homeState,awayState:awayState,
      officials:ops,mainRecord:mainRecord,commissioner:mc,records:records,sheets:sheets,
      reportRows:reportRows,events:events,changes:current.changes.filter(function(c){return String(c.match_id)===String(m.id);}),
      ageHours:ageHours,closed:closed};
  }
  function rowsForWindow(){
    var now=new Date(),past=new Date(now.getTime()-90*86400000),future=new Date(now.getTime()+45*86400000);
    return current.matches.map(function(m){return {match:m,ops:analyse(m)};}).filter(function(x){
      var d=matchTime(x.match);return !d||(d>=past&&d<=future);
    }).sort(function(a,b){return (matchTime(a.match)||new Date(0))-(matchTime(b.match)||new Date(0));});
  }
  function render(failures){
    var status=$('coOpsStatus'),content=$('coOpsContent');
    if(!status||!content)return;
    var rows=rowsForWindow(),active=rows.filter(function(x){return !cancelled(x.match);}),
      upcoming=active.filter(function(x){var d=matchTime(x.match);return d&&d>new Date();}),
      attention=active.filter(function(x){return x.ops.state!=='Ready for match'&&x.ops.state!=='Closed';}),
      discrepancies=active.filter(function(x){return x.ops.discrepancies.length>0;}),
      reviewQueue=current.sheets.filter(function(s){return s.status==='SUBMITTED';}).length+
        current.records.filter(function(r){return ['SUBMITTED','UNDER_REVIEW'].indexOf(r.status)>=0;}).length+
        current.commissionerReports.filter(function(r){return r.report_status==='SUBMITTED';}).length,
      closed=active.filter(function(x){return x.ops.state==='Closed';}).length,
      live=active.filter(function(x){return live(x.match);}).length;
    var leagues=current.leagues.map(function(l){return '<option value="'+esc(l.name)+'">'+esc(l.name)+'</option>';}).join('');
    content.innerHTML=
      '<div class="co-metrics">'+[
        ['Fixtures monitored',active.length],['Upcoming fixtures',upcoming.length],['Require attention',attention.length],
        ['Live / half-time',live],['Pending reviews',reviewQueue],['Compliance discrepancies',discrepancies.length],
        ['Closed match dossiers',closed],['Result amendments · 90 days',current.changes.length]
      ].map(function(x){return '<article class="co-metric"><span>'+esc(x[0])+'</span><strong>'+x[1]+'</strong></article>';}).join('')+'</div>'+
      (failures&&failures.length?'<div class="co-note">Some optional records could not be read: '+esc(failures.join(' · '))+'. The board may be incomplete until those permissions are corrected.</div>':'')+
      '<div class="co-controls"><select id="coLeagueFilter"><option value="">All competitions</option>'+leagues+'</select><select id="coStateFilter"><option value="">All command states</option>'+['Awaiting preparation','Awaiting team sheets','Ready for match','In progress','Awaiting final result','Awaiting referee report','Awaiting commissioner report','Under review','Closed'].map(function(x){return '<option>'+x+'</option>';}).join('')+'</select><input id="coSearch" type="search" placeholder="Search team, venue or match status" aria-label="Search fixtures"></div>'+
      '<div class="co-table-wrap"><table><thead><tr><th>Kick-off · Freetown</th><th>Fixture / competition</th><th>Official appointments</th><th>Home / away sheets</th><th>Referee record</th><th>Commissioner report</th><th>Score / state</th><th>Compliance exceptions</th><th>Dossier</th></tr></thead><tbody id="coRows"></tbody></table></div>'+
      '<div class="co-grid"><section class="co-card"><h3>Recent result amendments</h3><div class="co-list">'+(current.changes.slice(0,10).map(function(c){var m=current.matches.find(function(x){return String(x.id)===String(c.match_id);});return '<div class="co-item"><strong>'+esc(m?matchLabel(m):'Match #'+c.match_id)+'</strong><small>'+esc(upper(c.action))+' · '+esc(c.changed_by_role||'Authorised role')+' · '+esc(fmt(c.changed_at))+'</small><small>Reason: '+esc(c.reason||'Not recorded')+'</small></div>';}).join('')||'<div class="co-empty">No result amendments recorded in the available history.</div>')+'</div></section>'+
      '<section class="co-card"><h3>Control rules</h3><p>Ready status requires a Main Referee, two Assistant Referees, a Match Commissioner and a Live Match Data Operator, plus a recorded venue and kick-off, both approved team sheets, and no outstanding preparation checks. A match cannot be closed until its official score, Main Referee photographed record and human-verified OCR, and reviewed Match Commissioner report are present.</p><p>OCR text is machine-generated and can contain errors. The original photo and verified text must be checked by an authorised human. Score and player discrepancies are flags for inspection, not automatic changes or disciplinary findings.</p><p>Some time-based follow-ups are operational prompts; they do not create or amend official SLFA regulations.</p></section></div>'+
      '<p class="co-sub">Last refreshed: '+esc(fmt(lastLoad))+' · Read-only oversight · '+current.matches.length+' match records loaded</p>';
    function drawRows(){
      var l=$('coLeagueFilter')?$('coLeagueFilter').value:'',state=$('coStateFilter')?$('coStateFilter').value:'',term=$('coSearch')?$('coSearch').value.trim().toLowerCase():'';
      var filtered=rows.filter(function(x){
        var league=current.leagues.find(function(q){return String(q.id)===String(x.match.league_id);});
        var hay=[x.match.home_team,x.match.away_team,x.match.venue,x.match.match_status,league&&league.name].join(' ').toLowerCase();
        return (!l||!!(league&&league.name===l))&&(!state||x.ops.state===state)&&(!term||hay.indexOf(term)>=0);
      });
      var body=$('coRows');if(!body)return;
      body.innerHTML=filtered.length?filtered.map(function(x){
        var m=x.match,o=x.ops,league=current.leagues.find(function(q){return String(q.id)===String(m.league_id);});
        var main=o.officials.mains.length,assist=o.officials.assistants.length,mc=o.officials.commissioners.length,operator=o.officials.dataOperators.length;
        var issues=o.issues.slice(0,4).map(function(t){return '<li>'+esc(t)+'</li>';}).join('');
        return '<tr><td>'+esc(fmt(matchTime(m)))+'</td><td><strong>'+esc(matchLabel(m))+'</strong><span class="co-sub">'+esc(league?league.name:'Competition not labelled')+'</span><span class="co-sub">'+esc(m.venue||'Venue not recorded')+'</span></td>'+
          '<td>'+pill('Main '+main,main===1)+pill('Assistants '+assist+'/2',assist>=2)+pill('Commissioner '+mc,mc===1)+pill('Data operator '+operator,operator===1)+'</td>'+
          '<td>'+pill('Home '+o.homeState,o.homeState==='APPROVED')+pill('Away '+o.awayState,o.awayState==='APPROVED')+'</td>'+
          '<td>'+pill(o.mainRecord?upper(o.mainRecord.status):'Not filed',!!o.mainRecord&&o.mainRecord.status==='ACKNOWLEDGED')+(o.mainRecord?'<span class="co-sub">OCR '+esc(o.mainRecord.ocr_status||'NOT_RUN')+' · '+(o.mainRecord.ocr_verified_at?'Human verified':'Not verified')+'</span>':'')+'</td>'+
          '<td>'+pill(o.commissioner?upper(o.commissioner.report_status):'Not filed',!!o.commissioner&&o.commissioner.report_status==='REVIEWED')+'</td>'+
          '<td><strong>'+esc(hasScore(m)?m.home_score+'–'+m.away_score:'—')+'</strong><span class="co-sub">'+esc(o.state)+'</span><span class="co-sub">'+esc(upper(m.match_status))+'</span></td>'+
          '<td>'+(issues?'<ul class="co-issues">'+issues+'</ul>':pill('No flagged issues',true))+(o.issues.length>4?'<span class="co-sub">+'+(o.issues.length-4)+' more</span>':'')+'</td>'+
          '<td><button type="button" class="co-secondary" data-co-dossier="'+esc(m.id)+'">Print / Save PDF</button></td></tr>';
      }).join(''):'<tr><td colspan="9" class="co-empty">No fixtures match the selected filters or date window.</td></tr>';
      body.querySelectorAll('[data-co-dossier]').forEach(function(b){b.addEventListener('click',function(){printDossier(b.getAttribute('data-co-dossier'));});});
    }
    ['coLeagueFilter','coStateFilter','coSearch'].forEach(function(id){var e=$(id);if(e)e.addEventListener(id==='coSearch'?'input':'change',drawRows);});
    drawRows();
    status.textContent=current.matches.length?'Command Centre loaded. Inspect exceptions and open a match dossier for supporting records.':'No match records currently exist in this database. Add real association fixtures and assignments to begin operational checks.';
  }
  function exportCSV(){
    var rows=rowsForWindow(),headers=['Match ID','Kick-off Freetown','Competition','Home team','Away team','Venue','Match status','Official score','Command state','Main referees','Assistant referees','Match Commissioners','Home sheet status','Away sheet status','Main referee record','OCR human verified','Commissioner report','Compliance flags'];
    var lines=[headers].concat(rows.map(function(x){
      var m=x.match,o=x.ops,l=current.leagues.find(function(q){return String(q.id)===String(m.league_id);});
      return [m.id,fmt(matchTime(m)),l?l.name:'',m.home_team,m.away_team,m.venue,m.match_status,hasScore(m)?m.home_score+'-'+m.away_score:'',o.state,o.officials.mains.length,o.officials.assistants.length,o.officials.commissioners.length,o.homeState,o.awayState,o.mainRecord?o.mainRecord.status:'MISSING',!!(o.mainRecord&&o.mainRecord.ocr_verified_at),o.commissioner?o.commissioner.report_status:'MISSING',o.issues.join(' | ')];
    }));
    var csv=lines.map(function(r){return r.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
    var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='slfa-matchday-command-board-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove();},1000);
  }
  async function signedImages(bucket,paths){
    var out=[];
    for(var i=0;i<(paths||[]).length;i++){
      var result=await db.storage.from(bucket).createSignedUrl(paths[i],1800);
      if(!result.error&&result.data&&result.data.signedUrl)out.push(result.data.signedUrl);
    }
    return out;
  }
  async function printDossier(matchId){
    var m=current.matches.find(function(x){return String(x.id)===String(matchId);});
    if(!m)return;
    var popup=window.open('','_blank');if(!popup){window.alert('Allow pop-ups to prepare the match dossier.');return;}
    popup.document.write('<!doctype html><title>Preparing SLFA Match Dossier</title><p>Preparing the match dossier and secure evidence links…</p>');
    try{
      var o=analyse(m),league=current.leagues.find(function(x){return String(x.id)===String(m.league_id);});
      var sheetHtml=o.sheets.map(function(s){
        return '<section><h2>'+esc(s.club_id===m.home_club_id?'Home club team sheet':'Away club team sheet')+' · '+esc(s.reference_code)+' · '+esc(s.status)+'</h2><h3>Starting XI</h3><ol>'+names(s.starting_player_ids).map(function(n){return '<li>'+esc(n)+'</li>';}).join('')+'</ol><h3>Substitutes</h3><ol>'+names(s.substitute_player_ids).map(function(n){return '<li>'+esc(n)+'</li>';}).join('')+'</ol><p>Submitted: '+esc(fmt(s.submitted_at))+' · Reviewed: '+esc(fmt(s.reviewed_at))+' · Reviewer: '+esc(profileName(s.reviewed_by))+' · '+esc(s.review_notes||'')+'</p></section>';
      }).join('')||'<p>No electronic team sheets found.</p>';
      var reportHtml='';
      for(var i=0;i<o.records.length;i++){
        var r=o.records[i],images=await signedImages('referee-match-records',r.image_paths||[]);
        reportHtml+='<section><h2>Referee '+esc(r.official_role)+' · '+esc(r.reference_code)+' · '+esc(r.status)+'</h2><p>Submitted by: '+esc(profileName(r.submitted_by))+' · '+esc(fmt(r.submitted_at))+'</p><p>Observed score: '+esc(r.observed_home_score==null?'Not recorded':r.observed_home_score+'–'+r.observed_away_score)+' · Incident: '+esc(r.incident_flag?'Yes':'No')+'</p><p>'+esc(r.incident_details||r.referee_notes||'No additional notes')+'</p><p>OCR: '+esc(r.ocr_status)+' · confidence: '+esc(r.ocr_confidence==null?'—':r.ocr_confidence+'%')+' · Human verified: '+esc(r.ocr_verified_at?'Yes':'No')+'</p><h3>Machine OCR (unverified)</h3><pre>'+esc(r.ocr_text||'No OCR text')+'</pre><h3>Human-verified text</h3><pre>'+esc(r.ocr_verified_text||'Not verified')+'</pre><p>Review: '+esc(r.review_notes||'—')+'</p>'+images.map(function(u){return '<img src="'+esc(u)+'">';}).join('')+'</section>';
      }
      var commissionerHtml='';
      for(var j=0;j<o.reportRows.length;j++){
        var cr=o.reportRows[j],mcImages=await signedImages('match-commissioner-evidence',cr.evidence_paths||[]);
        var values=['pitch_condition','facilities_condition','security_arrangements','home_team_arrival','away_team_arrival','officials_arrival','pre_match_notes','crowd_behaviour','match_interruptions','match_conduct','incident_details','post_match_summary','recommendations'];
        commissionerHtml+='<section><h2>Match Commissioner report · '+esc(cr.report_status)+'</h2><p>Commissioner: '+esc(profileName(cr.commissioner_user_id))+' · Submitted: '+esc(fmt(cr.submitted_at))+' · Reviewed: '+esc(fmt(cr.reviewed_at))+'</p>'+values.map(function(k){return cr[k]?'<p><b>'+esc(k.replace(/_/g,' '))+':</b> '+esc(cr[k])+'</p>':'';}).join('')+'<p>OCR: '+esc(cr.ocr_status)+' · human verified: '+esc(cr.ocr_verified_at?'Yes':'No')+'</p><h3>Machine OCR (unverified)</h3><pre>'+esc(cr.ocr_text||'No OCR text')+'</pre><h3>Human-verified text</h3><pre>'+esc(cr.ocr_verified_text||'Not verified')+'</pre><p>Review note: '+esc(cr.review_notes||'—')+'</p>'+mcImages.map(function(u){return '<img src="'+esc(u)+'">';}).join('')+'</section>';
      }
      var officialHtml=o.officials.rows.map(function(a){return '<li>'+esc(a.official_role)+' · '+esc(profileName(a.referee_user_id))+' · '+esc(a.assignment_status)+'</li>';}).join('')||'<li>No active appointments</li>';
      var eventHtml=o.events.map(function(e){return '<li>'+esc(e.minute)+'′ · '+esc(e.event_type)+' · '+esc(e.team_name)+' · '+esc(e.player_name)+' '+(e.assist_player_name?'(Assist: '+esc(e.assist_player_name)+')':'')+(e.player_off_name?' (Off: '+esc(e.player_off_name)+')':'')+'</li>';}).join('')||'<li>No match events</li>';
      var changeHtml=o.changes.map(function(c){return '<li>'+esc(fmt(c.changed_at))+' · '+esc(c.action)+' · '+esc(c.old_home==null?'—':c.old_home+'–'+c.old_away)+' → '+esc(c.new_home==null?'—':c.new_home+'–'+c.new_away)+' · '+esc(c.reason)+'</li>';}).join('')||'<li>No result amendments</li>';
      var issueHtml=o.issues.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')||'<li>No operational exceptions detected.</li>';
      var html='<!doctype html><html><head><meta charset="utf-8"><title>SLFA Official Match Dossier</title><style>body{font:13px Arial;color:#183248;padding:28px;line-height:1.5}h1{color:#075b45}h2{font-size:16px;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px}h3{font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7f8;padding:10px;border-radius:8px}img{max-width:100%;max-height:560px;object-fit:contain;display:block;margin:12px auto;border:1px solid #ddd}section{break-inside:avoid;border-bottom:1px solid #ddd;padding-bottom:14px}.meta{padding:12px;background:#eff7f3;border-radius:9px}.flag{color:#8a5b0b}figure{break-inside:avoid}</style></head><body><h1>SLFA · Official Match Operations Dossier</h1><div class="meta"><b>'+esc(matchLabel(m))+'</b><br>Competition: '+esc(league?league.name:'—')+'<br>Kick-off: '+esc(fmt(matchTime(m)))+' · Venue: '+esc(m.venue||'Not recorded')+'<br>Fixture state: '+esc(upper(m.match_status))+' · Official score: '+esc(hasScore(m)?m.home_score+'–'+m.away_score:'Not recorded')+'<br>Command state: '+esc(o.state)+'</div><section><h2>Readiness and compliance exceptions</h2><ul class="flag">'+issueHtml+'</ul></section><section><h2>Official appointments</h2><ul>'+officialHtml+'</ul></section><section><h2>Approved and submitted team sheets</h2>'+sheetHtml+'</section><section><h2>Referee photographic match records</h2>'+reportHtml+'</section><section><h2>Match Commissioner reports</h2>'+commissionerHtml+'</section><section><h2>Recorded match events</h2><ul>'+eventHtml+'</ul></section><section><h2>Result amendment history</h2><ul>'+changeHtml+'</ul></section><p><b>Evidence integrity:</b> Images are accessed through temporary, private signed URLs. Machine OCR is not authoritative until a human reviewer checks the original photograph and records corrected text. This dossier is a snapshot of the records available when it was generated.</p><script>window.onload=function(){window.print()};</script></body></html>';
      popup.document.open();popup.document.write(html);popup.document.close();
    }catch(e){try{popup.close();}catch(_){}window.alert('Dossier could not be prepared: '+(e.message||'Check report and evidence access.'));}
  }
  function exportCSV(){
    var rows=rowsForWindow(),headers=['Match ID','Kick-off Freetown','Competition','Home team','Away team','Venue','Match status','Official score','Command state','Main referees','Assistant referees','Match Commissioners','Home sheet status','Away sheet status','Referee record','OCR verified','Commissioner report','Compliance flags'];
    var lines=[headers].concat(rows.map(function(x){var m=x.match,o=x.ops,l=current.leagues.find(function(q){return String(q.id)===String(m.league_id);});return [m.id,fmt(matchTime(m)),l?l.name:'',m.home_team,m.away_team,m.venue,m.match_status,hasScore(m)?m.home_score+'-'+m.away_score:'',o.state,o.officials.mains.length,o.officials.assistants.length,o.officials.commissioners.length,o.homeState,o.awayState,o.mainRecord?o.mainRecord.status:'MISSING',!!(o.mainRecord&&o.mainRecord.ocr_verified_at),o.commissioner?o.commissioner.report_status:'MISSING',o.issues.join('; ')];}));
    var csv=lines.map(function(r){return r.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
    var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='slfa-matchday-command-board-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove();},1000);
  }
  function start(){
    mount();if(observer||!document.body)return;
    observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    if(db.auth&&db.auth.onAuthStateChange)db.auth.onAuthStateChange(function(){setTimeout(mount,0);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
