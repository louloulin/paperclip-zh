import { describe, expect, it } from "vitest";
import { parseSettings } from "../src/content/state";

describe("parseSettings", () => {
  it("defaults sensibly", () => {
    expect(parseSettings(undefined)).toEqual({ enabled: true, override: "auto" });
    expect(parseSettings({})).toEqual({ enabled: true, override: "auto" });
  });

  it("rejects junk instead of trusting storage", () => {
    expect(parseSettings({ enabled: "yes", override: "fr" })).toEqual({ enabled: true, override: "auto" });
    expect(parseSettings({ enabled: false, override: "zh-CN" })).toEqual({ enabled: false, override: "zh-CN" });
    expect(parseSettings("junk")).toEqual({ enabled: true, override: "auto" });
  });
});
