#!/usr/bin/env node
/**
 * Package the extension for distribution: a zip with manifest.json, the
 * built bundles, and the popup. `dist/` and `node_modules/` stay out of it.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (!existsSync("dist/content-script.js")) {
  console.error("dist/ is missing — run `npm run build` first");
  process.exit(1);
}

rmSync("build", { recursive: true, force: true });
mkdirSync("build", { recursive: true });

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const version = manifest.version;

for (const file of ["manifest.json", "popup.html"]) {
  cpSync(file, `build/${file}`);
}
cpSync("dist", "build/dist", { recursive: true });

execFileSync("zip", ["-qr", `paperclip-zh-pack-${version}.zip`, "build"], { stdio: "inherit" });
rmSync("build", { recursive: true, force: true });
console.log(`packaged paperclip-zh-pack-${version}.zip`);
