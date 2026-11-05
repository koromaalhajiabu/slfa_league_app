// Light / Dark button for staff pages. The choice is shared with the public app on this device.
(function () {
  var btn = document.getElementById('themeToggle'); if (!btn) return;
  function isLight() { return document.documentElement.getAttribute('data-theme') === 'light'; }
  function paint() {
    btn.textContent = isLight() ? 'Dark mode' : 'Light mode';
    btn.setAttribute('aria-pressed', isLight() ? 'true' : 'false');
  }
  btn.addEventListener('click', function () {
    var next = isLight() ? 'dark' : 'light';
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('slfa_theme', next); } catch (e) {}
    paint();
  });
  paint();
})();
