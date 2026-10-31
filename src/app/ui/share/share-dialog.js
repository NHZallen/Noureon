// The dialog that shares a conversation (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §5): the permission (read only / can continue), "show my name", a short notice, and the
// link once it is made, with copy, update and revoke. Drawn with textContent (the title of a conversation is the person's text); colours are the tokens (styles/share.css).

import { SHARE_MAX, shareUrl } from '../../runtime/share/share-client.js';

const addressOf = (document, code) => shareUrl(code, document.defaultView?.location?.origin || undefined);

const LIMIT_TEXT = '5 MB';
const LIMIT_FILES = '100 MB';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** The sentence for a failed call (`result` from share-client.js). */
export function failureText(text, result) {
  switch (result?.code) {
    case 'limit': return text('csErrLimit', { max: result.max || SHARE_MAX });
    case 'too_large': return text('csErrTooLarge', { what: result.what === 'files' ? text('csErrTooLargeFiles', { limit: LIMIT_FILES }) : text('csErrTooLargeText', { limit: LIMIT_TEXT }) });
    case 'gone': return text('csErrGone');
    case 'sign_in': return text('csErrSignIn');
    default: return text('csErrGeneric');
  }
}

/**
 * Opens the dialog for a conversation. `existing` is the share the conversation already has (the dialog then opens on its link). Resolves when it is closed.
 * deps: document, text(key, vars), client, state, conversation { id, title }, ownerName, existing, flush() (saves the conversation to the cloud first), copy(text) -> Promise<boolean>, notify(message, kind), confirm(message, title) -> Promise<boolean>
 */
export function openShareDialog({ document, text, client, state, conversation, ownerName = '', existing = null, flush = async () => {}, copy, notify = () => {}, confirm = async () => true }) {
  return new Promise((resolve) => {
    let share = existing;
    let busy = false;
    let mode = 'view';
    let showName = false;
    let message = '';
    let messageKind = '';

    const overlay = el(document, 'div', 'cs-overlay');
    const box = el(document, 'div', 'cs-box');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.appendChild(box);

    const close = () => {
      overlay.classList.remove('visible');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { overlay.remove(); if (!document.querySelector('.modal.visible')) document.body.classList.remove('modal-open'); }, 200);
      resolve(share);
    };
    const onKey = (event) => { if (event.key === 'Escape' && !busy) close(); };

    const setMessage = (value, kind = '') => { message = value; messageKind = kind; draw(); };

    async function create() {
      if (busy) return;
      busy = true; setMessage('', ''); 
      await flush();
      const result = await client.create({ conversationId: conversation.id, mode, showName, ownerName });
      busy = false;
      if (!result.ok) { setMessage(failureText(text, result), 'error'); return; }
      share = { id: result.share.id, conversationId: conversation.id, code: result.share.code, mode: result.share.mode, showName: result.share.showName, title: result.share.title || conversation.title, deleted: false, createdAt: result.share.createdAt, updatedAt: result.share.createdAt };
      state.upsert(share);
      setMessage(text('csReady'), 'ok');
    }
    async function update() {
      if (busy || !share) return;
      busy = true; draw();
      await flush();
      const result = await client.refresh(share.id);
      busy = false;
      if (!result.ok) { setMessage(failureText(text, result), 'error'); return; }
      share = { ...share, title: result.share.title || share.title, updatedAt: new Date().toISOString() };
      state.upsert(share);
      setMessage(text('csUpdated'), 'ok');
    }
    async function revoke() {
      if (busy || !share) return;
      if (!(await confirm(text('csRevokeConfirm', { title: share.title || conversation.title || text('csRowUntitled') }), text('csRevokeTitle')))) return;
      busy = true; draw();
      const result = await client.revoke(share.id);
      busy = false;
      if (!result.ok) { setMessage(failureText(text, result), 'error'); return; }
      state.remove(share.id);
      share = null;
      notify(text('csRevoked'), 'success');
      close();
    }
    async function copyLink() {
      if (!share) return;
      const ok = await copy(addressOf(document, share.code));
      notify(ok ? text('csCopied') : text('csErrGeneric'), ok ? 'success' : 'error');
    }

    function option(value, label, description) {
      const row = el(document, 'label', `cs-option${mode === value ? ' is-on' : ''}`);
      const input = el(document, 'input');
      input.type = 'radio';
      input.name = 'cs-mode';
      input.checked = mode === value;
      input.addEventListener('change', () => { mode = value; draw(); });
      const copyBox = el(document, 'span', 'cs-option-text');
      copyBox.append(el(document, 'span', 'cs-option-label', label), el(document, 'span', 'cs-option-desc', description));
      row.append(input, copyBox);
      return row;
    }

    function draw() {
      box.replaceChildren();
      const head = el(document, 'div', 'cs-head');
      head.append(el(document, 'h2', 'cs-title', text('csTitle')));
      const x = el(document, 'button', 'cs-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', text('csClose'));
      x.addEventListener('click', () => { if (!busy) close(); });
      head.appendChild(x);
      const body = el(document, 'div', 'cs-body');
      body.appendChild(el(document, 'p', 'cs-conv', conversation.title || text('csRowUntitled')));

      if (!share) {
        body.appendChild(el(document, 'p', 'cs-label', text('csModeLabel')));
        const options = el(document, 'div', 'cs-options');
        options.append(option('view', text('csModeView'), text('csModeViewDesc')), option('continue', text('csModeContinue'), text('csModeContinueDesc')));
        body.appendChild(options);
        const nameRow = el(document, 'label', 'cs-check');
        const box1 = el(document, 'input');
        box1.type = 'checkbox';
        box1.checked = showName;
        box1.addEventListener('change', () => { showName = box1.checked; });
        const nameText = el(document, 'span', 'cs-option-text');
        nameText.append(el(document, 'span', 'cs-option-label', text('csShowName')), el(document, 'span', 'cs-option-desc', text('csShowNameDesc', { name: ownerName || '…' })));
        nameRow.append(box1, nameText);
        body.appendChild(nameRow);
      } else {
        const modeLine = el(document, 'p', 'cs-mode-line');
        modeLine.append(el(document, 'span', 'cs-pill', share.mode === 'continue' ? text('csModeContinue') : text('csModeView')));
        body.appendChild(modeLine);
        const linkRow = el(document, 'div', 'cs-link');
        const input = el(document, 'input');
        input.type = 'text';
        input.readOnly = true;
        input.value = addressOf(document, share.code);
        input.addEventListener('focus', () => input.select());
        const copyBtn = el(document, 'button', 'cs-btn', text('csCopy'));
        copyBtn.type = 'button';
        copyBtn.addEventListener('click', copyLink);
        linkRow.append(input, copyBtn);
        body.appendChild(linkRow);
      }
      body.appendChild(el(document, 'p', 'cs-notice', text('csNotice')));
      if (message) body.appendChild(el(document, 'p', `cs-message${messageKind === 'error' ? ' is-error' : ''}`, message));

      const foot = el(document, 'div', 'cs-foot');
      if (!share) {
        const make = el(document, 'button', 'cs-btn is-primary', busy ? text('csCreating') : text('csCreate'));
        make.type = 'button';
        make.disabled = busy;
        make.addEventListener('click', create);
        foot.appendChild(make);
      } else {
        const stop = el(document, 'button', 'cs-btn is-danger', text('csRevoke'));
        stop.type = 'button';
        stop.disabled = busy;
        stop.addEventListener('click', revoke);
        const refresh = el(document, 'button', 'cs-btn', busy ? text('csUpdating') : text('csUpdate'));
        refresh.type = 'button';
        refresh.disabled = busy;
        refresh.addEventListener('click', update);
        const done = el(document, 'button', 'cs-btn is-primary', text('csClose'));
        done.type = 'button';
        done.addEventListener('click', () => { if (!busy) close(); });
        foot.append(stop, refresh, done);
      }
      box.append(head, body, foot);
    }

    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !busy) close(); });
    document.addEventListener('keydown', onKey);
    draw();
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    (document.defaultView?.requestAnimationFrame?.bind(document.defaultView) || ((run) => setTimeout(run, 0)))(() => overlay.classList.add('visible'));
  });
}

