/** Shared, side-effect-free helpers for the inject proxy. */
export const STATIC_PREFIX = "/__paperclip_zh_pack/";

export function injectScripts(html) {
  if (html.includes(`${STATIC_PREFIX}content-script.js`)) return html;
  const tags =
    `<script src="${STATIC_PREFIX}page-patch.js"></script>` +
    `<script src="${STATIC_PREFIX}content-script.js"></script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${tags}</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${tags}</body>`);
  return html + tags;
}

export function rewriteLocation(value, target, proxyOrigin) {
  if (!value.startsWith(target.origin)) return value;
  return proxyOrigin + value.slice(target.origin.length);
}
