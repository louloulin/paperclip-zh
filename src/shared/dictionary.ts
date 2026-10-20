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

export function lookup(text: string): string | undefined {
  return dictionary.get(normalizeKey(text));
}
