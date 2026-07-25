"use strict";

(() => {
  const HIGHLIGHT_ATTRIBUTE = "data-simple-highlight";
  const HIGHLIGHT_ID_ATTRIBUTE = "data-simple-highlight-id";
  const HIGHLIGHT_CLASS = "shl-highlight";
  const DEFAULT_HIGHLIGHT_COLOR = "#fae082";
  const NON_RESTORABLE_SELECTOR = "script,style,noscript,textarea,input,[contenteditable=''],[contenteditable='true'],[contenteditable='plaintext-only']";

  function normalizeText(inputText) {
    if (typeof inputText !== "string") {
      return "";
    }

    return inputText.replace(/\s+/g, " ").trim();
  }

  function createHighlightElement(textValue, highlightColor, highlightId) {
    const element = document.createElement("span");
    element.className = HIGHLIGHT_CLASS;
    element.setAttribute(HIGHLIGHT_ATTRIBUTE, "true");
    if (highlightId) {
      element.setAttribute(HIGHLIGHT_ID_ATTRIBUTE, highlightId);
    }
    element.style.setProperty("--shl-highlight-color", highlightColor);
    element.textContent = textValue;
    return element;
  }

  function shouldSkipTextNode(textNode) {
    if (!textNode || !textNode.parentElement) {
      return true;
    }

    if (textNode.parentElement.closest(`[${HIGHLIGHT_ATTRIBUTE}='true']`)) {
      return true;
    }

    if (textNode.parentElement.closest(NON_RESTORABLE_SELECTOR)) {
      return true;
    }

    return textNode.nodeValue.trim().length === 0;
  }

  function collectPageTextNodes() {
    if (!document.body) {
      return [];
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldSkipTextNode(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let currentNode = walker.nextNode();

    while (currentNode) {
      nodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    return nodes;
  }

  function buildNormalizedTextIndex(textNodes) {
    const normalizedChars = [];
    const positionMap = [];
    let previousWasWhitespace = true;

    for (const textNode of textNodes) {
      const nodeText = textNode.nodeValue || "";

      for (let index = 0; index < nodeText.length; index += 1) {
        const rawChar = nodeText[index];
        const isWhitespace = /\s/.test(rawChar);

        if (isWhitespace) {
          if (previousWasWhitespace) {
            continue;
          }

          normalizedChars.push(" ");
          positionMap.push({ node: textNode, offset: index });
          previousWasWhitespace = true;
          continue;
        }

        normalizedChars.push(rawChar);
        positionMap.push({ node: textNode, offset: index });
        previousWasWhitespace = false;
      }
    }

    if (normalizedChars[normalizedChars.length - 1] === " ") {
      normalizedChars.pop();
      positionMap.pop();
    }

    return {
      text: normalizedChars.join(""),
      map: positionMap
    };
  }

  function findAllOccurrences(fullText, searchText) {
    if (!fullText || !searchText) {
      return [];
    }

    const occurrences = [];
    let searchStart = 0;

    while (searchStart < fullText.length) {
      const matchStart = fullText.indexOf(searchText, searchStart);
      if (matchStart < 0) {
        break;
      }

      occurrences.push({
        start: matchStart,
        end: matchStart + searchText.length
      });

      searchStart = matchStart + 1;
    }

    return occurrences;
  }

  function scoreOccurrenceByContext(fullText, occurrence, prefixContext, suffixContext) {
    let score = 0;

    if (prefixContext) {
      const currentPrefix = fullText.slice(
        Math.max(0, occurrence.start - prefixContext.length),
        occurrence.start
      );

      if (currentPrefix === prefixContext) {
        score += prefixContext.length + 2;
      } else if (prefixContext.endsWith(currentPrefix)) {
        score += currentPrefix.length;
      }
    }

    if (suffixContext) {
      const currentSuffix = fullText.slice(
        occurrence.end,
        Math.min(fullText.length, occurrence.end + suffixContext.length)
      );

      if (currentSuffix === suffixContext) {
        score += suffixContext.length + 2;
      } else if (suffixContext.startsWith(currentSuffix)) {
        score += currentSuffix.length;
      }
    }

    return score;
  }

  function pickBestOccurrence(occurrences, fullText, prefixContext, suffixContext, usedRanges) {
    if (occurrences.length === 0) {
      return null;
    }

    let bestOccurrence = null;
    let bestScore = -1;

    for (const occurrence of occurrences) {
      const rangeKey = `${occurrence.start}:${occurrence.end}`;
      if (usedRanges.has(rangeKey)) {
        continue;
      }

      const score = scoreOccurrenceByContext(
        fullText,
        occurrence,
        prefixContext,
        suffixContext
      );

      if (score > bestScore) {
        bestScore = score;
        bestOccurrence = occurrence;
      }
    }

    return bestOccurrence;
  }

  function createRangeFromOccurrence(occurrence, positionMap) {
    const startPosition = positionMap[occurrence.start];
    const endPosition = positionMap[occurrence.end - 1];

    if (!startPosition || !endPosition) {
      return null;
    }

    if (!startPosition.node.isConnected || !endPosition.node.isConnected) {
      return null;
    }

    const range = document.createRange();
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset + 1);
    return range;
  }

  function collectTextNodesInRange(range) {
    const rootNode =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    if (!rootNode) {
      return [];
    }

    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (shouldSkipTextNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }

          return range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodes = [];
    let currentNode = walker.nextNode();

    while (currentNode) {
      nodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    return nodes;
  }

  function buildNodeSegments(range, textNodes) {
    return textNodes
      .map((node) => {
        let startOffset = 0;
        let endOffset = node.nodeValue.length;

        if (node === range.startContainer) {
          startOffset = range.startOffset;
        }

        if (node === range.endContainer) {
          endOffset = range.endOffset;
        }

        if (startOffset >= endOffset) {
          return null;
        }

        return {
          node,
          startOffset,
          endOffset
        };
      })
      .filter(Boolean);
  }

  function wrapTextSegment(node, startOffset, endOffset, highlightColor, highlightId) {
    let targetNode = node;

    if (startOffset > 0) {
      targetNode = targetNode.splitText(startOffset);
    }

    targetNode.splitText(endOffset - startOffset);

    const wrapper = createHighlightElement(targetNode.nodeValue, highlightColor, highlightId);
    targetNode.parentNode.replaceChild(wrapper, targetNode);
    return wrapper;
  }

  function highlightRange(range, selectedColor = DEFAULT_HIGHLIGHT_COLOR, highlightId = "") {
    if (!range || range.collapsed) {
      return 0;
    }

    const textNodes = collectTextNodesInRange(range);
    const nodeSegments = buildNodeSegments(range, textNodes);

    let createdCount = 0;

    // Se recorre en reversa para no invalidar offsets de nodos aun no procesados.
    for (let index = nodeSegments.length - 1; index >= 0; index -= 1) {
      const { node, startOffset, endOffset } = nodeSegments[index];

      if (!node.isConnected) {
        continue;
      }

      wrapTextSegment(node, startOffset, endOffset, selectedColor, highlightId);
      createdCount += 1;
    }

    return createdCount;
  }

  function getHighlightElementsById(highlightId) {
    if (!highlightId) {
      return [];
    }

    return Array.from(document.querySelectorAll(`[${HIGHLIGHT_ID_ATTRIBUTE}="${highlightId}"]`));
  }

  function removeHighlightById(highlightId) {
    const elements = getHighlightElementsById(highlightId);

    for (const element of elements) {
      const parentNode = element.parentNode;
      if (!parentNode) {
        continue;
      }

      const textNode = document.createTextNode(element.textContent || "");
      parentNode.replaceChild(textNode, element);
      parentNode.normalize();
    }

    return elements.length;
  }

  function restoreHighlightByText(savedHighlight, usedRanges) {
    const highlightText = normalizeText(savedHighlight?.text);
    const highlightColor = savedHighlight?.color;
    const highlightId = savedHighlight?.id;
    const prefixContext = normalizeText(savedHighlight?.prefixContext);
    const suffixContext = normalizeText(savedHighlight?.suffixContext);

    if (!highlightText) {
      return 0;
    }

    if (typeof highlightId !== "string" || !highlightId) {
      return 0;
    }

    if (getHighlightElementsById(highlightId).length > 0) {
      return 1;
    }

    const textNodes = collectPageTextNodes();
    const textIndex = buildNormalizedTextIndex(textNodes);
    if (!textIndex.text) {
      return 0;
    }

    const occurrences = findAllOccurrences(textIndex.text, highlightText);
    const chosenOccurrence = pickBestOccurrence(
      occurrences,
      textIndex.text,
      prefixContext,
      suffixContext,
      usedRanges
    );

    if (!chosenOccurrence) {
      return 0;
    }

    const range = createRangeFromOccurrence(chosenOccurrence, textIndex.map);
    if (!range || range.collapsed) {
      return 0;
    }

    const appliedCount = highlightRange(
      range,
      typeof highlightColor === "string" && highlightColor ? highlightColor : DEFAULT_HIGHLIGHT_COLOR,
      highlightId
    );

    if (appliedCount > 0) {
      usedRanges.add(`${chosenOccurrence.start}:${chosenOccurrence.end}`);
      return 1;
    }

    return 0;
  }

  function restoreHighlights(savedHighlights) {
    if (!Array.isArray(savedHighlights) || savedHighlights.length === 0) {
      return 0;
    }

    const orderedHighlights = [...savedHighlights].sort((left, right) => {
      const leftTime = Date.parse(left?.createdAt || "");
      const rightTime = Date.parse(right?.createdAt || "");

      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
        return 0;
      }

      return leftTime - rightTime;
    });

    let restoredCount = 0;
    const usedRanges = new Set();

    for (const item of orderedHighlights) {
      restoredCount += restoreHighlightByText(item, usedRanges);
    }

    return restoredCount;
  }

  function setHoverState(highlightId, isHovered) {
    const elements = getHighlightElementsById(highlightId);

    for (const element of elements) {
      element.classList.toggle("is-hovered", isHovered);
    }
  }

  function unwrapAllHighlights() {
    const elements = Array.from(document.querySelectorAll(`[${HIGHLIGHT_ATTRIBUTE}='true']`));

    for (const element of elements) {
      const parentNode = element.parentNode;
      if (!parentNode) {
        continue;
      }

      const textNode = document.createTextNode(element.textContent || "");
      parentNode.replaceChild(textNode, element);
      parentNode.normalize();
    }

    return elements.length;
  }

  function flashHighlightById(highlightId) {
    const elements = getHighlightElementsById(highlightId);
    if (elements.length === 0) {
      return false;
    }

    for (const element of elements) {
      element.classList.remove("is-flash");
      // Forzar reflow para reiniciar la animacion si ya se aplico antes.
      void element.offsetWidth;
      element.classList.add("is-flash");
      element.addEventListener(
        "animationend",
        () => element.classList.remove("is-flash"),
        { once: true }
      );
    }

    return true;
  }

  globalThis.SimpleHighlightsHighlighter = Object.freeze({
    highlightRange,
    restoreHighlights,
    removeHighlightById,
    setHoverState,
    unwrapAllHighlights,
    flashHighlightById
  });
})();
