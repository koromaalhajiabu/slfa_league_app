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
      if (!r.league || !r.club || !r.player_name || !r.fifa_connect_id || !r.player_nin || !r.date_of_birth) errors.push('Line ' + r._line + ': League, Club, Player Name, FIFA ID, National ID and Date of Birth are required.');
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
      '<p class="muted">Required columns: League, Club, FIFA ID, Player Name, National ID, Date of Birth (YYYY-MM-DD). Optional: Nationality, Position, Jersey Number, Photo URL.</p>' +
      '<div class="btns"><button type="button" class="secondary" id="fciCheck" disabled>Validate and preview</button><button type="button" class="primary" id="fciImport" disabled>Import verified players</button></div>' +
      '<div id="fciMessage" class="status" role="status" aria-live="polite"></div>' +
      '<div id="fciPreview" class="muted"></div>' +
      '<h3>Recent import history</h3><div id="fciHistory" class="muted">Loading import history…</div>' +
      '<section class="player-photo-upload" aria-labelledby="playerPhotoHeading">' +
        '<h3 id="playerPhotoHeading">Player Photo Upload</h3>' +
        '<p class="muted">Choose an existing player, select a portrait from your phone or computer, preview it and save it to the player profile. High-resolution images are automatically resized before upload.</p>' +
        '<label for="pPhotoSearch">Find a player</label><input id="pPhotoSearch" type="search" autocomplete="off" placeholder="Search player name, club or shirt number">' +
        '<label for="pPhotoPlayer">Player record</label><select id="pPhotoPlayer"><option value="">Loading registered players…</option></select>' +
        '<div class="player-photo-preview"><img id="pPhotoPreview" alt="Player photo preview" hidden><span id="pPhotoPreviewNote">Choose a player to see the current portrait.</span></div>' +
        '<label for="pPhotoFile">Player portrait (JPG, PNG or WebP)</label><input id="pPhotoFile" type="file" accept="image/jpeg,image/png,image/webp">' +
        '<p class="muted" id="pPhotoFileInfo">Maximum original image size: 12 MB. The app compresses it to fit the 2 MB storage limit.</p>' +
        '<div class="btns"><button type="button" class="primary" id="pPhotoUpload" disabled>Upload and save player photo</button><button type="button" class="secondary" id="pPhotoRefresh">Refresh player list</button></div>' +
        '<div id="pPhotoMessage" class="status" role="status" aria-live="polite"></div>' +
      '</section>';
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
    node('pPhotoSearch').addEventListener('input', renderPlayerPhotoOptions);
    node('pPhotoPlayer').addEventListener('change', showSelectedPlayerPhoto);
    node('pPhotoFile').addEventListener('change', previewChosenPlayerPhoto);
    node('pPhotoUpload').addEventListener('click', uploadPlayerPhoto);
    node('pPhotoRefresh').addEventListener('click', loadPlayerPhotoOptions);
    loadHistory();
    loadPlayerPhotoOptions();
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
      loadPlayerPhotoOptions();
    }).catch(function (e) { message('Import failed: ' + (e.message || 'Unexpected error.'), true); node('fciImport').disabled = false; });
  }
  // Player portraits are stored in the existing public member-photos bucket.
  // The database Storage policies restrict player portrait writes to active Super Admin accounts.
  var playerPhotoRows = [], playerPhotoPreviewUrl = null, playerPhotoBusy = false;
  var PLAYER_PHOTO_COMPRESSED_LIMIT = 1800 * 1024;
  var PLAYER_PHOTO_SOURCE_LIMIT = 12 * 1024 * 1024;

  function playerPhotoMessage(text, bad) {
    var el = node('pPhotoMessage');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = bad ? '#b42318' : 'inherit';
  }
  function releasePlayerPhotoPreview() {
    if (playerPhotoPreviewUrl) {
      URL.revokeObjectURL(playerPhotoPreviewUrl);
      playerPhotoPreviewUrl = null;
    }
  }
  function selectedPlayerPhotoRow() {
    var id = node('pPhotoPlayer') && node('pPhotoPlayer').value;
    return playerPhotoRows.find(function (p) { return String(p.id) === String(id); }) || null;
  }
  function playerPhotoLabel(p) {
    var club = p.league_clubs && p.league_clubs.club_name ? p.league_clubs.club_name : 'Club not recorded';
    var shirt = p.jersey_number ? ' · #' + p.jersey_number : '';
    var registration = p.registration_status || 'Unspecified';
    return p.player_name + ' · ' + club + shirt + ' · ' + registration;
  }
  function showSelectedPlayerPhoto() {
    var p = selectedPlayerPhotoRow(), img = node('pPhotoPreview'), note = node('pPhotoPreviewNote');
    var file = node('pPhotoFile').files && node('pPhotoFile').files[0];
    node('pPhotoUpload').disabled = !p || !file || playerPhotoBusy;
    if (file && playerPhotoPreviewUrl) return;
    if (p && p.photo_url) {
      img.onerror = function () {
        img.hidden = true;
        note.textContent = 'A photo URL is saved, but the image could not be previewed.';
      };
      img.src = p.photo_url;
      img.hidden = false;
      note.textContent = 'Current player portrait';
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      note.textContent = p ? 'No portrait has been uploaded for this player.' : 'Choose a player to see the current portrait.';
    }
  }
  function renderPlayerPhotoOptions() {
    var select = node('pPhotoPlayer');
    if (!select) return;
    var previous = select.value;
    var query = String(node('pPhotoSearch').value || '').trim().toLowerCase();
    var filtered = playerPhotoRows.filter(function (p) {
      if (!query) return true;
      return [p.player_name, p.league_clubs && p.league_clubs.club_name, p.jersey_number, p.registration_status]
        .join(' ').toLowerCase().indexOf(query) !== -1;
    });
    select.innerHTML = '<option value="">Choose a registered player…</option>' + filtered.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(playerPhotoLabel(p)) + '</option>';
    }).join('');
    if (filtered.some(function (p) { return String(p.id) === String(previous); })) select.value = previous;
    showSelectedPlayerPhoto();
    if (!filtered.length) playerPhotoMessage(query ? 'No player matches that search.' : 'No player records are available yet.', false);
  }
  function loadPlayerPhotoOptions() {
    var select = node('pPhotoPlayer');
    if (!select) return;
    select.innerHTML = '<option value="">Loading registered players…</option>';
    playerPhotoMessage('Loading player records…', false);
    db.from('club_squad')
      .select('id,player_name,jersey_number,photo_url,registration_status,status,league_clubs(club_name)')
      .order('player_name', {ascending:true})
      .limit(1000)
      .then(function (r) {
        if (r.error) throw r.error;
        playerPhotoRows = r.data || [];
        node('pPhotoSearch').value = '';
        renderPlayerPhotoOptions();
        playerPhotoMessage(playerPhotoRows.length + ' player record(s) ready. Select a player to upload or replace a portrait.', false);
      })
      .catch(function (e) {
        select.innerHTML = '<option value="">Player list unavailable</option>';
        playerPhotoMessage(e.message || 'Could not load player records.', true);
      });
  }
  function previewChosenPlayerPhoto() {
    var input = node('pPhotoFile'), file = input.files && input.files[0];
    var img = node('pPhotoPreview'), note = node('pPhotoPreviewNote');
    releasePlayerPhotoPreview();
    if (!file) {
      node('pPhotoFileInfo').textContent = 'Maximum original image size: 12 MB. The app compresses it to fit the 2 MB storage limit.';
      showSelectedPlayerPhoto();
      return;
    }
    if (['image/jpeg','image/png','image/webp'].indexOf(file.type) === -1) {
      input.value = '';
      node('pPhotoUpload').disabled = true;
      playerPhotoMessage('Choose a JPG, PNG or WebP image.', true);
      showSelectedPlayerPhoto();
      return;
    }
    if (file.size > PLAYER_PHOTO_SOURCE_LIMIT) {
      input.value = '';
      node('pPhotoUpload').disabled = true;
      playerPhotoMessage('The selected image is larger than 12 MB. Choose a smaller photo.', true);
      showSelectedPlayerPhoto();
      return;
    }
    playerPhotoPreviewUrl = URL.createObjectURL(file);
    img.src = playerPhotoPreviewUrl;
    img.hidden = false;
    note.textContent = 'New photo preview';
    node('pPhotoFileInfo').textContent = file.name + ' · ' + (file.size / 1048576).toFixed(2) + ' MB before compression.';
    node('pPhotoUpload').disabled = !selectedPlayerPhotoRow() || playerPhotoBusy;
    playerPhotoMessage('Preview ready. Upload to save this portrait to the selected player.', false);
  }
  function compressPlayerPhoto(file, playerId) {
    return new Promise(function (resolve, reject) {
      var sourceUrl = URL.createObjectURL(file), image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(sourceUrl);
        var width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
        if (!width || !height) { reject(new Error('The selected image could not be read.')); return; }
        var scale = Math.min(1, 1280 / Math.max(width, height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        var context = canvas.getContext('2d');
        if (!context) { reject(new Error('This browser cannot prepare the selected image.')); return; }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        var qualities = [0.88,0.82,0.76,0.70,0.64,0.58];
        function encode(index) {
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('The browser could not compress this photo.')); return; }
            if (blob.size <= PLAYER_PHOTO_COMPRESSED_LIMIT) {
              resolve(new File([blob], 'player-' + playerId + '.jpg', {type:'image/jpeg', lastModified:Date.now()}));
              return;
            }
            if (index >= qualities.length - 1) {
              reject(new Error('This photo could not be compressed below the 2 MB storage limit.'));
              return;
            }
            encode(index + 1);
          }, 'image/jpeg', qualities[index]);
        }
        encode(0);
      };
      image.onerror = function () {
        URL.revokeObjectURL(sourceUrl);
        reject(new Error('The selected image is not a supported or readable photo.'));
      };
      image.src = sourceUrl;
    });
  }
  function playerPhotoToken() {
    return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() :
      Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function uploadPlayerPhoto() {
    if (playerPhotoBusy) return;
    var player = selectedPlayerPhotoRow();
    var file = node('pPhotoFile').files && node('pPhotoFile').files[0];
    if (!player) { playerPhotoMessage('Choose a player record first.', true); return; }
    if (!file) { playerPhotoMessage('Choose a player photo first.', true); return; }
    if (['image/jpeg','image/png','image/webp'].indexOf(file.type) === -1 || file.size > PLAYER_PHOTO_SOURCE_LIMIT) {
      playerPhotoMessage('Choose a JPG, PNG or WebP photo no larger than 12 MB.', true); return;
    }
    playerPhotoBusy = true;
    node('pPhotoUpload').disabled = true;
    playerPhotoMessage('Checking your account and preparing the photo…', false);
    var uploadedPath = null;
    db.auth.getUser().then(function (auth) {
      if (!auth.data || !auth.data.user) throw new Error('Your session has expired. Sign in again.');
      return db.from('user_profiles').select('system_role,status').eq('id', auth.data.user.id).maybeSingle()
        .then(function (profile) {
          var p = profile.data || {};
          if (profile.error || String(p.status).toLowerCase() !== 'active' ||
              String(p.system_role).toUpperCase() !== 'SUPER_ADMIN') {
            throw new Error('Only an active Super Admin can upload player portraits.');
          }
          playerPhotoMessage('Compressing and uploading the portrait…', false);
          return compressPlayerPhoto(file, player.id).then(function (compressed) {
            var path = 'squad/' + auth.data.user.id + '/' + player.id + '-' + Date.now() + '-' + playerPhotoToken() + '.jpg';
            return db.storage.from('member-photos').upload(path, compressed, {
              cacheControl:'31536000', upsert:false, contentType:'image/jpeg'
            }).then(function (up) {
              if (up.error) throw up.error;
              uploadedPath = up.data.path;
              var publicUrl = db.storage.from('member-photos').getPublicUrl(uploadedPath).data.publicUrl;
              return db.from('club_squad').update({photo_url:publicUrl}).eq('id', Number(player.id)).select('id').maybeSingle()
                .then(function (saved) {
                  if (saved.error || !saved.data) {
                    var reason = saved.error || new Error('The player record was not updated. Check your player permissions and try again.');
                    return db.storage.from('member-photos').remove([uploadedPath]).then(function () {
                      uploadedPath = null;
                      throw reason;
                    }, function () {
                      uploadedPath = null;
                      throw reason;
                    });
                  }
                  uploadedPath = null;
                  return publicUrl;
                });
            });
          });
        });
    }).then(function (publicUrl) {
      player.photo_url = publicUrl;
      node('pPhotoFile').value = '';
      node('pPhotoFileInfo').textContent = 'Portrait saved. Select another photo to replace it.';
      releasePlayerPhotoPreview();
      showSelectedPlayerPhoto();
      playerPhotoMessage('Player photo uploaded and saved successfully. The public player directory and profile will use the new portrait.', false);
    }).catch(function (e) {
      if (uploadedPath) {
        return db.storage.from('member-photos').remove([uploadedPath]).catch(function () {}).then(function () {
          playerPhotoMessage(e.message || 'Player photo upload failed.', true);
        });
      }
      playerPhotoMessage(e.message || 'Player photo upload failed.', true);
    }).finally(function () {
      playerPhotoBusy = false;
      node('pPhotoUpload').disabled = !(selectedPlayerPhotoRow() && node('pPhotoFile').files && node('pPhotoFile').files[0]);
    });
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