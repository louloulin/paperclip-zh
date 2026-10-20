import { beforeEach, describe, expect, it } from "vitest";
import { restoreTree, translateTree } from "../src/content/dom";

describe("translateTree", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("replaces exact dictionary hits and preserves surrounding whitespace", () => {
    document.body.innerHTML = "<nav>  Dashboard  </nav>";
    const changed = translateTree(document.body);
    expect(changed).toBe(1);
    expect(document.body.textContent).toBe("  仪表盘  ");
  });

  it("matches across collapsed newlines from JSX formatting", () => {
    document.body.innerHTML = "<button>\n  New Task\n</button>";
    translateTree(document.body);
    expect(document.body.textContent).toBe("\n  新建任务\n");
  });

  it("leaves misses untouched", () => {
    document.body.innerHTML = "<span>Some Untranslated Copy</span>";
    const changed = translateTree(document.body);
    expect(changed).toBe(0);
    expect(document.body.textContent).toBe("Some Untranslated Copy");
  });

  it("skips code, pre, inputs and editable regions", () => {
    document.body.innerHTML = [
      "<code>Dashboard</code>",
      "<pre>Dashboard</pre>",
      "<input placeholder=\"Dashboard\" />",
      "<div contenteditable=\"true\">Dashboard</div>",
    ].join("");
    const changed = translateTree(document.body);
    expect(changed).toBe(0);
    expect(document.body.textContent).toBe("DashboardDashboardDashboard");
  });

  it("keeps the original so restore undoes the translation", () => {
    document.body.innerHTML = "<h1>Connect a model</h1>";
    translateTree(document.body);
    expect(document.body.textContent).toBe("连接模型");
    restoreTree(document.body);
    expect(document.body.textContent).toBe("Connect a model");
  });

  it("is idempotent: a second pass does not double-translate", () => {
    document.body.innerHTML = "<h1>Connect a model</h1>";
    translateTree(document.body);
    translateTree(document.body);
    expect(document.body.textContent).toBe("连接模型");
  });

  it("translates a sentence split across adjacent text nodes", () => {
    const span = document.createElement("span");
    for (const part of ["0", " running, ", "0", " paused, ", "0", " errors"]) {
      span.append(document.createTextNode(part));
    }
    document.body.append(span);
    translateTree(document.body);
    expect(span.textContent).toBe("0 个运行中，0 个暂停，0 个错误");
    restoreTree(document.body);
    expect(span.textContent).toBe("0 running, 0 paused, 0 errors");
  });

  it("re-translates after React rewrites one split node", () => {
    const span = document.createElement("span");
    for (const part of ["0", " running, ", "0", " paused, ", "0", " errors"]) {
      span.append(document.createTextNode(part));
    }
    document.body.append(span);
    translateTree(document.body);
    span.childNodes[0].nodeValue = "1";
    translateTree(span);
    expect(span.textContent).toBe("1 个运行中，0 个暂停，0 个错误");
  });

  it("translates incrementally for SPA-added nodes", () => {
    document.body.innerHTML = "<main></main>";
    translateTree(document.body);
    const section = document.createElement("section");
    section.textContent = "Dashboard";
    document.body.querySelector("main")!.append(section);
    const changed = translateTree(section);
    expect(changed).toBe(1);
    expect(section.textContent).toBe("仪表盘");
  });
});
