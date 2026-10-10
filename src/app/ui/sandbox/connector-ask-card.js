// The card that asks the person whether a tool of a connector may run (docs/superpowers/specs/2026-10-10-mcp-connectors-design.md, §5.5): shown in the step list at the
// moment the model calls a tool the person set to "ask". It is a compact row: the connector's mark, the connector and the tool, the first values of the inputs, a
// link that opens every input, and three answers (allow once, always allow, refuse). "Always" is kept by the server as the person's setting for that tool. When nobody
// answers, the server counts it as a refusal after ten minutes, and the card says so. A page that joins late is told the question again (and the answer, if there is one),
// so the card can be answered from any page. Everything shown comes from the model's call: it is put in as text, never as markup.

import { connectorText } from '../../runtime/connector/connector-texts.js';

const RESULT_KEYS = Object.freeze({ once: 'connectorAnsweredOnce', always: 'connectorAnsweredAlways', deny: 'connectorAnsweredDeny', timeout: 'connectorAnsweredTimeout', cancel: 'connectorAnsweredDeny' });
const SUMMARY_VALUES = 3;
const SUMMARY_CHARS = 40;

/** The first few plain values of the inputs (as a line), from the inputs' JSON text: "noureon-web · main · production". */
export function argumentSummary(argsText) {
  let parsed = null;
  try {
    parsed = JSON.parse(argsText);
  } catch {
    return '';
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
  return Object.values(parsed)
    .filter((value) => ['string', 'number', 'boolean'].includes(typeof value) && String(value).trim() !== '')
    .slice(0, SUMMARY_VALUES)
    .map((value) => {
      const text = String(value).replace(/\s+/g, ' ').trim();
      return text.length > SUMMARY_CHARS ? `${text.slice(0, SUMMARY_CHARS - 1)}…` : text;
    })
    .join(' · ');
}

/**
 * `host`: the element the cards go in; `onAnswer({ id, decision })` sends the person's answer (resolves { ok }). Returns { handle(event), open } for the events
 * { type: 'connector', event: 'ask' | 'answer', ... }.
 */
export function createConnectorAskCards({ document, host, language, onAnswer = async () => ({ ok: false }) }) {
  const text = (key, values) => connectorText(language, key, values);
  const cards = new Map();
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const label = (connector, tool) => ({ connector: connector?.name || '', tool });

  const resolve = (card, decision) => {
    if (card.resolved) return;
    card.resolved = true;
    card.node.classList.add('is-resolved');
    card.node.classList.toggle('is-refused', decision !== 'once' && decision !== 'always');
    card.actions.remove();
    card.note.remove();
    card.detail?.remove();
    card.summary?.remove();
    card.title.textContent = text(RESULT_KEYS[decision] || RESULT_KEYS.timeout, label(card.connector, card.tool));
  };

  const ask = ({ id, connector, tool, args, argsCut, waitMs }) => {
    if (!id || cards.has(id)) return;
    const node = make('div', 'net-ask connector-ask');
    node.dataset.askId = id;
    node.setAttribute('role', 'group');
    const head = make('div', 'net-ask-head');
    const mark = make('span', 'connector-ask-mark', String(connector?.name || '?').trim().slice(0, 1).toUpperCase());
    mark.setAttribute('aria-hidden', 'true');
    const title = make('span', 'net-ask-title', text('connectorAskTitle', label(connector, tool)));
    head.append(mark, title);
    const argsText = String(args || '');
    const shown = argumentSummary(argsText);
    const summary = make('div', 'connector-ask-summary');
    if (shown) summary.append(make('span', 'connector-ask-values', shown));
    // Every input, as the model gave them: a person reads what they allow.
    const detail = make('pre', 'connector-ask-detail', `${argsText}${argsCut ? '\n…' : ''}`);
    detail.hidden = true;
    const toggle = make('button', 'connector-ask-toggle', text('connectorAskParams'));
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      toggle.setAttribute('aria-expanded', String(!detail.hidden));
      toggle.textContent = text(detail.hidden ? 'connectorAskParams' : 'connectorAskHideParams');
    });
    summary.append(toggle);
    const actions = make('div', 'net-ask-actions connector-ask-actions');
    const note = make('div', 'net-ask-note', text('connectorAskWait', { minutes: Math.max(1, Math.round((Number(waitMs) || 600_000) / 60_000)) }));
    const card = { node, title, actions, note, detail, summary, connector, tool, resolved: false };
    const buttons = [];
    const failure = make('div', 'net-ask-failed');
    failure.hidden = true;
    for (const [decision, key, primary] of [['once', 'connectorAskOnce', true], ['always', 'connectorAskAlways', false], ['deny', 'connectorAskDeny', false]]) {
      const button = make('button', `net-ask-button${primary ? ' is-primary btn-primary' : ''}`, text(key));
      button.type = 'button';
      button.addEventListener('click', async () => {
        if (card.resolved) return;
        buttons.forEach((entry) => { entry.disabled = true; });
        failure.hidden = true;
        let sent = { ok: false };
        try {
          sent = await onAnswer({ id, decision });
        } catch {
          sent = { ok: false };
        }
        // The answer is shown when the server says it took it (the "answer" event), which every page gets; a failed send can be tried again.
        if (!sent?.ok && !card.resolved) {
          failure.textContent = text('connectorAskFailed');
          failure.hidden = false;
          buttons.forEach((entry) => { entry.disabled = false; });
        }
      });
      buttons.push(button);
      actions.append(button);
    }
    node.append(head, summary, detail, actions, note, failure);
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
    /** The line the step list shows while the question waits for the person. */
    waitingText: (event) => text('connectorWaiting', { connector: event.connector?.name || '', tool: event.tool || '' }),
    get open() { return [...cards.values()].filter((card) => !card.resolved).length; }
  };
}
