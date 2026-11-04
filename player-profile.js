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
  function metricCard(metric) {
    var value = metric.value == null ? '—' : esc(metric.value);
    var foot = metric.error ? 'Temporarily unavailable' : (metric.value == null ? 'No published figure yet' : 'Published league record');
    return '<article class="pp-metric"><span class="pp-metric-icon" aria-hidden="true">' + metric.icon + '</span><div><small>' + esc(metric.label) + '</small><strong>' + value + '</strong><em>' + foot + '</em></div></article>';
  }
  function openProfile(trigger) {
    var name = trigger.getAttribute('data-profile-player') || '';
    var club = trigger.getAttribute('data-profile-club') || '';
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
      var portrait = photo
        ? '<img class="pp-photo" src="' + esc(photo) + '" alt="' + esc(name) + '" onerror="this.hidden=true;this.nextElementSibling.hidden=false;"><div class="pp-photo pp-placeholder" hidden>' + esc(name.charAt(0).toUpperCase()) + '</div>'
        : '<div class="pp-photo pp-placeholder">' + esc(name.charAt(0).toUpperCase()) + '</div>';
      var baseHtml = '<div class="pp-cover"><span class="pp-cover-label">PLAYER PERFORMANCE PROFILE</span><span class="pp-cover-ball" aria-hidden="true">⚽</span></div>' +
        '<div class="pp-heading">' + portrait + '<div class="pp-identity"><span class="pp-kicker">PLAYER PROFILE</span><h2 id="playerProfileTitle">' + esc(name) + '</h2><p>' + esc(club || 'Club not listed') + '</p>' +
        ((position || jersey) ? '<div class="pp-meta">' + (position ? '<span>' + esc(position) + '</span>' : '') + (jersey ? '<span>SHIRT #' + esc(jersey) + '</span>' : '') + '</div>' : '') +
        '</div></div><section class="pp-stats"><div class="pp-section-head"><div><span>SEASON PERFORMANCE</span><h3>Published statistics</h3></div><small>LIVE DATA</small></div><div class="pp-metrics">' +
        metrics.map(metricCard).join('') + '</div></section>';
      content.innerHTML = baseHtml + '<section class="pp-career"><div class="pp-career-head"><span>PLAYER CAREER</span><h3>Match appearances</h3></div><div id="ppCareerBody"><p class="pp-note">Loading recorded match appearances…</p></div></section><div class="pp-profile-foot"><span class="pp-foot-mark">SL</span><p>Performance figures come from published league statistics. Appearance totals are counted from recorded matchday line-ups linked to this player registration. Missing records are not treated as zero.</p></div>';
      var careerHost = content.querySelector('#ppCareerBody');
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
            careerHost.innerHTML = '<div class="pp-career-totals"><div><small>APPEARANCES</small><strong>' + totalApps + '</strong></div><div><small>STARTS</small><strong>' + totalStarts + '</strong></div></div>' +
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
