"use strict";

(() => {
  const selectionModule = globalThis.SimpleHighlightsSelection;
  const stateModule = globalThis.SimpleHighlightsState;
  const highlighterModule = globalThis.SimpleHighlightsHighlighter;
  const toolbarModule = globalThis.SimpleHighlightsFloatingToolbar;
  const libraryModule = globalThis.SimpleHighlightsLibrary;
  const spaWatcherModule = globalThis.SimpleHighlightsSpaWatcher;
  const RESTORE_CONTEXT_LENGTH = 48;
  const SCROLL_TARGET_POLL_INTERVAL_MS = 200;
  const SCROLL_TARGET_POLL_TIMEOUT_MS = 3000;

  if (!selectionModule || !stateModule || !highlighterModule || !toolbarModule || !libraryModule) {
    return;
  }

  let selectedRangeForAction = null;
  let hoveredHighlightId = "";
  let hideDeleteButtonTimeoutId = 0;
  let hideDeleteButtonFadeTimeoutId = 0;
  const DELETE_BUTTON_HIDE_DELAY_MS = 1500;
  const DELETE_BUTTON_FADE_DURATION_MS = 180;

  const toolbar = toolbarModule.createFloatingToolbar({
    onHighlight: applyHighlight,
    onSelectColor: selectHighlightColor,
    getCurrentColor: stateModule.getSelectedColor,
    getPalette: stateModule.getColorPalette
  });

  const deleteButton = createDeleteButton();

  function createDeleteButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove";
    button.setAttribute("aria-label", "Remove highlight");
    button.style.position = "fixed";
    button.style.left = "0";
    button.style.top = "0";
    button.style.zIndex = "2147483647";
    button.style.display = "none";
    button.style.border = "1px solid rgba(15, 23, 42, 0.14)";
    button.style.borderRadius = "999px";
    button.style.background = "#ffffff";
    button.style.boxShadow = "0 10px 22px rgba(15, 23, 42, 0.18)";
    button.style.color = "#0f172a";
    button.style.cursor = "pointer";
    button.style.fontFamily = '"Segoe UI", Tahoma, sans-serif';
    button.style.fontSize = "12px";
    button.style.fontWeight = "600";
    button.style.padding = "7px 10px";
    button.style.lineHeight = "1";
    button.style.opacity = "0";
    button.style.pointerEvents = "none";
    button.style.transition = `opacity ${DELETE_BUTTON_FADE_DURATION_MS}ms ease`;
    button.style.display = "none";

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    button.addEventListener("mouseenter", () => {
      window.clearTimeout(hideDeleteButtonTimeoutId);
      window.clearTimeout(hideDeleteButtonFadeTimeoutId);
      button.style.opacity = "1";
      button.style.pointerEvents = "auto";
    });

    button.addEventListener("mouseleave", () => {
      scheduleDeleteButtonHide();
    });

    button.addEventListener("click", async () => {
      if (!hoveredHighlightId) {
        return;
      }

      const highlightId = hoveredHighlightId;
      highlighterModule.removeHighlightById(highlightId);
      highlighterModule.setHoverState(highlightId, false);
      hoveredHighlightId = "";
      hideDeleteButton();
      await chrome.runtime.sendMessage({ type: "removeHighlight", highlightId });
    });

    document.documentElement.appendChild(button);
    return button;
  }

  function getHighlightIdFromElement(element) {
    return element?.getAttribute("data-simple-highlight-id") || "";
  }

  function getClosestHighlightElement(targetNode) {
    return targetNode instanceof Element
      ? targetNode.closest("[data-simple-highlight='true']")
      : null;
  }

  function hideDeleteButton() {
    window.clearTimeout(hideDeleteButtonFadeTimeoutId);

    if (hoveredHighlightId) {
      highlighterModule.setHoverState(hoveredHighlightId, false);
    }

    hoveredHighlightId = "";
    if (deleteButton.style.display === "none") {
      return;
    }

    deleteButton.style.opacity = "0";
    deleteButton.style.pointerEvents = "none";
    hideDeleteButtonFadeTimeoutId = window.setTimeout(() => {
      deleteButton.style.display = "none";
    }, DELETE_BUTTON_FADE_DURATION_MS);
  }

  function hideDeleteButtonImmediately() {
    window.clearTimeout(hideDeleteButtonTimeoutId);
    window.clearTimeout(hideDeleteButtonFadeTimeoutId);

    if (hoveredHighlightId) {
      highlighterModule.setHoverState(hoveredHighlightId, false);
    }

    hoveredHighlightId = "";
    deleteButton.style.opacity = "0";
    deleteButton.style.pointerEvents = "none";
    deleteButton.style.display = "none";
  }

  function scheduleDeleteButtonHide() {
    window.clearTimeout(hideDeleteButtonTimeoutId);
    hideDeleteButtonTimeoutId = window.setTimeout(() => {
      hideDeleteButton();
    }, DELETE_BUTTON_HIDE_DELAY_MS);
  }

  function showDeleteButtonForHighlight(highlightElement) {
    const highlightId = getHighlightIdFromElement(highlightElement);
    if (!highlightId) {
      return;
    }

    window.clearTimeout(hideDeleteButtonTimeoutId);
    window.clearTimeout(hideDeleteButtonFadeTimeoutId);

    if (hoveredHighlightId && hoveredHighlightId !== highlightId) {
      highlighterModule.setHoverState(hoveredHighlightId, false);
    }

    hoveredHighlightId = highlightId;
    highlighterModule.setHoverState(highlightId, true);

    const targetRect = highlightElement.getBoundingClientRect();
    const margin = 8;

    deleteButton.style.display = "block";
    deleteButton.style.opacity = "1";
    deleteButton.style.pointerEvents = "auto";

    const buttonRect = deleteButton.getBoundingClientRect();
    const desiredTop = targetRect.top - buttonRect.height - margin;
    const fallbackTop = targetRect.bottom + margin;
    const top = desiredTop >= margin ? desiredTop : fallbackTop;
    const left = Math.min(
      Math.max(margin, targetRect.left),
      Math.max(margin, window.innerWidth - buttonRect.width - margin)
    );

    deleteButton.style.left = `${left}px`;
    deleteButton.style.top = `${Math.max(margin, top)}px`;
  }

  function getSelectionRect(range) {
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return rect;
    }

    const clientRects = range.getClientRects();
    if (clientRects.length > 0) {
      return clientRects[0];
    }

    return null;
  }

  function showToolbarForSelection() {
    const selectedRange = selectionModule.getCurrentSelectionRange();
    if (!selectedRange) {
      selectedRangeForAction = null;
      toolbar.hide();
      return;
    }

    const selectionRect = getSelectionRect(selectedRange);
    if (!selectionRect) {
      selectedRangeForAction = null;
      toolbar.hide();
      return;
    }

    selectedRangeForAction = selectedRange;
    toolbar.showAtRect(selectionRect);
  }

  function scheduleToolbarRefresh() {
    window.setTimeout(showToolbarForSelection, 0);
  }

  function handleMouseUp(event) {
    if (toolbar.containsEventTarget(event.target)) {
      return;
    }

    scheduleToolbarRefresh();
  }

  async function selectHighlightColor(colorValue) {
    await stateModule.setSelectedColor(colorValue);
  }

  function normalizeContextText(inputText) {
    if (typeof inputText !== "string") {
      return "";
    }

    return inputText.replace(/\s+/g, " ").trim();
  }

  function getSelectionContext(range) {
    if (!range || !document.body) {
      return {
        prefixContext: "",
        suffixContext: ""
      };
    }

    try {
      const prefixRange = document.createRange();
      prefixRange.selectNodeContents(document.body);
      prefixRange.setEnd(range.startContainer, range.startOffset);

      const suffixRange = document.createRange();
      suffixRange.selectNodeContents(document.body);
      suffixRange.setStart(range.endContainer, range.endOffset);

      const prefixText = normalizeContextText(prefixRange.toString()).slice(-RESTORE_CONTEXT_LENGTH);
      const suffixText = normalizeContextText(suffixRange.toString()).slice(0, RESTORE_CONTEXT_LENGTH);

      return {
        prefixContext: prefixText,
        suffixContext: suffixText
      };
    } catch (_error) {
      return {
        prefixContext: "",
        suffixContext: ""
      };
    }
  }

  async function saveHighlightRecord(highlightId, selectedText, selectedColor, selectionContext) {
    await chrome.runtime.sendMessage({
      type: "addHighlight",
      payload: {
        id: highlightId,
        url: window.location.href,
        pageTitle: document.title,
        text: selectedText,
        color: selectedColor,
        prefixContext: selectionContext?.prefixContext || "",
        suffixContext: selectionContext?.suffixContext || ""
      }
    });
  }

  async function restoreHighlightsForCurrentPage() {
    const savedItems = await libraryModule.getLibrary();
    const currentUrl = window.location.href;
    const pageItems = savedItems.filter((item) => item?.url === currentUrl);

    if (pageItems.length === 0) {
      return;
    }

    const restoredCount = highlighterModule.restoreHighlights(pageItems);
    if (restoredCount >= pageItems.length) {
      return;
    }

    // Reintento corto para contenido que aparece despues de document_idle.
    window.setTimeout(() => {
      highlighterModule.restoreHighlights(pageItems);
    }, 800);
  }

  function applyHighlight() {
    if (!selectedRangeForAction) {
      return;
    }

    const selectedText = selectedRangeForAction.toString().trim();
    const selectedColor = stateModule.getSelectedColor().value;
    const selectionContext = getSelectionContext(selectedRangeForAction);
    const highlightId = libraryModule.createHighlightId();
    const highlightedSegments = highlighterModule.highlightRange(
      selectedRangeForAction,
      selectedColor,
      highlightId
    );

    if (highlightedSegments > 0) {
      saveHighlightRecord(highlightId, selectedText, selectedColor, selectionContext);
      selectedRangeForAction = null;
      window.getSelection()?.removeAllRanges();
      toolbar.hide();
    }
  }

  function handleDocumentMouseDown(event) {
    if (toolbar.containsEventTarget(event.target) || event.target === deleteButton) {
      return;
    }

    toolbar.hide();
    hideDeleteButtonImmediately();
  }

  function handleDocumentScroll() {
    if (toolbar.isVisible()) {
      toolbar.hide();
    }

    hideDeleteButtonImmediately();
  }

  function handleKeyUp(event) {
    const selectionKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Shift"];

    if (selectionKeys.includes(event.key) || event.shiftKey) {
      scheduleToolbarRefresh();
    }
  }

  function handlePointerOver(event) {
    const highlightElement = getClosestHighlightElement(event.target);
    if (!highlightElement) {
      return;
    }

    showDeleteButtonForHighlight(highlightElement);
  }

  function handlePointerOut(event) {
    const highlightElement = getClosestHighlightElement(event.target);
    if (!highlightElement) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget === deleteButton) {
      return;
    }

    if (getClosestHighlightElement(nextTarget)) {
      return;
    }

    scheduleDeleteButtonHide();
  }

  function waitForElementById(highlightId, timeoutMs) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;

      function attempt() {
        const found = document.querySelector(`[data-simple-highlight-id="${highlightId}"]`);
        if (found) {
          resolve(found);
          return;
        }

        if (Date.now() >= deadline) {
          resolve(null);
          return;
        }

        window.setTimeout(attempt, SCROLL_TARGET_POLL_INTERVAL_MS);
      }

      attempt();
    });
  }

  async function scrollToAndFlashHighlight(highlightId) {
    const element = await waitForElementById(highlightId, SCROLL_TARGET_POLL_TIMEOUT_MS);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    highlighterModule.flashHighlightById(highlightId);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "scrollToHighlight" && typeof message.highlightId === "string") {
      scrollToAndFlashHighlight(message.highlightId);
      return;
    }

    if (message.type === "highlightRemoved" && typeof message.highlightId === "string") {
      highlighterModule.removeHighlightById(message.highlightId);
    }
  });

  if (spaWatcherModule) {
    spaWatcherModule.watchForUrlChanges(() => {
      hideDeleteButtonImmediately();
      toolbar.hide();
      highlighterModule.unwrapAllHighlights();
      restoreHighlightsForCurrentPage();
    });
  }

  Promise.all([stateModule.initialize(), restoreHighlightsForCurrentPage()]).then(() => {
    toolbar.updateColorLabel();
  });

  document.addEventListener("mouseup", handleMouseUp, { passive: true });
  document.addEventListener("keyup", handleKeyUp, { passive: true });
  document.addEventListener("mousedown", handleDocumentMouseDown, { passive: true });
  document.addEventListener("mouseover", handlePointerOver, { passive: true });
  document.addEventListener("mouseout", handlePointerOut, { passive: true });
  document.addEventListener("scroll", handleDocumentScroll, true);
  window.addEventListener("resize", handleDocumentScroll, { passive: true });

})();
