import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";

const prod = !process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });

/** @type {import("node:esbuild").BuildOptions} */
const shared = {
  bundle: true,
  minify: prod,
  format: "iife",
  target: ["chrome120"],
  sourcemap: prod ? false : "inline",
  logLevel: "info",
};

const entries = [
  { in: "src/content/main.ts", out: "dist/content-script.js" },
  { in: "src/page/fetch-patch.ts", out: "dist/page-patch.js" },
  { in: "src/background.ts", out: "dist/background.js" },
  { in: "src/popup/popup.ts", out: "dist/popup.js" },
];

await Promise.all(
  entries.map((entry) => build({ ...shared, entryPoints: [entry.in], outfile: entry.out })),
);

copyFileSync("src/popup/popup.html", "popup.html");
console.log("build done");
