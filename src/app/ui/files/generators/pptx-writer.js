// Writes laid-out slides (slide-engine.js) to a PPTX package.
//
// pptxgenjs builds the package (slides, shapes, pictures, native charts,
// tables, notes). Everything it cannot express is finished on the XML
// afterwards, addressed by each object's name:
//   - text bodies come from pptx-text.js (exact spacing, CJK typefaces);
//   - gradients (image scrims, glow motifs), round line caps on icons;
//   - picture crops and shapes (rounded, arch, circle);
//   - "Latin|EastAsian" typeface markers in tables and charts;
//   - the theme's East Asian fonts, then the embedded font subsets.

import { FONT_FAMILIES, fontSource, installedFonts } from '../design/fonts.js';
import { ICON_STROKE, iconSegments } from '../design/icons.js';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../design/design-tokens.js';
import { shapeSegments, transformSegments } from '../design/svg-path.js';
import { embedFontsInPresentation, prepareEmbeddedFamilies } from './font-embedding.js';
import { nativeChart } from './pptx-charts.js';
import { escapeXml, officeLanguage, runFaces, textBodyXml } from './pptx-text.js';

const inches = (points) => points / 72;
const hex = (color) => String(color || '#000000').replace('#', '').toUpperCase();
const transparency = (alpha = 1) => Math.round((1 - alpha) * 100);
const PREFIX = 'nk';
// Text with East Asian characters; East Asian faces are embedded only for it.
const EAST_ASIAN_TEXT = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;

// ------------------------------------------------------------ geometry

/** Segments (points, relative to the shape box) as pptxgenjs custGeom points. */
function customPoints(segments) {
  const points = [];
  segments.forEach((segment, index) => {
    if (segment.type === 'Z') points.push({ close: true });
    else if (segment.type === 'M') points.push({ x: inches(segment.x), y: inches(segment.y), ...(index ? { moveTo: true } : {}) });
    else if (segment.type === 'L') points.push({ x: inches(segment.x), y: inches(segment.y) });
    else points.push({ x: inches(segment.x), y: inches(segment.y), curve: { type: 'cubic', x1: inches(segment.x1), y1: inches(segment.y1), x2: inches(segment.x2), y2: inches(segment.y2) } });
  });
  return points;
}

// ------------------------------------------------------------ XML editing

/** Applies `transform` to the XML of the object named `name`. */
function editObject(xml, name, transform) {
  const at = xml.indexOf(`name="${name}"`);
  if (at < 0) return xml;
  const start = Math.max(xml.lastIndexOf('<p:sp>', at), xml.lastIndexOf('<p:pic>', at), xml.lastIndexOf('<p:graphicFrame>', at));
  const ends = ['</p:sp>', '</p:pic>', '</p:graphicFrame>'].map((tag) => {
    const index = xml.indexOf(tag, at);
    return index < 0 ? Infinity : index + tag.length;
  });
  const end = Math.min(...ends);
  return xml.slice(0, start) + transform(xml.slice(start, end)) + xml.slice(end);
}

/** Puts `fill` in the shape properties, replacing any fill already there. */
function replaceFill(block, fill) {
  return block.replace(/<p:spPr>([\s\S]*?)<\/p:spPr>/, (match, inner) => {
    const lineAt = inner.search(/<a:ln[\s>/]/);
    const head = (lineAt >= 0 ? inner.slice(0, lineAt) : inner)
      .replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>|<a:noFill\/>|<a:gradFill[\s\S]*?<\/a:gradFill>/, '');
    return `<p:spPr>${head}${fill}${lineAt >= 0 ? inner.slice(lineAt) : ''}</p:spPr>`;
  });
}

function gradientXml(gradient) {
  const stop = (position, color) => `<a:gs pos="${Math.round(position * 100000)}"><a:srgbClr val="${hex(color.color)}"><a:alpha val="${Math.round((color.alpha ?? 1) * 100000)}"/></a:srgbClr></a:gs>`;
  const stops = [stop(0, gradient.from), stop(gradient.stop ?? 1, gradient.to)];
  if ((gradient.stop ?? 1) < 1) stops.push(stop(1, gradient.to));
  return `<a:gradFill rotWithShape="1"><a:gsLst>${stops.join('')}</a:gsLst><a:lin ang="${Math.round((gradient.angle ?? 90) * 60000)}" scaled="0"/></a:gradFill>`;
}

function glowXml(color, alpha) {
  const stop = (position, value) => `<a:gs pos="${position}"><a:srgbClr val="${hex(color)}"><a:alpha val="${Math.round(value * 100000)}"/></a:srgbClr></a:gs>`;
  // A circle path gradient reaches 100% at the box corners, so the ellipse's
  // own edge sits at about 70%: fade out before it, like a blurred disc.
  const stops = [[0, 1], [22000, 0.72], [42000, 0.38], [58000, 0.12], [70000, 0], [100000, 0]];
  return `<a:gradFill rotWithShape="1"><a:gsLst>${stops.map(([position, share]) => stop(position, alpha * share)).join('')}</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`;
}

/** Replaces "Latin|EastAsian" typeface markers with the real faces. */
export function resolveTypefaceMarkers(xml) {
  return xml
    .replace(/<a:latin typeface="([^"|]+)\|([^"]+)"([^>]*)\/>(?:<a:ea typeface="[^"]*"[^>]*\/>)?(?:<a:cs typeface="[^"]*"[^>]*\/>)?/g,
      (match, latin, eastAsian) => `<a:latin typeface="${latin}"/><a:ea typeface="${eastAsian}"/><a:cs typeface="${latin}"/>`)
    .replace(/<a:(ea|cs) typeface="([^"|]+)\|([^"]+)"[^>]*\/>/g, (match, slot, latin, eastAsian) => `<a:${slot} typeface="${slot === 'ea' ? eastAsian : latin}"/>`);
}

// ------------------------------------------------------------ images

/** srcRect (in 1/1000 %) that crops an image to cover a box with a focus. */
export function coverCrop(pixels, box, focus = 'center') {
  if (!pixels?.width || !pixels?.height) return null;
  const imageRatio = pixels.width / pixels.height;
  const boxRatio = box.w / box.h;
  if (Math.abs(imageRatio - boxRatio) < 0.005) return null;
  const crop = { l: 0, t: 0, r: 0, b: 0 };
  if (imageRatio > boxRatio) {
    const excess = 1 - boxRatio / imageRatio;
    const left = focus === 'left' ? 0 : focus === 'right' ? excess : excess / 2;
    crop.l = left;
    crop.r = excess - left;
  } else {
    const excess = 1 - imageRatio / boxRatio;
    const top = focus === 'top' ? 0 : focus === 'bottom' ? excess : excess / 2;
    crop.t = top;
    crop.b = excess - top;
  }
  return Object.fromEntries(Object.entries(crop).map(([key, value]) => [key, Math.round(value * 100000)]));
}

function pictureGeometry(element) {
  const minimum = Math.min(element.w, element.h);
  const adjust = (radius) => Math.min(50000, Math.round((radius / minimum) * 100000));
  if (element.shape === 'ellipse') return '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>';
  if (element.shape === 'arch') return `<a:prstGeom prst="round2SameRect"><a:avLst><a:gd name="adj1" fmla="val ${adjust(element.w / 2)}"/><a:gd name="adj2" fmla="val ${adjust(element.radius)}"/></a:avLst></a:prstGeom>`;
  if (element.shape === 'rounded' && element.radius > 0) return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjust(element.radius)}"/></a:avLst></a:prstGeom>`;
  return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
}

// ------------------------------------------------------------ writer

/**
 * Writes the presentation and returns its bytes.
 *   PptxGenJS, JSZip – the libraries (injected so tests and the browser
 *                      load them their own way)
 *   fonts: { embed, loadFontFile, subsetter } – omit to skip embedding
 *   images: { resolve(source) -> { data, pixels } | null,
 *             placeholder({ w, h, text, colors }) -> data URL | null }
 *   charts: { image(chart, box, colors) -> { data } | null }
 */
export async function writePresentation(layout, { PptxGenJS, JSZip, fonts = null, images = {}, charts = {} } = {}) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = layout.meta.title || '';
  pres.author = layout.meta.author || '';
  pres.subject = layout.meta.subtitle || '';
  const roles = layout.tokens.fonts;
  pres.theme = { headFontFace: roles.heading.latin, bodyFontFace: roles.body.latin };
  const lang = officeLanguage(layout.language);

  const faces = [];
  const textByTypeface = new Map();
  const collect = (typeface, text) => textByTypeface.set(typeface, (textByTypeface.get(typeface) || '') + text);
  const registerFor = (text) => (face) => {
    if (face.script === 'eastAsian' && !EAST_ASIAN_TEXT.test(text)) return;
    faces.push(face);
    collect(face.typeface, text);
  };
  const markerFor = (role, weight, text) => {
    const resolved = runFaces(roles, role, weight, registerFor(text));
    return { fontFace: `${resolved.latin}|${resolved.eastAsian}`, bold: resolved.bold };
  };

  const edits = new Map();
  for (const slide of layout.slides) {
    const target = pres.addSlide();
    target.background = { color: hex(slide.background) };
    if (slide.notes) target.addNotes(slide.notes);
    const slideEdits = [];
    edits.set(slide.number, slideEdits);
    for (const element of slide.elements) {
      const name = `${PREFIX}:${element.id}`;
      const box = { x: inches(element.x), y: inches(element.y), w: inches(Math.max(element.w || 0, 0.5)), h: inches(Math.max(element.h || 0, 0.5)) };
      switch (element.type) {
        case 'text': {
          target.addText(' ', { ...box, objectName: name, margin: 0 });
          const text = element.paragraphs.map((paragraph) => [paragraph.bullet?.text || '', ...paragraph.runs.map((run) => run.text)].join('')).join('');
          const xml = textBodyXml(element, { roles, register: registerFor(text) });
          slideEdits.push([name, (block) => block.replace(/<p:txBody>[\s\S]*<\/p:txBody>/, () => xml)]);
          break;
        }
        case 'shape':
          writeShape(target, element, name, slideEdits);
          break;
        case 'glow':
          target.addShape('ellipse', { ...box, objectName: name, fill: { color: hex(element.color) }, line: { type: 'none' } });
          slideEdits.push([name, (block) => replaceFill(block, glowXml(element.color, element.alpha ?? 0.6))]);
          break;
        case 'line': {
          const flipV = (element.y2 - element.y1) * (element.x2 - element.x1) < 0;
          target.addShape('line', {
            x: inches(Math.min(element.x1, element.x2)), y: inches(Math.min(element.y1, element.y2)),
            w: inches(Math.abs(element.x2 - element.x1)), h: inches(Math.abs(element.y2 - element.y1)), flipV,
            objectName: name,
            line: { color: hex(element.color), width: element.width, transparency: transparency(element.alpha), ...(element.dash ? { dashType: element.dash } : {}) }
          });
          break;
        }
        case 'icon': {
          const scale = element.size / 24;
          const points = customPoints(transformSegments(iconSegments(element.name), { scale }));
          if (!points.length) break;
          target.addShape('custGeom', { x: inches(element.x), y: inches(element.y), w: inches(element.size), h: inches(element.size), points, objectName: name, fill: { type: 'none' }, line: { color: hex(element.color), width: ICON_STROKE * scale } });
          slideEdits.push([name, (block) => block.replace(/<a:ln w="(\d+)"[^>]*>/, '<a:ln w="$1" cap="rnd">').replace(/<\/a:ln>/, '<a:round/></a:ln>')]);
          break;
        }
        case 'image':
          await writeImage(target, element, name, slideEdits, images);
          break;
        case 'chart':
          await writeChart(target, element, name, { charts });
          break;
        case 'table':
          writeTable(target, element, name, markerFor);
          break;
        default:
          break;
      }
    }
  }

  const bytes = await pres.write({ outputType: 'uint8array' });
  const zip = await JSZip.loadAsync(bytes);
  for (const [number, slideEdits] of edits) {
    const path = `ppt/slides/slide${number}.xml`;
    let xml = await zip.file(path).async('string');
    for (const [name, transform] of slideEdits) xml = editObject(xml, name, transform);
    xml = resolveTypefaceMarkers(xml).replace(/lang="en-US"(?! altLang)/g, `lang="${lang}"`);
    zip.file(path, xml);
  }
  for (const path of Object.keys(zip.files).filter((file) => /^ppt\/charts\/chart\d+\.xml$/.test(file))) {
    zip.file(path, resolveTypefaceMarkers(await zip.file(path).async('string')).replace(/lang="en-US"/g, `lang="${lang}"`));
  }
  await setThemeEastAsianFonts(zip, roles);

  const embedded = [];
  if (fonts?.embed && layout.tokens.fonts.embedded) {
    const families = await prepareEmbeddedFamilies(faces, {
      textByTypeface,
      loadFontFile: fonts.loadFontFile,
      subsetter: fonts.subsetter,
      fontSource,
      familyInfo: (family) => FONT_FAMILIES[family]
    });
    embedded.push(...await embedFontsInPresentation(zip, families));
  }
  const output = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes: output, embedded };
}

function writeShape(target, element, name, slideEdits) {
  const box = { x: inches(element.x), y: inches(element.y), w: inches(element.w), h: inches(element.h) };
  const fill = element.fill ? { color: hex(element.fill.color), transparency: transparency(element.fill.alpha) } : { type: 'none' };
  const line = element.line ? { color: hex(element.line.color), width: element.line.width, transparency: transparency(element.line.alpha), ...(element.line.dash ? { dashType: element.line.dash } : {}) } : { type: 'none' };
  const shadow = element.shadow ? { type: 'outer', blur: 18, offset: 6, angle: 90, color: '000000', opacity: 0.18 } : undefined;
  const common = { ...box, objectName: name, fill, line, rotate: element.rotate || 0, ...(shadow ? { shadow } : {}) };
  const uniformRadius = !Array.isArray(element.radius);
  if (element.shape === 'ellipse') target.addShape('ellipse', common);
  else if (element.shape === 'rect' || ((element.shape === 'rounded') && uniformRadius && !element.radius)) target.addShape('rect', common);
  else if (element.shape === 'rounded' && uniformRadius) target.addShape('roundRect', { ...common, rectRadius: inches(Math.min(element.radius, element.w / 2, element.h / 2)) });
  else target.addShape('custGeom', { ...common, points: customPoints(shapeSegments(element)) });
  if (element.gradient) slideEdits.push([name, (block) => replaceFill(block, gradientXml(element.gradient))]);
}

async function writeImage(target, element, name, slideEdits, images) {
  const source = element.source;
  const resolved = source.kind === 'placeholder' ? null : element.resolved || await images.resolve?.(source);
  const altText = element.alt || element.placeholderText || '';
  let box = { x: element.x, y: element.y, w: element.w, h: element.h };
  if (resolved) {
    let crop = null;
    if (element.fit === 'contain' && resolved.pixels) {
      const ratio = resolved.pixels.width / resolved.pixels.height;
      const w = Math.min(box.w, box.h * ratio);
      const h = w / ratio;
      box = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
    } else {
      crop = coverCrop(resolved.pixels, box, element.focus);
    }
    target.addImage({ data: resolved.data, x: inches(box.x), y: inches(box.y), w: inches(box.w), h: inches(box.h), objectName: name, altText });
    slideEdits.push([name, (block) => {
      let next = block.replace(/<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>/, pictureGeometry({ ...element, ...box }));
      if (crop) next = next.replace(/(<a:blip [^>]*?(?:\/>|>[\s\S]*?<\/a:blip>))\s*(?:<a:srcRect[^>]*\/>)?/, `$1<a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/>`);
      return next;
    }]);
    return;
  }
  const placeholder = await images.placeholder?.({ w: element.w, h: element.h, text: element.placeholderText, colors: element.palette, shape: element.shape, radius: element.radius });
  if (placeholder) {
    // A picture, so "Change Picture" in PowerPoint keeps the frame and shape.
    target.addImage({ data: placeholder, x: inches(box.x), y: inches(box.y), w: inches(box.w), h: inches(box.h), objectName: name, altText });
    slideEdits.push([name, (block) => block.replace(/<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>/, pictureGeometry(element))]);
    return;
  }
  // No renderer available (tests, workers): a dashed frame with the caption.
  writeShape(target, { ...element, type: 'shape', fill: { color: element.palette.fill }, line: { color: element.palette.line, width: 1.5, dash: 'dash' }, shape: element.shape === 'ellipse' ? 'ellipse' : element.shape }, name, slideEdits);
  const size = Math.min(element.w, element.h) * 0.16;
  if (size >= 12) {
    const iconSize = Math.min(38, size);
    target.addShape('custGeom', {
      x: inches(element.x + element.w / 2 - iconSize / 2), y: inches(element.y + element.h / 2 - iconSize), w: inches(iconSize), h: inches(iconSize),
      points: customPoints(transformSegments(iconSegments('photo'), { scale: iconSize / 24 })), fill: { type: 'none' }, line: { color: hex(element.palette.text), width: 1.4 * iconSize / 24 }, objectName: `${name}-icon`
    });
  }
  target.addText(element.placeholderText || '', {
    x: inches(element.x + 14), y: inches(element.y + element.h / 2 + 4), w: inches(Math.max(10, element.w - 28)), h: inches(Math.min(60, element.h / 2 - 8)),
    fontSize: 13, color: hex(element.palette.text), align: 'center', valign: 'top', margin: 0, objectName: `${name}-caption`
  });
}

async function writeChart(target, element, name, { charts }) {
  // Chart text uses installed fonts: PowerPoint ignores embedded fonts on axes.
  const installed = installedFonts(element.language);
  const native = nativeChart(element, { fontFace: `${installed.latin}|${installed.eastAsian}` });
  const box = { x: inches(element.x), y: inches(element.y), w: inches(element.w), h: inches(element.h) };
  if (native) {
    target.addChart(native.type, native.data, { ...box, ...native.options, objectName: name });
    return;
  }
  const image = element.image || await charts.image?.(element.chart, { w: element.w, h: element.h }, element.colors, element);
  if (image?.data) {
    const pixels = image.pixels;
    let fitted = { x: element.x, y: element.y, w: element.w, h: element.h };
    if (pixels) {
      const ratio = pixels.width / pixels.height;
      const w = Math.min(fitted.w, fitted.h * ratio);
      fitted = { x: fitted.x, y: fitted.y + (fitted.h - w / ratio) / 2, w, h: w / ratio };
    }
    target.addImage({ data: image.data, x: inches(fitted.x), y: inches(fitted.y), w: inches(fitted.w), h: inches(fitted.h), objectName: name, altText: element.chart.title || '' });
    return;
  }
  target.addText(element.chart.title || element.chart.type, { ...box, fontSize: 14, color: hex(element.colors.muted), align: 'center', valign: 'middle', objectName: name });
}

function writeTable(target, element, name, markerFor) {
  const text = [element.columns, ...element.rows].flat().join('');
  const regular = markerFor('body', 400, text);
  const bold = markerFor('body', 700, text);
  const border = (color, width) => (color ? { type: 'solid', pt: width, color: hex(color) } : { type: 'none' });
  const none = { type: 'none' };
  const margin = [element.padding.y, element.padding.x, element.padding.y, element.padding.x];
  const header = element.columns.map((column, index) => ({
    text: column,
    options: {
      bold: bold.bold, fontFace: bold.fontFace, fontSize: element.font.size, color: hex(element.colors.header), align: element.align[index] || 'left', valign: 'middle', margin,
      fill: element.colors.headerFill ? { color: hex(element.colors.headerFill) } : undefined,
      border: [none, none, element.colors.headerRule ? border(element.colors.headerRule, 2) : none, none]
    }
  }));
  const rows = element.rows.map((row, rowIndex) => row.map((cell, index) => {
    const highlight = element.highlightRow === rowIndex + 1;
    const face = highlight ? bold : regular;
    return {
      text: cell,
      options: {
        bold: face.bold, fontFace: face.fontFace, fontSize: element.font.size, color: hex(element.colors.text), align: element.align[index] || 'left', valign: 'middle', margin,
        fill: highlight ? { color: hex(element.colors.highlight) } : undefined,
        border: [none, none, border(element.colors.rule, 1), none]
      }
    };
  }));
  target.addTable([header, ...rows], {
    x: inches(element.x), y: inches(element.y), w: inches(element.w),
    colW: element.widths.map(inches), rowH: element.rowHeights.map(inches),
    fontFace: regular.fontFace, fontSize: element.font.size, color: hex(element.colors.text), autoPage: false, objectName: name
  });
}

/** Theme fonts, so text the user adds in PowerPoint uses the design's faces. */
async function setThemeEastAsianFonts(zip, roles) {
  const path = Object.keys(zip.files).find((file) => /^ppt\/theme\/theme1\.xml$/.test(file));
  if (!path) return;
  let xml = await zip.file(path).async('string');
  const set = (group, role) => {
    xml = xml.replace(new RegExp(`(<a:${group}>[\\s\\S]*?)<a:ea typeface="[^"]*"\\/>`), `$1<a:ea typeface="${escapeXml(role.eastAsian)}"/>`);
  };
  set('majorFont', roles.heading);
  set('minorFont', roles.body);
  zip.file(path, xml);
}

export const SLIDE_SIZE = Object.freeze({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
