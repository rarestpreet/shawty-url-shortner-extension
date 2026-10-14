/**
 * Shawty Main-World Interceptor.
 *
 * Runs in the webpage's MAIN world to catch:
 * 1. navigator.clipboard.writeText(...) calls by web page "Copy Link" buttons.
 * 2. DataTransfer.prototype.setData(...) calls by web page copy event listeners.
 *
 * Emits custom '__shawty_page_copy__' DOM event to the extension's isolated content script.
 */

(function () {
  'use strict';

  if (window.__shawty_main_world_active__) return;
  window.__shawty_main_world_active__ = true;

  function dispatchDetectedText(text) {
    if (!text || typeof text !== 'string') return;
    const trimmed = text.trim();
    if (trimmed.length < 25) return;
    try {
      window.dispatchEvent(
        new CustomEvent('__shawty_page_copy__', {
          detail: trimmed,
        })
      );
    } catch (_) {}
  }

  // 1. Intercept navigator.clipboard.writeText
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
      dispatchDetectedText(text);
      return origWriteText(text);
    };
  }

  // 2. Intercept DataTransfer.prototype.setData
  if (typeof DataTransfer !== 'undefined' && DataTransfer.prototype.setData) {
    const origSetData = DataTransfer.prototype.setData;
    DataTransfer.prototype.setData = function (format, data) {
      if (typeof format === 'string' && (format.toLowerCase() === 'text/plain' || format.toLowerCase() === 'text')) {
        dispatchDetectedText(data);
      }
      return origSetData.apply(this, arguments);
    };
  }
})();
