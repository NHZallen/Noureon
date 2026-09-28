// Fonts for generated PDFs. A PDF shows only the glyphs it carries, so
// unlike Word (which falls back to the reader's fonts) every character must
// be drawn with a font the app ships:
//   - text is split into runs by font: the design's Latin face, then its
//     East Asian face, then fallbacks by script (the other Chinese, Japanese
//     and Korean faces, Inter for Latin and Cyrillic, Noto Emoji);
//   - each face is subset to its text and pinned to its weight with the same
//     HarfBuzz subsetter the Office files use; italics are slanted outlines
//     (the fonts have no italic files; Word slants such text too);
//   - line heights are set per run, so a line with Chinese and one without
//     are the same distance apart.

import { FONT_FAMILIES, fontSource, MONO_FAMILY, nearestWeight, officeFace, pdfFamily } from '../design/fonts.js';
import { renameFontFace } from './font-embedding.js';

// ---------------------------------------------------------------- tables

function tableDirectory(view) {
  const tables = new Map();
  const count = view.getUint16(4);
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(view.getUint8(record), view.getUint8(record + 1), view.getUint8(record + 2), view.getUint8(record + 3));
    tables.set(tag, { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) });
  }
  return tables;
}

// The code points a cmap maps to a glyph (formats 4 and 12, which cover
// every font the app ships).
function readCodePoints(view, cmapOffset) {
  const count = view.getUint16(cmapOffset + 2);
  let best = null;
  for (let index = 0; index < count; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const offset = cmapOffset + view.getUint32(record + 4);
    const format = view.getUint16(offset);
    const score = format === 12 ? 2 : format === 4 ? 1 : 0;
    if (score && (!best || score > best.score)) best = { offset, format, score };
  }
  const points = new Set();
  if (!best) return points;
  const { offset } = best;
  if (best.format === 12) {
    const groups = view.getUint32(offset + 12);
    for (let group = 0; group < groups; group += 1) {
      const start = view.getUint32(offset + 16 + group * 12);
      const end = view.getUint32(offset + 20 + group * 12);
      const glyph = view.getUint32(offset + 24 + group * 12);
      for (let point = start; point <= end; point += 1) {
        if (glyph + point - start !== 0) points.add(point);
      }
    }
    return points;
  }
  const segments = view.getUint16(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  for (let segment = 0; segment < segments; segment += 1) {
    const start = view.getUint16(starts + segment * 2);
    const end = view.getUint16(ends + segment * 2);
    const delta = view.getInt16(deltas + segment * 2);
    const rangeOffset = view.getUint16(rangeOffsets + segment * 2);
    for (let point = start; point <= end && point !== 0xFFFF; point += 1) {
      let glyph;
      if (rangeOffset === 0) {
        glyph = (point + delta) & 0xFFFF;
      } else {
        const address = rangeOffsets + segment * 2 + rangeOffset + (point - start) * 2;
        glyph = view.getUint16(address);
        if (glyph !== 0) glyph = (glyph + delta) & 0xFFFF;
      }
      if (glyph !== 0) points.add(point);
    }
  }
  return points;
}

/**
 * What layout needs of a font file: the characters it has and its natural
 * line height (ascender to descender, in em), as PDFKit measures it.
 */
export function readPdfFontMetrics(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = tableDirectory(view);
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const cmap = tables.get('cmap');
  if (!head || !hhea || !cmap) throw new Error('not a TrueType font');
  const unitsPerEm = view.getUint16(head.offset + 18);
  const ascender = view.getInt16(hhea.offset + 4);
  const descender = view.getInt16(hhea.offset + 6);
  return {
    codePoints: readCodePoints(view, cmap.offset),
    lineHeight: (ascender - descender) / unitsPerEm,
    ascender: ascender / unitsPerEm
  };
}

// ---------------------------------------------------------------- oblique

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME = 0x10;
const Y_SAME = 0x20;
const OVERLAP_SIMPLE = 0x40;

const ARG_WORDS = 0x0001;
const ARGS_XY = 0x0002;
const HAS_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const HAS_XY_SCALE = 0x0040;
const HAS_TWO_BY_TWO = 0x0080;
const HAS_INSTRUCTIONS = 0x0100;

class ByteWriter {
  constructor() {
    this.bytes = [];
  }

  u8(value) { this.bytes.push(value & 0xFF); }
  u16(value) { this.bytes.push((value >> 8) & 0xFF, value & 0xFF); }
  i16(value) { this.u16(value < 0 ? value + 0x10000 : value); }
  u32(value) { this.u16((value >>> 16) & 0xFFFF); this.u16(value & 0xFFFF); }
  raw(bytes) { for (const byte of bytes) this.bytes.push(byte); }
  pad() { while (this.bytes.length % 4) this.bytes.push(0); }
  get length() { return this.bytes.length; }
  toUint8Array() { return Uint8Array.from(this.bytes); }
}

function slantSimpleGlyph(view, start, contours, slant) {
  let cursor = start + 10;
  const ends = [];
  for (let index = 0; index < contours; index += 1) {
    ends.push(view.getUint16(cursor));
    cursor += 2;
  }
  const count = contours ? ends[contours - 1] + 1 : 0;
  cursor += 2 + view.getUint16(cursor);
  const flags = [];
  while (flags.length < count) {
    const flag = view.getUint8(cursor++);
    flags.push(flag);
    if (flag & REPEAT) {
      for (let repeat = view.getUint8(cursor++); repeat > 0; repeat -= 1) flags.push(flag);
    }
  }
  const read = (short, same) => {
    const values = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & short) {
        const delta = view.getUint8(cursor++);
        value += flag & same ? delta : -delta;
      } else if (!(flag & same)) {
        value += view.getInt16(cursor);
        cursor += 2;
      }
      values.push(value);
    }
    return values;
  };
  const xs = read(X_SHORT, X_SAME);
  const ys = read(Y_SHORT, Y_SAME);
  const slanted = xs.map((x, index) => x + Math.round(ys[index] * slant));

  const out = new ByteWriter();
  out.i16(contours);
  out.i16(count ? Math.min(...slanted) : 0);
  out.i16(count ? Math.min(...ys) : 0);
  out.i16(count ? Math.max(...slanted) : 0);
  out.i16(count ? Math.max(...ys) : 0);
  ends.forEach((end) => out.u16(end));
  // Hinting instructions would move the slanted points: they are dropped.
  out.u16(0);
  flags.forEach((flag, index) => out.u8((flag & ON_CURVE) | (index === 0 ? flag & OVERLAP_SIMPLE : 0)));
  let previous = 0;
  slanted.forEach((x) => { out.i16(x - previous); previous = x; });
  previous = 0;
  ys.forEach((y) => { out.i16(y - previous); previous = y; });
  return out;
}

function slantCompositeGlyph(view, start, slant) {
  const out = new ByteWriter();
  const yMin = view.getInt16(start + 4);
  const yMax = view.getInt16(start + 8);
  out.i16(-1);
  out.i16(view.getInt16(start + 2) + Math.round(Math.min(yMin * slant, yMax * slant)));
  out.i16(yMin);
  out.i16(view.getInt16(start + 6) + Math.round(Math.max(yMin * slant, yMax * slant)));
  out.i16(yMax);
  let cursor = start + 10;
  let flags;
  do {
    flags = view.getUint16(cursor);
    const glyph = view.getUint16(cursor + 2);
    cursor += 4;
    let first;
    let second;
    if (flags & ARG_WORDS) {
      first = flags & ARGS_XY ? view.getInt16(cursor) : view.getUint16(cursor);
      second = flags & ARGS_XY ? view.getInt16(cursor + 2) : view.getUint16(cursor + 2);
      cursor += 4;
    } else {
      first = flags & ARGS_XY ? view.getInt8(cursor) : view.getUint8(cursor);
      second = flags & ARGS_XY ? view.getInt8(cursor + 1) : view.getUint8(cursor + 1);
      cursor += 2;
    }
    // Component offsets move with the slant of their height.
    if (flags & ARGS_XY) first += Math.round(second * slant);
    const transformLength = flags & HAS_TWO_BY_TWO ? 8 : flags & HAS_XY_SCALE ? 4 : flags & HAS_SCALE ? 2 : 0;
    out.u16((flags | ARG_WORDS) & ~HAS_INSTRUCTIONS);
    out.u16(glyph);
    if (flags & ARGS_XY) {
      out.i16(first);
      out.i16(second);
    } else {
      out.u16(first);
      out.u16(second);
    }
    for (let index = 0; index < transformLength; index += 1) out.u8(view.getUint8(cursor + index));
    cursor += transformLength;
  } while (flags & MORE_COMPONENTS);
  return out;
}

function writeFont(tables) {
  const tags = [...tables.keys()].sort();
  const out = new ByteWriter();
  const count = tags.length;
  const power = 2 ** Math.floor(Math.log2(count));
  out.u32(0x00010000);
  out.u16(count);
  out.u16(power * 16);
  out.u16(Math.log2(power));
  out.u16(count * 16 - power * 16);
  let offset = 12 + count * 16;
  const records = tags.map((tag) => {
    const data = tables.get(tag);
    const record = { tag, data, offset };
    offset += Math.ceil(data.length / 4) * 4;
    return record;
  });
  const checksum = (data) => {
    let sum = 0;
    for (let index = 0; index < data.length; index += 4) {
      sum = (sum + (((data[index] << 24) | ((data[index + 1] || 0) << 16) | ((data[index + 2] || 0) << 8) | (data[index + 3] || 0)) >>> 0)) >>> 0;
    }
    return sum;
  };
  records.forEach(({ tag, data, offset: tableOffset }) => {
    [...tag].forEach((char) => out.u8(char.charCodeAt(0)));
    out.u32(checksum(data));
    out.u32(tableOffset);
    out.u32(data.length);
  });
  records.forEach(({ data }) => {
    out.raw(data);
    out.pad();
  });
  return out.toUint8Array();
}

/**
 * A slanted copy of a static TrueType font, for italics: every outline is
 * sheared by `slant` (x += y · slant, about 11° for 0.2), as Word and
 * browsers do for families without an italic face.
 */
export function obliqueFont(bytes, slant = 0.2) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directory = tableDirectory(view);
  if (!directory.has('glyf') || !directory.has('loca') || directory.has('gvar')) return bytes;
  const table = (tag) => {
    const { offset, length } = directory.get(tag);
    return bytes.slice(offset, offset + length);
  };
  const head = directory.get('head');
  const longOffsets = view.getInt16(head.offset + 50) === 1;
  const glyphCount = view.getUint16(directory.get('maxp').offset + 4);
  const loca = directory.get('loca');
  const glyf = directory.get('glyf');
  const location = (index) => (longOffsets ? view.getUint32(loca.offset + index * 4) : view.getUint16(loca.offset + index * 2) * 2);

  const glyphs = new ByteWriter();
  const offsets = [];
  for (let index = 0; index < glyphCount; index += 1) {
    offsets.push(glyphs.length);
    const start = glyf.offset + location(index);
    const length = location(index + 1) - location(index);
    if (length <= 0) continue;
    const contours = view.getInt16(start);
    const glyph = contours >= 0 ? slantSimpleGlyph(view, start, contours, slant) : slantCompositeGlyph(view, start, slant);
    glyphs.raw(glyph.bytes);
    glyphs.pad();
  }
  offsets.push(glyphs.length);

  const locaOut = new ByteWriter();
  offsets.forEach((offset) => locaOut.u32(offset));
  const headOut = table('head');
  // Long glyph offsets; checkSumAdjustment is not checked by PDF readers.
  headOut[50] = 0;
  headOut[51] = 1;
  const tables = new Map([...directory.keys()].map((tag) => [tag, table(tag)]));
  tables.set('glyf', glyphs.toUint8Array());
  tables.set('loca', locaOut.toUint8Array());
  tables.set('head', headOut);
  if (tables.has('post')) {
    const post = tables.get('post');
    const angle = Math.round(-Math.atan(slant) * (180 / Math.PI) * 65536);
    new DataView(post.buffer, post.byteOffset, post.byteLength).setInt32(4, angle);
  }
  return writeFont(tables);
}

// ---------------------------------------------------------------- runs

const EMOJI_FAMILY = 'Noto Emoji';
const LATIN_FALLBACK = 'Inter';
const CJK_FALLBACKS = Object.freeze({
  'zh-Hant': ['Noto Sans TC', 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR'],
  'zh-Hans': ['Noto Sans SC', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans KR'],
  ja: ['Noto Sans JP', 'Noto Sans TC', 'Noto Sans SC', 'Noto Sans KR'],
  ko: ['Noto Sans KR', 'Noto Sans TC', 'Noto Sans SC', 'Noto Sans JP']
});

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const SPACE = /^\s+$/u;
// Code points that only modify the character before them.
const IGNORED = /[‍︎️⃣\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu;

function graphemes(text) {
  if (typeof Intl?.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  }
  const clusters = [];
  for (const char of text) {
    const last = clusters.at(-1);
    if (last && (/[‍︎️⃣\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}̀-ͯ]/u.test(char) || last.endsWith('‍'))) {
      clusters[clusters.length - 1] = last + char;
    } else {
      clusters.push(char);
    }
  }
  return clusters;
}

const isRegionalIndicator = (point) => point >= 0x1F1E6 && point <= 0x1F1FF;

/** Whether a cluster is an emoji drawn as a picture (not ©, ™ or ↔ as text). */
export function isEmojiCluster(cluster) {
  const first = cluster.codePointAt(0);
  if (isRegionalIndicator(first) || cluster.includes('⃣')) return true;
  if (!PICTOGRAPHIC.test(cluster)) return false;
  return first >= 0x1F000 || /[️‍\u{1F3FB}-\u{1F3FF}]/u.test(cluster);
}

function scriptFallbacks(cluster, script) {
  if (isEmojiCluster(cluster)) return [EMOJI_FAMILY];
  const point = cluster.codePointAt(0);
  if (point < 0x2E80 && !HANGUL.test(cluster)) return [LATIN_FALLBACK, ...CJK_FALLBACKS[script], EMOJI_FAMILY];
  if (HANGUL.test(cluster)) return ['Noto Sans KR'];
  if (KANA.test(cluster)) return ['Noto Sans JP'];
  return CJK_FALLBACKS[script] || CJK_FALLBACKS['zh-Hant'];
}

const significant = (cluster) => [...cluster.replace(IGNORED, '')].map((char) => char.codePointAt(0));

/**
 * The fonts of one PDF: which faces its text uses, the characters each
 * draws, and finally the subset files pdfmake registers.
 *
 *   const fonts = new PdfFontSet({ roles, script, loadFontFile, subsetter });
 *   await fonts.prepare({ sample, roles: ['body', 'heading'] });
 *   fonts.runs('季度 report', { role: 'body', weight: 400 })
 *     → [{ text: '季度', font: 'F2', lineHeight }, { text: ' report', font: 'F1', … }]
 */
export class PdfFontSet {
  constructor({ roles, script = 'zh-Hant', loadFontFile, subsetter }) {
    this.roles = roles;
    this.script = CJK_FALLBACKS[script] ? script : 'zh-Hant';
    this.loadFontFile = loadFontFile;
    this.subsetter = subsetter;
    this.metrics = new Map();
    this.fallbacks = [];
    this.faces = new Map();
  }

  /** The Latin and East Asian families of a role, as a PDF draws them. */
  familiesOf(role) {
    const resolved = this.roles[role === 'mono' ? 'label' : role] || this.roles.body;
    return {
      latin: pdfFamily(role === 'mono' ? MONO_FAMILY : resolved.latin),
      eastAsian: pdfFamily(resolved.eastAsian)
    };
  }

  async loadMetrics(family) {
    if (this.metrics.has(family)) return this.metrics.get(family);
    const source = fontSource(family, 400);
    const metrics = source ? readPdfFontMetrics(await this.loadFontFile(source.file)) : null;
    this.metrics.set(family, metrics);
    return metrics;
  }

  has(family, cluster) {
    const metrics = this.metrics.get(family);
    return Boolean(metrics) && significant(cluster).every((point) => metrics.codePoints.has(point));
  }

  /**
   * Loads the faces of `roles` and, for characters none of them has, the
   * fallback faces that do (only the ones this text needs).
   */
  async prepare({ sample = '', roles = ['body', 'heading'] }) {
    const primary = [...new Set(roles.flatMap((role) => Object.values(this.familiesOf(role))))];
    await Promise.all(primary.map((family) => this.loadMetrics(family)));
    const fallbacks = new Set();
    for (const cluster of new Set(graphemes(sample))) {
      if (SPACE.test(cluster) || !significant(cluster).length) continue;
      const emoji = isEmojiCluster(cluster);
      if (!emoji && primary.some((family) => this.has(family, cluster))) continue;
      for (const family of scriptFallbacks(cluster, this.script)) {
        await this.loadMetrics(family);
        if (this.has(family, cluster)) {
          fallbacks.add(family);
          break;
        }
      }
    }
    this.fallbacks = [...fallbacks];
  }

  face(family, weight, italic) {
    const definition = FONT_FAMILIES[family];
    const snapped = nearestWeight(definition.weights, weight);
    const key = `${family}|${snapped}|${italic ? 'i' : ''}`;
    if (!this.faces.has(key)) {
      this.faces.set(key, { id: `F${this.faces.size + 1}`, family, weight: snapped, italic: Boolean(italic), text: new Set() });
    }
    return this.faces.get(key);
  }

  /** How much to scale a face's natural line to get `pitch` em. */
  lineHeightFor(family, pitch) {
    const natural = this.metrics.get(family)?.lineHeight || 1.2;
    return Math.round((pitch / natural) * 1000) / 1000;
  }

  pick(cluster, families) {
    if (isEmojiCluster(cluster) && this.fallbacks.includes(EMOJI_FAMILY) && this.has(EMOJI_FAMILY, cluster)) return EMOJI_FAMILY;
    // Fallbacks in the order of the character's script: kana is also in the
    // Simplified Chinese face, but reads as Japanese in the Japanese one.
    const byScript = scriptFallbacks(cluster, this.script).filter((family) => this.fallbacks.includes(family));
    const candidates = [families.latin, families.eastAsian, ...byScript, ...this.fallbacks.filter((family) => family !== EMOJI_FAMILY)];
    return candidates.find((family) => this.has(family, cluster))
      || candidates.find((family) => this.metrics.get(family)?.codePoints.has(cluster.codePointAt(0)))
      || families.latin;
  }

  /**
   * Splits text into runs per face. `pitch` is the line height in em that
   * every face of the run should produce.
   */
  runs(text, { role = 'body', weight = 400, italic = false, pitch = 1.2 } = {}) {
    const families = this.familiesOf(role);
    const runs = [];
    let current = null;
    for (const cluster of graphemes(String(text ?? ''))) {
      let family;
      if (SPACE.test(cluster)) {
        // Spaces stay with the text before them when its face has them,
        // except after an emoji: the emoji face's space is much wider.
        family = current && current.family !== EMOJI_FAMILY && this.has(current.family, cluster) ? current.family : this.pick(cluster, families);
        if (family === EMOJI_FAMILY) family = families.latin;
      } else {
        family = this.pick(cluster, families);
      }
      if (current?.family === family) {
        current.text += cluster;
      } else {
        current = { family, text: cluster };
        runs.push(current);
      }
    }
    return runs.map((run) => {
      const face = this.face(run.family, weight, italic);
      for (const char of run.text) face.text.add(char);
      return { text: run.text, font: face.id, lineHeight: this.lineHeightFor(run.family, pitch) };
    });
  }

  /** Registers characters a face draws outside `runs` (page numbers). */
  reserve(text, options) {
    this.runs(text, options);
  }

  /**
   * One face for all of `text` (SVG text is drawn in a single face): the
   * role's faces or a fallback, whichever has the most of its characters.
   * Returns the pdfmake font id, with the characters registered.
   */
  singleFace(text, { role = 'body', weight = 400 } = {}) {
    const families = this.familiesOf(role);
    const clusters = graphemes(String(text)).filter((cluster) => !SPACE.test(cluster) && significant(cluster).length);
    const candidates = [...new Set([families.latin, families.eastAsian, ...this.fallbacks.filter((family) => family !== EMOJI_FAMILY)])];
    const coverage = (family) => clusters.filter((cluster) => this.has(family, cluster)).length;
    const family = candidates.reduce((best, candidate) => (coverage(candidate) > coverage(best) ? candidate : best), candidates[0]);
    const face = this.face(family, weight, false);
    for (const char of String(text)) face.text.add(char);
    return face.id;
  }

  /**
   * The subset of every face used: { fonts: pdfmake font table, files:
   * [{ name, bytes }] for its virtual file system }.
   */
  async build(prefix = 'noureon') {
    const fonts = {};
    const files = [];
    for (const face of this.faces.values()) {
      const source = fontSource(face.family, face.weight);
      if (!source) continue;
      const text = [...face.text].join('');
      let bytes = this.subsetter.subset(await this.loadFontFile(source.file), text, { variations: source.variations, instance: true });
      // Every face needs a name of its own: PDFKit treats fonts with the same
      // PostScript name as one font and would draw with the other's subset.
      const office = officeFace(face.family, face.weight);
      bytes = renameFontFace(bytes, { family: `${office.typeface}${face.italic ? ' Oblique' : ''}`, bold: office.slot === 'bold', weight: face.weight });
      if (face.italic) bytes = obliqueFont(bytes);
      const name = `${prefix}/${face.id}.ttf`;
      files.push({ name, bytes });
      fonts[face.id] = { normal: name, bold: name, italics: name, bolditalics: name };
    }
    return { fonts, files };
  }
}
