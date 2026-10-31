// noureon.com/admin/shares: where the owner of the service reviews the reports of shared conversations (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §11). Only an account the owner
// added to `service_admins` gets anything: for everyone else (signed out included) the page is the platform's own 404, as it is for an address that is not there. Every call is checked again by the database.

import { getSupabaseClient } from '../auth/supabase-client.js';
import { ensureLanguage } from '../i18n/language-packs.js';
import { detectSystemLanguage, readLastUiLanguage, readLoginLanguage } from '../runtime/features/login-language.js';
import { applyRememberedAccent } from '../../utils/accent-mirror.js';
import { showPlatformNotFound } from './not-found-page.js';
import { markPageAsPrivate } from './private-page.js';
import { shareAdminText } from './share-admin-texts.js';

const supported = (value) => (['zh-TW', 'en', 'fr', 'ru', 'es'].includes(value) ? value : '');
const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export async function initializeShareAdminPage({ window, document, supabase = getSupabaseClient(), fetchImpl } = {}) {
  // Nothing of this page is built until the account is known to be the owner's: anyone else (signed out included) gets what an address that is not there gets, so the page cannot be found by asking.
  const hide = async () => { await showPlatformNotFound({ window, document, fetchImpl }); return { handled: true, admin: false }; };
  if (!supabase) return hide();
  let session = null;
  try { session = (await supabase.auth.getSession())?.data?.session || null; } catch { /* treated as signed out */ }
  if (!session) return hide();
  let admin = false;
  try { admin = (await supabase.rpc('is_service_admin'))?.data === true; } catch { admin = false; }
  if (!admin) return hide();

  markPageAsPrivate(document);
  applyRememberedAccent(document.documentElement, window.localStorage);
  const language = supported(readLoginLanguage()) || supported(readLastUiLanguage()) || supported(detectSystemLanguage()) || 'zh-TW';
  await ensureLanguage(language).catch(() => {});
  const text = (key, values) => shareAdminText(language, key, values);
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
  const say = (message) => { main.replaceChildren(el(document, 'p', 'sp-loading', message)); };

  const STATUS = { active: 'statusActive', suspended: 'statusSuspended', conversation_deleted: 'statusDeleted', removed: 'statusRemoved' };
  async function draw() {
    let rows;
    try {
      const result = await supabase.rpc('admin_list_share_reports');
      if (result.error) throw result.error;
      rows = Array.isArray(result.data) ? result.data : [];
    } catch { say(text('failed')); return; }
    main.replaceChildren(el(document, 'h1', 'sp-title', text('title')));
    if (!rows.length) { main.appendChild(el(document, 'p', 'sp-loading', text('empty'))); return; }
    for (const row of rows) {
      const card = el(document, 'section', 'sp-admin-card');
      card.appendChild(el(document, 'h2', 'sp-admin-title', row.title || text('untitled')));
      const meta = el(document, 'p', 'sp-meta');
      meta.textContent = [`${text('mode')}: ${row.mode === 'continue' ? text('continue') : text('view')}`, text(STATUS[row.status] || 'statusActive'), text('readers', { n: row.readers }), text('reports', { n: row.total_reports }), `${text('owner')}: ${row.owner_email || row.owner_id}`].join(' · ');
      card.appendChild(meta);
      const reasons = Array.isArray(row.reasons) ? row.reasons : [];
      if (reasons.length) {
        card.appendChild(el(document, 'p', 'sp-note', text('reasons')));
        const list = el(document, 'ul', 'sp-admin-reasons');
        for (const reason of reasons) list.appendChild(el(document, 'li', null, reason));
        card.appendChild(list);
      }
      const actions = el(document, 'div', 'sp-report-row');
      const act = (label, run, { confirm = false, primary = false } = {}) => {
        const button = el(document, 'button', `sp-btn${primary ? ' is-primary' : ''}`, label);
        button.type = 'button';
        let armed = false;
        button.addEventListener('click', async () => {
          if (confirm && !armed) { armed = true; button.textContent = text('sure'); return; }
          button.disabled = true;
          try { const { error } = await run(); if (error) throw error; await draw(); } catch (error) { button.disabled = false; button.textContent = text(/content_gone/.test(String(error?.message || '')) ? 'contentGone' : 'failed'); }
        });
        actions.appendChild(button);
      };
      if (row.status === 'active' || row.status === 'suspended' || row.status === 'removed') {
        const open = el(document, 'a', 'sp-btn', text('open'));
        open.href = `/s/${row.code}?review=1`; open.target = '_blank'; open.rel = 'noopener noreferrer';
        actions.appendChild(open);
      }
      // A taken-down share keeps its content, hidden, until the takedown is taken back (the link works again and its owner is mailed) or the record is deleted.
      if (row.status === 'removed') act(text('restoreTakedown'), () => supabase.rpc('admin_restore_share', { p_id: row.share_id }), { primary: true, confirm: true });
      if (row.status === 'suspended') act(text('restore'), () => supabase.rpc('admin_set_share_status', { p_id: row.share_id, p_status: 'active' }), { primary: true });
      if (row.status === 'active') act(text('pause'), () => supabase.rpc('admin_set_share_status', { p_id: row.share_id, p_status: 'suspended' }));
      // Clearing the reports only means something for a share that still works (the decision was that it is fine): a paused one is restored, a taken-down one is only a record.
      if (row.status === 'active' && row.total_reports > 0) act(text('dismiss'), () => supabase.rpc('admin_dismiss_share_reports', { p_id: row.share_id }));
      if (row.status === 'active' || row.status === 'suspended') act(text('remove'), () => supabase.rpc('admin_remove_share', { p_id: row.share_id }), { confirm: true });
      else act(text('deleteRecord'), () => supabase.rpc('admin_delete_share', { p_id: row.share_id }), { confirm: true });
      card.appendChild(actions);
      main.appendChild(card);
    }
  }
  await draw();
  return { handled: true, admin: true };
}
