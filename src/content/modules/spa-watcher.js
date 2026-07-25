"use strict";

(() => {
  const POLL_INTERVAL_MS = 800;
  const LOCATION_CHANGE_EVENT = "shl:locationchange";

  function patchHistoryMethod(methodName) {
    const originalMethod = history[methodName];

    history[methodName] = function patchedHistoryMethod(...args) {
      const result = originalMethod.apply(this, args);
      window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
      return result;
    };
  }

  function watchForUrlChanges(onUrlChange) {
    if (typeof onUrlChange !== "function") {
      return () => {};
    }

    let lastUrl = window.location.href;

    function checkForChange() {
      if (window.location.href === lastUrl) {
        return;
      }

      lastUrl = window.location.href;
      onUrlChange(lastUrl);
    }

    patchHistoryMethod("pushState");
    patchHistoryMethod("replaceState");

    window.addEventListener(LOCATION_CHANGE_EVENT, checkForChange);
    window.addEventListener("popstate", checkForChange);
    window.addEventListener("hashchange", checkForChange);

    const pollTimerId = window.setInterval(checkForChange, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener(LOCATION_CHANGE_EVENT, checkForChange);
      window.removeEventListener("popstate", checkForChange);
      window.removeEventListener("hashchange", checkForChange);
      window.clearInterval(pollTimerId);
    };
  }

  globalThis.SimpleHighlightsSpaWatcher = Object.freeze({
    watchForUrlChanges
  });
})();
