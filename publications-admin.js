/* SLFA Digital Publications staff authoring and approval workflow.
   The database RLS policies are authoritative; this UI only exposes controls
   appropriate to the active signed-in role. */
(function () {
  'use strict';
  var db = window.slfaDb;
  var root = document.getElementById('roleTools');
  if (!db || !root) return;

  var activeProfile = null, mounted = false, checking = false, timer = null, panel = null;
  var reviewer = false;
  var DOC_TYPES = {
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
  function say(message, bad) {
    var status = $('slfaPubStatus');
    if (status) {
      status.textContent = message || '';
      status.classList.toggle('is-error', !!bad);
    }
  }
  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('This browser cannot create a secure file identifier. Update your browser and try again.');
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var h = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function fmtDate(value) {
    if (!value) return 'Not set';
    var d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { timeZone: 'Africa/Freetown', day: 'numeric', month: 'short', year: 'numeric' }) : String(value);
  }
  function statusLabel(value) {
    return { DRAFT:'Draft', SUBMITTED:'Awaiting review', RETURNED:'Returned for changes', PUBLISHED:'Published', REJECTED:'Rejected', ARCHIVED:'Archived' }[value] || value;
  }
  function typeLabel(value) { return DOC_TYPES[value] || 'Publication'; }
  function isAuthor(row) { return !!activeProfile && String(row.created_by) === String(activeProfile.id); }

  function mount() {
    if (mounted || !activeProfile || !root.isConnected) return;
    var role = String(activeProfile.system_role || '').toUpperCase();
    if (['MEDIA_OFFICER','SUPER_ADMIN','DEVELOPER'].indexOf(role) === -1) return;
    reviewer = role === 'SUPER_ADMIN' || role === 'DEVELOPER';
    panel = document.createElement('section');
    panel.className = 'card slfa-pub-admin';
    panel.id = 'slfaPublicationsAdmin';
    panel.innerHTML =
      '<div class="spa-heading"><div><span class="spa-eyebrow">SLFA · PUBLIC DOCUMENTS</span><h2>Digital Publications Management</h2>' +
      '<p>Prepare PDF publications, submit them for approval and manage documents already published to the public library.</p></div>' +
      '<span class="spa-lock" aria-hidden="true">PDF</span></div>' +
      '<div class="spa-info"><strong>Publishing controls</strong><span>New documents remain private until a different authorised reviewer approves them. Only published documents receive public download links.</span></div>' +
      '<div class="spa-form">' +
      '<h3>Prepare a publication</h3>' +
      '<label for="slfaPubTitle">Document title</label><input id="slfaPubTitle" type="text" maxlength="180" placeholder="Enter the official document title">' +
      '<div class="spa-grid">' +
      '<label for="slfaPubType">Document type<select id="slfaPubType">' + Object.keys(DOC_TYPES).map(function (k) { return '<option value="' + k + '">' + esc(DOC_TYPES[k]) + '</option>'; }).join('') + '</select></label>' +
      '<label for="slfaPubNumber">Reference number (optional)<input id="slfaPubNumber" type="text" maxlength="80" placeholder="e.g. SLFA/COMP/2026/01"></label>' +
      '<label for="slfaPubCompetition">Competition<select id="slfaPubCompetition"><option value="">General / not competition-specific</option></select></label>' +
      '<label for="slfaPubSeason">Season<select id="slfaPubSeason"><option value="">Not season-specific</option></select></label>' +
      '<label for="slfaPubEffective">Effective date (optional)<input id="slfaPubEffective" type="date"></label>' +
      '<label for="slfaPubExpires">Expiry date (optional)<input id="slfaPubExpires" type="date"></label>' +
      '</div>' +
      '<label for="slfaPubSummary">Summary / description</label><textarea id="slfaPubSummary" rows="3" maxlength="3000" placeholder="Briefly describe the purpose and scope of this document."></textarea>' +
      '<label for="slfaPubFile">PDF document · maximum 25 MB</label><input id="slfaPubFile" type="file" accept=".pdf,application/pdf">' +
      '<p class="spa-file-help">Only PDF files are accepted. Drafts and submissions are stored privately until approval.</p>' +
      '<div class="spa-actions"><button type="button" class="secondary" id="slfaPubDraft">Save draft</button><button type="button" class="primary" id="slfaPubSubmit">Submit for approval</button></div>' +
      '<p id="slfaPubStatus" class="spa-status" role="status" aria-live="polite"></p></div>' +
      (reviewer ? '<div class="spa-review"><h3>Review queue</h3><p class="spa-muted">Review submitted documents. A different Super Admin or Developer must approve a document than the person who created it.</p><div id="slfaPubQueue" class="spa-doc-list">Loading submissions…</div></div>' : '') +
      '<div class="spa-library"><div class="spa-library-head"><div><h3>' + (reviewer ? 'All publications' : 'My publications') + '</h3><p class="spa-muted">' + (reviewer ? 'All drafts, submissions, published records and archived documents.' : 'Your drafts and submissions, including reviewer feedback.') + '</p></div><button type="button" class="secondary" id="slfaPubRefresh">Refresh</button></div>' +
      '<div id="slfaPubLibrary" class="spa-doc-list">Loading publications…</div></div>';
    root.appendChild(panel);
    mounted = true;
    wireForm();
    loadOptions();
    loadDocuments();
  }

  function syncMount() {
    if (checking) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      if (checking || !document.getElementById('portalArea') || document.getElementById('portalArea').hidden || root.children.length === 0) return;
      checking = true;
      db.auth.getUser().then(function (u) {
        if (!u.data || !u.data.user) {
          activeProfile = null;
          if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
          panel = null; mounted = false;
          return;
        }
        return db.from('user_profiles').select('id,system_role,status,full_name,email').eq('id', u.data.user.id).maybeSingle().then(function (r) {
          if (r.error || !r.data || String(r.data.status).toLowerCase() !== 'active') return;
          activeProfile = r.data;
          mount();
        });
      }).catch(function () {}).then(function () { checking = false; });
    }, 80);
  }

  function wireForm() {
    if (!$('slfaPubDraft')) return;
    $('slfaPubDraft').addEventListener('click', function () { saveDocument('DRAFT'); });
    $('slfaPubSubmit').addEventListener('click', function () { saveDocument('SUBMITTED'); });
    $('slfaPubRefresh').addEventListener('click', loadDocuments);
    loadOptions();
  }

  function loadOptions() {
    if (!$('slfaPubCompetition')) return;
    Promise.all([
      db.from('leagues').select('id,name').order('sort_order', { ascending: true }),
      db.from('seasons').select('id,name,start_date').order('start_date', { ascending: false })
    ]).then(function (r) {
      if (r[0].error) return;
      $('slfaPubCompetition').innerHTML = '<option value="">General / not competition-specific</option>' +
        (r[0].data || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('');
      if (r[1].error) return;
      $('slfaPubSeason').innerHTML = '<option value="">Not season-specific</option>' +
        (r[1].data || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('');
    });
  }

  function saveDocument(status) {
    var title = $('slfaPubTitle').value.trim();
    var file = $('slfaPubFile').files && $('slfaPubFile').files[0];
    var summary = $('slfaPubSummary').value.trim();
    var effective = $('slfaPubEffective').value || null;
    var expires = $('slfaPubExpires').value || null;
    if (title.length < 4) { say('Enter a title with at least four characters.', true); return; }
    if (!file) { say('Choose the PDF document first.', true); return; }
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) { say('Only PDF documents are accepted.', true); return; }
    if (file.size < 1 || file.size > 25 * 1024 * 1024) { say('The PDF must be smaller than or equal to 25 MB.', true); return; }
    if (summary.length > 3000) { say('Keep the summary within 3,000 characters.', true); return; }
    if (effective && expires && expires < effective) { say('The expiry date cannot be earlier than the effective date.', true); return; }
    if (!activeProfile) { say('Your staff session has expired. Sign in again.', true); return; }
    var draftButton = $('slfaPubDraft'), submitButton = $('slfaPubSubmit');
    draftButton.disabled = true; submitButton.disabled = true;
    say(status === 'SUBMITTED' ? 'Uploading PDF and submitting for review…' : 'Uploading PDF and saving draft…', false);
    var cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-160) || 'publication.pdf';
    var path = activeProfile.id + '/' + uuid() + '.pdf';
    db.storage.from('slfa-publications').upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: 'application/pdf'
    }).then(function (up) {
      if (up.error) throw up.error;
      var payload = {
        title: title,
        document_type: $('slfaPubType').value,
        summary: summary,
        document_number: $('slfaPubNumber').value.trim() || null,
        competition_id: $('slfaPubCompetition').value ? Number($('slfaPubCompetition').value) : null,
        season_id: $('slfaPubSeason').value ? Number($('slfaPubSeason').value) : null,
        effective_date: effective,
        expires_on: expires,
        file_name: cleanName,
        storage_path: path,
        mime_type: 'application/pdf',
        file_size_bytes: file.size,
        status: status,
        created_by: activeProfile.id,
        submitted_at: status === 'SUBMITTED' ? new Date().toISOString() : null
      };
      return db.from('slfa_publications').insert(payload).select('id').single().then(function (saved) {
        if (saved.error) {
          return db.storage.from('slfa-publications').remove([path]).then(function () { throw saved.error; });
        }
        return saved;
      });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      $('slfaPubTitle').value = '';
      $('slfaPubNumber').value = '';
      $('slfaPubSummary').value = '';
      $('slfaPubEffective').value = '';
      $('slfaPubExpires').value = '';
      $('slfaPubFile').value = '';
      $('slfaPubCompetition').value = '';
      $('slfaPubSeason').value = '';
      say(status === 'SUBMITTED' ? 'Document uploaded privately and submitted. It will appear publicly only after approval.' : 'Draft saved privately. It is not visible in the public library.', false);
      loadDocuments();
    }).catch(function (error) {
      say(error && error.message ? error.message : 'The document could not be saved. Check your connection and file size.', true);
    }).then(function () { draftButton.disabled = false; submitButton.disabled = false; });
  }

  function rowMeta(row) {
    var comp = row.leagues && row.leagues.name || '';
    var season = row.seasons && row.seasons.name || '';
    return [comp, season, row.document_number ? 'Ref. ' + row.document_number : ''].filter(Boolean).join(' · ');
  }
  function rowMarkup(row, view) {
    var own = isAuthor(row);
    var note = row.review_note ? '<p class="spa-review-note"><strong>Reviewer note:</strong> ' + esc(row.review_note) + '</p>' : '';
    var meta = rowMeta(row);
    var date = row.published_at || row.submitted_at || row.created_at;
    var actions = '';
    if (view === 'queue' && row.status === 'SUBMITTED') {
      if (own) actions = '<span class="spa-independent-review">A different reviewer must approve this document.</span>';
      else actions = '<div class="spa-row-actions"><button type="button" class="primary" data-pub-action="publish" data-pub-id="' + esc(row.id) + '">Approve &amp; publish</button>' +
        '<button type="button" class="secondary" data-pub-action="return" data-pub-id="' + esc(row.id) + '">Return for changes</button>' +
        '<button type="button" class="secondary" data-pub-action="reject" data-pub-id="' + esc(row.id) + '">Reject</button></div>';
    } else if (view === 'library' && row.status === 'PUBLISHED' && reviewer && !own) {
      actions = '<div class="spa-row-actions"><button type="button" class="secondary" data-pub-action="archive" data-pub-id="' + esc(row.id) + '">Withdraw from public library</button></div>';
    } else if (view === 'library' && row.status === 'ARCHIVED' && reviewer && !own) {
      actions = '<div class="spa-row-actions"><button type="button" class="secondary" data-pub-action="resubmit" data-pub-id="' + esc(row.id) + '">Return to review queue</button></div>';
    } else if (view === 'library' && own && ['DRAFT','RETURNED','REJECTED'].indexOf(row.status) !== -1) {
      actions = '<div class="spa-row-actions">' +
        (row.status === 'RETURNED' ? '<button type="button" class="secondary" data-pub-action="resubmit-own" data-pub-id="' + esc(row.id) + '">Resubmit without changes</button>' : '') +
        '<button type="button" class="secondary" data-pub-action="delete" data-pub-id="' + esc(row.id) + '">Delete draft</button></div>';
    }
    return '<article class="spa-doc-row" data-pub-row="' + esc(row.id) + '">' +
      '<div class="spa-doc-top"><div><span class="spa-doc-type">' + esc(typeLabel(row.document_type)) + '</span><h4>' + esc(row.title) + '</h4></div>' +
      '<span class="spa-doc-status spa-status-' + esc(String(row.status).toLowerCase()) + '">' + esc(statusLabel(row.status)) + '</span></div>' +
      (meta ? '<p class="spa-doc-meta">' + esc(meta) + '</p>' : '') +
      '<p class="spa-doc-meta">' + esc(row.file_name) + ' · ' + esc((Number(row.file_size_bytes) / 1048576).toFixed(1)) + ' MB · ' + esc(fmtDate(date)) + '</p>' +
      (row.summary ? '<p class="spa-doc-summary">' + esc(row.summary) + '</p>' : '') + note + actions + '</article>';
  }

  function loadDocuments() {
    var library = $('slfaPubLibrary'), queue = $('slfaPubQueue');
    if (!library) return;
    library.textContent = 'Loading publications…';
    if (queue) queue.textContent = 'Loading review queue…';
    db.from('slfa_publications')
      .select('id,title,document_type,summary,document_number,competition_id,season_id,file_name,storage_path,file_size_bytes,status,review_note,created_by,created_at,submitted_at,published_at,leagues(name),seasons(name)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(function (r) {
        if (r.error) {
          library.textContent = 'Publications could not be loaded. Check that your account is authorised and the database connection is available.';
          if (queue) queue.textContent = 'The review queue is unavailable.';
          say(r.error.message, true);
          return;
        }
        var rows = r.data || [];
        library.innerHTML = rows.length ? rows.map(function (x) { return rowMarkup(x, 'library'); }).join('') :
          '<p class="spa-empty">No publications have been created yet.</p>';
        if (queue) {
          var pending = rows.filter(function (x) { return x.status === 'SUBMITTED'; });
          queue.innerHTML = pending.length ? pending.map(function (x) { return rowMarkup(x, 'queue'); }).join('') :
            '<p class="spa-empty">No documents are waiting for review.</p>';
        }
        panel.querySelectorAll('[data-pub-action]').forEach(function (button) {
          button.addEventListener('click', function () {
            var row = rows.filter(function (x) { return String(x.id) === String(button.dataset.pubId); })[0];
            if (row) handleAction(row, button.dataset.pubAction, button);
          });
        });
      });
  }

  function handleAction(row, action, button) {
    if (button) button.disabled = true;
    var update = { reviewed_by: activeProfile.id, reviewed_at: new Date().toISOString() };
    var status = '';
    if (action === 'publish') {
      if (!confirm('Approve and publish "' + row.title + '" to the public Digital Publications Centre?')) { if (button) button.disabled = false; return; }
      status = 'PUBLISHED'; update.published_at = new Date().toISOString(); update.review_note = null;
    } else if (action === 'return') {
      var returnNote = window.prompt('Explain what needs to be corrected before publication (at least 5 characters).');
      if (returnNote == null || returnNote.trim().length < 5) { say('A reviewer note of at least five characters is required.', true); if (button) button.disabled = false; return; }
      status = 'RETURNED'; update.review_note = returnNote.trim();
    } else if (action === 'reject') {
      var rejectNote = window.prompt('Give the reason for rejecting this document (at least 5 characters).');
      if (rejectNote == null || rejectNote.trim().length < 5) { say('A rejection reason of at least five characters is required.', true); if (button) button.disabled = false; return; }
      status = 'REJECTED'; update.review_note = rejectNote.trim();
    } else if (action === 'archive') {
      if (!confirm('Withdraw "' + row.title + '" from the public library? The private PDF will be retained in the database storage for staff access.')) { if (button) button.disabled = false; return; }
      status = 'ARCHIVED'; update.review_note = 'Withdrawn from public library by an authorised reviewer.';
    } else if (action === 'resubmit' || action === 'resubmit-own') {
      if (!confirm('Return "' + row.title + '" to the review queue?')) { if (button) button.disabled = false; return; }
      status = 'SUBMITTED'; update.submitted_at = new Date().toISOString(); update.review_note = null;
      if (action === 'resubmit-own') { delete update.reviewed_by; delete update.reviewed_at; }
    } else if (action === 'delete') {
      if (!confirm('Permanently delete this unpublished document and its private PDF?')) { if (button) button.disabled = false; return; }
      db.storage.from('slfa-publications').remove([row.storage_path]).then(function (removed) {
        if (removed.error) throw removed.error;
        return db.from('slfa_publications').delete().eq('id', row.id).select('id').maybeSingle();
      }).then(function (removedRow) {
        if (removedRow.error) throw removedRow.error;
        say('Unpublished document deleted.', false); loadDocuments();
      }).catch(function (e) { say(e.message || 'The document could not be deleted.', true); if (button) button.disabled = false; });
      return;
    }
    update.status = status;
    db.from('slfa_publications').update(update).eq('id', row.id).select('id').maybeSingle().then(function (result) {
      if (result.error) throw result.error;
      if (!result.data) throw new Error('No document was updated. Your role may not have permission for this review action.');
      say(status === 'PUBLISHED' ? 'Document approved and published. It is now available in the public library.' :
        status === 'RETURNED' ? 'Document returned to its author with review instructions.' :
        status === 'REJECTED' ? 'Document rejected. It remains private.' :
        status === 'ARCHIVED' ? 'Document withdrawn from the public library. The private PDF is retained.' :
        'Document returned to the review queue.', false);
      loadDocuments();
    }).catch(function (e) {
      say(e.message || 'The review action failed.', true);
      if (button) button.disabled = false;
    });
  }

  var observer = new MutationObserver(syncMount);
  observer.observe(root, { childList: true, subtree: true });
  if (db.auth && db.auth.onAuthStateChange) {
    db.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') {
        activeProfile = null; mounted = false;
        if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
        panel = null;
      } else syncMount();
    });
  }
  syncMount();
})();