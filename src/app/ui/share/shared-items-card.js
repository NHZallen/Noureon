// The card "Shared items" of the Data tab of the settings: every share of the person with its address, the name of the conversation, the permission it was made with, the date, and the buttons to
// copy or revoke it; a share whose conversation was deleted stays as a record ("This conversation was deleted") that can be removed. Only for a signed-in cloud account; read again each time the
// settings are opened. Drawn with textContent (the title is the person's text).

import { SHARE_MAX, shareUrl } from '../../runtime/share/share-client.js';

const addressOf = (document, code) => shareUrl(code, document.defaultView?.location?.origin || undefined);

const CARD_ID = 'shared-items-block';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const dateText = (value, language) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try { return date.toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return date.toISOString().slice(0, 10); }
};

export function ensureSharedItemsCard({ document, config, elements, state, client, text, reload, cloudOn, copy, notify, confirm }) {
  const section = document.getElementById('data-management-section');
  if (!section || typeof section.appendChild !== 'function') return;
  let block = document.getElementById(CARD_ID);
  if (!block) {
    const cards = section.querySelector?.('.pz');
    block = el(document, 'div', cards ? 'pz-card' : 'mt-6');
    block.id = CARD_ID;
    const danger = cards?.querySelector?.('.pz-danger');
    if (danger) cards.insertBefore(block, danger);
    else (cards || section).appendChild(block);
  }
  if (typeof block.replaceChildren !== 'function') return;
  let failed = false;

  const draw = () => {
    block.replaceChildren();
    const enabled = cloudOn();
    block.classList?.toggle?.('hidden', !enabled);
    if (!enabled) return;
    const withCard = block.classList.contains('pz-card');
    const head = el(document, 'div', withCard ? 'pz-head' : 'mb-2');
    const title = el(document, 'h3', withCard ? null : 'text-lg font-semibold', text('csCardTitle'));
    title.appendChild(el(document, 'span', 'cs-count', `${state.active().length}/${SHARE_MAX}`));
    head.appendChild(title);
    const body = el(document, 'div', withCard ? 'pz-block' : '');
    body.appendChild(el(document, 'p', 'cs-card-desc', text('csCardDesc')));
    const list = el(document, 'div', 'cs-list');
    if (!state.isLoaded()) {
      list.appendChild(el(document, 'p', 'cs-card-desc', failed ? text('csCardFailed') : text('csCardLoading')));
    } else if (state.all().length === 0) {
      list.appendChild(el(document, 'p', 'cs-card-desc', text('csCardEmpty')));
    }
    for (const item of state.isLoaded() ? state.all() : []) {
      const gone = item.deleted || item.suspended;
      const row = el(document, 'div', `cs-item${gone ? ' is-gone' : ''}`);
      const main = el(document, 'div', 'cs-item-main');
      main.appendChild(el(document, 'span', 'cs-item-title', item.title || text('csRowUntitled')));
      main.appendChild(el(document, 'span', 'cs-item-url', addressOf(document, item.code)));
      const meta = el(document, 'span', 'cs-item-meta');
      meta.append(el(document, 'span', 'cs-pill', item.mode === 'continue' ? text('csModeContinue') : text('csModeView')), el(document, 'span', null, dateText(item.createdAt, config?.uiLanguage)));
      if (item.deleted) meta.appendChild(el(document, 'span', 'cs-item-note', text('csRowDeleted')));
      else if (item.suspended) meta.appendChild(el(document, 'span', 'cs-item-note', text('csRowSuspended')));
      main.appendChild(meta);
      const actions = el(document, 'div', 'cs-item-actions');
      if (!gone) {
        const copyBtn = el(document, 'button', 'cs-btn', text('csRowCopy'));
        copyBtn.type = 'button';
        copyBtn.addEventListener('click', async () => { const ok = await copy(addressOf(document, item.code)); notify(ok ? text('csCopied') : text('csErrGeneric'), ok ? 'success' : 'error'); });
        actions.appendChild(copyBtn);
      }
      const drop = el(document, 'button', `cs-btn${item.deleted ? '' : ' is-danger-text'}`, item.deleted ? text('csRowRemove') : text('csRowRevoke'));
      drop.type = 'button';
      drop.addEventListener('click', async () => {
        if (!item.deleted && !(await confirm(text('csRevokeConfirm', { title: item.title || text('csRowUntitled') }), text('csRevokeTitle')))) return;
        drop.disabled = true;
        const result = await client.revoke(item.id);
        if (result.ok) { state.remove(item.id); if (!item.deleted) notify(text('csRevoked'), 'success'); } else { drop.disabled = false; notify(text('csErrGeneric'), 'error'); }
      });
      actions.appendChild(drop);
      row.append(main, actions);
      list.appendChild(row);
    }
    body.appendChild(list);
    block.append(head, body);
  };

  draw();
  // The card stays in the page between openings: only the latest drawing listens.
  block.sharedItemsOff?.();
  block.sharedItemsOff = state.onChange(draw);
  if (cloudOn()) {
    void Promise.resolve(reload()).then((result) => { failed = result?.ok === false; draw(); }).catch(() => { failed = true; draw(); });
  }
  const languageSelect = elements?.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageSelect.dataset?.sharedItemsBound) {
    if (languageSelect.dataset) languageSelect.dataset.sharedItemsBound = '1';
    languageSelect.addEventListener('change', () => draw());
  }
}
