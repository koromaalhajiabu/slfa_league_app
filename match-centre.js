/* Premium public Match Centre. Read-only; uses the existing public tables. */
(function () {
  'use strict';
  var db = window.slfaDb, host = document.getElementById('matchList');
  if (!db || !host) return;
  var allMatches = [], matches = [], seasons = [], leagueNames = {}, clubLogos = {}, leagueRows = [], clubRows = [], liveEvents = [], filter = 'all', chosenDate = '', chosenClub = '', updated = null, timer, fetchTimer, celebratedGoals = {};
  // Season: the picker stores the chosen season; the default is the current season.
  function selectedSeason() { var stored = ''; try { stored = localStorage.getItem('slfa_season') || ''; } catch (e) {} var cur = seasons.filter(function (x) { return x.is_current; })[0] || null; return seasons.filter(function (x) { return String(x.id) === stored; })[0] || cur; }
  // Matches saved without a season count toward the season their date falls in.
  function seasonOf(m) { if (m.season_id != null) return String(m.season_id); var d = String(m.match_date || '').slice(0, 10); var hit = seasons.filter(function (x) { return d >= String(x.start_date) && d <= String(x.end_date); })[0]; return hit ? String(hit.id) : ''; }
  function applySeason() { var sel = selectedSeason(); matches = sel ? allMatches.filter(function (m) { return seasonOf(m) === String(sel.id); }) : allMatches; }
  function publishPublicData() {
    var payload = { matches: matches.slice(), allMatches: allMatches.slice(), seasons: seasons.slice(), leagues: leagueRows.slice(), clubs: clubRows.slice(), liveEvents: liveEvents.slice(), updatedAt: updated ? updated.getTime() : Date.now() };
    window.slfaPublicData = payload;
    document.dispatchEvent(new CustomEvent('slfa:public-data-ready', { detail: payload }));
  }
  document.addEventListener('slfa:season-change', function () { applySeason(); publishPublicData(); render(); });

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function league() { try { return localStorage.getItem('slfa_league') || ''; } catch (e) { return ''; } }
  function dateText(v) { if (!v) return 'Date TBC'; var d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function day(v) { var d = new Date(v); return isNaN(d) ? '' : d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function dateKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function dateStripItems(){var base=new Date();base.setHours(12,0,0,0);var items=[];for(var i=0;i<7;i++){var d=new Date(base);d.setDate(base.getDate()+i);items.push({key:dateKey(d),date:d,label:i===0?'Today':i===1?'Tomorrow':d.toLocaleDateString(undefined,{weekday:'short'}),number:d.getDate()});}if(chosenDate&&!items.some(function(x){return x.key===chosenDate;})){var p=chosenDate.split('-').map(Number),selectedDate=new Date(p[0],p[1]-1,p[2],12);if(!isNaN(selectedDate.getTime()))items.unshift({key:chosenDate,date:selectedDate,label:'Selected',number:selectedDate.getDate()});}return items;}
  function status(m) { return String(m.match_status || '').toUpperCase(); }
  function clubKey(v) { return String(v || '').toLowerCase().replace(/\bfc\b/g, '').replace(/[^a-z0-9]/g, ''); }
  function sameClub(a,b) { return clubKey(a) === clubKey(b); }
  function clubForm(name) {
    return allMatches.filter(function(m) {
      return group(m)==='results' && (sameClub(m.home_team,name) || sameClub(m.away_team,name));
    }).sort(function(a,b){return new Date(b.match_date)-new Date(a.match_date);}).slice(0,5).map(function(m) {
      var home=sameClub(m.home_team,name),gf=Number(home?m.home_score:m.away_score)||0,ga=Number(home?m.away_score:m.home_score)||0;
      return gf>ga?'W':gf<ga?'L':'D';
    });
  }
  function group(m) {
    var s = status(m);
    if (['LIVE','HT','1H','2H','ET','PEN','EXTRA_TIME'].indexOf(s) !== -1) return 'live';
    if (s === 'FT' || (m.home_score != null && m.away_score != null && s !== 'SCHEDULED' && s !== 'RESCHEDULED')) return 'results';
    if (s === 'SCHEDULED' || s === 'RESCHEDULED') return 'upcoming';
    return 'other';
  }
  // Live minute: the admin's last set minute plus the time since it was set (status_set_at)
  function liveMinute(m) {
    if (m.match_minute == null) return null;
    if (!m.status_set_at) return m.match_minute;
    var el = Math.floor((Date.now() - new Date(m.status_set_at).getTime()) / 60000);
    return m.match_minute + Math.max(0, el);
  }
  function label(m) {
    var s = status(m);
    if (['LIVE','1H','2H','ET','PEN','EXTRA_TIME'].indexOf(s) !== -1) { var mn = liveMinute(m); return 'LIVE' + (mn == null ? '' : ' · '+(window.slfaFormatMinute ? window.slfaFormatMinute(mn, m.current_half) : mn+"'")); }
    if (s === 'HT') return 'HALF TIME';
    return ({HT:'HALF TIME',FT:'FULL TIME',SCHEDULED:'UPCOMING',RESCHEDULED:'RESCHEDULED',POSTPONED:'POSTPONED',CANCELLED:'CANCELLED',ABANDONED:'ABANDONED'})[s] || s.replace(/_/g,' ') || 'STATUS PENDING';
  }
  var CLUB_LOGO_FALLBACKS = {
    baiburehwarriors: 'https://images.seeklogo.com/logo-png/63/1/bai-bureh-warriors-fc-logo-png_seeklogo-638343.png',
    bhantalfc: 'https://www.dsg-images.com/clubs/200x200/63845.png',
    borangers: 'https://images.seeklogo.com/logo-png/63/1/bo-rangers-fc-logo-png_seeklogo-638330.png',
    bullomstars: 'https://www.dsg-images.com/clubs/200x200/65780.png',
    kallon: 'https://images.seeklogo.com/logo-png/63/1/fc-kallon-logo-png_seeklogo-638335.png',
    kamboieagles: 'https://images.seeklogo.com/logo-png/63/1/kamboi-eagles-fc-logo-png_seeklogo-638346.png',
    mightyblackpool: 'https://www.dsg-images.com/clubs/200x200/17004.png',
    oldedwardians: 'https://images.seeklogo.com/logo-png/63/1/old-edwardians-fc-logo-png_seeklogo-638331.png',
    ports: 'https://images.seeklogo.com/logo-png/63/1/ports-authority-fc-logo-png_seeklogo-638329.png',
    starsportacademy: 'https://www.dsg-images.com/clubs/200x200/67409.png',

    wilberforcestrikers: 'https://dsg-images.com/clubs/200x200/63177.png',
    wusumstars: 'https://images.seeklogo.com/logo-png/63/1/wusum-stars-fc-logo-png_seeklogo-638334.png',
    diamondstars: 'https://images.seeklogo.com/logo-png/63/1/diamond-stars-fc-logo-png_seeklogo-638347.png',
    eastendlions: 'https://images.seeklogo.com/logo-png/63/1/east-end-lions-fc-logo-png_seeklogo-638348.png',
    westernunited: 'https://www.dsg-images.com/sport_entity/200x200/6528.png',
  };
  function clubLogoFallback(name) {
    var key = String(name || '').toLowerCase().replace(/\bfc\b/g, '').replace(/[^a-z0-9]/g, '');
    if (key === 'portsauthority' || key === 'portsauthorityfc') key = 'ports';
    if (key === 'starsa' || key === 'starssa' || key === 'starsport' || key === 'starsportacademyfc') key = 'starsportacademy';
    if (key === 'western' || key === 'westernunitedfc' || key === 'fcwesternunited') key = 'westernunited';
    return CLUB_LOGO_FALLBACKS[key] || '';
  }
  function isSlfaLogoUrl(url) { return String(url || '').toLowerCase().indexOf('slfa-logo') !== -1; }
  function crest(name) {
    var fallback = clubLogoFallback(name), saved = isSlfaLogoUrl(clubLogos[name]) ? '' : clubLogos[name], logo = saved || fallback;
    var initial = esc((name || '?').charAt(0).toUpperCase());
    return logo ? '<img class="slfa-mc-crest" src="'+esc(logo)+'" data-fallback="'+esc(saved && fallback && saved !== fallback ? fallback : '')+'" alt="" loading="lazy" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=\'\';}else{this.hidden=true;this.nextElementSibling.hidden=false;}"><span class="slfa-mc-crest slfa-mc-crest-fallback" aria-hidden="true" hidden>'+initial+'</span>' :
      '<span class="slfa-mc-crest slfa-mc-crest-fallback" aria-hidden="true">'+initial+'</span>';
  }
  function selected() {
    return matches.filter(function (m) {
      if (league() && String(m.league_id || '') !== league()) return false;
      if (chosenDate && day(m.match_date) !== chosenDate) return false;
      if (chosenClub && m.home_team !== chosenClub && m.away_team !== chosenClub) return false;
      return filter === 'all' || group(m) === filter;
    }).sort(function (a,b) {
      if (filter === 'all' && group(a) !== group(b)) return ({live:0,upcoming:1,results:2,other:3})[group(a)] - ({live:0,upcoming:1,results:2,other:3})[group(b)];
      if (group(a) === 'upcoming' && group(b) === 'upcoming') return new Date(a.match_date)-new Date(b.match_date);
      return new Date(b.match_date)-new Date(a.match_date);
    });
  }
  function goalCelebration(event) {
    if (!event || !event.published_at || String(event.event_type || '').toUpperCase() !== 'GOAL') return;
    var key = [event.match_id,event.minute,event.player_name,event.team_name].join('|');
    if (celebratedGoals[key]) return;
    celebratedGoals[key] = true;
    var layer = document.getElementById('slfa-goal-celebration');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'slfa-goal-celebration';
      layer.className = 'slfa-goal-celebration';
      layer.setAttribute('role','status');
      layer.setAttribute('aria-live','polite');
      document.body.appendChild(layer);
    }
    layer.innerHTML = '<div class="slfa-goal-burst" aria-hidden="true">⚽ ✦ ⚽</div><strong>GOAL!</strong><span>' + esc(event.player_name || 'Goal recorded') + '</span><small>' + esc(event.team_name || 'SLFA match') + (event.minute == null ? '' : ' · ' + esc(window.slfaFormatMinute ? window.slfaFormatMinute(event.minute, event.half) : event.minute + "'")) + '</small>';
    layer.classList.remove('is-visible');
    void layer.offsetWidth;
    layer.classList.add('is-visible');
    window.clearTimeout(layer._hideTimer);
    layer._hideTimer = window.setTimeout(function(){layer.classList.remove('is-visible');},4200);
  }
  function livePreview(m) {
    var events = liveEvents.filter(function (e) { return String(e.match_id) === String(m.id); });
    if (!events.length) return '<div class="slfa-mc-live-feed"><span class="slfa-mc-feed-empty">Live event updates will appear here</span></div>';
    function count(type){return events.filter(function(e){return e.event_type===type;}).length;}
    var goals=count('GOAL'),yellows=count('YELLOW_CARD'),reds=count('RED_CARD');
    var shots=goals+count('SHOT_ON_TARGET')+count('SHOT_OFF_TARGET')+count('SHOT_BLOCKED');
    var onTarget=goals+count('SHOT_ON_TARGET');
    var recent = events.slice().sort(function (a,b) { return Number(b.minute || 0) - Number(a.minute || 0); }).slice(0,3);
    var labels={GOAL:'Goal',YELLOW_CARD:'Yellow card',RED_CARD:'Red card',SUB:'Substitution',SHOT_ON_TARGET:'Shot on target',SHOT_OFF_TARGET:'Shot off target',SHOT_BLOCKED:'Blocked shot',SAVE:'Goalkeeper save',CORNER:'Corner',FOUL:'Foul',OFFSIDE:'Offside'};
    return '<div class="slfa-mc-live-feed"><div class="slfa-mc-live-counts"><span>⚽ '+goals+' goals</span><span>🥅 '+shots+' shots</span><span>🎯 '+onTarget+' on target</span><span>🚩 '+count('CORNER')+' corners</span><span>🧤 '+count('SAVE')+' saves</span><span>🟨 '+yellows+' yellow</span><span>🟥 '+reds+' red</span></div>' +
      '<div class="slfa-mc-live-events">'+recent.map(function(e){
        var type=labels[e.event_type]||'Match event';
        var player=e.event_type==='SUB'?(e.player_name||'Player on')+' on':(e.player_name||type);
        return '<span><b>'+esc(e.minute==null?'—':(window.slfaFormatMinute ? window.slfaFormatMinute(e.minute, e.half) : e.minute+"'"))+'</b> '+esc(type)+' · '+esc(player)+'</span>';
      }).join('')+'</div></div>';
  }
  function card(m) {
    var s = status(m), g = group(m), score = m.home_score != null && m.away_score != null ?
      '<strong class="slfa-mc-score">'+esc(m.home_score)+'<i>:</i>'+esc(m.away_score)+'</strong>' : '<span class="slfa-mc-vs">VS</span>';
    var homeWinner = g === 'results' && Number(m.home_score) > Number(m.away_score);
    var awayWinner = g === 'results' && Number(m.away_score) > Number(m.home_score);
    var cardState = g === 'live' ? 'is-live' : g === 'results' ? 'is-result' : g === 'upcoming' ? 'is-upcoming' : '';
    return '<article class="slfa-mc-card '+cardState+'"><div class="slfa-mc-card-top"><b class="slfa-mc-status status-'+esc(s.toLowerCase())+'">'+(g==='live'?'<i class="slfa-mc-live-dot"></i>':'')+esc(label(m))+'</b><span class="slfa-mc-league">'+esc(leagueNames[String(m.league_id)] || 'SLFA Competition')+'</span></div>'+
      '<div class="slfa-mc-teams"><div class="slfa-mc-team'+(homeWinner?' is-winner':'')+'">'+crest(m.home_team)+'<span role="button" tabindex="0" data-open-club-name="'+esc(m.home_team)+'">'+esc(m.home_team)+'</span></div>'+score+'<div class="slfa-mc-team'+(awayWinner?' is-winner':'')+'">'+crest(m.away_team)+'<span role="button" tabindex="0" data-open-club-name="'+esc(m.away_team)+'">'+esc(m.away_team)+'</span></div></div>'+
      '<div class="slfa-mc-card-bottom"><span>'+esc(dateText(m.match_date))+'</span><span>'+esc(m.venue || 'Venue TBC')+'</span></div>'+
      (m.motm_name?'<p class="slfa-mc-motm">★ Man of the Match: '+esc(m.motm_name)+(m.motm_jersey_number?' · #'+esc(m.motm_jersey_number):'')+'</p>':'')+
      (g==='live'?livePreview(m):'')+
      '<button class="slfa-mc-share" type="button" data-share="'+esc(m.id)+'" aria-label="Share this match">Share ↗</button>'+'<button class="slfa-mc-details-btn" type="button" data-mc-details="'+esc(m.id)+'" aria-expanded="false">Match details <span>＋</span></button><div class="slfa-mc-detail" id="mc-detail-'+esc(m.id)+'" hidden></div></article>';
  }
  function render() {
    var list = selected(), clubs = {};
    // Competition/date/club scope is shared by filters and the live overview.
    var dateScope = matches.filter(function (m) {
      if (league() && String(m.league_id || '') !== league()) return false;
      if (chosenClub && m.home_team !== chosenClub && m.away_team !== chosenClub) return false;
      return true;
    });
    var scoped = dateScope.filter(function(m){return !chosenDate||day(m.match_date)===chosenDate;});
    var dateItems=dateStripItems();
    var dayButtons='<button type="button" class="slfa-mc-day'+(!chosenDate?' active':'')+'" data-mc-day="" aria-pressed="'+(!chosenDate)+'"><span>All dates</span><strong>'+dateScope.filter(function(m){return filter==='all'||group(m)===filter;}).length+'</strong></button>';
    dateItems.forEach(function(item){
      var count=dateScope.filter(function(m){return day(m.match_date)===item.key&&(filter==='all'||group(m)===filter);}).length;
      var active=chosenDate===item.key;
      var fullDate=item.date.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});
      dayButtons+='<button type="button" class="slfa-mc-day'+(active?' active':'')+'" data-mc-day="'+esc(item.key)+'" aria-pressed="'+active+'" aria-label="'+esc(fullDate+', '+count+' matches')+'"><span>'+esc(item.label)+'</span><strong>'+esc(item.number)+'</strong><small><b>'+count+'</b> <span>'+(count===1?'match':'matches')+'</span></small></button>';
    });
    var dateStrip='<div class="slfa-mc-date-browser"><div class="slfa-mc-date-browser-head"><strong>Browse by date</strong><span>Swipe to see the next days</span></div><div class="slfa-mc-date-strip" role="group" aria-label="Choose a match date">'+dayButtons+'</div></div>';
    var liveCount = scoped.filter(function (m) { return group(m) === 'live'; }).length;
    var upcomingCount = scoped.filter(function (m) { return group(m) === 'upcoming'; }).length;
    var resultCount = scoped.filter(function (m) { return group(m) === 'results'; }).length;
    matches.forEach(function (m) { if (!league() || String(m.league_id || '') === league()) { clubs[m.home_team]=1; clubs[m.away_team]=1; } });
    var options = Object.keys(clubs).sort().map(function (n) { return '<option value="'+esc(n)+'"'+(chosenClub===n?' selected':'')+'>'+esc(n)+'</option>'; }).join('');
    var filters = [['all','All'],['live','Live'],['upcoming','Upcoming'],['results','Results'],['other','Other']].map(function (f) {
      var n = f[0]==='all' ? scoped.length : scoped.filter(function(m){return group(m)===f[0];}).length;
      return '<button type="button" class="slfa-mc-filter'+(filter===f[0]?' active':'')+'" data-mc-filter="'+f[0]+'" aria-pressed="'+(filter===f[0])+'">'+f[1]+' <span class="slfa-mc-count-pill">'+n+'</span></button>';
    }).join('');
    host.innerHTML = '<section class="slfa-match-centre-v2" aria-label="Match Centre"><div class="slfa-mc-heading"><div><p class="slfa-mc-eyebrow">THE SLFA LEAGUE APP</p><h3>Match Centre</h3><p>Fixtures, live scores and completed results</p></div><span class="slfa-mc-update">'+(updated?'Updated '+new Date(updated).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Public match information')+'</span></div>'+
      '<div class="slfa-mc-tools"><div class="slfa-mc-filters" role="group" aria-label="Match filters">'+filters+'</div>'+dateStrip+'<div class="slfa-mc-selects"><label>Date<input type="date" id="mcDate" value="'+esc(chosenDate)+'"></label><label>Club<select id="mcClub"><option value="">All clubs</option>'+options+'</select></label><button type="button" class="slfa-mc-reset" id="mcReset">Reset</button></div></div>'+
      '<div class="slfa-mc-summary" aria-live="polite">'+
      '<span class="slfa-mc-summary-stat live"><i aria-hidden="true"></i><b>'+liveCount+'</b><small>Live now</small></span>'+
      '<span class="slfa-mc-summary-stat"><b>'+upcomingCount+'</b><small>Upcoming</small></span>'+
      '<span class="slfa-mc-summary-stat"><b>'+resultCount+'</b><small>Results</small></span>'+
      '<button type="button" id="mcRefresh" aria-label="Refresh match information">↻ Refresh</button></div>'+
      '<p class="slfa-mc-count">'+list.length+' match'+(list.length===1?'':'es')+' shown</p>'+
      (list.length?'<div class="slfa-mc-grid">'+list.map(card).join('')+'</div>':'<div class="slfa-mc-empty"><span>⚽</span><strong>No matches found</strong><p>Try another date, club or match filter.</p></div>')+
      '<p class="slfa-mc-footnote">Scores and match details reflect information currently published in the app.</p></section>';
    host.querySelectorAll('[data-mc-filter]').forEach(function (b) { b.addEventListener('click',function(){filter=b.dataset.mcFilter;render();}); });
    host.querySelectorAll('[data-mc-day]').forEach(function(b){b.addEventListener('click',function(){chosenDate=b.getAttribute('data-mc-day')||'';render();});});
    var d=document.getElementById('mcDate'), c=document.getElementById('mcClub'), r=document.getElementById('mcReset');
    if(d)d.addEventListener('change',function(){chosenDate=this.value;render();});
    if(c)c.addEventListener('change',function(){chosenClub=this.value;render();});
    if(r)r.addEventListener('click',function(){chosenDate='';chosenClub='';filter='all';render();});
    var refresh=document.getElementById('mcRefresh');if(refresh)refresh.addEventListener('click',function(){refresh.disabled=true;refresh.textContent='Refreshing…';fetchData().then(function(){var b=document.getElementById('mcRefresh');if(b){b.disabled=false;b.textContent='↻ Refresh';}});});
    host.querySelectorAll('[data-mc-details]').forEach(function(b){b.addEventListener('click',function(){details(b.dataset.mcDetails,b);});});
    host.querySelectorAll('[data-share]').forEach(function(b){b.addEventListener('click',function(){
      var m=matches.find(function(x){return String(x.id)===String(b.dataset.share);}); if(!m)return;
      var hasScore=m.home_score!=null&&m.away_score!=null;
      var status=group(m)==='live'?'Live':group(m)==='results'?'Full time':'Upcoming';
      var text=status+': '+m.home_team+' '+(hasScore?m.home_score+' – '+m.away_score:'v')+' '+m.away_team+' · SLFA League App';
      var url=location.href.split('#')[0];
      if(navigator.share){navigator.share({title:'SLFA League App',text:text,url:url}).catch(function(){});}
      else{window.open('https://wa.me/?text='+encodeURIComponent(text+' '+url),'_blank','noopener');}
    });});
  }
  function details(id,button) {
    var box=document.getElementById('mc-detail-'+id); if(!box)return;
    if(!box.hidden){box.hidden=true;button.setAttribute('aria-expanded','false');button.innerHTML='Match details <span>＋</span>';return;}
    if (window.slfaTrack) window.slfaTrack('match_details');
    box.hidden=false;button.setAttribute('aria-expanded','true');button.innerHTML='Hide details <span>−</span>';
    if(box.dataset.loaded)return;
    box.innerHTML='<p class="slfa-mc-detail-loading">Loading published match details…</p>';
    Promise.all([
      db.from('match_events').select('event_type,team_name,player_name,player_off_name,assist_player_name,minute,half,published_at').eq('match_id',String(id)).not('published_at','is',null).order('minute',{ascending:true}),
      db.from('match_lineups').select('is_starter,league_clubs(club_name),club_squad(player_name,jersey_number)').eq('match_id',String(id))
    ]).then(function(a){
      if(a[0].error){
        box.innerHTML='<p class="slfa-mc-no-events">Published match event data could not be loaded. Close and reopen Match details to retry.</p>';
        return;
      }
      box.dataset.loaded='1';
      var ev=a[0].data||[],lu=a[1].error?[]:(a[1].data||[]),html='';
      if(ev.length){
        var st={},statMatch=allMatches.find(function(m){return String(m.id)===String(id);})||{};
        function blankStats(){return {goals:0,shots:0,onTarget:0,blocked:0,saves:0,corners:0,fouls:0,offsides:0,yellow:0,red:0,subs:0};}
        [statMatch.home_team,statMatch.away_team].filter(Boolean).forEach(function(k){st[k]=blankStats();});
        var playerImpact={};
        function playerBucket(team,name){
          if(!name)return null;
          var key=String(team||'Match')+'|'+String(name);
          if(!playerImpact[key])playerImpact[key]={team:String(team||'Match'),name:String(name),goals:0,assists:0,shots:0,onTarget:0,blocked:0,saves:0,yellow:0,red:0,subOn:0,subOff:0};
          return playerImpact[key];
        }
        ev.forEach(function(e){
          var k=e.team_name||'Match',t=String(e.event_type||'').toUpperCase();
          st[k]=st[k]||blankStats();
          var x=st[k],p=playerBucket(k,e.player_name);
          if(t==='GOAL'){x.goals++;x.shots++;x.onTarget++;if(p){p.goals++;p.shots++;p.onTarget++;}}
          else if(t==='SHOT_ON_TARGET'){x.shots++;x.onTarget++;if(p){p.shots++;p.onTarget++;}}
          else if(t==='SHOT_OFF_TARGET'){x.shots++;if(p)p.shots++;}
          else if(t==='SHOT_BLOCKED'){x.shots++;x.blocked++;if(p){p.shots++;p.blocked++;}}
          else if(t==='SAVE'){x.saves++;if(p)p.saves++;}
          else if(t==='CORNER')x.corners++;
          else if(t==='FOUL')x.fouls++;
          else if(t==='OFFSIDE')x.offsides++;
          else if(t==='YELLOW_CARD'){x.yellow++;if(p)p.yellow++;}
          else if(t==='RED_CARD'){x.red++;if(p)p.red++;}
          else if(t==='SUB'){x.subs++;if(p)p.subOn++;var off=playerBucket(k,e.player_off_name);if(off)off.subOff++;}
          if(t==='GOAL'&&e.assist_player_name){var aPlayer=playerBucket(k,e.assist_player_name);if(aPlayer)aPlayer.assists++;}
        });
        html+='<h4>Recorded match statistics</h4><div class="slfa-mc-stats">'+Object.keys(st).map(function(k){var x=st[k];return '<div><strong>'+esc(k)+'</strong><span>⚽ '+x.goals+' goals</span><span>🥅 '+x.shots+' shots</span><span>🎯 '+x.onTarget+' on target</span><span>🧱 '+x.blocked+' blocked</span><span>🧤 '+x.saves+' saves</span><span>🚩 '+x.corners+' corners</span><span>✋ '+x.fouls+' fouls</span><span>⚑ '+x.offsides+' offsides</span><span>🟨 '+x.yellow+' yellow</span><span>🟥 '+x.red+' red</span><span>↔ '+x.subs+' subs</span></div>';}).join('')+'</div><p class="slfa-mc-stats-note">Numbers count published entries from assigned match staff only. An unrecorded action is not treated as confirmed absent.</p>';
        var impactTeams=Object.keys(st);
        html+='<h4>Player contributions</h4><div class="slfa-mc-player-impact">'+impactTeams.map(function(team){
          var rows=Object.keys(playerImpact).map(function(key){return playerImpact[key];}).filter(function(p){return p.team===team;}).sort(function(a,b){return b.goals-a.goals||b.assists-a.assists||b.shots-a.shots||b.saves-a.saves||a.name.localeCompare(b.name);});
          if(!rows.length)return '<section class="slfa-mc-player-impact-team"><strong>'+esc(team)+'</strong><p>No player-level entries have been published for this team.</p></section>';
          return '<section class="slfa-mc-player-impact-team"><strong>'+esc(team)+'</strong><div class="slfa-mc-player-impact-scroll"><table><thead><tr><th>Player</th><th>G</th><th>A</th><th>Shots</th><th>On target</th><th>Saves</th><th>YC</th><th>RC</th></tr></thead><tbody>'+rows.map(function(p){return '<tr><td>'+esc(p.name)+(p.subOn||p.subOff?'<small>'+(p.subOn?' · On '+p.subOn:'')+(p.subOff?' · Off '+p.subOff:'')+'</small>':'')+'</td><td>'+p.goals+'</td><td>'+p.assists+'</td><td>'+p.shots+'</td><td>'+p.onTarget+'</td><td>'+p.saves+'</td><td>'+p.yellow+'</td><td>'+p.red+'</td></tr>';}).join('')+'</tbody></table></div></section>';
        }).join('')+'</div><p class="slfa-mc-stats-note">Player figures are derived from the published event log. No estimated player ratings are presented.</p>';
        var eventLabels={GOAL:'Goal',YELLOW_CARD:'Yellow card',RED_CARD:'Red card',SUB:'Substitution',SHOT_ON_TARGET:'Shot on target',SHOT_OFF_TARGET:'Shot off target',SHOT_BLOCKED:'Blocked shot',SAVE:'Goalkeeper save',CORNER:'Corner',FOUL:'Foul',OFFSIDE:'Offside'};
        html+='<h4>Match timeline</h4><div class="slfa-mc-timeline">'+ev.map(function(e){
          var t=String(e.event_type||'').toUpperCase(),ico=t==='GOAL'?'⚽':t==='YELLOW_CARD'?'🟨':t==='RED_CARD'?'🟥':t==='SUB'?'↔':t==='SHOT_ON_TARGET'?'🎯':t==='SHOT_OFF_TARGET'?'↗':t==='SHOT_BLOCKED'?'🧱':t==='SAVE'?'🧤':t==='CORNER'?'🚩':t==='FOUL'?'✋':t==='OFFSIDE'?'⚑':'•';
          var who=t==='SUB'?(e.player_name||'Player on')+' for '+(e.player_off_name||'player'):(eventLabels[t]||'Match event')+' · '+(e.player_name||'Not recorded')+(e.assist_player_name?' · Assist: '+e.assist_player_name:'');
          return '<div class="slfa-mc-event"><span class="slfa-mc-minute">'+esc(e.minute==null?'—':(window.slfaFormatMinute ? window.slfaFormatMinute(e.minute, e.half) : e.minute+"'"))+'</span><span>'+ico+'</span><div><strong>'+esc(who)+'</strong><small>'+esc(e.team_name||'')+'</small></div></div>';
        }).join('')+'</div>';
      } else {
        html+='<h4>Recorded match statistics</h4><p class="slfa-mc-no-events">No published match events are available. Statistics are unavailable, not confirmed zero.</p>';
      }
      if(a[1].error) html+='<p class="slfa-mc-no-events">Published team line-up data is temporarily unavailable.</p>';
      if(lu.length){var by={};lu.forEach(function(x){var n=x.league_clubs&&x.league_clubs.club_name||'Team',p=x.club_squad||{},v=(p.jersey_number?'#'+p.jersey_number+' ':'')+(p.player_name||'Player');by[n]=by[n]||{xi:[],bench:[]};(x.is_starter?by[n].xi:by[n].bench).push(v);});
        html+='<h4>Published line-ups</h4><div class="slfa-mc-lineups">'+Object.keys(by).map(function(n){return '<div><strong role="button" tabindex="0" data-open-club-name="'+esc(n)+'">'+esc(n)+'</strong><p><b>Starting:</b> '+esc(by[n].xi.join(', ')||'Not published')+'</p><p><b>Bench:</b> '+esc(by[n].bench.join(', ')||'Not published')+'</p></div>';}).join('')+'</div>';}
      var current=allMatches.find(function(m){return String(m.id)===String(id);});
      if(current){
        var homeForm=clubForm(current.home_team),awayForm=clubForm(current.away_team);
        var meetings=allMatches.filter(function(m){
          return group(m)==='results' && ((sameClub(m.home_team,current.home_team)&&sameClub(m.away_team,current.away_team)) ||
            (sameClub(m.home_team,current.away_team)&&sameClub(m.away_team,current.home_team)));
        }).sort(function(x,y){return new Date(y.match_date)-new Date(x.match_date);});
        var homeWins=0,awayWins=0,draws=0;
        meetings.forEach(function(m){
          var hIsHome=sameClub(m.home_team,current.home_team),gf=Number(hIsHome?m.home_score:m.away_score)||0,ga=Number(hIsHome?m.away_score:m.home_score)||0;
          if(gf>ga)homeWins++;else if(gf<ga)awayWins++;else draws++;
        });
        html+='<section class="slfa-mc-preview"><h4>Match intelligence</h4><div class="slfa-mc-form-grid"><div><strong>'+esc(current.home_team)+'</strong><span>Recent form</span><b>'+esc(homeForm.join(' · ')||'No results')+'</b></div><div><strong>'+esc(current.away_team)+'</strong><span>Recent form</span><b>'+esc(awayForm.join(' · ')||'No results')+'</b></div></div>'+
          '<div class="slfa-mc-h2h"><span>HEAD-TO-HEAD</span><strong>'+homeWins+' wins</strong><strong>'+draws+' draws</strong><strong>'+awayWins+' wins</strong><small>'+meetings.length+' completed meetings in available records</small></div>'+
          (meetings.length?'<div class="slfa-mc-h2h-recent">'+meetings.slice(0,3).map(function(m){return '<p>'+esc(dateText(m.match_date))+' · '+esc(m.home_team)+' '+esc(m.home_score)+'–'+esc(m.away_score)+' '+esc(m.away_team)+'</p>';}).join('')+'</div>':'')+'</section>';
      }
      if(lu.length||ev.length) html+='<div class="slfa-mc-print-row"><button type="button" class="secondary" data-print-match="'+esc(String(id))+'">Print match sheet</button></div>';
      box.innerHTML=(html||'<p class="slfa-mc-no-events">No additional match details have been published.</p>');
    }).catch(function(){box.innerHTML='<p class="slfa-mc-no-events">Match details are temporarily unavailable.</p>';});
  }
  // Printable match sheet: built from the same published data as the match page, printed from a hidden frame (A4).
  function printMatchSheet(id) {
    Promise.all([
      db.from('matches').select('match_date,venue,home_team,away_team,home_score,away_score,match_status').eq('id', String(id)).maybeSingle(),
      db.from('match_lineups').select('is_starter,league_clubs(club_name),club_squad(player_name,jersey_number)').eq('match_id', String(id)),
      db.from('match_events').select('event_type,team_name,player_name,player_off_name,assist_player_name,minute,half,published_at').eq('match_id', String(id)).not('published_at', 'is', null).order('minute', { ascending: true })
    ]).then(function (a) {
      var m = (a[0].data) || {}, lu = a[1].data || [], ev = a[2].data || [];
      var when = m.match_date ? new Date(m.match_date).toLocaleString('en-GB', { timeZone: 'Africa/Freetown', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      var score = (m.home_score != null && m.away_score != null) ? m.home_score + ' – ' + m.away_score : 'v';
      var by = {};
      lu.forEach(function (x) {
        var n = (x.league_clubs && x.league_clubs.club_name) || 'Team', pl = x.club_squad || {};
        var v = (pl.jersey_number ? '#' + pl.jersey_number + ' ' : '') + (pl.player_name || 'Player');
        by[n] = by[n] || { xi: [], bench: [] }; (x.is_starter ? by[n].xi : by[n].bench).push(v);
      });
      var lineHtml = Object.keys(by).map(function (n) {
        return '<div class="team"><h3>' + esc(n) + '</h3><p><b>Starting:</b></p><ol>' + by[n].xi.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol><p><b>Bench:</b></p><ul>' + by[n].bench.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
      }).join('') || '<p>No line-ups published.</p>';
      var evHtml = ev.length ? '<table><thead><tr><th>Min</th><th>Event</th><th>Player</th><th>Team</th></tr></thead><tbody>' + ev.map(function (e) {
        var t = String(e.event_type || '').toUpperCase();
        var what = t === 'GOAL' ? 'Goal' : t === 'YELLOW_CARD' ? 'Yellow card' : t === 'RED_CARD' ? 'Red card' : t === 'SUB' ? 'Substitution' : 'Event';
        var who = t === 'SUB' ? (e.player_name || '') + ' for ' + (e.player_off_name || '') : (e.player_name || '') + (e.assist_player_name ? ' (assist: ' + e.assist_player_name + ')' : '');
        return '<tr><td>' + esc(e.minute == null ? '—' : (window.slfaFormatMinute ? window.slfaFormatMinute(e.minute, e.half) : e.minute)) + '</td><td>' + what + '</td><td>' + esc(who) + '</td><td>' + esc(e.team_name || '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p>No match events published.</p>';
      var doc = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Match sheet</title><style>' +
        '@page{size:A4;margin:14mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11pt}' +
        'header{border-bottom:3px solid #0b2545;padding-bottom:8px;margin-bottom:12px}h1{font-size:18pt;margin:0 0 4px;color:#0b2545}' +
        '.score{font-size:22pt;font-weight:bold;text-align:center;margin:10px 0}.meta{color:#444}' +
        'h2{font-size:12.5pt;color:#0b2545;margin:16px 0 6px;border-bottom:1px solid #c8d6e5;padding-bottom:3px}' +
        '.teams{display:flex;gap:18px}.team{flex:1}.team h3{font-size:11.5pt;margin:0 0 4px}.team ol,.team ul{margin:2px 0 8px 18px;padding:0}' +
        'table{width:100%;border-collapse:collapse}th,td{border:1px solid #c8d6e5;padding:4px 6px;text-align:left;font-size:10pt}th{background:#eef4fb}' +
        'footer{margin-top:18px;font-size:8.5pt;color:#666;border-top:1px solid #c8d6e5;padding-top:6px}</style></head><body>' +
        '<header><h1>' + esc((m.home_team || 'Home') + ' v ' + (m.away_team || 'Away')) + '</h1><div class="meta">' + esc(when) + (m.venue ? ' · ' + esc(m.venue) : '') + '</div></header>' +
        '<div class="score">' + esc(score) + '</div>' +
        '<h2>Line-ups</h2><div class="teams">' + lineHtml + '</div>' +
        '<h2>Match events</h2>' + evHtml +
        '<footer>Printed from the SLFA League App on ' + esc(new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Freetown' })) + '. Shows published information only.</footer></body></html>';
      var frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(frame);
      frame.onload = function () {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) {}
        setTimeout(function () { frame.remove(); }, 2000);
      };
      frame.srcdoc = doc;
    }).catch(function () {});
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-print-match]');
    if (b) printMatchSheet(b.getAttribute('data-print-match'));
  });
  function fetchData() {
    var request = Promise.all([
      db.from('matches').select('id,match_date,venue,match_status,match_minute,status_set_at,current_half,league_id,season_id,home_team,away_team,home_score,away_score,motm_name,motm_jersey_number').order('match_date',{ascending:false}).limit(300),
      db.from('leagues').select('id,name,logo_url,competition_type,gender_category,description,sort_order,season_id,start_date,end_date,venue,format_details').eq('is_active',true).order('sort_order'),
      db.from('league_clubs').select('id,league_id,club_name,logo_url,stadium,city,founded_year,about').eq('is_active',true),
      db.from('seasons').select('id,name,start_date,end_date,is_current').order('start_date',{ascending:false})
    ]).then(function(a){
      var failed = a.slice(0, 3).find(function (item) { return item && item.error; });
      if (failed) throw new Error(failed.error.message || 'A league database query failed.');
      allMatches=a[0].data||[];seasons=a[3].error?[]:(a[3].data||[]);leagueRows=a[1].data||[];clubRows=a[2].data||[];applySeason();leagueNames={};clubLogos={};
      leagueRows.forEach(function(x){leagueNames[String(x.id)]=x.name;});
      clubRows.forEach(function(x){clubLogos[x.club_name]=x.logo_url || clubLogoFallback(x.club_name);});
      var live=matches.filter(function(m){return group(m)==='live';});
      var eventQuery=live.length?db.from('match_events').select('match_id,event_type,team_name,player_name,minute,half,published_at').in('match_id',live.map(function(m){return String(m.id);})).not('published_at','is',null).order('minute',{ascending:true}):Promise.resolve({data:[]});
      return eventQuery.then(function(g){
        liveEvents=g.error?[]:(g.data||[]);
        if(!g.error&&live.length){
          live.forEach(function(m){
            var id=String(m.id), goals=liveEvents.filter(function(x){return String(x.match_id)===id&&x.event_type==='GOAL';});
            if(m.home_score==null)m.home_score=goals.filter(function(x){return x.team_name===m.home_team;}).length;
            if(m.away_score==null)m.away_score=goals.filter(function(x){return x.team_name===m.away_team;}).length;
          });
        }
        updated=new Date();publishPublicData();render();return true;
      });
    });
    return Promise.race([request, new Promise(function (_, reject) {
      fetchTimer = setTimeout(function () { reject(new Error('The database did not respond within 12 seconds.')); }, 12000);
    })]).catch(function (err) {
      window.slfaPublicData = null;
      document.dispatchEvent(new CustomEvent('slfa:public-data-error'));
      host.innerHTML = '<section class="slfa-match-centre-v2"><div class="slfa-mc-empty"><strong>Matches could not load</strong><p>Check your internet connection and try again. The league database did not complete the request.</p><button type="button" id="slfaMcRetry">Retry loading matches</button></div></section>';
      var retry = document.getElementById('slfaMcRetry');
      if (retry) retry.addEventListener('click', function () { retry.disabled = true; retry.textContent = 'Retrying…'; fetchData(); });
      return false;
    }).then(function (result) { clearTimeout(fetchTimer); return result; });
  }
  window.slfaRefreshMatchCentre = fetchData;
  document.addEventListener('slfa:manual-refresh', fetchData);
  function schedule(){clearTimeout(timer);timer=setTimeout(fetchData,500);}
  if(window.MutationObserver){new MutationObserver(function(){if(!host.querySelector('.slfa-match-centre-v2')&&matches.length)render();}).observe(host,{childList:true,subtree:true});}
  var switcher=document.getElementById('leagueSwitch');
  if(switcher)switcher.addEventListener('click',function(){window.setTimeout(render,50);});
  if(db.channel)db.channel('public-match-centre').on('postgres_changes',{event:'*',schema:'public',table:'matches'},schedule).on('postgres_changes',{event:'INSERT',schema:'public',table:'match_events'},function(payload){var e=payload&&payload.new;if(e&&e.published_at)goalCelebration(e);schedule();}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'match_events'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'league_clubs'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'match_lineups'},schedule).subscribe();
  window.addEventListener('online',schedule);
  window.setInterval(function(){if(document.visibilityState !== 'hidden')fetchData();},180000);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState === 'visible' && (!updated || Date.now()-updated.getTime()>90000))fetchData();});
  fetchData();
})();