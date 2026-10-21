// KaTeX, the typesetter of formulas. It is loaded as its own script, not imported: mhchem (public/vendor/mhchem.min.js), which
// typesets chemistry, extends the KaTeX that script defines. The start of the page (main.js) loads it before the chat page is made;
// the chat page reads it here.

import katexScriptUrl from 'katex/dist/katex.min.js?url';
import { loadVendorScript } from '../bootstrap/load-vendor-script.js';

let katex = null;

/** Loads the KaTeX script once and keeps the renderer it defines. */
export async function loadKatex() {
  if (katex) return katex;
  await loadVendorScript(katexScriptUrl);
  const loaded = globalThis.katex;
  if (typeof loaded?.renderToString !== 'function') {
    throw new TypeError('KaTeX did not expose a usable renderer.');
  }
  katex = loaded;
  return katex;
}

/** The KaTeX loaded by loadKatex(), or null before. */
export const getKatex = () => katex;
