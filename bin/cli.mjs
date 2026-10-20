#!/usr/bin/env node
/**
 * paperclip-zh-pack CLI.
 *
 *   paperclip-zh-pack install [--dir <path>]
 *   paperclip-zh-pack serve [--target http://localhost:3121] [--port 3122] [--host 127.0.0.1]
 *
 * `install` stages the unpacked extension and prints the one manual step
 * Chrome requires. `serve` is the npm-only path: a loopback reverse proxy
 * that injects the same bundles into Paperclip's HTML, so no browser
 * extension is needed.
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import os from "node:os";
import path from "node:path";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STATIC_PREFIX, injectScripts, rewriteLocation } from "./proxy-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function flag(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function ensureDist() {
  if (existsSync(path.join(ROOT, "dist", "content-script.js"))) return;
  if (!existsSync(path.join(ROOT, "scripts", "build.mjs"))) {
    fail("dist/ is missing and this package has no build script.");
  }
  console.log("[paperclip-zh-pack] dist/ missing — building…");
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

function fail(message) {
  console.error(`paperclip-zh-pack: ${message}`);
  process.exit(1);
}

function install() {
  ensureDist();
  const dir = path.resolve(flag("--dir", path.join(os.homedir(), ".paperclip-zh-pack", "extension")));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const file of ["manifest.json", "popup.html"]) {
    cpSync(path.join(ROOT, file), path.join(dir, file));
  }
  cpSync(path.join(ROOT, "dist"), path.join(dir, "dist"), { recursive: true });
  console.log(`\n扩展已就绪：${dir}\n`);
  console.log("最后一步（浏览器要求，无法由 npm 代劳）：");
  console.log("  1. 打开 chrome://extensions 或 edge://extensions");
  console.log("  2. 开启「开发者模式」");
  console.log("  3. 「加载已解压的扩展程序」→ 选择上面的目录");
}

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function serveStatic(req, res) {
  if (!req.url || !req.url.startsWith(STATIC_PREFIX)) return false;
  const name = req.url.slice(STATIC_PREFIX.length).split("?")[0];
  const allowed = new Map([
    ["content-script.js", "dist/content-script.js"],
    ["page-patch.js", "dist/page-patch.js"],
    ["popup.html", "popup.html"],
    ["popup.js", "dist/popup.js"],
    ["background.js", "dist/background.js"],
  ]);
  // popup.html references dist/popup.js, matching the extension layout.
  const file =
    allowed.get(name) ??
    (/^dist\/[A-Za-z0-9._-]+\.js$/.test(name) ? name : undefined);
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return true;
  }
  const abs = path.join(ROOT, file);
  if (!existsSync(abs)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not built");
    return true;
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(abs)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(readFileSync(abs));
  return true;
}

function serve() {
  ensureDist();
  const target = new URL(flag("--target", "http://localhost:3121"));
  const port = Number(flag("--port", "3122"));
  const host = flag("--host", "127.0.0.1");
  const isTls = target.protocol === "https:";
  const targetPort = Number(target.port) || (isTls ? 443 : 80);
  const transport = isTls ? https : http;

  const server = http.createServer((req, res) => {
    if (serveStatic(req, res)) return;

    const proxyOrigin = `http://${req.headers.host ?? `${host}:${port}`}`;
    const headers = {
      ...req.headers,
      host: target.host,
      // Ask for identity so HTML can be rewritten; Node re-chunks the body.
      "accept-encoding": "identity",
    };

    const upstream = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: targetPort,
        method: req.method,
        path: req.url,
        headers,
      },
      (upstreamRes) => {
        const type = String(upstreamRes.headers["content-type"] ?? "");
        if (type.includes("text/html")) {
          const chunks = [];
          upstreamRes.on("data", (chunk) => chunks.push(chunk));
          upstreamRes.on("end", () => {
            const body = Buffer.from(injectScripts(Buffer.concat(chunks).toString("utf8")));
            const outHeaders = { ...upstreamRes.headers };
            delete outHeaders["content-length"];
            delete outHeaders["content-encoding"];
            delete outHeaders["transfer-encoding"];
            res.writeHead(upstreamRes.statusCode ?? 502, outHeaders);
            res.end(body);
          });
          return;
        }
        const outHeaders = { ...upstreamRes.headers };
        if (typeof outHeaders.location === "string") {
          outHeaders.location = rewriteLocation(outHeaders.location, target, proxyOrigin);
        }
        res.writeHead(upstreamRes.statusCode ?? 502, outHeaders);
        upstreamRes.pipe(res);
      },
    );

    upstream.on("error", (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(`paperclip-zh-pack proxy error: ${error.message}`);
    });
    req.pipe(upstream);
  });

  // Vite HMR and any app WebSocket need the upgrade hop forwarded verbatim.
  server.on("upgrade", (req, socket, head) => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [key, value] of Object.entries({ ...req.headers, host: target.host })) {
      lines.push(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
    }
    const toTarget = isTls
      ? tls.connect({ host: target.hostname, port: targetPort, servername: target.hostname })
      : net.connect(targetPort, target.hostname);
    toTarget.on(isTls ? "secureConnect" : "connect", () => {
      toTarget.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) toTarget.write(head);
      socket.pipe(toTarget);
      toTarget.pipe(socket);
    });
    toTarget.on("error", () => socket.destroy());
    socket.on("error", () => toTarget.destroy());
  });

  server.listen(port, host, () => {
    console.log(`\n[paperclip-zh-pack] 代理已启动`);
    console.log(`  打开：http://${host}:${port}/`);
    console.log(`  上游：${target.origin}`);
    console.log(`  无需浏览器扩展；脚本注入到 HTML。Ctrl+C 停止。\n`);
  });
}

switch (command) {
  case "install":
    install();
    break;
  case "serve":
  case "dev":
    serve();
    break;
  case "help":
  case "--help":
  case "-h":
    console.log(`paperclip-zh-pack — Paperclip 中文语言包

用法：
  paperclip-zh-pack install [--dir <path>]   准备可加载的扩展目录
  paperclip-zh-pack serve [--target <url>] [--port <n>] [--host <addr>]
                                             启动注入代理（无需扩展）

默认 target: http://localhost:3121
默认 port:   3122`);
    break;
  default:
    fail(`unknown command "${command}" (try --help)`);
}
