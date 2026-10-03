// Reads a .pptx Python wrote (python-pptx, PptxGenJS output, decks saved by
// PowerPoint) into a plain model the slide preview lays out and draws:
// per slide a background and the elements in drawing order (shapes, text,
// pictures, tables, charts, lines), all in preview pixels where the slide is
// 960 wide and 1 pt is 960 / slide width in inches / 72 pixels.
//
// Styling follows PowerPoint's inheritance: a shape's text style comes from
// the presentation defaults, the master's text styles and placeholders, the
// layout's placeholder and the shape itself, and colours from the theme.
// Nothing from the file is executed or inserted as markup. Loaded when such
// a file is previewed.

import { readChartSpace } from './pptx-chart-reader.js';
import { mergeProps, readColor, readFill, readLevel, readRun, schemeColor } from './pptx-styles.js';
import { customSegments, presetShape } from './pptx-shapes.js';

const SLIDE_PX = 960;
const MAX_SLIDES = 60;
const PLACEHOLDER_TEXT = Object.freeze({ title: 'title', ctrTitle: 'title', subTitle: 'body', body: 'body' });
const MIME = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' });

export const children = (node, name) => [...(node?.children || [])].filter((item) => item.localName === name);
export const child = (node, name) => children(node, name)[0] || null;
// A relationship attribute (r:id, r:embed): the one written with a prefix.
const relationship = (node, local) => [...(node?.attributes || [])].find((item) => item.name.endsWith(`:${local}`))?.value;
const number = (value, fallback = 0) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback);

function directory(path) {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index + 1);
}

function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `${directory(base)}${target}`.split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

function createPackage(zip, DOMParser) {
  const parsed = new Map();
  const relations = new Map();
  const xml = async (path) => {
    if (parsed.has(path)) return parsed.get(path);
    const entry = zip.file(path);
    let root = null;
    if (entry) {
      // The declaration adds nothing (files are UTF-8) and not every parser takes its single quotes.
      const text = (await entry.async('string')).replace(/^﻿?\s*(?:<\?xml[^>]*\?>)?\s*/, '');
      const document = new DOMParser().parseFromString(text, 'application/xml');
      if (document.getElementsByTagName('parsererror').length) throw new Error(`${path} could not be read`);
      root = document.documentElement;
    }
    parsed.set(path, root);
    return root;
  };
  const rels = async (path) => {
    if (relations.has(path)) return relations.get(path);
    const root = await xml(`${directory(path)}_rels/${path.slice(directory(path).length)}.rels`);
    const map = new Map(children(root, 'Relationship').map((item) => [
      item.getAttribute('Id'),
      { target: item.getAttribute('TargetMode') === 'External' ? null : resolvePath(path, item.getAttribute('Target') || ''), type: (item.getAttribute('Type') || '').split('/').pop() }
    ]));
    relations.set(path, map);
    return map;
  };
  return { zip, xml, rels };
}

// ------------------------------------------------------------ theme

function readTheme(root) {
  const scheme = {};
  const colors = child(child(root, 'themeElements'), 'clrScheme');
  for (const entry of colors?.children || []) {
    const value = [...(entry.children || [])][0];
    scheme[entry.localName] = value?.localName === 'sysClr' ? value.getAttribute('lastClr') : value?.getAttribute('val');
  }
  const fonts = child(child(root, 'themeElements'), 'fontScheme');
  const font = (kind) => ({
    latin: child(child(fonts, kind), 'latin')?.getAttribute('typeface') || undefined,
    ea: child(child(fonts, kind), 'ea')?.getAttribute('typeface') || undefined
  });
  const lines = children(child(child(child(root, 'themeElements'), 'fmtScheme'), 'lnStyleLst'), 'ln').map((line) => number(line.getAttribute('w'), 9525));
  return { colors: scheme, major: font('majorFont'), minor: font('minorFont'), lines };
}

const readColorMap = (root) => {
  const map = child(root, 'clrMap');
  const result = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  for (const attribute of map?.attributes || []) result[attribute.name] = attribute.value;
  return result;
};

// ------------------------------------------------------------ geometry

function frame(node, scale, transform) {
  const xfrm = child(node, 'xfrm');
  if (!xfrm) return null;
  const off = child(xfrm, 'off');
  const ext = child(xfrm, 'ext');
  if (!off || !ext) return null;
  const x = number(off.getAttribute('x'));
  const y = number(off.getAttribute('y'));
  const w = number(ext.getAttribute('cx'));
  const h = number(ext.getAttribute('cy'));
  return {
    x: (transform.ox + x * transform.sx) * scale,
    y: (transform.oy + y * transform.sy) * scale,
    w: w * transform.sx * scale,
    h: h * transform.sy * scale,
    rotate: number(xfrm.getAttribute('rot')) / 60000,
    flipH: xfrm.getAttribute('flipH') === '1',
    flipV: xfrm.getAttribute('flipV') === '1'
  };
}

function groupTransform(properties, parent) {
  const xfrm = child(properties, 'xfrm');
  const off = child(xfrm, 'off');
  const ext = child(xfrm, 'ext');
  const childOff = child(xfrm, 'chOff');
  const childExt = child(xfrm, 'chExt');
  if (!off || !ext || !childOff || !childExt) return parent;
  const kx = number(childExt.getAttribute('cx')) ? number(ext.getAttribute('cx')) / number(childExt.getAttribute('cx')) : 1;
  const ky = number(childExt.getAttribute('cy')) ? number(ext.getAttribute('cy')) / number(childExt.getAttribute('cy')) : 1;
  return {
    ox: parent.ox + (number(off.getAttribute('x')) - number(childOff.getAttribute('x')) * kx) * parent.sx,
    oy: parent.oy + (number(off.getAttribute('y')) - number(childOff.getAttribute('y')) * ky) * parent.sy,
    sx: kx * parent.sx,
    sy: ky * parent.sy
  };
}

// ------------------------------------------------------------ placeholders

const placeholderOf = (shape) => child(child(child(shape, 'nvSpPr') || child(shape, 'nvPicPr') || child(shape, 'nvGraphicFramePr'), 'nvPr'), 'ph');

function findPlaceholder(container, placeholder) {
  if (!placeholder) return null;
  const idx = placeholder.getAttribute('idx');
  const type = placeholder.getAttribute('type');
  const shapes = children(child(container, 'cSld') && child(child(container, 'cSld'), 'spTree'), 'sp');
  const same = (item, key, value) => placeholderOf(item)?.getAttribute(key) === value;
  return (idx && shapes.find((item) => same(item, 'idx', idx)))
    || (type && shapes.find((item) => same(item, 'type', type)))
    || (!type && shapes.find((item) => same(item, 'type', 'body')))
    || null;
}

// ------------------------------------------------------------ text

// `defaults` are the presentation and master text styles; `specific` the
// placeholder and shape styles. A colour from the shape's style
// (context.styleColor) beats the defaults but not the specific ones.
function readParagraphs(body, { defaults, specific: specificLayers }, context) {
  const layers = [...defaults, ...specificLayers];
  const { theme, scale } = context;
  const counters = [];
  return children(body, 'p').map((paragraph) => {
    const pPr = child(paragraph, 'pPr');
    const level = Math.min(8, number(pPr?.getAttribute('lvl')));
    const levelName = `lvl${level + 1}pPr`;
    const props = mergeProps(
      ...layers.map((layer) => readLevel(child(layer, levelName), context)),
      readLevel(pPr, context)
    );
    const specific = mergeProps(...specificLayers.map((layer) => readLevel(child(layer, levelName), context)), readLevel(pPr, context));
    const endProps = readRun(child(paragraph, 'endParaRPr'), context);
    const runs = [];
    const push = (item) => {
      const own = readRun(child(item, 'rPr'), context);
      const merged = mergeProps(props.def, own);
      const text = child(item, 't')?.textContent ?? '';
      if (item.localName === 'br') runs.push({ text: '\n' });
      else if (text) {
        runs.push({
          text,
          size: (merged.sz ?? 1800) / 100 * context.pt,
          bold: merged.b === true,
          italic: merged.i === true,
          underline: merged.u === true,
          color: own.color ?? specific.def?.color ?? context.styleColor ?? merged.color,
          latin: resolveFont(merged.latin, theme),
          ea: resolveFont(merged.ea, theme)
        });
      }
    };
    for (const item of paragraph.children) if (['r', 'br', 'fld'].includes(item.localName)) push(item);
    const size = ((mergeProps(props.def, endProps).sz ?? 1800) / 100) * context.pt;
    const bullet = props.bullet && props.bullet.kind !== 'none' && runs.some((run) => run.text.trim()) ? props.bullet : null;
    if (bullet?.kind === 'auto') {
      counters.length = level + 1;
      counters[level] = (counters[level] ?? (bullet.startAt - 1)) + 1;
    } else if (runs.some((run) => run.text.trim())) {
      counters.length = Math.min(counters.length, level);
    }
    return {
      level,
      align: props.algn === 'ctr' ? 'center' : props.algn === 'r' ? 'right' : 'left',
      marL: (props.marL ?? 0) * scale,
      indent: (props.indent ?? 0) * scale,
      lineSpacing: props.lnSpc,
      spaceBefore: props.spcBef,
      spaceAfter: props.spcAft,
      bullet: bullet && { ...bullet, number: bullet.kind === 'auto' ? counters[level] : undefined, color: bullet.color },
      runs,
      size
    };
  });
}

function resolveFont(typeface, theme) {
  if (!typeface) return undefined;
  if (typeface === '+mj-lt') return theme.major.latin;
  if (typeface === '+mn-lt') return theme.minor.latin;
  if (typeface === '+mj-ea') return theme.major.ea || undefined;
  if (typeface === '+mn-ea') return theme.minor.ea || undefined;
  if (typeface.startsWith('+')) return undefined;
  return typeface;
}

function textElement(body, frameBox, layers, bodyProperties, context, extras = {}) {
  const paragraphs = readParagraphs(body, layers, context);
  if (!paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.trim()))) return null;
  const merged = mergeProps(...bodyProperties);
  const inset = (key, fallback) => number(merged[key], fallback) * context.scale;
  const fit = child(body && child(body, 'bodyPr'), 'normAutofit');
  return {
    type: 'text',
    ...frameBox,
    insets: { left: inset('lIns', 91440), top: inset('tIns', 45720), right: inset('rIns', 91440), bottom: inset('bIns', 45720) },
    anchor: merged.anchor === 'ctr' ? 'middle' : merged.anchor === 'b' ? 'bottom' : 'top',
    wrap: merged.wrap !== 'none',
    fontScale: fit?.getAttribute('fontScale') ? number(fit.getAttribute('fontScale')) / 100000 : 1,
    paragraphs,
    color: extras.color,
    language: extras.language
  };
}

const bodyAttributes = (bodyPr) => {
  const result = {};
  for (const attribute of bodyPr?.attributes || []) result[attribute.name] = attribute.value;
  return result;
};

// ------------------------------------------------------------ shapes

function lineOf(properties, style, context) {
  const line = child(properties, 'ln');
  if (line && child(line, 'noFill')) return null;
  const explicit = line ? readFill(line, context) : undefined;
  const styleLine = child(style, 'lnRef');
  const styled = !explicit && styleLine && number(styleLine.getAttribute('idx')) > 0
    ? readColor(styleLine, { ...context, phClr: null })
    : null;
  const paint = explicit?.color ? explicit : styled && { color: styled.color, alpha: styled.alpha };
  if (!paint) return null;
  const width = line?.getAttribute('w')
    ? number(line.getAttribute('w'))
    : context.theme.lines[Math.max(0, number(styleLine?.getAttribute('idx'), 1) - 1)] ?? 12700;
  const dash = child(line, 'prstDash')?.getAttribute('val');
  return { color: paint.color, alpha: paint.alpha ?? 1, width: Math.max(0.5, width * context.scale), dash: Boolean(dash && dash !== 'solid') };
}

function fillOf(properties, style, context) {
  const explicit = readFill(properties, context);
  if (explicit?.none) return {};
  if (explicit?.gradient) return { gradient: explicit.gradient };
  if (explicit?.color) return { fill: { color: explicit.color, alpha: explicit.alpha ?? 1 } };
  const ref = child(style, 'fillRef');
  if (ref && number(ref.getAttribute('idx')) > 0) {
    const styled = readColor(ref, context);
    if (styled) return { fill: { color: styled.color, alpha: styled.alpha ?? 1 } };
  }
  return {};
}

async function readShape(node, context, transform, output) {
  const kind = node.localName;
  const placeholder = placeholderOf(node);
  const properties = child(node, 'spPr');
  const style = child(node, 'style');
  const layoutShape = findPlaceholder(context.layout, placeholder);
  const masterShape = findPlaceholder(context.master, placeholder);
  const box = frame(properties, context.scale, transform)
    || (layoutShape && frame(child(layoutShape, 'spPr'), context.scale, { ox: 0, oy: 0, sx: 1, sy: 1 }))
    || (masterShape && frame(child(masterShape, 'spPr'), context.scale, { ox: 0, oy: 0, sx: 1, sy: 1 }));
  if (!box) return;

  const geometry = child(properties, 'prstGeom');
  const custom = child(properties, 'custGeom');
  const preset = geometry?.getAttribute('prst') || (custom ? 'custom' : 'rect');
  const isLine = kind === 'cxnSp' || preset === 'line' || preset === 'straightConnector1' || /^(?:bent|curved)Connector/.test(preset);
  const { fill, gradient } = fillOf(properties, style, context);
  const line = lineOf(properties, style, context);

  if (isLine) {
    if (line) {
      const x2 = box.x + box.w;
      const y2 = box.y + box.h;
      output.push({
        type: 'line',
        x1: box.flipH ? x2 : box.x, y1: box.flipV ? y2 : box.y, x2: box.flipH ? box.x : x2, y2: box.flipV ? box.y : y2,
        color: line.color, width: line.width, alpha: line.alpha, dash: line.dash
      });
    }
  } else if ((fill || gradient || line) && !(placeholder && !(fill || gradient) && !line)) {
    const shape = presetShape(preset, geometry, box);
    const segments = custom ? customSegments(custom, box) : null;
    output.push({
      type: 'shape',
      ...(segments ? { shape: 'custom', segments } : shape),
      x: box.x, y: box.y, w: box.w, h: box.h, rotate: box.rotate || undefined,
      fill, gradient, line
    });
  }

  const body = child(node, 'txBody');
  if (!body) return;
  const role = placeholder ? PLACEHOLDER_TEXT[placeholder.getAttribute('type') || 'body'] : null;
  const styleName = role === 'title' ? 'titleStyle' : role === 'body' ? 'bodyStyle' : 'otherStyle';
  const layers = {
    defaults: [context.presentationText, child(context.masterStyles, styleName)].filter(Boolean),
    specific: [
      child(masterShape && child(masterShape, 'txBody'), 'lstStyle'),
      child(layoutShape && child(layoutShape, 'txBody'), 'lstStyle'),
      child(body, 'lstStyle')
    ].filter(Boolean)
  };
  const fontColor = child(style, 'fontRef') ? readColor(child(style, 'fontRef'), context) : null;
  const bodies = [
    bodyAttributes(child(masterShape && child(masterShape, 'txBody'), 'bodyPr')),
    bodyAttributes(child(layoutShape && child(layoutShape, 'txBody'), 'bodyPr')),
    bodyAttributes(child(body, 'bodyPr'))
  ];
  const textContext = { ...context, defaultColor: fontColor?.color || context.defaultColor, styleColor: fontColor?.color };
  const text = textElement(body, { x: box.x, y: box.y, w: box.w, h: box.h, rotate: box.rotate || undefined }, layers, bodies, textContext, { color: textContext.defaultColor });
  if (text) output.push(text);
}

async function readPicture(node, context, transform, output, rels) {
  const box = frame(child(node, 'spPr'), context.scale, transform);
  if (!box) return;
  const blip = child(child(node, 'blipFill'), 'blip');
  const relation = rels.get(relationship(blip, 'embed'));
  const extension = (relation?.target || '').split('.').pop().toLowerCase();
  const crop = child(child(node, 'blipFill'), 'srcRect');
  const cropped = crop && {
    l: number(crop.getAttribute('l')) / 100000, t: number(crop.getAttribute('t')) / 100000,
    r: number(crop.getAttribute('r')) / 100000, b: number(crop.getAttribute('b')) / 100000
  };
  let data = null;
  if (relation?.target && MIME[extension] && context.pkg.zip.file(relation.target)) {
    data = `data:${MIME[extension]};base64,${await context.pkg.zip.file(relation.target).async('base64')}`;
  }
  const geometry = child(child(node, 'spPr'), 'prstGeom')?.getAttribute('prst');
  output.push({
    type: 'image', x: box.x, y: box.y, w: box.w, h: box.h, rotate: box.rotate || undefined,
    shape: geometry === 'ellipse' ? 'ellipse' : 'rect', data,
    crop: cropped && (cropped.l || cropped.t || cropped.r || cropped.b) && cropped.l + cropped.r < 1 && cropped.t + cropped.b < 1 ? cropped : undefined
  });
}

// ------------------------------------------------------------ tables

const TABLE_STYLES = Object.freeze({
  '{2D5ABB26-0587-4C30-8999-92F81FD0307C}': { none: true },
  '{5940675A-B579-460E-94D1-54222C63F5DA}': { grid: true }
});

async function readTable(frameNode, table, box, context) {
  const columns = children(child(table, 'tblGrid'), 'gridCol').map((column) => number(column.getAttribute('w')) * context.scale);
  const properties = child(table, 'tblPr');
  const styleId = child(properties, 'tableStyleId')?.textContent?.trim();
  const style = TABLE_STYLES[styleId] || {};
  const accent = schemeColor('accent1', context) ?? { color: '#4F81BD' };
  const flags = { first: properties?.getAttribute('firstRow') === '1', band: properties?.getAttribute('bandRow') === '1' };
  const rows = [];
  children(table, 'tr').forEach((row, rowIndex) => {
    const cells = children(row, 'tc').map((cell) => {
      const cellProperties = child(cell, 'tcPr');
      const fill = fillOf(cellProperties, null, context).fill;
      const header = flags.first && rowIndex === 0 && !style.none && !style.grid;
      const band = flags.band && rowIndex > 0 && !style.none && !style.grid;
      const styled = header
        ? { fill: { color: accent.color, alpha: 1 }, color: '#FFFFFF', bold: true }
        : band ? { fill: { color: mixWithWhite(accent.color, rowIndex % 2 ? 0.4 : 0.2), alpha: 1 } } : {};
      const runContext = { ...context, defaultColor: styled.color || context.defaultColor, styleColor: styled.color };
      const layers = { defaults: [context.presentationText, child(context.masterStyles, 'otherStyle')].filter(Boolean), specific: [] };
      const paragraphs = readParagraphs(child(cell, 'txBody'), layers, runContext);
      if (styled.bold) paragraphs.forEach((paragraph) => paragraph.runs.forEach((run) => { run.bold ||= true; }));
      const borderColor = style.grid ? '#000000' : (header || band || fill) && !style.none ? '#FFFFFF' : null;
      return {
        span: number(cell.getAttribute('gridSpan'), 1),
        skip: cell.getAttribute('hMerge') === '1' || cell.getAttribute('vMerge') === '1',
        fill: fill || styled.fill,
        paragraphs,
        color: runContext.defaultColor,
        anchor: cellProperties?.getAttribute('anchor') === 'ctr' ? 'middle' : cellProperties?.getAttribute('anchor') === 'b' ? 'bottom' : 'top',
        margins: {
          left: number(cellProperties?.getAttribute('marL'), 91440) * context.scale, right: number(cellProperties?.getAttribute('marR'), 91440) * context.scale,
          top: number(cellProperties?.getAttribute('marT'), 45720) * context.scale, bottom: number(cellProperties?.getAttribute('marB'), 45720) * context.scale
        },
        border: borderColor
      };
    });
    rows.push({ height: number(row.getAttribute('h')) * context.scale, cells });
  });
  return { type: 'table', x: box.x, y: box.y, w: box.w, h: box.h, columns, rows };
}

function mixWithWhite(hex, share) {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = (channel) => Math.round(channel * share + 255 * (1 - share));
  return `#${[value >> 16, (value >> 8) & 255, value & 255].map(mix).map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

// ------------------------------------------------------------ frames and groups

async function readGraphicFrame(node, context, transform, output, rels) {
  const box = frame(node, context.scale, transform);
  if (!box) return;
  const data = child(child(node, 'graphic'), 'graphicData');
  const table = child(data, 'tbl');
  if (table) {
    output.push(await readTable(node, table, box, context));
    return;
  }
  const chartReference = child(data, 'chart');
  if (chartReference) {
    const id = relationship(chartReference, 'id');
    const path = rels.get(id)?.target;
    const root = path ? await context.pkg.xml(path) : null;
    const native = root ? readChartSpace(root, { paint: (node) => readFill(node, context)?.color || null, scheme: (name) => schemeColor(name, context)?.color, scale: context.pt }) : null;
    output.push(native
      ? { type: 'chart', x: box.x, y: box.y, w: box.w, h: box.h, native }
      : { type: 'shape', shape: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, line: { color: '#9CA3AF', width: 1, alpha: 1, dash: true } });
  }
}

async function readTree(tree, context, transform, output, rels, { skipPlaceholders = false } = {}) {
  for (const node of tree?.children || []) {
    const name = node.localName;
    if (skipPlaceholders && placeholderOf(node)) continue;
    if (name === 'sp' || name === 'cxnSp') await readShape(node, context, transform, output);
    else if (name === 'pic') await readPicture(node, context, transform, output, rels);
    else if (name === 'graphicFrame') await readGraphicFrame(node, context, transform, output, rels);
    else if (name === 'grpSp') await readTree(node, context, groupTransform(child(node, 'grpSpPr'), transform), output, rels, { skipPlaceholders });
  }
}

// ------------------------------------------------------------ backgrounds

async function readBackground(container, context, rels) {
  const background = child(child(container, 'cSld'), 'bg');
  if (!background) return null;
  const properties = child(background, 'bgPr');
  if (properties) {
    const fill = readFill(properties, context);
    if (fill?.color) return { color: fill.color };
    if (fill?.gradient) return { color: fill.gradient.from.color };
    const blip = child(properties, 'blipFill');
    const id = relationship(child(blip, 'blip'), 'embed');
    const target = rels.get(id)?.target;
    const extension = (target || '').split('.').pop().toLowerCase();
    if (target && MIME[extension] && context.pkg.zip.file(target)) return { image: `data:${MIME[extension]};base64,${await context.pkg.zip.file(target).async('base64')}` };
  }
  const reference = child(background, 'bgRef');
  const color = reference && readColor(reference, context);
  return color ? { color: color.color } : null;
}

// ------------------------------------------------------------ entry

export async function readPresentation(blob, { JSZip, DOMParser = globalThis.DOMParser } = {}) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const pkg = createPackage(zip, DOMParser);
  const presentation = await pkg.xml('ppt/presentation.xml');
  if (!presentation) throw new Error('not a PowerPoint file');
  const size = child(presentation, 'sldSz');
  const cx = number(size?.getAttribute('cx'), 12192000);
  const cy = number(size?.getAttribute('cy'), 6858000);
  const scale = SLIDE_PX / cx;
  const width = SLIDE_PX;
  const height = Math.round(cy * scale * 100) / 100;
  const presentationRels = await pkg.rels('ppt/presentation.xml');
  let slidePaths = children(child(presentation, 'sldIdLst'), 'sldId')
    .map((item) => presentationRels.get(relationship(item, 'id'))?.target)
    .filter(Boolean);
  // A parser that merges r:id into id leaves the list empty; files list their slides in order.
  if (!slidePaths.length) slidePaths = [...presentationRels.values()].filter((item) => item.type === 'slide').map((item) => item.target);
  if (!slidePaths.length) throw new Error('the presentation has no slides');

  const slides = [];
  const cache = new Map();
  for (const path of slidePaths.slice(0, MAX_SLIDES)) {
    const slide = await pkg.xml(path);
    const slideRels = await pkg.rels(path);
    const layoutPath = [...slideRels.values()].find((item) => item.type === 'slideLayout')?.target;
    const layout = layoutPath ? await pkg.xml(layoutPath) : null;
    const layoutRels = layoutPath ? await pkg.rels(layoutPath) : new Map();
    const masterPath = [...layoutRels.values()].find((item) => item.type === 'slideMaster')?.target;
    const master = masterPath ? await pkg.xml(masterPath) : null;
    const masterRels = masterPath ? await pkg.rels(masterPath) : new Map();
    const themePath = [...masterRels.values()].find((item) => item.type === 'theme')?.target;
    if (themePath && !cache.has(themePath)) cache.set(themePath, readTheme(await pkg.xml(themePath)));
    const theme = cache.get(themePath) || readTheme(null);
    const context = {
      pkg,
      scale,
      pt: 12700 * scale,
      theme,
      clrMap: master ? readColorMap(master) : readColorMap(null),
      layout,
      master,
      masterStyles: child(master, 'txStyles'),
      presentationText: child(presentation, 'defaultTextStyle'),
      defaultColor: schemeColor('tx1', { theme, clrMap: readColorMap(master) })?.color || '#000000'
    };
    const identity = { ox: 0, oy: 0, sx: 1, sy: 1 };
    const elements = [];
    const background = (await readBackground(slide, context, slideRels))
      || (layout && await readBackground(layout, context, layoutRels))
      || (master && await readBackground(master, context, masterRels))
      || { color: '#FFFFFF' };
    if (child(slide, 'cSld') && slide.getAttribute('showMasterSp') !== '0') {
      if (master && layout?.getAttribute('showMasterSp') !== '0') await readTree(child(child(master, 'cSld'), 'spTree'), context, identity, elements, masterRels, { skipPlaceholders: true });
      if (layout) await readTree(child(child(layout, 'cSld'), 'spTree'), context, identity, elements, layoutRels, { skipPlaceholders: true });
    }
    await readTree(child(child(slide, 'cSld'), 'spTree'), context, identity, elements, slideRels);
    slides.push({ number: slides.length + 1, background, elements });
  }
  return { width, height, slides, truncated: slidePaths.length > MAX_SLIDES };
}
