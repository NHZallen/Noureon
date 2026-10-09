// The quiz cards in the chat (docs/superpowers/specs/2026-10-09-quiz-card-design.md): the markdown makes a placeholder for each ```quiz block (markdown-rendering-helpers.js), and this
// makes the card when the placeholder is on the page. The card, its words and its styles are loaded the first time one is needed, so a page without a quiz never loads them.
// What a person answers is kept on the message (quiz-store.js).

import { createQuizStores } from './quiz-store.js';

const RETRY_MS = 80;
const RETRIES = 6;

export function createQuizWatch({ document, getUiLanguage = () => 'en', getActiveConversation = () => null, saveAppData = async () => {}, logger = console }) {
  const win = document?.defaultView;
  let card = null;
  let storeFor = null;
  let retries = 0;
  const hydrate = async () => {
    if (!document?.querySelector?.('.quiz-card[data-quiz]:not([data-ready])')) return;
    try {
      card ||= await Promise.all([import('../../ui/quiz/quiz-card.js'), import('../../ui/quiz/quiz-card.css').catch(() => {})]);
      storeFor ||= createQuizStores({ memory: card[0].memoryStore, getActiveConversation, saveAppData, logger });
      card[0].hydrateQuizCards({ root: document, language: getUiLanguage(), storeFor });
      // A card whose message is not on the page yet (the chat is still being drawn) is tried again a few times.
      const waiting = [...document.querySelectorAll('.quiz-card[data-quiz]:not([data-ready])')].some((element) => !element.classList.contains('is-preparing') && element.closest('[data-message-index]'));
      if (waiting && retries < RETRIES) {
        retries += 1;
        (win?.setTimeout || setTimeout).call(win, () => { void hydrate(); }, RETRY_MS);
      } else if (!waiting) {
        retries = 0;
      }
    } catch (error) {
      logger?.warn?.('Showing a quiz failed.', error);
    }
  };
  if (typeof win?.MutationObserver === 'function' && document.body) {
    let queued = false;
    new win.MutationObserver(() => {
      if (queued) return;
      queued = true;
      (win.requestAnimationFrame || win.setTimeout).call(win, () => { queued = false; void hydrate(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  return { hydrate };
}
