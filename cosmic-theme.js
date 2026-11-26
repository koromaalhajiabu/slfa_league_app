/* SLFA 2026 appearance system.
   Global palette is readable to the public but writable only through the
   existing app_settings RLS policy for active DEVELOPER accounts. */
(function () {
  'use strict';

  var PRESETS = [
    { value: 'night-sky', label: 'Night Sky' },
    { value: 'emerald-prestige', label: 'Emerald Prestige' },
    { value: 'royal-amethyst', label: 'Royal Amethyst' },
    { value: 'obsidian-gold', label: 'Obsidian Gold' },
    { value: 'arctic-silver', label: 'Arctic Silver' },
    { value: 'crimson-elite', label: 'Crimson Elite' },
    { value: 'custom', label: 'Custom colour' }
  ];
  var GLOBAL_CACHE_KEY = 'slfa_global_appearance_v1';
  var CONFIG_KEY = 'appearance_config';
  var DEFAULT_ACCENT = '#62d7ff';
  var SKY_TIME_ZONE = 'Africa/Freetown';
  var db = null;
  var current = { palette: 'night-sky', custom_accent: DEFAULT_ACCENT };
  var saving = false;

  function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function safeHex(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : DEFAULT_ACCENT; }
  function validPreset(value) {
    return PRESETS.some(function (p) { return p.value === value; }) ? value : 'night-sky';
  }
  function hexToRgba(hex, alpha) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return 'rgba(98,215,255,' + alpha + ')';
    return 'rgba(' + parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16) + ',' + alpha + ')';
  }
  function getDb() {
    if (window.slfaDb) return window.slfaDb;
    if (window.supabase && window.SLFA_CONFIG && window.SLFA_CONFIG.supabaseUrl && window.SLFA_CONFIG.supabasePublishableKey) {
      try {
        window.slfaDb = window.supabase.createClient(window.SLFA_CONFIG.supabaseUrl, window.SLFA_CONFIG.supabasePublishableKey, {
          auth: { persistSession: true, autoRefreshToken: true }
        });
        return window.slfaDb;
      } catch (e) {}
    }
    return null;
  }
  function applyPreset(preset, accent) {
    current.palette = validPreset(preset);
    current.custom_accent = safeHex(accent || current.custom_accent);
    document.documentElement.setAttribute('data-palette', current.palette);
    if (current.palette === 'custom') {
      document.documentElement.style.setProperty('--slfa-accent', current.custom_accent);
      document.documentElement.style.setProperty('--slfa-accent-2', current.custom_accent);
      document.documentElement.style.setProperty('--slfa-glow', hexToRgba(current.custom_accent, .22));
      document.documentElement.style.setProperty('--slfa-line', hexToRgba(current.custom_accent, .25));
    } else {
      ['--slfa-accent','--slfa-accent-2','--slfa-glow','--slfa-line'].forEach(function (v) {
        document.documentElement.style.removeProperty(v);
      });
    }
    updateThemeColour();
    return current;
  }
  function updateThemeColour() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta || document.documentElement.getAttribute('data-theme') === 'light') return;
    var map = {
      'night-sky':'#020817',
      'emerald-prestige':'#063328',
      'royal-amethyst':'#21113d',
      'obsidian-gold':'#211b10',
      'arctic-silver':'#11283e',
      'crimson-elite':'#2a1120'
    };
    meta.setAttribute('content', current.palette === 'custom' ? current.custom_accent : (map[current.palette] || '#020817'));
  }
  function configFromValue(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      palette: validPreset(value.palette),
      custom_accent: safeHex(value.custom_accent)
    };
  }
  function loadGlobalTheme() {
    if (!db) return Promise.resolve(false);
    return db.from('app_settings').select('value').eq('key', CONFIG_KEY).maybeSingle().then(function (res) {
      if (res.error || !res.data) return false;
      var value = configFromValue(res.data.value);
      if (!value) return false;
      current = value;
      safeSet(GLOBAL_CACHE_KEY, JSON.stringify(value));
      applyPreset(value.palette, value.custom_accent);
      syncControls();
      return true;
    }).catch(function () { return false; });
  }
  function syncControls() {
    var select = document.getElementById('slfaThemeSelect');
    var picker = document.getElementById('slfaAccentColor');
    if (select) select.value = current.palette;
    if (picker) picker.value = current.custom_accent;
  }
  function setStatus(message, error) {
    var el = document.getElementById('slfaThemeStatus');
    if (!el) return;
    el.textContent = message;
    el.setAttribute('data-error', error ? 'true' : 'false');
  }
  function saveGlobalTheme() {
    if (!db || saving) return;
    saving = true;
    setStatus('Saving system theme…', false);
    var payload = {
      key: CONFIG_KEY,
      value: { palette: current.palette, custom_accent: current.custom_accent }
    };
    db.from('app_settings').upsert(payload, { onConflict: 'key' }).select('key,value').single().then(function (res) {
      if (res.error) {
        setStatus('Could not save. Check that this is your active Developer account, then try again.', true);
        loadGlobalTheme().then(syncControls);
        return;
      }
      var saved = configFromValue(res.data && res.data.value);
      if (saved) {
        safeSet(GLOBAL_CACHE_KEY, JSON.stringify(saved));
        applyPreset(saved.palette, saved.custom_accent);
      }
      setStatus('System theme updated for everyone.', false);
      syncControls();
    }).catch(function () {
      setStatus('Could not save the system theme. Check your connection and try again.', true);
      loadGlobalTheme().then(syncControls);
    }).finally(function () { saving = false; });
  }
  function verifyDeveloper() {
    if (!db || !document.body || document.body.dataset.portal !== 'DEVELOPER') return Promise.resolve(false);
    return db.auth.getUser().then(function (auth) {
      if (auth.error || !auth.data || !auth.data.user) return false;
      return db.from('user_profiles')
        .select('system_role,status')
        .eq('id', auth.data.user.id)
        .maybeSingle()
        .then(function (profile) {
          return !!(profile.data &&
            String(profile.data.system_role).toUpperCase() === 'DEVELOPER' &&
            String(profile.data.status).toLowerCase() === 'active');
        });
    }).catch(function () { return false; });
  }
  function addControls() {
    var anchor = document.getElementById('themeToggle');
    if (!document.body || document.body.dataset.portal !== 'DEVELOPER') return;
    var header = document.querySelector('.topbar .top-controls') || document.querySelector('.portal-head');
    if (document.getElementById('slfaThemeControls') || !header) return;
    var wrap = document.createElement('div');
    wrap.id = 'slfaThemeControls';
    wrap.setAttribute('aria-label', 'Developer system appearance controls');

    var label = document.createElement('span');
    label.className = 'slfa-theme-label';
    label.textContent = 'System theme';

    var select = document.createElement('select');
    select.id = 'slfaThemeSelect';
    select.setAttribute('aria-label', 'Change the system colour theme');
    PRESETS.forEach(function (p) {
      var option = document.createElement('option');
      option.value = p.value;
      option.textContent = p.label;
      select.appendChild(option);
    });

    var picker = document.createElement('input');
    picker.type = 'color';
    picker.id = 'slfaAccentColor';
    picker.setAttribute('aria-label', 'Set custom system accent colour');
    picker.title = 'Set custom system accent colour';

    var publish = document.createElement('button');
    publish.type = 'button';
    publish.id = 'slfaThemePublish';
    publish.className = 'small';
    publish.textContent = 'Publish';
    publish.setAttribute('aria-label', 'Publish the selected system colour theme');

    var status = document.createElement('span');
    status.id = 'slfaThemeStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    wrap.appendChild(label);
    wrap.appendChild(select);
    wrap.appendChild(picker);
    wrap.appendChild(publish);
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    else header.appendChild(wrap);
    header.appendChild(status);

    syncControls();
    select.addEventListener('change', function () {
      applyPreset(select.value, current.custom_accent);
      saveGlobalTheme();
    });
    picker.addEventListener('input', function () {
      applyPreset('custom', picker.value);
      select.value = 'custom';
      setStatus('Preview only. Tap Publish to apply this colour to everyone.', false);
    });
    picker.addEventListener('change', function () {
      applyPreset('custom', picker.value);
      select.value = 'custom';
    });
    publish.addEventListener('click', saveGlobalTheme);
  }
  function addStars() {
    if (!document.body || document.getElementById('slfa-cosmos')) return;
    var layer = document.createElement('div');
    layer.id = 'slfa-cosmos';
    layer.setAttribute('aria-hidden', 'true');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (var i = 0; i < 58; i++) {
      var star = document.createElement('i');
      star.className = 'slfa-star';
      star.style.left = ((i * 37 + 11) % 100) + '%';
      star.style.top = ((i * 61 + 7) % 100) + '%';
      star.style.setProperty('--delay', ((i % 9) * -.63) + 's');
      star.style.setProperty('--twinkle', (3.2 + (i % 5) * .7) + 's');
      star.style.opacity = (0.22 + (i % 5) * .12).toFixed(2);
      layer.appendChild(star);
    }
    if (!reduced) {
      [
        { top:'8%', left:'82%', delay:'-2s', travel:'11s' },
        { top:'31%', left:'94%', delay:'-7s', travel:'13s' },
        { top:'53%', left:'75%', delay:'-4s', travel:'15s' },
        { top:'17%', left:'58%', delay:'-10s', travel:'17s' }
      ].forEach(function (item) {
        var comet = document.createElement('i');
        comet.className = 'slfa-comet';
        comet.style.top = item.top;
        comet.style.left = item.left;
        comet.style.setProperty('--delay', item.delay);
        comet.style.setProperty('--travel', item.travel);
        layer.appendChild(comet);
      });
    }
    document.body.insertBefore(layer, document.body.firstChild);
  }
  function freetownClock(date) {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: SKY_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(date);
      var clock = {};
      parts.forEach(function (part) {
        if (part.type === 'hour' || part.type === 'minute' || part.type === 'second') {
          clock[part.type] = Number(part.value);
        }
      });
      return { hour: clock.hour || 0, minute: clock.minute || 0, second: clock.second || 0 };
    } catch (e) {
      return { hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
    }
  }
  function skyPhaseAt(date) {
    var clock = freetownClock(date);
    var hour = clock.hour + clock.minute / 60 + clock.second / 3600;
    if (hour >= 5 && hour < 9) return 'dawn';
    if (hour >= 9 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 19.5) return 'dusk';
    return 'night';
  }
  function applySkyCycle() {
    var now = new Date();
    var clock = freetownClock(now);
    var phase = skyPhaseAt(now);
    var root = document.documentElement;
    var changed = root.getAttribute('data-sky-phase') !== phase;
    var labels = { dawn:'Dawn', afternoon:'Afternoon', dusk:'Dusk', night:'Night Sky' };
    var colours = { dawn:'#b97878', afternoon:'#1676b8', dusk:'#75466f', night:'#071326' };
    var pad = function (v) { return String(v).padStart(2, '0'); };

    root.setAttribute('data-sky-phase', phase);
    root.setAttribute('data-sky-mode', 'automatic');
    root.setAttribute('data-sky-label', labels[phase]);
    root.setAttribute('data-sky-timezone', SKY_TIME_ZONE);
    root.setAttribute('data-sky-local-time', pad(clock.hour) + ':' + pad(clock.minute));

    if (changed) {
      root.setAttribute('data-sky-transition', 'active');
      window.setTimeout(function () {
        root.setAttribute('data-sky-transition', 'settled');
      }, 2200);
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colours[phase]);
  }
  function addSkyAtmosphere() {
    if (!document.body || document.getElementById('slfa-sky-atmosphere')) return;
    var layer = document.createElement('div');
    layer.id = 'slfa-sky-atmosphere';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML =
      '<span class="slfa-sky-glow"></span>' +
      '<span class="slfa-sky-sun"></span>' +
      '<span class="slfa-sky-moon"></span>' +
      '<span class="slfa-sky-horizon"></span>' +
      '<span class="slfa-sky-cloud slfa-sky-cloud-a"></span>' +
      '<span class="slfa-sky-cloud slfa-sky-cloud-b"></span>' +
      '<span class="slfa-sky-cloud slfa-sky-cloud-c"></span>' +
      '<span class="slfa-sky-light-beam"></span>';
    document.body.insertBefore(layer, document.body.firstChild);
  }

  function addBirdFlights() {
    if (!document.body || document.getElementById('slfa-bird-flight-layer')) return;
    var flightLayer = document.createElement('div');
    flightLayer.id = 'slfa-bird-flight-layer';
    flightLayer.setAttribute('aria-hidden', 'true');

    function makeBird(className) {
      var bird = document.createElement('span');
      bird.className = 'slfa-bird ' + className;
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 42 24');
      svg.setAttribute('focusable', 'false');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M2 14 C8 5 14 6 21 15 C28 6 34 5 40 14');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '3.8');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      bird.appendChild(svg);
      return bird;
    }

    [
      { name: 'a', count: 6 },
      { name: 'b', count: 5 },
      { name: 'c', count: 6 }
    ].forEach(function (group) {
      var flock = document.createElement('span');
      flock.className = 'slfa-bird-flock slfa-bird-flock-' + group.name;
      for (var i = 0; i < group.count; i++) {
        flock.appendChild(makeBird('b' + ((i % 5) + 1)));
      }
      flightLayer.appendChild(flock);
    });
    document.body.appendChild(flightLayer);
  }
  function init() {
    if (!document.body) return;
    db = getDb();
    var cached = null;
    try { cached = JSON.parse(safeGet(GLOBAL_CACHE_KEY) || 'null'); } catch (e) {}
    var cachedConfig = configFromValue(cached);
    applyPreset(cachedConfig ? cachedConfig.palette : 'night-sky', cachedConfig ? cachedConfig.custom_accent : DEFAULT_ACCENT);
    addSkyAtmosphere();
    addBirdFlights();
    applySkyCycle();
    addStars();
    window.setInterval(applySkyCycle, 15000);

    // All viewers receive the same palette from the database. Local storage is only an offline fallback.
    loadGlobalTheme();

    // The colour editor is created only on the Developer portal and only after database role verification.
    verifyDeveloper().then(function (allowed) {
      if (!allowed) return;
      addControls();
      loadGlobalTheme().then(function (exists) {
        if (!exists) saveGlobalTheme();
      });
    });

    if (db && db.channel) {
      try {
        db.channel('slfa-global-appearance')
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'app_settings',
            filter: 'key=eq.' + CONFIG_KEY
          }, function () { loadGlobalTheme(); })
          .subscribe();
      } catch (e) {}
    }
    document.addEventListener('visibilitychange', function () {
      var layer = document.getElementById('slfa-cosmos');
      if (layer) layer.style.animationPlayState = document.hidden ? 'paused' : 'running';
      if (!document.hidden) { applySkyCycle(); loadGlobalTheme(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
