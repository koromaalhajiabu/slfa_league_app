// Public player profiles. Read-only presentation of published league statistics.
(function () {
  var cfg = window.SLFA_CONFIG;
  if (!cfg || !window.supabase) return;
  var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  var requestId = 0;
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  var dialog = document.createElement('dialog');
  dialog.id = 'playerProfileDialog';
  dialog.className = 'player-profile-dialog';
  dialog.setAttribute('aria-labelledby', 'playerProfileTitle');
  dialog.innerHTML = '<div class="player-profile-shell"><button type="button" class="player-profile-close" aria-label="Close player profile">×</button><div id="playerProfileContent"><p>Loading player profile…</p></div></div>';
  document.body.appendChild(dialog);
  var content = dialog.querySelector('#playerProfileContent');
  dialog.querySelector('.player-profile-close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  function sum(rows, key) {
    if (!rows || !rows.length) return null;
    return rows.reduce(function (n, row) { return n + (Number(row[key]) || 0); }, 0);
  }
  function loadScoringHistory(host, name, club) {
    if (!host) return;
    host.innerHTML = '<p class="pp-note">Loading goals and assists by season…</p>';
    Promise.all([
      db.from('match_events').select('match_id').eq('event_type','GOAL').eq('team_name',club).eq('player_name',name),
      db.from('match_events').select('match_id').eq('event_type','GOAL').eq('team_name',club).eq('assist_player_name',name)
    ]).then(function(events) {
      if (events[0].error || events[1].error) { host.innerHTML = '<p class="pp-note">Season scoring history is temporarily unavailable.</p>'; return; }
      var goals=events[0].data||[], assists=events[1].data||[];
      var ids=Array.from(new Set(goals.concat(assists).map(function(x){return String(x.match_id);})));
      if(!ids.length){host.innerHTML='<p class="pp-note">No published goal or assist events are linked to this player yet.</p>';return;}
      return Promise.all([
        db.from('matches').select('id,season_id,match_status,match_date').in('id',ids),
        db.from('seasons').select('id,name,start_date,end_date').order('start_date')
      ]).then(function(data) {
        if(data[0].error){host.innerHTML='<p class="pp-note">Season scoring history is temporarily unavailable.</p>';return;}
        var matchMap={},seasonRows=data[1].error?[]:(data[1].data||[]);
        (data[0].data||[]).forEach(function(m){matchMap[String(m.id)]=m;});
        function seasonKey(match){
          if(match.season_id!=null)return String(match.season_id);
          var date=String(match.match_date||'').slice(0,10);
          var found=seasonRows.find(function(s){return date>=String(s.start_date)&&date<=String(s.end_date);});
          return found?String(found.id):'unknown';
        }
        var grouped={};
        function count(list,key){
          list.forEach(function(ev){
            var m=matchMap[String(ev.match_id)];
            if(!m||String(m.match_status||'').toUpperCase()!=='FT')return;
            var k=seasonKey(m);
            if(!grouped[k])grouped[k]={goals:0,assists:0};
            grouped[k][key]++;
          });
        }
        count(goals,'goals');count(assists,'assists');
        var names={};seasonRows.forEach(function(s){names[String(s.id)]=s.name;});
        var rows=Object.keys(grouped).map(function(k){return {season:names[k]||(k==='unknown'?'Season not recorded':'Season '+k),goals:grouped[k].goals,assists:grouped[k].assists};})
          .sort(function(a,b){return a.season.localeCompare(b.season);});
        host.innerHTML='<div class="pp-scoring-head"><span>SEASON-BY-SEASON</span><strong>Goals and assists</strong></div>'+
          '<div class="pp-career-table-wrap"><table class="pp-career-table"><thead><tr><th>Season</th><th>Goals</th><th>Assists</th></tr></thead><tbody>'+
          rows.map(function(r){return '<tr><td>'+esc(r.season)+'</td><td>'+r.goals+'</td><td>'+r.assists+'</td></tr>';}).join('')+
          '</tbody></table></div><p class="pp-note">Counts are based on goal events in completed matches and are linked to the player name and club shown above.</p>';
      });
    }).catch(function(){host.innerHTML='<p class="pp-note">Season scoring history is temporarily unavailable.</p>';});
  }
  function loadPlayerEventHistory(host, name, club) {
    if (!host) return;
    host.innerHTML='<div class="pp-match-log-head"><span>PLAYER MATCH LOG</span><h3>Published match contributions</h3></div><p class="pp-note">Loading published match events…</p>';
    var columns='match_id,event_type,team_name,player_name,player_off_name,assist_player_name,minute,half,published_at';
    Promise.all([
      db.from('match_events').select(columns).eq('team_name',club).eq('player_name',name).not('published_at','is',null),
      db.from('match_events').select(columns).eq('team_name',club).eq('assist_player_name',name).not('published_at','is',null),
      db.from('match_events').select(columns).eq('team_name',club).eq('player_off_name',name).not('published_at','is',null)
    ]).then(function(groups){
      if(groups.some(function(x){return x.error;})){host.innerHTML='<p class="pp-note">Player match records are temporarily unavailable.</p>';return;}
      var seen={},events=[];
      groups.forEach(function(group){(group.data||[]).forEach(function(e){
        var key=[e.match_id,e.event_type,e.minute,e.half,e.team_name,e.player_name,e.player_off_name,e.assist_player_name].join('|');
        if(!seen[key]){seen[key]=true;events.push(e);}
      });});
      var ids=Array.from(new Set(events.map(function(e){return String(e.match_id);})));
      if(!ids.length){host.innerHTML='<div class="pp-match-log-head"><span>PLAYER MATCH LOG</span><h3>Published match contributions</h3></div><p class="pp-note">No published match event entries are linked to this player yet. This does not mean the player made no appearances.</p>';return;}
      return db.from('matches').select('id,match_date,match_status,home_team,away_team,home_score,away_score,venue').in('id',ids).then(function(matchRes){
        if(matchRes.error){host.innerHTML='<p class="pp-note">Player match records are temporarily unavailable.</p>';return;}
        var matchMap={};
        (matchRes.data||[]).forEach(function(m){matchMap[String(m.id)]=m;});
        var grouped={};
        events.forEach(function(e){var k=String(e.match_id);if(!matchMap[k])return;(grouped[k]=grouped[k]||[]).push(e);});
        var idsSorted=Object.keys(grouped).sort(function(a,b){return new Date(matchMap[b].match_date||0)-new Date(matchMap[a].match_date||0);});
        if(!idsSorted.length){host.innerHTML='<p class="pp-note">No linked match records are available for these published events.</p>';return;}
        var html='<div class="pp-match-log-head"><span>PLAYER MATCH LOG</span><h3>Published match contributions</h3></div>';
        html+='<div class="pp-match-log-list">'+idsSorted.map(function(id){
          var m=matchMap[id],rows=grouped[id].slice().sort(function(a,b){return Number(a.half)-Number(b.half)||Number(a.minute)-Number(b.minute);});
          var goals=rows.filter(function(e){return e.event_type==='GOAL'&&e.player_name===name;}).length;
          var assists=rows.filter(function(e){return e.event_type==='GOAL'&&e.assist_player_name===name;}).length;
          var shots=rows.filter(function(e){return e.player_name===name&&['GOAL','SHOT_ON_TARGET','SHOT_OFF_TARGET','SHOT_BLOCKED'].indexOf(e.event_type)>=0;}).length;
          var saves=rows.filter(function(e){return e.event_type==='SAVE'&&e.player_name===name;}).length;
          var yellows=rows.filter(function(e){return e.event_type==='YELLOW_CARD'&&e.player_name===name;}).length;
          var reds=rows.filter(function(e){return e.event_type==='RED_CARD'&&e.player_name===name;}).length;
          var score=m.home_score==null||m.away_score==null?'—':m.home_score+' – '+m.away_score;
          var date=m.match_date?new Date(m.match_date).toLocaleDateString('en-GB',{timeZone:'Africa/Freetown',day:'numeric',month:'short',year:'numeric'}):'Date not recorded';
          var labels={GOAL:'Goal',YELLOW_CARD:'Yellow card',RED_CARD:'Red card',SUB:'Substitution',SHOT_ON_TARGET:'Shot on target',SHOT_OFF_TARGET:'Shot off target',SHOT_BLOCKED:'Blocked shot',SAVE:'Goalkeeper save',CORNER:'Corner',FOUL:'Foul',OFFSIDE:'Offside'};
          var eventHtml=rows.map(function(e){
            var t=String(e.event_type||'').toUpperCase(),desc=labels[t]||'Match event';
            if(t==='GOAL'&&e.assist_player_name===name&&e.player_name!==name)desc='Assist · '+(e.player_name||'Goal scorer');
            else if(t==='SUB'&&e.player_off_name===name)desc='Substituted off';
            else if(t==='SUB'&&e.player_name===name)desc='Substituted on';
            else desc+=' · '+(e.player_name||'Player not recorded');
            return '<li><span>'+esc(e.minute==null?'—':e.minute+"'")+'</span><strong>'+esc(desc)+'</strong></li>';
          }).join('');
          return '<article class="pp-match-log-card"><div class="pp-match-log-fixture"><div><small>'+esc(date)+' · '+esc(String(m.match_status||'').replace(/_/g,' '))+'</small><strong>'+esc(m.home_team||'Home')+' <b>'+esc(score)+'</b> '+esc(m.away_team||'Away')+'</strong><small>'+esc(m.venue||'Venue not recorded')+'</small></div></div><div class="pp-match-log-metrics">'+
            (goals?'<span>⚽ '+goals+' G</span>':'')+(assists?'<span>↗ '+assists+' A</span>':'')+(shots?'<span>🎯 '+shots+' Shots</span>':'')+(saves?'<span>🧤 '+saves+' Saves</span>':'')+(yellows?'<span>🟨 '+yellows+'</span>':'')+(reds?'<span>🟥 '+reds+'</span>':'')+
            '</div><ul class="pp-match-log-events">'+eventHtml+'</ul></article>';
        }).join('')+'</div><p class="pp-note">Only published event entries are shown. A match without a listed event may still include an appearance or other contribution that was not entered into the event log.</p>';
        host.innerHTML=html;
      });
    }).catch(function(){host.innerHTML='<p class="pp-note">Player match records are temporarily unavailable.</p>';});
  }
  function metricCard(metric) {
    var value = metric.value == null ? '—' : esc(metric.value);
    var foot = metric.error ? 'Temporarily unavailable' : (metric.value == null ? 'No published figure yet' : 'Published league record');
    return '<article class="pp-metric"><span class="pp-metric-icon" aria-hidden="true">' + metric.icon + '</span><div><small>' + esc(metric.label) + '</small><strong>' + value + '</strong><em>' + foot + '</em></div></article>';
  }
  function openProfile(trigger) {
    var name = trigger.getAttribute('data-profile-player') || '';
    var club = trigger.getAttribute('data-profile-club') || '';
    var clubLogo = trigger.getAttribute('data-profile-club-logo') || '';
    var photo = trigger.getAttribute('data-profile-photo') || '';
    var position = trigger.getAttribute('data-profile-position') || '';
    var jersey = trigger.getAttribute('data-profile-jersey') || '';
    var playerId = trigger.getAttribute('data-profile-id') || '';
    if (!name) return;
    var thisRequest = ++requestId;
    content.innerHTML = '<div class="pp-loading"><span class="pp-loading-mark">⚽</span><strong>Building player profile</strong><span>Retrieving published league statistics…</span></div>';
    if (!dialog.open) dialog.showModal();
    var queries = [
      db.from('top_scorers').select('goals').eq('player', name).eq('club', club),
      db.from('top_assists').select('assists').eq('player', name).eq('club', club),
      db.from('clean_sheets').select('clean_sheets').eq('goalkeeper', name).eq('club', club),
      db.from('motm_awards').select('awards').eq('player', name).eq('club', club)
    ];
    Promise.all(queries).then(function (all) {
      if (thisRequest !== requestId || !dialog.open) return;
      var metrics = [
        { label:'Goals scored', value:sum(all[0].data,'goals'), error:!!all[0].error, icon:'⚽' },
        { label:'Assists', value:sum(all[1].data,'assists'), error:!!all[1].error, icon:'↗' },
        { label:'Clean sheets', value:sum(all[2].data,'clean_sheets'), error:!!all[2].error, icon:'🧤' },
        { label:'Man of the Match', value:sum(all[3].data,'awards'), error:!!all[3].error, icon:'★' }
      ];
      var achievementRules = [
        {key:'goals',label:'Goal threat',detail:'10+ published goals',value:metrics[0].value,threshold:10,icon:'⚽'},
        {key:'assists',label:'Playmaker',detail:'5+ published assists',value:metrics[1].value,threshold:5,icon:'🎯'},
        {key:'clean',label:'Safe hands',detail:'5+ published clean sheets',value:metrics[2].value,threshold:5,icon:'🧤'},
        {key:'motm',label:'Match star',detail:'3+ published MOTM awards',value:metrics[3].value,threshold:3,icon:'★'}
      ];
      var earned = achievementRules.filter(function(a){return a.value != null && Number(a.value) >= a.threshold;});
      var achievementHtml = '<section class="pp-achievements"><div class="pp-career-head"><span>CAREER MILESTONES</span><h3>Achievements</h3></div>' +
        (earned.length ? '<div class="pp-achievement-grid">' + earned.map(function(a){return '<article class="pp-achievement"><span aria-hidden="true">'+a.icon+'</span><strong>'+a.label+'</strong><small>'+a.detail+'</small></article>';}).join('') + '</div>' :
        '<p class="pp-note">Milestone badges appear when published statistics reach the stated thresholds. No milestone has been reached in the available records yet.</p>') + '</section>';
      var portrait = photo
        ? '<img class="pp-photo" src="' + esc(photo) + '" alt="' + esc(name) + '" onerror="this.hidden=true;this.nextElementSibling.hidden=false;"><div class="pp-photo pp-placeholder" hidden>' + esc(name.charAt(0).toUpperCase()) + '</div>'
        : '<div class="pp-photo pp-placeholder">' + esc(name.charAt(0).toUpperCase()) + '</div>';
      var clubCrest = clubLogo
        ? '<img class="pp-club-crest" src="'+esc(clubLogo)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false;"><span class="pp-club-crest pp-club-initial" hidden>'+esc(String(club||'?').charAt(0).toUpperCase())+'</span>'
        : '<span class="pp-club-crest pp-club-initial">'+esc(String(club||'?').charAt(0).toUpperCase())+'</span>';
      var baseHtml = '<div class="pp-cover"><span class="pp-cover-label">PLAYER PERFORMANCE PROFILE</span><span class="pp-cover-ball" aria-hidden="true">⚽</span></div>' +
        '<div class="pp-heading">' + portrait + '<div class="pp-identity"><span class="pp-kicker">PLAYER PROFILE</span><h2 id="playerProfileTitle">' + esc(name) + '</h2><div class="pp-club-line">'+clubCrest+'<p>' + esc(club || 'Club not listed') + '</p></div>' +
        ((position || jersey) ? '<div class="pp-meta">' + (position ? '<span>' + esc(position) + '</span>' : '') + (jersey ? '<span>SHIRT #' + esc(jersey) + '</span>' : '') + '</div>' : '') +
        '</div></div><section class="pp-stats"><div class="pp-section-head"><div><span>SEASON PERFORMANCE</span><h3>Published statistics</h3></div><small>LIVE DATA</small></div><div class="pp-metrics">' +
        metrics.map(metricCard).join('') + '</div></section>';
      content.innerHTML = baseHtml + achievementHtml + '<section class="pp-career"><div class="pp-career-head"><span>PLAYER CAREER</span><h3>Match appearances</h3></div><div id="ppCareerBody"><p class="pp-note">Loading recorded match appearances…</p></div></section><div class="pp-profile-foot"><span class="pp-foot-mark">SL</span><p>Performance figures come from published league statistics. Appearance totals are counted from recorded matchday line-ups linked to this player registration. Missing records are not treated as zero.</p></div>';
      var careerHost = content.querySelector('#ppCareerBody');
      var scoringHost = document.createElement('div');
      scoringHost.className = 'pp-scoring-history';
      careerHost.parentNode.insertBefore(scoringHost, careerHost.nextSibling);
      loadScoringHistory(scoringHost, name, club);
      var eventHost = document.createElement('section');
      eventHost.className = 'pp-match-log';
      scoringHost.parentNode.insertBefore(eventHost, scoringHost.nextSibling);
      loadPlayerEventHistory(eventHost, name, club);
      if (!playerId) { careerHost.innerHTML = '<p class="pp-note">Match appearances are not linked to this player record yet.</p>'; return; }
      db.from('match_lineups').select('match_id,is_starter').eq('player_id', playerId).then(function (lineupRes) {
        if (thisRequest !== requestId || !dialog.open) return;
        if (lineupRes.error) { careerHost.innerHTML = '<p class="pp-note">Match appearance records are temporarily unavailable.</p>'; return; }
        var lineups = lineupRes.data || [];
        var ids = Array.from(new Set(lineups.map(function (x) { return String(x.match_id); })));
        if (!ids.length) { careerHost.innerHTML = '<p class="pp-note">No recorded matchday appearances are linked to this registration yet.</p>'; return; }
        return db.from('matches').select('id,season_id,match_status,match_date').in('id', ids).then(function (matchRes) {
          if (thisRequest !== requestId || !dialog.open) return;
          if (matchRes.error) { careerHost.innerHTML = '<p class="pp-note">Match appearance records are temporarily unavailable.</p>'; return; }
          var matchMap = {};
          (matchRes.data || []).forEach(function (m) { matchMap[String(m.id)] = m; });
          var valid = lineups.filter(function (x) { var m = matchMap[String(x.match_id)]; return m && String(m.match_status || '').toUpperCase() === 'FT'; });
          var seasonIds = Array.from(new Set(valid.map(function (x) { return matchMap[String(x.match_id)].season_id; }).filter(Boolean)));
          var renderCareer = function (seasonRows) {
            var seasonNames = {};
            (seasonRows || []).forEach(function (s) { seasonNames[String(s.id)] = s.name; });
            var grouped = {};
            valid.forEach(function (x) {
              var m = matchMap[String(x.match_id)], key = String(m.season_id || 'unknown');
              if (!grouped[key]) grouped[key] = { season: seasonNames[key] || (key === 'unknown' ? 'Season not recorded' : 'Season ' + key), appearances: 0, starts: 0 };
              grouped[key].appearances += 1;
              if (x.is_starter) grouped[key].starts += 1;
            });
            var rows = Object.keys(grouped).map(function (k) { return grouped[k]; }).sort(function (a,b) { return a.season.localeCompare(b.season); });
            var totalApps = rows.reduce(function (n,r){return n+r.appearances;},0);
            var totalStarts = rows.reduce(function (n,r){return n+r.starts;},0);
            careerHost.innerHTML = '<div class="pp-career-totals"><div><small>APPEARANCES</small><strong>' + totalApps + '</strong></div><div><small>STARTS</small><strong>' + totalStarts + '</strong></div><div><small>START RATE</small><strong>' + (totalApps?Math.round(totalStarts/totalApps*100)+'%':'—') + '</strong></div></div>' +
              '<div class="pp-career-table-wrap"><table class="pp-career-table"><thead><tr><th>Season</th><th>Apps</th><th>Starts</th></tr></thead><tbody>' +
              rows.map(function(r){return '<tr><td>' + esc(r.season) + '</td><td>' + r.appearances + '</td><td>' + r.starts + '</td></tr>';}).join('') + '</tbody></table></div>' +
              '<p class="pp-note">Only completed matches with a saved line-up are counted. This is a record of the linked registration, not an assumed full career history.</p>';
          };
          if (!seasonIds.length) { renderCareer([]); return; }
          return db.from('seasons').select('id,name').in('id', seasonIds).then(function (seasonRes) {
            if (thisRequest !== requestId || !dialog.open) return;
            renderCareer(seasonRes.error ? [] : (seasonRes.data || []));
          });
        });
      }).catch(function () {
        if (thisRequest === requestId && dialog.open) careerHost.innerHTML = '<p class="pp-note">Match appearance records are temporarily unavailable.</p>';
      });
    }).catch(function () {
      if (thisRequest !== requestId) return;
      content.innerHTML = '<div class="pp-heading"><div class="pp-identity"><span class="pp-kicker">PLAYER PROFILE</span><h2 id="playerProfileTitle">' + esc(name) + '</h2><p>' + esc(club || 'Club not listed') + '</p></div></div><p class="pp-note">Published statistics are temporarily unavailable. Please try again later.</p>';
    });
  }
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-profile-player]');
    if (trigger) openProfile(trigger);
  });
  document.addEventListener('keydown', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-profile-player]');
    if (trigger && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openProfile(trigger);
    }
  });
  dialog.addEventListener('close', function () { requestId++; });
})();
