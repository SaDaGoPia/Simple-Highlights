# Simple Highlights

Simple Highlights is a Chrome extension built on Manifest V3 for people who want a lightweight way to mark text, keep a persistent library of quotes, and recover those highlights when they return to the same page.

It is designed around a simple workflow:

1. Select text on any page.
2. Highlight it with a floating toolbar.
3. Revisit the page later and see the highlight restored.
4. Open the popup to search, sort, filter, and browse your saved highlights.

## Screenshots

| Floating toolbar & color picker | Highlighted passage | Popup library |
| --- | --- | --- |
| ![Floating toolbar with the color dropdown open, showing the active color checkmark](docs/screenshots/toolbar-color-picker.png) | ![A page with two highlighted passages in different pastel colors](docs/screenshots/highlighted-passage.png) | ![Popup showing the highlight library grouped by site, with search, filters, export/import, and per-item actions](docs/screenshots/popup-library.png) |

## Product Snapshot

- Fast inline highlighting with a compact floating toolbar.
- Four pastel highlight colors.
- Persistent local library stored in `chrome.storage.local`.
- Automatic restoration for previously saved highlights on matching URLs.
- Restoration logic for text that spans multiple DOM nodes, with no length cap on the saved text.
- Context-aware restoration to better distinguish repeated text fragments.
- Live highlight re-scan on SPA route changes (`pushState`/`replaceState`/`popstate`/`hashchange`).
- Popup search with tolerance for accents and special characters, persisted across sessions.
- Sort modes for common library browsing patterns.
- Site and color filters in the popup.
- Optional grouping by website.
- Jump from a popup entry straight to the highlight in its tab (opening the page if it isn't already open).
- Delete a highlight directly from the popup, not just from the live page.
- Export the full library to a JSON file and import it back in.
- Persistent popup preferences for grouping, sort mode, search query, and filters.
- All storage writes are serialized through the background service worker, so concurrent tabs can't silently drop each other's highlights.

## Interface Language

The extension UI is currently in Spanish.

This includes popup labels, helper copy, and several interaction messages. The repository documentation is written in English so the project remains easy to understand for a broader developer audience.

## What It Does Well

### Highlighting

- A floating toolbar appears near the current selection.
- The toolbar lets the user apply a highlight or choose a color.
- The latest selected color is remembered during the session, with a checkmark on the active swatch.

### Highlight Removal

- Hovering an existing highlight reveals a `Remove` button.
- The button stays visible briefly before hiding.
- Hiding uses a fade-out transition rather than disappearing abruptly.
- Highlights can also be deleted from the popup library; open tabs showing that highlight remove it live via a background broadcast.

### Persistent Library

Each saved highlight records:

- Unique id.
- Original page URL.
- Hostname.
- Page title.
- Highlight text (stored in full — no truncation, so long selections restore correctly).
- Selected color.
- Creation timestamp.
- Prefix and suffix context used to improve restoration accuracy.

### Restoration

- Highlights are restored automatically when the user returns to the same URL.
- Restoration includes a retry pass for pages that render content after `document_idle`.
- Matching is not limited to single text nodes.
- Repeated text is resolved more accurately through stored context.
- On single-page apps, a URL-change watcher unwraps stale highlights and re-runs restoration for the new route without needing a full reload.

### Popup Library

- Displays the saved highlight collection.
- Supports live search, persisted across popup sessions.
- Search is tolerant to accents and punctuation-like differences.
- Can sort by relevance, newest, oldest, or site A-Z.
- Can filter by site and by highlight color.
- Can switch between grouped-by-site and flat-list views.
- Remembers sort, grouping, search, and filter preferences across popup sessions.
- "Abrir" jumps to the highlight's tab (or opens the page if it's closed) and scrolls to/flashes the highlight.
- "Eliminar" removes a highlight without needing to revisit the page.
- "Exportar" downloads the full library as a JSON backup file.
- "Importar" merges a previously exported JSON file back into the library (existing ids are skipped, so re-importing the same file is a no-op).

## Project Structure

```text
SIMPLE-HIGHLIGHTS/
  manifest.json
  README.md
  scripts/
    generate-icons.ps1
  src/
    assets/
      icons/
        icon-16.png
        icon-32.png
        icon-48.png
        icon-128.png
    background/
      service-worker.js
    content/
      content-script.js
      modules/
        floating-toolbar.js
        highlighter.js
        selection.js
        spa-watcher.js
        state.js
      styles/
        highlight.css
    popup/
      popup.css
      popup.html
      popup.js
    shared/
      highlight-library.js
```

## Technical Notes

- Built as a Chrome Extension using Manifest V3.
- Uses a background service worker as the single writer for `chrome.storage.local`, reached via `chrome.runtime.sendMessage` from content scripts and the popup. This closes a race where two tabs saving near-simultaneously could otherwise drop one highlight.
- Uses safe DOM operations such as `Range`, `Selection`, `createElement`, and `textContent`.
- Avoids `eval()` and `innerHTML` for core UI rendering.
- Uses `chrome.storage.local` for the highlight library and popup preferences.
- Uses the `tabs` permission so the popup can find, focus, or open the tab a highlight belongs to, and so the background worker can broadcast removals to open tabs.

## Security Notes

- Strict extension page CSP:
  - `script-src 'self'`
  - `object-src 'none'`
  - `base-uri 'none'`
- Minimal permission scope: `storage` and `tabs`.
- No deprecated background page model.

## Install Locally in Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select the `SIMPLE-HIGHLIGHTS` folder.
5. Open a website and select text.
6. Use the floating toolbar to highlight.
7. Open the extension popup to browse the saved library.

## Typical User Flow

1. Select a piece of text.
2. Click `Highlight`.
3. Hover the highlight later if you want to remove it, or delete it from the popup.
4. Open the popup to search, filter, or organize saved highlights.
5. Use "Abrir" on a popup entry to jump straight back to that highlight, even in a closed tab.
6. Reopen the same page later and let the extension restore the saved marks.
7. Export the library occasionally as a backup, or import one on a fresh profile.

## Current Limitations

- Restoration is tied to the exact URL currently saved with the highlight (including query strings), so pages that append volatile parameters won't match.
- Extremely dynamic pages can still produce edge cases where restoration is incomplete.
- The icon set is a generated placeholder, not a designed brand asset.

## Roadmap Ideas

- Optional sync support for the highlight library and settings. `chrome.storage.sync` caps out at 100KB total / 8KB per item, which is too small for a full library with saved text and context — the shape this should take (settings-only sync vs. a quota-aware chunked library sync) is still an open decision, parked for a future pass.
- Per-color and per-site combined saved views (e.g. named smart filters).
- A dedicated icon/brand design to replace the generated placeholder.
