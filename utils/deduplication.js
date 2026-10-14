/**
 * Deduplication Utility for Shawty URL Shortener.
 *
 * Prevents redundant backend API calls when a URL is detected
 * concurrently through multiple channels (e.g., in-page copy event
 * followed immediately by clipboard watcher polling).
 */

export class UrlDeduplicator {
  /**
   * @param {number} windowMs Time window in milliseconds to consider a URL a duplicate (default: 5000ms)
   */
  constructor(windowMs = 5000) {
    this.windowMs = windowMs;
    this.cache = new Map(); // normalizedUrl -> timestamp
  }

  /**
   * Checks whether the given URL was recently processed within the time window.
   * @param {string} url
   * @returns {boolean}
   */
  isDuplicate(url) {
    if (!url || typeof url !== 'string') return false;
    this.prune();
    const key = url.trim().toLowerCase();
    const timestamp = this.cache.get(key);
    if (timestamp && Date.now() - timestamp < this.windowMs) {
      return true;
    }
    return false;
  }

  /**
   * Records a URL as processed at the current time.
   * @param {string} url
   */
  markProcessed(url) {
    if (!url || typeof url !== 'string') return;
    this.prune();
    const key = url.trim().toLowerCase();
    this.cache.set(key, Date.now());
  }

  /**
   * Prunes entries older than the deduplication window.
   */
  prune() {
    const now = Date.now();
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.windowMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears all cached entries.
   */
  clear() {
    this.cache.clear();
  }
}

// Default singleton instance with 5-second deduplication window
export const deduplicator = new UrlDeduplicator(5000);
