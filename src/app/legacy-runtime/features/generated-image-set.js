// Several pictures made by one request (the count in the advanced settings) are shown as a set: one big picture with its own buttons, swiped
// sideways to the next (a scroll-snap strip, so the finger and the trackpad do it natively), and a row of small pictures under it that shows
// where you are and jumps to one. One picture stays as it always was. No colours here: the look is in styles/generated-image-set.css.

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
  const slides = cards.map(card => `<div class="generated-image-slide">${card}</div>`).join('');
  return `<div class="generated-image-set" data-generated-image-set><div class="generated-image-track" data-generated-image-track>${slides}</div><div class="generated-image-thumbs" data-generated-image-thumbs>${thumbs}</div></div>`;
}

/** Makes the sets under `root` work: swiping the big picture moves the mark on the small ones, tapping a small one (or the arrow keys on it) brings that picture. */
export function bindGeneratedImageSets(root, { prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true } = {}) {
  root?.querySelectorAll?.('[data-generated-image-set]').forEach((set) => {
    if (set.dataset.bound) return;
    set.dataset.bound = '1';
    const track = set.querySelector('[data-generated-image-track]');
    const strip = set.querySelector('[data-generated-image-thumbs]');
    const buttons = Array.from(set.querySelectorAll('[data-generated-image-thumb]'));
    if (!track || !strip || buttons.length < 2) return;
    let active = 0;
    const behavior = () => (prefersReducedMotion() ? 'auto' : 'smooth');

    const mark = (index) => {
      if (index === active && buttons[index].classList.contains('is-active')) return;
      active = index;
      buttons.forEach((button, position) => {
        button.classList.toggle('is-active', position === index);
        button.setAttribute('aria-current', String(position === index));
      });
      // Keep the small picture in view: centred when the row is longer than the screen.
      const target = buttons[index].offsetLeft - (strip.clientWidth - buttons[index].offsetWidth) / 2;
      if (typeof strip.scrollTo === 'function') strip.scrollTo({ left: Math.max(0, target), behavior: behavior() });
      else strip.scrollLeft = Math.max(0, target);
    };
    const go = (index) => {
      const next = Math.min(Math.max(index, 0), buttons.length - 1);
      mark(next);
      const left = next * track.clientWidth;
      if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: behavior() });
      else track.scrollLeft = left;
    };

    let frame = 0;
    track.addEventListener('scroll', () => {
      if (frame) return;
      const schedule = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
      frame = schedule(() => {
        frame = 0;
        const width = track.clientWidth;
        if (width > 0) mark(Math.min(buttons.length - 1, Math.max(0, Math.round(track.scrollLeft / width))));
      });
    }, { passive: true });
    buttons.forEach((button, index) => button.addEventListener('click', () => go(index)));
    strip.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = Math.min(Math.max(active + (event.key === 'ArrowRight' ? 1 : -1), 0), buttons.length - 1);
      go(next);
      buttons[next].focus?.();
    });
  });
}
