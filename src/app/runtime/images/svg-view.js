// The code of an SVG on its card (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §20): a button in the top-right corner switches the card between the picture and its code, and the code view
// can be copied and saved as a file. The code is the file itself (an SVG is text), so nothing is made: the stored picture is read as text. Loaded when the first SVG card is shown.

import { dataUrlToBlob, saveWithShareSheet } from './picture-blob.js';

let stylesLoaded = null;
const ensureStyles = () => (stylesLoaded ||= import('../../../styles/svg-view.css').catch(() => {}));

const CODE_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></svg>';
const PICTURE_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="9" cy="9" r="1.6"/><path d="m20.5 15.5-4.5-4.5L7 20"/></svg>';

/** The text of an SVG held as a data address, or ''. */
export async function svgTextOf(dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  return blob ? blob.text() : '';
}

/**
 * Adds the code button to `card` for the SVG whose address `getSource()` gives; `texts` has { code, picture, copy, copied, download }; `name()` is the file name for the download. Returns the button.
 */
export function attachSvgView({ document, card, getSource, texts, name = () => 'drawing.svg', navigator = globalThis.navigator }) {
  void ensureStyles();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'svg-view-btn';
  button.setAttribute('aria-label', texts.code);
  button.title = texts.code;
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = CODE_ICON;
  let view = null;
  const show = async () => {
    const text = await svgTextOf(await getSource());
    if (!text) return;
    view = document.createElement('div');
    view.className = 'svg-code-view';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = text;
    pre.appendChild(code);
    const actions = document.createElement('div');
    actions.className = 'svg-code-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = texts.copy;
    copy.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = texts.copied;
        setTimeout(() => { copy.textContent = texts.copy; }, 1500);
      } catch {
        // a place that refuses the clipboard: the text is selected so that it can be copied by hand
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = document.defaultView?.getSelection?.();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = texts.download;
    save.addEventListener('click', (event) => {
      event.stopPropagation();
      const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
      const file = name();
      // An iPhone ignores a download link: the file goes to the share sheet there (picture-blob.js).
      if (saveWithShareSheet({ blob, name: file, navigator, FileCtor: globalThis.File })) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    actions.append(copy, save);
    view.append(pre, actions);
    card.appendChild(view);
    card.classList.add('is-showing-code');
  };
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (view) {
      view.remove();
      view = null;
      card.classList.remove('is-showing-code');
    } else {
      await show();
    }
    const on = Boolean(view);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? texts.picture : texts.code);
    button.title = on ? texts.picture : texts.code;
    button.innerHTML = on ? PICTURE_ICON : CODE_ICON;
  });
  card.appendChild(button);
  return button;
}
