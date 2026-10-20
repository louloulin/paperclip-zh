import { lookup, translate } from "../shared/dictionary";
import { readMirror, type PackSettings } from "../content/state";

/**
 * Runs in the page's MAIN world (chrome.* is unavailable), so settings come
 * from the localStorage mirror the content script maintains.
 *
 * Error fields may contain dynamic values ("Attachment is larger than the
 * 10MB limit"), so they also go through templates. User-content fields
 * (title/description/summary) stay exact-match only: a task literally named
 * "Showing up to 50" must not be rewritten by a UI template.
 */
const ERROR_FIELDS = new Set(["error", "message", "detail", "hint", "error_description"]);
const EXACT_FIELDS = new Set(["title", "description", "summary"]);
const MAX_DEPTH = 8;

function packEnabled(): boolean {
  const settings = readMirror();
  return settings.enabled && resolveLocaleZh(settings.override);
}

function resolveLocaleZh(override: string, languages?: readonly string[]): boolean {
  if (override === "zh-CN") return true;
  if (override === "en") return false;
  for (const tag of languages ?? navigator.languages ?? [navigator.language]) {
    if (tag.toLowerCase().startsWith("zh")) return true;
  }
  return false;
}

/** Reply language for agent conversations, derived from the pack settings. */
export type ReplyLocale = "zh-CN" | "en";

export function resolveReplyLocale(
  settings: PackSettings,
  languages?: readonly string[],
): ReplyLocale | null {
  if (settings.agentLanguage === "off") return null;
  if (settings.agentLanguage === "zh-CN") return "zh-CN";
  if (settings.agentLanguage === "en") return "en";
  return resolveLocaleZh(settings.override, languages) ? "zh-CN" : "en";
}

/**
 * HTML comments are dropped by Paperclip's markdown renderer, so the
 * directive reaches the agent in the raw comment without showing up in the
 * thread. It is advisory: the agent keeps its tools and data formats.
 */
const DIRECTIVES: Record<ReplyLocale, string> = {
  "zh-CN":
    "<!-- paperclip-zh-pack:lang=zh-CN Reply in Simplified Chinese (简体中文). " +
    "Keep code, commands, file paths, identifiers, and quoted logs unchanged. -->",
  en:
    "<!-- paperclip-zh-pack:lang=en Reply in English. " +
    "Keep code, commands, file paths, identifiers, and quoted logs unchanged. -->",
};

export function languageDirective(locale: ReplyLocale | null): string | null {
  return locale === null ? null : DIRECTIVES[locale];
}

const EXISTING_DIRECTIVE = /<!--\s*paperclip-zh-pack:lang=[\s\S]*?-->/g;

/** Append (or replace) the hidden directive at the end of a comment body. */
export function appendLanguageDirective(body: string, directive: string): string {
  const cleaned = body.replace(EXISTING_DIRECTIVE, "").trimEnd();
  return `${cleaned}\n\n${directive}`;
}

const ISSUE_COMMENT_PATH = /\/api\/issues\/[^/?#]+\/comments(?:\?|$)/;

/**
 * Rewrite `POST /api/issues/:id/comments` so the agent receives a reply
 * language. All other requests, methods, and non-JSON bodies pass through.
 */
export function withLanguageDirective(
  url: string,
  init: RequestInit | undefined,
  directive: string | null,
): RequestInit | undefined {
  if (directive === null) return init;
  if ((init?.method ?? "GET").toUpperCase() !== "POST") return init;
  if (!ISSUE_COMMENT_PATH.test(url)) return init;
  if (typeof init?.body !== "string") return init;
  let parsed: unknown;
  try {
    parsed = JSON.parse(init.body);
  } catch {
    return init;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return init;
  const record = parsed as Record<string, unknown>;
  if (typeof record.body !== "string" || record.body.trim() === "") return init;
  return {
    ...init,
    body: JSON.stringify({
      ...record,
      body: appendLanguageDirective(record.body, directive),
    }),
  };
}

/**
 * Translate whitelist string fields of a parsed JSON body, exact-match only.
 * Everything else — data fields, ids, enums, user content — passes through
 * untouched. Returns the same object when nothing matched.
 */
export function translateJson<T>(value: T, depth = 0): T {
  if (!packEnabled() || depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    let arrayChanged = false;
    const out = value.map((item) => {
      const next = translateJson(item, depth + 1);
      if (next !== item) arrayChanged = true;
      return next;
    });
    return arrayChanged ? (out as unknown as T) : value;
  }
  if (typeof value === "object" && value !== null) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === "string" && (ERROR_FIELDS.has(key) || EXACT_FIELDS.has(key))) {
        const zh = ERROR_FIELDS.has(key) ? translate(item) : lookup(item);
        if (zh !== undefined && zh !== item) {
          out[key] = zh;
          changed = true;
          continue;
        }
      }
      if (key === "errors" && Array.isArray(item)) {
        const next = item.map((entry) =>
          typeof entry === "string" ? (translate(entry) ?? entry) : translateJson(entry, depth + 1),
        );
        const arrayChanged = next.some((entry, index) => entry !== item[index]);
        if (arrayChanged) changed = true;
        out[key] = arrayChanged ? next : item;
        continue;
      }
      const next = translateJson(item, depth + 1);
      if (next !== item) changed = true;
      out[key] = next;
    }
    return changed ? (out as unknown as T) : value;
  }
  return value;
}

function translatedResponse(response: Response, body: unknown): Response {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(JSON.stringify(translateJson(body)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function installFetchPatch(target: { fetch: typeof fetch } = window): void {
  const original = target.fetch.bind(target);
  target.fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    let nextInit = init;
    try {
      const settings = readMirror();
      if (settings.enabled && typeof input === "string") {
        nextInit = withLanguageDirective(
          input,
          init,
          languageDirective(resolveReplyLocale(settings)),
        );
      }
    } catch {
      // A malformed mirror must never break the request.
    }
    const response = await original(input, nextInit);
    try {
      if (!packEnabled()) return response;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return response;
      const body = await response.clone().json();
      if (typeof body !== "object" || body === null) return response;
      return translatedResponse(response, body);
    } catch {
      return response;
    }
  };
}

if (typeof window !== "undefined" && !window.__paperclipZhPackPatched) {
  window.__paperclipZhPackPatched = true;
  installFetchPatch();
}

declare global {
  interface Window {
    __paperclipZhPackPatched?: boolean;
  }
}
