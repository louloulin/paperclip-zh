#!/usr/bin/env node
/**
 * Report dictionary coverage for the extracted UI and server candidates.
 * Bundles the real dictionary with esbuild so matching semantics (exact hit,
 * template, normalization) are identical to the runtime bundle.
 *
 * Usage:
 *   node scripts/coverage.mjs [--ui candidates.json] [--server server-candidates.json]
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const uiFile = path.resolve(argValue("--ui", "candidates.json"));
const serverFile = path.resolve(argValue("--server", "server-candidates.json"));
const bundleFile = path.resolve(".coverage-dictionary.mjs");

await build({
  entryPoints: [path.resolve("src/shared/dictionary.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundleFile,
  logLevel: "silent",
});

const { translate, dictionary, templates } = await import(pathToFileURL(bundleFile).href);

function readCounts(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Not every extracted literal is copy: JSX splits sentences into fragments
 * ("of", "more"), and code constants are not UI text. This filter keeps
 * strings a translator would recognise as a label or a sentence.
 */
function looksLikeCopy(text) {
  const value = text.trim();
  if (value.length < 4) return false;
  if (/^[/\\.~]|https?:|[\w.+-]+@[\w-]+\./.test(value)) return false;
  if (/\$\{/.test(value)) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (/^[a-z]+([A-Z][a-z]+)+$/.test(value)) return false;
  // A bare lowercase word with no space is a fragment like "of" or "run".
  if (!/[A-Z]/.test(value) && !/\s/.test(value)) return false;
  return true;
}

function report(label, counts, filter = () => true) {
  if (!counts) {
    console.log(`${label}: skipped (${label === "UI" ? uiFile : serverFile} not found)`);
    return null;
  }
  const entries = Object.entries(counts).filter(([text]) => filter(text));
  const weightedTotal = entries.reduce((sum, [, count]) => sum + count, 0);
  let covered = 0;
  let coveredWeighted = 0;
  const missing = [];
  for (const [text, count] of entries) {
    if (translate(text) !== undefined) {
      covered += 1;
      coveredWeighted += count;
    } else if (!missing.some((entry) => entry.text === text)) {
      missing.push({ text, count });
    }
  }
  missing.sort((a, b) => b.count - a.count);
  const distinct = entries.length === 0 ? 0 : (covered / entries.length) * 100;
  const weighted = weightedTotal === 0 ? 0 : (coveredWeighted / weightedTotal) * 100;
  console.log(
    `${label}: ${covered}/${entries.length} distinct (${distinct.toFixed(1)}%), ` +
      `${coveredWeighted}/${weightedTotal} occurrences (${weighted.toFixed(1)}%)`,
  );
  console.log(`  top uncovered:`);
  for (const entry of missing.slice(0, 15)) console.log(`   ${entry.count}× ${JSON.stringify(entry.text)}`);
  return { distinct, weighted, covered, total: entries.length };
}

console.log(`dictionary: ${dictionary.size} exact entries, ${templates.length} templates`);
const ui = report("UI (all)", readCounts(uiFile));
const uiCopy = report("UI (copy-like)", readCounts(uiFile), looksLikeCopy);
const server = report("Server (all)", readCounts(serverFile));
const serverCopy = report("Server (sentence-like)", readCounts(serverFile), looksLikeCopy);

if (uiCopy && serverCopy) {
  const overall = (uiCopy.weighted + serverCopy.weighted) / 2;
  console.log(`overall weighted average (copy-like): ${overall.toFixed(1)}%`);
}

rmSync(bundleFile, { force: true });
