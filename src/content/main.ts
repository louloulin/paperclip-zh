import { DICT_VERSION, dictionary } from "../shared/dictionary";
import { resolveLocale, type LocaleOverride, type UiLocale } from "./negotiation";
import { restoreAttributes, translateAttributes } from "./attributes";
import { restoreTree, translateTree } from "./dom";
import { loadSettings, mirrorToLocalStorage, onSettingsChanged, type AgentLanguage } from "./state";

let enabled = true;
let locale: UiLocale = "en";
let settingsOverride: LocaleOverride = "auto";
let settingsAgentLanguage: AgentLanguage = "auto";
let hits = 0;

function active(): boolean {
  return enabled && locale === "zh-CN";
}

async function persistStats(): Promise<void> {
  try {
    await chrome.storage.session.set({ packStats: { hits, dictVersion: DICT_VERSION } });
  } catch {
    // session storage is unavailable in some contexts; stats are cosmetic.
  }
}

function run(root: ParentNode = document): void {
  if (!active()) return;
  let changed = translateTree(root);
  changed += translateAttributes(root instanceof Document ? root : (root as Element));
  if (changed > 0) {
    hits += changed;
    void persistStats();
  }
}

function applySettings(next: { enabled: boolean; locale: UiLocale; agentLanguage: AgentLanguage }): void {
  const wasActive = active();
  enabled = next.enabled;
  locale = next.locale;
  settingsAgentLanguage = next.agentLanguage;
  mirrorToLocalStorage({ enabled, override: settingsOverride, agentLanguage: settingsAgentLanguage });
  if (active() && !wasActive) {
    run(document);
  } else if (!active() && wasActive) {
    restoreTree(document);
    restoreAttributes(document);
  }
}

async function init(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) return;
  const settings = await loadSettings();
  settingsOverride = settings.override;
  settingsAgentLanguage = settings.agentLanguage;
  locale = resolveLocale(settings.override, navigator.languages ?? [navigator.language]);
  enabled = settings.enabled;
  mirrorToLocalStorage({ enabled, override: settings.override, agentLanguage: settings.agentLanguage });
  if (active()) run(document);

  onSettingsChanged((next) => {
    settingsOverride = next.override;
    applySettings({
      enabled: next.enabled,
      locale: resolveLocale(next.override, navigator.languages ?? [navigator.language]),
      agentLanguage: next.agentLanguage,
    });
  });

  const queued: MutationRecord[] = [];
  let scheduled = false;
  const observer = new MutationObserver((mutations) => {
    queued.push(...mutations);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const batch = queued.splice(0);
      if (!active()) return;
      const roots = new Set<ParentNode>();
      for (const mutation of batch) {
        if (mutation.type === "characterData" && mutation.target.parentElement) {
          roots.add(mutation.target.parentElement);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            roots.add(node.parentElement ?? (node as ParentNode));
          }
        }
      }
      for (const root of roots) run(root);
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

void init();

export { DICT_VERSION, dictionary };
