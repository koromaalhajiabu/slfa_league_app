/* Client-side OCR for photographed SLFA match records.
   Text is machine-read and must always be checked against the original photograph. */
(function () {
  'use strict';
  var workerPromise = null;
  function scriptReady() { return !!(window.Tesseract && typeof window.Tesseract.createWorker === 'function'); }
  function loadEngine() {
    if (scriptReady()) return Promise.resolve();
    if (window.__slfaTesseractLoading) return window.__slfaTesseractLoading;
    window.__slfaTesseractLoading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = function () { scriptReady() ? resolve() : reject(new Error('OCR engine did not initialise.')); };
      script.onerror = function () { reject(new Error('OCR engine could not be downloaded. Check the internet connection and retry.')); };
      document.head.appendChild(script);
    });
    return window.__slfaTesseractLoading;
  }
  function getWorker() {
    if (!workerPromise) {
      workerPromise = loadEngine().then(function () {
        return window.Tesseract.createWorker('eng', 1);
      }).catch(function (e) {
        workerPromise = null;
        throw e;
      });
    }
    return workerPromise;
  }
  function preprocess(file) {
    return new Promise(function (resolve) {
      if (!window.createImageBitmap || !document.createElement('canvas').toBlob) { resolve(file); return; }
      window.createImageBitmap(file).then(function (bitmap) {
        var scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        var ctx = canvas.getContext('2d', { willReadFrequently:true });
        ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        bitmap.close && bitmap.close();
        try {
          var frame = ctx.getImageData(0,0,canvas.width,canvas.height), d = frame.data;
          for (var i=0;i<d.length;i+=4) {
            var gray = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
            // Mild contrast enhancement helps ink on paper without thresholding pen strokes away.
            gray = Math.max(0,Math.min(255,(gray-128)*1.22+128));
            d[i]=d[i+1]=d[i+2]=gray;
          }
          ctx.putImageData(frame,0,0);
          canvas.toBlob(function (blob) { resolve(blob || file); }, 'image/png');
        } catch (_) { resolve(file); }
      }).catch(function () { resolve(file); });
    });
  }
  async function run(files, progress) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return { text:'', confidence:null, status:'NOT_RUN', files:0 };
    try {
      var worker = await getWorker(), parts = [], totalConfidence = 0, confidenceCount = 0;
      for (var i=0;i<list.length;i++) {
        if (progress) progress('Reading photograph '+(i+1)+' of '+list.length+'…');
        var prepared = await preprocess(list[i]);
        var result = await worker.recognize(prepared);
        var data = result && result.data ? result.data : {};
        var text = String(data.text || '').trim();
        var confidence = Number(data.confidence);
        if (text) parts.push('--- Photograph '+(i+1)+' ---\n'+text);
        if (isFinite(confidence)) { totalConfidence += confidence; confidenceCount++; }
      }
      var combined = parts.join('\n\n');
      var avg = confidenceCount ? Math.round(totalConfidence/confidenceCount*100)/100 : null;
      return {
        text: combined,
        confidence: avg,
        status: combined ? (avg !== null && avg < 55 ? 'NEEDS_REVIEW' : 'COMPLETE') : 'NEEDS_REVIEW',
        files:list.length
      };
    } catch (e) {
      return { text:'', confidence:null, status:'FAILED', files:list.length, error:e.message || String(e) };
    }
  }
  window.slfaRunOCR = run;
})();