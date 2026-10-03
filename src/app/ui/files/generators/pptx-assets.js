// Browser-only assets for presentations: the font files in src/assets/fonts,
// the HarfBuzz subsetter, and FontFace registration for measuring text and
// drawing the slide preview. Files are hashed build assets, so the service
// worker caches each one the first time a presentation needs it.

import subsetterUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';
import { FONT_FAMILIES, fontSource } from '../design/fonts.js';
import { familiesOf } from '../design/deck-font-faces.js';
import { createFontSubsetter } from './font-embedding.js';

const FONT_URLS = import.meta.glob('../../../../assets/fonts/*.ttf', { query: '?url', import: 'default', eager: true });
const fontUrl = (file) => FONT_URLS[`../../../../assets/fonts/${file}`];

const fileRequests = new Map();

/** Bytes of a font file from src/assets/fonts (fetched once per session). */
export function loadFontFile(file) {
  if (!fileRequests.has(file)) {
    const url = fontUrl(file);
    if (!url) return Promise.reject(new Error(`unknown font file ${file}`));
    const request = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`font ${file}: HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then((buffer) => new Uint8Array(buffer));
    request.catch(() => fileRequests.delete(file));
    fileRequests.set(file, request);
  }
  return fileRequests.get(file);
}

let subsetterRequest = null;

export function loadSubsetter() {
  if (!subsetterRequest) {
    subsetterRequest = (async () => {
      const response = await fetch(subsetterUrl);
      if (!response.ok) throw new Error(`font subsetter: HTTP ${response.status}`);
      const module = typeof WebAssembly.compileStreaming === 'function' && response.headers.get('content-type')?.includes('wasm')
        ? await WebAssembly.compileStreaming(response)
        : await WebAssembly.compile(await response.arrayBuffer());
      return createFontSubsetter(module);
    })();
    subsetterRequest.catch(() => { subsetterRequest = null; });
  }
  return subsetterRequest;
}

// The preview registers its own copies under a prefixed name, so a page font
// of the same family (or a partial subset) is never replaced.
export const fontAlias = (family) => `Noureon Deck ${family}`;

const registered = new Map();

/** Loads and registers one face of a shipped family under its deck alias (once). */
export function registerFace(family, weight, { document, window }) {
  const source = fontSource(family, weight);
  if (!source) return null;
  const key = `${family}|${source.file}|${source.variable ? 'var' : source.weight}`;
  if (registered.has(key)) return registered.get(key);
  const range = FONT_FAMILIES[family].weights;
  const load = loadFontFile(source.file).then(async (bytes) => {
    const face = new window.FontFace(fontAlias(family), bytes, {
      weight: source.variable ? `${Math.min(...range)} ${Math.max(...range)}` : String(source.weight),
      style: 'normal',
      display: 'block'
    });
    await face.load();
    document.fonts.add(face);
    return face;
  });
  load.catch(() => registered.delete(key));
  registered.set(key, load);
  return load;
}

/**
 * Loads and registers the faces a design uses (all its Latin, Cyrillic and
 * East Asian families, at the weights it draws) and waits until they are
 * ready, so canvas measurements use the real fonts. `eastAsian: false` skips
 * the multi-megabyte CJK faces (template thumbnails).
 */
export async function registerDeckFonts(tokens, { document, window, eastAsian = true }) {
  if (!document?.fonts || typeof window?.FontFace !== 'function') return false;
  const loads = [];
  for (const [family, weights] of familiesOf(tokens, tokens.design, { eastAsian })) {
    for (const weight of weights) loads.push(registerFace(family, weight, { document, window }));
  }
  await Promise.all(loads.filter(Boolean));
  return true;
}
