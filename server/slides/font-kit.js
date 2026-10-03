// The app's own fonts, made ready to draw slides without a browser: each family at each weight is a static face (a variable font pinned
// to the weight, as the browser's embedding does), named with the same alias the slide layout uses ("Noureon Deck Inter"), registered for
// measuring text (a canvas) and written to a folder for the renderer. The faces are whole (every character), a couple of MB each, and
// kept for the life of the process, so the first deck of a family pays for them and the next ones do not.
//
// The heavy parts (native canvas and renderer, the font subsetter) are loaded when first needed, so a server without them still starts.

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFontSubsetter, renameFontFace } from '../../src/app/ui/files/generators/font-embedding.js';
import { fontSource } from '../../src/app/ui/files/design/fonts.js';

const FONT_DIR = new URL('../../src/assets/fonts/', import.meta.url);
const SUBSETTER = new URL('../../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url);
export const aliasOf = (family) => `Noureon Deck ${family}`;
// What the sheets' labels and the default text are drawn with.
export const BASE_FACES = Object.freeze([['Inter', 400], ['Inter', 700], ['Noto Sans TC', 400]]);

async function createKit() {
  const [{ GlobalFonts }, subsetter, folder] = await Promise.all([
    import('@napi-rs/canvas'),
    readFile(SUBSETTER).then((bytes) => createFontSubsetter(bytes)),
    mkdtemp(join(tmpdir(), 'noureon-slide-fonts-'))
  ]);
  const rawFiles = new Map();
  const faces = new Map();
  const paths = [];
  const raw = (file) => {
    if (!rawFiles.has(file)) rawFiles.set(file, readFile(new URL(file, FONT_DIR)).then((bytes) => new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)));
    return rawFiles.get(file);
  };
  const make = async (family, weight) => {
    const source = fontSource(family, weight);
    if (!source) return null;
    const key = `${family}|${source.file}|${source.weight}`;
    if (!faces.has(key)) {
      faces.set(key, (async () => {
        const subset = subsetter.subset(await raw(source.file), '', { variations: source.variations, instance: Boolean(source.variable), allCharacters: true });
        const face = renameFontFace(subset, { family: aliasOf(family), bold: source.weight >= 600, weight: source.weight });
        const path = join(folder, `${paths.length}-${family.replace(/\W+/g, '')}-${source.weight}.ttf`);
        await writeFile(path, face);
        GlobalFonts.register(Buffer.from(face), aliasOf(family));
        paths.push(path);
        return path;
      })());
      faces.get(key).catch(() => faces.delete(key));
    }
    return faces.get(key);
  };
  return {
    alias: aliasOf,
    /** Makes these faces ready: [[family, weight], …]. A family the app does not ship (an installed font) is skipped. */
    async ensure(list) {
      await Promise.all([...BASE_FACES, ...list].map(([family, weight]) => make(family, weight)));
    },
    /** The font files for the renderer: every face made so far. */
    files: () => [...paths]
  };
}

let kit = null;

/** The kit of this process (made on first use). */
export function getFontKit() {
  kit ||= createKit();
  kit.catch(() => { kit = null; });
  return kit;
}
