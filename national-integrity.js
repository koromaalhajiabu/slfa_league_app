/* Private National Football Intelligence & Integrity Centre.
   Advisory detection only: never changes official results, registrations or sanctions. */
(function(){
  'use strict';
  var db=window.slfaDb;
  var root=document.getElementById('nationalIntegrityCentre');
  if(!db||!root)return;
  var $=function(id){return document.getElementById(id);};
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var userId=null;
  function status(t){$('niStatus').textContent=t;}
  function ensureAdmin(){
    return db.auth.getUser().then(function(u){
      if(!u.data||!u.data.user)throw new Error('Sign in with an authorised Super Admin account.');
      userId=u.data.user.id;
      return db.from('user_profiles').select('system_role,status').eq('id',userId).maybeSingle();
    }).then(function(r){
      if(r.error||!r.data||String(r.data.system_role).toUpperCase()!=='SUPER_ADMIN'||String(r.data.status).toLowerCase()!=='active')throw new Error('This workspace is restricted to active Super Admin accounts.');
    });
  }
  function hashIdentity(value){var h=2166136261,s=String(value||'');for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
  function alertKey(prefix,parts){return prefix+':'+parts.map(function(x){return String(x==null?'':x);}).join(':');}
  function makeAlert(a){return {alert_key:a.key,alert_type:a.type,severity:a.severity||'REVIEW',league_id:a.leagueId||null,match_id:a.matchId||null,player_id:a.playerId||null,title:a.title,details:a.details,evidence:a.evidence||{},created_by:userId};}
  function scan(){
    $('niRunScan').disabled=true;status('Checking approved player registrations and submitted referee records…');
    return Promise.all([
      db.from('club_squad').select('id,player_name,player_nin,club_id,season_id,registration_status,status,league_clubs(club_name,league_id)').eq('registration_status','Approved').eq('status','Active').limit(5000),
      db.from('referee_match_record_submissions').select('id,match_id,observed_home_score,observed_away_score,status,report_type,submitted_at').eq('report_type','MATCH_RECORD').in('status',['SUBMITTED','UNDER_REVIEW','ACKNOWLEDGED']).limit(5000),
      db.from('matches').select('id,league_id,home_team,away_team,home_score,away_score,match_status').limit(5000)
    ]).then(function(results){
      results.forEach(function(r){if(r.error)throw r.error;});
      var players=results[0].data||[],reports=results[1].data||[],matches=results[2].data||[],findings=[],byIdentity={};
      players.forEach(function(p){
        var nin=String(p.player_nin||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
        if(!nin)return;
        var key=String(p.season_id||'none')+'|'+nin;
        (byIdentity[key]=byIdentity[key]||[]).push(p);
      });
      Object.keys(byIdentity).forEach(function(k){
        var group=byIdentity[k],clubs={};
        group.forEach(function(p){clubs[String(p.club_id||'')]=true;});
        if(group.length>1&&Object.keys(clubs).length>1){
          var first=group[0],names=group.map(function(p){return p.player_name+' — '+(p.league_clubs&&p.league_clubs.club_name||'Club not linked');});
          findings.push(makeAlert({key:alertKey('DUPLICATE_PLAYER_IDENTITY',[String(first.season_id||'none'),hashIdentity(nin)]),type:'DUPLICATE_PLAYER_IDENTITY',severity:'HIGH',leagueId:first.league_clubs&&first.league_clubs.league_id,playerId:first.id,title:'Possible duplicate player identity across clubs',details:'The same identity reference appears on approved active registrations at more than one club in the same season. This is a review flag, not a finding of wrongdoing. Verify the original registration documents and player identity before taking action.',evidence:{season_id:first.season_id,player_records:group.map(function(p){return {player_id:p.id,player_name:p.player_name,club_id:p.club_id,club_name:p.league_clubs&&p.league_clubs.club_name||null};}),identity_reference_suffix:String(first.player_nin||'').slice(-4)}}));
        }
      });
      var matchById={};matches.forEach(function(m){matchById[String(m.id)]=m;});
      var reportsByMatch={};
      reports.forEach(function(r){
        var m=matchById[String(r.match_id)];if(!m)return;
        (reportsByMatch[String(r.match_id)]=reportsByMatch[String(r.match_id)]||[]).push(r);
        if(String(m.match_status).toUpperCase()==='FT'&&m.home_score!=null&&m.away_score!=null&&r.observed_home_score!=null&&r.observed_away_score!=null&&(Number(m.home_score)!==Number(r.observed_home_score)||Number(m.away_score)!==Number(r.observed_away_score))){
          findings.push(makeAlert({key:alertKey('REF_SCORE',[r.id]),type:'REFEREE_SCORE_DISCREPANCY',severity:'HIGH',leagueId:m.league_id,matchId:m.id,title:'Referee submission differs from official result',details:'A submitted referee match record contains a score different from the current official result. Compare the original report and authorised result-change history. This alert does not alter the published score.',evidence:{submission_id:r.id,submitted_score:[r.observed_home_score,r.observed_away_score],official_score:[m.home_score,m.away_score],home_team:m.home_team,away_team:m.away_team,submitted_at:r.submitted_at}}));
        }
      });
      Object.keys(reportsByMatch).forEach(function(id){
        var group=reportsByMatch[id].filter(function(r){return r.observed_home_score!=null&&r.observed_away_score!=null;});
        var distinct={};group.forEach(function(r){distinct[String(r.observed_home_score)+':'+String(r.observed_away_score)]=true;});
        if(group.length>1&&Object.keys(distinct).length>1){
          var m=matchById[id];
          findings.push(makeAlert({key:alertKey('REF_CONFLICT',[id,Object.keys(distinct).sort().join('|')]),type:'CONFLICTING_REFEREE_REPORTS',severity:'HIGH',leagueId:m.league_id,matchId:m.id,title:'Conflicting referee score submissions',details:'More than one submitted referee match record reports different scores for this fixture. Review each submission and the official result-change trail before confirming the record.',evidence:{match_id:m.id,home_team:m.home_team,away_team:m.away_team,submitted_scores:group.map(function(r){return {submission_id:r.id,score:[r.observed_home_score,r.observed_away_score],status:r.status};})}}));
        }
      });
      if(!findings.length){status('Scan completed. No supported duplicate-identity or referee-score discrepancy flags were found in the records checked.');return;}
      return db.from('slfa_integrity_alerts').upsert(findings,{onConflict:'alert_key',ignoreDuplicates:true}).then(function(r){
        if(r.error)throw r.error;
        status('Scan completed. '+findings.length+' evidence-backed finding(s) were checked. Existing alerts were not overwritten.');
      });
    }).then(function(){return loadQueue();}).catch(function(e){status('Scan could not complete: '+(e&&e.message||'Check database access and try again.'));}).finally(function(){$('niRunScan').disabled=false;});
  }
  function loadQueue(){
    return db.from('slfa_integrity_alerts').select('id,alert_type,severity,league_id,match_id,player_id,title,details,evidence,status,resolution_notes,created_at,last_detected_at').order('last_detected_at',{ascending:false}).limit(150).then(function(r){
      if(r.error)throw r.error;
      var rows=r.data||[],open=rows.filter(function(x){return x.status==='OPEN'||x.status==='UNDER_REVIEW';});
      $('niOpenCount').textContent=open.length;
      $('niHighCount').textContent=open.filter(function(x){return x.severity==='HIGH';}).length;
      $('niScannedAt').textContent=rows.length?new Date(rows[0].last_detected_at||rows[0].created_at).toLocaleString():'Not yet';
      $('niAlerts').innerHTML=rows.length?rows.map(function(a){
        return '<article class="ni-alert" data-severity="'+esc(a.severity)+'"><div class="ni-alert-head"><small>'+esc(a.alert_type.replace(/_/g,' '))+' · '+esc(a.severity)+' · '+esc(a.status)+'</small><small>'+esc(new Date(a.created_at).toLocaleString())+'</small></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.details)+'</p><small>Competition ID: '+esc(a.league_id||'Not linked')+' · Match ID: '+esc(a.match_id||'Not applicable')+' · Player record: '+esc(a.player_id||'Not applicable')+'</small><label>Status<select data-ni-status="'+esc(a.id)+'"><option value="OPEN" '+(a.status==='OPEN'?'selected':'')+'>Open</option><option value="UNDER_REVIEW" '+(a.status==='UNDER_REVIEW'?'selected':'')+'>Under review</option><option value="RESOLVED" '+(a.status==='RESOLVED'?'selected':'')+'>Resolved</option><option value="DISMISSED" '+(a.status==='DISMISSED'?'selected':'')+'>Dismissed</option></select></label><textarea data-ni-notes="'+esc(a.id)+'" maxlength="2000" placeholder="Record the review outcome and evidence checked">'+esc(a.resolution_notes||'')+'</textarea><div class="btns"><button type="button" class="secondary" data-ni-save="'+esc(a.id)+'">Save review</button></div></article>';
      }).join(''):'<div class="ni-empty">No integrity alerts have been recorded. Run an integrity scan to check the available records.</div>';
      root.querySelectorAll('[data-ni-save]').forEach(function(b){b.addEventListener('click',function(){saveReview(b.getAttribute('data-ni-save'));});});
    });
  }
  function saveReview(id){
    var select=root.querySelector('[data-ni-status="'+id+'"]'),notes=root.querySelector('[data-ni-notes="'+id+'"]');
    if(!select)return;
    status('Saving review…');
    db.from('slfa_integrity_alerts').update({status:select.value,resolution_notes:notes?notes.value.trim()||null:null,reviewed_by:userId,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).then(function(r){
      if(r.error){status('Review could not be saved: '+r.error.message);return;}
      status('Review outcome saved to the private integrity queue.');loadQueue();
    });
  }
  $('niRunScan').addEventListener('click',function(){scan();});
  $('niRefresh').addEventListener('click',function(){status('Refreshing…');loadQueue().then(function(){status('Alert queue refreshed.');}).catch(function(e){status('Could not refresh: '+e.message);});});
  ensureAdmin().then(loadQueue).then(function(){status('Private integrity queue ready. Run a scan to identify review candidates.');}).catch(function(e){status(e.message);$('niRunScan').disabled=true;});
})();