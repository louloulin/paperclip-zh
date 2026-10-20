// MV3 service worker: seed default settings on install so the popup, the
// content script, and the MAIN-world patch agree from the first run.
const SETTINGS_KEY = "paperclip-zh-pack.settings";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.sync.get(SETTINGS_KEY).then((stored) => {
    if (stored[SETTINGS_KEY] === undefined) {
      void chrome.storage.sync.set({ [SETTINGS_KEY]: { enabled: true, override: "auto" } });
    }
  });
});
