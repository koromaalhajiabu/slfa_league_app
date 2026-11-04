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
      content.innerHTML = '<div class="pp-cover"><span class="pp-cover-label">PLAYER PERFORMANCE PROFILE</span><span class="pp-cover-ball" aria-hidden="true">⚽</span></div>' +
        '<div class="pp-heading">' + portrait + '<div class="pp-identity"><span class="pp-kicker">PLAYER PROFILE</span><h2 id="playerProfileTitle">' + esc(name) + '</h2><p>' + esc(club || 'Club not listed') + '</p>' +
        ((position || jersey) ? '<div class="pp-meta">' + (position ? '<span>' + esc(position) + '</span>' : '') + (jersey ? '<span>SHIRT #' + esc(jersey) + '</span>' : '') + '</div>' : '') +
        '</div></div><section class="pp-stats"><div class="pp-section-head"><div><span>SEASON PERFORMANCE</span><h3>Published statistics</h3></div><small>LIVE DATA</small></div><div class="pp-metrics">' +
        metrics.map(metricCard).join('') + '</div></section><div class="pp-profile-foot"><span class="pp-foot-mark">SL</span><p>Figures are taken from published league statistics for this player and club. A dash means no published figure is currently available; it does not mean zero appearances or performance.</p></div>';
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
