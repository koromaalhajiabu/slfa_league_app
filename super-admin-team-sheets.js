/* Super Admin inbox for electronically submitted club team sheets. */
(function(){
  'use strict';
  var db=window.slfaDb,ID='slfaTeamSheetAdminInbox',rows=[],matches={},clubs={},profiles={},players={},channel=null,observer=false;
  function $(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmt(v){if(!v)return '—';try{return new Date(v).toLocaleString('en-GB',{timeZone:'Africa/Freetown',dateStyle:'medium',timeStyle:'short'});}catch(e){return String(v);}}
  function style(){
    if($('tsoAdminStyle'))return;
    var s=document.createElement('style');s.id='tsoAdminStyle';
    s.textContent=[
      '#'+ID+'{margin:18px 0;padding:16px;border:1px solid var(--border,#dce4eb);border-radius:15px;background:var(--panel,#fff);color:var(--text,#172b3d)}',
      '#'+ID+' *{box-sizing:border-box}#'+ID+' .tsa-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}',
      '#'+ID+' .tsa-kicker{font-size:9px;letter-spacing:1.4px;font-weight:850;color:#b18a3f}#'+ID+' h2{font-size:19px;margin:5px 0}',
      '#'+ID+' p,#'+ID+' .tsa-muted{font-size:11px;line-height:1.5;color:var(--muted,#718096)}',
      '#'+ID+' .tsa-actions{display:flex;gap:7px;flex-wrap:wrap}#'+ID+' button{border:0;border-radius:8px;background:#086447;color:#fff;padding:9px 12px;font-size:10px;font-weight:800;cursor:pointer}',
      '#'+ID+' button.alt{background:transparent;color:inherit;border:1px solid var(--border,#dce4eb)}',
      '#'+ID+' .tsa-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:13px 0}',
      '#'+ID+' .tsa-stat{border:1px solid var(--border,#dce4eb);border-radius:10px;padding:11px;background:var(--surface,#f7f9fb)}#'+ID+' .tsa-stat small{display:block;color:var(--muted,#718096);font-size:9px}#'+ID+' .tsa-stat b{display:block;font-size:21px;margin-top:4px}',
      '#'+ID+' .tsa-card{border:1px solid var(--border,#e1e7ee);border-radius:11px;padding:13px;margin:9px 0}',
      '#'+ID+' .tsa-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}',
      '#'+ID+' .tsa-pill{display:inline-block;border-radius:20px;padding:4px 8px;background:#eaf1f8;color:#42576b;font-size:9px;font-weight:850}',
      '#'+ID+' .tsa-data{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:9px 0}',
      '#'+ID+' .tsa-data>div{border:1px solid var(--border,#e5eaf0);border-radius:8px;padding:9px}',
      '#'+ID+' .tsa-data strong{font-size:10px;display:block;margin-bottom:5px}#'+ID+' .tsa-data ul{margin:0;padding-left:17px;font-size:10px;line-height:1.55}',
      '#'+ID+' .tsa-bench{border:1px solid var(--border,#e1e7ee);border-radius:9px;padding:10px;margin:9px 0;background:var(--surface,#f7f9fb)}#'+ID+' .tsa-bench>strong{font-size:10px;display:block;margin-bottom:7px}#'+ID+' .tsa-bench-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}#'+ID+' .tsa-bench-grid span{font-size:10px;line-height:1.4}#'+ID+' .tsa-bench-grid b{display:block;color:var(--muted,#718096);font-size:9px;text-transform:uppercase;letter-spacing:.04em}',
      '#'+ID+' select,#'+ID+' textarea{width:100%;padding:9px;border:1px solid var(--border,#dce4eb);border-radius:8px;background:var(--panel,#fff);color:inherit;font:inherit;font-size:11px}',
      '#'+ID+' textarea{min-height:52px;margin:6px 0}#'+ID+' .tsa-empty{padding:20px;text-align:center;font-size:11px;color:var(--muted,#718096)}',
      '@media(max-width:620px){#'+ID+'{padding:12px}#'+ID+' .tsa-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ID+' .tsa-data{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(s);
  }
  function mount(){
    var role=$('whoRole'),root=$('roleTools');
    if(!role||!root||String(role.textContent||'').trim().toUpperCase().replace(/\s+/g,'_')!=='SUPER_ADMIN'||!root.querySelector('.sa-command-centre')){var old=$(ID);if(old)old.remove();if(channel){db.removeChannel(channel);channel=null;}return;}
    if($(ID))return;style();
    var box=document.createElement('section');box.id=ID;
    box.innerHTML='<div class="tsa-head"><div><span class="tsa-kicker">SLFA · TEAM OPERATIONS</span><h2>Electronic Team Sheet Inbox</h2><p>Team Officials submit an electronic starting XI and substitutes for their assigned club. Review, return or approve each submission.</p></div><div class="tsa-actions"><button type="button" id="tsaRefresh">Refresh inbox</button><button type="button" class="alt" id="tsaExport">Export CSV</button></div></div><div class="tsa-muted" id="tsaStatus" role="status" aria-live="polite">Loading team sheets…</div><div id="tsaContent"></div>';
    var anchor=$('slfaRefereeMatchRecordInbox')||$('slfaCompetitionOpsBoard')||root.querySelector('.sa-command-centre');
    if(anchor)anchor.insertAdjacentElement('afterend',box);else root.appendChild(box);
    $('tsaRefresh').addEventListener('click',load);
    $('tsaExport').addEventListener('click',exportCSV);
    box.addEventListener('click',click);
    subscribe();load();
  }
  async function load(){
    if(!$(ID))return;
    var status=$('tsaStatus'),host=$('tsaContent');if(status)status.textContent='Loading electronic team sheets…';
    try{
      var r=await db.from('match_team_sheets').select('*').order('submitted_at',{ascending:false}).limit(300);
      if(r.error)throw r.error;rows=r.data||[];
      var matchIds=Array.from(new Set(rows.map(function(x){return x.match_id;})));
      var clubIds=Array.from(new Set(rows.map(function(x){return x.club_id;})));
      var userIds=Array.from(new Set(rows.map(function(x){return x.submitted_by;})));
      var playerIds=Array.from(new Set(rows.reduce(function(a,x){return a.concat(x.starting_player_ids||[],x.substitute_player_ids||[]);},[])));
      matches={};clubs={};profiles={};players={};
      var requests=[];
      if(matchIds.length)requests.push(db.from('matches').select('id,match_date,new_match_date,home_team,away_team,venue,season_id,home_club_id,away_club_id').in('id',matchIds));
      else requests.push(Promise.resolve({data:[],error:null}));
      if(clubIds.length)requests.push(db.from('league_clubs').select('id,club_name').in('id',clubIds));
      else requests.push(Promise.resolve({data:[],error:null}));
      if(userIds.length)requests.push(db.from('user_profiles').select('id,full_name,email').in('id',userIds));
      else requests.push(Promise.resolve({data:[],error:null}));
      if(playerIds.length)requests.push(db.from('club_squad').select('id,player_name,jersey_number,position').in('id',playerIds));
      else requests.push(Promise.resolve({data:[],error:null}));
      var extras=await Promise.all(requests);
      extras.forEach(function(x){if(x.error)throw x.error;});
      (extras[0].data||[]).forEach(function(x){matches[String(x.id)]=x;});
      (extras[1].data||[]).forEach(function(x){clubs[String(x.id)]=x;});
      (extras[2].data||[]).forEach(function(x){profiles[String(x.id)]=x;});
      (extras[3].data||[]).forEach(function(x){players[String(x.id)]=x;});
      render();
      if(status)status.textContent=rows.length?rows.length+' team-sheet record(s) loaded. New submissions appear automatically while this panel is open.':'No electronic team sheets have been submitted yet.';
    }catch(e){if(status)status.textContent='Could not load team-sheet inbox: '+(e.message||e);if(host)host.innerHTML='';}
  }
  function names(ids){
    return (ids||[]).map(function(id){var p=players[String(id)]||{};return (p.jersey_number?'#'+p.jersey_number+' ':'')+(p.player_name||'Player #'+id);});
  }
  function render(){
    var host=$('tsaContent');if(!host)return;
    var counts={submitted:rows.filter(function(x){return x.status==='SUBMITTED';}).length,approved:rows.filter(function(x){return x.status==='APPROVED';}).length,returned:rows.filter(function(x){return x.status==='RETURNED';}).length};
    host.innerHTML='<div class="tsa-stats"><article class="tsa-stat"><small>Awaiting review</small><b>'+counts.submitted+'</b></article><article class="tsa-stat"><small>Approved</small><b>'+counts.approved+'</b></article><article class="tsa-stat"><small>Returned for correction</small><b>'+counts.returned+'</b></article><article class="tsa-stat"><small>Total submissions</small><b>'+rows.length+'</b></article></div>'+
      (rows.length?rows.map(function(x){
        var m=matches[String(x.match_id)]||{},c=clubs[String(x.club_id)]||{},u=profiles[String(x.submitted_by)]||{};
        var starters=names(x.starting_player_ids),subs=names(x.substitute_player_ids);
        var bench=[['Head Coach',x.head_coach_name],['Team Manager',x.team_manager_name],['Assistant Coach',x.assistant_coach_name],['Team Doctor',x.team_doctor_name],['Physiotherapist',x.physiotherapist_name]];
        var benchHtml='<section class="tsa-bench"><strong>Bench staff and team officials</strong><div class="tsa-bench-grid">'+bench.map(function(v){return '<span><b>'+esc(v[0])+'</b>'+esc(v[1]||'Not provided')+'</span>';}).join('')+'</div></section>';
        var decision=(x.status==='SUBMITTED'?'<option value="" selected>Choose decision…</option>':'')+
          '<option value="APPROVED" '+(x.status==='APPROVED'?'selected':'')+'>Approve and publish to matchday</option>'+
          '<option value="RETURNED" '+(x.status==='RETURNED'?'selected':'')+'>Return for correction</option>';
        var locked=x.status==='APPROVED';
        return '<article class="tsa-card"><div class="tsa-top"><div><strong>'+esc(x.reference_code||'Team Sheet')+' · '+esc(c.club_name||'Club')+'</strong><p>'+esc((m.home_team||'Home')+' v '+(m.away_team||'Away'))+'<br>'+esc(fmt(m.new_match_date||m.match_date))+' · '+esc(m.venue||'Venue not listed')+'</p><p>Submitted by: '+esc(u.full_name||u.email||'Team Official')+' · '+esc(fmt(x.submitted_at))+'</p></div><span class="tsa-pill">'+esc(x.status)+'</span></div><div class="tsa-data"><div><strong>Starting XI ('+starters.length+')</strong><ul>'+starters.map(function(v){return '<li>'+esc(v)+'</li>';}).join('')+'</ul></div><div><strong>Substitutes ('+subs.length+')</strong><ul>'+subs.map(function(v){return '<li>'+esc(v)+'</li>';}).join('')+'</ul></div></div>'+benchHtml+(x.review_notes?'<p><strong>Previous review:</strong> '+esc(x.review_notes)+'</p>':'')+'<div class="tsa-actions"><button type="button" class="alt" data-tsa-pdf="'+esc(x.id)+'">Print / Save PDF</button></div><label for="tsaState_'+esc(x.id)+'">Review decision</label><select id="tsaState_'+esc(x.id)+'" '+(locked?'disabled':'')+'>'+decision+'</select><textarea id="tsaNote_'+esc(x.id)+'" maxlength="2000" placeholder="Review notes or correction instructions">'+esc(x.review_notes||'')+'</textarea><button type="button" data-tsa-save="'+esc(x.id)+'" '+(locked?'disabled':'')+'>Save review decision</button></article>';
      }).join(''):'<div class="tsa-empty">No electronic team sheets received yet.</div>');
  }
  async function click(e){
    var save=e.target.closest('[data-tsa-save]'),pdf=e.target.closest('[data-tsa-pdf]');
    if(save){await review(save.dataset.tsaSave);return;}
    if(pdf){printSheet(pdf.dataset.tsaPdf);}
  }
  async function review(id){
    var row=rows.find(function(x){return String(x.id)===String(id);});if(!row)return;
    var state=$('tsaState_'+id),note=$('tsaNote_'+id);if(!state||!state.value){window.alert('Choose Approve or Return for correction.');return;}
    if(state.value==='RETURNED'&&!(note&&note.value.trim())){window.alert('Add a correction note before returning the team sheet.');return;}
    var r=await db.rpc('review_match_team_sheet',{p_sheet_id:Number(row.id),p_status:state.value,p_review_notes:(note&&note.value.trim())||null});
    if(r.error){window.alert('Review decision could not be saved: '+r.error.message);return;}
    await load();
  }
  function printSheet(id){
    var x=rows.find(function(z){return String(z.id)===String(id);});if(!x)return;
    var m=matches[String(x.match_id)]||{},c=clubs[String(x.club_id)]||{},u=profiles[String(x.submitted_by)]||{};
    var popup=window.open('','_blank');if(!popup){window.alert('Allow pop-ups for this site to create the team-sheet PDF.');return;}
    function list(ids){return (ids||[]).map(function(pid){var p=players[String(pid)]||{};return '<tr><td>'+(p.jersey_number==null?'—':esc(p.jersey_number))+'</td><td>'+esc(p.player_name||('Player #'+pid))+'</td><td>'+esc(p.position||'—')+'</td></tr>';}).join('');}
    var html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(x.reference_code||'SLFA Team Sheet')+'</title><style>body{font-family:Arial,sans-serif;color:#172b3d;margin:28px}h1{font-size:21px}.tag{font-size:10px;letter-spacing:1.4px;color:#96742e;font-weight:bold}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:15px 0}.cell{border:1px solid #dce4eb;padding:9px;border-radius:6px}.label{font-size:9px;color:#64748b;text-transform:uppercase}.val{font-size:12px;font-weight:bold}h2{font-size:14px;margin-top:20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #dce4eb;font-size:11px}.foot{font-size:10px;color:#667788;margin-top:20px}</style></head><body><div class="tag">SIERRA LEONE FOOTBALL ASSOCIATION · TEAM SHEET</div><h1>'+esc(m.home_team||'Home')+' v '+esc(m.away_team||'Away')+'</h1><div class="meta">'+cell('Club',c.club_name||'—')+cell('Kick-off',fmt(m.new_match_date||m.match_date))+cell('Venue',m.venue||'—')+cell('Reference',x.reference_code||'—')+cell('Submitted by',u.full_name||u.email||'Team Official')+cell('Submitted at',fmt(x.submitted_at))+cell('Status',x.status)+cell('Super Admin review',x.review_notes||'—')+'</div><h2>Starting XI</h2><table><thead><tr><th>Shirt no.</th><th>Player</th><th>Position</th></tr></thead><tbody>'+list(x.starting_player_ids)+'</tbody></table><h2>Substitutes</h2><table><thead><tr><th>Shirt no.</th><th>Player</th><th>Position</th></tr></thead><tbody>'+list(x.substitute_player_ids)+'</tbody></table><h2>Bench staff and team officials</h2><table><tbody><tr><th>Head Coach</th><td>'+esc(x.head_coach_name||'—')+'</td><th>Team Manager</th><td>'+esc(x.team_manager_name||'—')+'</td></tr><tr><th>Assistant Coach</th><td>'+esc(x.assistant_coach_name||'—')+'</td><th>Team Doctor</th><td>'+esc(x.team_doctor_name||'—')+'</td></tr><tr><th>Physiotherapist</th><td colspan="3">'+esc(x.physiotherapist_name||'—')+'</td></tr></tbody></table><p class="foot">Generated from the electronic team-sheet submission record. Confirm player eligibility and match-day changes with authorised competition officials.</p></body></html>';
    popup.document.write(html);popup.document.close();popup.onload=function(){setTimeout(function(){popup.focus();popup.print();},500);};
    function cell(label,value){return '<div class="cell"><div class="label">'+esc(label)+'</div><div class="val">'+esc(value)+'</div></div>';}
  }
  function exportCSV(){
    var data=[['Reference','Fixture','Club','Submitted by','Submitted at','Status','Starting XI','Substitutes','Head Coach','Team Manager','Assistant Coach','Team Doctor','Physiotherapist','Review notes']].concat(rows.map(function(x){
      var m=matches[String(x.match_id)]||{},c=clubs[String(x.club_id)]||{},u=profiles[String(x.submitted_by)]||{};
      return [x.reference_code,(m.home_team||'')+' v '+(m.away_team||''),c.club_name||'',u.full_name||u.email||'',fmt(x.submitted_at),x.status,names(x.starting_player_ids).join('; '),names(x.substitute_player_ids).join('; '),x.head_coach_name||'',x.team_manager_name||'',x.assistant_coach_name||'',x.team_doctor_name||'',x.physiotherapist_name||'',x.review_notes||''];
    }));
    var csv=data.map(function(r){return r.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
    var blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='slfa-electronic-team-sheets-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(url);a.remove();},1000);
  }
  function subscribe(){
    if(channel||!db.channel)return;
    channel=db.channel('slfa-team-sheet-inbox').on('postgres_changes',{event:'*',schema:'public',table:'match_team_sheets'},function(){load();}).subscribe();
  }
  function start(){
    mount();if(!document.body||observer)return;observer=true;
    new MutationObserver(mount).observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();