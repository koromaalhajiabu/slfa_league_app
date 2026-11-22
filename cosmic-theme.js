/* SLFA 2026 appearance controls and animated night-sky layer. No external dependencies. */
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
  var PRESET_KEY = 'slfa_palette_v1';
  var CUSTOM_KEY = 'slfa_custom_accent_v1';
  var DEFAULT_ACCENT = '#62d7ff';

  function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function validPreset(value) {
    return PRESETS.some(function (p) { return p.value === value; }) ? value : 'night-sky';
  }
  function hexToRgba(hex, alpha) {
    var match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!match) return 'rgba(98,215,255,' + alpha + ')';
    return 'rgba(' + parseInt(match[1], 16) + ',' + parseInt(match[2], 16) + ',' + parseInt(match[3], 16) + ',' + alpha + ')';
  }
  function applyPreset(preset, persist) {
    preset = validPreset(preset);
    document.documentElement.setAttribute('data-palette', preset);
    if (preset === 'custom') {
      var custom = safeGet(CUSTOM_KEY) || DEFAULT_ACCENT;
      document.documentElement.style.setProperty('--slfa-accent', custom);
      document.documentElement.style.setProperty('--slfa-accent-2', custom);
      document.documentElement.style.setProperty('--slfa-glow', hexToRgba(custom, .22));
    } else {
      document.documentElement.style.removeProperty('--slfa-accent');
      document.documentElement.style.removeProperty('--slfa-accent-2');
      document.documentElement.style.removeProperty('--slfa-glow');
    }
    if (persist) safeSet(PRESET_KEY, preset);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && document.documentElement.getAttribute('data-theme') !== 'light') {
      var colour = preset === 'emerald-prestige' ? '#063328' : preset === 'royal-amethyst' ? '#21113d' : preset === 'obsidian-gold' ? '#211b10' : preset === 'arctic-silver' ? '#11283e' : preset === 'crimson-elite' ? '#2a1120' : preset === 'custom' ? (safeGet(CUSTOM_KEY) || DEFAULT_ACCENT) : '#020817';
      meta.setAttribute('content', colour);
    }
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
        { top: '8%', left: '82%', delay: '-2s', travel: '11s' },
        { top: '31%', left: '94%', delay: '-7s', travel: '13s' },
        { top: '53%', left: '75%', delay: '-4s', travel: '15s' },
        { top: '17%', left: '58%', delay: '-10s', travel: '17s' }
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
  function addControls() {
    var anchor = document.getElementById('themeToggle');
    var header = document.querySelector('.topbar .top-controls') || document.querySelector('.portal-head');
    if (document.getElementById('slfaThemeControls') || !header) return;
    var wrap = document.createElement('div');
    wrap.id = 'slfaThemeControls';
    wrap.setAttribute('aria-label', 'Appearance settings');
    var label = document.createElement('span');
    label.className = 'slfa-theme-label';
    label.textContent = 'Theme';
    var select = document.createElement('select');
    select.id = 'slfaThemeSelect';
    select.setAttribute('aria-label', 'Choose a premium colour theme');
    PRESETS.forEach(function (p) {
      var option = document.createElement('option');
      option.value = p.value;
      option.textContent = p.label;
      select.appendChild(option);
    });
    var picker = document.createElement('input');
    picker.type = 'color';
    picker.id = 'slfaAccentColor';
    picker.setAttribute('aria-label', 'Choose custom accent colour');
    picker.title = 'Choose custom accent colour';
    wrap.appendChild(label);
    wrap.appendChild(select);
    wrap.appendChild(picker);
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    else header.appendChild(wrap);

    var saved = validPreset(safeGet(PRESET_KEY));
    select.value = saved;
    picker.value = safeGet(CUSTOM_KEY) || DEFAULT_ACCENT;
    select.addEventListener('change', function () { applyPreset(select.value, true); });
    picker.addEventListener('input', function () {
      safeSet(CUSTOM_KEY, picker.value);
      select.value = 'custom';
      applyPreset('custom', true);
    });
  }
  function init() {
    if (!document.body) return;
    applyPreset(safeGet(PRESET_KEY) || 'night-sky', false);
    addStars();
    addControls();
    document.addEventListener('visibilitychange', function () {
      var layer = document.getElementById('slfa-cosmos');
      if (layer) layer.style.animationPlayState = document.hidden ? 'paused' : 'running';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
