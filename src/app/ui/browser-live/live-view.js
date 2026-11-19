// The screen of the browser agent: the live picture of the browser, and over it the glass circle that shows where the model looks or where the person
// points (design sections 6 and 16). The picture comes from a source (the stream of the real browser, or a fake one in the tests); the view does not know
// how it is made. A source is an object with:
//   mount(element)              draws the picture in the element (it fills it);
//   mountLens(element)          draws a second copy of the same picture (for the inside of the glass circle);
//   input?: { pointer(x, y, kind), wheel(dx, dy, x, y), key(key, down), text(text) }   what the person does when they have taken over (x and y in 0 to 1);
//   destroy()                   lets the picture go.
// The circle is 13% of the width of the screen, so it grows and shrinks with the card and the focus mode alike. Inside it the picture around the point is
// magnified 1.6 times. It has no animation. When the person has taken over it is the same circle with a very faint touch of the accent colour.

import { cssRatio, DEFAULT_RATIO, ratioOf } from './ratios.js';

export const LENS_ZOOM = 1.6;
export const LENS_SIZE = 0.13; // of the width of the screen

const GLIDE_MS = 300;
const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function createLiveView({ document, host, ratio = DEFAULT_RATIO, source = null }) {
  const root = document.createElement('div');
  root.className = 'bl-view';
  root.style.aspectRatio = cssRatio(ratio);
  // The ratio as a number too (width over height): a place that must fit the screen in the height it has works the width out from it.
  let ratioNumber = 0;
  const setNumber = (key) => { const { width, height } = ratioOf(key); ratioNumber = width / height; root.style.setProperty('--bl-ratio', String(ratioNumber)); };
  setNumber(ratio);
  const picture = document.createElement('div');
  picture.className = 'bl-picture';
  const lens = document.createElement('div');
  lens.className = 'bl-lens';
  lens.hidden = true;
  const glass = document.createElement('div');
  glass.className = 'bl-glass';
  // The inside of the circle is the picture itself, as big as the screen times the zoom, moved so that the point is in the middle.
  const inner = document.createElement('div');
  inner.className = 'bl-lens-in';
  glass.append(inner);
  lens.append(glass);
  // The last picture, kept while the stream comes back.
  const frozen = document.createElement('div');
  frozen.className = 'bl-frozen';
  frozen.hidden = true;
  const frozenPicture = document.createElement('img');
  frozenPicture.alt = '';
  const frozenNote = document.createElement('div');
  frozenNote.className = 'bl-frozen-note';
  frozen.append(frozenPicture, frozenNote);
  root.append(picture, frozen, lens);
  host.append(root);

  let current = null;
  let point = { x: 0.5, y: 0.5 };
  let by = 'model';
  let pressed = false;
  let lensMounted = false;
  let glideId = 0;
  const reducedMotion = () => Boolean(document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  // The inside is sized from the width of the screen in the page (the circle is 13% of it, the picture inside is the screen times 1.6).
  // Where the picture of the screen really is inside the view: a video that is not of the same shape as the view (the screen was just switched to another ratio, a view a little shorter than its ratio says) is
  // drawn smaller than the view with bars at the sides or over and under it, so a point of the screen (0 to 1) is a point of that picture, not of the view.
  const pictureBox = (width, height) => {
    const size = current?.videoSize?.();
    if (!size || !(size.width > 0 && size.height > 0) || !(width > 0 && height > 0)) return { x: 0, y: 0, w: width, h: height };
    const scale = Math.min(width / size.width, height / size.height);
    const w = size.width * scale;
    const h = size.height * scale;
    return { x: (width - w) / 2, y: (height - h) / 2, w, h };
  };
  const place = () => {
    const width = root.clientWidth || 0;
    const height = root.clientHeight || 0;
    const diameter = width * LENS_SIZE;
    const box = pictureBox(width, height);
    const whole = Math.abs(box.x) < 0.5 && Math.abs(box.y) < 0.5 && Math.abs(box.w - width) < 1 && Math.abs(box.h - height) < 1;
    // The point in pixels of the view (the circle is put there; the inside of it shows the same point in the middle).
    const px = box.x + point.x * box.w;
    const py = box.y + point.y * box.h;
    lens.style.left = whole ? `${point.x * 100}%` : `${px}px`;
    lens.style.top = whole ? `${point.y * 100}%` : `${py}px`;
    inner.style.width = `${width * LENS_ZOOM}px`;
    inner.style.height = `${height * LENS_ZOOM}px`;
    inner.style.transform = `translate(${diameter / 2 - px * LENS_ZOOM}px, ${diameter / 2 - py * LENS_ZOOM}px)`;
  };

  const attach = (next) => {
    current?.destroy?.();
    current = next;
    picture.replaceChildren();
    inner.replaceChildren();
    lensMounted = false;
    if (!current) return;
    current.mount(picture);
    // The picture changes its shape (a new ratio, the first frame): the circle is put again.
    current.onVideoResize?.(() => place());
    if (current.mountLens) {
      current.mountLens(inner);
      lensMounted = true;
    }
    place();
  };
  attach(source);

  return {
    get element() { return root; },
    get source() { return current; },
    get lensMounted() { return lensMounted; },
    get cursor() { return { ...point, by, pressed, visible: !lens.hidden }; },
    /** Puts a source (or none) under the circle. */
    setSource: attach,
    setRatio(key) {
      root.style.aspectRatio = cssRatio(key);
      setNumber(key);
      root.dataset.ratio = key;
      place();
    },
    /** The circle goes to a point of the screen (x and y in 0 to 1). `who`: 'model' or 'user'. */
    moveCursor(x, y, who = 'model', { glide = false } = {}) {
      const from = point;
      const wasShown = !lens.hidden && by === (who === 'user' ? 'user' : 'model');
      point = { x: clamp(x), y: clamp(y) };
      by = who === 'user' ? 'user' : 'model';
      lens.hidden = false;
      lens.classList.toggle('is-user', by === 'user');
      glideId += 1;
      if (!glide || !wasShown || reducedMotion() || (from.x === point.x && from.y === point.y)) { place(); return; }
      // The circle of the model slides to where it works (about 0.3 s, fast at the start); the person's circle follows the finger and never slides.
      const id = glideId;
      const to = point;
      const frame = (callback) => (document.defaultView?.requestAnimationFrame ? document.defaultView.requestAnimationFrame(callback) : setTimeout(() => callback(Date.now()), 16));
      let started = 0;
      const step = (now) => {
        if (id !== glideId) return;
        if (!started) started = now;
        const k = Math.min(1, (now - started) / GLIDE_MS);
        const e = 1 - (1 - k) ** 3;
        point = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
        place();
        if (k < 1) frame(step);
      };
      frame(step);
    },
    /** The click of the model: the circle shrinks a little and comes back (0.34 s). */
    pulse() {
      if (lens.hidden || reducedMotion() || typeof lens.animate !== 'function') return;
      lens.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.82)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 340, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    },
    /** The finger or the button is down (the circle shrinks a little). */
    press(down) {
      pressed = Boolean(down);
      lens.classList.toggle('is-pressed', pressed);
    },
    /** Hides the circle; with `who` only when it is that one's (the person takes the browser over: the model's goes; they give it back: theirs goes). */
    hideCursor(who) {
      if (who && by !== who) return;
      glideId += 1;
      lens.hidden = true;
    },
    /**
     * Whether the picture on the screen is of the shape of the screen the browser has now. For a few seconds after the ratio is switched the stream still brings the old frames: a point
     * of the new screen is not a point of them, so neither the circle of the model nor the pointing of the person is taken for the old frames (true when the size is not known).
     */
    pictureReady() {
      const size = current?.videoSize?.();
      if (!size || !(size.width > 0 && size.height > 0) || !ratioNumber) return true;
      return Math.abs(size.width / size.height - ratioNumber) / ratioNumber < 0.02;
    },
    /** Shows a picture over the stream (the last frame), with a few words ("Reconnecting…"), until `thaw`. */
    freeze(url, note = '') {
      if (url) frozenPicture.src = url; else frozenPicture.removeAttribute('src');
      frozenPicture.hidden = !url;
      frozenNote.textContent = note;
      frozen.hidden = false;
    },
    thaw() {
      frozen.hidden = true;
      frozenPicture.removeAttribute('src');
    },
    get frozen() { return !frozen.hidden; },
    /** A point of the screen (0 to 1 each way) for a point of the window (client pixels): where the person pointed at the picture, bars at its sides left out. */
    pointFromClient(clientX, clientY) {
      const rect = root.getBoundingClientRect();
      const box = pictureBox(rect.width, rect.height);
      const unit = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
      return { x: box.w ? unit((clientX - rect.left - box.x) / box.w) : 0, y: box.h ? unit((clientY - rect.top - box.y) / box.h) : 0 };
    },
    /** The size of the screen changed (the card was drawn in a place of another size). */
    refresh: place,
    destroy() {
      current?.destroy?.();
      current = null;
      root.remove();
    }
  };
}
