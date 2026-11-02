// TEMPORARY diagnostic: shows script errors on screen so they can be read on a phone.
(function () {
  var box = null, lines = [];
  function show(text) {
    lines.push(new Date().toLocaleTimeString() + ' ' + text);
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;z-index:99999;background:#1a0000;color:#ffb3b3;font:12px/1.4 monospace;padding:8px;white-space:pre-wrap;word-break:break-word');
      box.textContent = 'DEBUG (tap to hide)\n';
      box.onclick = function () { box.style.display = 'none'; };
      (document.body || document.documentElement).appendChild(box);
    }
    box.style.display = 'block';
    box.textContent = 'DEBUG (tap to hide)\n' + lines.slice(-25).join('\n');
  }
  window.addEventListener('error', function (e) { show('ERROR: ' + e.message + ' @ ' + (e.filename || '') + ':' + (e.lineno || '')); });
  window.addEventListener('unhandledrejection', function (e) { show('PROMISE: ' + (e.reason && (e.reason.message || e.reason)) ); });
  var origErr = console.error;
  console.error = function () { show('CONSOLE: ' + Array.prototype.slice.call(arguments).map(String).join(' ')); return origErr.apply(console, arguments); };
  window.addEventListener('load', function () { show('loaded. supabase library: ' + (window.supabase ? 'yes' : 'NO') + ', config: ' + (window.SLFA_CONFIG ? 'yes' : 'NO')); });
  window.slfaDebug = show;
})();
