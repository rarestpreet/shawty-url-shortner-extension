/**
 * Centralized URL Validation Service for Shawty URL Shortener.
 *
 * Implements the unified validation pipeline required across:
 * - Content script copy events (Flow 1)
 * - Offscreen clipboard analysis (Flow 2)
 * - Manual user input
 * - Context menu actions
 */

export const MIN_URL_LENGTH = 35;

// Common public shorteners to avoid recursive shortening loops
const KNOWN_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'cutt.ly',
  'rb.gy',
  'shorturl.at',
  'shawty.hopto.org',
  'localhost',
  '127.0.0.1',
]);

/**
 * Standard specification URL validator:
 * 1. Trim whitespace
 * 2. Minimum length check (default >= 35)
 * 3. Construct URL using new URL()
 * 4. Allow only http: and https:
 * 5. Return boolean (true/false)
 *
 * @param {string} text
 * @param {number} [minLength=35]
 * @returns {boolean}
 */
export function isValidLongUrl(text, minLength = MIN_URL_LENGTH) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();

  // Minimum length check
  if (trimmed.length < minLength) return false;

  // Reject candidates containing internal whitespace or newlines
  if (/\s/.test(trimmed)) return false;

  let candidate = trimmed;
  // If scheme is omitted, only allow if it starts with a plausible domain
  if (!/^https?:\/\//i.test(trimmed)) {
    const plausibleDomainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+(\/|$)/;
    if (plausibleDomainRegex.test(trimmed)) {
      candidate = `https://${trimmed}`;
    } else {
      return false;
    }
  }

  try {
    const parsed = new URL(candidate);

    // Strictly allow only http: and https:
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) return false;

    // Check for IP or localhost
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const isIpv6 = hostname.startsWith('[') && hostname.endsWith(']');
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (!isIpv4 && !isIpv6 && !isLocalhost) {
      if (!hostname.includes('.')) return false;
      const labels = hostname.split('.');
      const tld = labels[labels.length - 1];
      if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) {
        return false;
      }
    }

    // Reject known shorteners
    if (KNOWN_SHORTENERS.has(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a qualifying URL string into an absolute URL string.
 * @param {string} text
 * @returns {string|null}
 */
export function normalizeUrl(text) {
  if (!text || typeof text !== 'string') return null;

  let trimmed = text.trim();
  // Strip outer quotes or angle brackets if present
  trimmed = trimmed.replace(/^["'<(\[]+|[>"')\]]+$/g, '');

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    candidate = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Detailed validator providing diagnostic info for UI error messages.
 * @param {string} raw
 * @param {number} [minLength=35]
 * @returns {{ isValid: boolean, normalizedUrl?: string, reason?: string }}
 */
export function validateUrl(raw, minLength = MIN_URL_LENGTH) {
  if (!raw || typeof raw !== 'string') {
    return { isValid: false, reason: 'Empty or non-string input' };
  }

  const trimmed = raw.trim();

  if (trimmed.length < minLength) {
    return { isValid: false, reason: `Length (${trimmed.length}) is less than minimum (${minLength})` };
  }

  if (/\s/.test(trimmed)) {
    return { isValid: false, reason: 'Contains space or newline characters' };
  }

  let hostname = '';
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    hostname = new URL(candidate).hostname.toLowerCase();
  } catch {
    // If invalid URL structure, will be caught by isValidLongUrl below
  }

  if (hostname && KNOWN_SHORTENERS.has(hostname)) {
    const isOurService = hostname === 'shawty.hopto.org' || hostname === 'localhost' || hostname === '127.0.0.1';
    return {
      isValid: false,
      reason: isOurService
        ? 'Cannot shorten a URL that is already a Shawty short link'
        : `Cannot shorten a URL already shortened by another service (${hostname})`,
    };
  }

  if (!isValidLongUrl(trimmed, minLength)) {
    return { isValid: false, reason: 'Not a valid http/https URL' };
  }

  const normalized = normalizeUrl(trimmed);
  if (!normalized) {
    return { isValid: false, reason: 'Could not normalize URL' };
  }

  return {
    isValid: true,
    normalizedUrl: normalized,
  };
}
