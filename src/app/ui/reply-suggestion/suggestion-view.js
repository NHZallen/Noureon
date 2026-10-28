// The suggested reply in the message box (docs/superpowers/specs/2026-10-28-reply-suggestion-design.md): after the model has answered, the empty box shows one line in
// faint letters (what the person is likely to say next, "好，採用 A 方案"), with a small arrow right after it. The arrow (or Tab on a computer) puts the words in the box as
// real text: the person can change them or send them. Typing, or anything else in the box, makes it go away. It is only a view: what to suggest is decided elsewhere.
//
// The line sits over the box (it is not the box's placeholder: the placeholder is only hidden while the line is shown, and comes back with it gone).

export const SUGGESTION_ID = 'reply-suggestion';
const ARROW = '<svg class="rs-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>';
const CHEVRON = '<svg class="rs-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>';

const isEmpty = (editor) => !String(editor.value ?? editor.textContent ?? '').trim() && !editor.querySelector?.('[data-composer-token], [data-composer-chip]');

export function createReplySuggestionView({ document, form, editor, getLabel = () => 'Use this reply', onAccept = () => {} }) {
  let text = '';
  const element = document.createElement('div');
  element.id = SUGGESTION_ID;
  element.className = 'rs-ghost';
  element.hidden = true;
  element.innerHTML = `<span class="rs-text"></span><button type="button" class="rs-accept" data-no-press>${ARROW}${CHEVRON}<span class="rs-key" aria-hidden="true">Tab</span></button>`;
  form.append(element);
  const textElement = element.querySelector('.rs-text');
  const button = element.querySelector('.rs-accept');

  const sync = () => {
    const visible = Boolean(text) && isEmpty(editor);
    // `is-shown` is what fades it in and out; `hidden` only after it has faded (so it takes no room and is not read out).
    form.classList.toggle('has-suggestion', visible);
    if (visible) {
      element.hidden = false;
      element.getBoundingClientRect();
      element.classList.add('is-shown');
    } else {
      element.classList.remove('is-shown');
      element.hidden = true;
    }
  };

  const accept = () => {
    if (!text || !isEmpty(editor)) return false;
    const words = text;
    text = '';
    sync();
    editor.value = words;
    editor.focus?.();
    // The caret goes to the end, and the box is told that it has new words (its height, the send button).
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = document.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.dispatchEvent(new (document.defaultView.Event)('input', { bubbles: true }));
    onAccept(words);
    return true;
  };

  button.addEventListener('click', (event) => { event.preventDefault(); accept(); });
  // The box is not focused yet when the arrow is pressed: the press must not move the focus away from it.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  // Typing takes it away for good (it does not come back when the box is emptied again).
  editor.addEventListener('input', () => { if (!isEmpty(editor)) text = ''; sync(); });
  editor.addEventListener('keydown', (event) => {
    // Escape takes it away without a trace (it comes back with the next reply).
    if (event.key === 'Escape' && element.classList.contains('is-shown')) { text = ''; sync(); return; }
    if (event.key === 'Tab' && !event.shiftKey && !event.isComposing && element.classList.contains('is-shown') && accept()) event.preventDefault();
    // Right arrow in the empty box takes it too (as in Claude Code); with words in the box it moves the caret as always.
    if (event.key === 'ArrowRight' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing && element.classList.contains('is-shown') && accept()) event.preventDefault();
  });

  return {
    /** Shows `words` (an empty text takes the line away). */
    show(words) {
      text = String(words || '').replace(/\s+/g, ' ').trim();
      textElement.textContent = text;
      const label = getLabel();
      button.title = label;
      button.setAttribute('aria-label', `${label}: ${text}`);
      sync();
    },
    hide() { text = ''; sync(); },
    isShown: () => element.classList.contains('is-shown'),
    accept,
    element
  };
}
