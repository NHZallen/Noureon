// The page "Third-party software and licences": the CLI tools of the store (from the catalog), the software in the server's sandbox and the
// libraries the app is made with. A page over the app with a back button, like the CLI store; opened from the store and from the settings.

import { OFFICIAL_CLI_CATALOG, isCliReady } from '../../../data/cli-catalog.js';
import { APP_LIBRARIES, SANDBOX_SOFTWARE } from '../../../data/third-party.js';
import { permissionText } from '../../runtime/cli/permission-texts.js';

let current = null;

const make = (document, tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const closeLicenses = () => current?.close();

/** Opens the page (once). Returns { close, element }. */
export function openLicenses({ document = globalThis.document, getLanguage }) {
  if (current) return current;
  const t = (key) => permissionText(getLanguage(), key);
  const opener = document.activeElement;
  const root = make(document, 'div', 'pm-lic');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('licensesTitle'));
  const head = make(document, 'header', 'pm-lic-head');
  const back = make(document, 'button', 'pm-lic-back');
  back.type = 'button';
  back.setAttribute('aria-label', t('back'));
  back.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  head.append(back, make(document, 'h1', 'pm-lic-title', t('licensesTitle')));
  const body = make(document, 'main', 'pm-lic-body');
  const column = make(document, 'div', 'pm-lic-column');
  column.append(make(document, 'p', 'pm-desc', t('licensesIntro')), make(document, 'p', 'pm-desc', t('licensesNote')));
  const section = (title, entries) => {
    column.append(make(document, 'h2', 'pm-lic-section', title));
    const list = make(document, 'ul', 'pm-lic-list');
    for (const entry of entries) {
      const item = make(document, 'li', 'pm-lic-item');
      const name = entry.url ? make(document, 'a', 'pm-lic-name', entry.name) : make(document, 'span', 'pm-lic-name', entry.name);
      if (entry.url) {
        name.href = entry.url;
        name.target = '_blank';
        name.rel = 'noopener noreferrer';
      }
      item.append(name, make(document, 'span', 'pm-lic-license', entry.license));
      if (entry.note) item.append(make(document, 'span', 'pm-lic-note', entry.note));
      list.append(item);
    }
    column.append(list);
  };
  section(t('licensesTools'), OFFICIAL_CLI_CATALOG.filter(isCliReady).map((tool) => ({ name: `${tool.name}${tool.version ? ` ${tool.version}` : ''}`, license: tool.license, url: tool.homepage, note: tool.author })));
  section(t('licensesSandbox'), SANDBOX_SOFTWARE);
  section(t('licensesApp'), APP_LIBRARIES);
  body.append(column);
  root.append(head, body);
  document.body.append(root);

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    current = null;
    try {
      opener?.focus?.();
    } catch {
      // The opener is gone.
    }
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('click', close);
  back.focus();
  current = { close, element: root };
  return current;
}
