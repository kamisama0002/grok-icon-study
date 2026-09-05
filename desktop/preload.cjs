const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petDesktop", {
  isDesktop: true,
  moveBy(dx, dy) {
    const x = Number(dx);
    const y = Number(dy);
    if (Number.isFinite(x) && Number.isFinite(y)) ipcRenderer.send("pet-window-move-by", x, y);
  },
  setExpanded(expanded) {
    ipcRenderer.send("pet-window-expanded", Boolean(expanded));
  },
  showMenu() {
    ipcRenderer.send("pet-show-menu");
  },
});
