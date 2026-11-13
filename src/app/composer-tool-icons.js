// The pictures of the composer tools (＋ menu, the chips over the input, the mode line of a sent message).
// Every one is a small inline SVG that takes its colour from the text (`currentColor`), so the light and the dark
// theme and the accent colour of an active tool need no filter. Only the Google Drive logo stays a picture:
// it has its own colours.

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

// 24 × 24 drawings, one shape each that can be told from the others at 18 px.
export const COMPOSER_TOOL_SHAPES = Object.freeze({
  // Camera body with its viewfinder bump and the lens.
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v10.5H4z"/><circle cx="12" cy="13" r="3.3"/>',
  // Photo with its sun and its hills.
  media: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 5"/>',
  // Page with the folded corner and its lines of text.
  file: '<path d="M14 3.5H6v17h12V7.5zM14 3.5v4h4M9 12.5h6M9 15.5h4"/>',
  // Globe: the outline, the equator and the meridians.
  webSearch: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-5 5-5 12 0 17M12 3.5c5 5 5 12 0 17"/>',
  // A round table: three members that talk to one another.
  modelCouncil: '<circle cx="12" cy="5.5" r="2.3"/><circle cx="5.5" cy="16.5" r="2.3"/><circle cx="18.5" cy="16.5" r="2.3"/><path d="M11 7.5 6.8 14.5M13 7.5l4.2 7M8 16.5h8"/>',
  // Graduation cap with its tassel.
  learning: '<path d="m2.8 9.6 9.2-4.4 9.2 4.4L12 14zM6.6 11.6v4.2c0 1.1 2.4 2.5 5.4 2.5s5.4-1.4 5.4-2.5v-4.2M21.2 9.6v5.2"/>',
  // Magnifying glass with a rising line in the lens: digging deeper into a subject.
  deepResearch: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 5.1 5.1M7.6 12.4l2-2.2 1.5 1.3 2.3-3"/>'
});

export function renderComposerToolIcon(name, className = 'composer-menu-icon') {
  const shape = COMPOSER_TOOL_SHAPES[name];
  if (shape) return `${SVG_OPEN} class="${className}" aria-hidden="true">${shape}</svg>`;
  return name === 'drive' ? `<img class="${className}" src="/assets/composer-tools/drive.svg" alt="" aria-hidden="true" draggable="false">` : '';
}
