// Small helpers for the "+" sheet: an element with a class and text, and its line icons (24 × 24, drawn in the colour of the text).

export function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const PATHS = Object.freeze({
  right: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  // The page's own drawings: a frame for the proportion, the corners of a bigger picture, the sliders, a slide on its stand.
  ratio: 'M5 7h14v10H5z',
  resolution: 'M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4',
  sliders: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h12M20 17h0M13 5v4M7 10v4M16 15v4',
  design: 'M4 4.5h16v10.5H4zM9 20h6M12 15v5'
});

export function icon(name, size = 24) {
  return `<svg class="ps-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width:${size}px;height:${size}px"><path d="${PATHS[name] || ''}"/></svg>`;
}
