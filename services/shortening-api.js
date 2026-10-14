import { getApiBaseUrl, getUsername, getSessionToken, getGuestId } from '../utils/storage.js';

/**
 * Isolated Shortening API service for interacting with the Shawty backend.
 */

async function tryFetchShorten(endpoint, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const sessionToken = await getSessionToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const guestId = await getGuestId();
  if (guestId) {
    headers['X-Guest-ID'] = guestId;
  }
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let json = {};
    try {
      json = await response.json();
    } catch {
      // Body may not be valid JSON
    }

    if (!response.ok) {
      const isRateLimit = response.status === 429;
      const defaultMsg = isRateLimit
        ? 'Too many attempts (429): Guest users get 10 URLs / 1 day.'
        : `Server returned status ${response.status}`;
      const errorMsg = json.error || json.message || defaultMsg;
      const error = new Error(errorMsg);
      error.status = response.status;
      error.statusCode = response.status;
      error.isRateLimited = isRateLimit;
      throw error;
    }
    return json.data || json;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Shorten a valid URL candidate using the Shawty backend API.
 * @param {string} url The validated long URL
 * @param {object} [options]
 * @returns {Promise<{ shortUrl: string, originalUrl: string, code: string, expiresAt: string, createdAt: string }>}
 */
export async function shortenUrl(url, options = {}) {
  const baseUrl = await getApiBaseUrl();
  const username = await getUsername();
  const payload = {
    url,
    ...(username && { username }),
    ...(options.customAlias && { customAlias: options.customAlias }),
    ...(options.expiresInHours && { expiresInHours: options.expiresInHours }),
    includeQr: false,
  };

  const result = await tryFetchShorten(`${baseUrl}/api/shorten`, payload);

  let finalShortUrl = result.shortUrl || `${baseUrl}/${result.code}`;
  if (!/^https?:\/\//i.test(finalShortUrl)) {
    finalShortUrl = /(localhost|127\.0\.0\.1)/i.test(finalShortUrl)
      ? `http://${finalShortUrl}`
      : `https://${finalShortUrl}`;
  }

  return {
    code: result.code,
    shortUrl: finalShortUrl,
    originalUrl: result.originalUrl || url,
    expiresAt: result.expiresAt || null,
    createdAt: result.createdAt || new Date().toISOString(),
  };
}

/**
 * Health check ping to verify backend connectivity.
 * @returns {Promise<boolean>}
 */
export async function pingBackend() {
  try {
    const baseUrl = await getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Connect/verify GitHub username from extension with username in the URL to retrieve session token.
 */
export async function verifyUser(username) {
  const baseUrl = await getApiBaseUrl();
  const cleanUsername = encodeURIComponent(username.trim().toLowerCase());
  const res = await fetch(`${baseUrl}/api/auth/verify/${cleanUsername}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to verify GitHub username');
  }
  return data;
}

/**
 * Fetch cloud links for a user to synchronize history.
 */
export async function fetchUserLinks(limit = 25) {
  const baseUrl = await getApiBaseUrl();
  const sessionToken = await getSessionToken();
  const username = await getUsername();
  if (!username) return [];

  const headers = { Accept: 'application/json' };
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  const res = await fetch(`${baseUrl}/api/urls?limit=${limit}&username=${encodeURIComponent(username)}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.data || [];
}

/**
 * Bidirectional cloud sync: claims local anonymous link codes and returns full user cloud history.
 */
export async function syncCloudLinksWithLocal(localLinks = []) {
  const baseUrl = await getApiBaseUrl();
  const sessionToken = await getSessionToken();
  const username = await getUsername();
  if (!username) return [];

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  const res = await fetch(`${baseUrl}/api/urls/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      username,
      links: Array.isArray(localLinks) ? localLinks : [],
    }),
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.data || [];
}
