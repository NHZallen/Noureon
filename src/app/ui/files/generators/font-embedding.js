// Embeds font subsets in Office files so they open looking like the preview.
//
// PowerPoint stores embedded fonts as Embedded OpenType (EOT) parts
// (ppt/fonts/fontN.fntdata) listed in presentation.xml. Only TrueType-outline
// fonts are accepted. The pipeline is:
//   1. subset (and, for variable fonts, pin the weight) with HarfBuzz's
//      WebAssembly subsetter, keeping only the characters the file uses;
//   2. wrap the result in an uncompressed EOT 2.1 header;
//   3. register the parts, relationships and content type in the package.
//
// Fonts must allow embedding: OS/2 fsType 0 (installable) or with the
// editable/preview bits set. The open-source fonts the design system uses
// are all SIL OFL with fsType 0.
//
// Verified in PowerPoint for Microsoft 365 with fonts that are not installed
// (2026-09): Latin and Traditional Chinese subsets both render. Check with
// "Save as PDF"; Slide.Export to PNG ignores embedded East Asian fonts.
// English-only name records and DEFAULT_CHARSET in the EOT header are fine.

const HB_MEMORY_MODE_READONLY = 1;
const FONT_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';
const FONT_CONTENT_TYPE = 'application/x-fontdata';

const tag = (text) => text.split('').reduce((value, char) => (value << 8) | char.charCodeAt(0), 0) >>> 0;

/**
 * Wraps HarfBuzz's subsetter (harfbuzz-subset.wasm, no imports). `wasm` is
 * the module's bytes or an already compiled WebAssembly.Module.
 */
export async function createFontSubsetter(wasm) {
  const module = wasm instanceof WebAssembly.Module ? wasm : await WebAssembly.compile(wasm);
  // Instantiating a compiled module resolves to the Instance itself.
  const instance = await WebAssembly.instantiate(module, {});
  const hb = instance.exports;
  const heap = () => new Uint8Array(hb.memory.buffer);

  /**
   * Returns a TrueType subset containing `text`'s characters. `variations`
   * pins variable-font axes, e.g. { wght: 700 }; with `instance`, every other
   * axis is pinned to its default too, producing a static font (Office does
   * not render variable fonts). `allCharacters` keeps every character and
   * ignores `text`.
   */
  function subset(fontBytes, text, { variations = {}, instance = false, allCharacters = false } = {}) {
    const bytes = fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes);
    const pointer = hb.malloc(bytes.byteLength);
    if (!pointer) throw new Error('font subsetter is out of memory');
    heap().set(bytes, pointer);
    const blob = hb.hb_blob_create(pointer, bytes.byteLength, HB_MEMORY_MODE_READONLY, 0, 0);
    const face = hb.hb_face_create(blob, 0);
    hb.hb_blob_destroy(blob);
    const input = hb.hb_subset_input_create_or_fail();
    try {
      if (!input) throw new Error('font subsetter could not start');
      const unicodes = hb.hb_subset_input_unicode_set(input);
      if (allCharacters) {
        // Every character (only the axes are pinned), e.g. for the sandbox's
        // chart fonts, whose text is not known in advance.
        hb.hb_set_clear(unicodes);
        hb.hb_set_invert(unicodes);
      }
      // Always keep printable ASCII, no-break space and the replacement
      // character. PowerPoint mis-measures digits when only some of 0-9 are
      // present (it lays them out wider than they draw), and the full ASCII
      // set lets people edit numbers and Latin text without a fallback font.
      for (let codePoint = 0x20; codePoint <= 0x7E; codePoint += 1) hb.hb_set_add(unicodes, codePoint);
      for (const codePoint of new Set([...String(text)].map((char) => char.codePointAt(0)).concat([0xA0, 0xFFFD]))) {
        hb.hb_set_add(unicodes, codePoint);
      }
      if (instance) hb.hb_subset_input_pin_all_axes_to_default(input, face);
      for (const [axis, value] of Object.entries(variations)) {
        hb.hb_subset_input_pin_axis_location(input, face, tag(axis.padEnd(4, ' ')), value);
      }
      const result = hb.hb_subset_or_fail(face, input);
      if (!result) throw new Error('font subsetting failed');
      const resultBlob = hb.hb_face_reference_blob(result);
      const offset = hb.hb_blob_get_data(resultBlob, 0);
      const length = hb.hb_blob_get_length(resultBlob);
      const output = heap().slice(offset, offset + length);
      hb.hb_blob_destroy(resultBlob);
      hb.hb_face_destroy(result);
      if (!length) throw new Error('font subsetting produced no data');
      return output;
    } finally {
      if (input) hb.hb_subset_input_destroy(input);
      hb.hb_face_destroy(face);
      hb.free(pointer);
    }
  }

  return { subset };
}

function tableDirectory(view) {
  const count = view.getUint16(4);
  const tables = new Map();
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    const name = String.fromCharCode(view.getUint8(record), view.getUint8(record + 1), view.getUint8(record + 2), view.getUint8(record + 3));
    tables.set(name, { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) });
  }
  return tables;
}

function readNames(view, table) {
  if (!table) return {};
  const base = table.offset;
  const count = view.getUint16(base + 2);
  const storage = base + view.getUint16(base + 4);
  const names = {};
  const score = {};
  for (let index = 0; index < count; index += 1) {
    const record = base + 6 + index * 12;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const language = view.getUint16(record + 4);
    const id = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const offset = storage + view.getUint16(record + 10);
    // Windows Unicode, US English first, then any Windows Unicode record.
    if (platform !== 3 || (encoding !== 1 && encoding !== 10)) continue;
    const rank = language === 0x0409 ? 2 : 1;
    if ((score[id] || 0) >= rank) continue;
    let value = '';
    for (let position = 0; position + 1 < length; position += 2) value += String.fromCharCode(view.getUint16(offset + position));
    names[id] = value;
    score[id] = rank;
  }
  return names;
}

/** Reads the fields an EOT header and PowerPoint's font list need. */
export function readFontInfo(fontBytes) {
  const bytes = fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = view.getUint32(0);
  if (signature !== 0x00010000 && signature !== 0x74727565) throw new Error('only TrueType-outline fonts can be embedded');
  const tables = tableDirectory(view);
  const os2 = tables.get('OS/2');
  const head = tables.get('head');
  if (!os2 || !head || !tables.has('glyf')) throw new Error('font is missing required tables');
  const o = os2.offset;
  const version = view.getUint16(o);
  const names = readNames(view, tables.get('name'));
  return {
    family: names[1] || '',
    style: names[2] || 'Regular',
    fullName: names[4] || names[1] || '',
    version: names[5] || '',
    weight: view.getUint16(o + 4),
    fsType: view.getUint16(o + 8),
    panose: Array.from(bytes.subarray(o + 32, o + 42)),
    unicodeRange: [0, 1, 2, 3].map((index) => view.getUint32(o + 42 + index * 4)),
    italic: (view.getUint16(o + 62) & 1) === 1,
    codePageRange: version >= 1 ? [view.getUint32(o + 78), view.getUint32(o + 82)] : [0, 0],
    checkSumAdjustment: view.getUint32(head.offset + 8)
  };
}

/** True when the font's licence bits allow embedding it in a document. */
export function fontAllowsEmbedding(info) {
  // Bit 1 (0x0002) is "restricted licence": no embedding at all. Bit 9 (0x0200)
  // is "bitmap embedding only", useless for outlines.
  return (info.fsType & 0x0002) === 0 && (info.fsType & 0x0200) === 0;
}

const checksum = (bytes) => {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
  padded.set(bytes);
  const view = new DataView(padded.buffer);
  let sum = 0;
  for (let offset = 0; offset < padded.byteLength; offset += 4) sum = (sum + view.getUint32(offset)) >>> 0;
  return sum;
};

// Name IDs rewritten when a face is renamed: family, subfamily, unique ID,
// full name, PostScript name, and the typographic/WWS/variation names that
// would otherwise tell applications the face belongs to the original family.
const RENAMED_NAME_IDS = new Set([1, 2, 3, 4, 6, 16, 17, 21, 22, 25]);

function buildNameTable(view, table, names) {
  const kept = [];
  if (table) {
    const base = table.offset;
    const count = view.getUint16(base + 2);
    const storage = base + view.getUint16(base + 4);
    for (let index = 0; index < count; index += 1) {
      const record = base + 6 + index * 12;
      const [platform, encoding, language, id, length, offset] = [0, 2, 4, 6, 8, 10].map((field) => view.getUint16(record + field));
      // Windows Unicode records only: that is what Office and browsers read.
      if (platform !== 3 || encoding !== 1 || RENAMED_NAME_IDS.has(id)) continue;
      kept.push({ platform, encoding, language, id, bytes: new Uint8Array(view.buffer, view.byteOffset + storage + offset, length).slice() });
    }
  }
  const utf16be = (text) => {
    const bytes = new Uint8Array(text.length * 2);
    for (let index = 0; index < text.length; index += 1) {
      bytes[index * 2] = text.charCodeAt(index) >> 8;
      bytes[index * 2 + 1] = text.charCodeAt(index) & 0xFF;
    }
    return bytes;
  };
  const records = kept.concat(Object.entries(names).map(([id, text]) => ({ platform: 3, encoding: 1, language: 0x0409, id: Number(id), bytes: utf16be(text) })))
    .sort((a, b) => a.platform - b.platform || a.encoding - b.encoding || a.language - b.language || a.id - b.id);
  const storageOffset = 6 + records.length * 12;
  const output = new Uint8Array(storageOffset + records.reduce((sum, record) => sum + record.bytes.length, 0));
  const out = new DataView(output.buffer);
  out.setUint16(0, 0);
  out.setUint16(2, records.length);
  out.setUint16(4, storageOffset);
  let stringOffset = 0;
  records.forEach((record, index) => {
    const at = 6 + index * 12;
    [record.platform, record.encoding, record.language, record.id, record.bytes.length, stringOffset].forEach((value, field) => out.setUint16(at + field * 2, value));
    output.set(record.bytes, storageOffset + stringOffset);
    stringOffset += record.bytes.length;
  });
  return output;
}

/**
 * Renames a (static) TrueType face so Office treats it as `family` in the
 * regular or bold slot: rewrites the naming table, OS/2 weight and style
 * bits and head.macStyle, then rebuilds checksums. Used to give weights
 * other than 400 and 700 their own family ("Inter Light").
 */
export function renameFontFace(fontBytes, { family, bold = false, weight = bold ? 700 : 400 }) {
  const bytes = fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = tableDirectory(view);
  const info = readFontInfo(bytes);
  const style = bold ? 'Bold' : 'Regular';
  const postScript = `${family.replace(/[^A-Za-z0-9]/g, '')}-${style}`.slice(0, 63);
  const name = buildNameTable(view, tables.get('name'), {
    1: family, 2: style, 3: `${info.version || '1.0'};${postScript}`, 4: bold ? `${family} Bold` : family, 6: postScript
  });

  const entries = [...tables.entries()].map(([tagName, { offset, length }]) => ({
    tag: tagName,
    data: tagName === 'name' ? name : bytes.slice(offset, offset + length)
  })).sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const os2 = entries.find((entry) => entry.tag === 'OS/2');
  const os2View = new DataView(os2.data.buffer);
  os2View.setUint16(4, weight);
  // fsSelection: clear ITALIC(0) BOLD(5) REGULAR(6), then set BOLD or REGULAR.
  os2View.setUint16(62, (os2View.getUint16(62) & ~0x0061) | (bold ? 0x0020 : 0x0040));
  const head = entries.find((entry) => entry.tag === 'head');
  const headView = new DataView(head.data.buffer);
  headView.setUint16(44, (headView.getUint16(44) & ~0x0003) | (bold ? 0x0001 : 0));
  headView.setUint32(8, 0);

  const directorySize = 12 + entries.length * 16;
  const total = entries.reduce((sum, entry) => sum + Math.ceil(entry.data.length / 4) * 4, directorySize);
  const output = new Uint8Array(total);
  const out = new DataView(output.buffer);
  out.setUint32(0, view.getUint32(0));
  const searchPower = 2 ** Math.floor(Math.log2(entries.length));
  out.setUint16(4, entries.length);
  out.setUint16(6, searchPower * 16);
  out.setUint16(8, Math.log2(searchPower));
  out.setUint16(10, entries.length * 16 - searchPower * 16);
  let offset = directorySize;
  let headOffset = 0;
  entries.forEach((entry, index) => {
    const record = 12 + index * 16;
    for (let char = 0; char < 4; char += 1) out.setUint8(record + char, entry.tag.charCodeAt(char));
    out.setUint32(record + 4, checksum(entry.data));
    out.setUint32(record + 8, offset);
    out.setUint32(record + 12, entry.data.length);
    output.set(entry.data, offset);
    if (entry.tag === 'head') headOffset = offset;
    offset += Math.ceil(entry.data.length / 4) * 4;
  });
  out.setUint32(headOffset + 8, (0xB1B0AFBA - checksum(output)) >>> 0);
  return output;
}

function utf16le(text) {
  const bytes = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes[index * 2] = code & 0xFF;
    bytes[index * 2 + 1] = code >> 8;
  }
  return bytes;
}

/** Wraps a TrueType font in an uncompressed Embedded OpenType 2.1 header. */
export function buildEot(fontBytes) {
  const font = fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes);
  const info = readFontInfo(font);
  if (!fontAllowsEmbedding(info)) throw new Error(`${info.family} does not allow embedding`);
  const strings = [info.family, info.style, info.version, info.fullName].map(utf16le);
  // Four (size + string) records with Padding2-4 between them, then Padding5
  // and an empty RootString (size 0).
  const stringBytes = strings.reduce((sum, value) => sum + 2 + value.length, 0) + 3 * 2 + 2 + 2;
  const headerSize = 82 + stringBytes;
  const output = new Uint8Array(headerSize + font.byteLength);
  const view = new DataView(output.buffer);
  let offset = 0;
  const u32 = (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; };
  const u16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
  const u8 = (value) => { view.setUint8(offset, value); offset += 1; };
  u32(output.byteLength); // EOTSize
  u32(font.byteLength); // FontDataSize
  u32(0x00020001); // Version 2.1
  u32(0); // Flags: uncompressed, not XOR-obfuscated
  info.panose.forEach(u8);
  u8(1); // Charset: DEFAULT_CHARSET
  u8(info.italic ? 1 : 0);
  u32(info.weight);
  u16(info.fsType);
  u16(0x504C); // MagicNumber
  info.unicodeRange.forEach(u32);
  info.codePageRange.forEach(u32);
  u32(info.checkSumAdjustment);
  for (let index = 0; index < 4; index += 1) u32(0); // Reserved1-4
  u16(0); // Padding1
  strings.forEach((value, index) => {
    if (index > 0) u16(0); // Padding2-4
    u16(value.length);
    output.set(value, offset);
    offset += value.length;
  });
  u16(0); // Padding5
  u16(0); // RootStringSize: no root restriction
  output.set(font, offset);
  return output;
}

// PowerPoint's charset attribute is a signed byte: CHINESEBIG5 136 → -120.
const CHARSETS = Object.freeze({ latin: 0, 'zh-Hant': -120, 'zh-Hans': -122, ja: -128, ko: -127 });
const PITCH_FAMILY = Object.freeze({ 'sans-serif': 34, serif: 18, monospace: 49 });

const escapeXml = (value) => String(value).replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]));
const panoseHex = (panose) => panose.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();

/**
 * Adds embedded fonts to a PPTX package (a JSZip instance). Each family is
 * { typeface, script ('latin'|'zh-Hant'|…), generic, faces: { regular,
 * bold?, italic?, boldItalic? } } where each face is TrueType bytes (already
 * subset). Returns the typefaces actually embedded.
 */
export async function embedFontsInPresentation(zip, families) {
  const presentationPath = 'ppt/presentation.xml';
  const relationshipsPath = 'ppt/_rels/presentation.xml.rels';
  let presentation = await zip.file(presentationPath).async('string');
  let relationships = await zip.file(relationshipsPath).async('string');
  let contentTypes = await zip.file('[Content_Types].xml').async('string');

  const usedIds = new Set([...relationships.matchAll(/Id="([^"]+)"/g)].map((match) => match[1]));
  let nextId = 1;
  const newId = () => {
    while (usedIds.has(`rIdFont${nextId}`)) nextId += 1;
    usedIds.add(`rIdFont${nextId}`);
    return `rIdFont${nextId}`;
  };
  let fileIndex = 1;
  while (zip.file(`ppt/fonts/font${fileIndex}.fntdata`)) fileIndex += 1;

  const entries = [];
  const embedded = [];
  for (const family of families) {
    const slots = [];
    let panose = null;
    for (const slot of ['regular', 'bold', 'italic', 'boldItalic']) {
      const face = family.faces[slot];
      if (!face) continue;
      const eot = buildEot(face);
      panose ||= readFontInfo(face).panose;
      const id = newId();
      const target = `fonts/font${fileIndex}.fntdata`;
      fileIndex += 1;
      zip.file(`ppt/${target}`, eot);
      relationships = relationships.replace('</Relationships>', `<Relationship Id="${id}" Type="${FONT_RELATIONSHIP}" Target="${target}"/></Relationships>`);
      slots.push(`<p:${slot} r:id="${id}"/>`);
    }
    if (!slots.length) continue;
    const charset = CHARSETS[family.script] ?? 0;
    const pitchFamily = PITCH_FAMILY[family.generic] ?? 34;
    entries.push(`<p:embeddedFont><p:font typeface="${escapeXml(family.typeface)}" panose="${panoseHex(panose)}" pitchFamily="${pitchFamily}" charset="${charset}"/>${slots.join('')}</p:embeddedFont>`);
    embedded.push(family.typeface);
  }
  if (!entries.length) return embedded;

  if (!/Extension="fntdata"/.test(contentTypes)) {
    contentTypes = contentTypes.replace(/(<Types[^>]*>)/, `$1<Default Extension="fntdata" ContentType="${FONT_CONTENT_TYPE}"/>`);
  }
  // embedTrueTypeFonts makes PowerPoint (and LibreOffice) load the list;
  // saveSubsetFonts keeps it subset when the user saves again.
  presentation = presentation.replace(/<p:presentation\b([^>]*)>/, (match, attributes) => {
    let next = attributes.replace(/\s(?:embedTrueTypeFonts|saveSubsetFonts)="[^"]*"/g, '');
    next += ' embedTrueTypeFonts="1" saveSubsetFonts="1"';
    return `<p:presentation${next}>`;
  });
  const list = `<p:embeddedFontLst>${entries.join('')}</p:embeddedFontLst>`;
  if (/<p:embeddedFontLst>/.test(presentation)) {
    presentation = presentation.replace('</p:embeddedFontLst>', `${entries.join('')}</p:embeddedFontLst>`);
  } else if (/<p:notesSz[^>]*\/>/.test(presentation)) {
    // Schema order: … sldSz, notesSz, smartTags, embeddedFontLst, custShowLst …
    presentation = presentation.replace(/(<p:notesSz[^>]*\/>(?:<p:smartTags[^>]*\/>)?)/, `$1${list}`);
  } else {
    throw new Error('presentation.xml has no notesSz element');
  }
  zip.file(presentationPath, presentation);
  zip.file(relationshipsPath, relationships);
  zip.file('[Content_Types].xml', contentTypes);
  return embedded;
}

// Word stores embedded fonts as obfuscated TrueType (word/fonts/*.odttf):
// the first 32 bytes are XORed with the font key, a GUID read backwards
// (ECMA-376 Part 1, 17.8.1). The key is written in the font table entry.
const WORD_FAMILY = Object.freeze({ 'sans-serif': 'swiss', serif: 'roman', monospace: 'modern' });
// w:charset is the Windows charset as hex: CHINESEBIG5 136 → 88.
const WORD_CHARSETS = Object.freeze({ latin: '00', 'zh-Hant': '88', 'zh-Hans': '86', ja: '80', ko: '81' });
const WORD_SLOTS = Object.freeze({ regular: 'embedRegular', bold: 'embedBold', italic: 'embedItalic', boldItalic: 'embedBoldItalic' });

function randomGuid(random = Math.random) {
  const bytes = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint8Array(16))
    : Uint8Array.from({ length: 16 }, () => Math.floor(random() * 256));
  const hexText = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hexText.slice(0, 8)}-${hexText.slice(8, 12)}-${hexText.slice(12, 16)}-${hexText.slice(16, 20)}-${hexText.slice(20)}`;
}

/** Obfuscates (or, applied again, restores) a font with a GUID font key. */
export function obfuscateFont(fontBytes, guid) {
  const hexText = String(guid).replace(/[{}-]/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(hexText)) throw new Error('font key must be a GUID');
  const key = Array.from({ length: 16 }, (_, index) => Number.parseInt(hexText.slice(index * 2, index * 2 + 2), 16)).reverse();
  const output = new Uint8Array(fontBytes);
  for (let index = 0; index < Math.min(32, output.length); index += 1) output[index] ^= key[index % 16];
  return output;
}

/**
 * Adds embedded fonts to a DOCX package (a JSZip instance) written by the
 * docx library: odttf parts, their font table entries and relationships,
 * and the settings that make Word load them. `families` is the output of
 * prepareEmbeddedFamilies. Returns the typefaces embedded.
 */
export async function embedFontsInDocument(zip, families, { guid = randomGuid } = {}) {
  const tablePath = 'word/fontTable.xml';
  const relationshipsPath = 'word/_rels/fontTable.xml.rels';
  let table = await zip.file(tablePath)?.async('string');
  if (!table) throw new Error('document has no font table');
  let relationships = (await zip.file(relationshipsPath)?.async('string')
    || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>')
    // The docx library writes an empty list as a self-closing element.
    .replace(/<Relationships\b([^>]*)\/>/, '<Relationships$1></Relationships>');
  let settings = await zip.file('word/settings.xml').async('string');
  let contentTypes = await zip.file('[Content_Types].xml').async('string');

  const usedIds = new Set([...relationships.matchAll(/Id="([^"]+)"/g)].map((match) => match[1]));
  let nextId = 1;
  const newId = () => {
    while (usedIds.has(`rIdFont${nextId}`)) nextId += 1;
    usedIds.add(`rIdFont${nextId}`);
    return `rIdFont${nextId}`;
  };
  let fileIndex = 1;
  while (zip.file(`word/fonts/font${fileIndex}.odttf`)) fileIndex += 1;

  const entries = [];
  const embedded = [];
  for (const family of families) {
    const slots = [];
    for (const [slot, element] of Object.entries(WORD_SLOTS)) {
      const face = family.faces[slot];
      if (!face) continue;
      if (!fontAllowsEmbedding(readFontInfo(face))) continue;
      const key = guid();
      const id = newId();
      const target = `fonts/font${fileIndex}.odttf`;
      fileIndex += 1;
      zip.file(`word/${target}`, obfuscateFont(face, key));
      relationships = relationships.replace('</Relationships>', `<Relationship Id="${id}" Type="${FONT_RELATIONSHIP}" Target="${target}"/></Relationships>`);
      slots.push(`<w:${element} r:id="${id}" w:fontKey="{${key}}"/>`);
    }
    if (!slots.length) continue;
    const name = escapeXml(family.typeface);
    // Replace any entry Word would otherwise use for this name.
    table = table.replace(new RegExp(`<w:font w:name="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[\\s\\S]*?</w:font>`, 'g'), '');
    entries.push(`<w:font w:name="${name}"><w:charset w:val="${WORD_CHARSETS[family.script] ?? '00'}"/><w:family w:val="${WORD_FAMILY[family.generic] || 'auto'}"/><w:pitch w:val="${family.generic === 'monospace' ? 'fixed' : 'variable'}"/>${slots.join('')}</w:font>`);
    embedded.push(family.typeface);
  }
  if (!entries.length) return embedded;

  table = /<w:fonts\b[^>]*\/>/.test(table)
    ? table.replace(/<w:fonts\b([^>]*)\/>/, `<w:fonts$1>${entries.join('')}</w:fonts>`)
    : table.replace('</w:fonts>', `${entries.join('')}</w:fonts>`);
  if (!/Extension="odttf"/.test(contentTypes)) {
    contentTypes = contentTypes.replace(/(<Types[^>]*>)/, '$1<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>');
  }
  // embedTrueTypeFonts makes Word keep the fonts when the file is saved
  // again; saveSubsetFonts keeps them subset. Schema order puts them right
  // after displayBackgroundShape (or at the start).
  if (!/<w:embedTrueTypeFonts\b/.test(settings)) {
    const flags = '<w:embedTrueTypeFonts/><w:saveSubsetFonts/>';
    settings = /<w:displayBackgroundShape\/>/.test(settings)
      ? settings.replace('<w:displayBackgroundShape/>', `<w:displayBackgroundShape/>${flags}`)
      : settings.replace(/(<w:settings\b[^>]*>)/, `$1${flags}`);
  }
  zip.file(tablePath, table);
  zip.file(relationshipsPath, relationships);
  zip.file('word/settings.xml', settings);
  zip.file('[Content_Types].xml', contentTypes);
  return embedded;
}

/**
 * Builds the families to embed from the faces a document uses.
 *   faces: [{ family, typeface, slot, weight, script }] (duplicates allowed)
 *   textByTypeface: Map typeface -> text drawn with it
 *   loadFontFile(file) -> bytes of a file from src/assets/fonts
 *   fontSource(family, weight) -> { file, variations } or null (installed font)
 *   familyInfo(family) -> { generic, scripts }
 * Every face is subset to its text, pinned to a static instance and renamed
 * to its Office typeface, so "Inter Light" really is a family of its own.
 */
const LATIN_EXTRA = Array.from({ length: 0x100 - 0xC0 }, (_, index) => String.fromCharCode(0xC0 + index)).join('') + 'ŒœŸ–—\u2018\u2019\u201C\u201D…€';

export async function prepareEmbeddedFamilies(faces, { textByTypeface, loadFontFile, subsetter, fontSource, familyInfo }) {
  const families = new Map();
  for (const face of faces) {
    const source = fontSource(face.family, face.weight);
    if (!source) continue;
    const key = face.typeface;
    if (!families.has(key)) {
      const info = familyInfo(face.family);
      const script = face.script === 'latin' ? 'latin' : (info.scripts.find((name) => name !== 'latin' && name !== 'cyrillic') || 'latin');
      families.set(key, { typeface: key, script, generic: info.generic, faces: {}, sources: {} });
    }
    const family = families.get(key);
    if (family.sources[face.slot]) continue;
    family.sources[face.slot] = { ...source, family: face.family };
  }
  const output = [];
  for (const family of families.values()) {
    // Both cases (text set in capitals, later edits) and, for Latin faces, all
    // of Latin-1 plus the French ligatures, so accents never fall back.
    const drawn = textByTypeface.get(family.typeface) || '';
    const text = drawn + drawn.toUpperCase() + drawn.toLowerCase() + (family.script === 'latin' ? LATIN_EXTRA : '');
    for (const [slot, source] of Object.entries(family.sources)) {
      const bytes = await loadFontFile(source.file);
      const subset = subsetter.subset(bytes, text, { variations: source.variations, instance: true });
      family.faces[slot] = renameFontFace(subset, { family: family.typeface, bold: slot === 'bold', weight: source.weight });
    }
    delete family.sources;
    output.push(family);
  }
  return output;
}
