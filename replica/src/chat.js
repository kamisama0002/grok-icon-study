(function (g) {
  "use strict";

  const form = document.getElementById("pet-composer");
  if (!form) return;

  const input = document.getElementById("pet-chat-input");
  const fileInput = document.getElementById("pet-image-input");
  const attachButton = document.getElementById("pet-image-button");
  const sendButton = document.getElementById("pet-send");
  const preview = document.getElementById("pet-image-preview");
  const previewImage = document.getElementById("pet-image-preview-image");
  const previewName = document.getElementById("pet-image-preview-name");
  const previewSize = document.getElementById("pet-image-preview-size");
  const removeImageButton = document.getElementById("pet-image-remove");
  const bubble = document.getElementById("pet-bubble");
  const bubbleLabel = document.getElementById("pet-bubble-label");
  const bubbleText = document.getElementById("pet-bubble-text");
  const userEcho = document.getElementById("pet-user-echo");
  let image = null;
  let busy = false;
  let idleTimer = null;
  let dragDepth = 0;

  const allowedImages = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const maxImageBytes = 5 * 1024 * 1024;

  function setBubble(text, state = "ready", label = "桌宠") {
    bubble.dataset.state = state;
    bubbleLabel.textContent = label;
    bubbleText.textContent = text;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function clearImage() {
    image = null;
    fileInput.value = "";
    preview.hidden = true;
    previewImage.removeAttribute("src");
    previewName.textContent = "";
    previewSize.textContent = "";
  }

  function readImage(file) {
    if (!file || !allowedImages.has(file.type)) {
      setBubble("请选择 PNG、JPG、WebP 或 GIF 图片。", "error");
      return;
    }
    if (file.size > maxImageBytes) {
      setBubble("图片不能超过 5 MB，换一张小一点的吧。", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      image = { file, dataUrl: String(reader.result || "") };
      previewImage.src = image.dataUrl;
      previewName.textContent = file.name;
      previewSize.textContent = formatBytes(file.size);
      preview.hidden = false;
      setBubble("图片准备好了，还可以补充一句想问我的话。", "ready");
    };
    reader.onerror = () => setBubble("这张图片读取失败了，请重新选择。", "error");
    reader.readAsDataURL(file);
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
    sendButton.textContent = nextBusy ? "思考中" : "发送";
  }

  function returnToIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      g.PET_SYNC?.state({ mode: "hold", state: "idle", emphasis: false });
    }, 2800);
  }

  async function submit() {
    if (busy) return;
    clearTimeout(idleTimer);
    idleTimer = null;
    const text = input.value.trim();
    if (!text && !image) {
      input.focus();
      setBubble("写点什么，或者先放一张图片吧。", "error");
      return;
    }

    const hasImage = Boolean(image);
    userEcho.textContent = hasImage
      ? `你：${text || "发送了一张图片"} · ${image.file.name}`
      : `你：${text}`;
    userEcho.hidden = false;
    setBusy(true);
    setBubble("让我想一想…", "thinking");
    g.PET_SYNC?.state({ mode: "hold", state: "thinking", emphasis: true });

    try {
      const response = await fetch("/api/pet/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, image: image?.dataUrl || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || typeof result.reply !== "string") {
        throw new Error(result.error || "暂时没有收到回复，请稍后再试");
      }

      const allowedEmotions = new Set(["idle", "happy", "curious", "proud", "sad"]);
      const emotion = allowedEmotions.has(result.emotion) ? result.emotion : "happy";
      setBubble(result.reply, "ready");
      g.PET_SYNC?.state({ mode: "hold", state: emotion, emphasis: false });
      if (emotion === "happy" || emotion === "proud") g.PET_SYNC?.action("bounce");
      input.value = "";
      resizeInput();
      clearImage();
      returnToIdle();
    } catch (error) {
      setBubble(error instanceof Error ? error.message : "暂时没有收到回复，请稍后再试", "error");
      g.PET_SYNC?.state({ mode: "hold", state: "confused", emphasis: false });
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  attachButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => readImage(fileInput.files?.[0]));
  removeImageButton.addEventListener("click", clearImage);
  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      if (image) clearImage();
      else input.blur();
    }
  });
  input.addEventListener("paste", (event) => {
    const pastedImage = [...(event.clipboardData?.files || [])].find((file) => file.type.startsWith("image/"));
    if (pastedImage) {
      event.preventDefault();
      readImage(pastedImage);
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
    const droppedImage = [...(event.dataTransfer?.files || [])].find((file) => file.type.startsWith("image/"));
    if (droppedImage) readImage(droppedImage);
  });

  g.PET_CHAT = {
    reply(text) {
      setBubble(String(text || ""), "ready", "桌宠");
    },
    thinking(text = "让我想一想…") {
      setBubble(String(text), "thinking");
    },
    clearImage,
  };
})(window);
