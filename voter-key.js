(function (window) {
  'use strict';

  var STORAGE_KEY = 'slfa_voter_key';
  var TOKEN_PATTERN = /^v2_[0-9a-f]{64}$/;

  function createToken() {
    var cryptoApi = window.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') return '';

    var bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += ('0' + bytes[i].toString(16)).slice(-2);
    }
    return 'v2_' + hex;
  }

  function getToken() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY) || '';
      if (TOKEN_PATTERN.test(saved)) return saved;

      var fresh = createToken();
      if (!fresh) return '';
      window.localStorage.setItem(STORAGE_KEY, fresh);
      return fresh;
    } catch (error) {
      return '';
    }
  }

  window.slfaGetVoterKey = getToken;
})(window);
