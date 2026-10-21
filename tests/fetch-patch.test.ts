import { beforeEach, describe, expect, it, vi } from "vitest";
import { translateJson } from "../src/page/fetch-patch";

describe("translateJson (response whitelist translation)", () => {
  beforeEach(() => {
    // The MAIN-world module reads the localStorage mirror written by the
    // content script; tests run with defaults (enabled, auto). Force zh.
    window.localStorage.setItem(
      "paperclip-zh-pack.settings",
      JSON.stringify({ enabled: true, override: "zh-CN" }),
    );
  });

  it("translates whitelist fields that exactly match the dictionary", () => {
    const body = {
      error: "Project authentication settings conflict with the selected AI connection",
      details: [{ message: "Manage connections permission is required" }],
    };
    const out = translateJson(body) as typeof body;
    expect(out.error).toBe("所选 AI 连接与项目认证设置冲突");
    expect(out.details[0].message).toBe("需要连接管理权限");
  });

  it("leaves misses, data fields, and ids untouched", () => {
    const body = {
      error: "some untranslated error",
      id: "Dashboard",
      name: "Dashboard",
      status: "connected",
      model: "MiniMax-M3.1-Flash",
    };
    const out = translateJson(body) as Record<string, string>;
    expect(out).toEqual(body);
  });

  it("walks nested arrays and objects with a depth cap", () => {
    const deep = { message: { message: "Manage connections permission is required" } };
    const out = translateJson(deep) as typeof deep;
    expect(out.message.message).toBe("需要连接管理权限");
  });

  it("uses templates for dynamic error text but not for user content", () => {
    const body = {
      error: "Attachment is larger than the 10MB limit",
      title: "Showing up to 50",
    };
    const out = translateJson(body) as typeof body;
    expect(out.error).toBe("附件超过 10MB 限制");
    expect(out.title).toBe("Showing up to 50");
  });

  it("translates a string array under errors", () => {
    const body = { errors: ["Access denied", "Board access required"] };
    const out = translateJson(body) as typeof body;
    expect(out.errors).toEqual(["访问被拒绝", "需要看板访问权限"]);
  });

  it("passes through non-strings and keeps the same object when nothing changed", () => {
    const body = { count: 3, items: ["a", "b"], flag: true };
    expect(translateJson(body)).toBe(body);
  });

  it("reads the settings mirror once per payload, not once per node", () => {
    const payload = {
      items: Array.from({ length: 500 }, (_, index) => ({
        id: index,
        message: "ok",
        nested: { index, label: "item" },
      })),
    };
    const spy = vi.spyOn(Storage.prototype, "getItem");
    translateJson(payload);
    const reads = spy.mock.calls.filter(([key]) => key === "paperclip-zh-pack.settings").length;
    spy.mockRestore();
    expect(reads).toBeLessThanOrEqual(1);
  });

  it("keeps untouched subtrees and their identity after a partial hit", () => {
    const untouched = { id: "x", items: [1, 2, 3] };
    const body = { error: "Access denied", untouched };
    const out = translateJson(body) as typeof body;
    expect(out.error).toBe("访问被拒绝");
    expect(out.untouched).toBe(untouched);
  });

  it("does nothing while disabled", () => {
    window.localStorage.setItem(
      "paperclip-zh-pack.settings",
      JSON.stringify({ enabled: false, override: "zh-CN" }),
    );
    const body = { error: "Project authentication settings conflict with the selected AI connection" };
    expect(translateJson(body)).toBe(body);
  });
});
