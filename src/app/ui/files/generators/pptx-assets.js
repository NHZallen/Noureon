// Browser-only assets for presentations: the font files in src/assets/fonts,
// the HarfBuzz subsetter, and FontFace registration for measuring text and
// drawing the slide preview. Files are hashed build assets, so the service
// worker caches each one the first time a presentation needs it.

import subsetterUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';
import { FONT_FAMILIES, FONT_SETS, fontSource, MONO_FAMILY } from '../design/fonts.js';
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

function familiesOf(tokens, design) {
  const set = FONT_SETS[design.fonts] || FONT_SETS.modern;
  const roles = tokens.fonts;
  const families = new Map();
  const add = (family, weight) => {
    if (!family || FONT_FAMILIES[family]?.system) return;
    if (!families.has(family)) families.set(family, new Set());
    families.get(family).add(weight);
  };
  for (const [name, role] of Object.entries({ heading: roles.heading, body: roles.body, bodyStrong: roles.bodyStrong, label: roles.label })) {
    const weight = name === 'heading' ? design.headingWeight : name === 'bodyStrong' ? 700 : name === 'label' ? 500 : 400;
    const definition = set[name === 'bodyStrong' ? 'body' : name];
    [role.latin, definition?.cyrillic].forEach((family) => { add(family, weight); add(family, 700); });
    add(role.eastAsian, weight);
    add(role.eastAsian, 700);
  }
  add(MONO_FAMILY, 500);
  add(MONO_FAMILY, 700);
  return families;
}

/**
 * Loads and registers the faces a design uses (all its Latin, Cyrillic and
 * East Asian families, at the weights it draws) and waits until they are
 * ready, so canvas measurements use the real fonts.
 */
export async function registerDeckFonts(tokens, { document, window }) {
  const fontSet = document?.fonts;
  if (!fontSet || typeof window?.FontFace !== 'function') return false;
  const loads = [];
  for (const [family, weights] of familiesOf(tokens, tokens.design)) {
    const definition = FONT_FAMILIES[family];
    for (const weight of weights) {
      const source = fontSource(family, weight);
      if (!source) continue;
      const key = `${family}|${source.file}|${source.variable ? 'var' : source.weight}`;
      if (registered.has(key)) {
        loads.push(registered.get(key));
        continue;
      }
      const load = loadFontFile(source.file).then(async (bytes) => {
        const range = definition.weights;
        const face = new window.FontFace(fontAlias(family), bytes, {
          weight: source.variable ? `${Math.min(...range)} ${Math.max(...range)}` : String(source.weight),
          style: 'normal',
          display: 'block'
        });
        await face.load();
        fontSet.add(face);
        return face;
      });
      load.catch(() => registered.delete(key));
      registered.set(key, load);
      loads.push(load);
    }
  }
  await Promise.all(loads);
  return true;
}
