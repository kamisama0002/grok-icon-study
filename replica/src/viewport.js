(function () {
  "use strict";

  const root = document.documentElement;
  const viewport = window.visualViewport;
  let stableHeight = Math.max(window.innerHeight, viewport?.height || 0);
  let orientationTimer = 0;
  let parentLocked = false;
  let keyboardSeen = false;

  function isTextInput(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  }

  function update() {
    const active = document.activeElement;
    const editing = isTextInput(active);
    const visualHeight = viewport?.height || window.innerHeight;
    const visualTop = viewport?.offsetTop || 0;
    const keyboardInset = editing
      ? Math.max(0, Math.round(stableHeight - visualHeight - visualTop))
      : 0;
    const keyboardOpen = editing && keyboardInset > 96;

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
    keyboardSeen = true;
    requestAnimationFrame(() => update());
  });
  document.addEventListener("focusout", () => {
    update();
  });
  viewport?.addEventListener("resize", () => update());
  viewport?.addEventListener("scroll", () => update());
  window.addEventListener("resize", () => {
    if (!parentLocked && !keyboardSeen && !isTextInput(document.activeElement) && window.innerHeight > 320) {
      stableHeight = Math.max(window.innerHeight, viewport?.height || 0);
    }
    update();
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== "pet-viewport-lock") return;
    const height = Number(event.data.height);
    if (!Number.isFinite(height) || height < 320 || height > 3000) return;
    parentLocked = true;
    stableHeight = Math.round(height);
    update();
  });
  window.addEventListener("orientationchange", () => {
    window.clearTimeout(orientationTimer);
    orientationTimer = window.setTimeout(() => {
      parentLocked = false;
      keyboardSeen = false;
      stableHeight = Math.max(window.innerHeight, viewport?.height || 0);
      update();
    }, 320);
  });

  update();
})();
