// Searchable public player directory, backed by approved club squad records.
(function () {
  var cfg = window.SLFA_CONFIG;
  if (!cfg || !window.supabase) return;
  var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  var root = document.getElementById('playerDirectory');
  if (!root) return;
  var clubs = [], players = [], currentLeague = '';
  var search = '', clubFilter = '', positionFilter = '';
  var compareIds = [];
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  }); }
  function normal(v) { return String(v || '').trim().toLowerCase(); }
  function portrait(url, name) {
    var initial = esc(String(name || '?').trim().charAt(0).toUpperCase());
    return url ? '<img class="pd-photo" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="pd-photo pd-initial" hidden>' + initial + '</span>'
      : '<span class="pd-photo pd-initial">' + initial + '</span>';
  }
  function selectedPlayers() {
    var q = normal(search);
    return players.filter(function (p) {
      return (!q || normal(p.player_name).indexOf(q) !== -1 || normal(p.club_name).indexOf(q) !== -1) &&
        (!clubFilter || String(p.club_id) === clubFilter) &&
        (!positionFilter || normal(p.position) === normal(positionFilter));
    }).sort(function (a,b) {
      var byClub = a.club_name.localeCompare(b.club_name);
      return byClub || a.player_name.localeCompare(b.player_name);
    });
  }
  function render() {
    var list = selectedPlayers();
    var clubOptions = clubs.slice().sort(function(a,b){return a.club_name.localeCompare(b.club_name);});
    var positions = Array.from(new Set(players.map(function(p){return p.position || '';}).filter(Boolean))).sort();
    root.innerHTML =
      '<section class="pd-hero"><div><span class="pd-eyebrow">THE PLAYERS BEHIND THE GAME</span><h3>Player Directory</h3><p>Find registered first-team players across the participating clubs.</p></div><span class="pd-hero-mark">⚽</span></section>' +
      '<div class="pd-tools"><label class="pd-search"><span>SEARCH PLAYERS</span><input id="pdSearch" type="search" placeholder="Search player or club…" value="' + esc(search) + '" autocomplete="off"></label>' +
      '<label><span>CLUB</span><select id="pdClub"><option value="">All clubs</option>' + clubOptions.map(function(c){return '<option value="' + esc(c.id) + '"' + (clubFilter === String(c.id) ? ' selected' : '') + '>' + esc(c.club_name) + '</option>';}).join('') + '</select></label>' +
      '<label><span>POSITION</span><select id="pdPosition"><option value="">All positions</option>' + positions.map(function(p){return '<option value="' + esc(p) + '"' + (normal(positionFilter) === normal(p) ? ' selected' : '') + '>' + esc(p) + '</option>';}).join('') + '</select></label>' +
      '<button type="button" class="pd-reset" id="pdReset">Reset</button></div>' +
      '<div class="pd-result-bar"><strong>' + list.length + '</strong><span>players found</span><small>' + (currentLeague ? 'Selected competition' : 'All active competitions') + '</small></div>' +
      (compareIds.length ? '<section class="pd-compare-panel"><div class="pd-compare-head"><div><span>PLAYER INTELLIGENCE</span><strong>Player comparison</strong></div><button type="button" id="pdCompareClear">Clear selection</button></div><p class="pd-compare-selected">' +
        compareIds.map(function(id){var p=players.find(function(x){return String(x.id)===String(id);});return p?esc(p.player_name)+' · '+esc(p.club_name):'';}).filter(Boolean).join(' vs ') +
        '</p><button type="button" class="pd-compare-run" id="pdCompareRun" '+(compareIds.length===2?'':'disabled')+'>Compare selected players</button><div id="pdCompareResult" aria-live="polite"></div></section>' : '') +
      (list.length ? '<div class="pd-grid">' + list.map(function(p){
        return '<article class="pd-card player-profile-trigger" role="button" tabindex="0" data-profile-player="' + esc(p.player_name) + '" data-profile-id="' + esc(p.id) + '" data-profile-club="' + esc(p.club_name) + '" data-profile-photo="' + esc(p.photo_url || '') + '" data-profile-position="' + esc(p.position || '') + '" data-profile-jersey="' + esc(p.jersey_number || '') + '">' +
          portrait(p.photo_url,p.player_name) + '<div class="pd-card-info"><strong>' + esc(p.player_name) + '</strong><span>' + esc(p.club_name) + '</span><small>' + (p.position ? esc(p.position) : 'Position not listed') + '</small></div>' +
          (p.jersey_number ? '<b class="pd-shirt">#' + esc(p.jersey_number) + '</b>' : '') + '<button type="button" class="pd-compare-toggle" data-compare-player="' + esc(p.id) + '" aria-pressed="' + compareIds.some(function(id){return String(id)===String(p.id);}) + '">' +
          (compareIds.some(function(id){return String(id)===String(p.id);}) ? 'Selected' : 'Compare') + '</button><span class="pd-open">VIEW PROFILE ↗</span></article>';
      }).join('') + '</div>' : '<div class="pd-empty"><span>⚽</span><strong>No players match your search</strong><p>Try another name, club or position, or reset the filters.</p></div>');
    var input = root.querySelector('#pdSearch');
    input.addEventListener('input', function(){search=input.value; var pos=input.selectionStart; render(); var next=root.querySelector('#pdSearch'); next.focus(); next.setSelectionRange(pos,pos);});
    root.querySelector('#pdClub').addEventListener('change',function(){clubFilter=this.value;render();});
    root.querySelector('#pdPosition').addEventListener('change',function(){positionFilter=this.value;render();});
    root.querySelector('#pdReset').addEventListener('click',function(){search='';clubFilter='';positionFilter='';render();});
    var clear=root.querySelector('#pdCompareClear');
    if(clear)clear.addEventListener('click',function(){compareIds=[];render();});
    var run=root.querySelector('#pdCompareRun');
    if(run)run.addEventListener('click',loadComparison);
  }
  function statTotal(result,key){return result.error?null:(result.data||[]).reduce(function(n,row){return n+(Number(row[key])||0);},0);}
  function loadComparison(){
    var selected=compareIds.map(function(id){return players.find(function(p){return String(p.id)===String(id);});}).filter(Boolean);
    var out=root.querySelector('#pdCompareResult');
    if(selected.length!==2||!out)return;
    out.innerHTML='<p class="pd-compare-loading">Comparing published player statistics…</p>';
    Promise.all(selected.map(function(p){
      return Promise.all([
        db.from('top_scorers').select('goals').eq('player',p.player_name).eq('club',p.club_name),
        db.from('top_assists').select('assists').eq('player',p.player_name).eq('club',p.club_name),
        db.from('clean_sheets').select('clean_sheets').eq('goalkeeper',p.player_name).eq('club',p.club_name),
        db.from('motm_awards').select('awards').eq('player',p.player_name).eq('club',p.club_name)
      ]);
    })).then(function(results){
      if(!root.querySelector('#pdCompareResult'))return;
      var labels=['Goals','Assists','Clean sheets','MOTM awards'],keys=['goals','assists','clean_sheets','awards'];
      var rows=labels.map(function(label,i){
        var vals=results.map(function(r){return statTotal(r[i],keys[i]);});
        return '<tr><th>'+label+'</th>'+vals.map(function(v){return '<td>'+(v==null?'—':v)+'</td>';}).join('')+'</tr>';
      }).join('');
      out.innerHTML='<div class="pd-compare-table-wrap"><table class="pd-compare-table"><thead><tr><th>Statistic</th>'+selected.map(function(p){return '<th>'+esc(p.player_name)+'<small>'+esc(p.club_name)+'</small></th>';}).join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div><p class="pd-compare-note">Figures reflect published current-season leaderboard records. A dash means no published figure is available, not necessarily zero.</p>';
    }).catch(function(){out.innerHTML='<p class="pd-compare-loading">Comparison data is temporarily unavailable.</p>';});
  }
  root.addEventListener('click',function(e){
    var toggle=e.target.closest&&e.target.closest('[data-compare-player]');
    if(!toggle)return;
    e.preventDefault();e.stopPropagation();
    var id=String(toggle.getAttribute('data-compare-player'));
    if(compareIds.some(function(x){return String(x)===id;}))compareIds=compareIds.filter(function(x){return String(x)!==id;});
    else if(compareIds.length>=2){var status=root.querySelector('.pd-compare-panel');if(status){var note=document.createElement('p');note.className='pd-compare-note';note.textContent='Select no more than two players at a time.';status.appendChild(note);}return;}
    else compareIds.push(id);
    render();
  });
  function load() {
    root.innerHTML = '<div class="pd-loading">Loading registered players…</div>';
    db.from('league_clubs').select('id, league_id, club_name, logo_url').eq('is_active', true).order('club_name')
      .then(function (res) {
        if (res.error) throw res.error;
        var allClubs = res.data || [];
        clubs = currentLeague ? allClubs.filter(function(c){return String(c.league_id || '') === currentLeague;}) : allClubs;
        if (!clubs.length) { players=[]; render(); return null; }
        return db.from('seasons').select('id').eq('is_current', true).maybeSingle().then(function(seasonRes) {
          var squadQuery = db.from('club_squad').select('id, player_name, position, photo_url, jersey_number, club_id, season_id')
            .in('club_id', clubs.map(function(c){return c.id;}))
            .eq('registration_status', 'Approved').eq('status', 'Active');
          if (seasonRes.data && seasonRes.data.id) squadQuery = squadQuery.eq('season_id', seasonRes.data.id);
          return squadQuery.order('player_name');
        });
      }).then(function (res) {
        if (!res) return;
        if (res.error) throw res.error;
        var clubMap = {};
        clubs.forEach(function(c){clubMap[String(c.id)]=c.club_name;});
        players = (res.data || []).filter(function(p){return p.player_name && clubMap[String(p.club_id)];}).map(function(p){
          p.club_name=clubMap[String(p.club_id)]; return p;
        });
        render();
      }).catch(function(){
        root.innerHTML = '<div class="pd-empty"><strong>Player directory unavailable</strong><p>We could not load the public squad records. Please refresh and try again.</p><button type="button" id="pdRetry">Retry</button></div>';
        var retry=root.querySelector('#pdRetry'); if(retry) retry.addEventListener('click',load);
      });
  }
  document.addEventListener('slfa:league-change',function(e){
    currentLeague=String(e.detail && e.detail.leagueId || '');
    clubFilter='';load();
  });
  try { currentLeague = localStorage.getItem('slfa_league') || ''; } catch(e) {}
  load();
})();
