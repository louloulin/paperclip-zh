import { beforeEach, describe, expect, it } from "vitest";
import { restoreAttributes, translateAttributes } from "../src/content/attributes";

describe("translateAttributes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("replaces whitelisted attribute hits", () => {
    document.body.innerHTML = "<input placeholder=\"Search for a command to run...\" aria-label=\"Open account menu\" />";
    const changed = translateAttributes(document.body);
    expect(changed).toBe(2);
    const input = document.body.querySelector("input")!;
    expect(input.getAttribute("placeholder")).toBe("搜索要运行的命令…");
    expect(input.getAttribute("aria-label")).toBe("打开账户菜单");
  });

  it("ignores non-whitelisted attributes", () => {
    document.body.innerHTML = "<div data-kind=\"Settings\" id=\"Settings\" class=\"Dashboard\"></div>";
    const changed = translateAttributes(document.body);
    expect(changed).toBe(0);
  });

  it("restores originals", () => {
    document.body.innerHTML = "<input placeholder=\"Search for a command to run...\" />";
    translateAttributes(document.body);
    restoreAttributes(document);
    expect(document.body.querySelector("input")!.getAttribute("placeholder")).toBe("Search for a command to run...");
  });

  it("is idempotent", () => {
    document.body.innerHTML = "<input placeholder=\"Search for a command to run...\" />";
    translateAttributes(document.body);
    translateAttributes(document.body);
    expect(document.body.querySelector("input")!.getAttribute("placeholder")).toBe("搜索要运行的命令…");
  });
});
