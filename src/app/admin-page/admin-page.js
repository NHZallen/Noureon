// noureon.com/admin: the one page where the owner of the service looks after the service (the reports of shared conversations, the browser agent). Each part is shown only to an account that
// is allowed to use it: the reports to the accounts named in the database (`service_admins`, checked again by every call), the browser agent to the accounts the server names (BROWSER_ADMINS).
// For everyone else (signed out included) the page is the platform's own 404, as it is for an address that is not there; with one part to show there is no bar of tabs.

import { getSupabaseClient } from '../auth/supabase-client.js';
import { ensureLanguage } from '../i18n/language-packs.js';
import { detectSystemLanguage, readLastUiLanguage, readLoginLanguage } from '../runtime/features/login-language.js';
import { applyRememberedAccent } from '../../utils/accent-mirror.js';
import { showPlatformNotFound } from '../share-page/not-found-page.js';
import { markPageAsPrivate } from '../share-page/private-page.js';
import { shareAdminText } from '../share-page/share-admin-texts.js';
import { browserAdminText } from '../browser-admin/browser-admin-texts.js';
import { drawShareReports } from '../share-page/share-admin-page.js';
import { drawBrowserAdmin } from '../browser-admin/browser-admin-page.js';
import { registerServerRequest } from '../runtime/cli/cli-server-bridge.js';
import * as browserClient from '../runtime/browser-agent/browser-agent-client.js';
import { adminPageText } from './admin-texts.js';

const supported = (value) => (['zh-TW', 'en', 'fr', 'ru', 'es'].includes(value) ? value : '');
const resolveServerApiUrl = (value) => {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+$/.test(text) ? text : 'https://api.noureon.com';
};
const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export async function initializeAdminPage({ window, document, supabase = getSupabaseClient(), fetchImpl = (...args) => globalThis.fetch(...args), baseUrl = resolveServerApiUrl(import.meta.env?.VITE_SERVER_API_URL), serverClient = browserClient } = {}) {
  // Nothing of this page is built until the account is known to be one of the people in charge: anyone else gets what an address that is not there gets, so the page cannot be found by asking.
  const hide = async () => { await showPlatformNotFound({ window, document, fetchImpl }); return { handled: true, admin: false }; };
  if (!supabase) return hide();
  let session = null;
  try { session = (await supabase.auth.getSession())?.data?.session || null; } catch { /* treated as signed out */ }
  if (!session) return hide();

  let reports = false;
  try { reports = (await supabase.rpc('is_service_admin'))?.data === true; } catch { reports = false; }
  // The browser agent's calls go through this one connection: the token of this session, to the server.
  registerServerRequest(async (method, path, { body } = {}) => {
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${session.access_token || ''}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, code: data?.error?.code || null, data };
    } catch {
      return { ok: false, status: 0, code: 'unreachable' };
    }
  });
  let browser = false;
  if (session.access_token) { try { const access = await serverClient.getAccess(); browser = access.ok === true && access.admin === true; } catch { browser = false; } }
  const parts = [reports && 'reports', browser && 'browser'].filter(Boolean);
  if (!parts.length) return hide();

  markPageAsPrivate(document);
  applyRememberedAccent(document.documentElement, window.localStorage);
  const language = supported(readLoginLanguage()) || supported(readLastUiLanguage()) || supported(detectSystemLanguage()) || 'zh-TW';
  await ensureLanguage(language).catch(() => {});
  document.documentElement.lang = language;
  document.title = `${adminPageText(language, 'title')} · Noureon`;
  document.documentElement.classList.add('share-page');
  const app = document.getElementById('app');
  app.replaceChildren();
  const root = el(document, 'div', 'sp-root');
  const header = el(document, 'header', 'sp-header');
  const brand = el(document, 'a', 'sp-brand');
  brand.href = '/';
  const mark = el(document, 'img', 'sp-mark');
  mark.src = '/icon-192.png'; mark.width = 28; mark.height = 28; mark.alt = '';
  brand.append(mark, el(document, 'span', 'sp-name', 'Noureon'));
  header.appendChild(brand);
  const main = el(document, 'main', 'sp-main');
  root.append(header, main);
  app.appendChild(root);

  const tabs = el(document, 'div', 'sp-report-row');
  tabs.setAttribute('role', 'tablist');
  const body = el(document, 'div', 'sp-admin-body');
  const draws = {
    reports: () => drawShareReports({ document, supabase, text: (key, values) => shareAdminText(language, key, values), main: body }),
    browser: () => drawBrowserAdmin({ window, document, text: (key, values) => browserAdminText(language, key, values), main: body, serverClient })
  };
  const show = async (part) => {
    for (const button of tabs.children) button.setAttribute('aria-selected', String(button.dataset.part === part));
    await draws[part]();
  };
  if (parts.length > 1) {
    for (const part of parts) {
      const button = el(document, 'button', 'sp-btn', adminPageText(language, part));
      button.type = 'button';
      button.dataset.part = part;
      button.setAttribute('role', 'tab');
      button.addEventListener('click', () => { void show(part); });
      tabs.appendChild(button);
    }
    main.append(tabs);
  }
  main.append(body);
  await show(parts[0]);
  return { handled: true, admin: true, parts };
}
