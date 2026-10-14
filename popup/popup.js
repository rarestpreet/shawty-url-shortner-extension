/**
 * Popup Logic for Shawty URL Shortener Extension.
 *
 * Provides:
 * - Current detection/shortening status.
 * - Clear indication of URL intake source:
 *     - Page Copy
 *     - Clipboard
 *     - Manual input
 *     - Context menu
 * - Explicit user "Copy" action (never overwrites clipboard automatically).
 * - History list with source tags.
 * - Manual URL shortening input.
 */

import {
  getLatestUrl,
  getUrlHistory,
  clearUrlHistory,
  getApiBaseUrl,
  isAutoShortenEnabled,
  setAutoShortenEnabled,
  clearBadge,
  saveShortenedUrl,
  getUsername,
  setUsername,
  getSessionToken,
  setSessionToken,
} from '../utils/storage.js';
import { shortenUrl, pingBackend, verifyUser, fetchUserLinks, syncCloudLinksWithLocal } from '../services/shortening-api.js';
import { validateUrl } from '../services/url-validator.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Header & Status Elements
  const backendBadge = document.getElementById('backend-status-badge');
  const backendText = document.getElementById('backend-status-text');
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const autoShortenToggle = document.getElementById('auto-shorten-toggle');
  const accountUsernameInput = document.getElementById('account-username-input');
  const saveUsernameBtn = document.getElementById('save-username-btn');
  const openSignupLink = document.getElementById('open-signup-link');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  // Latest Shortened Card Elements
  const latestCard = document.getElementById('latest-card');
  const latestSourceBadge = document.getElementById('latest-source-badge');
  const latestShortLink = document.getElementById('latest-short-link');
  const copyLatestBtn = document.getElementById('copy-latest-btn');
  const copyLatestText = document.getElementById('copy-latest-text');
  const latestOriginalUrl = document.getElementById('latest-original-url');
  const latestExpiry = document.getElementById('latest-expiry');
  const latestTime = document.getElementById('latest-time');

  // Manual Shorten Form Elements
  const manualForm = document.getElementById('manual-form');
  const manualUrlInput = document.getElementById('manual-url-input');
  const manualShortenBtn = document.getElementById('manual-shorten-btn');

  // History Elements
  const historyCount = document.getElementById('history-count');
  const tabHistoryBadge = document.getElementById('tab-history-badge');
  const historyEmpty = document.getElementById('history-empty');
  const historyList = document.getElementById('history-list');

  // Carousel & Segmented Tabs (2-Part Swipeable UI)
  const tabShortenBtn = document.getElementById('tab-shorten-btn');
  const tabHistoryBtn = document.getElementById('tab-history-btn');
  const carouselTrack = document.getElementById('carousel-track');
  const carouselViewport = document.getElementById('carousel-viewport');
  let activePage = 0;

  function setPage(pageIndex) {
    activePage = pageIndex;
    if (pageIndex === 0) {
      carouselTrack.style.transform = 'translateX(0%)';
      tabShortenBtn.classList.add('active');
      tabShortenBtn.setAttribute('aria-selected', 'true');
      tabHistoryBtn.classList.remove('active');
      tabHistoryBtn.setAttribute('aria-selected', 'false');
    } else {
      carouselTrack.style.transform = 'translateX(-50%)';
      tabHistoryBtn.classList.add('active');
      tabHistoryBtn.setAttribute('aria-selected', 'true');
      tabShortenBtn.classList.remove('active');
      tabShortenBtn.setAttribute('aria-selected', 'false');
      syncCloudLinks();
    }
  }

  if (tabShortenBtn) tabShortenBtn.addEventListener('click', () => setPage(0));
  if (tabHistoryBtn) tabHistoryBtn.addEventListener('click', () => setPage(1));

  // Touch & Swipe gesture handling
  if (carouselViewport) {
    let touchStartX = 0;
    carouselViewport.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    carouselViewport.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const diff = touchEndX - touchStartX;
      if (diff < -45 && activePage === 0) {
        setPage(1); // Swipe left -> Recent Links
      } else if (diff > 45 && activePage === 1) {
        setPage(0); // Swipe right -> Shorten Link
      }
    }, { passive: true });
  }

  // Toast
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  let currentLatestShortUrl = '';

  // Clear extension badge now that user has opened the popup
  clearBadge();

  // Helper to format source attribution
  function getSourceMeta(source) {
    switch (source) {
      case 'page_copy':
        return { text: 'Page Copy', cssClass: 'source-page-copy' };
      case 'clipboard':
        return { text: 'Clipboard', cssClass: 'source-clipboard' };
      case 'manual_input':
        return { text: 'Manual Input', cssClass: 'source-manual' };
      case 'context_menu':
        return { text: 'Context Menu', cssClass: 'source-context' };
      default:
        return { text: 'Detected', cssClass: 'source-page-copy' };
    }
  }

  // Toast Helper
  function showToast(message, isError = false) {
    toastMessage.textContent = message;
    toast.className = `toast show ${isError ? 'error' : ''}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 2400);
  }

  // Copy Helper (explicit user action)
  async function copyToClipboard(text, btnElement = null, textElement = null) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
      if (textElement) {
        const origText = textElement.textContent;
        textElement.textContent = 'Copied!';
        setTimeout(() => {
          textElement.textContent = origText;
        }, 1800);
      }
    } catch {
      showToast('Could not copy to clipboard', true);
    }
  }

  // Format Expiration Display (only date, no time)
  function formatExpiry(expiresAt) {
    if (!expiresAt) return '3 days from creation / last click';
    const date = new Date(expiresAt);
    if (isNaN(date.getTime())) return '3 days from creation / last click';
    return `Expires: ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} (extended on click)`;
  }

  // Format Relative Timestamp
  function formatRelativeTime(isoString) {
    if (!isoString) return 'Just now';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    return new Date(isoString).toLocaleDateString();
  }

  // Helper to ensure proper protocol for display
  function ensureProtocol(url) {
    if (!url) return url;
    const str = String(url).trim();
    if (/^https?:\/\//i.test(str)) return str;
    if (/(localhost|127\.0\.0\.1)/i.test(str)) return `http://${str}`;
    return `https://${str}`;
  }

  // Render Latest Shortened Card
  function renderLatest(record) {
    if (!record || !record.shortUrl) {
      latestCard.classList.add('hidden');
      return;
    }

    const displayShortUrl = ensureProtocol(record.shortUrl);
    currentLatestShortUrl = displayShortUrl;
    latestShortLink.textContent = displayShortUrl;
    latestShortLink.href = displayShortUrl;
    latestOriginalUrl.textContent = record.originalUrl;
    latestOriginalUrl.title = record.originalUrl;
    latestExpiry.textContent = formatExpiry(record.expiresAt);
    latestTime.textContent = formatRelativeTime(record.createdAt);

    // Update source badge
    const sourceMeta = getSourceMeta(record.source);
    if (latestSourceBadge) {
      latestSourceBadge.textContent = sourceMeta.text;
      latestSourceBadge.className = `source-badge ${sourceMeta.cssClass}`;
    }

    latestCard.classList.remove('hidden');
  }

  // Render History List
  function renderHistory(items) {
    if (historyCount) historyCount.textContent = items.length;
    if (tabHistoryBadge) tabHistoryBadge.textContent = items.length;

    if (!items || items.length === 0) {
      historyEmpty.classList.remove('hidden');
      historyList.classList.add('hidden');
      historyList.innerHTML = '';
      return;
    }

    historyEmpty.classList.add('hidden');
    historyList.classList.remove('hidden');
    historyList.innerHTML = '';

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'history-item';

      const info = document.createElement('div');
      info.className = 'history-info';

      const topRow = document.createElement('div');
      topRow.className = 'history-top-row';

      const shortUrl = ensureProtocol(item.shortUrl);
      const shortLink = document.createElement('a');
      shortLink.className = 'history-short';
      shortLink.href = shortUrl;
      shortLink.target = '_blank';
      shortLink.rel = 'noopener noreferrer';
      shortLink.textContent = shortUrl;

      topRow.appendChild(shortLink);

      const orig = document.createElement('span');
      orig.className = 'history-orig';
      orig.textContent = item.originalUrl;
      orig.title = item.originalUrl;

      info.appendChild(topRow);
      info.appendChild(orig);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-icon-copy';
      copyBtn.title = 'Copy short link';
      copyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      `;

      copyBtn.addEventListener('click', () => {
        copyToClipboard(item.shortUrl);
      });

      row.appendChild(info);
      row.appendChild(copyBtn);
      historyList.appendChild(row);
    });
  }

  // Load Data from Chrome Storage & Backend
  async function loadData() {
    const [latest, history, isOnline, autoEnabled, apiUrl, currentUsername] = await Promise.all([
      getLatestUrl(),
      getUrlHistory(),
      pingBackend(),
      isAutoShortenEnabled(),
      getApiBaseUrl(),
      getUsername(),
    ]);

    if (accountUsernameInput) {
      accountUsernameInput.value = currentUsername || '';
      if (currentUsername) {
        accountUsernameInput.readOnly = true;
        saveUsernameBtn.textContent = 'Edit';
        saveUsernameBtn.classList.add('btn-edit-mode');
      } else {
        accountUsernameInput.readOnly = false;
        saveUsernameBtn.textContent = 'Connect';
        saveUsernameBtn.classList.remove('btn-edit-mode');
      }
    }

    // Backend status
    if (isOnline) {
      backendBadge.className = 'status-badge online';
      backendText.textContent = 'Online';
      backendBadge.title = `Connected to ${apiUrl}`;
    } else {
      backendBadge.className = 'status-badge offline';
      backendText.textContent = 'Offline';
      backendBadge.title = `Cannot reach ${apiUrl}. Check backend status.`;
    }

    // Auto-shorten checkbox
    if (autoShortenToggle) autoShortenToggle.checked = autoEnabled;

    // Quota display (Guest vs Connected)
    const quotaText = document.getElementById('quota-text');
    const quotaInfoRow = document.getElementById('quota-info-row');
    if (quotaText) {
      if (currentUsername) {
        quotaText.textContent = `Connected as @${currentUsername} (Unlimited)`;
        if (quotaInfoRow) quotaInfoRow.classList.add('connected');
      } else {
        quotaText.textContent = 'Guest users get 10 URLs / 1 day';
        if (quotaInfoRow) quotaInfoRow.classList.remove('connected');
      }
    }

    renderLatest(latest);
    renderHistory(history);

    // If connected to an account, sync recent links from cloud
    await syncCloudLinks();
  }

  // On-demand Cloud Sync (runs when popup opens and on user interaction)
  async function syncCloudLinks() {
    try {
      const [currentUsername, isOnline] = await Promise.all([
        getUsername(),
        pingBackend(),
      ]);

      if (!currentUsername || !isOnline) return;

      const history = await getUrlHistory();

      // Perform bidirectional sync: claims/upserts local links on cloud and fetches full user list
      const cloudLinks = await syncCloudLinksWithLocal(history);
      if (Array.isArray(cloudLinks) && cloudLinks.length > 0) {
        let updated = false;

        for (const cl of cloudLinks) {
          if (!history.some((h) => h.code === cl.code)) {
            await saveShortenedUrl({
              code: cl.code,
              shortUrl: cl.shortUrl,
              originalUrl: cl.originalUrl,
              expiresAt: cl.expiresAt,
              createdAt: cl.createdAt,
              source: 'cloud_sync',
            });
            updated = true;
          }
        }

        if (updated) {
          const refreshed = await getUrlHistory();
          renderHistory(refreshed);
        }
      }
    } catch (err) {
      console.debug('[Shawty Sync] Cloud sync note:', err.message);
    }
  }

  // Copy Latest Short Link
  copyLatestBtn.addEventListener('click', () => {
    if (currentLatestShortUrl) {
      copyToClipboard(currentLatestShortUrl, copyLatestBtn, copyLatestText);
    }
  });

  // Settings Drawer Toggles
  settingsToggleBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  autoShortenToggle.addEventListener('change', async (e) => {
    await setAutoShortenEnabled(e.target.checked);
    showToast(e.target.checked ? 'Auto-detection enabled' : 'Auto-detection disabled');
  });

  // Account username connect/disconnect/edit
  if (saveUsernameBtn && accountUsernameInput) {
    saveUsernameBtn.addEventListener('click', async () => {
      // If currently connected (read-only) and button shows "Edit":
      if (accountUsernameInput.readOnly) {
        accountUsernameInput.readOnly = false;
        saveUsernameBtn.textContent = 'Connect';
        saveUsernameBtn.classList.remove('btn-edit-mode');
        accountUsernameInput.focus();
        return;
      }

      // If button shows "Connect" and input is writable:
      const rawUser = accountUsernameInput.value.trim().toLowerCase();
      if (!rawUser) {
        await setUsername('');
        await setSessionToken('');
        accountUsernameInput.readOnly = false;
        saveUsernameBtn.textContent = 'Connect';
        saveUsernameBtn.classList.remove('btn-edit-mode');
        showToast('Switched to local-only storage');
        await loadData();
        return;
      }

      saveUsernameBtn.disabled = true;
      saveUsernameBtn.textContent = '...';

      try {
        const authResult = await verifyUser(rawUser);
        await setUsername(authResult.user.username);
        if (authResult.sessionToken) {
          await setSessionToken(authResult.sessionToken);
        }
        accountUsernameInput.value = authResult.user.username;
        accountUsernameInput.readOnly = true;
        saveUsernameBtn.textContent = 'Edit';
        saveUsernameBtn.classList.add('btn-edit-mode');
        showToast(`Connected to @${authResult.user.username}!`);
        await loadData();
      } catch (err) {
        showToast(err.message || 'Could not verify username', true);
        saveUsernameBtn.textContent = 'Connect';
        saveUsernameBtn.classList.remove('btn-edit-mode');
        accountUsernameInput.readOnly = false;
      } finally {
        saveUsernameBtn.disabled = false;
      }
    });
  }

  if (openSignupLink) {
    openSignupLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const apiUrl = await getApiBaseUrl();
      const targetUrl = `${apiUrl}/#signup`;
      chrome.tabs.create({ url: targetUrl });
    });
  }


  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
      await clearUrlHistory();
      renderHistory([]);
      showToast('History cleared');
    });
  }

  // Manual Shorten Submission (Flow: Manual input)
  manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const candidate = manualUrlInput.value.trim();

    const validation = validateUrl(candidate, 35);
    if (!validation.isValid) {
      showToast(validation.reason || 'Invalid URL (must be ≥ 35 chars)', true);
      return;
    }

    manualShortenBtn.disabled = true;
    manualShortenBtn.innerHTML = '<span>...</span>';

    try {
      const result = await shortenUrl(validation.normalizedUrl);
      const record = {
        ...result,
        source: 'manual_input',
      };
      await saveShortenedUrl(record);

      manualUrlInput.value = '';
      showToast('🎉 Link shortened successfully!');

      renderLatest(record);
      setPage(0);
      const history = await getUrlHistory();
      renderHistory(history);
    } catch (err) {
      const isRateLimit =
        err.status === 429 ||
        err.statusCode === 429 ||
        err.isRateLimited ||
        err.message?.includes('429') ||
        /too many/i.test(err.message || '');

      if (isRateLimit) {
        showToast('Too many attempts (429): Guest users get 10 URLs / 1 day', true);
        if (typeof chrome !== 'undefined' && chrome.notifications) {
          chrome.notifications.create(
            `shawty_popup_429_${Date.now()}`,
            {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/icon128.png'),
              title: 'Too Many Attempts (429)',
              message: 'URL shortening failed: Too many attempts (429). Guest users get 10 URLs / 1 day. Connect your GitHub account in settings.',
              priority: 1,
              requireInteraction: false,
            },
            () => {}
          );
        }
      } else {
        showToast(err.message || 'Failed to shorten URL', true);
      }
    } finally {
      manualShortenBtn.disabled = false;
      manualShortenBtn.innerHTML = '<span>Shorten</span>';
    }
  });

  // Listen for real-time background updates if popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.latestShortened) {
        renderLatest(changes.latestShortened.newValue);
      }
      if (changes.urlHistory) {
        renderHistory(changes.urlHistory.newValue || []);
      }
    }
  });

  // Initial load
  await loadData();
});
