(function (g) {
  "use strict";

  let bots = [];
  let latestRevision = -1;
  let currentState = null;
  const clientId = Math.random().toString(36).slice(2, 12);

  function post(payload) {
    return fetch("/api/pet-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  }

  function updateControls(state) {
    if (typeof g.syncModes === "function" && state.mode) g.syncModes(state.mode);
    const follow = document.getElementById("opt-follow");
    const emphasis = document.getElementById("opt-emphasis");
    if (follow) follow.setAttribute("aria-pressed", state.followPointer ? "true" : "false");
    if (emphasis) emphasis.setAttribute("aria-pressed", state.emphasis ? "true" : "false");
    document.querySelectorAll("[data-state]").forEach((element) => {
      element.setAttribute("aria-pressed", element.dataset.state === state.state ? "true" : "false");
    });
    document.querySelectorAll("[data-shape]").forEach((element) => {
      element.setAttribute("aria-pressed", element.dataset.shape === state.shape ? "true" : "false");
    });
    document.querySelectorAll(".swatch").forEach((element) => {
      element.setAttribute("aria-pressed", element.title === state.color ? "true" : "false");
    });
  }

  function applyState(state) {
    if (!state || state.revision < latestRevision) return;
    latestRevision = state.revision;
    currentState = state;
    for (const bot of bots) {
      if (state.mode) bot.setMode(state.mode);
      if (state.mode === "hold" && state.state) bot.setState(state.state, { resetEyes: false });
      if (state.shape) bot.setShape(state.shape);
      if (state.color) bot.setColor(state.color, "light");
      bot.setFollowPointer(Boolean(state.followPointer));
      bot.setEmphasis(Boolean(state.emphasis));
    }
    updateControls(state);
  }

  function applyAction(action) {
    for (const bot of bots) {
      if (action === "spin") bot.spinOnce(1);
      else if (action === "bounce") bot.bounceOnce();
      else if (action === "burst") bot.burstOnce();
    }
  }

  const events = new EventSource("/api/pet-events");
  events.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "state") applyState(payload.state);
      else if (payload.type === "action" && payload.source !== clientId) applyAction(payload.action);
    } catch {
      // Ignore a malformed preview event and keep the stream alive.
    }
  };

  g.PET_SYNC = {
    register(nextBots) {
      bots = Array.isArray(nextBots) ? nextBots : [];
      if (currentState) {
        latestRevision = -1;
        applyState(currentState);
      }
    },
    state(patch) {
      return post({ type: "state", patch });
    },
    action(action) {
      applyAction(action);
      return post({ type: "action", action, source: clientId });
    },
  };
})(window);
