/* Premium public Match Centre. Read-only; uses the existing public tables. */
(function () {
  'use strict';
  var db = window.slfaDb, host = document.getElementById('matchList');
  if (!db || !host) return;
  var matches = [], leagueNames = {}, clubLogos = {}, filter = 'all', chosenDate = '', chosenClub = '', updated = null, timer;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function league() { try { return localStorage.getItem('slfa_league') || ''; } catch (e) { return ''; } }
  function dateText(v) { if (!v) return 'Date TBC'; var d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function day(v) { var d = new Date(v); return isNaN(d) ? '' : d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function status(m) { return String(m.match_status || '').toUpperCase(); }
  function group(m) {
    var s = status(m);
    if (s === 'LIVE' || s === 'HT') return 'live';
    if (s === 'FT' || (m.home_score != null && m.away_score != null && s !== 'SCHEDULED' && s !== 'RESCHEDULED')) return 'results';
    if (s === 'SCHEDULED' || s === 'RESCHEDULED') return 'upcoming';
    return 'other';
  }
  function label(m) {
    var s = status(m);
    if (s === 'LIVE') return 'LIVE' + (m.match_minute == null ? '' : ' · '+m.match_minute+"'");
    return ({HT:'HALF TIME',FT:'FULL TIME',SCHEDULED:'UPCOMING',RESCHEDULED:'RESCHEDULED',POSTPONED:'POSTPONED',CANCELLED:'CANCELLED',ABANDONED:'ABANDONED'})[s] || s.replace(/_/g,' ') || 'STATUS PENDING';
  }
  var CLUB_LOGO_FALLBACKS = {
    baiburehwarriors: 'https://images.seeklogo.com/logo-png/63/1/bai-bureh-warriors-fc-logo-png_seeklogo-638343.png',
    bhantalfc: 'https://dsg-images.com/clubs/200x200/63845.png',
    borangers: 'https://images.seeklogo.com/logo-png/63/1/bo-rangers-fc-logo-png_seeklogo-638330.png',
    bullomstars: 'https://www.dsg-images.com/clubs/30x30/65780.png',
    kallon: 'https://images.seeklogo.com/logo-png/63/1/fc-kallon-logo-png_seeklogo-638335.png',
    kamboieagles: 'https://images.seeklogo.com/logo-png/63/1/kamboi-eagles-fc-logo-png_seeklogo-638346.png',
    mightyblackpool: 'https://www.dsg-images.com/clubs/30x30/17004.png',
    oldedwardians: 'https://images.seeklogo.com/logo-png/63/1/old-edwardians-fc-logo-png_seeklogo-638331.png',
    ports: 'https://images.seeklogo.com/logo-png/63/1/ports-authority-fc-logo-png_seeklogo-638329.png',
    starsportacademy: 'https://dsg-images.com/clubs/200x200/67409.png',
    waterloofc: 'https://qfgcfgjvwwpzkouaczlb.supabase.co/storage/v1/object/public/team_crests/waterloo%20fc.jpeg',
    wilberforcestrikers: 'https://dsg-images.com/clubs/200x200/63177.png',
    wusumstars: 'https://images.seeklogo.com/logo-png/63/1/wusum-stars-fc-logo-png_seeklogo-638334.png',
    diamondstars: 'https://images.seeklogo.com/logo-png/63/1/diamond-stars-fc-logo-png_seeklogo-638347.png',
    eastendlions: 'https://images.seeklogo.com/logo-png/63/1/east-end-lions-fc-logo-png_seeklogo-638348.png',
    westernunited: 'https://www.dsg-images.com/sport_entity/200x200/6528.png'
    // Marampa Mines Women's Premier League crests (Global Sports Archive club artwork)
    ramkamara: 'https://www.dsg-images.com/clubs/200x200/65784.png',
    ramkamarafemale: 'https://www.dsg-images.com/clubs/200x200/65784.png',
    mogbwemoqueens: 'https://www.dsg-images.com/clubs/30x30/62996.png',
    slpolice: 'https://www.dsg-images.com/clubs/200x200/35023.png',
    slpolicefemale: 'https://www.dsg-images.com/clubs/200x200/35023.png',
    sierraleonepolicefemale: 'https://www.dsg-images.com/clubs/200x200/35023.png',
    kallonfemale: 'https://www.dsg-images.com/clubs/30x30/17010.png',
    fckallonfemale: 'https://www.dsg-images.com/clubs/30x30/17010.png',
    menaqueens: 'https://dsg-images.com/clubs/200x200/65802.png',
    patriciaumu: 'https://www.dsg-images.com/clubs/30x30/65798.png',
    kahunlaqueens: 'https://dsg-images.com/clubs/200x200/65799.png',
    koyaqueens: 'https://dsg-images.com/clubs/200x200/65793.png',
    risingqueens: 'https://www.dsg-images.com/clubs/30x30/65800.png',
    vembuck: 'https://dsg-images.com/clubs/200x200/65804.png',
  };
  function clubLogoFallback(name) {
    var key = String(name || '').toLowerCase().replace(/\bfc\b/g, '').replace(/[^a-z0-9]/g, '');
    if (key === 'portsauthority' || key === 'portsauthorityfc') key = 'ports';
    if (key === 'starsa' || key === 'starssa' || key === 'starsport' || key === 'starsportacademyfc') key = 'starsportacademy';
    if (key === 'western' || key === 'westernunitedfc' || key === 'fcwesternunited') key = 'westernunited';
    return CLUB_LOGO_FALLBACKS[key] || '';
  }
  function crest(name) {
    var fallback = clubLogoFallback(name), saved = clubLogos[name], logo = saved || fallback;
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
  function card(m) {
    var s = status(m), g = group(m), score = m.home_score != null && m.away_score != null ?
      '<strong class="slfa-mc-score">'+esc(m.home_score)+'<i>:</i>'+esc(m.away_score)+'</strong>' : '<span class="slfa-mc-vs">VS</span>';
    return '<article class="slfa-mc-card '+(g==='live'?'is-live':'')+'"><div class="slfa-mc-card-top"><b class="slfa-mc-status status-'+esc(s.toLowerCase())+'">'+(g==='live'?'<i class="slfa-mc-live-dot"></i>':'')+esc(label(m))+'</b><span class="slfa-mc-league">'+esc(leagueNames[String(m.league_id)] || 'SLFA Competition')+'</span></div>'+
      '<div class="slfa-mc-teams"><div class="slfa-mc-team">'+crest(m.home_team)+'<span>'+esc(m.home_team)+'</span></div>'+score+'<div class="slfa-mc-team">'+crest(m.away_team)+'<span>'+esc(m.away_team)+'</span></div></div>'+
      '<div class="slfa-mc-card-bottom"><span>'+esc(dateText(m.match_date))+'</span><span>'+esc(m.venue || 'Venue TBC')+'</span></div>'+
      (m.motm_name?'<p class="slfa-mc-motm">★ Man of the Match: '+esc(m.motm_name)+(m.motm_jersey_number?' · #'+esc(m.motm_jersey_number):'')+'</p>':'')+
      '<button class="slfa-mc-details-btn" type="button" data-mc-details="'+esc(m.id)+'" aria-expanded="false">Match details <span>＋</span></button><div class="slfa-mc-detail" id="mc-detail-'+esc(m.id)+'" hidden></div></article>';
  }
  function render() {
    var list = selected(), clubs = {};
    matches.forEach(function (m) { if (!league() || String(m.league_id || '') === league()) { clubs[m.home_team]=1; clubs[m.away_team]=1; } });
    var options = Object.keys(clubs).sort().map(function (n) { return '<option value="'+esc(n)+'"'+(chosenClub===n?' selected':'')+'>'+esc(n)+'</option>'; }).join('');
    var filters = [['all','All matches'],['live','Live'],['upcoming','Upcoming'],['results','Results'],['other','Other']].map(function (f) {
      return '<button type="button" class="slfa-mc-filter'+(filter===f[0]?' active':'')+'" data-mc-filter="'+f[0]+'" aria-pressed="'+(filter===f[0])+'">'+f[1]+'</button>';
    }).join('');
    host.innerHTML = '<section class="slfa-match-centre-v2" aria-label="Match Centre"><div class="slfa-mc-heading"><div><p class="slfa-mc-eyebrow">THE SLFA LEAGUE APP</p><h3>Match Centre</h3><p>Fixtures, live scores and completed results</p></div><span class="slfa-mc-update">'+(updated?'Updated '+new Date(updated).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Public match information')+'</span></div>'+
      '<div class="slfa-mc-tools"><div class="slfa-mc-filters" role="group" aria-label="Match filters">'+filters+'</div><div class="slfa-mc-selects"><label>Date<input type="date" id="mcDate" value="'+esc(chosenDate)+'"></label><label>Club<select id="mcClub"><option value="">All clubs</option>'+options+'</select></label><button type="button" class="slfa-mc-reset" id="mcReset">Reset</button></div></div>'+
      '<p class="slfa-mc-count">'+list.length+' match'+(list.length===1?'':'es')+' shown</p>'+
      (list.length?'<div class="slfa-mc-grid">'+list.map(card).join('')+'</div>':'<div class="slfa-mc-empty"><span>⚽</span><strong>No matches found</strong><p>Try another date, club or match filter.</p></div>')+
      '<p class="slfa-mc-footnote">Scores and match details reflect information currently published in the app.</p></section>';
    host.querySelectorAll('[data-mc-filter]').forEach(function (b) { b.addEventListener('click',function(){filter=b.dataset.mcFilter;render();}); });
    var d=document.getElementById('mcDate'), c=document.getElementById('mcClub'), r=document.getElementById('mcReset');
    if(d)d.addEventListener('change',function(){chosenDate=this.value;render();});
    if(c)c.addEventListener('change',function(){chosenClub=this.value;render();});
    if(r)r.addEventListener('click',function(){chosenDate='';chosenClub='';filter='all';render();});
    host.querySelectorAll('[data-mc-details]').forEach(function(b){b.addEventListener('click',function(){details(b.dataset.mcDetails,b);});});
  }
  function details(id,button) {
    var box=document.getElementById('mc-detail-'+id); if(!box)return;
    if(!box.hidden){box.hidden=true;button.setAttribute('aria-expanded','false');button.innerHTML='Match details <span>＋</span>';return;}
    box.hidden=false;button.setAttribute('aria-expanded','true');button.innerHTML='Hide details <span>−</span>';
    if(box.dataset.loaded)return;
    box.innerHTML='<p class="slfa-mc-detail-loading">Loading published match details…</p>';
    Promise.all([
      db.from('match_events').select('event_type,team_name,player_name,player_off_name,assist_player_name,minute').eq('match_id',String(id)).order('minute',{ascending:true}),
      db.from('match_lineups').select('is_starter,league_clubs(club_name),club_squad(player_name,jersey_number)').eq('match_id',String(id))
    ]).then(function(a){
      box.dataset.loaded='1';var ev=a[0].error?[]:(a[0].data||[]),lu=a[1].error?[]:(a[1].data||[]),html='';
      if(ev.length){html+='<h4>Match timeline</h4><div class="slfa-mc-timeline">'+ev.map(function(e){
        var t=String(e.event_type||'').toUpperCase(),ico=t==='GOAL'?'⚽':t==='YELLOW_CARD'?'🟨':t==='RED_CARD'?'🟥':t==='SUB'?'↔':'•';
        var who=t==='SUB'?(e.player_name||'Player on')+' for '+(e.player_off_name||'player'):(e.player_name||'Match event')+(e.assist_player_name?' · Assist: '+e.assist_player_name:'');
        return '<div class="slfa-mc-event"><span class="slfa-mc-minute">'+esc(e.minute==null?'—':e.minute+"'")+'</span><span>'+ico+'</span><div><strong>'+esc(who)+'</strong><small>'+esc(e.team_name||'')+'</small></div></div>';
      }).join('')+'</div>';}
      if(lu.length){var by={};lu.forEach(function(x){var n=x.league_clubs&&x.league_clubs.club_name||'Team',p=x.club_squad||{},v=(p.jersey_number?'#'+p.jersey_number+' ':'')+(p.player_name||'Player');by[n]=by[n]||{xi:[],bench:[]};(x.is_starter?by[n].xi:by[n].bench).push(v);});
        html+='<h4>Published line-ups</h4><div class="slfa-mc-lineups">'+Object.keys(by).map(function(n){return '<div><strong>'+esc(n)+'</strong><p><b>Starting:</b> '+esc(by[n].xi.join(', ')||'Not published')+'</p><p><b>Bench:</b> '+esc(by[n].bench.join(', ')||'Not published')+'</p></div>';}).join('')+'</div>';}
      box.innerHTML=html||'<p class="slfa-mc-no-events">No additional match details have been published.</p>';
    }).catch(function(){box.innerHTML='<p class="slfa-mc-no-events">Match details are temporarily unavailable.</p>';});
  }
  function fetchData() {
    return Promise.all([
      db.from('matches').select('id,match_date,venue,match_status,match_minute,league_id,home_team,away_team,home_score,away_score,motm_name,motm_jersey_number').order('match_date',{ascending:false}).limit(500),
      db.from('leagues').select('id,name').eq('is_active',true).order('sort_order'),
      db.from('league_clubs').select('club_name,logo_url').eq('is_active',true)
    ]).then(function(a){
      if(a[0].error)return false;
      matches=a[0].data||[];leagueNames={};clubLogos={};
      (a[1].data||[]).forEach(function(x){leagueNames[String(x.id)]=x.name;});
      (a[2].data||[]).forEach(function(x){clubLogos[x.club_name]=x.logo_url || clubLogoFallback(x.club_name);});
      var live=matches.filter(function(m){var s=status(m);return s==='LIVE'||s==='HT';});
      var goalQuery=live.length?db.from('match_events').select('match_id,team_name').in('match_id',live.map(function(m){return String(m.id);})).eq('event_type','GOAL'):Promise.resolve({data:[]});
      return goalQuery.then(function(g){
        if(!g.error&&live.length){
          live.forEach(function(m){
            var id=String(m.id);
            m.home_score=(g.data||[]).filter(function(x){return String(x.match_id)===id&&x.team_name===m.home_team;}).length;
            m.away_score=(g.data||[]).filter(function(x){return String(x.match_id)===id&&x.team_name===m.away_team;}).length;
          });
        }
        updated=new Date();render();return true;
      });
    });
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(fetchData,500);}
  if(window.MutationObserver){new MutationObserver(function(){if(!host.querySelector('.slfa-match-centre-v2')&&matches.length)render();}).observe(host,{childList:true,subtree:true});}
  var switcher=document.getElementById('leagueSwitch');
  if(switcher)switcher.addEventListener('click',function(){window.setTimeout(render,50);});
  if(db.channel)db.channel('public-match-centre').on('postgres_changes',{event:'*',schema:'public',table:'matches'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'match_events'},schedule).on('postgres_changes',{event:'*',schema:'public',table:'league_clubs'},schedule).subscribe();
  window.addEventListener('online',schedule);fetchData();
})();