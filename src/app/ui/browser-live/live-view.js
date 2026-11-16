// The screen of the browser agent: the live picture of the browser, and over it the glass circle that shows where the model looks or where the person
// points (design sections 6 and 16). The picture comes from a source (the stream of the real browser, or a fake one in the tests); the view does not know
// how it is made. A source is an object with:
//   mount(element)              draws the picture in the element (it fills it);
//   mountLens(element)          draws a second copy of the same picture (for the inside of the glass circle);
//   input?: { pointer(x, y, kind), wheel(dx, dy, x, y), key(key, down), text(text) }   what the person does when they have taken over (x and y in 0 to 1);
//   destroy()                   lets the picture go.
// The circle is 13% of the width of the screen, so it grows and shrinks with the card and the focus mode alike. Inside it the picture around the point is
// magnified 1.6 times. It has no animation. When the person has taken over it is the same circle with a very faint touch of the accent colour.

import { cssRatio, DEFAULT_RATIO } from './ratios.js';

export const LENS_ZOOM = 1.6;
export const LENS_SIZE = 0.13; // of the width of the screen

const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function createLiveView({ document, host, ratio = DEFAULT_RATIO, source = null }) {
  const root = document.createElement('div');
  root.className = 'bl-view';
  root.style.aspectRatio = cssRatio(ratio);
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
  root.append(picture, lens);
  host.append(root);

  let current = null;
  let point = { x: 0.5, y: 0.5 };
  let by = 'model';
  let pressed = false;
  let lensMounted = false;

  // The inside is sized from the width of the screen in the page (the circle is 13% of it, the picture inside is the screen times 1.6).
  const place = () => {
    const width = root.clientWidth || 0;
    const height = root.clientHeight || 0;
    const diameter = width * LENS_SIZE;
    lens.style.left = `${point.x * 100}%`;
    lens.style.top = `${point.y * 100}%`;
    inner.style.width = `${width * LENS_ZOOM}px`;
    inner.style.height = `${height * LENS_ZOOM}px`;
    inner.style.transform = `translate(${diameter / 2 - point.x * width * LENS_ZOOM}px, ${diameter / 2 - point.y * height * LENS_ZOOM}px)`;
  };

  const attach = (next) => {
    current?.destroy?.();
    current = next;
    picture.replaceChildren();
    inner.replaceChildren();
    lensMounted = false;
    if (!current) return;
    current.mount(picture);
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
      root.dataset.ratio = key;
      place();
    },
    /** The circle goes to a point of the screen (x and y in 0 to 1). `who`: 'model' or 'user'. */
    moveCursor(x, y, who = 'model') {
      point = { x: clamp(x), y: clamp(y) };
      by = who === 'user' ? 'user' : 'model';
      lens.hidden = false;
      lens.classList.toggle('is-user', by === 'user');
      place();
    },
    /** The finger or the button is down (the circle shrinks a little). */
    press(down) {
      pressed = Boolean(down);
      lens.classList.toggle('is-pressed', pressed);
    },
    hideCursor() {
      lens.hidden = true;
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
