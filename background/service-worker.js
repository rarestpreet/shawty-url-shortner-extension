/**
 * Central Background Service Worker for Shawty URL Shortener (Manifest V3).
 *
 * Responsibilities:
 * 1. Coordinate both URL intake flows:
 *    - Flow 1: Webpage copy events from content scripts
 *    - Flow 2: Periodic clipboard analysis from offscreen document
 * 2. Manage the offscreen document lifecycle for clipboard observation.
 * 3. Enforce the Common URL Pipeline:
 *    Normalize/trim -> isValidLongUrl -> Deduplicate -> Call Shortening API -> Update UI/Notify.
 * 4. Register context menus ("Shorten with Shawty").
 * 5. Update extension action badge & display non-intrusive notification.
 * 6. Never overwrite user clipboard automatically (user clicks Copy).
 */

import { isValidLongUrl, normalizeUrl, MIN_URL_LENGTH } from '../services/url-validator.js';
import { shortenUrl, fetchUserLinks } from '../services/shortening-api.js';
import { deduplicator } from '../utils/deduplication.js';
import { saveShortenedUrl, setBadge, isAutoShortenEnabled, getUsername, getUrlHistory } from '../utils/storage.js';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

/**
 * Ensure the offscreen document exists for clipboard watching (Flow 2).
 */
async function setupOffscreenDocument() {
  if (!chrome.offscreen) {
    console.debug('[Shawty] chrome.offscreen API not available');
    return;
  }

  try {
    if (chrome.offscreen.hasDocument) {
      const hasDoc = await chrome.offscreen.hasDocument();
      if (hasDoc) return;
    } else if (chrome.runtime.getContexts) {
      const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (existing && existing.length > 0) return;
    }

    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Periodically checks clipboard for qualifying long URLs to shorten.',
    });
    console.debug('[Shawty] Offscreen document created for clipboard watching.');
  } catch (err) {
    if (!err.message?.includes('Only a single offscreen document may be created')) {
      console.debug('[Shawty] Offscreen setup note:', err.message);
    }
  }
}

/**
 * Format friendly source label for UI notifications.
 */
function formatSourceLabel(source) {
  switch (source) {
    case 'page_copy':
      return 'Webpage Copy';
    case 'clipboard':
      return 'Clipboard Watcher';
    case 'manual_input':
      return 'Manual Input';
    case 'context_menu':
      return 'Context Menu';
    default:
      return 'Detected';
  }
}

/**
 * COMMON URL SHORTENING PIPELINE
 *
 * Input text
 *    ↓
 * Normalize/trim
 *    ↓
 * Check valid URL (isValidLongUrl)
 *    ↓
 * Only allow http:// and https://
 *    ↓
 * Check minimum URL length (>= 35)
 *    ↓
 * Deduplicate recently processed URLs
 *    ↓
 * Call Shawty shortening API
 *    ↓
 * Receive shortened URL
 *    ↓
 * Notify / update extension UI
 *
 * @param {string} candidateText
 * @param {'page_copy'|'clipboard'|'manual_input'|'context_menu'} source
 */
export async function processCommonUrlPipeline(candidateText, source = 'page_copy') {
  // 1. Normalize and trim
  const trimmed = (candidateText || '').trim();
  if (!trimmed) return null;

  // 2. Validate URL (>= 35 chars, http/https, structural hostname)
  if (!isValidLongUrl(trimmed, MIN_URL_LENGTH)) {
    console.debug('[Shawty] Candidate rejected by pipeline:', trimmed.substring(0, 40));
    return null;
  }

  const normalized = normalizeUrl(trimmed);
  if (!normalized) return null;

  // 3. Deduplication check across all intake channels
  if (deduplicator.isDuplicate(normalized)) {
    console.debug('[Shawty] Ignored duplicate candidate within window:', normalized);
    return null;
  }
  deduplicator.markProcessed(normalized);

  // 4. Verify auto-shorten preference for passive channels
  if (source === 'page_copy' || source === 'clipboard') {
    const enabled = await isAutoShortenEnabled();
    if (!enabled) {
      console.debug('[Shawty] Auto-shortening is disabled in settings.');
      return null;
    }
  }

  try {
    console.debug(`[Shawty] Shortening candidate via ${source}:`, normalized);

    // 5. Call Shawty shortening API
    const apiResult = await shortenUrl(normalized);

    // 6. Record source and persist to storage
    const record = {
      ...apiResult,
      source,
    };
    await saveShortenedUrl(record);

    // 7. Update Action Badge to cue user
    await setBadge('✓', '#18181b');

    // 8. Trigger non-intrusive browser notification
    // Only notify when URL was successfully shortened
    // Inform what link was shortened and how to check it out (without short URL or fetch source)
    const targetUrl = record.originalUrl || normalized;
    const previewUrl = targetUrl.length > 55 ? targetUrl.substring(0, 52) + '...' : targetUrl;
    showNotification(
      'Link Shortened with Shawty',
      `Shortened: ${previewUrl}\nClick the Shawty extension icon to view and copy your link.`
    );

    return record;
  } catch (err) {
    console.error('[Shawty] Shortening API failed:', err.message);
    const isRateLimit =
      err.status === 429 ||
      err.statusCode === 429 ||
      err.isRateLimited ||
      err.message?.includes('429') ||
      /too many/i.test(err.message || '');

    if (isRateLimit) {
      await setBadge('!', '#ef4444');
      showNotification(
        'Too Many Attempts (429)',
        'URL shortening failed: Too many attempts (429). Guest users get 10 URLs / 1 day. Connect your GitHub account in extension settings.'
      );
    }
    return null;
  }
}

/**
 * Display non-intrusive browser notification.
 */
function showNotification(title, message) {
  const notificationId = `shawty_${Date.now()}`;
  try {
    chrome.notifications.create(
      notificationId,
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title,
        message,
        priority: 1,
        requireInteraction: false,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.debug('[Shawty] Notification note:', chrome.runtime.lastError.message);
        }
      }
    );
  } catch (e) {
    console.debug('[Shawty] Notification error:', e.message);
  }
}

/**
 * Clear action badge when user clicks notification.
 */
chrome.notifications.onClicked.addListener(() => {
  setBadge('');
});

/**
 * Setup Context Menus ("Shorten with Shawty").
 */
function setupContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'shawty_shorten_link',
        title: 'Shorten this link with Shawty',
        contexts: ['link'],
      });

      chrome.contextMenus.create({
        id: 'shawty_shorten_selection',
        title: 'Shorten selected URL with Shawty',
        contexts: ['selection'],
      });

      chrome.contextMenus.create({
        id: 'shawty_shorten_page',
        title: 'Shorten current page URL with Shawty',
        contexts: ['page'],
      });
    });
  } catch (e) {
    console.debug('[Shawty] Context menu setup error:', e.message);
  }
}

/**
 * Handle Context Menu Clicks.
 * For a clicked link, uses the URL supplied by context-menu event directly.
 */
chrome.contextMenus.onClicked.addListener(async (info) => {
  let targetUrl = '';

  if (info.menuItemId === 'shawty_shorten_link' && info.linkUrl) {
    targetUrl = info.linkUrl;
  } else if (info.menuItemId === 'shawty_shorten_selection' && info.selectionText) {
    targetUrl = info.selectionText.trim();
  } else if (info.menuItemId === 'shawty_shorten_page' && info.pageUrl) {
    targetUrl = info.pageUrl;
  }

  if (targetUrl) {
    await processCommonUrlPipeline(targetUrl, 'context_menu');
  }
});

/**
 * Listen for Messages from Content Scripts, Offscreen Document, and Popup.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Flow 1: Webpage copy event from content script
  if (message.type === 'PAGE_COPY' || (message.type === 'URL_COPIED' && message.source !== 'clipboard')) {
    processCommonUrlPipeline(message.url, 'page_copy');
    sendResponse({ received: true });
    return true;
  }

  // Flow 2: Clipboard watcher from offscreen document
  if (message.type === 'CLIPBOARD_CHANGED') {
    processCommonUrlPipeline(message.url, 'clipboard');
    sendResponse({ received: true });
    return true;
  }

  // Manual input from Popup
  if (message.type === 'MANUAL_SHORTEN' && message.url) {
    processCommonUrlPipeline(message.url, 'manual_input').then((result) => {
      sendResponse({ completed: Boolean(result), record: result });
    });
    return true;
  }
});

/**
 * Lifecycle initialization.
 */
chrome.runtime.onInstalled.addListener(async () => {
  setupContextMenus();
  await setupOffscreenDocument();
});

chrome.runtime.onStartup.addListener(async () => {
  setupContextMenus();
  await setupOffscreenDocument();
});

// Run offscreen setup on worker wake-up
setupOffscreenDocument();
