(function (g) {
  "use strict";

  const form = document.getElementById("pet-composer");
  if (!form) return;

  const input = document.getElementById("pet-chat-input");
  const fileInput = document.getElementById("pet-image-input");
  const attachButton = document.getElementById("pet-image-button");
  const sendButton = document.getElementById("pet-send");
  const preview = document.getElementById("pet-image-preview");
  const previewCount = document.getElementById("pet-image-preview-count");
  const previewList = document.getElementById("pet-image-preview-list");
  const clearImagesButton = document.getElementById("pet-image-clear");
  const bubble = document.getElementById("pet-bubble");
  const bubbleLabel = document.getElementById("pet-bubble-label");
  const bubbleText = document.getElementById("pet-bubble-text");
  const userEcho = document.getElementById("pet-user-echo");
  const memoryTrigger = document.getElementById("pet-memory-trigger");
  const memoryLayer = document.getElementById("pet-memory-layer");
  const memoryBackdrop = document.getElementById("pet-memory-backdrop");
  const memoryClose = document.getElementById("pet-memory-close");
  const personaForm = document.getElementById("pet-persona-form");
  const personaStatus = document.getElementById("pet-persona-status");
  const profileName = document.getElementById("pet-profile-name");
  const profileAddress = document.getElementById("pet-profile-address");
  const profilePersonality = document.getElementById("pet-profile-personality");
  const profileNotes = document.getElementById("pet-profile-notes");
  const personaReset = document.getElementById("pet-persona-reset");
  const longMemoryList = document.getElementById("pet-long-memory-list");
  const memoryRefresh = document.getElementById("pet-memory-refresh");
  const memoryAdd = document.getElementById("pet-memory-add");
  const memoryTarget = document.getElementById("pet-memory-target");
  const memoryContent = document.getElementById("pet-memory-content");
  const historyList = document.getElementById("pet-history-list");
  const historyClear = document.getElementById("pet-history-clear");
  let images = [];
  let nextImageId = 1;
  let busy = false;
  let idleTimer = null;
  let waitingTimer = null;
  let dragDepth = 0;
  let petLabel = "桌宠";
  let historyEntries = [];

  const allowedImages = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const maxImageCount = 8;
  const combinedImageBudget = 5 * 1024 * 1024;
  const historyStorageKey = "grok-pet-visible-history-v1";
  const apiRoot = location.pathname.startsWith("/experiments/icon-lab")
    ? "/experiments/icon-lab/api"
    : "/api";
  const allowedExpressions = new Set(
    (g.GROK_META?.groups || []).flatMap((group) => group.states || []),
  );
  const allowedShapes = new Set(Object.keys(g.GROK_GEO?.shapes || {}));
  const allowedColors = new Set(Object.keys(g.GROK_GEO?.palette || {}));
  const allowedActions = new Set(["spin", "bounce", "burst"]);
  const textWaitingMoments = [
    { text: "我听见啦，先让我接住这句话。", expression: "listening" },
    { text: "这个有点意思，我正在琢磨。", expression: "curious" },
    { text: "我正在把想法慢慢整理好。", expression: "working" },
    { text: "快好了，再等我一小会儿。", expression: "thinking" },
    { text: "先别走，我马上就回来。", expression: "playful" },
  ];
  const imageWaitingMoments = [
    { text: "图片收到，我先仔细看看。", expression: "receiving" },
    { text: "我在观察里面的小细节。", expression: "curious" },
    { text: "我再找找画面里的线索。", expression: "searching" },
    { text: "快看明白了，再等我一下。", expression: "thinking" },
    { text: "我正在组织怎么告诉你。", expression: "working" },
  ];
  const defaultGreetings = [
    "你来啦。今天想聊点什么？",
    "我在这里，想说什么都可以。",
    "刚刚还在发呆，正好等到你。",
    "欢迎回来。今天要我陪你做点什么？",
    "见到你啦，今天过得怎么样？",
    "要不要和我说说刚刚发生的事？",
  ];

  function setBubble(text, state = "ready", label = petLabel) {
    bubble.dataset.state = state;
    bubbleLabel.textContent = label;
    bubbleText.textContent = text;
  }

  function loadHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem(historyStorageKey) || "[]");
      historyEntries = Array.isArray(stored)
        ? stored.filter((item) => item && ["user", "assistant"].includes(item.role)).slice(-40)
        : [];
    } catch {
      historyEntries = [];
    }
  }

  function saveHistory() {
    localStorage.setItem(historyStorageKey, JSON.stringify(historyEntries.slice(-40)));
  }

  function renderHistory() {
    if (!historyList) return;
    historyList.replaceChildren();
    if (!historyEntries.length) {
      const empty = document.createElement("p");
      empty.className = "pet-history-empty";
      empty.textContent = "还没有对话。图片只显示名称，不会保存在浏览器记录里。";
      historyList.appendChild(empty);
      return;
    }
    for (const item of historyEntries) {
      const entry = document.createElement("article");
      entry.className = "pet-history-item";
      entry.dataset.role = item.role;
      const meta = document.createElement("small");
      meta.textContent = item.role === "user" ? "你" : petLabel;
      const copy = document.createElement("p");
      copy.textContent = `${item.text}${item.imageName ? `\n[图片] ${item.imageName}` : ""}`;
      entry.append(meta, copy);
      historyList.appendChild(entry);
    }
    historyList.scrollTop = historyList.scrollHeight;
  }

  function addHistory(role, text, imageName = "") {
    historyEntries.push({
      role,
      text: String(text || "").slice(0, 2_000),
      imageName: String(imageName || "").slice(0, 120),
      at: Date.now(),
    });
    historyEntries = historyEntries.slice(-40);
    saveHistory();
    renderHistory();
  }

  function applyProfile(profile, { welcome = false, syncAppearance = true } = {}) {
    const next = profile && typeof profile === "object" ? profile : {};
    profileName.value = next.petName || "";
    profileAddress.value = next.userAddress || "";
    profilePersonality.value = next.personality || "warm";
    profileNotes.value = next.notes || "";
    petLabel = next.petName || "桌宠";
    bubbleLabel.textContent = petLabel;
    if (welcome && userEcho.hidden && !busy) {
      if (next.petName) {
        const greeting = next.userAddress
          ? `${next.userAddress}，欢迎回来，我是${next.petName}。今天想聊点什么？`
          : `欢迎回来，我是${next.petName}。今天想聊点什么？`;
        setBubble(greeting, "ready", petLabel);
      } else {
        const greeting = defaultGreetings[Math.floor(Math.random() * defaultGreetings.length)];
        setBubble(greeting, "ready", petLabel);
      }
    }
    if (syncAppearance) {
      const patch = { mode: "hold" };
      if (allowedShapes.has(next.shape)) patch.shape = next.shape;
      if (allowedColors.has(next.color)) patch.color = next.color;
      if (typeof next.followPointer === "boolean") patch.followPointer = next.followPointer;
      if (typeof next.emphasis === "boolean") patch.emphasis = next.emphasis;
      g.PET_SYNC?.state(patch);
    }
    renderHistory();
  }

  async function loadProfile() {
    try {
      const response = await fetch(`${apiRoot}/pet/profile`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error();
      applyProfile(result.profile, { welcome: true });
    } catch {
      personaStatus.textContent = "暂时无法读取设定";
    }
  }

  async function saveProfile(profile, reset = false) {
    personaStatus.textContent = "保存中…";
    const controls = [...personaForm.elements];
    controls.forEach((control) => { control.disabled = true; });
    try {
      const response = await fetch(`${apiRoot}/pet/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { reset: true } : { profile }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "保存失败");
      applyProfile(result.profile);
      personaStatus.textContent = "已保存";
      setBubble(reset ? "人格设定已经恢复默认。" : "好，我会照这个方式和你相处。", "ready");
    } catch (error) {
      personaStatus.textContent = error instanceof Error ? error.message : "保存失败";
    } finally {
      controls.forEach((control) => { control.disabled = false; });
    }
  }

  function renderLongMemories(groups) {
    longMemoryList.replaceChildren();
    const populated = (groups || []).filter((group) => Array.isArray(group.entries) && group.entries.length);
    if (!populated.length) {
      const empty = document.createElement("p");
      empty.className = "pet-history-empty";
      empty.textContent = "还没有长期记忆。聊天里说“记住……”，或者在这里添加。";
      longMemoryList.appendChild(empty);
      return;
    }

    for (const group of populated) {
      const section = document.createElement("section");
      section.className = "pet-long-memory-group";
      const label = document.createElement("small");
      label.textContent = `${group.label} · ${group.used}/${group.limit}`;
      section.appendChild(label);

      for (const value of group.entries) {
        const entry = document.createElement("article");
        entry.className = "pet-memory-entry";
        const copy = document.createElement("p");
        copy.textContent = value;
        const actions = document.createElement("div");
        actions.className = "pet-memory-entry__actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "修改";
        edit.addEventListener("click", () => {
          const next = prompt("修改这条记忆", value);
          if (next !== null && next.trim() && next.trim() !== value) {
            void updateMemory("PUT", { target: group.target, oldText: value, content: next });
          }
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "忘记";
        remove.addEventListener("click", () => {
          if (confirm("让桌宠忘掉这条长期记忆吗？")) {
            void updateMemory("DELETE", { target: group.target, oldText: value });
          }
        });
        actions.append(edit, remove);
        entry.append(copy, actions);
        section.appendChild(entry);
      }
      longMemoryList.appendChild(section);
    }
  }

  async function loadLongMemories() {
    memoryRefresh.disabled = true;
    try {
      const response = await fetch(`${apiRoot}/pet/memories`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "读取失败");
      renderLongMemories(result.groups);
    } catch (error) {
      renderLongMemories([]);
      personaStatus.textContent = error instanceof Error ? error.message : "读取记忆失败";
    } finally {
      memoryRefresh.disabled = false;
    }
  }

  async function updateMemory(method, payload) {
    try {
      const response = await fetch(`${apiRoot}/pet/memories`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "记忆没有更新成功");
      renderLongMemories(result.groups);
      setBubble(method === "DELETE" ? "好，我已经忘掉那件事了。" : "好，这件事我会记住。", "ready");
      return true;
    } catch (error) {
      personaStatus.textContent = error instanceof Error ? error.message : "记忆没有更新成功";
      return false;
    }
  }

  function openMemory() {
    memoryLayer.hidden = false;
    memoryTrigger.setAttribute("aria-expanded", "true");
    renderHistory();
    void loadLongMemories();
    memoryClose.focus();
  }

  function closeMemory() {
    memoryLayer.hidden = true;
    memoryTrigger.setAttribute("aria-expanded", "false");
    memoryTrigger.focus();
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function renderImages() {
    previewList.replaceChildren();
    preview.hidden = images.length === 0;
    previewCount.textContent = `已选择 ${images.length} 张图片`;

    for (const image of images) {
      const item = document.createElement("article");
      item.className = "pet-image-preview__item";

      const thumbnail = document.createElement("img");
      thumbnail.src = image.previewUrl;
      thumbnail.alt = image.file.name || "待发送图片";

      const meta = document.createElement("div");
      meta.className = "pet-image-preview__meta";
      const name = document.createElement("strong");
      name.textContent = image.file.name || `图片 ${image.id}`;
      const size = document.createElement("small");
      size.textContent = formatBytes(image.file.size);
      meta.append(name, size);

      const remove = document.createElement("button");
      remove.className = "pet-image-preview__remove";
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `移除 ${image.file.name || "图片"}`);
      remove.addEventListener("click", () => removeImage(image.id));

      item.append(thumbnail, meta, remove);
      previewList.appendChild(item);
    }
  }

  function removeImage(id) {
    const target = images.find((image) => image.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    images = images.filter((image) => image.id !== id);
    renderImages();
    if (!busy) {
      setBubble(
        images.length ? `还剩 ${images.length} 张图片。` : "图片已经移除了。",
        "ready",
      );
    }
  }

  function clearImages() {
    for (const image of images) URL.revokeObjectURL(image.previewUrl);
    images = [];
    fileInput.value = "";
    renderImages();
    if (!busy) setBubble("图片已经全部移除了。", "ready");
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败")),
        type,
        quality,
      );
    });
  }

  async function optimizeImage(file, targetBytes, maxSide) {
    if (file.size <= targetBytes) {
      return { dataUrl: await readAsDataUrl(file), optimized: false };
    }

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      bitmap.close();
      throw new Error("浏览器无法处理这张图片");
    }

    let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    let output = null;
    for (let resizePass = 0; resizePass < 6; resizePass += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (let quality = 0.88; quality >= 0.48; quality -= 0.1) {
        output = await canvasToBlob(canvas, "image/webp", quality);
        if (output.size <= targetBytes) break;
      }
      if (output?.size <= targetBytes) break;
      scale *= 0.82;
    }
    bitmap.close();
    if (!output || output.size > targetBytes) throw new Error("图片压缩后仍然过大");
    return { dataUrl: await readAsDataUrl(output), optimized: true };
  }

  function addImages(files) {
    const selected = [...(files || [])];
    if (!selected.length) return;
    const invalid = selected.find((file) => !allowedImages.has(file.type));
    if (invalid) {
      setBubble("图片仅支持 PNG、JPG、WebP 或 GIF。", "error");
      return;
    }
    const available = maxImageCount - images.length;
    const accepted = selected.slice(0, Math.max(0, available));
    for (const file of accepted) {
      images.push({
        id: nextImageId++,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    fileInput.value = "";
    renderImages();
    if (selected.length > accepted.length) {
      setBubble(`一条消息最多放 ${maxImageCount} 张，我先保留了前 ${maxImageCount} 张。`, "error");
    } else {
      setBubble(
        images.length > 1
          ? `${images.length} 张图片都放好了，可以补充一句想让我怎么看。`
          : "图片放好了，还可以补充一句想问我的话。",
        "ready",
      );
    }
  }

  async function prepareImagesForSend() {
    if (!images.length) return [];
    const targetBytes = Math.floor(combinedImageBudget / images.length);
    const maxSide = images.length > 1 ? 1600 : 2048;
    return Promise.all(images.map(async ({ file }) => {
      const prepared = await optimizeImage(file, targetBytes, maxSide);
      return prepared.dataUrl;
    }));
  }

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    input.disabled = nextBusy;
    attachButton.disabled = nextBusy;
    sendButton.disabled = nextBusy;
    sendButton.textContent = nextBusy ? "回应中" : "发送";
  }

  function stopWaiting() {
    if (waitingTimer !== null) window.clearInterval(waitingTimer);
    waitingTimer = null;
  }

  function startWaiting(hasImage) {
    stopWaiting();
    const moments = hasImage ? imageWaitingMoments : textWaitingMoments;
    let index = Math.floor(Math.random() * moments.length);
    const showMoment = () => {
      const moment = moments[index % moments.length];
      index += 1;
      setBubble(moment.text, "thinking");
      g.PET_SYNC?.state({
        mode: "hold",
        state: moment.expression,
        emphasis: moment.expression === "thinking",
      });
    };
    showMoment();
    waitingTimer = window.setInterval(showMoment, 2400);
  }

  function returnToIdle(delay = 2800) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      g.PET_SYNC?.state({ mode: "hold", state: "idle" });
    }, delay);
  }

  async function submit() {
    if (busy) return;
    clearTimeout(idleTimer);
    idleTimer = null;
    const text = input.value.trim();
    if (!text && !images.length) {
      input.focus();
      setBubble("写点什么，或者先放几张图片吧。", "error");
      return;
    }

    const hasImages = images.length > 0;
    const submittedImageNames = images.map(({ file }) => file.name || "未命名图片");
    const imageSummary = submittedImageNames.length === 1
      ? submittedImageNames[0]
      : `${submittedImageNames.length} 张图片`;
    userEcho.textContent = hasImages
      ? `你：${text || `发送了 ${submittedImageNames.length} 张图片`} · ${imageSummary}`
      : `你：${text}`;
    userEcho.hidden = false;
    setBusy(true);
    startWaiting(hasImages);

    try {
      const preparedImages = await prepareImagesForSend();
      const response = await fetch(`${apiRoot}/pet/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, images: preparedImages }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || typeof result.reply !== "string") {
        throw new Error(result.error || "暂时没有收到回复，请稍后再试");
      }
      stopWaiting();

      const control = result.control && typeof result.control === "object" ? result.control : {};
      const expression = allowedExpressions.has(control.expression)
        ? control.expression
        : allowedExpressions.has(result.emotion)
          ? result.emotion
          : null;
      if (result.profile) applyProfile(result.profile, { syncAppearance: false });
      setBubble(result.reply, "ready");
      const statePatch = {
        mode: "hold",
        state: expression || "idle",
        emphasis: typeof control.emphasis === "boolean"
          ? control.emphasis
          : Boolean(result.profile?.emphasis),
      };
      if (allowedShapes.has(control.shape)) statePatch.shape = control.shape;
      if (allowedColors.has(control.color)) statePatch.color = control.color;
      if (typeof control.followPointer === "boolean") statePatch.followPointer = control.followPointer;
      g.PET_SYNC?.state(statePatch);
      const action = allowedActions.has(control.action) ? control.action : null;
      if (action) g.PET_SYNC?.action(action);
      input.value = "";
      resizeInput();
      clearImages();
      addHistory(
        "user",
        text || `发送了 ${submittedImageNames.length} 张图片`,
        submittedImageNames.join("、"),
      );
      addHistory("assistant", result.reply);
      if (expression) returnToIdle(6500);
    } catch (error) {
      stopWaiting();
      setBubble(error instanceof Error ? error.message : "暂时没有收到回复，请稍后再试", "error");
      g.PET_SYNC?.state({ mode: "hold", state: "confused", emphasis: false });
    } finally {
      stopWaiting();
      setBusy(false);
      input.focus();
    }
  }

  attachButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => addImages(fileInput.files));
  clearImagesButton.addEventListener("click", clearImages);
  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      if (images.length) clearImages();
      else input.blur();
    }
  });
  input.addEventListener("paste", (event) => {
    const pastedImages = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (pastedImages.length) {
      event.preventDefault();
      addImages(pastedImages);
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });
  form.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    form.dataset.drag = "true";
  });
  form.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  form.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) form.dataset.drag = "false";
  });
  form.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    form.dataset.drag = "false";
    const droppedImages = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (droppedImages.length) addImages(droppedImages);
  });

  memoryTrigger.addEventListener("click", openMemory);
  memoryBackdrop.addEventListener("click", closeMemory);
  memoryClose.addEventListener("click", closeMemory);
  personaForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveProfile({
      petName: profileName.value,
      userAddress: profileAddress.value,
      personality: profilePersonality.value,
      notes: profileNotes.value,
    });
  });
  personaReset.addEventListener("click", () => {
    if (confirm("恢复默认名字、称呼和相处风格吗？")) void saveProfile({}, true);
  });
  historyClear.addEventListener("click", () => {
    historyEntries = [];
    saveHistory();
    renderHistory();
  });
  memoryRefresh.addEventListener("click", () => void loadLongMemories());
  memoryAdd.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = memoryContent.value.trim();
    if (!content) {
      memoryContent.focus();
      return;
    }
    const saved = await updateMemory("POST", { target: memoryTarget.value, content });
    if (saved) memoryContent.value = "";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !memoryLayer.hidden) {
      event.preventDefault();
      closeMemory();
    }
  });

  loadHistory();
  renderHistory();
  void loadProfile();

  g.PET_CHAT = {
    reply(text) {
      setBubble(String(text || ""), "ready", "桌宠");
    },
    thinking(text = "让我想一想…") {
      setBubble(String(text), "thinking");
    },
    clearImage: clearImages,
    clearImages,
  };
})(window);
