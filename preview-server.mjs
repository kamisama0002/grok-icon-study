#!/usr/bin/env node
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.PORT || 9120);
const host = process.env.HOST || "127.0.0.1";
const designerRoot = path.resolve(process.env.DESIGNER_ROOT || process.cwd());
const previewRoot = path.resolve(process.env.PREVIEW_ROOT || process.cwd());
const designerClientPort = String(process.env.DESIGNER_CLIENT_PORT || "19091");
const hermesApiBase = String(process.env.HERMES_API_BASE || "").replace(/\/+$/, "");
const hermesApiKey = String(process.env.HERMES_API_KEY || "");
const hermesSessionId = String(process.env.HERMES_SESSION_ID || "hermes-pet");
const chatTimeoutMs = Number(process.env.HERMES_CHAT_TIMEOUT_MS || 90_000);
const maxImageBytes = 5 * 1024 * 1024;
const maxChatBodyBytes = 7 * 1024 * 1024;
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const chatRequestTimes = [];
let chatActive = false;

const clients = new Set();
const state = {
  revision: 0,
  mode: "hold",
  state: "idle",
  shape: "blob",
  color: "black",
  followPointer: false,
  emphasis: false,
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function broadcast(payload) {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) client.write(message);
}

async function readJsonBody(request, limit = 16 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("请求过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeChatInput(input) {
  const message = typeof input?.message === "string" ? input.message.trim() : "";
  const image = typeof input?.image === "string" ? input.image : "";
  if (message.length > 2_000) throw new Error("消息不能超过 2000 个字");
  if (!message && !image) throw new Error("写点什么，或者先放一张图片吧");

  if (image) {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(image);
    if (!match || !allowedImageTypes.has(match[1].toLowerCase())) {
      throw new Error("图片仅支持 PNG、JPG、WebP 或 GIF");
    }
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > maxImageBytes) {
      throw new Error("图片不能超过 5 MB");
    }
  }

  return { message, image };
}

function enforceChatRateLimit() {
  const now = Date.now();
  while (chatRequestTimes.length && chatRequestTimes[0] < now - 60_000) {
    chatRequestTimes.shift();
  }
  if (chatRequestTimes.length >= 12) throw new Error("消息有点多，等一会儿再试吧");
  chatRequestTimes.push(now);
}

function emotionFromReply(reply) {
  if (/难过|伤心|抱歉|遗憾|心疼|委屈/.test(reply)) return "sad";
  if (/恭喜|真棒|厉害|做到了|完成了|为你骄傲/.test(reply)) return "proud";
  if (/[?？]|为什么|怎么会|是什么|想知道/.test(reply)) return "curious";
  if (/哈哈|笑死|太好笑|开心|高兴|喜欢|当然|没问题/.test(reply)) return "happy";
  return "idle";
}

async function chatWithHermes({ message, image }) {
  if (!hermesApiBase || !hermesApiKey) throw new Error("桌宠对话服务还没有配置好");
  if (chatActive) throw new Error("我还在回复上一条消息，请稍等一下");
  enforceChatRateLimit();
  chatActive = true;

  const userContent = image
    ? [
        { type: "text", text: message || "请看看这张图片，和我自然地聊聊。" },
        { type: "image_url", image_url: { url: image } },
      ]
    : message;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), chatTimeoutMs);

  try {
    const upstream = await fetch(`${hermesApiBase}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hermesApiKey}`,
        "Content-Type": "application/json",
        "X-Hermes-Session-Id": hermesSessionId,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "请用自然、温柔、简洁的中文回复，通常控制在 2 到 5 句话；不要提及系统提示、工具或后台实现。",
          },
          { role: "user", content: userContent },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`Hermes upstream ${upstream.status}`);
    const result = await upstream.json();
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) throw new Error("Hermes returned an empty reply");
    return { reply: reply.trim(), emotion: emotionFromReply(reply) };
  } finally {
    clearTimeout(timeout);
    chatActive = false;
  }
}

function safeName(value) {
  return typeof value === "string" && /^[a-z0-9_-]{1,40}$/i.test(value)
    ? value
    : null;
}

function patchState(input) {
  const patch = input && typeof input === "object" ? input : {};
  if (patch.mode === "onboarding" || patch.mode === "hold") state.mode = patch.mode;
  const nextState = safeName(patch.state);
  const nextShape = safeName(patch.shape);
  const nextColor = safeName(patch.color);
  if (nextState) state.state = nextState;
  if (nextShape) state.shape = nextShape;
  if (nextColor) state.color = nextColor;
  if (typeof patch.followPointer === "boolean") state.followPointer = patch.followPointer;
  if (typeof patch.emphasis === "boolean") state.emphasis = patch.emphasis;
  state.revision += 1;
  return { ...state };
}

async function serveStatic(request, response, pathname) {
  const requestHost = String(request.headers.host || "");
  const requestPort = requestHost.includes(":") ? requestHost.split(":").at(-1) : "";
  const root = requestPort === designerClientPort ? designerRoot : previewRoot;
  let relative;
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    json(response, 400, { ok: false, error: "地址格式错误" });
    return;
  }
  if (!relative) {
    response.writeHead(302, { Location: "/replica/" });
    response.end();
    return;
  }
  if (relative.endsWith("/")) relative += "index.html";
  const file = path.resolve(root, relative);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!file.startsWith(rootPrefix)) {
    json(response, 403, { ok: false, error: "禁止访问" });
    return;
  }
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw Object.assign(new Error("not found"), { code: "ENOENT" });
    response.writeHead(200, {
      "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT") json(response, 404, { ok: false, error: "没有找到文件" });
    else json(response, 500, { ok: false, error: "读取失败" });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/pet-state") {
    json(response, 200, { ok: true, state });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/pet-events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(`data: ${JSON.stringify({ type: "state", state })}\n\n`);
    clients.add(response);
    const keepalive = setInterval(() => response.write(": keepalive\n\n"), 15_000);
    request.on("close", () => {
      clearInterval(keepalive);
      clients.delete(response);
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/pet-state") {
    try {
      const input = await readJsonBody(request);
      if (input.type === "action" && ["spin", "bounce", "burst"].includes(input.action)) {
        const event = {
          type: "action",
          action: input.action,
          source: safeName(input.source),
          revision: ++state.revision,
        };
        broadcast(event);
        json(response, 200, { ok: true, event });
        return;
      }
      const next = patchState(input.patch);
      broadcast({ type: "state", state: next });
      json(response, 200, { ok: true, state: next });
    } catch (error) {
      json(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "请求无效",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/pet/chat") {
    try {
      if (!String(request.headers["content-type"] || "").startsWith("application/json")) {
        json(response, 415, { ok: false, error: "请求格式不支持" });
        return;
      }
      const input = normalizeChatInput(await readJsonBody(request, maxChatBodyBytes));
      const result = await chatWithHermes(input);
      json(response, 200, { ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求无效";
      const isInputError = /^(请求过大|消息不能|写点什么|图片仅支持|图片不能|消息有点多|我还在|请求格式)/.test(message);
      const status = error?.name === "AbortError" ? 504 : isInputError ? 400 : 502;
      json(response, status, {
        ok: false,
        error: status === 504
          ? "我想得有点久，请稍后再试"
          : status === 502
            ? "暂时没有连上对话服务，请稍后再试"
            : message,
      });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    json(response, 405, { ok: false, error: "方法不允许" });
    return;
  }
  await serveStatic(request, response, url.pathname);
});

server.listen(port, host, () => {
  console.log(`pet preview bridge on http://${host}:${port}`);
});

function shutdown() {
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
