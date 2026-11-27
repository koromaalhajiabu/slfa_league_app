/* SLFA Digital Publications Centre — public read-only library.
   Public metadata is RLS-filtered to PUBLISHED documents. Files use time-limited
   signed URLs from the private slfa-publications bucket. */
(function () {
  'use strict';
  var db = window.slfaDb;
  var nav = document.querySelector('.tabs');
  var publicRoot = document.getElementById('public');
  if (!db || !nav || !publicRoot) return;

  var tab = document.createElement('button');
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('data-tab', 'publications');
  tab.setAttribute('aria-selected', 'false');
  tab.textContent = 'Digital Publications';
  nav.appendChild(tab);

  var host = document.createElement('section');
  host.id = 'slfaDigitalPublications';
  host.className = 'view card slfa-publications';
  host.setAttribute('data-view', 'publications');
  host.setAttribute('aria-label', 'Official football publications and documents');
  host.hidden = true;
  publicRoot.appendChild(host);

  var documents = [], competitions = [], seasons = [];
  var loaded = false, loading = false, lastError = '';
  var categoryChoice = '', competitionChoice = '', seasonChoice = '', searchText = '';
  var requestNo = 0;

  var TYPE_LABELS = {
    REGULATIONS: 'Competition regulations',
    CIRCULAR: 'Official circular',
    ANNOUNCEMENT: 'Official announcement',
    SEASON_REPORT: 'Season report',
    COMPETITION_NOTICE: 'Competition notice',
    OTHER: 'Other publication'
  };

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function categoryLabel(value) { return TYPE_LABELS[value] || 'Publication'; }
  function formatDate(value) {
    if (!value) return 'Date not supplied';
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { timeZone: 'Africa/Freetown', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function formatSize(bytes) {
    var n = Number(bytes || 0);
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function competitionName(id) {
    var row = competitions.filter(function (c) { return String(c.id) === String(id); })[0];
    return row ? row.name : '';
  }
  function seasonName(id) {
    var row = seasons.filter(function (s) { return String(s.id) === String(id); })[0];
    return row ? row.name : '';
  }
  function openTab() {
    nav.querySelectorAll('[data-tab]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b === tab));
    });
    document.querySelectorAll('[data-view]').forEach(function (v) {
      v.hidden = v !== host;
    });
    host.hidden = false;
    if (window.slfaTrack) window.slfaTrack('tab_publications');
    if (!loaded && !loading) load();
  }
  tab.addEventListener('click', openTab);

  function shell() {
    host.innerHTML =
      '<header class="pub-hero"><div><span class="pub-eyebrow">THE SLFA LEAGUE APP</span><h2>Digital Publications Centre</h2>' +
      '<p>Browse published competition regulations, official circulars, notices and season reports in one place.</p></div>' +
      '<span class="pub-hero-mark" aria-hidden="true">PDF</span></header>' +
      '<div class="pub-intro"><strong>Official document library</strong><span>Documents appear here only after an authorised reviewer has approved and published them.</span></div>' +
      '<div class="pub-filters">' +
      '<label>Search publications<input id="pubSearch" type="search" placeholder="Title, reference number or keyword…" autocomplete="off"></label>' +
      '<label>Document type<select id="pubCategory"><option value="">All document types</option>' +
      Object.keys(TYPE_LABELS).map(function (key) { return '<option value="' + key + '">' + esc(TYPE_LABELS[key]) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Competition<select id="pubCompetition"><option value="">All competitions</option></select></label>' +
      '<label>Season<select id="pubSeason"><option value="">All seasons</option></select></label>' +
      '</div>' +
      '<div class="pub-toolbar"><span id="pubCount" aria-live="polite">Loading published documents…</span><button type="button" id="pubRefresh" class="secondary">↻ Refresh</button></div>' +
      '<div id="pubList" class="pub-list" aria-live="polite"><p class="pub-loading">Loading publications…</p></div>' +
      '<p class="pub-footnote">Files are made available through time-limited download links. The public library shows documents currently marked as published in the league database.</p>' +
      '<p id="pubError" class="pub-error" role="status" aria-live="polite"></p>';
    if (window.slfaTranslateDOM) window.slfaTranslateDOM(host);

    $('pubSearch').addEventListener('input', function () { searchText = this.value.trim().toLowerCase(); render(); });
    $('pubCategory').addEventListener('change', function () { categoryChoice = this.value; render(); });
    $('pubCompetition').addEventListener('change', function () { competitionChoice = this.value; render(); });
    $('pubSeason').addEventListener('change', function () { seasonChoice = this.value; render(); });
    $('pubRefresh').addEventListener('click', function () { loaded = false; load(); });
  }

  function load() {
    if (loading) return;
    loading = true;
    $('pubList').innerHTML = '<p class="pub-loading">Loading published documents…</p>';
    $('pubError').textContent = '';
    Promise.all([
      db.from('slfa_publications')
        .select('id,title,document_type,summary,document_number,competition_id,season_id,effective_date,expires_on,file_name,file_size_bytes,storage_path,published_at')
        .eq('status', 'PUBLISHED')
        .order('published_at', { ascending: false })
        .limit(100),
      db.from('leagues').select('id,name').order('sort_order', { ascending: true }),
      db.from('seasons').select('id,name,start_date').order('start_date', { ascending: false })
    ]).then(function (result) {
      if (result[0].error) throw result[0].error;
      documents = result[0].data || [];
      competitions = result[1].error ? [] : (result[1].data || []);
      seasons = result[2].error ? [] : (result[2].data || []);
      $('pubCompetition').innerHTML = '<option value="">All competitions</option>' + competitions.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      }).join('');
      $('pubSeason').innerHTML = '<option value="">All seasons</option>' + seasons.map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>';
      }).join('');
      loaded = true;
      lastError = '';
      render();
    }).catch(function () {
      lastError = 'The document library could not be reached. Check your connection and try again.';
      $('pubList').innerHTML = '<div class="pub-empty"><strong>Publications are temporarily unavailable</strong><p>Reconnect to the internet and refresh the library.</p></div>';
      $('pubCount').textContent = 'Library unavailable';
      $('pubError').textContent = lastError;
    }).then(function () { loading = false; });
  }

  function filteredDocuments() {
    return documents.filter(function (d) {
      if (categoryChoice && d.document_type !== categoryChoice) return false;
      if (competitionChoice && String(d.competition_id || '') !== String(competitionChoice)) return false;
      if (seasonChoice && String(d.season_id || '') !== String(seasonChoice)) return false;
      if (searchText) {
        var haystack = [d.title, d.summary, d.document_number, d.file_name, categoryLabel(d.document_type),
          competitionName(d.competition_id), seasonName(d.season_id)].join(' ').toLowerCase();
        if (haystack.indexOf(searchText) === -1) return false;
      }
      return true;
    });
  }

  function cardMarkup(d) {
    var expired = d.expires_on && String(d.expires_on) < new Date().toISOString().slice(0, 10);
    var comp = competitionName(d.competition_id), season = seasonName(d.season_id);
    var context = [comp, season].filter(Boolean).join(' · ');
    var reference = d.document_number ? '<span class="pub-reference">Ref. ' + esc(d.document_number) + '</span>' : '';
    var dates = [];
    if (d.effective_date) dates.push('Effective ' + formatDate(d.effective_date));
    dates.push('Published ' + formatDate(d.published_at));
    return '<article class="pub-card" data-pub-card="' + esc(d.id) + '">' +
      '<div class="pub-card-icon" aria-hidden="true">PDF</div>' +
      '<div class="pub-card-body"><div class="pub-card-meta"><span class="pub-type">' + esc(categoryLabel(d.document_type)) + '</span>' +
      (expired ? '<span class="pub-expired">Expired</span>' : '') + reference + '</div>' +
      '<h3>' + esc(d.title) + '</h3>' +
      (d.summary ? '<p>' + esc(d.summary) + '</p>' : '') +
      (context ? '<div class="pub-context">' + esc(context) + '</div>' : '') +
      '<div class="pub-date">' + esc(dates.join(' · ')) + ' · ' + esc(formatSize(d.file_size_bytes)) + '</div>' +
      '<div class="pub-download-area"><span class="pub-link-status">Preparing secure download link…</span></div></div></article>';
  }

  function render() {
    if (!host.querySelector('#pubList')) return;
    var rows = filteredDocuments();
    $('pubCount').textContent = rows.length + ' published document' + (rows.length === 1 ? '' : 's') +
      (documents.length === 100 ? ' · showing latest 100' : '');
    if (!rows.length) {
      $('pubList').innerHTML = '<div class="pub-empty"><strong>No publications match these filters</strong><p>Try another document type, competition, season or search term. New documents appear after staff approval.</p></div>';
      return;
    }
    $('pubList').innerHTML = rows.map(cardMarkup).join('');
    if (window.slfaTranslateDOM) window.slfaTranslateDOM(host);
    var thisRequest = ++requestNo;
    Promise.all(rows.map(function (d) {
      return db.storage.from('slfa-publications')
        .createSignedUrl(d.storage_path, 3600, { download: d.file_name })
        .then(function (result) {
          return { id: String(d.id), url: result.error ? '' : result.data && result.data.signedUrl || '' };
        }).catch(function () { return { id: String(d.id), url: '' }; });
    })).then(function (signed) {
      if (thisRequest !== requestNo) return;
      signed.forEach(function (item) {
        var card = host.querySelector('[data-pub-card="' + item.id.replace(/"/g, '') + '"]');
        var area = card && card.querySelector('.pub-download-area');
        if (!area) return;
        if (item.url) {
          var link = document.createElement('a');
          link.className = 'pub-download';
          link.href = item.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'Download PDF ↗';
          area.innerHTML = '';
          area.appendChild(link);
        } else {
          area.innerHTML = '<span class="pub-link-unavailable">Download link unavailable. Refresh and try again.</span>';
        }
      });
    });
  }

  shell();
  if (window.slfaDb && window.slfaDb.channel) {
    db.channel('public-slfa-publications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slfa_publications' }, function () {
        loaded = false;
        if (!host.hidden) load();
      }).subscribe();
  }
  window.addEventListener('online', function () {
    if (!host.hidden) { loaded = false; load(); }
  });
})();