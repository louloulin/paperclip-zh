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
  key: string;
  pattern: RegExp;
  names: string[];
  template: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileTemplate(key: string, value: string): DictionaryTemplate {
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
  return { key, pattern: new RegExp(`^${source}$`), names, template: value };
}

function firstWord(text: string): string {
  const space = text.indexOf(" ");
  return space === -1 ? text : text.slice(0, space);
}

/**
 * Anchored patterns can only match text whose first word equals the pattern's
 * literal first word. Indexing by that word avoids running all ~115 regexes
 * against every text node; patterns that start with a placeholder stay in the
 * wildcard bucket.
 */
const templatesByFirstWord = new Map<string, DictionaryTemplate[]>();
const wildcardTemplates: DictionaryTemplate[] = [];
const allTemplates: DictionaryTemplate[] = [];
for (const [key, value] of Object.entries(raw)) {
  if (typeof value !== "string" || value.trim() === "" || !/\{[A-Za-z0-9_.-]+\}/.test(key)) continue;
  const entry = compileTemplate(key, value);
  allTemplates.push(entry);
  const first = firstWord(normalizeKey(key));
  if (first.includes("{")) {
    wildcardTemplates.push(entry);
  } else {
    const bucket = templatesByFirstWord.get(first);
    if (bucket) bucket.push(entry);
    else templatesByFirstWord.set(first, [entry]);
  }
}

export const templates: readonly DictionaryTemplate[] = allTemplates;

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
  const bucket = templatesByFirstWord.get(firstWord(normalized));
  if (bucket) {
    const hit = matchTemplate(bucket, normalized);
    if (hit !== undefined) return hit;
  }
  return matchTemplate(wildcardTemplates, normalized);
}

function matchTemplate(
  candidates: readonly DictionaryTemplate[],
  normalized: string,
): string | undefined {
  for (const entry of candidates) {
    const match = entry.pattern.exec(normalized);
    if (!match) continue;
    const raw = entry.names.map((_, index) => match[index + 1] ?? "");
    if (!raw.every(isPlausibleValue)) continue;
    // Captured values are often enum text ("in progress", "high"). Translate
    // them only on an exact dictionary hit so counts and names pass through.
    const captured = raw.map((value) => dictionary.get(normalizeKey(value)) ?? value);
    // Positional replacement keeps `{count} open, {count} blocked` correct:
    // the same placeholder name appears twice but each occurrence takes its
    // own captured value. When a translation drops a placeholder, fall back
    // to name-based substitution so the remaining names still resolve.
    const parts = entry.template.split(/(\{[A-Za-z0-9_.-]+\})/);
    const placeholderCount = parts.filter((part) => /^\{[A-Za-z0-9_.-]+\}$/.test(part)).length;
    if (placeholderCount === entry.names.length) {
      let index = 0;
      return parts
        .map((part) => (/^\{[A-Za-z0-9_.-]+\}$/.test(part) ? (captured[index++] ?? "") : part))
        .join("");
    }
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
