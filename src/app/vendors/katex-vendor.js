// KaTeX, the typesetter of formulas. It is loaded as its own script, not imported: mhchem (public/vendor/mhchem.min.js), which
// typesets chemistry, extends the KaTeX that script defines. It is loaded when the first formula has to be set (about 300 KB), not with
// the page: the markdown renderer asks for it (runtime/shell/markdown-rendering-helpers.js) and draws the formulas that waited.

import katexScriptUrl from 'katex/dist/katex.min.js?url';
import { loadVendorScript } from '../bootstrap/load-vendor-script.js';

let katex = null;

/** Loads the KaTeX script once and keeps the renderer it defines. */
let loading = null;
export function loadKatex() {
  if (katex) return Promise.resolve(katex);
  loading ||= (async () => {
    // (The stylesheet comes with the script: the start of the page no longer loads it.)
    await Promise.all([loadVendorScript(katexScriptUrl), import('katex/dist/katex.min.css')]);
    const loaded = globalThis.katex;
    if (typeof loaded?.renderToString !== 'function') {
      throw new TypeError('KaTeX did not expose a usable renderer.');
    }
    // The chemistry extension extends the KaTeX just defined: it comes second, and a formula is not set before it is there.
    await loadVendorScript('/vendor/mhchem.min.js');
    katex = loaded;
    return katex;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** The KaTeX loaded by loadKatex(), or null before. */
export const getKatex = () => katex;
