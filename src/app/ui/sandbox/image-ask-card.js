// The card that asks the person whether the text model may draw a picture (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md): shown in the
// step list when the model calls generate_image and the permission for pictures is "ask". The card says which picture model draws and the prompt the model
// wrote, and has three answers (allow once, always allow, refuse). When nobody answers, the server counts it as a refusal after ten minutes. A page that joins
// late is told the question again (and the answer, if there is one), so the card can be answered from any page. Everything shown comes from the model's call:
// it is put in as text, never as markup.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { referencesLine } from './picture-steps-view.js';
import { foldAnimated } from './fold-animation.js';

const RESULT_KEYS = Object.freeze({ not: 'imageNotThisDone', once: 'imageAnsweredOnce', always: 'imageAnsweredAlways', deny: 'imageRefused', timeout: 'imageTimedOut', cancel: 'imageStopped' });

/**
 * `host`: the element the cards go in; `onAnswer({ id, decision })` sends the person's answer (resolves { ok }). Returns { handle(event), waitingText, open } for the
 * events { type: 'image', event: 'ask' | 'answer', ... }.
 */
export function createImageAskCards({ document, host, language, onAnswer = async () => ({ ok: false }) }) {
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
    // The card folds up to its one line (the question, the pictures and the buttons go) instead of jumping.
    foldAnimated(card.node, () => {
      card.node.classList.add('is-resolved');
      card.node.classList.toggle('is-refused', decision !== 'once' && decision !== 'always');
      card.actions.remove();
      card.note.remove();
      card.prompt.remove();
      card.refs?.remove();
      card.title.textContent = text(RESULT_KEYS[String(decision).startsWith('not:') ? 'not' : decision] || RESULT_KEYS.timeout);
    });
  };

  const ask = ({ id, model, prompt, summary, references, waitMs }) => {
    if (!id || cards.has(id)) return;
    const node = make('div', 'net-ask image-ask');
    node.dataset.askId = id;
    node.setAttribute('role', 'group');
    const head = make('div', 'net-ask-head');
    const title = make('span', 'net-ask-title', text('imageAskTitle', { model: model?.name || model?.id || '' }));
    head.append(title);
    // What the person reads is the model's short summary in their language; the prompt the picture model gets (often in English, and long) is one tap away.
    const promptNode = make('div', 'image-ask-prompt');
    const said = String(summary || '').trim();
    if (said) {
      promptNode.append(make('p', 'image-ask-summary', said));
      const full = make('p', 'image-ask-full', String(prompt || ''));
      full.hidden = true;
      const toggle = make('button', 'image-pick-text-button image-ask-toggle', text('imagePromptShow'));
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        full.hidden = !full.hidden;
        toggle.setAttribute('aria-expanded', String(!full.hidden));
        toggle.textContent = text(full.hidden ? 'imagePromptShow' : 'imagePromptHide');
      });
      promptNode.append(toggle, full);
    } else {
      promptNode.classList.add('is-clamped');
      promptNode.textContent = String(prompt || '');
    }
    const actions = make('div', 'net-ask-actions image-ask-actions');
    const note = make('div', 'net-ask-note', text('imageAskWait', { minutes: Math.max(1, Math.round((Number(waitMs) || 600_000) / 60_000)) }));
    const card = { node, title, actions, note, prompt: promptNode, resolved: false };
    const buttons = [];
    const failure = make('div', 'net-ask-failed');
    failure.hidden = true;
    const send = async (decision) => {
      if (card.resolved) return;
      buttons.forEach((entry) => { entry.disabled = true; });
      failure.hidden = true;
      let sent = { ok: false };
      try {
        sent = await onAnswer({ id, decision });
      } catch {
        sent = { ok: false };
      }
      // The answer is shown when the server says it took it (the "answer" event, which every page gets); a failed send can be tried again.
      if (!sent?.ok && !card.resolved) {
        failure.textContent = text('imageAskFailed');
        failure.hidden = false;
        buttons.forEach((entry) => { entry.disabled = false; });
      }
    };
    // The pictures it starts from, each with "not this one".
    const refs = Array.isArray(references) && references.length ? referencesLine(document, references, language, (index, button) => { buttons.push(button); void send(`not:${index}`); }) : null;
    card.refs = refs;
    for (const [decision, key, primary] of [['once', 'imageAllowOnce', true], ['always', 'imageAllowAlways', false], ['deny', 'imageRefuse', false]]) {
      const button = make('button', `net-ask-button${primary ? ' is-primary btn-primary' : ''}`, text(key));
      button.type = 'button';
      button.addEventListener('click', () => { void send(decision); });
      buttons.push(button);
      actions.append(button);
    }
    node.append(head, promptNode, ...(refs ? [refs] : []), actions, note, failure);
    host.append(node);
    cards.set(id, card);
  };

  return {
    handle(event) {
      if (event.event === 'ask') ask(event);
      else if (event.event === 'answer') {
        const card = cards.get(event.id);
        if (card) resolve(card, event.answer);
      }
    },
    /** The line the step list shows while the question waits for the person. */
    waitingText: () => text('imageWaiting'),
    get open() { return [...cards.values()].filter((card) => !card.resolved).length; }
  };
}
