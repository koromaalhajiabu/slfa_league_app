// Public player profiles. Read-only presentation of published player statistics.
(function () {
  var cfg = window.SLFA_CONFIG;
  if (!cfg || !window.supabase) return;
  var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
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

  function openProfile(trigger) {
    var name = trigger.getAttribute('data-profile-player') || '';
    var club = trigger.getAttribute('data-profile-club') || '';
    var photo = trigger.getAttribute('data-profile-photo') || '';
    var position = trigger.getAttribute('data-profile-position') || '';
    var jersey = trigger.getAttribute('data-profile-jersey') || '';
    if (!name) return;
    content.innerHTML = '<div class="pp-loading">Loading published statistics…</div>';
    if (!dialog.open) dialog.showModal();
    var queries = [
      db.from('top_scorers').select('goals').eq('player', name).eq('club', club),
      db.from('top_assists').select('assists').eq('player', name).eq('club', club),
      db.from('clean_sheets').select('clean_sheets').eq('goalkeeper', name).eq('club', club),
      db.from('motm_awards').select('awards').eq('player', name).eq('club', club)
    ];
    Promise.all(queries).then(function (all) {
      var metrics = [
        { label: 'Goals', value: all[0].error ? null : sum(all[0].data, 'goals') },
        { label: 'Assists', value: all[1].error ? null : sum(all[1].data, 'assists') },
        { label: 'Clean sheets', value: all[2].error ? null : sum(all[2].data, 'clean_sheets') },
        { label: 'Man of the Match', value: all[3].error ? null : sum(all[3].data, 'awards') }
      ];
      content.innerHTML = '<div class="pp-heading">' +
        (photo ? '<img class="pp-photo" src="' + esc(photo) + '" alt="' + esc(name) + '">' : '<div class="pp-photo pp-placeholder">' + esc(name.charAt(0).toUpperCase()) + '</div>') +
        '<div class="pp-identity"><span class="pp-kicker">PUBLIC PLAYER PROFILE</span><h2 id="playerProfileTitle">' + esc(name) + '</h2><p>' + esc(club || 'Club not listed') + '</p>' +
        ((position || jersey) ? '<div class="pp-meta">' + (position ? esc(position) : '') + (position && jersey ? ' · ' : '') + (jersey ? 'Shirt #' + esc(jersey) : '') + '</div>' : '') +
        '</div></div><section class="pp-stats"><h3>Published league statistics</h3><div class="pp-metrics">' +
        metrics.map(function (m) { return '<div class="pp-metric"><span>' + esc(m.label) + '</span><strong>' + (m.value == null ? '—' : esc(m.value)) + '</strong></div>'; }).join('') +
        '</div></section><p class="pp-note">Statistics are shown from published league records. A dash means no published figure is currently available.</p>';
    }).catch(function () {
      content.innerHTML = '<div class="pp-heading"><div class="pp-identity"><span class="pp-kicker">PUBLIC PLAYER PROFILE</span><h2 id="playerProfileTitle">' + esc(name) + '</h2><p>' + esc(club || 'Club not listed') + '</p></div></div><p class="pp-note">Published statistics are temporarily unavailable. Please try again later.</p>';
    });
  }
  function sum(rows, key) {
    if (!rows || !rows.length) return 0;
    return rows.reduce(function (n, row) { return n + (Number(row[key]) || 0); }, 0);
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
})();
