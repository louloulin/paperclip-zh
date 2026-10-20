import { describe, expect, it } from "vitest";
import { lookupTemplate, templates, translate } from "../src/shared/dictionary";

describe("dictionary templates", () => {
  it("builds one pattern per placeholder key", () => {
    expect(templates.length).toBeGreaterThan(0);
    for (const entry of templates) {
      expect(entry.pattern.source.startsWith("^")).toBe(true);
      expect(entry.pattern.source.endsWith("$")).toBe(true);
    }
  });

  it("matches dynamic text and re-inserts the captured value", () => {
    expect(lookupTemplate("Showing up to 50")).toBe("最多显示 50 条");
    expect(lookupTemplate("Finished 7m ago")).toBe("7m 前完成");
  });

  it("handles several placeholders in one string", () => {
    expect(lookupTemplate("2 running, 0 paused, 1 errors")).toBe("2 个运行中，0 个暂停，1 个错误");
  });

  it("does not match a longer sentence or an unrelated string", () => {
    expect(lookupTemplate("Showing up to 50 of the tasks in the list")).toBeUndefined();
    expect(lookupTemplate("Something else entirely")).toBeUndefined();
  });

  it("prefers an exact entry over a template", () => {
    expect(translate("Dashboard")).toBe("仪表盘");
    expect(translate("Showing up to 12")).toBe("最多显示 12 条");
    expect(translate("no such string")).toBeUndefined();
  });
});
