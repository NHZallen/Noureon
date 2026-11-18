/* global chrome */
// The browser host reads the order of the tabs here (browser-host/cdp-actions.mjs, tabOrder): DevTools lists the targets in no useful order, and only the extension API knows
// the index of a tab in its window. Nothing calls this but the host, through DevTools (the service worker target); no page can reach it: no content scripts, no
// externally_connectable, no message listeners.
self.noureonTabs = async () => (await chrome.tabs.query({})).map((tab) => ({ windowId: tab.windowId, index: tab.index, url: tab.url || tab.pendingUrl || '', title: tab.title || '', active: tab.active === true }));
// A service worker that has nothing to do is stopped after a while; an extension API call now and then keeps it, and so its DevTools target, there.
setInterval(() => { void chrome.runtime.getPlatformInfo(); }, 20_000);
