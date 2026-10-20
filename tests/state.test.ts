import { describe, expect, it } from "vitest";
import { parseSettings } from "../src/content/state";

const defaults = { enabled: true, override: "auto", agentLanguage: "auto" };

describe("parseSettings", () => {
  it("defaults sensibly", () => {
    expect(parseSettings(undefined)).toEqual(defaults);
    expect(parseSettings({})).toEqual(defaults);
  });

  it("rejects junk instead of trusting storage", () => {
    expect(parseSettings({ enabled: "yes", override: "fr" })).toEqual(defaults);
    expect(parseSettings({ enabled: false, override: "zh-CN" })).toEqual({
      enabled: false,
      override: "zh-CN",
      agentLanguage: "auto",
    });
    expect(parseSettings("junk")).toEqual(defaults);
  });

  it("keeps a valid agent language and rejects others", () => {
    expect(parseSettings({ agentLanguage: "zh-CN" }).agentLanguage).toBe("zh-CN");
    expect(parseSettings({ agentLanguage: "en" }).agentLanguage).toBe("en");
    expect(parseSettings({ agentLanguage: "off" }).agentLanguage).toBe("off");
    expect(parseSettings({ agentLanguage: "fr" }).agentLanguage).toBe("auto");
  });
});
