import { DICT_VERSION } from "../shared/dictionary";

const SETTINGS_KEY = "paperclip-zh-pack.settings";

const enabledBox = document.getElementById("enabled") as HTMLInputElement;
const overrideSelect = document.getElementById("override") as HTMLSelectElement;
const stats = document.getElementById("stats") as HTMLDivElement;

async function boot(): Promise<void> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = (stored[SETTINGS_KEY] ?? { enabled: true, override: "auto" }) as {
    enabled: boolean;
    override: "auto" | "en" | "zh-CN";
  };
  enabledBox.checked = settings.enabled;
  overrideSelect.value = settings.override;

  const session = await chrome.storage.session.get("packStats");
  const value = session.packStats as { hits?: number; dictVersion?: string } | undefined;
  stats.textContent = `已替换 ${value?.hits ?? 0} 处 · 词典 v${value?.dictVersion ?? DICT_VERSION}`;
}

enabledBox.addEventListener("change", async () => {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] ?? { override: "auto" };
  await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...settings, enabled: enabledBox.checked } });
});

overrideSelect.addEventListener("change", async () => {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] ?? { enabled: true };
  await chrome.storage.sync.set({
    [SETTINGS_KEY]: { ...settings, override: overrideSelect.value as "auto" | "en" | "zh-CN" },
  });
});

void boot();
