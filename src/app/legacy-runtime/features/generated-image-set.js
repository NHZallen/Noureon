// Several pictures made by one request (the count in the advanced settings) are shown as a set: one big picture with its own buttons, and a row
// of small pictures under it that marks which one is shown and brings another (it fades in over the first; nothing slides, and the big picture
// is not swiped). One picture stays as it always was. No colours here: the look is in styles/generated-image-set.css.

const escapeText = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

const itemText = (template, number, total) => (template
  ? String(template).replaceAll('{n}', String(number)).replaceAll('{total}', String(total))
  : `${number} / ${total}`);

/** The cards of a reply's pictures (HTML strings, as many as the assets): joined as they are for one picture, a set for several. `label` is the words with {n} and {total}. */
export function renderGeneratedImageSet({ cards = [], assets = [], label = '' } = {}) {
  if (cards.length < 2) return cards.join('');
  const thumbs = assets.map((asset, index) => {
    const text = escapeText(itemText(label, index + 1, assets.length));
    return `<button type="button" class="generated-image-thumb${index === 0 ? ' is-active' : ''}" data-generated-image-thumb="${index}" aria-label="${text}" aria-current="${index === 0}"><img data-generated-image-id="${escapeText(asset.id)}" alt="" loading="lazy"></button>`;
  }).join('');
  // Only the shown picture is reachable (inert); the others wait under it, transparent.
  const slides = cards.map((card, index) => `<div class="generated-image-slide${index === 0 ? ' is-active' : ''}"${index === 0 ? '' : ' inert aria-hidden="true"'}>${card}</div>`).join('');
  return `<div class="generated-image-set" data-generated-image-set><div class="generated-image-track" data-generated-image-track>${slides}</div><div class="generated-image-thumbs" data-generated-image-thumbs>${thumbs}</div></div>`;
}

const RING = 4; // px: room around the small pictures for the ring of the shown one (the same as the padding in the style sheet)
const onPhone = () => globalThis.matchMedia?.('(max-width: 640px)')?.matches === true;
// The edges the row may reach on a phone: the chat area (the screen, there).
const chatBounds = (set) => {
  const area = set.closest?.('#chat-container') || globalThis.document?.documentElement;
  const rect = area?.getBoundingClientRect?.();
  return rect && rect.width > 0 ? { left: rect.left, right: rect.right } : null;
};

/** On a phone the row of small pictures runs out to both edges of the screen (it starts in line with the big picture and slides out under the edge);
 *  elsewhere it keeps to the column. */
function fitStrip(set, strip, { isPhone, bounds }) {
  const edges = isPhone() ? bounds(set) : null;
  const box = set.getBoundingClientRect?.();
  if (!edges || !box || box.width === 0) {
    strip.style.marginLeft = '';
    strip.style.marginRight = '';
    strip.style.paddingLeft = '';
    strip.style.paddingRight = '';
    return;
  }
  const left = Math.max(0, Math.round(box.left - edges.left)) + RING;
  const right = Math.max(0, Math.round(edges.right - box.right)) + RING;
  strip.style.marginLeft = `-${left}px`;
  strip.style.marginRight = `-${right}px`;
  strip.style.paddingLeft = `${left}px`;
  strip.style.paddingRight = `${right}px`;
}

let resizeBound = false;
const refitAll = (options) => globalThis.document?.querySelectorAll?.('[data-generated-image-set]').forEach(set => {
  const strip = set.querySelector('[data-generated-image-thumbs]');
  if (strip) fitStrip(set, strip, options);
});

/** Makes the sets under `root` work: tapping a small picture (or the arrow keys on it) shows that picture, and the mark follows at once. */
export function bindGeneratedImageSets(root, { isPhone = onPhone, bounds = chatBounds } = {}) {
  if (!resizeBound && typeof globalThis.addEventListener === 'function') {
    resizeBound = true;
    globalThis.addEventListener('resize', () => refitAll({ isPhone, bounds }));
  }
  root?.querySelectorAll?.('[data-generated-image-set]').forEach((set) => {
    if (set.dataset.bound) return;
    set.dataset.bound = '1';
    const strip = set.querySelector('[data-generated-image-thumbs]');
    const slides = Array.from(set.querySelectorAll('.generated-image-slide'));
    const buttons = Array.from(set.querySelectorAll('[data-generated-image-thumb]'));
    if (!strip || buttons.length < 2 || slides.length !== buttons.length) return;
    fitStrip(set, strip, { isPhone, bounds });
    // The message is bound before it is in the page and its width changes with the window: the row is fitted again when the set takes its place or its size.
    if (typeof globalThis.ResizeObserver === 'function') new globalThis.ResizeObserver(() => fitStrip(set, strip, { isPhone, bounds })).observe(set);
    let active = 0;

    const show = (index) => {
      const next = Math.min(Math.max(index, 0), buttons.length - 1);
      if (next === active) return next;
      active = next;
      buttons.forEach((button, position) => {
        button.classList.toggle('is-active', position === next);
        button.setAttribute('aria-current', String(position === next));
      });
      slides.forEach((slide, position) => {
        slide.classList.toggle('is-active', position === next);
        if (position === next) {
          slide.removeAttribute('inert');
          slide.removeAttribute('aria-hidden');
        } else {
          slide.setAttribute('inert', '');
          slide.setAttribute('aria-hidden', 'true');
        }
      });
      // Keep the small picture in view when the row is longer than the screen (no gliding: it is just there).
      const target = Math.max(0, buttons[next].offsetLeft - (strip.clientWidth - buttons[next].offsetWidth) / 2);
      if (typeof strip.scrollTo === 'function') strip.scrollTo({ left: target, behavior: 'auto' });
      else strip.scrollLeft = target;
      return next;
    };

    buttons.forEach((button, index) => button.addEventListener('click', () => show(index)));
    strip.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = show(active + (event.key === 'ArrowRight' ? 1 : -1));
      buttons[next].focus?.();
    });
  });
}
