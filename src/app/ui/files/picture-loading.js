// A picture of a message that is still on its way: its card keeps the place in the shape the picture will have, and the picture fades in when it is there, instead of an empty place
// that suddenly fills. The soft shimmer (`is-waiting`) shows only when someone is really waiting: the card is on the screen (or about to be) and the picture is still not there after
// a moment. A picture far down the chat, which nobody waits for, is just its place; a picture that comes at once does not flash a shimmer.

const WAIT_MS = 150;
const NEAR = '300px 0px';
const timers = new WeakMap();
let watcher = null;

const stopWaiting = (card) => {
  clearTimeout(timers.get(card));
  timers.delete(card);
  watcher?.unobserve?.(card);
  card.classList.remove('is-waiting');
};

// The shimmer comes for a card that has been near the screen for a moment and has not settled.
const watch = (card) => {
  if (typeof globalThis.IntersectionObserver !== 'function') {
    card.classList.add('is-waiting');
    return;
  }
  watcher ||= new globalThis.IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) {
        clearTimeout(timers.get(target));
        timers.delete(target);
        continue;
      }
      // A card on or near the screen loads its picture now, whatever the browser's own idea of near is.
      target.querySelector?.('img[loading="lazy"]')?.setAttribute('loading', 'eager');
      if (timers.has(target) || !target.classList.contains('is-pending')) continue;
      timers.set(target, setTimeout(() => {
        timers.delete(target);
        if (target.classList.contains('is-pending')) target.classList.add('is-waiting');
      }, WAIT_MS));
    }
  }, { rootMargin: NEAR });
  watcher.observe(card);
};

const cardsOf = (root, id) => [...(root?.querySelectorAll?.(`[data-generated-image-id="${id}"]`) || [])].map((image) => image.closest?.('.generated-image-card')).filter(Boolean);

/** The cards of these pictures wait (shimmer) until `settlePicture` is told the picture is there. */
export function markPicturesPending(root, assets) {
  for (const asset of Array.isArray(assets) ? assets : []) {
    const [width, height] = asset?.width > 0 && asset?.height > 0 ? [asset.width, asset.height] : String(asset?.aspectRatio || '').split(':').map(Number);
    for (const card of cardsOf(root, asset?.id)) {
      if (card.classList.contains('is-ready')) continue;
      card.classList.add('is-pending');
      watch(card);
      // The shape it will have, so the place is the size of the picture (the same size the wait for it had).
      if (width > 0 && height > 0) card.style.setProperty('--picture-ratio', String(width / height));
    }
  }
}

/** The picture is there (or will not come): the shimmer goes and the picture fades in. */
export function settlePicture(image) {
  const card = image?.closest?.('.generated-image-card');
  if (!card) return;
  card.classList.remove('is-pending');
  card.classList.add('is-ready');
  stopWaiting(card);
}

/** Every card of these pictures stops waiting (the file could not be found). */
export function settlePictures(root, id) {
  cardsOf(root, id).forEach((card) => {
    card.classList.remove('is-pending');
    card.classList.add('is-ready');
    stopWaiting(card);
  });
}
