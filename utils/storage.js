/**
 * Storage & State Management helper for Shawty Extension.
 * Wraps chrome.storage.local with clean async methods and default fallbacks.
 */

export const DEFAULT_API_BASE = 'https://shawty.hopto.org';
const MAX_HISTORY_ITEMS = 25;

let cachedEnvBaseUrl = null;

function normalizeUrl(url) {
  if (!url) return DEFAULT_API_BASE;
  let clean = url.trim().replace(/\/+$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `https://${clean}`;
  }
  return clean;
}

/**
 * Fetch and parse BASE_URL from .env file inside the extension.
 * Falls back to .env.example or DEFAULT_API_BASE if not found.
 */
export async function loadEnvBaseUrl() {
  if (cachedEnvBaseUrl) return cachedEnvBaseUrl;

  // 1. Try reading .env file
  try {
    const envUrl = chrome.runtime.getURL('.env');
    const res = await fetch(envUrl);
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/^\s*BASE_URL\s*=\s*(.+)$/m);
      if (match && match[1]) {
        cachedEnvBaseUrl = normalizeUrl(match[1].replace(/^["']|["']$/g, ''));
        return cachedEnvBaseUrl;
      }
    }
  } catch {
    // .env not found or unreadable
  }

  // 2. Try reading .env.example file as fallback
  try {
    const exampleUrl = chrome.runtime.getURL('.env.example');
    const res = await fetch(exampleUrl);
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/^\s*BASE_URL\s*=\s*(.+)$/m);
      if (match && match[1]) {
        cachedEnvBaseUrl = normalizeUrl(match[1].replace(/^["']|["']$/g, ''));
        return cachedEnvBaseUrl;
      }
    }
  } catch {
    // .env.example not found or unreadable
  }

  cachedEnvBaseUrl = DEFAULT_API_BASE;
  return cachedEnvBaseUrl;
}

/**
 * Get backend API base URL from .env or fallback.
 */
export async function getApiBaseUrl() {
  return await loadEnvBaseUrl();
}

/**
 * Set configured backend API base URL (kept for compatibility).
 */
export async function setApiBaseUrl(url) {
  cachedEnvBaseUrl = normalizeUrl(url);
  return cachedEnvBaseUrl;
}

/**
 * Get latest shortened URL record.
 */
export async function getLatestUrl() {
  const data = await chrome.storage.local.get(['latestShortened']);
  return data.latestShortened || null;
}

/**
 * Store latest shortened URL and add to history.
 */
export async function saveShortenedUrl(urlRecord) {
  const history = await getUrlHistory();

  // Deduplicate in history
  const filtered = history.filter((item) => item.code !== urlRecord.code && item.originalUrl !== urlRecord.originalUrl);
  const updatedHistory = [urlRecord, ...filtered].slice(0, MAX_HISTORY_ITEMS);

  await chrome.storage.local.set({
    latestShortened: urlRecord,
    urlHistory: updatedHistory,
  });
}

/**
 * Get history of shortened URLs.
 */
export async function getUrlHistory() {
  const data = await chrome.storage.local.get(['urlHistory']);
  return data.urlHistory || [];
}

/**
 * Clear stored history.
 */
export async function clearUrlHistory() {
  await chrome.storage.local.set({ urlHistory: [] });
}

/**
 * Get whether auto-copy detection is enabled (default true).
 */
export async function isAutoShortenEnabled() {
  const data = await chrome.storage.local.get(['autoShortenEnabled']);
  return data.autoShortenEnabled !== false; // default true
}

/**
 * Set auto-copy detection toggle.
 */
export async function setAutoShortenEnabled(enabled) {
  await chrome.storage.local.set({ autoShortenEnabled: Boolean(enabled) });
}

/**
 * Clear action badge.
 */
export async function clearBadge() {
  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch {
    // Ignore in contexts without action
  }
}

/**
 * Set action badge text and background color.
 */
export async function setBadge(text, color = '#18181b') {
  try {
    await chrome.action.setBadgeText({ text: String(text) });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    // Ignore in contexts without action
  }
}

/**
 * Get account username for cloud sync.
 */
export async function getUsername() {
  const data = await chrome.storage.local.get(['username']);
  return data.username || '';
}

/**
 * Set account username.
 */
export async function setUsername(username) {
  const clean = username ? String(username).trim().toLowerCase() : '';
  await chrome.storage.local.set({ username: clean });
  return clean;
}

/**
 * Get saved session token for cloud sync.
 */
export async function getSessionToken() {
  const data = await chrome.storage.local.get(['sessionToken']);
  return data.sessionToken || '';
}

/**
 * Set saved session token.
 */
export async function setSessionToken(token) {
  await chrome.storage.local.set({ sessionToken: token || '' });
  return token || '';
}

/**
 * Get or create persistent guest ID for unauthenticated extension rate limiting.
 */
export async function getGuestId() {
  const data = await chrome.storage.local.get(['guestId']);
  if (data.guestId) return data.guestId;

  const newId = `guest_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)}`;
  await chrome.storage.local.set({ guestId: newId });
  return newId;
}
