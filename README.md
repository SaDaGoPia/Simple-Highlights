# Simple Highlights

Simple Highlights is a Chrome extension built on Manifest V3 for people who want a lightweight way to mark text, keep a persistent library of quotes, and recover those highlights when they return to the same page.

It is designed around a simple workflow:

1. Select text on any page.
2. Highlight it with a floating toolbar.
3. Revisit the page later and see the highlight restored.
4. Open the popup to search, sort, and browse your saved highlights.

## Product Snapshot

- Fast inline highlighting with a compact floating toolbar.
- Four pastel highlight colors.
- Persistent local library stored in `chrome.storage.local`.
- Automatic restoration for previously saved highlights on matching URLs.
- Improved restoration logic for text that spans multiple DOM nodes.
- Context-aware restoration to better distinguish repeated text fragments.
- Popup search with tolerance for accents and special characters.
- Sort modes for common library browsing patterns.
- Optional grouping by website.
- Persistent popup preferences for grouping and sort mode.

## Interface Language

The extension UI is currently in Spanish.

This includes popup labels, helper copy, and several interaction messages. The repository documentation is written in English so the project remains easy to understand for a broader developer audience.

## What It Does Well

### Highlighting

- A floating toolbar appears near the current selection.
- The toolbar lets the user apply a highlight or choose a color.
- The latest selected color is remembered during the session.

### Highlight Removal

- Hovering an existing highlight reveals a `Remove` button.
- The button stays visible briefly before hiding.
- Hiding uses a fade-out transition rather than disappearing abruptly.

### Persistent Library

Each saved highlight records:

- Unique id.
- Original page URL.
- Hostname.
- Page title.
- Highlight text.
- Selected color.
- Creation timestamp.
- Prefix and suffix context used to improve restoration accuracy.

### Restoration

- Highlights are restored automatically when the user returns to the same URL.
- Restoration includes a retry pass for pages that render content after `document_idle`.
- Matching is not limited to single text nodes.
- Repeated text is resolved more accurately through stored context.

### Popup Library

- Displays the saved highlight collection.
- Supports live search.
- Search is tolerant to accents and punctuation-like differences.
- Can sort by relevance, newest, oldest, or site A-Z.
- Can switch between grouped-by-site and flat-list views.
- Remembers sort and grouping preferences across popup sessions.

## Project Structure

```text
SIMPLE-HIGHLIGHTS/
  manifest.json
  README.md
  src/
    background/
      service-worker.js
    content/
      content-script.js
      modules/
        floating-toolbar.js
        highlighter.js
        selection.js
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
- Uses a background service worker.
- Uses safe DOM operations such as `Range`, `Selection`, `createElement`, and `textContent`.
- Avoids `eval()` and `innerHTML` for core UI rendering.
- Uses `chrome.storage.local` for persistence.

## Security Notes

- Strict extension page CSP:
  - `script-src 'self'`
  - `object-src 'none'`
  - `base-uri 'none'`
- Minimal permission scope focused on storage.
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
3. Hover the highlight later if you want to remove it.
4. Open the popup to search or organize saved highlights.
5. Reopen the same page later and let the extension restore the saved marks.

## Current Limitations

- Restoration is tied to the exact URL currently saved with the highlight.
- Extremely dynamic pages can still produce edge cases where restoration is incomplete.
- Popup preferences persist, but the current search query is not yet persisted.
- Library actions are still focused on browse/search; there is no export, sync, or jump-to-page action yet.

## Roadmap Ideas

- Jump from a popup result to the matching highlight in the active tab.
- Export and import library backups.
- Optional sync support for settings and highlights.
- Per-site filters and color-based filters in the popup.
- Better handling for highly dynamic SPA navigation.
