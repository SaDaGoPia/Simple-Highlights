"use strict";

(() => {
  const PREFERENCES_STORAGE_KEY = "simpleHighlightsPopupPreferences";
  const DISPLAY_TEXT_MAX_LENGTH = 500;

  const COLOR_PALETTE = [
    { id: "sun", label: "Sun", value: "#fae082" },
    { id: "mint", label: "Mint", value: "#b7efc5" },
    { id: "sky", label: "Sky", value: "#b9d9ff" },
    { id: "rose", label: "Rose", value: "#f9c5d5" }
  ];

  const libraryRoot = document.getElementById("library-content");
  const searchInput = document.getElementById("library-search");
  const sortModeButton = document.getElementById("sort-mode-button");
  const groupToggleButton = document.getElementById("group-toggle-button");
  const siteFilterSelect = document.getElementById("site-filter");
  const colorFilterContainer = document.getElementById("color-filter");
  const exportButton = document.getElementById("export-button");
  const importButton = document.getElementById("import-button");
  const importFileInput = document.getElementById("import-file-input");
  const libraryStatus = document.getElementById("library-status");
  const libraryModule = globalThis.SimpleHighlightsLibrary;

  let allItems = [];
  let currentRawQuery = "";
  let currentQuery = "";
  let currentSortMode = "relevance";
  let groupBySiteEnabled = true;
  let currentSiteFilter = "";
  let currentColorFilter = "";
  let statusTimeoutId = 0;

  const SORT_MODES = [
    { id: "relevance", label: "Relevancia" },
    { id: "newest", label: "Mas recientes" },
    { id: "oldest", label: "Mas antiguos" },
    { id: "site-az", label: "Sitio A-Z" }
  ];

  if (
    !libraryRoot ||
    !searchInput ||
    !sortModeButton ||
    !groupToggleButton ||
    !siteFilterSelect ||
    !colorFilterContainer ||
    !exportButton ||
    !importButton ||
    !importFileInput ||
    !libraryModule
  ) {
    return;
  }

  function formatDate(isoValue) {
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) {
      return "Fecha desconocida";
    }

    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function createElement(tagName, className, textValue) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }

    if (typeof textValue === "string") {
      element.textContent = textValue;
    }

    return element;
  }

  function truncateForDisplay(inputText) {
    if (inputText.length <= DISPLAY_TEXT_MAX_LENGTH) {
      return inputText;
    }

    return `${inputText.slice(0, DISPLAY_TEXT_MAX_LENGTH)}…`;
  }

  function showStatus(messageText) {
    window.clearTimeout(statusTimeoutId);
    libraryStatus.textContent = messageText;
    statusTimeoutId = window.setTimeout(() => {
      libraryStatus.textContent = "";
    }, 4000);
  }

  function groupByHostname(items) {
    const grouped = new Map();

    for (const item of items) {
      const host = item.hostname || "unknown-site";
      if (!grouped.has(host)) {
        grouped.set(host, []);
      }

      grouped.get(host).push(item);
    }

    return grouped;
  }

  function normalizeForSearch(inputText) {
    if (typeof inputText !== "string") {
      return "";
    }

    return inputText
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-ES")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function parseDateValue(isoValue) {
    const parsed = Date.parse(isoValue || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function getSortModeById(sortModeId) {
    return SORT_MODES.find((mode) => mode.id === sortModeId) || SORT_MODES[0];
  }

  async function loadPopupPreferences() {
    if (!chrome?.storage?.local) {
      return;
    }

    try {
      const storageData = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY);
      const preferences = storageData?.[PREFERENCES_STORAGE_KEY];

      if (!preferences || typeof preferences !== "object") {
        return;
      }

      currentSortMode = getSortModeById(preferences.sortMode).id;

      if (typeof preferences.groupBySiteEnabled === "boolean") {
        groupBySiteEnabled = preferences.groupBySiteEnabled;
      }

      if (typeof preferences.searchQuery === "string") {
        currentRawQuery = preferences.searchQuery;
        currentQuery = normalizeForSearch(preferences.searchQuery);
      }

      if (typeof preferences.siteFilter === "string") {
        currentSiteFilter = preferences.siteFilter;
      }

      if (typeof preferences.colorFilter === "string") {
        currentColorFilter = preferences.colorFilter;
      }
    } catch (error) {
      console.warn("No se pudieron cargar las preferencias del popup.", error);
    }
  }

  async function savePopupPreferences() {
    if (!chrome?.storage?.local) {
      return;
    }

    try {
      await chrome.storage.local.set({
        [PREFERENCES_STORAGE_KEY]: {
          sortMode: currentSortMode,
          groupBySiteEnabled,
          searchQuery: currentRawQuery,
          siteFilter: currentSiteFilter,
          colorFilter: currentColorFilter
        }
      });
    } catch (error) {
      console.warn("No se pudieron guardar las preferencias del popup.", error);
    }
  }

  function updateControlLabels() {
    const sortMode = getSortModeById(currentSortMode);
    sortModeButton.textContent = `Orden: ${sortMode.label}`;

    groupToggleButton.textContent = groupBySiteEnabled ? "Agrupar: Sitio" : "Agrupar: Ninguno";
    groupToggleButton.setAttribute("aria-pressed", String(groupBySiteEnabled));
  }

  function refreshSiteFilterOptions() {
    const hostnames = Array.from(
      new Set(allItems.map((item) => item.hostname || "unknown-site"))
    ).sort((left, right) => left.localeCompare(right, "es"));

    const previousValue = currentSiteFilter;
    siteFilterSelect.textContent = "";

    const allOption = createElement("option", "", "Todos los sitios");
    allOption.value = "";
    siteFilterSelect.appendChild(allOption);

    for (const hostname of hostnames) {
      const option = createElement("option", "", hostname);
      option.value = hostname;
      siteFilterSelect.appendChild(option);
    }

    if (hostnames.includes(previousValue)) {
      siteFilterSelect.value = previousValue;
    } else {
      currentSiteFilter = "";
      siteFilterSelect.value = "";
    }
  }

  function buildColorFilterSwatches() {
    const allColorsButton = colorFilterContainer.querySelector('[data-color-value=""]');
    if (allColorsButton) {
      allColorsButton.addEventListener("click", () => {
        currentColorFilter = "";
        updateColorFilterActiveState();
        renderCurrentView();
        savePopupPreferences();
      });
    }

    for (const color of COLOR_PALETTE) {
      const swatch = createElement("button", "color-swatch");
      swatch.type = "button";
      swatch.style.backgroundColor = color.value;
      swatch.setAttribute("data-color-value", color.value);
      swatch.setAttribute("aria-label", `Color ${color.label}`);
      swatch.setAttribute("aria-pressed", "false");

      swatch.addEventListener("click", () => {
        currentColorFilter = currentColorFilter === color.value ? "" : color.value;
        updateColorFilterActiveState();
        renderCurrentView();
        savePopupPreferences();
      });

      colorFilterContainer.appendChild(swatch);
    }
  }

  function updateColorFilterActiveState() {
    const swatches = colorFilterContainer.querySelectorAll(".color-swatch");
    for (const swatch of swatches) {
      const swatchValue = swatch.getAttribute("data-color-value") || "";
      const isActive = swatchValue === currentColorFilter;
      swatch.classList.toggle("is-active", isActive);
      swatch.setAttribute("aria-pressed", String(isActive));
    }
  }

  function renderEmptyState() {
    libraryRoot.textContent = "";
    const emptyCard = createElement(
      "div",
      "empty-state",
      "Aun no hay subrayados guardados. Selecciona texto en cualquier pagina y pulsa Highlight."
    );
    libraryRoot.appendChild(emptyCard);
  }

  function renderNoSearchResults(queryText) {
    libraryRoot.textContent = "";
    const emptyCard = createElement(
      "div",
      "empty-state",
      queryText ? `No hay resultados para "${queryText}".` : "No hay resultados con los filtros actuales."
    );
    libraryRoot.appendChild(emptyCard);
  }

  function computeSearchScore(item, queryText) {
    if (!queryText) {
      return 0;
    }

    const normalizedText = normalizeForSearch(item?.text || "");
    const normalizedTitle = normalizeForSearch(item?.pageTitle || "");
    const normalizedHost = normalizeForSearch(item?.hostname || "");
    const normalizedUrl = normalizeForSearch(item?.url || "");
    const mergedSearchable = [normalizedText, normalizedTitle, normalizedHost, normalizedUrl]
      .filter(Boolean)
      .join(" ");

    if (!mergedSearchable) {
      return -1;
    }

    const queryTokens = queryText.split(" ").filter(Boolean);
    if (queryTokens.length === 0) {
      return 0;
    }

    for (const token of queryTokens) {
      if (!mergedSearchable.includes(token)) {
        return -1;
      }
    }

    let score = 0;

    if (normalizedText.includes(queryText)) {
      score += 10;
    }

    if (normalizedTitle.includes(queryText)) {
      score += 7;
    }

    if (normalizedHost.includes(queryText)) {
      score += 5;
    }

    if (normalizedUrl.includes(queryText)) {
      score += 3;
    }

    score += queryTokens.reduce((acc, token) => {
      if (normalizedText.includes(token)) {
        return acc + 3;
      }

      if (normalizedTitle.includes(token)) {
        return acc + 2;
      }

      if (normalizedHost.includes(token) || normalizedUrl.includes(token)) {
        return acc + 1;
      }

      return acc;
    }, 0);

    return score;
  }

  function applyFilters(items) {
    return items.filter((item) => {
      if (currentSiteFilter && (item.hostname || "unknown-site") !== currentSiteFilter) {
        return false;
      }

      if (currentColorFilter && item.color !== currentColorFilter) {
        return false;
      }

      return true;
    });
  }

  function getSortableItems(items, queryText) {
    const filteredItems = applyFilters(items);

    const scoredItems = filteredItems
      .map((item) => ({
        item,
        score: computeSearchScore(item, queryText)
      }))
      .filter((entry) => !queryText || entry.score >= 0);

    const sortMode = getSortModeById(currentSortMode).id;

    if (sortMode === "oldest") {
      scoredItems.sort((left, right) => {
        return parseDateValue(left.item?.createdAt) - parseDateValue(right.item?.createdAt);
      });
      return scoredItems.map((entry) => entry.item);
    }

    if (sortMode === "site-az") {
      scoredItems.sort((left, right) => {
        const leftHost = (left.item?.hostname || "").toLocaleLowerCase("es-ES");
        const rightHost = (right.item?.hostname || "").toLocaleLowerCase("es-ES");

        const byHost = leftHost.localeCompare(rightHost, "es");
        if (byHost !== 0) {
          return byHost;
        }

        return parseDateValue(right.item?.createdAt) - parseDateValue(left.item?.createdAt);
      });
      return scoredItems.map((entry) => entry.item);
    }

    if (sortMode === "relevance" && queryText) {
      scoredItems.sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return parseDateValue(right.item?.createdAt) - parseDateValue(left.item?.createdAt);
      });
      return scoredItems.map((entry) => entry.item);
    }

    scoredItems.sort((left, right) => {
      return parseDateValue(right.item?.createdAt) - parseDateValue(left.item?.createdAt);
    });
    return scoredItems.map((entry) => entry.item);
  }

  async function handleDeleteClick(entry) {
    const confirmed = window.confirm("¿Eliminar este subrayado?");
    if (!confirmed) {
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "removeHighlight",
      highlightId: entry.id
    });

    if (!response?.ok) {
      showStatus("No se pudo eliminar el subrayado.");
      return;
    }

    allItems = allItems.filter((item) => item.id !== entry.id);
    refreshSiteFilterOptions();
    renderCurrentView();
    showStatus("Subrayado eliminado.");
  }

  async function handleOpenClick(entry) {
    showStatus("Abriendo pagina...");
    const response = await chrome.runtime.sendMessage({
      type: "focusHighlight",
      highlightId: entry.id,
      url: entry.url
    });

    if (response?.ok) {
      window.close();
      return;
    }

    showStatus("No se pudo abrir la pagina.");
  }

  function createItemCard(entry, options) {
    const itemCard = createElement("div", "highlight-item");

    const row = createElement("div", "item-row");
    const colorDot = createElement("span", "color-dot");
    colorDot.style.backgroundColor = entry.color || "#fae082";

    const itemTitle = createElement("p", "item-title", entry.pageTitle || "Untitled page");

    row.appendChild(colorDot);
    row.appendChild(itemTitle);

    const itemText = createElement("p", "item-text", `"${truncateForDisplay(entry.text || "")}"`);
    const metaText = options?.showHostname
      ? `${entry.hostname || "unknown-site"} · ${formatDate(entry.createdAt)}`
      : formatDate(entry.createdAt);
    const meta = createElement("p", "item-meta", metaText);

    const actions = createElement("div", "item-actions");
    const openButton = createElement("button", "item-action-button", "Abrir");
    openButton.type = "button";
    openButton.addEventListener("click", () => handleOpenClick(entry));

    const deleteButton = createElement("button", "item-action-button is-danger", "Eliminar");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => handleDeleteClick(entry));

    actions.appendChild(openButton);
    actions.appendChild(deleteButton);

    itemCard.appendChild(row);
    itemCard.appendChild(itemText);
    itemCard.appendChild(meta);
    itemCard.appendChild(actions);

    return itemCard;
  }

  function renderFlatList(items) {
    libraryRoot.textContent = "";

    for (const entry of items) {
      libraryRoot.appendChild(createItemCard(entry, { showHostname: true }));
    }
  }

  function renderGroupedLibrary(items) {
    libraryRoot.textContent = "";

    const groupedLibrary = groupByHostname(items);

    for (const [hostname, entries] of groupedLibrary.entries()) {
      const groupCard = createElement("article", "site-group");
      const groupTitle = createElement("h2", "site-title", hostname);
      groupCard.appendChild(groupTitle);

      for (const entry of entries) {
        groupCard.appendChild(createItemCard(entry, { showHostname: false }));
      }

      libraryRoot.appendChild(groupCard);
    }
  }

  function renderCurrentView() {
    if (allItems.length === 0) {
      renderEmptyState();
      return;
    }

    const filteredItems = getSortableItems(allItems, currentQuery);
    if (filteredItems.length === 0) {
      renderNoSearchResults(searchInput.value.trim());
      return;
    }

    if (!groupBySiteEnabled) {
      renderFlatList(filteredItems);
      return;
    }

    renderGroupedLibrary(filteredItems);
  }

  function buildExportFilename() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `simple-highlights-backup-${stamp}.json`;
  }

  async function handleExportClick() {
    const items = await libraryModule.getLibrary();
    const jsonText = JSON.stringify(items, null, 2);
    const blob = new Blob([jsonText], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = buildExportFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    showStatus(`Exportados ${items.length} subrayados.`);
  }

  async function handleImportFileChange() {
    const file = importFileInput.files?.[0];
    importFileInput.value = "";

    if (!file) {
      return;
    }

    let parsedItems;
    try {
      const fileText = await file.text();
      parsedItems = JSON.parse(fileText);
    } catch (_error) {
      showStatus("El archivo no es un JSON valido.");
      return;
    }

    if (!Array.isArray(parsedItems)) {
      showStatus("El archivo no contiene una lista de subrayados.");
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "importHighlights",
      items: parsedItems
    });

    if (!response?.ok) {
      showStatus("No se pudo importar el archivo.");
      return;
    }

    allItems = await libraryModule.getLibrary();
    refreshSiteFilterOptions();
    renderCurrentView();
    showStatus(`Importados ${response.importedCount}, omitidos ${response.skippedCount}.`);
  }

  async function bootstrap() {
    await loadPopupPreferences();
    updateControlLabels();

    allItems = await libraryModule.getLibrary();
    refreshSiteFilterOptions();
    buildColorFilterSwatches();
    updateColorFilterActiveState();

    searchInput.value = currentRawQuery;
    siteFilterSelect.value = currentSiteFilter;

    renderCurrentView();
  }

  searchInput.addEventListener("input", () => {
    currentRawQuery = searchInput.value;
    currentQuery = normalizeForSearch(searchInput.value);
    renderCurrentView();
    savePopupPreferences();
  });

  sortModeButton.addEventListener("click", () => {
    const currentIndex = SORT_MODES.findIndex((mode) => mode.id === currentSortMode);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % SORT_MODES.length;
    currentSortMode = SORT_MODES[nextIndex].id;
    updateControlLabels();
    renderCurrentView();
    savePopupPreferences();
  });

  groupToggleButton.addEventListener("click", () => {
    groupBySiteEnabled = !groupBySiteEnabled;
    updateControlLabels();
    renderCurrentView();
    savePopupPreferences();
  });

  siteFilterSelect.addEventListener("change", () => {
    currentSiteFilter = siteFilterSelect.value;
    renderCurrentView();
    savePopupPreferences();
  });

  exportButton.addEventListener("click", handleExportClick);
  importButton.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", handleImportFileChange);

  updateControlLabels();

  bootstrap();
})();
