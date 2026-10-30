// The icons of the memory and the sources (Lucide, Tabler and Phosphor: open icon sets, ISC and MIT licences), drawn as the app's own icons are: thin lines that take the colour of the text.
// `memoryIcon(document, name)` gives a span holding the picture; the pictures are fixed markup of this file, never a text from outside.

const ICONS = {
 "globe": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" /><path d=\"M2 12h20\" />"
 },
 "brain": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M12 18V5\" /><path d=\"M15 13a4.17 4.17 0 01-3-4 4.17 4.17 0 01-3 4\" /><path d=\"M17.707 6.294A3 3 0 1012 5a3 3 0 10-5.707 1.294\" /><path d=\"M17.996 5.125a4 4 0 012.526 5.77\" /><path d=\"M18 18a4 4 0 002-7.465\" /><path d=\"M19.967 17.482a4 4 0 11-7.967.517 4 4 0 11-7.967-.517\" /><path d=\"M6 18a4 4 0 01-2-7.465\" /><path d=\"M6.004 5.125a4 4 0 00-2.526 5.77\" />"
 },
 "messages": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z\" /><path d=\"M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1\" />"
 },
 "recall": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": " <path d=\"M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0\" /><path d=\"M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0\" /><path d=\"M3 6l0 13\" /><path d=\"M12 6l0 13\" /><path d=\"M21 6l0 13\" />"
 },
 "review": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /><path d=\"M3 3v5h5\" /><path d=\"M12 7v5l4 2\" />"
 },
 "write": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" /><path d=\"m15 5 4 4\" />"
 },
 "skill": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\" />"
 },
 "hide": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" /><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" /><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" /><path d=\"m2 2 20 20\" />"
 },
 "open": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M15 3h6v6\" /><path d=\"M10 14 21 3\" /><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\" />"
 },
 "manage": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M10 5H3\" /><path d=\"M12 19H3\" /><path d=\"M14 3v4\" /><path d=\"M16 17v4\" /><path d=\"M21 12h-9\" /><path d=\"M21 19h-5\" /><path d=\"M21 5h-7\" /><path d=\"M8 10v4\" /><path d=\"M8 12H3\" />"
 },
 "undo": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M9 14 4 9l5-5\" /><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\" />"
 },
 "pin": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M12 17v5\" /><path d=\"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\" />"
 },
 "heart": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />"
 },
 "fact": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\" /><path d=\"m16 9-5.5 5.5L8 12\" />"
 },
 "project": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": " <path d=\"M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2\" />"
 },
 "people": {
  "vb": "0 0 256 256",
  "fill": true,
  "b": "<path d=\"M117.25,157.92a60,60,0,1,0-66.5,0A95.83,95.83,0,0,0,3.53,195.63a8,8,0,1,0,13.4,8.74,80,80,0,0,1,134.14,0,8,8,0,0,0,13.4-8.74A95.83,95.83,0,0,0,117.25,157.92ZM40,108a44,44,0,1,1,44,44A44.05,44.05,0,0,1,40,108Zm210.14,98.7a8,8,0,0,1-11.07-2.33A79.83,79.83,0,0,0,172,168a8,8,0,0,1,0-16,44,44,0,1,0-16.34-84.87,8,8,0,1,1-5.94-14.85,60,60,0,0,1,55.53,105.64,95.83,95.83,0,0,1,47.22,37.71A8,8,0,0,1,250.14,206.7Z\"/>"
 },
 "daily": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<circle cx=\"12\" cy=\"12\" r=\"4\" /><path d=\"M12 2v2\" /><path d=\"M12 20v2\" /><path d=\"m4.93 4.93 1.41 1.41\" /><path d=\"m17.66 17.66 1.41 1.41\" /><path d=\"M2 12h2\" /><path d=\"M20 12h2\" /><path d=\"m6.34 17.66-1.41 1.41\" /><path d=\"m19.07 4.93-1.41 1.41\" />"
 },
 "plug": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M12 22v-5\" /><path d=\"M15 8V2\" /><path d=\"M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z\" /><path d=\"M9 8V2\" />"
 },
 "terminal": {
  "vb": "0 0 24 24",
  "fill": false,
  "b": "<path d=\"M12 19h8\" /><path d=\"m4 17 6-6-6-6\" />"
 }
};

/** The names that can be asked for. */
export const MEMORY_ICON_NAMES = Object.freeze(Object.keys(ICONS));

/** The same picture as markup (for the buttons that are made as a string). */
export function memoryIconMarkup(name, { size = 16 } = {}) {
  const icon = ICONS[name];
  return icon ? `<span class="mi" aria-hidden="true"><svg class="mi-svg${icon.fill ? ' is-fill' : ''}" viewBox="${icon.vb}" width="${size}" height="${size}" focusable="false">${icon.b}</svg></span>` : '';
}

export function memoryIcon(document, name, { size = 16 } = {}) {
  const icon = ICONS[name];
  const span = document.createElement('span');
  span.className = 'mi';
  span.setAttribute('aria-hidden', 'true');
  if (!icon) return span;
  span.innerHTML = `<svg class="mi-svg${icon.fill ? ' is-fill' : ''}" viewBox="${icon.vb}" width="${size}" height="${size}" focusable="false">${icon.b}</svg>`;
  return span;
}
