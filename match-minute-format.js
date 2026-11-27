/* SLFA League App — shared broadcast-style match minute formatting.
   A match's current_half (1 or 2, set by the referee's clock controls) tells us
   whether a minute beyond 45 or 90 is first- or second-half stoppage time, so we
   can show "45+2'" / "90+4'" instead of a plain running number. Used anywhere a
   match minute or event minute is displayed to staff or the public. */
(function () {
  'use strict';
  function formatMatchMinute(minute, half) {
    var m = Number(minute);
    if (!isFinite(m)) return '—';
    var h = Number(half) === 2 ? 2 : 1;
    if (h === 1 && m > 45) return '45+' + (m - 45) + "'";
    if (h === 2 && m > 90) return '90+' + (m - 90) + "'";
    return m + "'";
  }
  window.slfaFormatMinute = formatMatchMinute;
})();
