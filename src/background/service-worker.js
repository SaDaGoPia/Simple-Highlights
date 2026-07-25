"use strict";

importScripts("../shared/highlight-library.js");

const libraryModule = globalThis.SimpleHighlightsLibrary;

let writeQueue = Promise.resolve();

function enqueueWrite(task) {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function broadcastToTabs(message, matchUrl) {
  try {
    const tabs = await chrome.tabs.query(matchUrl ? { url: matchUrl } : {});
    await Promise.all(
      tabs
        .filter((tab) => typeof tab.id === "number")
        .map((tab) =>
          chrome.tabs.sendMessage(tab.id, message).catch(() => {
            // El tab puede no tener el content script cargado (paginas internas, etc).
          })
        )
    );
  } catch (_error) {
    // chrome.tabs puede no estar disponible en contextos restringidos; se ignora.
  }
}

async function focusHighlightTab(highlightId, targetUrl) {
  if (!targetUrl) {
    return { ok: false, error: "missing-url" };
  }

  try {
    const matchingTabs = await chrome.tabs.query({});
    const existingTab = matchingTabs.find((tab) => tab.url === targetUrl);

    if (existingTab && typeof existingTab.id === "number") {
      await chrome.tabs.update(existingTab.id, { active: true });
      if (typeof existingTab.windowId === "number") {
        await chrome.windows.update(existingTab.windowId, { focused: true });
      }
      await chrome.tabs
        .sendMessage(existingTab.id, { type: "scrollToHighlight", highlightId })
        .catch(() => {});
      return { ok: true };
    }

    const createdTab = await chrome.tabs.create({ url: targetUrl, active: true });
    if (typeof createdTab.id !== "number") {
      return { ok: false, error: "tab-create-failed" };
    }

    await new Promise((resolve) => {
      function onUpdated(tabId, changeInfo) {
        if (tabId === createdTab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });

    await chrome.tabs
      .sendMessage(createdTab.id, { type: "scrollToHighlight", highlightId })
      .catch(() => {});
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "addHighlight") {
    enqueueWrite(() => libraryModule.addHighlight(message.payload))
      .then((entry) => sendResponse({ ok: true, entry }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "removeHighlight") {
    enqueueWrite(() => libraryModule.removeHighlight(message.highlightId))
      .then(async () => {
        await broadcastToTabs({ type: "highlightRemoved", highlightId: message.highlightId });
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "importHighlights") {
    enqueueWrite(() => libraryModule.importHighlights(message.items))
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "focusHighlight") {
    focusHighlightTab(message.highlightId, message.url).then(sendResponse);
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("Simple Highlights instalado.");
});
