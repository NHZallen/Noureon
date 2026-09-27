export const MAX_REVIEWED_SLIDES = 24;

export function groupReviewedSlides(slides) {
  const selected = slides.slice(0, MAX_REVIEWED_SLIDES);
  const groups = [];
  for (let offset = 0; offset < selected.length; offset += 4) groups.push(selected.slice(offset, offset + 4));
  return groups;
}
