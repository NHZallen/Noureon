// The Permissions tab of the settings: the network access of the CLI tools, and what to manage under it (the tools, the sites, the secure
// credentials). Added next to the Privacy tab, like it (settings-privacy-section.js); what is drawn is ui/cli/permissions-view.js.
// The choices are saved as soon as they are made (not with the Save button of the settings).

import { permissionText } from '../cli/permission-texts.js';
import { CREDENTIALS_CHANGED, deleteCredential, listCredentials, saveCredential } from '../cli/credentials-client.js';

const SECTION_ID = 'permissions-section';
const NAV_ID = 'permissions-section-nav';
const languageBound = new WeakSet();
const changeBound = new WeakSet();

/** Adds the tab (and its section) once, and draws it in the language of the page. */
export function ensurePermissionsSettingsSection({ document, elements, config, saveConfig = async () => {}, getSync = () => globalThis.__astraCloudSyncV2, showNotification = () => {} }) {
  const nav = elements.settingsNav || document.getElementById('settings-nav');
  const anchorNav = document.getElementById('privacy-section-nav') || nav?.querySelector?.('[data-section="data-management"]');
  const anchorSection = document.getElementById('privacy-section') || document.getElementById('data-management-section');
  if (!nav || !anchorNav || !anchorSection) return;

  let language = config.uiLanguage;
  if (!document.getElementById(NAV_ID)) {
    const item = document.createElement('li');
    item.className = 'settings-nav-item p-3 rounded-md';
    item.id = NAV_ID;
    item.dataset.section = 'permissions';
    item.dataset.langKey = 'permissions';
    item.textContent = permissionText(language, 'nav');
    anchorNav.after(item);
  }
  let section = document.getElementById(SECTION_ID);
  if (!section) {
    section = document.createElement('div');
    section.className = 'settings-section';
    section.id = SECTION_ID;
    anchorSection.after(section);
  }

  // `fresh`: the settings were just opened, so the tab starts at its first page (a change of language keeps the page it is on).
  const draw = async (fresh = false) => {
    try {
      await render(fresh);
    } catch (error) {
      console.warn('Drawing the Permissions tab failed.', error);
    }
  };
  const render = async (fresh) => {
    // (A page that is only a stand-in for a document, as in some tests, has nothing to draw into.)
    if (typeof section.replaceChildren !== 'function') return;
    const { renderPermissionsView, resetPermissionsView } = await import('../../ui/cli/permissions-view.js');
    if (fresh) resetPermissionsView(section);
    renderPermissionsView({
      document,
      root: section,
      getLanguage: () => language,
      getConfig: () => config,
      saveConfig,
      credentials: { list: listCredentials, save: saveCredential, remove: deleteCredential },
      hasAccount: () => getSync()?.getStatus?.()?.enabled === true,
      openStore: async () => {
        const { getCliMode } = await import('../cli/cli-bridge.js');
        getCliMode()?.openStore?.();
      },
      openLicenses: async () => {
        const { openLicenses } = await import('../../ui/cli/licenses-view.js');
        openLicenses({ document, getLanguage: () => language });
      },
      showNotification
    });
  };
  void draw(true);
  // A credential saved from the window in a chat (or anywhere) shows in this tab at once.
  const win = document.defaultView;
  if (win?.addEventListener && !changeBound.has(win)) {
    changeBound.add(win);
    win.addEventListener(CREDENTIALS_CHANGED, async () => {
      const current = document.getElementById(SECTION_ID);
      if (!current || typeof current.replaceChildren !== 'function') return;
      const { invalidatePermissionsCredentials } = await import('../../ui/cli/permissions-view.js');
      invalidatePermissionsCredentials(current);
      void draw();
    });
  }
  // The language menu applies at once while the settings stay open.
  const languageSelect = elements.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageBound.has(languageSelect)) {
    languageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => {
      language = event.target.value;
      const navItem = document.getElementById(NAV_ID);
      if (navItem) navItem.textContent = permissionText(language, 'nav');
      void draw();
    });
  }
}
