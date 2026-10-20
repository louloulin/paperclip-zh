import { translate } from "../shared/dictionary";
import { insideSkippedElement, isCandidateText } from "./skip";

/**
 * Original text per translated node, so disabling the pack restores the page
 * without a reload. WeakMap: removed nodes are garbage-collected with their
 * history.
 */
const originals = new WeakMap<Text, string>();

/**
 * What we last wrote into a node. If the node's data still equals this, the
 * value belongs to us and `originals` holds the English; otherwise React
 * replaced the value and the new data is the source of truth.
 */
const written = new WeakMap<Text, string>();

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
  changed += translateTextGroups(root);
  return changed;
}

/**
 * JSX often splits one sentence into several adjacent text nodes
 * (`{"0"} {" running, "} {"0"} …`), so no single node matches. When an
 * element's children are all text, translate the concatenation and keep the
 * original per-node pieces for restoration. React later rewriting one child
 * is detected through `written`, which drops our value in favour of the new
 * one before the group is translated again.
 */
function translateTextGroups(root: Node): number {
  const doc = root.ownerDocument ?? (root as Document);
  const elements: Element[] = [];
  if (root.nodeType === 1) elements.push(root as Element);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => (insideSkippedElement(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (walker.nextNode()) elements.push(walker.currentNode as Element);

  let changed = 0;
  for (const element of elements) {
    if (element.childNodes.length < 2) continue;
    const nodes: Text[] = [];
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType !== 3) break;
      nodes.push(child as Text);
    }
    if (nodes.length !== element.childNodes.length || nodes.length < 2) continue;

    const pieces = nodes.map(effectiveText);
    const combined = pieces.join("");
    const zh = translate(combined);
    if (zh === undefined) continue;

    const leading = combined.match(/^\s*/)?.[0] ?? "";
    const trailing = combined.match(/\s*$/)?.[0] ?? "";
    const next = `${leading}${zh}${trailing}`;
    const already =
      nodes[0].data === next && nodes.slice(1).every((node) => node.data === "");
    if (already) continue;

    nodes.forEach((node, index) => {
      originals.set(node, pieces[index]);
      const value = index === 0 ? next : "";
      node.data = value;
      written.set(node, value);
    });
    changed += 1;
  }
  return changed;
}

function effectiveText(node: Text): string {
  if (written.get(node) === node.data) return originals.get(node) ?? node.data;
  return node.data;
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
    written.set(node, next);
    return true;
  }
  written.set(node, next);
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
