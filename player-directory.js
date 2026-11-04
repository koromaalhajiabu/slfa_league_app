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
      (list.length ? '<div class="pd-grid">' + list.map(function(p){
        return '<article class="pd-card player-profile-trigger" role="button" tabindex="0" data-profile-player="' + esc(p.player_name) + '" data-profile-id="' + esc(p.id) + '" data-profile-club="' + esc(p.club_name) + '" data-profile-photo="' + esc(p.photo_url || '') + '" data-profile-position="' + esc(p.position || '') + '" data-profile-jersey="' + esc(p.jersey_number || '') + '">' +
          portrait(p.photo_url,p.player_name) + '<div class="pd-card-info"><strong>' + esc(p.player_name) + '</strong><span>' + esc(p.club_name) + '</span><small>' + (p.position ? esc(p.position) : 'Position not listed') + '</small></div>' +
          (p.jersey_number ? '<b class="pd-shirt">#' + esc(p.jersey_number) + '</b>' : '') + '<span class="pd-open">VIEW PROFILE ↗</span></article>';
      }).join('') + '</div>' : '<div class="pd-empty"><span>⚽</span><strong>No players match your search</strong><p>Try another name, club or position, or reset the filters.</p></div>');
    var input = root.querySelector('#pdSearch');
    input.addEventListener('input', function(){search=input.value; var pos=input.selectionStart; render(); var next=root.querySelector('#pdSearch'); next.focus(); next.setSelectionRange(pos,pos);});
    root.querySelector('#pdClub').addEventListener('change',function(){clubFilter=this.value;render();});
    root.querySelector('#pdPosition').addEventListener('change',function(){positionFilter=this.value;render();});
    root.querySelector('#pdReset').addEventListener('click',function(){search='';clubFilter='';positionFilter='';render();});
  }
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
