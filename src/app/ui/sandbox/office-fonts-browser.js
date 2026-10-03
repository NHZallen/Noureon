// office-fonts.js as the page runs it: the archive tool and the font files come from the app's own bundle. Loaded on demand.

import { embedFontsInRunOutputs } from './office-fonts.js';

export const embedFontsInBrowser = (run) => embedFontsInRunOutputs(run, {
  loadArchive: () => import('../../vendors/archive-vendor.js').then((module) => module.loadArchiveVendor()),
  loadAssets: () => import('../files/generators/pptx-assets.js'),
  loadEmbedding: () => import('../files/generators/font-embedding.js')
});
