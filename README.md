# ⚡ Shawty URL Shortener - Chrome Extension (Manifest V3)

[![GitHub Stars](https://img.shields.io/badge/GitHub-Star%20Repo-blue?logo=github&style=for-the-badge)](https://github.com)
[![GitHub Forks](https://img.shields.io/badge/GitHub-Fork%20Repo-orange?logo=github&style=for-the-badge)](https://github.com)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-success?style=for-the-badge&logo=googlechrome)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](LICENSE)

A privacy-focused, intelligent **Chrome Extension (Manifest V3)** that automatically detects qualifying long URLs copied across webpages or the clipboard, validates and deduplicates them in a unified pipeline, and generates instant short links via the **Shawty** backend.

---

## 🌟 Support the Project: Star & Fork!

If you find Shawty helpful or use it in your daily browsing:

> **⭐ Star this repository** on GitHub to show your support and follow ongoing development!  
> **🍴 Fork this repository** to customize, contribute new features, or self-host your own instance!
>
> 💡 **Why Star or Fork?**  
> Connecting your GitHub username in the extension checks whether you have starred or forked the Shawty repository. Doing so unlocks the **Unlimited Cloud Tier**, lifting the 10 URLs/day guest limit and enabling bidirectional cloud sync across all your devices!

---

## ✨ Features

- **Automated Copy Interception**: Automatically detects qualifying URLs ($\ge 35$ characters) when you copy text on any webpage.
- **Background Clipboard Watcher**: Uses Chrome Manifest V3 `offscreen` document to periodically check clipboard text without interrupting your workflow.
- **100% Privacy-Preserving**:
  - Non-URLs are discarded immediately in memory.
  - Zero arbitrary clipboard text is ever sent to the server or persisted to storage.
  - **Never automatically overwrites your clipboard** — user retains full control with explicit 1-click **Copy** buttons.
- **Context Menus**: Right-click any hyperlink, selected text, or page background to shorten immediately.
- **Two-View Segmented Carousel UI**:
  - **Shorten View**: Manual input with URL validation, quota indicators, and recent shortened link card.
  - **Recent Links View**: History of your last 25 shortened links with source attribution tags (`[Page Copy]`, `[Clipboard]`, `[Manual Input]`, `[Context Menu]`).
- **Quota & Tier System**:
  - **Guest Tier**: **10 URLs / 1 day** with automatic `X-Guest-ID` tracking.
  - **Connected Account Tier**: **Unlimited URLs** + cloud link synchronization.
  - **429 Rate Limit Notifications**: If the daily limit is hit, non-intrusive desktop notifications and status badges (`!`) alert you immediately.
- **Dynamic Connection Monitoring**: Live health check badge showing whether the backend API is online or unreachable.

---

## 🌐 Finding the Latest Working `BASE_URL`

The extension communicates with the Shawty Shortener API backend. You can find the active endpoint and configure it as follows:

| Environment | Endpoint URL | Status Check |
| :--- | :--- | :--- |
| **Official Production API** | `https://shawty.hopto.org` | [`https://shawty.hopto.org/api/health`](https://shawty.hopto.org/api/health) |
| **Official Web Frontend** | `https://shawty.hopto.org` | Open in browser to manage cloud links or sign up |
| **Local Development** | `http://localhost:8080` | Local Go/Node/Express Shawty server |

### Where to Find the Working `BASE_URL`:
1. **In `.env.example`**: The `.env.example` file in the root of this extension contains the latest verified public production URL:
   ```env
   BASE_URL=https://shawty.hopto.org
   ```
2. **In [utils/storage.js](utils/storage.js)**: The fallback default is declared as:
   ```javascript
   export const DEFAULT_API_BASE = 'https://shawty.hopto.org';
   ```
3. **In the Extension Popup**: The top-right badge dynamically pings `${BASE_URL}/api/health` and shows a green **Online** or red **Offline** indicator. Hovering over the badge displays the exact URL currently connected.

---

## 🛠️ Setup & Configuration

The extension automatically reads configuration from `.env` inside the extension directory.

### 1. Configure the Backend URL
Create your `.env` file from the provided example:

```bash
# In the extension root directory
cp .env.example .env
```

Open `.env` in your editor:
```env
# Set to the official backend or your self-hosted server
BASE_URL=https://shawty.hopto.org
```

> **How `BASE_URL` Resolution Works (Order of Priority):**
> 1. Custom API Base URL configured in extension storage (if set).
> 2. `BASE_URL` defined in `.env`.
> 3. `BASE_URL` defined in `.env.example`.
> 4. Hardcoded fallback default (`https://shawty.hopto.org`).

---

## 🚀 How to Install

Works on all modern Chromium-based browsers, including **Google Chrome**, **Brave**, **Microsoft Edge**, **Vivaldi**, and **Arc**.

### Step 1: Clone or Download the Repository
```bash
git clone https://github.com/your-username/url-shortner-extension.git
cd url-shortner-extension
```

### Step 2: Setup Environment
Ensure your `.env` file is present in the extension root:
```bash
cp .env.example .env
```

### Step 3: Load into Your Browser
1. Open your browser and navigate to the Extensions page:
   - **Chrome**: `chrome://extensions/`
   - **Brave**: `brave://extensions/`
   - **Edge**: `edge://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click the **Load unpacked** button in the top-left corner.
4. Select the directory containing `manifest.json` (this repository's root folder).
5. The **Shawty** extension card will appear in your extensions list!

### Step 4: Pin to Toolbar
Click the Puzzle icon in your browser toolbar and pin **Shawty** for 1-click access to your shortened links and history.

---

## 🔄 How the Shortening Pipeline Works

All intake channels converge into a centralized pipeline:

```
Candidate Input (Copy Event / Clipboard Watcher / Context Menu / Manual Form)
                              ↓
                      Normalize & Trim
                              ↓
             Validate URL (isValidLongUrl, min length ≥ 35)
                              ↓
                 Verify Protocol (http: / https:)
                              ↓
          Deduplicate recently processed URLs (5s window)
                              ↓
                   Call Shawty API (POST /api/shorten)
                  [Attaches X-Guest-ID or Bearer Token]
                              ↓
            Success                          Failure (429 / Error)
               ↓                                       ↓
   Save to local history                  Trigger 429 Notification
   Update Action Badge (✓)                Set Action Badge (!)
   Show success notification              Show error toast in popup
```

### Rate Limiting & Quotas:
- **Guest Users**: Default quota is **10 URLs per 1 day**.
- **Rate Limit Trigger (HTTP 429)**:
  - Background Service Worker displays a desktop notification:  
    *`URL shortening failed: Too many attempts (429). Guest users get 10 URLs / 1 day.`*
  - Badge turns to a red alert mark (`!`).
  - Popup manual form shows a dedicated error toast with upgrade instructions.
- **Connect GitHub Account**: Open Extension Settings (⚙️ icon) > enter your GitHub username > click **Connect**. Once verified (via Star/Fork), your limit is upgraded to unlimited.

---

## 📂 Project Structure

```
url-shortner-extension/
├── .env.example                 # Default environment template (BASE_URL)
├── .env                         # Local environment configuration (git-ignored)
├── manifest.json                # Manifest V3 extension configuration
├── background/
│   └── service-worker.js        # Background coordinator, notifications & pipeline executor
├── content/
│   ├── content.js               # Flow 1: Webpage copy event listener (ISOLATED world)
│   └── page-script.js           # Supplementary page hooks (MAIN world)
├── offscreen/
│   ├── offscreen.html           # Offscreen DOM wrapper for clipboard permission
│   └── offscreen.js             # Flow 2: Periodic clipboard observer & privacy filter
├── popup/
│   ├── popup.html               # Popup UI (Shorten & Recent Links carousel)
│   ├── popup.css                # Dark minimalist styling & responsive layout
│   └── popup.js                 # Popup state management, clipboard & account sync
├── services/
│   ├── shortening-api.js        # API client (shortenUrl, verifyUser, syncCloudLinks)
│   └── url-validator.js         # URL validation, length thresholds & blacklist filters
├── utils/
│   ├── deduplication.js         # In-memory deduplicator (5s window)
│   └── storage.js               # chrome.storage.local wrapper, guestId & BASE_URL loader
└── icons/
    ├── icon16.png               # Toolbar & context menu icon
    ├── icon32.png               # High-DPI standard display icon
    ├── icon48.png               # Extension manager icon
    └── icon128.png              # Chrome Web Store & notification icon
```

---

## 🔒 Permissions & Security

| Permission | Purpose |
| :--- | :--- |
| `storage` | Stores user preferences, local link history, and authentication session token. |
| `notifications` | Displays desktop alerts when links are shortened or when rate limits (429) are reached. |
| `contextMenus` | Adds right-click options ("Shorten this link with Shawty"). |
| `clipboardRead` | Allows the offscreen document to monitor copied URLs in the background. |
| `offscreen` | Grants access to an offscreen DOM context required for clipboard access in Manifest V3. |

---

## ❓ Troubleshooting

**Q: The status badge says "Offline".**  
- Verify that your `BASE_URL` in `.env` is reachable.
- Visit `${BASE_URL}/api/health` in your browser. If using local development, ensure your backend server is running on `http://localhost:8080`.
- After changing `.env`, go to `chrome://extensions/` and click the **Reload** (circular arrow) icon on the Shawty card.

**Q: Shortening fails with "Too many attempts (429)".**  
- Guest users receive 10 URL shortenings per day.
- Open the extension > click **Settings (⚙️)** > enter your GitHub username and click **Connect**. Ensure you have starred or forked the repo to unlock the unlimited tier.

**Q: URLs under 35 characters are not auto-shortening.**  
- By design, Shawty enforces a 35-character minimum threshold for automatic interception to prevent unnecessary shortening of already short domains. You can manually shorten any valid URL in the popup.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
