// The quiz cards in the chat (docs/superpowers/specs/2026-10-09-quiz-card-design.md): the markdown makes a placeholder for each ```quiz block (markdown-rendering-helpers.js), and this
// makes the card when the placeholder is on the page. The card, its words and its styles are loaded the first time one is needed, so a page without a quiz never loads them.

export function createQuizWatch({ document, getUiLanguage = () => 'en', logger = console }) {
  const win = document?.defaultView;
  let card = null;
  const hydrate = async () => {
    if (!document?.querySelector?.('.quiz-card[data-quiz]:not([data-ready])')) return;
    try {
      card ||= await Promise.all([import('../../ui/quiz/quiz-card.js'), import('../../ui/quiz/quiz-card.css').catch(() => {})]);
      card[0].hydrateQuizCards({ root: document, language: getUiLanguage() });
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
