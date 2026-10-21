# paperclip-zh-pack

Paperclip 的**独立中文语言包**：一个浏览器扩展（MV3），以词典精确替换的方式汉化 Paperclip 界面与接口报错文案。**不修改 Paperclip 仓库的任何代码** —— 完全非侵入。

设计参考 [codex-host](/Users/louloulin/appx/codex-host) 的 renderer-extension：向不属于自己渲染进程注入 JS 包做汉化；其本地化内核（冻结的英文 key 词典、未命中回退原文、locale 协商链 override → 系统 → navigator、`zh*` → zh-CN 归一）在此移植。Web 场景下，标准注入形态即浏览器扩展。

## 安装（本地开发实例）

1. `npm install && npm run build`
2. Chrome/Edge 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择本目录。
3. 打开 `http://localhost:3121`，刷新页面。

### 匹配域名

`manifest.json` 的 `content_scripts.matches` 默认覆盖 `http://localhost/*` 与 `http://127.0.0.1/*`（Chrome 匹配模式不限制端口）。部署到其他域名时把对应 origin 加进两个 content_scripts 条目与 `host_permissions`。

## 通过 npm 安装

```sh
# 在本仓库、私有 registry 或 tarball 上
npm install -g paperclip-zh-pack

paperclip-zh-pack install            # 准备可加载的扩展目录
paperclip-zh-pack install --dir ./ext

# 或者完全不使用浏览器扩展：
paperclip-zh-pack serve              # http://127.0.0.1:3122 → 上游 :3121
paperclip-zh-pack serve --target http://localhost:3121 --port 3122
```

- `install`：把 `manifest.json`、`popup.html`、`dist/` 复制到 `~/.paperclip-zh-pack/extension`，并打印最后一步。**浏览器安全策略不允许 npm/CLI 自动注册扩展**，所以「加载已解压的扩展程序」必须手动点一次。
- `serve`：真正的一键 npm 模式。本地反向代理把同一份 `page-patch.js` 与 `content-script.js` 注入 Paperclip 的 HTML，无需扩展；WebSocket/HMR 会原样转发。打开代理地址即可。
- 代理模式下没有 `chrome.*`，设置保存在同源 `localStorage`；配置页为 `http://127.0.0.1:3122/__paperclip_zh_pack/popup.html`。
- 未发布到公共 npm registry；可用 `npm pack` 生成 tarball，或发布到私有 registry。`prepublishOnly` 会先构建 `dist/`。

## 架构

| 部分 | 文件 | 职责 |
| --- | --- | --- |
| DOM 汉化 | `src/content/` | 首屏 + MutationObserver 增量替换 Text 节点与白名单属性（`placeholder/title/aria-label/alt`）；跳过 `code/pre/kbd/input/contenteditable` 等；同一句被 JSX 拆成多个 Text 节点时按元素合并匹配；原文存 WeakMap，关闭即恢复 |
| 接口消息 | `src/page/fetch-patch.ts` | MAIN world 包装 `fetch`，对 JSON 响应做翻译：错误字段（`error/message/detail/hint/error_description` + `errors[]`）支持模板，用户内容字段（`title/description/summary`）仅精确匹配 |
| 语言协商 | `src/content/negotiation.ts` | override(auto/en/zh-CN) → navigator → en；`Intl.Locale` 归一 `zh*` → zh-CN（同 codex-host） |
| 词典 | `dict/zh-CN.json` | 扁平 `{ "Exact English": "中文" }`；含 `{placeholder}` 的 key 作为模板（非贪婪捕获 + 值合理性校验）；未命中回退原文 |
| 开关/选择 | `src/popup/` + `src/background.ts` | chrome.storage.sync 存储（界面语言 + 对话语言）；content script 镜像到 localStorage 供 MAIN world 读取 |
| 对话语言 | `src/page/fetch-patch.ts` | 按配置给 `POST /api/issues/:id/comments` 追加隐藏 HTML 注释指令；Paperclip 渲染器会丢弃 HTML 注释，用户在界面上看不到，但智能体读取原文时能看到 |
| 词条抽取 | `scripts/extract-strings.mjs` | 只读扫描前端 TSX，输出候选词条+频次 |
| 服务端词条 | `scripts/extract-server-strings.mjs` | 只读扫描 `server/src` 与 `packages/shared/src` 的 JSON 错误字段，含模板字面量转 `{name}` |
| 覆盖率 | `scripts/coverage.mjs` | 用与运行时相同的词典匹配逻辑统计前端/服务端候选覆盖率 |

词典「精确匹配 + 未命中回退」意味着：最坏情况只是显示英文，不会破坏功能；不会被翻译的数据字段（id、枚举、用户内容）一律原样。

## 词典维护

```sh
npm run extract           # 生成 candidates.json（默认扫 ../paperclip）
npm run extract:server    # 生成 server-candidates.json
npm run coverage          # 统计前端/服务端候选覆盖率与未覆盖高频词条
```

从候选文件按频次挑选词条人工翻译后并入 `dict/zh-CN.json`。模板写法：key 里的 `{count}`、`{time}` 等占位符会被捕获并回填，例如 `"Showing up to {count}"`。约束（CI 测试强制）：中文值不得含 `<script`、`javascript:`、事件属性、URL；键经空白折叠后唯一。

当前覆盖率（npm run coverage，按出现频次加权）：

- 前端高频词条（出现 ≥3 次）：94% 词条 / 93% 出现次数
- 服务端报错（出现 ≥2 次）：100% 词条 / 100% 出现次数
- 长尾（仅出现 1 次）：前端 4.5%、服务端 18.9%（多为一次性功能页与内部提示）

已知限制：XHR（非 fetch）请求不在补丁范围；服务端持久化数据保持英文原样、仅在展示层翻译；第三方目录内容（技能描述、应用市场介绍）与用户生成内容不译；大于 512 KB 的 JSON 响应原样放行，不缓冲、不重写，避免大负载阻塞主线程。

## 对话语言（智能体按配置语言回复）

扩展弹窗的「对话语言」有四个选项：

| 选项 | 行为 |
| --- | --- |
| 跟随界面 | 界面解析为中文时追加中文指令，否则追加英文指令（默认） |
| 简体中文 | 始终要求智能体用简体中文回复 |
| English | 始终要求智能体用英文回复 |
| 不干预 | 不修改任何请求 |

实现方式：向 `POST /api/issues/:id/comments` 的 `body` 末尾追加一条 HTML 注释，例如：

```html
<!-- paperclip-zh-pack:lang=zh-CN Reply in Simplified Chinese (简体中文).
     Keep code, commands, file paths, identifiers, and quoted logs unchanged. -->
```

Paperclip 的 `MarkdownBody` 用 `remarkDropHtmlComments` 丢弃 HTML 注释，因此线程里不会显示这段文字；智能体读取原始评论时可以看到并遵循它。指令只约束自然语言，代码、命令、路径、标识符和引用日志保持原样。重复发送会自动替换旧指令，不会累积。

**定时/例行任务**没有用户评论，因此不会被该机制影响。若要让所有运行都遵循同一语言，把下面这句加入智能体的全局指令（AGENTS.md 或智能体 Instructions）：

```text
Always respond in Simplified Chinese (简体中文). Keep code, commands, file paths,
identifiers, and quoted logs unchanged.
```

英文版：

```text
Always respond in English. Keep code, commands, file paths, identifiers, and quoted logs unchanged.
```

## 开发

```sh
npm test        # vitest（jsdom）
npm run build   # esbuild → dist/
npm run watch
```

装载后改代码：`npm run watch` + 扩展页刷新 + 页面刷新。

## 验收基线

- `Paperclip` 仓库 `git status` 保持零改动。
- 扩展开启：界面中文、接口报错中文、代码块与输入不受影响；关闭：整页恢复英文。
