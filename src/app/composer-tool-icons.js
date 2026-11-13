// The pictures of the composer tools (＋ menu, the chips over the input, the mode line of a sent message).
// Every one is a small inline SVG that takes its colour from the text (`currentColor`), so the light and the dark
// theme and the accent colour of an active tool need no filter. Only the Google Drive logo stays a picture:
// it has its own colours.

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

// 24 × 24 drawings, one shape each that can be told from the others at 18 px.
export const COMPOSER_TOOL_SHAPES = Object.freeze({
  // Camera body with its viewfinder bump, the lens and the little flash dot.
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.1-1.7A1.5 1.5 0 0 1 10.1 4.5h3.8c.5 0 1 .26 1.3.7L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4"/><circle cx="17" cy="10" r=".6" fill="currentColor" stroke="none"/>',
  // Photo with its sun and its two hills.
  media: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.7" r="1.6"/><path d="m3.8 17 4.6-4.4a1.5 1.5 0 0 1 2.1 0l2.6 2.5 2-1.8a1.5 1.5 0 0 1 2 0l3.1 2.9"/>',
  // Page with the folded corner and its lines of text.
  file: '<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z"/><path d="M14 3.5V7a.5.5 0 0 0 .5.5H18"/><path d="M9 12.5h6M9 15.5h4"/>',
  // Globe: the outline, the meridian and the two parallels.
  webSearch: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5z"/>',
  // A round table: three members that talk to one another, and the question in the middle.
  modelCouncil: '<circle cx="12" cy="5.6" r="2.3"/><circle cx="5.6" cy="16.6" r="2.3"/><circle cx="18.4" cy="16.6" r="2.3"/><path d="M10.9 7.7 6.7 14.6M13.1 7.7l4.2 6.9M8 16.6h8"/><circle cx="12" cy="12.6" r="1" fill="currentColor" stroke="none"/>',
  // Graduation cap with its tassel.
  learning: '<path d="m2.8 9.6 9.2-4.4 9.2 4.4L12 14z"/><path d="M6.6 11.6v4.2c0 1.1 2.4 2.5 5.4 2.5s5.4-1.4 5.4-2.5v-4.2"/><path d="M21.2 9.6v5.2"/>',
  // Magnifying glass with a rising line in the lens: digging deeper into a subject.
  deepResearch: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 5.1 5.1"/><path d="m7.6 12.4 2-2.2 1.5 1.3 2.3-3"/>'
});

export const COMPOSER_TOOL_IMAGE_PATHS = Object.freeze({
  drive: '/assets/composer-tools/drive.svg'
});

export function renderComposerToolIcon(name, className = 'composer-menu-icon') {
  const shape = COMPOSER_TOOL_SHAPES[name];
  if (shape) return `${SVG_OPEN} class="${className}" aria-hidden="true" focusable="false">${shape}</svg>`;
  const source = COMPOSER_TOOL_IMAGE_PATHS[name];
  if (!source) return '';
  return `<img class="${className}" src="${source}" alt="" aria-hidden="true" draggable="false">`;
}
