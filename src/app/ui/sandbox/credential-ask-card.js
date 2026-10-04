// The card in the step list for the login a CLI tool needs (the window itself is ui/cli/credential-modal.js): it opens the window when the question
// arrives (so the person does not have to find the card) and stays to open it again, or to say "not now". A page that joins late is told the
// question again (and the answer, if there is one), so it can be answered from any page. Without an answer the reply counts it as not provided
// after ten minutes, and the card says so.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { openCredentialModal } from '../cli/credential-modal.js';

const KEY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>';
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
    card.title.textContent = text(RESULT_KEYS[decision] || RESULT_KEYS.timeout, { tool: card.tool.name });
  };

  const ask = ({ id, tool, fields, waitMs }) => {
    if (!id || cards.has(id) || !tool) return;
    const node = make('div', 'net-ask cred-ask');
    node.dataset.askId = id;
    node.setAttribute('role', 'group');
    const head = make('div', 'net-ask-head');
    const icon = make('span', 'net-ask-icon');
    icon.innerHTML = KEY;
    const title = make('span', 'net-ask-title', text('credAskTitle', { tool: tool.name }));
    head.append(icon, title);
    const actions = make('div', 'net-ask-actions');
    const note = make('div', 'net-ask-note', text('credAskWait', { minutes: Math.max(1, Math.round((Number(waitMs) || 600_000) / 60_000)) }));
    const card = { node, title, actions, note, tool, resolved: false, modal: null };
    const send = async (payload) => {
      try {
        return await onAnswer({ id, ...payload });
      } catch {
        return { ok: false };
      }
    };
    const open = () => {
      if (card.resolved || card.modal) return;
      card.modal = openModal({
        document,
        language,
        tool,
        fields: Array.isArray(fields) ? fields : [],
        // Saved: the card is settled by the "answer" event, which every page gets.
        onSubmit: (values) => send({ decision: 'saved', values }),
        onSkip: () => { card.modal = null; void send({ decision: 'cancel' }); }
      });
    };
    const enter = make('button', 'net-ask-button is-primary', text('credAskEnter'));
    enter.type = 'button';
    enter.addEventListener('click', () => open());
    const skip = make('button', 'net-ask-button', text('credAskSkip'));
    skip.type = 'button';
    skip.addEventListener('click', () => { card.modal?.close(); card.modal = null; void send({ decision: 'cancel' }); });
    actions.append(enter, skip);
    node.append(head, actions, note);
    host.append(node);
    cards.set(id, card);
    open();
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
