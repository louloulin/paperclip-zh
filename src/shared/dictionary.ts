import raw from "../../dict/zh-CN.json";

/** Version of the shipped dictionary, surfaced in the popup. */
export const DICT_VERSION = "0.1.0";

/**
 * Collapse every whitespace run to a single space and trim. JSX renders
 * multi-line text with collapsed whitespace, so lookups and DOM text must go
 * through the same normalizer to meet.
 */
export function normalizeKey(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** English → Chinese. English text is the key; a miss returns the original. */
export const dictionary: ReadonlyMap<string, string> = new Map(
  Object.entries(raw)
    .filter(([, value]) => typeof value === "string" && value.trim() !== "")
    .map(([key, value]) => [normalizeKey(key), value as string]),
);

/**
 * Keys with `{placeholder}` become patterns: "Showing up to {count}" matches
 * "Showing up to 50" and the captured value is re-inserted into the Chinese
 * template. Anchored at both ends, so a pattern never matches a longer
 * sentence.
 */
export interface DictionaryTemplate {
  pattern: RegExp;
  names: string[];
  template: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const templates: readonly DictionaryTemplate[] = Object.entries(raw)
  .filter(([key, value]) => typeof value === "string" && value.trim() !== "" && /\{[A-Za-z0-9_.-]+\}/.test(key))
  .map(([key, value]) => {
    const names: string[] = [];
    const source = normalizeKey(key)
      .split(/(\{[A-Za-z0-9_.-]+\})/)
      .map((part) => {
        const placeholder = part.match(/^\{([A-Za-z0-9_.-]+)\}$/);
        if (!placeholder) return escapeRegExp(part);
        names.push(placeholder[1]);
        // Non-greedy: with several placeholders, the first must give back as
        // little as possible so the later ones still match their literals.
        return "(.+?)";
      })
      .join("");
    return { pattern: new RegExp(`^${source}$`), names, template: value as string };
  });

export function lookup(text: string): string | undefined {
  return dictionary.get(normalizeKey(text));
}

/**
 * A captured placeholder value must look like a value, not like the rest of
 * a sentence: no sentence punctuation, at most four words, at most 40
 * characters. Without this, "Showing up to {count}" would also translate
 * "Showing up to 50 of the tasks in the list".
 */
function isPlausibleValue(value: string): boolean {
  if (value.length === 0 || value.length > 40) return false;
  if (/[.;!?\n]/.test(value)) return false;
  if (value.trim().split(/\s+/).length > 4) return false;
  return /^[\w\s\d.:%+\-/]+$/.test(value);
}

/**
 * Translate text through a template. Returns undefined when no template
 * matches, so callers fall back to the original English.
 */
export function lookupTemplate(text: string): string | undefined {
  const normalized = normalizeKey(text);
  for (const entry of templates) {
    const match = entry.pattern.exec(normalized);
    if (!match) continue;
    const captured = entry.names.map((_, index) => match[index + 1] ?? "");
    if (!captured.every(isPlausibleValue)) continue;
    let result = entry.template;
    entry.names.forEach((name, index) => {
      result = result.split(`{${name}}`).join(captured[index]);
    });
    return result;
  }
  return undefined;
}

/** Exact match first, then templates. */
export function translate(text: string): string | undefined {
  return lookup(text) ?? lookupTemplate(text);
}
