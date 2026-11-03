// Keeps an open app on the latest version without a manual refresh.
// When a new service worker takes over, the page reloads once to load the new code.
// The app also checks for a new version every 5 minutes and whenever it comes back into view.
(function () {
  if (!('serviceWorker' in navigator)) return;
  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    function check() { reg.update().catch(function () {}); }
    setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') check();
    });
  }).catch(function () {});
})();
