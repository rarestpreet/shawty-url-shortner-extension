/**
 * Shawty Content Script (Flow 1: Webpage Copy Event & Keydown Interceptor).
 *
 * Responsibilities:
 * 1. Listen for user copy events and Ctrl+C / Cmd+C key combinations.
 * 2. Listen for custom '__shawty_page_copy__' events dispatched by main-world hooks.
 * 3. Extract copied/selected text from window selection or active input/textarea.
 * 4. Send detected text candidate directly to background service worker.
 */

(function () {
  'use strict';

  if (window.__shawty_content_script_active__) return;
  window.__shawty_content_script_active__ = true;

  const MIN_CANDIDATE_LENGTH = 35;
  let lastSentText = '';
  let lastSentTime = 0;
  const DEBOUNCE_MS = 1500;

  function sanitizeCandidate(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    if (cleaned.startsWith('<') && cleaned.endsWith('>')) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned;
  }

  function isCandidateLikelyUrl(text) {
    const cleaned = sanitizeCandidate(text);
    if (cleaned.length < MIN_CANDIDATE_LENGTH) return false;
    if (/\s/.test(cleaned)) return false;
    return true;
  }

  function sendCandidateToBackground(rawText) {
    const cleaned = sanitizeCandidate(rawText);
    if (!isCandidateLikelyUrl(cleaned)) return;

    const now = Date.now();
    if (cleaned === lastSentText && now - lastSentTime < DEBOUNCE_MS) {
      return;
    }
    lastSentText = cleaned;
    lastSentTime = now;

    try {
      chrome.runtime.sendMessage({
        type: 'PAGE_COPY',
        url: cleaned,
        source: 'page_copy',
      });
      console.debug('[Shawty] Captured copy candidate and forwarded to service worker');
    } catch (err) {
      console.debug('[Shawty] Message dispatch note:', err.message);
    }
  }

  function getSelectedText() {
    let text = '';
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      text = sel.toString();
    }
    if (!text && document.activeElement) {
      const el = document.activeElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        try {
          const start = el.selectionStart;
          const end = el.selectionEnd;
          if (typeof start === 'number' && typeof end === 'number' && start !== end) {
            text = el.value.substring(start, end);
          }
        } catch (_) {}
      }
    }
    return text;
  }

  // 1. Listen for custom page-copy event from main-world hooks (clipboard.writeText / setData)
  window.addEventListener('__shawty_page_copy__', (e) => {
    if (e.detail && typeof e.detail === 'string') {
      sendCandidateToBackground(e.detail);
    }
  });

  // 2. Listen for standard 'copy' events on document
  document.addEventListener(
    'copy',
    () => {
      const selected = getSelectedText();
      if (selected) {
        sendCandidateToBackground(selected);
      }
    },
    true
  );

  // 3. Listen for Ctrl+C / Cmd+C keydown combinations
  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        const selected = getSelectedText();
        if (selected) {
          sendCandidateToBackground(selected);
        }
      }
    },
    true
  );
})();
