/**
 * Shawty Offscreen Clipboard Monitor (Manifest V3 Flow 2).
 *
 * Responsibilities:
 * 1. Periodically inspect the clipboard at a reasonable interval (6 seconds).
 * 2. Compare current clipboard value with previous value.
 * 3. Immediately discard non-URLs in memory — strictly enforce privacy.
 * 4. Send only changed, qualifying long URLs to the service worker.
 * 5. Never store or persist non-URL clipboard strings anywhere.
 */

import { isValidLongUrl, normalizeUrl } from '../services/url-validator.js';

const POLL_INTERVAL_MS = 6000; // 6 seconds (within 5-10 second requirement)
let lastClipboardValue = '';
const textarea = document.getElementById('clipboard-target');

/**
 * Reads plain text from clipboard safely using modern Clipboard API,
 * falling back to document.execCommand('paste') via an offscreen textarea.
 * @returns {Promise<string>}
 */
async function readClipboardText() {
  // Method 1: Modern navigator.clipboard API
  if (navigator.clipboard && navigator.clipboard.readText) {
    try {
      const text = await navigator.clipboard.readText();
      if (typeof text === 'string') {
        return text;
      }
    } catch {
      // Document may lack focus; proceed to Method 2 fallback
    }
  }

  // Method 2: DOM execCommand paste fallback inside offscreen context
  if (textarea) {
    try {
      textarea.value = '';
      textarea.focus();
      textarea.select();
      const success = document.execCommand('paste');
      const val = textarea.value;
      textarea.value = ''; // Immediately clear DOM memory
      if (success && typeof val === 'string') {
        return val;
      }
    } catch {
      // Silently catch fallback error
    }
  }

  return '';
}

/**
 * Performs one clipboard inspection cycle.
 */
async function checkClipboard() {
  try {
    const rawText = await readClipboardText();

    // 1. Change detection: skip if unchanged from last cycle
    if (rawText === lastClipboardValue) {
      return;
    }
    lastClipboardValue = rawText;

    // 2. Ignore empty text
    if (!rawText || !rawText.trim()) {
      return;
    }

    const candidate = rawText.trim();

    // 3. Privacy gate: Check if it's a qualifying long HTTP/HTTPS URL
    // Non-URLs are discarded immediately here with no persistence or logging
    if (!isValidLongUrl(candidate, 35)) {
      return;
    }

    const normalized = normalizeUrl(candidate);
    if (!normalized) {
      return;
    }

    // 4. Send to central service worker pipeline
    chrome.runtime.sendMessage({
      type: 'CLIPBOARD_CHANGED',
      url: normalized,
      source: 'clipboard',
    });
  } catch (err) {
    console.debug('[Shawty Offscreen] Clipboard check note:', err.message);
  }
}

// Start periodic polling
setInterval(checkClipboard, POLL_INTERVAL_MS);

// Initial check after initialization
setTimeout(checkClipboard, 1000);

// Also listen for explicit check triggers from service worker if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_CLIPBOARD_NOW') {
    checkClipboard().then(() => sendResponse({ checked: true }));
    return true;
  }
  if (message.type === 'OFFSCREEN_PING') {
    sendResponse({ status: 'alive' });
    return true;
  }
});
