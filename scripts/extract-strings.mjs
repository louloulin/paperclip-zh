#!/usr/bin/env node
/**
 * Extract translatable UI string candidates from a Paperclip checkout.
 * Read-only against the target repo: it never writes there.
 *
 * Usage:
 *   node scripts/extract-strings.mjs [--paperclip /path/to/paperclip] [--out candidates.json]
 *
 * Output: JSON object { "candidate string": occurrenceCount }, sorted by
 * count desc — paste-worthy input for dict/zh-CN.json.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Classic TypeScript JS API (5.x): full TSX parsing. TS7 (native) has no JS
// compiler API, which is why this repo pins 5.9 for tooling.
const ts = require("typescript");

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const paperclipRoot = path.resolve(argValue("--paperclip", "/Users/louloulin/pix/paperclip"));
const outFile = path.resolve(argValue("--out", "candidates.json"));
const uiSrc = path.join(paperclipRoot, "ui", "src");

const WHITELISTED_ATTRS = new Set(["title", "placeholder", "aria-label", "alt"]);
const SKIP_DIRS = new Set(["__tests__", "tests", "stories"]);
const counts = new Map();

function isTranslatableText(text) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 500) return null;
  if (!/[A-Za-z]/.test(trimmed)) return null;
  if (/^(https?:\/\/|www\.)/i.test(trimmed)) return null;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(trimmed)) return null;
  if (/{{|}}/.test(trimmed)) return null;
  return trimmed;
}

function record(text) {
  const value = isTranslatableText(text);
  if (!value) return;
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function visit(node) {
  if (node.kind === ts.SyntaxKind.JsxText) {
    if (!node.text.includes("&")) record(node.text);
  } else if (node.kind === ts.SyntaxKind.JsxAttribute) {
    const name = node.name && (node.name.text ?? node.name.escapedText);
    if (WHITELISTED_ATTRS.has(name) && node.initializer && node.initializer.kind === ts.SyntaxKind.StringLiteral) {
      record(node.initializer.text);
    }
  }
  ts.forEachChild(node, visit);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx") || entry.name.endsWith(".stories.tsx")) continue;
    const source = readFileSync(full, "utf8");
    const sourceFile = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    visit(sourceFile);
  }
}

walk(uiSrc);

const sorted = Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
writeFileSync(outFile, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`candidates: ${Object.keys(sorted).length} → ${outFile}`);
