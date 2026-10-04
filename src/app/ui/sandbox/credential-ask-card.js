// The card for the login a CLI tool needs (the window itself is ui/cli/credential-modal.js): a small card in the step list, in the manner of the
// secure-entry cards of ChatGPT and Claude (a lock, the tool and its site, one button). The window opens only when the person taps the button, so
// nothing jumps up over what they are reading; "not now" says no. A page that joins late is told the question again (and the answer, if there is
// one), so it can be answered from any page. Without an answer the reply counts it as not provided after ten minutes, and the card says so.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { openCredentialModal } from '../cli/credential-modal.js';

const LOCK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11"/></svg>';
const RESULT_KEYS = Object.freeze({ saved: 'credAnsweredSaved', cancel: 'credAnsweredCancel', timeout: 'credAnsweredTimeout' });

/**
 * `host`: the element the cards go in; `onAnswer({ id, decision, values })` sends the answer (resolves { ok, reason? }; the values are saved first, see
 * runtime/cli/credential-answer.js). Returns { handle(event) } for the events { type: 'credential', event: 'ask' | 'answer', ... }.
 */
export function createCredentialAskCards({ document, host, language, onAnswer = async () => ({ ok: false }), openModal = openCredentialModal }) {
  const text = (key, values) => sandboxText(language, key, values);
  const cards = new Map();
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  const resolve = (card, decision) => {
    if (card.resolved) return;
    card.resolved = true;
    card.modal?.close();
    card.node.classList.add('is-resolved');
    card.node.classList.toggle('is-refused', decision !== 'saved');
    card.actions.remove();
    card.note.remove();
    card.sub.remove();
    card.title.textContent = text(RESULT_KEYS[decision] || RESULT_KEYS.timeout, { tool: card.tool.name });
  };

  const ask = ({ id, tool, fields, waitMs }) => {
    if (!id || cards.has(id) || !tool) return;
    const node = make('div', 'cred-ask');
    node.dataset.askId = id;
    node.setAttribute('role', 'group');
    const head = make('div', 'cred-ask-head');
    const icon = make('span', 'cred-ask-icon');
    icon.innerHTML = LOCK;
    const texts = make('div', 'cred-ask-texts');
    const title = make('div', 'cred-ask-title', text('credAskTitle', { tool: tool.name }));
    const site = (Array.isArray(fields) ? fields : []).find((field) => field.site)?.site || '';
    const sub = make('div', 'cred-ask-sub', site ? text('credAskSite', { site }) : tool.name);
    texts.append(title, sub);
    head.append(icon, texts);
    const actions = make('div', 'cred-ask-actions');
    const note = make('div', 'cred-ask-note', text('credAskWait', { minutes: Math.max(1, Math.round((Number(waitMs) || 600_000) / 60_000)) }));
    const card = { node, title, sub, actions, note, tool, resolved: false, modal: null };
    const send = async (payload) => {
      try {
        return await onAnswer({ id, ...payload });
      } catch {
        return { ok: false };
      }
    };
    // The window is opened by the person (the button), and only one at a time.
    const open = () => {
      if (card.resolved || card.modal) return;
      card.modal = openModal({
        document,
        language,
        tool,
        fields: Array.isArray(fields) ? fields : [],
        // Saved: the card is settled by the "answer" event, which every page gets.
        onSubmit: (values) => send({ decision: 'saved', values }),
        onSkip: () => { card.modal = null; }
      });
    };
    const enter = make('button', 'cred-ask-button is-primary btn-primary', text('credAskEnter'));
    enter.type = 'button';
    enter.addEventListener('click', () => open());
    const skip = make('button', 'cred-ask-button', text('credAskSkip'));
    skip.type = 'button';
    skip.addEventListener('click', () => { card.modal?.close(); card.modal = null; void send({ decision: 'cancel' }); });
    actions.append(enter, skip);
    node.append(head, actions, note);
    host.append(node);
    cards.set(id, card);
  };

  return {
    handle(event) {
      if (event.event === 'ask') ask(event);
      else if (event.event === 'answer') {
        const card = cards.get(event.id);
        if (card) resolve(card, event.decision);
      }
    },
    get open() { return [...cards.values()].filter((card) => !card.resolved).length; }
  };
}
