# paperclip-zh-pack

Paperclip 的**独立中文语言包**：一个浏览器扩展（MV3），以词典精确替换的方式汉化 Paperclip 界面与接口报错文案。**不修改 Paperclip 仓库的任何代码** —— 完全非侵入。

设计参考 [codex-host](/Users/louloulin/appx/codex-host) 的 renderer-extension：向不属于自己渲染进程注入 JS 包做汉化；其本地化内核（冻结的英文 key 词典、未命中回退原文、locale 协商链 override → 系统 → navigator、`zh*` → zh-CN 归一）在此移植。Web 场景下，标准注入形态即浏览器扩展。

## 安装（本地开发实例）

1. `npm install && npm run build`
2. Chrome/Edge 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择本目录。
3. 打开 `http://localhost:3121`，刷新页面。

### 匹配域名

`manifest.json` 的 `content_scripts.matches` 默认只含 `http://localhost:3121/*`。部署到其他域名时把对应 origin 加进两个 content_scripts 条目与 `host_permissions`。

## 架构

| 部分 | 文件 | 职责 |
| --- | --- | --- |
| DOM 汉化 | `src/content/` | 首屏 + MutationObserver 增量替换 Text 节点与白名单属性（`placeholder/title/aria-label/alt`）；跳过 `code/pre/kbd/input/contenteditable` 等；同一句被 JSX 拆成多个 Text 节点时按元素合并匹配；原文存 WeakMap，关闭即恢复 |
| 接口消息 | `src/page/fetch-patch.ts` | MAIN world 包装 `fetch`，对 JSON 响应做翻译：错误字段（`error/message/detail/hint/error_description` + `errors[]`）支持模板，用户内容字段（`title/description/summary`）仅精确匹配 |
| 语言协商 | `src/content/negotiation.ts` | override(auto/en/zh-CN) → navigator → en；`Intl.Locale` 归一 `zh*` → zh-CN（同 codex-host） |
| 词典 | `dict/zh-CN.json` | 扁平 `{ "Exact English": "中文" }`；含 `{placeholder}` 的 key 作为模板（非贪婪捕获 + 值合理性校验）；未命中回退原文 |
| 开关/选择 | `src/popup/` + `src/background.ts` | chrome.storage.sync 存储；content script 镜像到 localStorage 供 MAIN world 读取 |
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

已知限制：XHR（非 fetch）请求不在补丁范围；服务端持久化数据保持英文原样、仅在展示层翻译；第三方目录内容（技能描述、应用市场介绍）与用户生成内容不译。

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
