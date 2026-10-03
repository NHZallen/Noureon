// The Privacy tab of the settings: where replies are made (the server or this device), what is sent to the server, what always
// stays on this device for now, and where the data is kept. Its texts are in server-reply-texts.js (five languages).
// The choice is saved as soon as it is made (it is not part of the Save button), like the account controls.

import { serverReplyText } from '../server-reply/server-reply-texts.js';

const SECTION_ID = 'privacy-section';
const NAV_ID = 'privacy-section-nav';
const languageBound = new WeakSet();

const el = (document, tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const bulletList = (document, items) => {
  const list = el(document, 'ul', 'list-disc pl-5 space-y-1 text-sm text-[var(--text-secondary)]');
  for (const item of items) list.appendChild(el(document, 'li', '', item));
  return list;
};

export function renderPrivacySection({ document, section, config, language, hasAccount, onChange }) {
  const t = (key) => serverReplyText(language, key);
  section.replaceChildren();

  const runTitle = el(document, 'h3', 'text-lg font-semibold mb-3', t('runTitle'));
  const options = el(document, 'div', 'space-y-3 text-sm');
  const current = config.replyRunLocation === 'local' ? 'local' : 'server';
  for (const [value, label, description] of [['server', t('runServer'), t('runServerDesc')], ['local', t('runLocal'), t('runLocalDesc')]]) {
    const row = el(document, 'div', 'flex items-start');
    const input = el(document, 'input', 'w-4 h-4 mr-2 mt-1');
    input.type = 'radio';
    input.name = 'reply-run-location';
    input.id = `reply-run-location-${value}`;
    input.value = value;
    input.checked = current === value;
    input.addEventListener('change', () => { if (input.checked) onChange(value); });
    const text = el(document, 'label', 'flex-1 cursor-pointer');
    text.htmlFor = input.id;
    text.append(el(document, 'span', 'block font-medium', label), el(document, 'span', 'block text-xs text-[var(--text-secondary)]', description));
    row.append(input, text);
    options.appendChild(row);
  }
  section.append(runTitle, options);
  if (!hasAccount) section.appendChild(el(document, 'p', 'text-xs text-[var(--text-secondary)] mt-2', t('needAccount')));

  const block = (titleKey, keys) => {
    section.appendChild(el(document, 'h3', 'text-lg font-semibold mb-3 mt-6', t(titleKey)));
    section.appendChild(bulletList(document, keys.map(t)));
  };
  block('sentTitle', ['sent1', 'sent2', 'sent3', 'sent4']);
  block('localTitle', ['local2', 'local3']);
  block('storageTitle', ['storage1', 'storage2']);
}

/** Adds the tab (and its section) once, and fills it in the language of the page. */
export function ensurePrivacySettingsSection({ document, elements, config, saveConfig = async () => {}, getSync = () => globalThis.__astraCloudSyncV2 }) {
  const nav = elements.settingsNav || document.getElementById('settings-nav');
  const dataNav = nav?.querySelector?.('[data-section="data-management"]');
  const dataSection = document.getElementById('data-management-section');
  if (!nav || !dataNav || !dataSection) return;

  if (!document.getElementById(NAV_ID)) {
    const item = el(document, 'li', 'settings-nav-item p-3 rounded-md');
    item.id = NAV_ID;
    item.dataset.section = 'privacy';
    item.dataset.langKey = 'privacy';
    item.textContent = serverReplyText(config.uiLanguage, 'navPrivacy');
    dataNav.after(item);
  }
  let section = document.getElementById(SECTION_ID);
  if (!section) {
    section = el(document, 'div', 'settings-section');
    section.id = SECTION_ID;
    dataSection.after(section);
  }

  const render = (language) => renderPrivacySection({
    document,
    section,
    config,
    language,
    hasAccount: getSync()?.getStatus?.()?.enabled === true,
    onChange: async (value) => {
      config.replyRunLocation = value;
      try {
        await saveConfig();
      } catch (error) {
        console.warn('Saving where replies run failed.', error);
      }
    }
  });
  render(config.uiLanguage);
  // The language menu applies at once while the settings stay open.
  const languageSelect = elements.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageBound.has(languageSelect)) {
    languageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => {
      render(event.target.value);
      const navItem = document.getElementById(NAV_ID);
      if (navItem) navItem.textContent = serverReplyText(event.target.value, 'navPrivacy');
    });
  }
}
