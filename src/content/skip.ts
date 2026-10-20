/** Elements whose subtree must stay verbatim: code samples, scripts, editable fields. */
export const SKIP_SELECTOR = [
  "code",
  "pre",
  "kbd",
  "samp",
  "script",
  "style",
  "noscript",
  "textarea",
  "input",
  "select",
  "[contenteditable='true']",
  "[contenteditable='']",
].join(",");

/** Inside these elements the text is data, not UI copy. */
export function insideSkippedElement(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  return parent.closest(SKIP_SELECTOR) !== null;
}

/**
 * Human-text heuristic. The dictionary lookup is the real gate — this only
 * rejects what can never be UI copy, so we do not pay a Map probe for noise:
 * empty, digit/punctuation-only, URLs, emails, and i18n placeholders.
 */
export function isCandidateText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 500) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/^(https?:\/\/|www\.)/i.test(trimmed)) return false;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(trimmed)) return false;
  if (/{{|}}/.test(trimmed)) return false;
  return true;
}
