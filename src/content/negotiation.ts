/**
 * Locale negotiation, mirroring codex-host's renderer-extension
 * (`codex-locale-adapter.ts`): override → system → navigator → default, with
 * any `zh*` tag normalized to zh-CN via Intl.Locale.
 */
export type UiLocale = "en" | "zh-CN";
export type LocaleOverride = "auto" | "en" | "zh-CN";

export function resolveLocale(override: LocaleOverride, languages: readonly string[]): UiLocale {
  if (override === "en") return "en";
  const candidates = override === "zh-CN" ? ["zh-CN"] : languages;
  for (const tag of candidates) {
    if (isChineseTag(tag)) return "zh-CN";
  }
  return "en";
}

function isChineseTag(tag: string): boolean {
  if (tag.toLowerCase().startsWith("zh")) return true;
  try {
    return new Intl.Locale(tag).language.toLowerCase() === "zh";
  } catch {
    return false;
  }
}
