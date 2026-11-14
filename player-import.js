(function () {
  'use strict';
  var db = window.slfaDb;
  if (!db || typeof window.slfaRenderRole !== 'function') return;
  var originalRender = window.slfaRenderRole;
  var lastRows = null, lastFileName = '';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function node(id) { return document.getElementById(id); }
  function message(text, bad) {
    var el = node('fciMessage');
    if (el) { el.textContent = text; el.style.color = bad ? '#b42318' : 'inherit'; }
  }
  function csvParse(text) {
    var rows = [], row = [], cell = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], next = text[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell.length === 0) quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function (x) { return String(x).trim() !== ''; })) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(function (x) { return String(x).trim() !== ''; })) rows.push(row);
    if (quoted) throw new Error('The CSV file has an unfinished quoted field.');
    if (!rows.length) throw new Error('The CSV file is empty.');
    var headers = rows.shift().map(function (h) { return String(h).replace(/^\ufeff/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); });
    return rows.map(function (cells, index) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = String(cells[i] == null ? '' : cells[i]).trim(); });
      obj._line = index + 2;
      return obj;
    });
  }
  function field(row, names) {
    for (var i = 0; i < names.length; i++) if (row[names[i]] != null && row[names[i]] !== '') return row[names[i]];
    return '';
  }
  function normalize(rows) {
    return rows.map(function (r) {
      return {
        _line: r._line,
        league: field(r, ['league','competition','league_name']),
        club: field(r, ['club','club_name','team']),
        player_name: field(r, ['player_name','player','full_name','name']),
        fifa_connect_id: field(r, ['fifa_id','fifa_connect_id','fifa_connect_id_number','fifa_player_id']),
        player_nin: field(r, ['national_id','player_nin','nin','national_identification_number']),
        date_of_birth: field(r, ['date_of_birth','dob','birth_date']),
        nationality: field(r, ['nationality','country']),
        position: field(r, ['position','playing_position']),
        jersey_number: field(r, ['jersey_number','shirt_number','squad_number']),
        photo_url: field(r, ['photo_url','image_url','player_photo'])
      };
    });
  }
  function validate(rows) {
    var errors = [], seen = {};
    rows.forEach(function (r) {
      if (!r.league || !r.club || !r.player_name || !r.fifa_connect_id || !r.player_nin) errors.push('Line ' + r._line + ': League, Club, Player Name, FIFA ID and National ID are required.');
      var key = r.fifa_connect_id.toLowerCase();
      if (key && seen[key]) errors.push('Line ' + r._line + ': duplicate FIFA ID also appears on line ' + seen[key] + '.');
      if (key) seen[key] = r._line;
      if (r.jersey_number && (!/^\d+$/.test(r.jersey_number) || Number(r.jersey_number) < 1 || Number(r.jersey_number) > 99)) errors.push('Line ' + r._line + ': jersey number must be between 1 and 99.');
      if (r.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth)) errors.push('Line ' + r._line + ': date of birth must use YYYY-MM-DD.');
      if (r.photo_url && !/^https:\/\//i.test(r.photo_url)) errors.push('Line ' + r._line + ': photo URL must start with https://.');
    });
    return errors;
  }
  function template() {
    var csv = 'League,Club,FIFA ID,Player Name,National ID,Date of Birth,Nationality,Position,Jersey Number,Photo URL\r\n' +
      '"Leone Rock Premier League","Bo Rangers","FIFA-EXAMPLE-001","Example Player","NIN-EXAMPLE-001","2000-01-15","Sierra Leone","Forward","9",""\r\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8'}));
    a.download = 'slfa-fifa-connect-player-import-template.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }
  function renderImportCentre() {
    var host = node('roleTools');
    if (!host || node('fifaConnectImportCentre')) return;
    var section = document.createElement('section');
    section.id = 'fifaConnectImportCentre';
    section.className = 'post';
    section.style.cssText = 'margin-top:24px;padding:20px;border:1px solid rgba(30,150,100,.35);border-radius:16px';
    section.innerHTML =
      '<h2 class="rt">FIFA Connect Player Import Centre</h2>' +
      '<p class="muted">Import the official player export supplied through SLFA\'s authorized FIFA Connect access. This imports registered players into the current SLFA app season; it does not connect to or modify FIFA Connect.</p>' +
      '<div class="btns"><button type="button" class="secondary" id="fciTemplate">Download CSV template</button></div>' +
      '<label for="fciFile">FIFA Connect CSV export</label><input id="fciFile" type="file" accept=".csv,text/csv">' +
      '<p class="muted">Required columns: League, Club, FIFA ID, Player Name, National ID. Optional: Date of Birth (YYYY-MM-DD), Nationality, Position, Jersey Number, Photo URL.</p>' +
      '<div class="btns"><button type="button" class="secondary" id="fciCheck" disabled>Validate and preview</button><button type="button" class="primary" id="fciImport" disabled>Import verified players</button></div>' +
      '<div id="fciMessage" class="status" role="status" aria-live="polite"></div>' +
      '<div id="fciPreview" class="muted"></div>' +
      '<h3>Recent import history</h3><div id="fciHistory" class="muted">Loading import history…</div>';
    host.appendChild(section);
    node('fciTemplate').addEventListener('click', template);
    node('fciFile').addEventListener('change', function () {
      lastRows = null; node('fciCheck').disabled = !this.files || !this.files[0];
      node('fciImport').disabled = true; node('fciPreview').textContent = '';
      message(this.files && this.files[0] ? 'File selected. Validate it before importing.' : '');
      lastFileName = this.files && this.files[0] ? this.files[0].name : '';
    });
    node('fciCheck').addEventListener('click', checkFile);
    node('fciImport').addEventListener('click', importFile);
    loadHistory();
  }
  function checkFile() {
    var file = node('fciFile').files && node('fciFile').files[0];
    if (!file) return;
    message('Reading and validating the export…');
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var rows = normalize(csvParse(String(reader.result || '')));
        var errors = validate(rows);
        if (!rows.length) errors.push('No player records were found.');
        lastRows = errors.length ? null : rows;
        node('fciImport').disabled = !lastRows;
        node('fciPreview').innerHTML = '<p><strong>' + rows.length + '</strong> player row(s) found.</p>' +
          (errors.length ? '<p><strong>Fix these issues before importing:</strong></p><ul>' + errors.slice(0,15).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' + (errors.length > 15 ? '<p>And ' + (errors.length-15) + ' more issue(s).</p>' : '') :
          '<p>Required fields and duplicate FIFA IDs passed local validation. The database will also verify each competition, club and current season before writing anything.</p><p><strong>Preview:</strong></p><div style="overflow-x:auto"><table><thead><tr><th>Competition</th><th>Club</th><th>Player</th><th>FIFA ID</th></tr></thead><tbody>' +
          rows.slice(0,8).map(function (r) { return '<tr><td>' + esc(r.league) + '</td><td>' + esc(r.club) + '</td><td>' + esc(r.player_name) + '</td><td>' + esc(r.fifa_connect_id) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' + (rows.length > 8 ? '<p>Showing first 8 of ' + rows.length + ' rows.</p>' : ''));
        message(errors.length ? errors.length + ' validation issue(s) found. No records imported.' : 'Validation passed. Review the preview, then import.');
      } catch (e) { lastRows = null; node('fciImport').disabled = true; message(e.message || 'Could not read this CSV file.', true); }
    };
    reader.onerror = function () { message('Could not read the selected file.', true); };
    reader.readAsText(file);
  }
  function importFile() {
    if (!lastRows || !lastRows.length) return;
    if (!window.confirm('Import ' + lastRows.length + ' FIFA Connect player record(s) into the current SLFA season? Existing matching FIFA IDs in the same club will be updated, not duplicated.')) return;
    node('fciImport').disabled = true;
    message('Importing player records securely…');
    var payload = lastRows.map(function (r) {
      return {
        league:r.league, club:r.club, player_name:r.player_name, fifa_connect_id:r.fifa_connect_id, player_nin:r.player_nin,
        date_of_birth:r.date_of_birth || null, nationality:r.nationality || null, position:r.position || null,
        jersey_number:r.jersey_number || null, photo_url:r.photo_url || null
      };
    });
    db.rpc('import_fifa_connect_players', {p_rows:payload, p_source_label:lastFileName}).then(function (res) {
      if (res.error) { message('Import failed. No partial import was saved. ' + res.error.message, true); node('fciImport').disabled = false; return; }
      var data = res.data || {};
      message('Import completed. ' + (data.inserted || 0) + ' new player(s), ' + (data.updated || 0) + ' updated player(s). Batch: ' + (data.batch_id || 'recorded') + '.');
      lastRows = null; node('fciFile').value = ''; node('fciCheck').disabled = true; node('fciImport').disabled = true;
      node('fciPreview').textContent = 'Import batch completed successfully.';
      loadHistory();
    }).catch(function (e) { message('Import failed: ' + (e.message || 'Unexpected error.'), true); node('fciImport').disabled = false; });
  }
  function loadHistory() {
    if (!node('fciHistory')) return;
    db.from('player_import_batches').select('id, imported_at, source_label, competition_count, row_count, inserted_count, updated_count').order('imported_at', {ascending:false}).limit(10)
      .then(function (r) {
        if (r.error) { node('fciHistory').textContent = 'Import history will appear after the database migration is installed.'; return; }
        var rows = r.data || [];
        node('fciHistory').innerHTML = rows.length ? rows.map(function (x) {
          return '<div style="padding:10px 0;border-bottom:1px solid rgba(120,140,150,.2)"><strong>' + esc(x.source_label || 'FIFA Connect export') + '</strong><div class="muted">' +
            esc(new Date(x.imported_at).toLocaleString()) + ' · ' + esc(x.row_count) + ' rows · ' + esc(x.inserted_count) + ' new · ' + esc(x.updated_count) + ' updated</div></div>';
        }).join('') : 'No player imports have been recorded yet.';
      });
  }
  window.slfaRenderRole = function (profile) {
    originalRender(profile);
    if (String(profile && profile.system_role || '').toUpperCase() === 'SUPER_ADMIN') renderImportCentre();
  };
})();