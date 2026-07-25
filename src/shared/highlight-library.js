"use strict";

(() => {
  const STORAGE_KEY = "simpleHighlightsLibrary";
  const MAX_CONTEXT_LENGTH = 120;

  function createHighlightId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function normalizeText(inputText) {
    if (typeof inputText !== "string") {
      return "";
    }

    return inputText.replace(/\s+/g, " ").trim();
  }

  function normalizeContext(inputText) {
    const normalized = normalizeText(inputText);
    if (!normalized) {
      return "";
    }

    if (normalized.length <= MAX_CONTEXT_LENGTH) {
      return normalized;
    }

    return normalized.slice(0, MAX_CONTEXT_LENGTH);
  }

  function getHostname(urlValue) {
    try {
      return new URL(urlValue).hostname;
    } catch (_error) {
      return "unknown-site";
    }
  }

  async function getLibrary() {
    if (!chrome?.storage?.local) {
      return [];
    }

    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const savedItems = data?.[STORAGE_KEY];
      return Array.isArray(savedItems) ? savedItems : [];
    } catch (error) {
      console.warn("No se pudo leer la biblioteca de highlights.", error);
      return [];
    }
  }

  async function saveLibrary(items) {
    if (!chrome?.storage?.local) {
      return;
    }

    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: items });
    } catch (error) {
      console.warn("No se pudo guardar la biblioteca de highlights.", error);
    }
  }

  async function addHighlight(record) {
    const normalizedText = normalizeText(record?.text);
    if (!normalizedText) {
      return null;
    }

    const entry = {
      id: typeof record?.id === "string" && record.id ? record.id : createHighlightId(),
      url: typeof record?.url === "string" ? record.url : "",
      hostname: getHostname(record?.url),
      pageTitle: typeof record?.pageTitle === "string" ? record.pageTitle : "Untitled page",
      text: normalizedText,
      color: typeof record?.color === "string" ? record.color : "#fae082",
      prefixContext: normalizeContext(record?.prefixContext),
      suffixContext: normalizeContext(record?.suffixContext),
      createdAt: new Date().toISOString()
    };

    const existingItems = await getLibrary();
    existingItems.unshift(entry);
    await saveLibrary(existingItems);
    return entry;
  }

  async function removeHighlight(highlightId) {
    if (typeof highlightId !== "string" || !highlightId) {
      return;
    }

    const existingItems = await getLibrary();
    const filteredItems = existingItems.filter((item) => item.id !== highlightId);
    await saveLibrary(filteredItems);
  }

  function buildImportedEntry(record) {
    const normalizedText = normalizeText(record?.text);
    if (!normalizedText) {
      return null;
    }

    const createdAt = Date.parse(record?.createdAt || "");

    return {
      id: typeof record?.id === "string" && record.id ? record.id : createHighlightId(),
      url: typeof record?.url === "string" ? record.url : "",
      hostname: getHostname(record?.url),
      pageTitle: typeof record?.pageTitle === "string" ? record.pageTitle : "Untitled page",
      text: normalizedText,
      color: typeof record?.color === "string" ? record.color : "#fae082",
      prefixContext: normalizeContext(record?.prefixContext),
      suffixContext: normalizeContext(record?.suffixContext),
      createdAt: Number.isNaN(createdAt) ? new Date().toISOString() : new Date(createdAt).toISOString()
    };
  }

  async function importHighlights(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return { importedCount: 0, skippedCount: 0 };
    }

    const existingItems = await getLibrary();
    const existingIds = new Set(existingItems.map((item) => item.id));

    let importedCount = 0;
    let skippedCount = 0;

    for (const rawItem of rawItems) {
      const entry = buildImportedEntry(rawItem);
      if (!entry || existingIds.has(entry.id)) {
        skippedCount += 1;
        continue;
      }

      existingIds.add(entry.id);
      existingItems.push(entry);
      importedCount += 1;
    }

    if (importedCount > 0) {
      await saveLibrary(existingItems);
    }

    return { importedCount, skippedCount };
  }

  globalThis.SimpleHighlightsLibrary = Object.freeze({
    createHighlightId,
    getLibrary,
    addHighlight,
    removeHighlight,
    importHighlights
  });
})();
