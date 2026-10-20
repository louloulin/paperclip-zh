import { describe, expect, it } from "vitest";
import { injectScripts, rewriteLocation } from "../bin/proxy-utils.mjs";

describe("injectScripts", () => {
  it("injects both bundles before </head>", () => {
    const html = "<html><head><title>x</title></head><body>app</body></html>";
    const out = injectScripts(html);
    expect(out).toContain("/__paperclip_zh_pack/page-patch.js");
    expect(out).toContain("/__paperclip_zh_pack/content-script.js");
    expect(out.indexOf("page-patch.js")).toBeLessThan(out.indexOf("</head>"));
  });

  it("falls back to </body> and avoids double injection", () => {
    const out = injectScripts("<html><body>app</body></html>");
    expect(out.indexOf("content-script.js")).toBeLessThan(out.indexOf("</body>"));
    expect(injectScripts(out)).toBe(out);
  });
});

describe("rewriteLocation", () => {
  const target = new URL("http://localhost:3121");

  it("rewrites only the upstream origin", () => {
    expect(rewriteLocation("http://localhost:3121/dashboard", target, "http://127.0.0.1:3122")).toBe(
      "http://127.0.0.1:3122/dashboard",
    );
    expect(rewriteLocation("/dashboard", target, "http://127.0.0.1:3122")).toBe("/dashboard");
    expect(rewriteLocation("https://example.com/", target, "http://127.0.0.1:3122")).toBe(
      "https://example.com/",
    );
  });
});
