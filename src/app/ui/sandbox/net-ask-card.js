// The card that asks the person whether a CLI tool may reach a site (docs/superpowers/specs/2026-10-04-cli-store-design.md, §2.4): shown in the
// step list at the moment the tool's command reaches for a site that has no rule. Three answers: allow this time, always allow, refuse. The
// "always" and the refusal become rules in the settings (the person can change them under Permissions). When nobody answers, the sandbox
// counts it as a refusal after ten minutes, and the card says so. A page that joins late is told the question again (and the answer, if there is
// one), so the card can be answered from any page.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';

const GLOBE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/></svg>';
const RESULT_KEYS = Object.freeze({ once: 'netAnsweredOnce', always: 'netAnsweredAlways', deny: 'netAnsweredDeny', timeout: 'netAnsweredTimeout' });

/**
 * `host`: the element the cards go in; `onAnswer({ id, decision, host })` sends the person's answer (resolves { ok }); `commandOf()` is the command the
 * tool is running now (shown under the question). Returns { handle(event) } for the events { type: 'net', event: 'ask' | 'answer', ... }.
 */
export function createNetAskCards({ document, host, language, onAnswer = async () => ({ ok: false }), commandOf = () => '' }) {
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
    card.node.classList.add('is-resolved');
    card.node.classList.toggle('is-refused', decision === 'deny' || decision === 'timeout');
    card.actions.remove();
    card.note.remove();
    card.node.querySelector('.net-ask-command')?.remove();
    card.title.textContent = text(RESULT_KEYS[decision] || RESULT_KEYS.timeout, { host: card.host });
  };

  const ask = ({ id, host: site, port, waitMs }) => {
    if (!id || cards.has(id)) return;
    const node = make('div', 'net-ask');
    node.dataset.askId = id;
    node.setAttribute('role', 'group');
    const head = make('div', 'net-ask-head');
    const icon = make('span', 'net-ask-icon');
    icon.innerHTML = GLOBE;
    const title = make('span', 'net-ask-title', text('netAskTitle', { host: site }));
    head.append(icon, title);
    const command = String(commandOf() || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const sub = command ? make('div', 'net-ask-command', command) : null;
    const actions = make('div', 'net-ask-actions');
    const note = make('div', 'net-ask-note', text('netAskWait', { minutes: Math.max(1, Math.round((Number(waitMs) || 600_000) / 60_000)) }));
    const card = { node, title, actions, note, host: site, port, resolved: false };
    const buttons = [];
    const failure = make('div', 'net-ask-failed');
    failure.hidden = true;
    for (const [decision, key, primary] of [['once', 'netAskOnce', true], ['always', 'netAskAlways', false], ['deny', 'netAskDeny', false]]) {
      const button = make('button', `net-ask-button${primary ? ' is-primary' : ''}`, text(key));
      button.type = 'button';
      button.addEventListener('click', async () => {
        if (card.resolved) return;
        buttons.forEach((entry) => { entry.disabled = true; });
        failure.hidden = true;
        let sent = { ok: false };
        try {
          sent = await onAnswer({ id, decision, host: site });
        } catch {
          sent = { ok: false };
        }
        // The answer is shown when the sandbox says it took it (the "answer" event), which every page gets; a failed send can be tried again.
        if (!sent?.ok && !card.resolved) {
          failure.textContent = text('netAskFailed');
          failure.hidden = false;
          buttons.forEach((entry) => { entry.disabled = false; });
        }
      });
      buttons.push(button);
      actions.append(button);
    }
    node.append(head, ...(sub ? [sub] : []), actions, note, failure);
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
