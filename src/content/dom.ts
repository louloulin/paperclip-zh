import { translate } from "../shared/dictionary";
import { insideSkippedElement, isCandidateText } from "./skip";

/**
 * Original text per translated node, so disabling the pack restores the page
 * without a reload. WeakMap: removed nodes are garbage-collected with their
 * history.
 */
const originals = new WeakMap<Text, string>();

function acceptNode(node: Text): number {
  if (insideSkippedElement(node)) return NodeFilter.FILTER_REJECT;
  if (!isCandidateText(node.data)) return NodeFilter.FILTER_REJECT;
  return NodeFilter.FILTER_ACCEPT;
}

/**
 * Translate the text nodes under `root` (element or document). Returns the
 * number of nodes whose text changed. Nodes whose text is not in the
 * dictionary are remembered but left untouched, so a later dictionary growth
 * picks them up on the next pass.
 */
export function translateTree(root: Node): number {
  if (!root.ownerDocument && !(root instanceof Document)) return 0;
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });
  let changed = 0;
  const pending: Text[] = [];
  while (walker.nextNode()) pending.push(walker.currentNode as Text);
  for (const node of pending) {
    if (applyToTextNode(node)) changed += 1;
  }
  return changed;
}

/** Translate one text node. Returns true when the node's data changed. */
export function applyToTextNode(node: Text): boolean {
  if (insideSkippedElement(node) || !isCandidateText(node.data)) return false;
  const original = originals.get(node) ?? node.data;
  const zh = translate(original);
  if (zh === undefined) {
    originals.set(node, original);
    return false;
  }
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  const next = `${leading}${zh}${trailing}`;
  originals.set(node, original);
  if (node.data !== next) {
    node.data = next;
    return true;
  }
  return false;
}

/** Restore every translated node under `root` to its original English text. */
export function restoreTree(root: Node): number {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (originals.has(node as Text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  let restored = 0;
  const pending: Text[] = [];
  while (walker.nextNode()) pending.push(walker.currentNode as Text);
  for (const node of pending) {
    const original = originals.get(node as Text);
    if (original !== undefined && node.data !== original) {
      (node as Text).data = original;
      restored += 1;
    }
  }
  return restored;
}
