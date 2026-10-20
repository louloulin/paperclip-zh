import { describe, expect, it } from "vitest";
import type { PackSettings } from "../src/content/state";
import {
  appendLanguageDirective,
  languageDirective,
  resolveReplyLocale,
  withLanguageDirective,
} from "../src/page/fetch-patch";

const base: PackSettings = { enabled: true, override: "auto", agentLanguage: "auto" };

describe("resolveReplyLocale", () => {
  it("follows the UI locale in auto mode", () => {
    expect(resolveReplyLocale(base, ["zh-CN"])).toBe("zh-CN");
    expect(resolveReplyLocale(base, ["zh-Hans", "en"])).toBe("zh-CN");
    expect(resolveReplyLocale(base, ["en-US"])).toBe("en");
    expect(resolveReplyLocale({ ...base, override: "zh-CN" }, ["en-US"])).toBe("zh-CN");
    expect(resolveReplyLocale({ ...base, override: "en" }, ["zh-CN"])).toBe("en");
  });

  it("honours an explicit conversation language", () => {
    expect(resolveReplyLocale({ ...base, agentLanguage: "zh-CN" }, ["en-US"])).toBe("zh-CN");
    expect(resolveReplyLocale({ ...base, agentLanguage: "en" }, ["zh-CN"])).toBe("en");
    expect(resolveReplyLocale({ ...base, agentLanguage: "off" }, ["zh-CN"])).toBeNull();
  });
});

describe("language directives", () => {
  it("embeds a hidden, self-describing instruction", () => {
    expect(languageDirective("zh-CN")).toContain("paperclip-zh-pack:lang=zh-CN");
    expect(languageDirective("zh-CN")).toContain("Simplified Chinese");
    expect(languageDirective("en")).toContain("Reply in English");
    expect(languageDirective(null)).toBeNull();
  });

  it("appends once and replaces an older directive", () => {
    const zh = languageDirective("zh-CN")!;
    const en = languageDirective("en")!;
    const once = appendLanguageDirective("请检查构建", zh);
    expect(once).toBe(`请检查构建\n\n${zh}`);
    const twice = appendLanguageDirective(once, zh);
    expect(twice.match(/paperclip-zh-pack:lang=/g)).toHaveLength(1);
    const switched = appendLanguageDirective(twice, en);
    expect(switched).toBe(`请检查构建\n\n${en}`);
  });
});

describe("withLanguageDirective", () => {
  it("rewrites only issue comment POSTs and preserves other fields", () => {
    const directive = languageDirective("zh-CN")!;
    const init = {
      method: "POST",
      body: JSON.stringify({ body: "请检查构建", reopen: true, clientRequestId: "abc" }),
    };
    const next = withLanguageDirective("/api/issues/LIN-5/comments", init, directive)!;
    const parsed = JSON.parse(next.body as string);
    expect(parsed.body).toBe(`请检查构建\n\n${directive}`);
    expect(parsed.reopen).toBe(true);
    expect(parsed.clientRequestId).toBe("abc");
  });

  it("leaves other methods, paths, and bodies untouched", () => {
    const directive = languageDirective("zh-CN")!;
    const init = { method: "GET" };
    expect(withLanguageDirective("/api/issues/LIN-5/comments", init, directive)).toBe(init);
    const post = { method: "POST", body: JSON.stringify({ body: "hi" }) };
    expect(withLanguageDirective("/api/issues/LIN-5/title", post, directive)).toBe(post);
    const form = { method: "POST", body: new FormData() };
    expect(withLanguageDirective("/api/issues/LIN-5/comments", form, directive)).toBe(form);
    expect(withLanguageDirective("/api/issues/LIN-5/comments", post, null)).toBe(post);
  });

  it("skips empty comment bodies", () => {
    const directive = languageDirective("zh-CN")!;
    const init = { method: "POST", body: JSON.stringify({ body: "   " }) };
    expect(withLanguageDirective("/api/issues/LIN-5/comments", init, directive)).toBe(init);
  });
});
