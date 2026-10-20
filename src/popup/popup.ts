import { DICT_VERSION } from "../shared/dictionary";

const SETTINGS_KEY = "paperclip-zh-pack.settings";

const enabledBox = document.getElementById("enabled") as HTMLInputElement;
const overrideSelect = document.getElementById("override") as HTMLSelectElement;
const agentLanguageSelect = document.getElementById("agent-language") as HTMLSelectElement;
const stats = document.getElementById("stats") as HTMLDivElement;

type AgentLanguage = "auto" | "en" | "zh-CN" | "off";
type Settings = {
  enabled: boolean;
  override: "auto" | "en" | "zh-CN";
  agentLanguage: AgentLanguage;
};

const DEFAULT_SETTINGS: Settings = { enabled: true, override: "auto", agentLanguage: "auto" };

/** Proxy mode has no chrome.*; both modes read and write localStorage. */
const chromeSync =
  typeof chrome !== "undefined" && chrome.storage?.sync ? chrome.storage.sync : null;

function readLocal(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function readSettings(): Promise<Settings> {
  if (chromeSync) {
    const stored = await chromeSync.get(SETTINGS_KEY);
    const value = stored[SETTINGS_KEY];
    return value ? { ...DEFAULT_SETTINGS, ...value } : readLocal();
  }
  return readLocal();
}

async function writeSettings(patch: Partial<Settings>): Promise<void> {
  const next = { ...(await readSettings()), ...patch };
  if (chromeSync) await chromeSync.set({ [SETTINGS_KEY]: next });
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Private modes can refuse localStorage; chrome.storage still has the value.
  }
}

async function boot(): Promise<void> {
  const settings = await readSettings();
  enabledBox.checked = settings.enabled;
  overrideSelect.value = settings.override;
  agentLanguageSelect.value = settings.agentLanguage;

  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    const session = await chrome.storage.session.get("packStats");
    const value = session.packStats as { hits?: number; dictVersion?: string } | undefined;
    stats.textContent = `已替换 ${value?.hits ?? 0} 处 · 词典 v${value?.dictVersion ?? DICT_VERSION}`;
  } else {
    stats.textContent = `词典 v${DICT_VERSION} · 代理模式，设置保存在本机`;
  }
}

enabledBox.addEventListener("change", () => {
  void writeSettings({ enabled: enabledBox.checked });
});

overrideSelect.addEventListener("change", () => {
  void writeSettings({ override: overrideSelect.value as Settings["override"] });
});

agentLanguageSelect.addEventListener("change", () => {
  void writeSettings({ agentLanguage: agentLanguageSelect.value as AgentLanguage });
});

void boot();
