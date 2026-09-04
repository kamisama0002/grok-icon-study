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

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) throw new Error("请求过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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
