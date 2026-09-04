(function () {
  "use strict";

  const root = document.documentElement;
  const viewport = window.visualViewport;
  let stableHeight = Math.max(window.innerHeight, viewport?.height || 0);
  let orientationTimer = 0;

  function isTextInput(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  }

  function update({ allowHeightRefresh = false } = {}) {
    const active = document.activeElement;
    const editing = isTextInput(active);
    const visualHeight = viewport?.height || window.innerHeight;
    const visualTop = viewport?.offsetTop || 0;
    const keyboardInset = editing
      ? Math.max(0, Math.round(stableHeight - visualHeight - visualTop))
      : 0;
    const keyboardOpen = editing && keyboardInset > 96;

    if (allowHeightRefresh && !keyboardOpen && window.innerHeight > 320) {
      stableHeight = Math.max(window.innerHeight, visualHeight + visualTop);
    }
    root.style.setProperty("--pet-stable-height", `${Math.round(stableHeight)}px`);
    root.style.setProperty("--pet-keyboard-inset", `${keyboardInset}px`);
    root.dataset.keyboard = keyboardOpen ? "open" : "closed";
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "pet-keyboard", open: keyboardOpen, inset: keyboardInset },
        window.location.origin,
      );
    }

    if (keyboardOpen && (window.scrollX || window.scrollY)) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }

  document.addEventListener("focusin", (event) => {
    if (!isTextInput(event.target)) return;
    requestAnimationFrame(() => update());
  });
  document.addEventListener("focusout", () => {
    update();
    window.setTimeout(() => update({ allowHeightRefresh: true }), 420);
  });
  viewport?.addEventListener("resize", () => update());
  viewport?.addEventListener("scroll", () => update());
  window.addEventListener("resize", () => update({ allowHeightRefresh: !isTextInput(document.activeElement) }));
  window.addEventListener("orientationchange", () => {
    window.clearTimeout(orientationTimer);
    orientationTimer = window.setTimeout(() => {
      stableHeight = Math.max(window.innerHeight, viewport?.height || 0);
      update({ allowHeightRefresh: true });
    }, 320);
  });

  update({ allowHeightRefresh: true });
})();
