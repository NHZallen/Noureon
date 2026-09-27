// DrawingML text bodies for scene text elements. The layout engine already
// decided sizes, line spacing and (for headings) line breaks; this writes
// them so PowerPoint lays the text out the same way:
//   - exact line spacing in points, never "multiple" (PowerPoint's single
//     spacing depends on each font's own ascent, which differs a lot between
//     Latin and CJK faces);
//   - no insets and no autofit;
//   - separate Latin and East Asian typefaces per run, in the regular or bold
//     slot of the face the weight maps to (officeFace);
//   - the document language on every run so PowerPoint picks CJK glyph forms
//     and line breaking rules.

import { FONT_FAMILIES, nearestWeight, officeFace } from '../design/fonts.js';

const EMU_PER_POINT = 12700;
const emu = (points) => Math.round(points * EMU_PER_POINT);
const hex = (color) => String(color || '#000000').replace('#', '').toUpperCase();

export const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BULLET_CHARACTERS = Object.freeze({ dot: '●', square: '■', dash: '—', arrow: '→', sub: '–' });
const BULLET_SIZES = Object.freeze({ dot: 60, square: 55, dash: 100, arrow: 100, sub: 100 });

const WEIGHT_WORDS = Object.freeze({ 400: 'Regular', 700: 'Bold' });

/** Office language tags for the document language. */
export function officeLanguage(language) {
  return {
    'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', en: 'en-US', fr: 'fr-FR', ru: 'ru-RU', es: 'es-ES', ja: 'ja-JP', ko: 'ko-KR'
  }[language] || 'en-US';
}

/**
 * Resolves the typefaces of a run: Latin and East Asian faces for a role at a
 * weight. The bold attribute follows the Latin face; the East Asian face is
 * registered in the same slot so PowerPoint never synthesises a fake bold.
 * `register(face)` collects the faces the file must embed.
 */
export function runFaces(roles, role, weight, register = () => {}) {
  const resolved = roles[role === 'mono' ? 'label' : role] || roles.body;
  const latinFamily = role === 'mono' ? 'IBM Plex Mono' : resolved.latin;
  const latinWeight = nearestWeight(FONT_FAMILIES[latinFamily].weights, weight);
  const latin = officeFace(latinFamily, latinWeight);
  const bold = latin.slot === 'bold';
  const eastAsianFamily = FONT_FAMILIES[resolved.eastAsian];
  const eastAsianWeight = nearestWeight(eastAsianFamily.weights, weight);
  const natural = officeFace(resolved.eastAsian, eastAsianWeight);
  const slot = bold ? 'bold' : 'regular';
  // The bold attribute is shared by both faces. When the East Asian weight
  // wants the other slot (a regular-only Latin heading next to bold Chinese,
  // or a single-weight Chinese face next to bold Latin), it gets a family of
  // its own name, so a typeface and slot always hold exactly one weight.
  const typeface = natural.slot === slot || eastAsianFamily.system || natural.typeface !== resolved.eastAsian
    ? natural.typeface
    : `${resolved.eastAsian} ${WEIGHT_WORDS[eastAsianWeight]}`;
  const eastAsian = { typeface, slot };
  register({ family: latinFamily, typeface: latin.typeface, slot: latin.slot, weight: latinWeight, script: 'latin' });
  register({ family: resolved.eastAsian, typeface: eastAsian.typeface, slot: eastAsian.slot, weight: eastAsianWeight, script: 'eastAsian' });
  return { latin: latin.typeface, eastAsian: eastAsian.typeface, bold };
}

function runXml(run, { element, paragraph, roles, lang, register }) {
  const font = element.font;
  const weight = run.strong ? font.strongWeight : paragraph.weight ?? font.weight;
  const faces = runFaces(roles, run.role || font.role, weight, register);
  const size = Math.round((paragraph.size || font.size) * 100);
  const color = run.color || (run.strong && element.strongColor) || paragraph.color || element.color;
  const attributes = [
    `lang="${lang}"`, 'altLang="en-US"', `sz="${size}"`, `b="${faces.bold ? 1 : 0}"`, 'i="0"', 'dirty="0"'
  ];
  if (font.uppercase) attributes.push('cap="all"');
  if (font.tracking) attributes.push(`spc="${Math.round(font.tracking * (paragraph.size || font.size) * 100)}"`);
  const fill = run.outline
    ? `<a:ln w="${emu(run.outline.width)}"><a:solidFill><a:srgbClr val="${hex(run.outline.color)}"/></a:solidFill></a:ln><a:noFill/>`
    : `<a:solidFill><a:srgbClr val="${hex(color)}">${element.alpha < 1 ? `<a:alpha val="${Math.round(element.alpha * 100000)}"/>` : ''}</a:srgbClr></a:solidFill>`;
  const highlight = run.strong && element.mark ? `<a:highlight><a:srgbClr val="${hex(element.mark)}"/></a:highlight>` : '';
  const text = escapeXml(font.uppercase ? run.text : run.text);
  return `<a:r><a:rPr ${attributes.join(' ')}>${fill}${highlight}<a:latin typeface="${escapeXml(faces.latin)}"/><a:ea typeface="${escapeXml(faces.eastAsian)}"/><a:cs typeface="${escapeXml(faces.latin)}"/></a:rPr><a:t>${text}</a:t></a:r>`;
}

function bulletXml(paragraph, element) {
  const bullet = paragraph.bullet;
  if (!bullet) return '<a:buNone/>';
  const color = `<a:buClr><a:srgbClr val="${hex(bullet.color || element.color)}"/></a:buClr>`;
  if (bullet.style === 'number') return '<a:buNone/>';
  const char = BULLET_CHARACTERS[bullet.style] || BULLET_CHARACTERS.dot;
  return `${color}<a:buSzPct val="${(BULLET_SIZES[bullet.style] || 100) * 1000}"/><a:buFont typeface="Arial"/><a:buChar char="${char}"/>`;
}

/**
 * The <p:txBody> for a text element. `roles` are the resolved font roles of
 * the design; `register` receives every (typeface, slot) the runs use.
 */
export function textBodyXml(element, { roles, register }) {
  const lang = officeLanguage(element.language);
  const anchor = { top: 't', middle: 'ctr', bottom: 'b' }[element.valign] || 't';
  const align = { left: 'l', center: 'ctr', right: 'r' }[element.align] || 'l';
  const paragraphs = element.paragraphs.map((paragraph) => {
    const size = paragraph.size || element.font.size;
    const lineSpacing = Math.round(paragraph.lineStep * 100);
    const hanging = paragraph.hangingEm ? paragraph.hangingEm * size : paragraph.indent;
    const indent = paragraph.indent ? ` marL="${emu(paragraph.indent)}" indent="${-emu(hanging)}"` : ' marL="0" indent="0"';
    const before = paragraph.spaceBefore ? `<a:spcBef><a:spcPts val="${Math.round(paragraph.spaceBefore * 100)}"/></a:spcBef>` : '<a:spcBef><a:spcPts val="0"/></a:spcBef>';
    const tabs = paragraph.bullet?.style === 'number' ? `<a:tabLst><a:tab pos="${emu(paragraph.indent)}" algn="l"/></a:tabLst>` : '';
    const pPr = `<a:pPr algn="${paragraph.align ? { left: 'l', center: 'ctr', right: 'r' }[paragraph.align] : align}"${indent}><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc>${before}<a:spcAft><a:spcPts val="0"/></a:spcAft>${bulletXml(paragraph, element)}${tabs}</a:pPr>`;
    const context = { element, paragraph, roles, lang, register };
    const numberRun = paragraph.bullet?.style === 'number'
      ? runXml({ text: `${paragraph.bullet.text}\t`, role: paragraph.bullet.role || 'label', color: paragraph.bullet.color }, { ...context, paragraph: { ...paragraph, weight: 700 } })
      : '';
    // Headings carry the engine's balanced line breaks; body text wraps in
    // PowerPoint exactly as it does in the preview.
    const lines = element.breaks === 'explicit' ? paragraph.lines : [{ runs: paragraph.runs }];
    const body = lines.map((line, index) => {
      const runs = line.runs.map((run) => runXml(run, context)).join('');
      return (index ? `<a:br><a:rPr lang="${lang}" sz="${Math.round(size * 100)}" dirty="0"/></a:br>` : '') + runs;
    }).join('');
    const end = `<a:endParaRPr lang="${lang}" sz="${Math.round(size * 100)}" dirty="0"/>`;
    return `<a:p>${pPr}${numberRun}${body || ''}${end}</a:p>`;
  }).join('');
  return `<p:txBody><a:bodyPr wrap="${element.noWrap ? 'none' : 'square'}" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${anchor}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>`;
}
