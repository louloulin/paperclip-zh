import { translate } from "../shared/dictionary";

/** Attributes that carry user-facing copy when set as string literals. */
export const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

const ATTR_SELECTOR = TRANSLATABLE_ATTRS.map((attr) => `[${attr}]`).join(",");

const originals = new WeakMap<Element, Map<string, string>>();

/**
 * Translate whitelisted attributes under `root`. Non-literal runtime values
 * (icon names, test ids) are untouched unless they exactly match a dictionary
 * entry — same contract as text nodes.
 */
export function translateAttributes(root: Element | Document | DocumentFragment): number {
  const scope = root instanceof Document ? root.documentElement : root;
  if (!scope || typeof (scope as ParentNode).querySelectorAll !== "function") return 0;
  const targets =
    scope instanceof Element && scope.matches(ATTR_SELECTOR)
      ? [scope, ...Array.from(scope.querySelectorAll(ATTR_SELECTOR))]
      : Array.from(scope.querySelectorAll(ATTR_SELECTOR));
  let changed = 0;
  for (const el of targets) {
    for (const attr of TRANSLATABLE_ATTRS) {
      const value = el.getAttribute(attr);
      if (value === null || !isCandidate(value)) continue;
      const zh = translate(value);
      if (zh === undefined) continue;
      let saved = originals.get(el);
      if (!saved) {
        saved = new Map();
        originals.set(el, saved);
      }
      if (!saved.has(attr)) saved.set(attr, value);
      if (el.getAttribute(attr) !== zh) {
        el.setAttribute(attr, zh);
        changed += 1;
      }
    }
  }
  return changed;
}

/** Restore translated attributes under `root` to their original values. */
export function restoreAttributes(root: Element | Document | DocumentFragment): number {
  const scope = root instanceof Document ? root.documentElement : root;
  if (!scope || typeof (scope as ParentNode).querySelectorAll !== "function") return 0;
  const targets =
    scope instanceof Element && originals.has(scope)
      ? [scope, ...Array.from(scope.querySelectorAll("*"))]
      : Array.from(scope.querySelectorAll("*"));
  let restored = 0;
  for (const el of targets) {
    const saved = originals.get(el);
    if (!saved) continue;
    for (const [attr, value] of saved) {
      if (el.getAttribute(attr) !== value) {
        el.setAttribute(attr, value);
        restored += 1;
      }
    }
  }
  return restored;
}

function isCandidate(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 300 && /[A-Za-z]/.test(trimmed);
}
