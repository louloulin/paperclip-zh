#!/usr/bin/env node
/**
 * Extract user-visible API message candidates from a Paperclip checkout.
 * Read-only against the target repo: it never writes there.
 *
 * The SPA renders `error`, `message`, `detail`, `hint` and `reason` fields
 * from JSON responses, so those are the literals worth translating. Template
 * literals with interpolation are recorded with `{...}` placeholders, which
 * the dictionary can match as templates.
 *
 * Usage:
 *   node scripts/extract-server-strings.mjs [--paperclip /path] [--out server-candidates.json]
 *
 * Output: JSON object { "candidate string": occurrenceCount }.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const paperclipRoot = path.resolve(argValue("--paperclip", "/Users/louloulin/pix/paperclip"));
const outFile = path.resolve(argValue("--out", "server-candidates.json"));
const roots = [
  path.join(paperclipRoot, "server", "src"),
  path.join(paperclipRoot, "packages", "shared", "src"),
];

const FIELDS = new Set(["error", "message", "detail", "hint", "reason"]);
const SKIP_DIRS = new Set(["node_modules", "__tests__", "tests", "dist", "build"]);
const counts = new Map();

function isTranslatable(text) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 300) return null;
  if (!/[A-Za-z]/.test(trimmed)) return null;
  if (/^(https?:\/\/|www\.)/i.test(trimmed)) return null;
  // Snake-case action ids and enum codes are machine values, not copy.
  if (!trimmed.includes(" ") && /^[a-z0-9_.:-]+$/i.test(trimmed)) return null;
  return trimmed;
}

function record(text) {
  const value = isTranslatable(text);
  if (!value) return;
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

/** `"literal"` → literal; `` `a ${x} b` `` → `a {x} b`. */
function literalText(node) {
  if (node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
    return node.text;
  }
  if (node.kind !== ts.SyntaxKind.TemplateExpression) return null;
  let text = node.head.text;
  for (const span of node.templateSpans) {
    const expression = span.expression.getText();
    const name = /^[\w$]+$/.test(expression) ? expression : "value";
    text += `{${name}}${span.literal.text}`;
  }
  return text;
}

function visit(node) {
  if (node.kind === ts.SyntaxKind.PropertyAssignment) {
    const name = node.name && (node.name.text ?? node.name.escapedText);
    if (FIELDS.has(name)) {
      const text = literalText(node.initializer);
      if (text !== null) record(text);
    }
  }
  ts.forEachChild(node, visit);
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts") || entry.name.endsWith(".d.ts")) continue;
    const source = readFileSync(full, "utf8");
    const sourceFile = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    visit(sourceFile);
  }
}

for (const root of roots) walk(root);

const sorted = Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
writeFileSync(outFile, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`server candidates: ${Object.keys(sorted).length} → ${outFile}`);
