// Word and PowerPoint files Python made freely only name their fonts. The
// open-source families the app ships (Noto Sans TC, Inter, …) are embedded
// after the run, subset to the characters the file uses, so the file looks
// the same on every computer. Fonts the app does not have (Calibri,
// Microsoft JhengHei …) are left to the reader's computer. Loaded on demand.

import { FONT_FAMILIES, fontSource } from '../files/design/fonts.js';

const decodeXml = (text) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&amp;/g, '&');

const FORMATS = Object.freeze({
  docx: {
    parts: /^word\/(?:document|styles|header\d*|footer\d*|footnotes|endnotes)\.xml$/,
    fonts: /\bw:(?:ascii|hAnsi|eastAsia|cs)="([^"]+)"/g,
    text: /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g,
    bold: /<w:b\/>|<w:b w:val="(?:1|true|on)"\/>|<w:bCs\/>/
  },
  pptx: {
    parts: /^ppt\/(?:slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster|notesSlides\/notesSlide|theme\/theme)\d*\.xml$/,
    fonts: /<a:(?:latin|ea|cs)\s+typeface="([^"]+)"/g,
    text: /<a:t>([^<]*)<\/a:t>/g,
    bold: /\sb="1"/
  }
});

// Families the app can embed, by name as written in a file (any case).
const EMBEDDABLE = new Map(Object.entries(FONT_FAMILIES)
  .filter(([, definition]) => definition.files)
  .map(([family]) => [family.toLowerCase(), family]));

// What a file uses: the embeddable families it names, all its text, and
// whether anything is bold.
export async function scanOfficeFonts(zip, extension) {
  const format = FORMATS[extension];
  if (!format) return null;
  const families = new Set();
  let text = '';
  let bold = false;
  for (const name of Object.keys(zip.files)) {
    if (!format.parts.test(name)) continue;
    const xml = await zip.file(name).async('string');
    for (const match of xml.matchAll(format.fonts)) {
      const family = EMBEDDABLE.get(decodeXml(match[1]).trim().toLowerCase());
      if (family) families.add(family);
    }
    for (const match of xml.matchAll(format.text)) text += decodeXml(match[1]);
    bold ||= format.bold.test(xml);
  }
  return { families: [...families], text, bold };
}

/**
 * Returns the file with its fonts embedded, or null when there is nothing to
 * embed. `assets` gives { loadFontFile, loadSubsetter }, `embedding` the
 * functions of font-embedding.js.
 */
export async function embedOfficeFonts(bytes, extension, { JSZip, assets, embedding }) {
  const zip = await JSZip.loadAsync(bytes);
  const used = await scanOfficeFonts(zip, extension);
  if (!used?.families.length) return null;
  const faces = used.families.flatMap((family) => [
    { family, typeface: family, slot: 'regular', weight: 400, script: FONT_FAMILIES[family].scripts[0] },
    ...(used.bold ? [{ family, typeface: family, slot: 'bold', weight: 700, script: FONT_FAMILIES[family].scripts[0] }] : [])
  ]);
  const families = await embedding.prepareEmbeddedFamilies(faces, {
    textByTypeface: new Map(used.families.map((family) => [family, used.text])),
    loadFontFile: assets.loadFontFile,
    subsetter: await assets.loadSubsetter(),
    fontSource,
    familyInfo: (family) => FONT_FAMILIES[family]
  });
  const embedded = extension === 'docx'
    ? await embedding.embedFontsInDocument(zip, families)
    : await embedding.embedFontsInPresentation(zip, families);
  if (!embedded.length) return null;
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// After a run: embeds fonts in every Word and PowerPoint file it made
// (not the documents handed to the design system, which embed their own).
export async function embedFontsInRunOutputs(run, {
  loadArchive = () => import('../../vendors/archive-vendor.js').then((module) => module.loadArchiveVendor()),
  loadAssets = () => import('../files/generators/pptx-assets.js'),
  loadEmbedding = () => import('../files/generators/font-embedding.js')
} = {}) {
  const outputs = (run?.steps || []).flatMap((step) => (step.outputs || []).map((output) => ({ step, output })))
    .filter(({ output }) => !output.name.startsWith('.noureon/') && /\.(?:docx|pptx)$/i.test(output.name));
  if (!outputs.length) return;
  const [JSZip, assets, embedding] = await Promise.all([loadArchive(), loadAssets(), loadEmbedding()]);
  for (const { step, output } of outputs) {
    try {
      const extension = output.name.split('.').pop().toLowerCase();
      const withFonts = await embedOfficeFonts(output.bytes, extension, { JSZip, assets, embedding });
      if (!withFonts) continue;
      output.bytes = withFonts;
      const listed = step.files.find((file) => file.name === output.name);
      if (listed) listed.size = withFonts.byteLength;
    } catch {
      // The file keeps its font names; readers' computers substitute.
    }
  }
}
