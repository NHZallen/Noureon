// noureon.com/admin/browser: where the owner of the service looks after the browser agent (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §9): stop every browser, make invite codes.
// Like the page of the reports (share-page/share-admin-page.js), only an account the server names as one of the people in charge (BROWSER_ADMINS) gets anything: for everyone else (signed out
// included) the page is the platform's own 404. Every call is checked again by the server. The page asks the server with the token of the session it has; it holds no password and no secret.

import { getSupabaseClient } from '../auth/supabase-client.js';
import { ensureLanguage } from '../i18n/language-packs.js';
import { detectSystemLanguage, readLastUiLanguage, readLoginLanguage } from '../runtime/features/login-language.js';
import { applyRememberedAccent } from '../../utils/accent-mirror.js';
import { showPlatformNotFound } from '../share-page/not-found-page.js';
import { markPageAsPrivate } from '../share-page/private-page.js';
import { registerServerRequest } from '../runtime/cli/cli-server-bridge.js';
import * as client from '../runtime/browser-agent/browser-agent-client.js';
import { browserAdminText } from './browser-admin-texts.js';

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

export async function initializeBrowserAdminPage({ window, document, supabase = getSupabaseClient(), fetchImpl = (...args) => globalThis.fetch(...args), baseUrl = resolveServerApiUrl(import.meta.env?.VITE_SERVER_API_URL), serverClient = client } = {}) {
  const hide = async () => { await showPlatformNotFound({ window, document, fetchImpl }); return { handled: true, admin: false }; };
  if (!supabase) return hide();
  let token = '';
  try { token = (await supabase.auth.getSession())?.data?.session?.access_token || ''; } catch { /* treated as signed out */ }
  if (!token) return hide();
  // The calls of the browser agent go through this one connection: the token of this session, to the server.
  registerServerRequest(async (method, path, { body } = {}) => {
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, code: data?.error?.code || null, data };
    } catch {
      return { ok: false, status: 0, code: 'unreachable' };
    }
  });
  const access = await serverClient.getAccess();
  if (!access.ok || access.admin !== true) return hide();

  markPageAsPrivate(document);
  applyRememberedAccent(document.documentElement, window.localStorage);
  const language = supported(readLoginLanguage()) || supported(readLastUiLanguage()) || supported(detectSystemLanguage()) || 'zh-TW';
  await ensureLanguage(language).catch(() => {});
  const text = (key, values) => browserAdminText(language, key, values);
  document.documentElement.lang = language;
  document.title = `${text('title')} · Noureon`;
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
  main.appendChild(el(document, 'h1', 'sp-title', text('title')));

  const card = (titleKey, descKey) => {
    const section = el(document, 'section', 'sp-admin-card');
    section.appendChild(el(document, 'h2', 'sp-admin-title', text(titleKey)));
    section.appendChild(el(document, 'p', 'sp-note', text(descKey)));
    return section;
  };
  const button = (label, primary = false) => { const node = el(document, 'button', `sp-btn${primary ? ' is-primary' : ''}`, label); node.type = 'button'; return node; };

  // Stop every browser: pressed twice, because it ends what other people are doing.
  const stopCard = card('stopTitle', 'stopDesc');
  const stopRow = el(document, 'div', 'sp-report-row');
  const stop = button(text('stopAll'));
  const stopNote = el(document, 'p', 'sp-note');
  stopNote.setAttribute('role', 'status');
  let armed = false;
  stop.addEventListener('click', async () => {
    if (!armed) { armed = true; stop.textContent = text('sure'); return; }
    armed = false;
    stop.disabled = true;
    const result = await serverClient.stopAllBrowsers();
    stopNote.textContent = result.ok ? text('stopped', { n: result.stopped }) : text('failed');
    stop.textContent = text('stopAll');
    stop.disabled = false;
  });
  stopRow.append(stop);
  stopCard.append(stopRow, stopNote);

  // Invite codes for people who have no place yet.
  const codesCard = card('codesTitle', 'codesDesc');
  const codesRow = el(document, 'div', 'sp-report-row');
  const list = el(document, 'ul', 'sp-admin-reasons');
  const note = el(document, 'p', 'sp-note');
  note.setAttribute('role', 'status');
  for (const n of [1, 5, 10]) {
    const make = button(text('make', { n }), n === 1);
    make.addEventListener('click', async () => {
      make.disabled = true;
      const result = await serverClient.mintCodes(n);
      make.disabled = false;
      if (!result.ok) { note.textContent = text('failed'); return; }
      note.textContent = '';
      for (const code of result.codes) {
        const item = el(document, 'li', null, code);
        const copy = button(text('copy'));
        copy.addEventListener('click', async () => { try { await window.navigator.clipboard.writeText(code); copy.textContent = text('copied'); } catch { /* the code is on the screen */ } });
        item.append(' ', copy);
        list.append(item);
      }
    });
    codesRow.append(make);
  }
  codesCard.append(codesRow, note, list);
  main.append(stopCard, codesCard);
  return { handled: true, admin: true };
}
