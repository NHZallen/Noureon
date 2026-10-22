// A picture of a message that is still on its way (its file is being read, the page that reads it is still loading): its card shows a soft shimmer in the shape
// the picture will have, and the picture fades in when it is there, instead of an empty place that suddenly fills.

const cardsOf = (root, id) => [...(root?.querySelectorAll?.(`[data-generated-image-id="${id}"]`) || [])].map((image) => image.closest?.('.generated-image-card')).filter(Boolean);

/** The cards of these pictures wait (shimmer) until `settlePicture` is told the picture is there. */
export function markPicturesPending(root, assets) {
  for (const asset of Array.isArray(assets) ? assets : []) {
    const [width, height] = String(asset?.aspectRatio || '').split(':').map(Number);
    for (const card of cardsOf(root, asset?.id)) {
      if (card.classList.contains('is-ready')) continue;
      card.classList.add('is-pending');
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
}

/** Every card of these pictures stops waiting (the file could not be found). */
export function settlePictures(root, id) {
  cardsOf(root, id).forEach((card) => {
    card.classList.remove('is-pending');
    card.classList.add('is-ready');
  });
}
