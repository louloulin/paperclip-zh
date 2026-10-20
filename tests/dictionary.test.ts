import { describe, expect, it } from "vitest";
import rawPack from "../dict/zh-CN.json";
import { DICT_VERSION, dictionary, lookup, normalizeKey } from "../src/shared/dictionary";

const raw = rawPack as Record<string, string>;

describe("zh-CN dictionary", () => {
  it("exposes every raw entry through the normalized lookup", () => {
    for (const [key, value] of Object.entries(raw)) {
      expect(lookup(key)).toBe(value);
      // Whitespace inside JSX renders collapsed; lookups must meet keys there.
      expect(lookup(`  ${key.replace(" ", "\n   ")}`)).toBe(value);
    }
  });

  it("falls back to undefined for misses — callers return the original", () => {
    expect(lookup("Definitely not a dictionary entry")).toBeUndefined();
    expect(lookup("")).toBeUndefined();
  });

  it("keys stay unique after whitespace normalization", () => {
    const seen = new Map<string, string>();
    for (const [key, value] of Object.entries(raw)) {
      const normalized = normalizeKey(key);
      const existing = seen.get(normalized);
      expect(existing, `duplicate normalized key: ${normalized}`).toBeUndefined();
      seen.set(normalized, value);
    }
    expect(seen.size).toBe(dictionary.size);
  });

  it("never ships unsafe payloads in Chinese values", () => {
    for (const [key, value] of Object.entries(raw)) {
      expect(value, key).not.toMatch(/<script/i);
      expect(value, key).not.toMatch(/javascript:/i);
      expect(value, key).not.toMatch(/\son[a-z]+\s*=/i);
      expect(value, key).not.toMatch(/https?:\/\//i);
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("has a version", () => {
    expect(DICT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
