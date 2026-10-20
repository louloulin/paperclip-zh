import type { LocaleOverride } from "./negotiation";

/** Language the agent should answer in; `auto` follows the resolved UI locale. */
export type AgentLanguage = "auto" | "en" | "zh-CN" | "off";

/**
 * Pack settings. The popup and background write `chrome.storage.sync`; the
 * content script mirrors the effective state into localStorage so the
 * MAIN-world fetch patch (which cannot see chrome.*) can read it, and so a
 * change reaches that world via the standard `storage` event.
 */
export interface PackSettings {
  enabled: boolean;
  override: LocaleOverride;
  agentLanguage: AgentLanguage;
}

export const SETTINGS_STORAGE_KEY = "paperclip-zh-pack.settings";
const MIRROR_KEY = "paperclip-zh-pack.settings";

export const DEFAULT_SETTINGS: PackSettings = {
  enabled: true,
  override: "auto",
  agentLanguage: "auto",
};

export function parseSettings(raw: unknown): PackSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const value = raw as Record<string, unknown>;
  return {
    // Junk falls back to the default rather than being trusted as a boolean.
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    override:
      value.override === "en" || value.override === "zh-CN" || value.override === "auto"
        ? value.override
        : DEFAULT_SETTINGS.override,
    agentLanguage:
      value.agentLanguage === "en" ||
      value.agentLanguage === "zh-CN" ||
      value.agentLanguage === "auto" ||
      value.agentLanguage === "off"
        ? value.agentLanguage
        : DEFAULT_SETTINGS.agentLanguage,
  };
}

export async function loadSettings(): Promise<PackSettings> {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) return readMirror();
  const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY);
  return parseSettings(stored[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(settings: PackSettings): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.sync) {
    await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settings });
  }
  mirrorToLocalStorage(settings);
}

/** MAIN world cannot read chrome.storage; it reads this mirror instead. */
export function mirrorToLocalStorage(settings: PackSettings): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(settings));
  } catch {
    // Private modes can refuse localStorage; the fetch patch then stays in
    // its default (enabled) state until the next storage event.
  }
}

export function readMirror(): PackSettings {
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    return parseSettings(raw === null ? undefined : JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function onSettingsChanged(callback: (settings: PackSettings) => void): () => void {
  const fromChrome = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName === "sync" && changes[SETTINGS_STORAGE_KEY]) {
      callback(parseSettings(changes[SETTINGS_STORAGE_KEY].newValue));
    }
  };
  const fromWindow = (event: StorageEvent) => {
    if (event.key === MIRROR_KEY) {
      callback(parseSettings(event.newValue === null ? undefined : JSON.parse(event.newValue)));
    }
  };
  chrome.storage.onChanged.addListener(fromChrome);
  window.addEventListener("storage", fromWindow);
  return () => {
    chrome.storage.onChanged.removeListener(fromChrome);
    window.removeEventListener("storage", fromWindow);
  };
}
