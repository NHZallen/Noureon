// The small card that asks the person which picture they mean (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md, §2-10): the text model is not sure
// and asks with choose_image. One thing at a time, the question in the model's own words, its candidates as small pictures with their number; a tap on one is the
// answer (no button to confirm). "重找" says none is right. Once answered the card folds into one line (the picture and what was used) with "改" to choose again,
// while the reply goes on. Everything shown comes from the model's call and is put in as text; the small pictures are data from the server of the person's own pictures.

import { foldAnimated } from './fold-animation.js';
import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { setPictureNumber } from '../files/picture-number.js';

const dataUrl = (thumb) => (thumb?.data && /^image\/(png|jpeg|webp|gif)$/.test(thumb.mimeType || '') ? `data:${thumb.mimeType};base64,${thumb.data}` : '');

/**
 * `host`: where the cards go; `onPicked(ref)` is told which picture was chosen; `onAnswer({ id, decision })` sends the answer ('pick:N', 'retry', or 'redo' to change a pick) and resolves { ok, answered }.
 * Returns { handle(event), waitingText, open } for the events { type: 'image', kind: 'pick', event: 'ask' | 'answer', ... }.
 */
export function createImagePickCards({ document, host, language, onAnswer = async () => ({ ok: false }), onPicked = () => {} }) {
  const text = (key, values) => sandboxText(language, key, values);
  const cards = new Map();
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  const picture = (candidate, className) => {
    const node = make('span', className);
    const src = dataUrl(candidate.thumb);
    if (src) {
      const image = document.createElement('img');
      image.src = src;
      image.alt = '';
      node.append(image);
    } else {
      node.classList.add('has-no-picture');
    }
    setPictureNumber(document, node, candidate.number);
    return node;
  };

  // The line a card folds into: the picture used and "改" (change); or the plain words when nothing was chosen.
  const fold = (card, answer) => {
    if (card.resolved) return;
    card.resolved = true;
    const chosen = /^pick:(\d+)$/.exec(answer || '') ? card.candidates[Number(answer.slice(5))] : null;
    if (chosen) onPicked({ round: chosen.round, source: chosen.source, number: chosen.number });
    const line = make('div', 'image-picked-line');
    if (chosen) {
      line.append(make('span', 'image-picked-text', text('imagePicked', { number: chosen.number })), picture(chosen, 'image-picked-mini'));
      const change = make('button', 'image-pick-text-button', text('imageChange'));
      change.type = 'button';
      change.addEventListener('click', async () => {
        change.disabled = true;
        let sent = { ok: false };
        try {
          sent = await onAnswer({ id: card.id, decision: 'redo' });
        } catch {
          sent = { ok: false };
        }
        if (sent?.ok && sent.answered !== false) {
          change.textContent = text('imageChanging');
        } else {
          // The reply is over (or the question is gone): there is nothing left to change.
          change.remove();
        }
      });
      line.append(change);
    } else {
      line.append(make('span', 'image-picked-text', text(answer === 'retry' ? 'imageRetried' : answer === 'timeout' ? 'imageTimedOut' : 'imageStopped')));
    }
    foldAnimated(card.node, () => {
      card.node.className = `net-ask image-pick is-resolved${chosen ? ' is-picked' : ' is-refused'}`;
      card.node.replaceChildren(line);
    });
  };

  const ask = ({ id, title, step, of, candidates }) => {
    if (!id || cards.has(id)) return;
    const list = Array.isArray(candidates) ? candidates : [];
    const node = make('div', 'net-ask image-pick');
    node.dataset.askId = id;
    node.setAttribute('role', 'group');
    const head = make('div', 'net-ask-head image-pick-head');
    head.append(make('span', 'net-ask-title', String(title || '')));
    if (step && of) head.append(make('span', 'image-pick-count', `${step}/${of}`));
    const row = make('div', 'image-pick-row');
    const card = { id, node, candidates: list, resolved: false };
    const failure = make('div', 'net-ask-failed');
    failure.hidden = true;
    const buttons = [];
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
      // The card folds when the server says it took the answer (the "answer" event, which every page gets); a failed send can be tried again.
      if (!sent?.ok && !card.resolved) {
        failure.textContent = text('imageAskFailed');
        failure.hidden = false;
        buttons.forEach((entry) => { entry.disabled = false; });
      }
    };
    list.forEach((candidate, index) => {
      const button = make('button', 'image-pick-cand');
      button.type = 'button';
      button.setAttribute('aria-label', text('imagePickAria', { round: candidate.round, number: candidate.number }));
      button.title = String(candidate.caption || '');
      button.append(picture(candidate, 'image-pick-pic'));
      button.addEventListener('click', () => {
        button.classList.add('is-chosen');
        row.classList.add('has-chosen');
        void send(`pick:${index}`);
      });
      buttons.push(button);
      row.append(button);
    });
    const foot = make('div', 'image-pick-foot');
    const retry = make('button', 'net-ask-button', text('imageRetry'));
    retry.type = 'button';
    retry.addEventListener('click', () => { void send('retry'); });
    buttons.push(retry);
    foot.append(retry);
    node.append(head, row, foot, failure);
    host.append(node);
    cards.set(id, card);
  };

  return {
    handle(event) {
      if (event.event === 'ask') ask(event);
      else if (event.event === 'answer') {
        const card = cards.get(event.id);
        if (card) fold(card, event.answer);
      }
    },
    waitingText: () => text('imagePickWaiting'),
    get open() { return [...cards.values()].filter((card) => !card.resolved).length; }
  };
}
