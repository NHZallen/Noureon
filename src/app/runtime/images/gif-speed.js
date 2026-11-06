// The playback speed of a GIF on a picture card and in the preview (a button in the top-right corner with a menu of speeds, as ChatGPT has it; docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §12 and §13). A browser
// plays a GIF at its own speed and cannot change it, so for a speed other than 1× the frames are read (gif-editor-frames.js) and shown one after the other at their own time divided by the speed; at 1× the GIF itself is
// put back. The picture that is downloaded or shared follows the speed too: the GIF with its frame times changed (gif-retime.js), made as soon as a speed is chosen so that the button can answer at once.

import { dataUrlToBlob } from './picture-blob.js';

export const SPEEDS = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]);
export const speedLabel = (speed) => `${speed}×`;

/** Opens the menu of speeds under (or over, when there is no room) `anchor`; `onPick(speed)` is called with the one chosen. Closes on a choice, a press outside, Escape. */
export function openSpeedMenu({ document, anchor, current = 1, label = '', onPick }) {
  document.querySelector('.gif-speed-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'gif-speed-menu';
  menu.setAttribute('role', 'menu');
  if (label) menu.setAttribute('aria-label', label);
  menu.innerHTML = SPEEDS.map((speed) => `<button type="button" role="menuitemradio" aria-checked="${speed === current}" data-speed="${speed}"><span>${speedLabel(speed)}</span><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></button>`).join('');
  document.body.appendChild(menu);
  const box = anchor.getBoundingClientRect();
  const view = document.defaultView;
  const room = view.innerHeight - box.bottom;
  const top = room >= menu.offsetHeight + 12 ? box.bottom + 6 : Math.max(8, box.top - menu.offsetHeight - 6);
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(8, Math.min(view.innerWidth - menu.offsetWidth - 8, box.right - menu.offsetWidth))}px`;
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onOutside = (event) => { if (!menu.contains(event.target)) { if (anchor.contains(event.target)) event.stopPropagation(); close(); } };
  const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-speed]');
    if (!item) return;
    event.stopPropagation();
    close();
    onPick(Number(item.dataset.speed));
  });
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  return menu;
}

/**
 * Adds the speed button to `host` for the GIF of `image` (an <img>); `getSource()` gives the GIF as a data address; `label` is the name of the button for a screen reader. `onRetimed(blob, speed)` is called with the
 * GIF written at the speed chosen (null at 1×: the original), so that a download or a share can use it. Returns the button.
 */
export function attachGifSpeed({ document, host, image, getSource, label, onRetimed = () => {} }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gif-speed-btn';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'menu');
  button.title = label;
  button.textContent = speedLabel(1);
  let speed = 1;
  let frames = null;
  let timer = null;
  let original = '';
  let token = 0;
  const choose = async (next) => {
    speed = next;
    button.textContent = speedLabel(speed);
    const mine = ++token;
    clearTimeout(timer);
    if (speed === 1) {
      if (original) image.src = original;
      onRetimed(null, 1);
      return;
    }
    if (!original) original = image.src;
    const source = await getSource();
    if (mine !== token) return;
    const blob = source ? dataUrlToBlob(source) : null;
    if (blob) {
      const { retimeGif } = await import('./gif-retime.js');
      const bytes = retimeGif(new Uint8Array(await blob.arrayBuffer()), speed);
      if (mine === token) onRetimed(new Blob([bytes], { type: 'image/gif' }), speed);
    }
    if (!frames) {
      const { loadGifFrames } = await import('./gif-editor-frames.js');
      frames = source ? await loadGifFrames({ document, dataUrl: source }) : null;
    }
    if (!frames || mine !== token) return;
    let at = 0;
    const step = () => {
      if (mine !== token || !image.isConnected) return;
      image.src = frames.frames[at].dataUrl;
      const wait = Math.max(20, (frames.frames[at].delayMs || 100) / speed);
      at = (at + 1) % frames.frames.length;
      timer = setTimeout(step, wait);
    };
    step();
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    openSpeedMenu({ document, anchor: button, current: speed, label, onPick: choose });
  });
  host.appendChild(button);
  return button;
}
