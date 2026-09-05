(function () {
  "use strict";

  const desktop = window.petDesktop;
  if (!desktop?.isDesktop) return;

  const root = document.documentElement;
  const disk = document.getElementById("disk");
  const input = document.getElementById("pet-chat-input");
  if (!disk) return;

  let open = false;
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  function setOpen(next) {
    open = Boolean(next);
    root.dataset.petChatOpen = String(open);
    desktop.setExpanded(open);
    if (open) window.setTimeout(() => input?.focus(), 220);
  }

  disk.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    startX = lastX = event.screenX;
    startY = lastY = event.screenY;
    disk.setPointerCapture?.(event.pointerId);
  });

  disk.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.screenX - lastX;
    const dy = event.screenY - lastY;
    if (Math.abs(event.screenX - startX) > 4 || Math.abs(event.screenY - startY) > 4) moved = true;
    if (dx || dy) desktop.moveBy(dx, dy);
    lastX = event.screenX;
    lastY = event.screenY;
  });

  disk.addEventListener("pointerup", (event) => {
    dragging = false;
    disk.releasePointerCapture?.(event.pointerId);
  });

  disk.addEventListener("click", () => {
    if (moved) {
      moved = false;
      return;
    }
    setOpen(!open);
  });

  disk.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    desktop.showMenu();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!open) return;
    if (event.target.closest(".disk, .pet-composer, .pet-dialog-stack, .pet-memory-trigger, .pet-memory-layer")) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open && !event.target.closest(".pet-memory-layer")) {
      event.preventDefault();
      setOpen(false);
    }
  });

  setOpen(false);
})();
