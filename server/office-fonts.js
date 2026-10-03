// Fonts in the Word and PowerPoint files Python made freely: the open-source families the app ships are embedded, subset to the characters
// the file uses, so the file looks the same on every computer (the browser does the same for files made there, src/app/ui/sandbox/
// office-fonts.js; this gives it the server's way of getting the archive tool, the font files and the subsetter). The heavy parts are
// loaded when first needed, so a server without them still starts and the files are simply left as they are.

import { readFile } from 'node:fs/promises';
import { embedFontsInRunOutputs } from '../src/app/ui/sandbox/office-fonts.js';

const FONT_DIR = new URL('../src/assets/fonts/', import.meta.url);
const SUBSETTER = new URL('../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url);

const fontFiles = new Map();
const loadFontFile = (file) => {
  if (!/^[\w.-]+\.ttf$/.test(String(file))) return Promise.reject(new Error(`unknown font file ${file}`));
  if (!fontFiles.has(file)) {
    const request = readFile(new URL(file, FONT_DIR)).then((bytes) => new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    request.catch(() => fontFiles.delete(file));
    fontFiles.set(file, request);
  }
  return fontFiles.get(file);
};

let subsetter = null;
const loadSubsetter = () => {
  subsetter ||= (async () => {
    const { createFontSubsetter } = await import('../src/app/ui/files/generators/font-embedding.js');
    return createFontSubsetter(await readFile(SUBSETTER));
  })();
  subsetter.catch(() => { subsetter = null; });
  return subsetter;
};

/** Embeds the app's fonts in every Word and PowerPoint file the run made (changes `run` in place). Never throws: a file that cannot be done is left as it is. */
export async function embedRunFonts(run) {
  try {
    await embedFontsInRunOutputs(run, {
      loadArchive: async () => (await import('jszip')).default,
      loadAssets: async () => ({ loadFontFile, loadSubsetter }),
      loadEmbedding: () => import('../src/app/ui/files/generators/font-embedding.js')
    });
  } catch {
    // The files keep their font names.
  }
}
