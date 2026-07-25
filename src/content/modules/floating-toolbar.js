"use strict";

(() => {
  function createButton(labelText, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = labelText;
    return button;
  }

  function createStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
      }

      .shl-toolbar {
        display: flex;
        gap: 6px;
        align-items: center;
        background: #ffffff;
        border: 1px solid rgba(17, 24, 39, 0.16);
        border-radius: 10px;
        box-shadow: 0 12px 28px rgba(17, 24, 39, 0.2);
        padding: 6px;
        font-family: "Segoe UI", Tahoma, sans-serif;
        position: relative;
      }

      .shl-button {
        border: 1px solid rgba(17, 24, 39, 0.16);
        border-radius: 8px;
        background: #ffffff;
        color: #111827;
        cursor: pointer;
        font-size: 12px;
        line-height: 1;
        padding: 7px 10px;
      }

      .shl-highlight {
        font-weight: 600;
      }

      .shl-color {
        min-width: 95px;
        position: relative;
      }

      .shl-button:hover {
        background: #f8fafc;
      }

      .shl-dropdown {
        position: absolute;
        right: 0;
        top: calc(100% + 6px);
        min-width: 130px;
        display: none;
        flex-direction: column;
        gap: 4px;
        padding: 6px;
        border: 1px solid rgba(17, 24, 39, 0.16);
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 10px 22px rgba(17, 24, 39, 0.18);
      }

      .shl-dropdown.is-open {
        display: flex;
      }

      .shl-option {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        border: 1px solid rgba(17, 24, 39, 0.16);
        border-radius: 6px;
        background: #ffffff;
        color: #111827;
        cursor: pointer;
        font-size: 12px;
        text-align: left;
        padding: 6px 8px;
      }

      .shl-option:hover {
        background: #f8fafc;
      }

      .shl-option.is-active {
        border-color: #1d4ed8;
      }

      .shl-swatch {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 1px solid rgba(17, 24, 39, 0.24);
        flex-shrink: 0;
      }

      .shl-label {
        flex-grow: 1;
      }

      .shl-check {
        color: #1d4ed8;
        font-weight: 600;
      }
    `;
    return style;
  }

  function createFloatingToolbar(config) {
    const { onHighlight, onSelectColor, getCurrentColor, getPalette } = config;

    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.zIndex = "2147483647";
    host.style.display = "none";
    document.documentElement.appendChild(host);

    const shadowRoot = host.attachShadow({ mode: "closed" });

    const container = document.createElement("div");
    container.className = "shl-toolbar";

    const highlightButton = createButton("Highlight", "shl-button shl-highlight");
    const colorButton = createButton("Color", "shl-button shl-color");
    const dropdown = document.createElement("div");
    dropdown.className = "shl-dropdown";
    const optionButtons = [];

    for (const color of getPalette()) {
      const option = createButton("", "shl-option");
      option.setAttribute("data-color-value", color.value);

      const swatch = document.createElement("span");
      swatch.className = "shl-swatch";
      swatch.style.backgroundColor = color.value;

      const label = document.createElement("span");
      label.className = "shl-label";
      label.textContent = color.label;

      const check = document.createElement("span");
      check.className = "shl-check";
      check.textContent = "";
      check.setAttribute("aria-hidden", "true");

      option.appendChild(swatch);
      option.appendChild(label);
      option.appendChild(check);
      dropdown.appendChild(option);
      optionButtons.push(option);
    }

    function updateColorLabel() {
      const currentColor = getCurrentColor();
      colorButton.textContent = `Color: ${currentColor.label}`;

      for (const option of optionButtons) {
        const isCurrent = option.getAttribute("data-color-value") === currentColor.value;
        option.classList.toggle("is-active", isCurrent);
        const checkNode = option.querySelector(".shl-check");
        if (checkNode) {
          checkNode.textContent = isCurrent ? "✓" : "";
        }
      }
    }

    function closeDropdown() {
      dropdown.classList.remove("is-open");
    }

    function toggleDropdown() {
      dropdown.classList.toggle("is-open");
    }

    function showAtRect(targetRect) {
      const margin = 8;
      host.style.display = "block";
      updateColorLabel();
      closeDropdown();

      const toolbarRect = container.getBoundingClientRect();

      const desiredTop = targetRect.top - toolbarRect.height - margin;
      const fallbackTop = targetRect.bottom + margin;
      const top = desiredTop >= margin ? desiredTop : fallbackTop;

      const centeredLeft = targetRect.left + targetRect.width / 2 - toolbarRect.width / 2;
      const maxLeft = Math.max(margin, window.innerWidth - toolbarRect.width - margin);
      const left = Math.max(margin, Math.min(centeredLeft, maxLeft));

      host.style.left = `${left}px`;
      host.style.top = `${Math.max(margin, top)}px`;
    }

    function hide() {
      host.style.display = "none";
      closeDropdown();
    }

    function isVisible() {
      return host.style.display === "block";
    }

    container.addEventListener("mousedown", (event) => {
      // Evita perder la seleccion antes de procesar la accion.
      event.preventDefault();
    });

    highlightButton.addEventListener("click", () => {
      onHighlight();
      hide();
    });

    colorButton.addEventListener("click", () => {
      toggleDropdown();
    });

    for (const option of optionButtons) {
      option.addEventListener("click", async () => {
        const colorValue = option.getAttribute("data-color-value");
        await onSelectColor(colorValue);
        updateColorLabel();
        closeDropdown();
      });
    }

    shadowRoot.appendChild(createStyles());
    container.appendChild(highlightButton);
    container.appendChild(colorButton);
    container.appendChild(dropdown);
    shadowRoot.appendChild(container);

    return Object.freeze({
      showAtRect,
      hide,
      isVisible,
      containsEventTarget(targetNode) {
        return targetNode === host || host.contains(targetNode);
      },
      updateColorLabel
    });
  }

  globalThis.SimpleHighlightsFloatingToolbar = Object.freeze({
    createFloatingToolbar
  });
})();
