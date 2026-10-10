// The skills as the page's main code holds them: the composer side (skill-mode.js: the "/" list, the chips, what a reply is given) is loaded the first time it is
// needed, so the page's first load carries none of it. It is needed when "/" is typed in the box, when a message is sent by a person who has skills, and when a
// ```skill-draft card has to be made. Until then the bridge (skill-bridge.js) holds a stand-in: nothing is chosen, and no skill is offered to a model for a person who
// has none. Once the real one is made it registers itself with the bridge and takes over.

import { registerSkillMode } from './skill-bridge.js';

export function createLazySkillMode(options) {
  const { document, messageInput, getConfig, getUiLanguage, saveConfig = async () => {}, showNotification = () => {}, getAccountReady = () => true, refresh = () => {}, skillStore = null, logger = console } = options;
  const win = document.defaultView;
  let real = null;
  let loading = null;
  const load = () => (loading ||= import('./skill-mode.js').then((module) => {
    real = module.createSkillMode(options);
    return real;
  }));
  const hasSkills = () => (getConfig()?.skillEnabledIds?.length || 0) > 0;

  // "/" in the box: the real one is made, and shows its list for what is already typed.
  messageInput.addEventListener('input', () => {
    if (real || !(messageInput.textContent || '').includes('/')) return;
    void load().then((mode) => mode.evaluate()).catch((error) => logger?.warn?.('Loading the skills failed.', error));
  });

  // The cards of the skills a model wrote (```skill-draft): when the first placeholder is on the page, skill-drafts.js is loaded and the cards are made.
  let drafts = null;
  const hydrateDrafts = async () => {
    if (!document.querySelector?.('.skill-draft-card:not([data-ready])')) return;
    try {
      drafts ||= (await import('./skill-drafts.js')).createSkillDrafts({ document, language: getUiLanguage, getConfig, saveConfig, showNotification, getAccountReady, skillStore, own: () => (skillStore ? skillStore.cached() : []), refresh, logger });
      await drafts.hydrate();
    } catch (error) {
      logger?.warn?.('Showing a skill a model wrote failed.', error);
    }
  };
  if (typeof win?.MutationObserver === 'function' && document.body) {
    let queued = false;
    new win.MutationObserver(() => {
      if (queued) return;
      queued = true;
      (win.requestAnimationFrame || win.setTimeout).call(win, () => { queued = false; void hydrateDrafts(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // What the bridge holds until the real one is there.
  const standIn = {
    selection: () => [],
    clear: () => {},
    available: async (exclude) => (hasSkills() ? (await load()).available(exclude) : []),
    lookup: async (name) => (await load()).lookup(name),
    resolve: async (names) => (await load()).resolve(names),
    readFile: async (name, path) => (await load()).readFile(name, path)
  };
  registerSkillMode(standIn);

  return {
    sync: () => real?.sync(),
    indicators: (map, closeButton) => real?.indicators(map, closeButton),
    closeMenu: () => real?.closeMenu(),
    hydrateDrafts,
    load,
    get loaded() { return Boolean(real); }
  };
}
