// DocumentSpec: the intermediate format a model (or plan B's Python code)
// writes for a presentation. This module turns whatever arrived into a clean,
// bounded structure: known layouts with known fields, a complete design, a
// document language and a list of issues describing every correction.
//
// Nothing here measures text; splitting over-long slides is the layout
// engine's job. Normalisation only guarantees shape, types and hard limits.

import { normalizeChartSchema } from '../../charts/chart-schema.js';
import { normalizeDesign } from './design-params.js';
import { normalizeIconName } from './icons.js';
import { detectDocumentLanguage, normalizeLanguage } from './language.js';
import { parseMarkdownDeck } from './markdown-deck.js';
import { parseRelaxedJson, RelaxedJsonError } from './relaxed-json.js';

export const SLIDE_LAYOUTS = Object.freeze([
  'cover', 'agenda', 'section', 'bullets', 'split', 'image', 'twoColumn', 'cards', 'bigNumber',
  'stats', 'timeline', 'comparison', 'quote', 'gallery', 'table', 'chart', 'closing'
]);

// Hard limits protect memory and the renderer; content beyond them is dropped
// with an issue. Soft capacity (how much fits on one slide) lives in
// LAYOUT_CAPACITY and is enforced later by continuing onto a new slide.
export const SPEC_LIMITS = Object.freeze({
  slides: 60, text: 1000, title: 200, kicker: 80, notes: 4000, source: 300, images: 20,
  bullets: 30, children: 8, items: 12, cards: 8, stats: 8, steps: 12, columns: 3,
  tableColumns: 12, tableRows: 200, galleryImages: 12, designs: 3
});

export const LAYOUT_CAPACITY = Object.freeze({
  agenda: 6, bullets: 6, cards: 4, stats: 4, timeline: 6, comparison: 3, gallery: 6, tableRows: 8, tableColumns: 6, closing: 4
});

const LAYOUT_ALIASES = Object.freeze({
  cover: 'cover', title: 'cover', titleslide: 'cover', hero: 'cover', intro: 'cover', opening: 'cover', front: 'cover',
  agenda: 'agenda', toc: 'agenda', contents: 'agenda', tableofcontents: 'agenda', outline: 'agenda', overview: 'agenda',
  section: 'section', divider: 'section', chapter: 'section', sectionheader: 'section', sectiontitle: 'section', part: 'section',
  bullets: 'bullets', bullet: 'bullets', content: 'bullets', text: 'bullets', list: 'bullets', points: 'bullets', titlecontent: 'bullets', body: 'bullets',
  split: 'split', mediatext: 'split', textimage: 'split', imagetext: 'split', sidebyside: 'split',
  image: 'image', fullimage: 'image', photo: 'image', fullbleed: 'image', picture: 'image', visual: 'image',
  twocolumn: 'twoColumn', twocolumns: 'twoColumn', columns: 'twoColumn', twocol: 'twoColumn',
  cards: 'cards', card: 'cards', features: 'cards', grid: 'cards', threecolumn: 'cards', threecolumns: 'cards', pillars: 'cards',
  bignumber: 'bigNumber', number: 'bigNumber', metric: 'bigNumber', statistic: 'bigNumber', stat: 'bigNumber', highlight: 'bigNumber', keynumber: 'bigNumber',
  stats: 'stats', kpi: 'stats', kpis: 'stats', metrics: 'stats', numbers: 'stats', statistics: 'stats', dashboard: 'stats',
  timeline: 'timeline', process: 'timeline', steps: 'timeline', roadmap: 'timeline', milestones: 'timeline', journey: 'timeline',
  comparison: 'comparison', compare: 'comparison', versus: 'comparison', vs: 'comparison', beforeafter: 'comparison', proscons: 'comparison',
  quote: 'quote', quotation: 'quote', testimonial: 'quote', citation: 'quote',
  gallery: 'gallery', photos: 'gallery', images: 'gallery', imagegrid: 'gallery', portfolio: 'gallery',
  table: 'table', datatable: 'table', data: 'table', matrix: 'table',
  chart: 'chart', graph: 'chart', figure: 'chart', plot: 'chart',
  closing: 'closing', end: 'closing', thanks: 'closing', thankyou: 'closing', conclusion: 'closing', summary: 'closing', nextsteps: 'closing', cta: 'closing', outro: 'closing'
});
const SIDE_ALIASES = Object.freeze({ imageleft: 'left', leftimage: 'left', imageright: 'right', rightimage: 'right' });

// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const fold = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Reads fields case- and separator-insensitively, first alias that exists. */
function reader(object) {
  const folded = new Map();
  if (isRecord(object)) Object.entries(object).forEach(([key, value]) => { if (!folded.has(fold(key))) folded.set(fold(key), value); });
  return (...names) => {
    for (const name of names) {
      const value = folded.get(fold(name));
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  };
}

function createContext(uiLanguage) {
  const issues = [];
  let imageCount = 0;
  return {
    issues,
    uiLanguage,
    issue(code, details = {}) { issues.push({ code, ...details }); },
    takeImage() {
      imageCount += 1;
      return imageCount <= SPEC_LIMITS.images;
    }
  };
}

function text(value, limit, context, where) {
  if (value == null) return '';
  const source = typeof value === 'string' || typeof value === 'number' ? String(value)
    : Array.isArray(value) ? value.filter((item) => typeof item === 'string' || typeof item === 'number').join('\n')
      : isRecord(value) ? String(value.text ?? value.title ?? value.label ?? '') : '';
  const clean = source.replace(XML_INVALID, '').replace(/\r\n?/g, '\n').trim();
  if (clean.length <= limit) return clean;
  context?.issue('text-truncated', { ...where, length: clean.length, limit });
  return clean.slice(0, limit).trimEnd();
}

const BULLET_MARKER = /^\s*(?:[-*+\u2022\u00B7\u25AA\u25CF]|\d{1,2}[.)])\s+/;

function bulletList(value, context, where, depth = 0) {
  let items = value;
  if (typeof items === 'string') {
    // "- a\n- b" or plain lines.
    items = items.split('\n').map((line) => line.replace(BULLET_MARKER, '').trim()).filter(Boolean);
  }
  if (!Array.isArray(items)) return [];
  const limit = depth === 0 ? SPEC_LIMITS.bullets : SPEC_LIMITS.children;
  if (items.length > limit) context.issue('too-many-items', { ...where, count: items.length, limit });
  return items.slice(0, limit).map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return { text: text(item, SPEC_LIMITS.text, context, where), children: [] };
    const field = reader(item);
    const children = depth === 0 ? bulletList(field('children', 'items', 'sub', 'subitems', 'bullets', 'points'), context, where, 1) : [];
    return { text: text(field('text', 'title', 'label', 'content', 'body', 'point'), SPEC_LIMITS.text, context, where), children: children.map((child) => ({ text: child.text, children: [] })) };
  }).filter((item) => item.text);
}

/**
 * Image references: "upload:N" (the Nth image the user attached to this
 * conversation), "asset:name.png" (a file produced by plan B), or a
 * placeholder frame the user replaces in PowerPoint. Web URLs and requests to
 * generate images become placeholders: files never fetch from the internet.
 */
function image(value, context, where) {
  if (value == null || value === '' || value === false) return null;
  const field = reader(value);
  const uploadIndex = typeof value === 'string' ? undefined : field('upload');
  const source = typeof value === 'string' ? value
    : Number.isInteger(Number(uploadIndex)) ? `upload:${uploadIndex}` : field('src', 'source', 'ref', 'url', 'upload', 'asset');
  const alt = text(typeof value === 'string' ? '' : field('alt', 'description', 'caption', 'placeholder', 'generate', 'prompt'), 200, context, where);
  const fit = /^contain$/i.test(String(field('fit') ?? '')) ? 'contain' : 'cover';
  const focus = ['top', 'bottom', 'left', 'right', 'center'].includes(String(field('focus', 'position') ?? '').toLowerCase()) ? String(field('focus', 'position')).toLowerCase() : 'center';
  if (!context.takeImage()) {
    context.issue('too-many-images', { ...where, limit: SPEC_LIMITS.images });
    return null;
  }
  const upload = /^upload:(\d{1,2})$/i.exec(String(source ?? '').trim());
  if (upload && Number(upload[1]) >= 1) return { kind: 'upload', index: Number(upload[1]), alt, fit, focus };
  const asset = /^asset:([\w.\-\u00C0-\uFFFF ]{1,120})$/i.exec(String(source ?? '').trim());
  if (asset) return { kind: 'asset', name: asset[1].trim(), alt, fit, focus };
  const placeholderText = text(field('placeholder') ?? (typeof value === 'string' && !/^[a-z]+:/i.test(value) ? value : '') ?? '', 200, context, where);
  if (source && /^[a-z][a-z0-9+.-]*:/i.test(String(source))) context.issue('external-image', { ...where });
  if (typeof value !== 'string' && field('generate', 'prompt') !== undefined) context.issue('image-generation-not-supported', { ...where });
  return { kind: 'placeholder', text: placeholderText || alt, alt: alt || placeholderText, fit, focus };
}

function trendOf(change) {
  const value = String(change ?? '').trim();
  if (/^[+\u25B2\u2191]/.test(value)) return 'up';
  if (/^[-\u2212\u25BC\u2193]/.test(value)) return 'down';
  return 'none';
}

const ALIGNMENTS = new Set(['left', 'right', 'center']);
// Numbers with optional currency, sign, % or unit (k, M, B, 萬, 億, 元).
const NUMERIC_CELL = /^[\s(]*[-+\u2212]?[$\u20AC\u00A3\u00A5NT]*\s*\d[\d,.\s\u202F\u00A0]*\s*(?:%|[kKmMbB]|\u842C|\u5104|\u5143)?[)\s]*$/;

function parseMarkdownTable(source) {
  const rows = String(source).split('\n').map((line) => line.trim()).filter((line) => line.includes('|'));
  const cells = (line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  if (rows.length < 2) return null;
  const header = cells(rows[0]);
  const separator = /^\|?\s*:?-{2,}/.test(rows[1]) ? cells(rows[1]) : null;
  const align = separator?.map((cell) => (cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left'));
  return { columns: header, rows: rows.slice(separator ? 2 : 1).map(cells), align };
}

function table(value, context, where) {
  let input = value;
  if (typeof input === 'string') input = parseMarkdownTable(input);
  if (Array.isArray(input)) input = { columns: input[0], rows: input.slice(1) };
  if (!isRecord(input)) return null;
  const field = reader(input);
  const cell = (item) => text(isRecord(item) ? item.value ?? item.text : item, 300, context, where);
  let columns = field('columns', 'headers', 'header', 'head');
  let rows = field('rows', 'data', 'body', 'cells');
  if (!Array.isArray(rows)) return null;
  rows = rows.map((row) => (Array.isArray(row) ? row : isRecord(row) && Array.isArray(columns) ? columns.map((column) => row[isRecord(column) ? column.label : column]) : [row]));
  if (!Array.isArray(columns)) columns = rows.shift() || [];
  columns = columns.map((column) => cell(isRecord(column) ? column.label ?? column.title ?? column.name : column));
  const width = Math.min(SPEC_LIMITS.tableColumns, Math.max(columns.length, ...rows.map((row) => row.length)));
  if (width < 1) return null;
  if (rows.length > SPEC_LIMITS.tableRows) context.issue('too-many-rows', { ...where, count: rows.length, limit: SPEC_LIMITS.tableRows });
  const body = rows.slice(0, SPEC_LIMITS.tableRows).map((row) => Array.from({ length: width }, (_, index) => cell(row[index])));
  const header = Array.from({ length: width }, (_, index) => columns[index] || '');
  const givenAlign = Array.isArray(field('align', 'alignment')) ? field('align', 'alignment') : [];
  const align = header.map((_, index) => {
    const given = String(givenAlign[index] ?? '').toLowerCase();
    if (ALIGNMENTS.has(given)) return given;
    const values = body.map((row) => row[index]).filter(Boolean);
    return values.length && values.every((entry) => NUMERIC_CELL.test(entry)) ? 'right' : 'left';
  });
  const highlight = Number.parseInt(field('highlightRow', 'highlight', 'emphasisRow'), 10);
  return { columns: header, rows: body, align, highlightRow: Number.isInteger(highlight) && highlight >= 1 && highlight <= body.length ? highlight : null };
}

function listOf(value, limit, context, where) {
  if (!Array.isArray(value)) return [];
  if (value.length > limit) context.issue('too-many-items', { ...where, count: value.length, limit });
  return value.slice(0, limit);
}

function inferLayout(field, index) {
  if (field('chart', 'graph')) return 'chart';
  if (field('table')) return 'table';
  const stats = field('stats', 'metrics', 'kpis', 'numbers');
  if (Array.isArray(stats)) return stats.length === 1 ? 'bigNumber' : 'stats';
  if (field('value', 'bigNumber', 'metric', 'number')) return 'bigNumber';
  if (Array.isArray(field('steps', 'timeline', 'milestones', 'phases'))) return 'timeline';
  if (field('quote', 'quotation', 'testimonial')) return 'quote';
  if (Array.isArray(field('cards', 'features', 'pillars'))) return 'cards';
  const columns = field('columns', 'options', 'sides');
  if (Array.isArray(columns)) return columns.some((column) => reader(column)('highlight', 'recommended', 'selected')) || field('comparison', 'versus') ? 'comparison' : 'twoColumn';
  if (Array.isArray(field('images', 'photos', 'gallery'))) return 'gallery';
  if (field('image', 'photo', 'picture')) return field('bullets', 'points', 'body', 'text', 'content') ? 'split' : 'image';
  if (Array.isArray(field('items', 'agenda', 'sections')) && !field('bullets', 'points')) return 'agenda';
  if (index === 0) return 'cover';
  if (!field('bullets', 'points', 'body', 'text', 'content', 'items') && field('title', 'heading') && field('subtitle')) return 'section';
  return 'bullets';
}

function resolveLayout(field, index, context) {
  const written = field('layout', 'type', 'template', 'kind');
  if (written !== undefined) {
    const folded = fold(written);
    const layout = LAYOUT_ALIASES[folded] || (SIDE_ALIASES[folded] ? 'split' : null);
    if (layout) return { layout, side: SIDE_ALIASES[folded] || null };
    context.issue('unknown-layout', { slide: index + 1, layout: String(written) });
  }
  return { layout: inferLayout(field, index), side: null };
}

const BACKGROUNDS = Object.freeze({ default: 'default', normal: 'default', accent: 'accent', inverse: 'accent', dark: 'accent', color: 'accent', colour: 'accent', emphasis: 'accent', soft: 'soft', light: 'soft', tint: 'soft', tinted: 'soft' });

// Builds one slide; returns null for a slide with nothing to show.
function normalizeSlide(raw, index, context) {
  if (typeof raw === 'string') raw = { title: raw };
  if (!isRecord(raw)) {
    context.issue('invalid-slide', { slide: index + 1 });
    return null;
  }
  const field = reader(raw);
  const where = { slide: index + 1 };
  const resolved = resolveLayout(field, index, context);
  let layout = resolved.layout;
  const slide = {
    layout,
    title: text(field('title', 'heading', 'headline'), SPEC_LIMITS.title, context, where),
    kicker: text(field('kicker', 'eyebrow', 'overline', 'tag', 'category'), SPEC_LIMITS.kicker, context, where),
    notes: text(field('notes', 'speakerNotes', 'presenterNotes', 'note'), SPEC_LIMITS.notes, context, where),
    source: text(field('source', 'sources', 'citation', 'reference', 'footnote'), SPEC_LIMITS.source, context, where),
    background: BACKGROUNDS[fold(field('background', 'tone', 'emphasis'))] || 'default'
  };
  // Lists come from list fields; a string `content` is prose, an array is a list.
  const contentField = field('content');
  const listField = field('bullets', 'points', 'items', 'list') ?? (Array.isArray(contentField) ? contentField : undefined);
  const body = () => text(field('body', 'text', 'description', 'lead', 'paragraph') ?? (typeof contentField === 'string' ? contentField : undefined), SPEC_LIMITS.text, context, where);
  const bullets = () => bulletList(listField, context, where);
  const changeLayout = (to, reason) => {
    context.issue('layout-changed', { slide: index + 1, from: layout, to, reason });
    layout = to;
    slide.layout = to;
  };

  switch (layout) {
    case 'cover':
      slide.subtitle = text(field('subtitle', 'subheading', 'tagline', 'lead', 'description'), SPEC_LIMITS.text, context, where);
      slide.image = image(field('image', 'photo', 'picture', 'backgroundImage'), context, where);
      break;
    case 'agenda': {
      const items = listOf(field('items', 'agenda', 'sections', 'bullets', 'points'), SPEC_LIMITS.items, context, where)
        .map((item) => {
          const itemField = reader(item);
          return typeof item === 'string' || typeof item === 'number'
            ? { title: text(item, 200, context, where), description: '' }
            : { title: text(itemField('title', 'text', 'label', 'name'), 200, context, where), description: text(itemField('description', 'body', 'detail'), 300, context, where) };
        })
        .filter((item) => item.title);
      slide.items = items;
      if (!items.length) changeLayout('bullets', 'no-items');
      break;
    }
    case 'section': {
      slide.subtitle = text(field('subtitle', 'subheading', 'description', 'lead'), SPEC_LIMITS.text, context, where);
      const number = Number.parseInt(field('number', 'index', 'num'), 10);
      slide.number = Number.isInteger(number) && number >= 0 && number < 1000 ? number : null;
      break;
    }
    case 'split': {
      slide.body = body();
      slide.bullets = bullets();
      slide.image = image(field('image', 'photo', 'picture'), context, where);
      const side = String(field('imageSide', 'side', 'imagePosition', 'mediaSide') ?? resolved.side ?? '').toLowerCase();
      slide.imageSide = side === 'left' ? 'left' : side === 'right' ? 'right' : null;
      break;
    }
    case 'image':
      slide.caption = text(field('caption', 'subtitle', 'description', 'body', 'text'), SPEC_LIMITS.text, context, where);
      slide.image = image(field('image', 'photo', 'picture'), context, where);
      break;
    case 'twoColumn':
    case 'comparison': {
      const columns = listOf(field('columns', 'options', 'sides', 'cards'), SPEC_LIMITS.columns + 1, context, where).map((column) => {
        const columnField = reader(column);
        return {
          heading: text(typeof column === 'string' ? column : columnField('heading', 'title', 'label', 'name'), 200, context, where),
          items: bulletList(columnField('items', 'bullets', 'points', 'list'), context, where).map((item) => item.text),
          body: text(columnField('body', 'text', 'description'), SPEC_LIMITS.text, context, where),
          highlight: Boolean(columnField('highlight', 'recommended', 'selected', 'emphasis'))
        };
      }).filter((column) => column.heading || column.items.length || column.body);
      slide.columns = columns;
      if (columns.length < 2) {
        changeLayout('bullets', 'needs-two-columns');
        slide.bullets = columns.flatMap((column) => [column.heading, ...column.items, column.body]).filter(Boolean).map((line) => ({ text: line, children: [] }));
      } else if (layout === 'twoColumn' && columns.length > 2) {
        changeLayout('cards', 'more-than-two-columns');
        slide.cards = columns.map((column) => ({ icon: null, label: '', title: column.heading, body: [column.body, ...column.items].filter(Boolean).join('\n') }));
        delete slide.columns;
      } else if (columns.length > SPEC_LIMITS.columns) {
        context.issue('too-many-items', { ...where, count: columns.length, limit: SPEC_LIMITS.columns });
        slide.columns = columns.slice(0, SPEC_LIMITS.columns);
      }
      break;
    }
    case 'cards': {
      const cards = listOf(field('cards', 'features', 'pillars', 'items', 'columns'), SPEC_LIMITS.cards, context, where).map((card) => {
        const cardField = reader(card);
        const icon = cardField('icon');
        const iconName = normalizeIconName(icon);
        if (icon && !iconName) context.issue('unknown-icon', { ...where, icon: String(icon) });
        return typeof card === 'string'
          ? { icon: null, label: '', title: text(card, 200, context, where), body: '' }
          : { icon: iconName, label: text(cardField('label', 'tag', 'kicker', 'category'), SPEC_LIMITS.kicker, context, where), title: text(cardField('title', 'heading', 'name'), 200, context, where), body: text(cardField('body', 'text', 'description', 'content'), SPEC_LIMITS.text, context, where) };
      }).filter((card) => card.title || card.body);
      slide.cards = cards;
      if (cards.length < 2) {
        changeLayout('bullets', 'needs-two-cards');
        slide.bullets = cards.flatMap((card) => [card.title, card.body]).filter(Boolean).map((line) => ({ text: line, children: [] }));
      }
      break;
    }
    case 'bigNumber': {
      const stats = field('stats', 'metrics');
      const first = Array.isArray(stats) ? reader(stats[0]) : field;
      slide.value = text(first('value', 'bigNumber', 'number', 'metric', 'stat'), 40, context, where);
      slide.label = text(first('label', 'caption', 'metricLabel'), 200, context, where);
      slide.body = text(first('body', 'text', 'description', 'context', 'detail'), SPEC_LIMITS.text, context, where);
      slide.change = text(first('change', 'delta', 'trend', 'growth'), 60, context, where);
      slide.trend = trendOf(slide.change);
      if (!slide.value) {
        changeLayout('bullets', 'no-value');
        slide.bullets = [slide.label, slide.body].filter(Boolean).map((line) => ({ text: line, children: [] }));
        slide.body = '';
      }
      break;
    }
    case 'stats': {
      const stats = listOf(field('stats', 'metrics', 'kpis', 'numbers', 'items'), SPEC_LIMITS.stats, context, where).map((stat) => {
        const statField = reader(stat);
        const change = text(statField('change', 'delta', 'trend', 'growth', 'diff'), 60, context, where);
        const icon = normalizeIconName(statField('icon'));
        return { value: text(statField('value', 'number', 'metric', 'stat'), 40, context, where), label: text(statField('label', 'title', 'name', 'caption'), 200, context, where), change, trend: trendOf(change), note: text(statField('note', 'detail', 'description'), 200, context, where), icon };
      }).filter((stat) => stat.value);
      slide.stats = stats;
      if (stats.length === 1) {
        changeLayout('bigNumber', 'single-stat');
        Object.assign(slide, { value: stats[0].value, label: stats[0].label, body: stats[0].note, change: stats[0].change, trend: stats[0].trend });
        delete slide.stats;
      } else if (!stats.length) {
        changeLayout('bullets', 'no-stats');
        slide.bullets = bullets();
      }
      break;
    }
    case 'timeline': {
      const steps = listOf(field('steps', 'timeline', 'milestones', 'phases', 'items'), SPEC_LIMITS.steps, context, where).map((step) => {
        const stepField = reader(step);
        return typeof step === 'string'
          ? { label: '', title: text(step, 200, context, where), body: '', icon: null }
          : { label: text(stepField('label', 'date', 'when', 'time', 'period', 'phase'), 60, context, where), title: text(stepField('title', 'heading', 'name', 'milestone'), 200, context, where), body: text(stepField('body', 'text', 'description', 'detail'), SPEC_LIMITS.text, context, where), icon: normalizeIconName(stepField('icon')) };
      }).filter((step) => step.title || step.body);
      slide.steps = steps;
      if (steps.length < 2) {
        changeLayout('bullets', 'needs-two-steps');
        slide.bullets = steps.map((step) => ({ text: [step.label, step.title, step.body].filter(Boolean).join(' '), children: [] }));
      }
      break;
    }
    case 'quote': {
      slide.quote = text(field('quote', 'quotation', 'testimonial', 'text', 'body'), SPEC_LIMITS.text, context, where);
      slide.attribution = text(field('attribution', 'author', 'by', 'speaker', 'name'), 200, context, where);
      slide.role = text(field('role', 'position', 'company', 'organization', 'affiliation'), 200, context, where);
      slide.image = image(field('image', 'photo', 'portrait', 'avatar'), context, where);
      if (!slide.quote && slide.title) {
        slide.quote = slide.title;
        slide.title = '';
      }
      if (!slide.quote) changeLayout('bullets', 'no-quote');
      break;
    }
    case 'gallery': {
      const images = listOf(field('images', 'photos', 'gallery', 'items'), SPEC_LIMITS.galleryImages, context, where).map((entry) => {
        const imageField = reader(entry);
        return { image: image(typeof entry === 'string' ? entry : entry, context, where), caption: text(typeof entry === 'string' ? '' : imageField('caption', 'title', 'label'), 200, context, where) };
      }).filter((entry) => entry.image);
      slide.images = images;
      if (!images.length) changeLayout('bullets', 'no-images');
      break;
    }
    case 'table':
      slide.table = table(field('table', 'data', 'rows'), context, where);
      if (!slide.table || !slide.table.rows.length) changeLayout('bullets', 'no-table');
      break;
    case 'chart': {
      const chartInput = field('chart', 'graph', 'data');
      const chart = isRecord(chartInput) ? normalizeChartSchema(chartInput) : typeof chartInput === 'string' ? normalizeChartFromText(chartInput) : { ok: false, reason: 'missing-chart' };
      slide.chart = chart.ok ? chart.chart : null;
      slide.takeaway = text(field('takeaway', 'insight', 'caption', 'body', 'text', 'description'), SPEC_LIMITS.text, context, where);
      if (!chart.ok) {
        context.issue('invalid-chart', { ...where, reason: chart.reason });
        changeLayout('bullets', 'no-chart');
        if (slide.takeaway) slide.bullets = [{ text: slide.takeaway, children: [] }];
        slide.body = '';
      }
      break;
    }
    case 'closing':
      slide.bullets = bulletList(field('bullets', 'points', 'next', 'nextSteps', 'items', 'steps'), context, where);
      slide.contact = text(field('contact', 'cta', 'callToAction', 'email'), 300, context, where);
      slide.subtitle = text(field('subtitle', 'body', 'text'), SPEC_LIMITS.text, context, where);
      break;
    default:
      break;
  }

  if (slide.layout === 'bullets') {
    slide.bullets = slide.bullets?.length ? slide.bullets : bullets();
    if (slide.body === undefined) slide.body = body();
    slide.callout = text(field('callout', 'takeaway', 'keyPoint', 'highlight', 'summary'), SPEC_LIMITS.text, context, where);
    if (slide.bullets.length > LAYOUT_CAPACITY.bullets) context.issue('over-capacity', { ...where, count: slide.bullets.length, capacity: LAYOUT_CAPACITY.bullets });
    if (!slide.bullets.length && !slide.body && !slide.callout && !slide.title) return null;
  }
  for (const [key, capacity] of [['cards', LAYOUT_CAPACITY.cards], ['stats', LAYOUT_CAPACITY.stats], ['steps', LAYOUT_CAPACITY.timeline], ['images', LAYOUT_CAPACITY.gallery], ['items', LAYOUT_CAPACITY.agenda]]) {
    if (Array.isArray(slide[key]) && slide[key].length > capacity) context.issue('over-capacity', { ...where, count: slide[key].length, capacity });
  }
  if (slide.table && slide.table.rows.length > LAYOUT_CAPACITY.tableRows) context.issue('over-capacity', { ...where, count: slide.table.rows.length, capacity: LAYOUT_CAPACITY.tableRows });
  return slide;
}

function normalizeChartFromText(source) {
  try {
    const { value } = parseRelaxedJson(source);
    return isRecord(value) ? normalizeChartSchema(value) : { ok: false, reason: 'invalid-chart' };
  } catch {
    return { ok: false, reason: 'invalid-chart' };
  }
}

function collectText(slides, meta) {
  const parts = [meta.title, meta.subtitle];
  const visit = (value) => {
    if (typeof value === 'string') parts.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (isRecord(value)) Object.entries(value).forEach(([key, child]) => { if (!['layout', 'background', 'kind', 'fit', 'focus', 'trend', 'icon', 'align', 'imageSide'].includes(key)) visit(child); });
  };
  visit(slides);
  return parts.join('\n');
}

/**
 * Normalises a parsed spec object. `uiLanguage` is only a fallback for the
 * document language when the content itself does not tell.
 */
export function normalizeDocumentSpec(input, { uiLanguage = 'zh-TW' } = {}) {
  const context = createContext(uiLanguage);
  const source = Array.isArray(input) ? { slides: input } : isRecord(input) ? input : {};
  if (source !== input) context.issue(Array.isArray(input) ? 'slides-without-document' : 'invalid-document');
  const field = reader(source);

  const meta = {
    title: text(field('title', 'name', 'deckTitle'), SPEC_LIMITS.title, context, { field: 'title' }),
    subtitle: text(field('subtitle', 'subheading', 'tagline'), SPEC_LIMITS.text, context, { field: 'subtitle' }),
    author: text(field('author', 'presenter', 'by', 'organization', 'company'), 200, context, { field: 'author' }),
    date: text(field('date'), 60, context, { field: 'date' }),
    footer: text(field('footer'), 200, context, { field: 'footer' }),
    slideNumbers: field('slideNumbers', 'pageNumbers', 'numbers') !== false
  };

  const designInput = field('design', 'theme');
  const presetShortcut = field('preset', 'template', 'style');
  const alternativesInput = Array.isArray(field('designs')) ? field('designs').slice(0, SPEC_LIMITS.designs) : [];
  // Without a chosen design, the first of the offered directions is used.
  const chosen = isRecord(designInput) ? designInput
    : presetShortcut != null || typeof designInput === 'string' ? { preset: typeof designInput === 'string' ? designInput : presetShortcut }
      : isRecord(alternativesInput[0]) ? alternativesInput[0] : {};
  const { design, preset, label, issues: designIssues } = normalizeDesign(chosen);
  designIssues.forEach((issue) => context.issue(`design-${issue.code}`, issue));
  const alternatives = alternativesInput.map((entry) => normalizeDesign(entry));

  let rawSlides = field('slides', 'pages', 'deck', 'content');
  if (!Array.isArray(rawSlides)) {
    context.issue('no-slides');
    rawSlides = [];
  }
  if (rawSlides.length > SPEC_LIMITS.slides) context.issue('too-many-slides', { count: rawSlides.length, limit: SPEC_LIMITS.slides });
  const slides = rawSlides.slice(0, SPEC_LIMITS.slides).map((raw, index) => normalizeSlide(raw, index, context)).filter(Boolean);

  if (!meta.title) meta.title = slides.find((slide) => slide.layout === 'cover')?.title || slides[0]?.title || '';
  // Section numbers the model left out count up in document order.
  let sectionNumber = 0;
  slides.forEach((slide) => {
    if (slide.layout !== 'section') return;
    sectionNumber = slide.number ?? sectionNumber + 1;
    slide.number = sectionNumber;
  });

  const written = normalizeLanguage(field('language', 'lang', 'locale'));
  const language = written || detectDocumentLanguage(collectText(slides, meta), uiLanguage);
  return {
    meta: { ...meta, language },
    design,
    preset,
    designLabel: label,
    designs: alternatives.map((entry) => ({ design: entry.design, preset: entry.preset, label: entry.label })),
    slides,
    issues: context.issues
  };
}

const FENCED = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1\s*$/;

/**
 * Reads what the model wrote inside a ````file name.pptx block: JSON
 * (preferred) or Markdown (for models that cannot write JSON reliably).
 */
export function parseDocumentSpec(content, { uiLanguage = 'zh-TW' } = {}) {
  let source = String(content ?? '').replace(/^\uFEFF/, '');
  const fenced = FENCED.exec(source);
  if (fenced) source = fenced[2];
  const trimmed = source.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };

  if (/^[{[]/.test(trimmed)) {
    try {
      const { value, repairs } = parseRelaxedJson(trimmed);
      const spec = normalizeDocumentSpec(value, { uiLanguage });
      if (!spec.slides.length) return { ok: false, reason: 'no-slides', spec };
      return { ok: true, format: 'json', repairs, spec };
    } catch (error) {
      if (error instanceof RelaxedJsonError) return { ok: false, reason: 'invalid-json', position: error.position };
      throw error;
    }
  }
  const spec = normalizeDocumentSpec(parseMarkdownDeck(trimmed), { uiLanguage });
  if (!spec.slides.length) return { ok: false, reason: 'no-slides', spec };
  return { ok: true, format: 'markdown', repairs: [], spec };
}
