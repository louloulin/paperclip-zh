import { describe, expect, it } from "vitest";
import { resolveLocale } from "../src/content/negotiation";

describe("resolveLocale", () => {
  it("override wins over everything", () => {
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(resolveLocale("en", ["zh-CN", "en"])).toBe("en");
  });

  it("auto follows navigator languages, normalizing any zh tag to zh-CN", () => {
    expect(resolveLocale("auto", ["zh-TW", "en"])).toBe("zh-CN");
    expect(resolveLocale("auto", ["zh-Hans-CN"])).toBe("zh-CN");
    expect(resolveLocale("auto", ["en-US", "en"])).toBe("en");
    expect(resolveLocale("auto", ["fr", "de"])).toBe("en");
  });

  it("defaults to en when nothing matches", () => {
    expect(resolveLocale("auto", [])).toBe("en");
  });
});
