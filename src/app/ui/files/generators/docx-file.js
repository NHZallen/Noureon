// Markdown document → .docx. The block model (document-model.js) is rendered
// with a theme: the document design named in front matter (a template or the
// model's parameters, see document-design.js), or the original look for
// documents that name none.
//
// Designed documents get their fonts as embedded subsets in a browser, a
// cover page when the design has one, and the heading, table and paragraph
// treatments of their template. Without a DOM (tests, workers) the file is
// the same except that fonts are only named, not embedded.

import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalAlignSection,
  WidthType
} from 'docx';
import JSZip from 'jszip';
import { buildDocumentTheme, legacyDocumentTheme } from '../design/document-design.js';
import { FONT_FAMILIES, fontSource } from '../design/fonts.js';
import { renderChartImages } from './chart-images.js';
import { CHART_TABLE_LABELS, IMAGE_LABELS, TOC_LABELS } from './document-labels.js';
import { buildDocumentModel, collectHeadings, runsToPlainText } from './document-model.js';
import { createDisplayEquation, createInlineEquation } from './docx-omml.js';
import { embedFontsInDocument, prepareEmbeddedFamilies } from './font-embedding.js';
import { runFaces } from './pptx-text.js';

const HEADING_STYLES = ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'];
const TWIPS_PER_MM = 56.6929;
const EAST_ASIAN_TEXT = /[⺀-鿿가-힯豈-﫿＀-￯]/;

const PAGE_SIZES_MM = Object.freeze({
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B5: [176, 250], LETTER: [215.9, 279.4], LEGAL: [215.9, 355.6]
});

// Covers that take a page of their own (a separate section without header,
// footer or page number); the others are a title block on the first page.
const PAGE_COVERS = new Set(['page', 'band', 'shapes', 'title']);
// Full-bleed covers draw colour blocks from the page edges.
const BLEED_COVERS = new Set(['band', 'shapes']);

const visualLength = (text) => [...String(text || '')].reduce((total, char) => total + (/[⺀-￿]/.test(char) ? 2 : 1), 0);
const fontAttributes = (face) => ({ ascii: face.latin, hAnsi: face.latin, cs: face.latin, eastAsia: face.eastAsian });
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };

class DocxRenderer {
  constructor({ meta, language, theme, chartImages }) {
    this.meta = meta;
    this.language = language;
    this.theme = theme;
    this.colors = theme.colors;
    this.sizes = theme.sizes;
    this.chartImages = chartImages;
    this.orderedInstance = 0;
    this.orderedStarts = new Set([1]);
    // Faces and text per Office typeface, for embedding font subsets.
    this.faces = [];
    this.textByTypeface = new Map();
    const [widthMm, heightMm] = PAGE_SIZES_MM[meta.pageSize] || PAGE_SIZES_MM.A4;
    const portraitWidth = Math.round(widthMm * TWIPS_PER_MM);
    const portraitHeight = Math.round(heightMm * TWIPS_PER_MM);
    this.page = { width: portraitWidth, height: portraitHeight };
    const landscape = meta.orientation === 'landscape';
    this.pageWidth = landscape ? portraitHeight : portraitWidth;
    this.pageHeight = landscape ? portraitWidth : portraitHeight;
    this.margin = theme.margin;
    this.contentWidth = this.pageWidth - this.margin * 2;
    // The highest heading level the document uses (models write ## sections).
    this.topLevel = 1;
  }

  // ---------------------------------------------------------- fonts

  /** The faces of a role at a weight; `text` is recorded for embedding. */
  face(role, weight, text = '') {
    const { theme } = this;
    if (theme.legacy) {
      const legacy = { heading: theme.fonts.heading, title: theme.fonts.title, mono: theme.fonts.code }[role] || (weight >= 600 ? theme.fonts.bodyBold : theme.fonts.body);
      return legacy;
    }
    if (role === 'mono' && !theme.embedded) return { latin: 'Consolas', eastAsian: runFaces(theme.roles, 'body', 400).eastAsian, bold: false };
    const register = (face) => {
      if (!text || !theme.embedded) return;
      if (face.script === 'eastAsian' && !EAST_ASIAN_TEXT.test(text)) return;
      this.faces.push(face);
      this.textByTypeface.set(face.typeface, (this.textByTypeface.get(face.typeface) || '') + text);
    };
    return runFaces(theme.roles, role === 'title' ? 'heading' : role, weight, register);
  }

  headingWeight() {
    return this.theme.legacy ? 700 : this.theme.design.headingWeight;
  }

  // Records text drawn in a role so its characters are in the subset.
  track(role, weight, text) {
    if (!this.theme.legacy && text) this.face(role, weight, text);
  }

  // ---------------------------------------------------------- inline

  textRun(run, extra = {}) {
    if (run.break) return new TextRun({ break: 1 });
    const text = run.image ? `[${IMAGE_LABELS[this.language] || IMAGE_LABELS.en}${run.text ? `: ${run.text}` : ''}]` : run.text;
    const role = run.code ? 'mono' : extra.role || 'body';
    const bold = run.bold || extra.bold;
    this.track(role, role === 'heading' ? this.headingWeight() : bold ? 700 : 400, text);
    const code = run.code ? this.face('mono', 400) : null;
    return new TextRun({
      text,
      bold: bold || undefined,
      italics: run.italic || run.image || extra.italics || undefined,
      strike: run.strike || undefined,
      underline: run.underline ? {} : undefined,
      superScript: run.superscript || undefined,
      subScript: run.subscript || undefined,
      color: run.image ? this.colors.muted : extra.color,
      size: extra.size,
      style: run.link ? 'Hyperlink' : undefined,
      ...(code ? {
        font: fontAttributes(code),
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.colors.inlineCodeFill }
      } : {})
    });
  }

  // Consecutive runs pointing at the same URL become one hyperlink.
  inlineChildren(runs = [], extra = {}) {
    const children = [];
    let linkGroup = null;
    const flush = () => {
      if (linkGroup) children.push(new ExternalHyperlink({ link: linkGroup.href, children: linkGroup.runs }));
      linkGroup = null;
    };
    runs.forEach((run) => {
      const child = run.math !== undefined ? createInlineEquation(run.math) : this.textRun(run, extra);
      if (run.link && run.math === undefined) {
        if (linkGroup?.href !== run.link) {
          flush();
          linkGroup = { href: run.link, runs: [] };
        }
        linkGroup.runs.push(child);
        return;
      }
      flush();
      children.push(child);
    });
    flush();
    return children;
  }

  // A plain run of generated text (titles, labels, headers) in a role.
  plainRun(text, { role = 'body', weight = 400, ...options } = {}) {
    this.track(role, weight, text);
    return new TextRun({ text, ...options });
  }

  // ---------------------------------------------------------- blocks

  renderBlocks(blocks, context = {}) {
    return blocks.flatMap((block) => this.renderBlock(block, context));
  }

  renderBlock(block, context) {
    switch (block.type) {
      case 'heading': {
        const children = this.inlineChildren(block.runs, { role: 'heading' });
        return [new Paragraph({
          style: HEADING_STYLES[block.level - 1],
          keepNext: true,
          children: [new Bookmark({ id: block.anchor, children })]
        })];
      }
      case 'paragraph': {
        // First-line indents belong to running text only, never to quotes,
        // list continuations or table cells.
        const firstLine = !context.quote && !context.indent && !context.cell ? this.theme.spacing.firstLine : 0;
        return [new Paragraph({
          style: context.quote ? 'NoureonQuote' : undefined,
          indent: context.indent ? { left: context.indent } : firstLine ? { firstLine } : undefined,
          children: this.inlineChildren(block.runs)
        })];
      }
      case 'list':
        return this.renderList(block, context);
      case 'table':
        return [this.renderTable(block), new Paragraph({ spacing: { after: 60 }, children: [] })];
      case 'code':
        return [this.renderCode(block, context)];
      case 'quote':
        return this.renderBlocks(block.blocks, { ...context, quote: true });
      case 'rule':
        return [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: this.colors.border, space: 1 } },
          spacing: { before: 120, after: 240 },
          children: []
        })];
      case 'pagebreak':
        return [new Paragraph({ children: [new PageBreak()] })];
      case 'math':
        return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [createDisplayEquation(block.latex)] })];
      case 'chart':
        return this.renderChart(block.chart);
      default:
        return [];
    }
  }

  renderList(block, context, level = 0) {
    const paragraphs = [];
    let reference = 'noureon-bullets';
    let instance = 0;
    if (block.ordered) {
      this.orderedStarts.add(block.start);
      reference = `noureon-numbers-${block.start}`;
      this.orderedInstance += 1;
      instance = this.orderedInstance;
    }
    const itemIndent = 420 * (level + 1) + 300;

    block.items.forEach((item) => {
      let first = true;
      item.blocks.forEach((child) => {
        if (child.type === 'list') {
          paragraphs.push(...this.renderList(child, context, Math.min(level + 1, 8)));
          return;
        }
        if (first && (child.type === 'paragraph' || child.type === 'heading')) {
          first = false;
          const runs = child.runs;
          if (item.checked !== null) {
            paragraphs.push(new Paragraph({
              style: context.quote ? 'NoureonQuote' : undefined,
              indent: { left: itemIndent, hanging: 300 },
              // Word tabs to a hanging indent implicitly; other renderers
              // (previews, LibreOffice) need the stop spelled out.
              tabStops: [{ type: TabStopType.LEFT, position: itemIndent }],
              spacing: { after: 60 },
              children: [
                new TextRun({ children: [item.checked ? '☑' : '☐', new Tab()], font: 'Segoe UI Symbol' }),
                ...this.inlineChildren(runs)
              ]
            }));
          } else {
            paragraphs.push(new Paragraph({
              style: context.quote ? 'NoureonQuote' : undefined,
              numbering: { reference, level, instance },
              spacing: { after: 60 },
              children: this.inlineChildren(runs)
            }));
          }
          return;
        }
        first = false;
        paragraphs.push(...this.renderBlock(child, { ...context, indent: itemIndent }));
      });
      if (first) {
        paragraphs.push(new Paragraph({ numbering: { reference, level, instance }, children: [] }));
      }
    });
    return paragraphs;
  }

  columnWidths(block) {
    const columnCount = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);
    const weights = Array.from({ length: columnCount }, (_, index) => {
      const lengths = [block.header[index], ...block.rows.map((row) => row[index])]
        .map((runs) => Math.min(60, visualLength(runsToPlainText(runs || []))));
      return Math.max(4, ...lengths);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return weights.map((weight) => Math.max(600, Math.floor((weight / total) * this.contentWidth)));
  }

  // Borders and fills of the three table treatments: a full grid, the
  // horizontal rules of book and APA tables, or a tinted header with bands.
  tableLook() {
    const { colors } = this;
    const style = this.theme.tables;
    const thin = { style: BorderStyle.SINGLE, size: 4, color: colors.border };
    if (style === 'lines') {
      // The rules sit on the cells: renderers other than Word (the preview,
      // LibreOffice) draw a table's top and bottom border on every row.
      const heavy = { style: BorderStyle.SINGLE, size: 12, color: colors.text };
      const medium = { style: BorderStyle.SINGLE, size: 6, color: colors.text };
      return {
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        headerFill: null,
        cellBorders: (header, last) => (header ? { top: heavy, bottom: last ? heavy : medium } : last ? { bottom: heavy } : undefined),
        stripe: null
      };
    }
    if (style === 'shaded') {
      return {
        borders: { top: NO_BORDER, bottom: thin, left: NO_BORDER, right: NO_BORDER, insideHorizontal: thin, insideVertical: NO_BORDER },
        headerFill: colors.headerFill,
        cellBorders: () => undefined,
        stripe: colors.stripeFill
      };
    }
    return {
      borders: { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin },
      headerFill: colors.headerFill,
      cellBorders: () => undefined,
      stripe: colors.stripeFill
    };
  }

  renderTable(block) {
    const widths = this.columnWidths(block);
    const columnCount = widths.length;
    const look = this.tableLook();
    const alignment = (index) => ({ center: AlignmentType.CENTER, right: AlignmentType.RIGHT })[block.align[index]] || AlignmentType.LEFT;
    // Table text stays single spaced even in a double-spaced document.
    const cellSpacing = this.theme.legacy ? { before: 0, after: 0 } : { before: 0, after: 0, line: Math.min(this.theme.spacing.line, 276) };
    const cell = (runs, index, { header = false, stripe = false, last = false } = {}) => new TableCell({
      width: { size: widths[index], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      shading: header && look.headerFill
        ? { type: ShadingType.CLEAR, color: 'auto', fill: look.headerFill }
        : stripe && look.stripe ? { type: ShadingType.CLEAR, color: 'auto', fill: look.stripe } : undefined,
      borders: look.cellBorders(header, last),
      children: [new Paragraph({
        alignment: alignment(index),
        spacing: cellSpacing,
        children: this.inlineChildren(runs || [], header ? { bold: true } : {})
      })]
    });
    const pad = (row) => Array.from({ length: columnCount }, (_, index) => row[index] || []);

    return new Table({
      width: { size: this.contentWidth, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: look.borders,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: pad(block.header).map((runs, index) => cell(runs, index, { header: true, last: block.rows.length === 0 })) }),
        ...block.rows.map((row, rowIndex) => new TableRow({
          cantSplit: true,
          children: pad(row).map((runs, index) => cell(runs, index, { stripe: rowIndex % 2 === 1, last: rowIndex === block.rows.length - 1 }))
        }))
      ]
    });
  }

  renderCode(block, context) {
    const lines = block.text.split('\n');
    const children = [];
    this.track('mono', 400, block.text);
    lines.forEach((line, index) => {
      if (index > 0) children.push(new TextRun({ break: 1 }));
      children.push(new TextRun({ text: line }));
    });
    return new Paragraph({
      style: 'NoureonCode',
      indent: context.indent ? { left: context.indent + 170, right: 170 } : undefined,
      children
    });
  }

  renderChart(chart) {
    const image = this.chartImages.get(chart);
    // Under a picture the caption follows it; above a data table it must stay
    // on the same page as the table it names.
    const caption = chart.title
      ? [new Paragraph({ style: 'NoureonCaption', keepNext: !image, children: [this.plainRun(chart.title)] })]
      : [];
    if (image) {
      const maxWidthPx = Math.floor(this.contentWidth / 15);
      const width = Math.min(maxWidthPx, 620);
      const height = Math.round(width * (image.height / image.width));
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true,
          spacing: { before: 120, after: 60 },
          children: [new ImageRun({
            type: 'svg',
            data: image.svg,
            fallback: { type: 'png', data: image.png },
            transformation: { width, height },
            altText: { title: chart.title || 'Chart', description: chart.description || chart.title || 'Chart', name: 'chart' }
          })]
        }),
        ...caption
      ];
    }
    return [...caption, ...this.renderChartTable(chart)];
  }

  // Without a browser to draw the chart (tests, failures), the data is still
  // delivered as a readable table rather than silently dropped.
  renderChartTable(chart) {
    const rows = Array.isArray(chart.data) ? chart.data : Array.isArray(chart.links) ? chart.links : Array.isArray(chart.bins) ? chart.bins : [];
    if (rows.length === 0) return [];
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))]
      .filter((key) => ['string', 'number'].includes(typeof rows.find((row) => row?.[key] !== undefined)?.[key]));
    if (keys.length === 0) return [];
    const toRuns = (value) => [{ text: value === undefined || value === null ? '' : String(value) }];
    const labels = CHART_TABLE_LABELS[this.language] || CHART_TABLE_LABELS.en;
    const seriesLabels = new Map((chart.series || []).map((series) => [series.key, series.label]));
    const headerFor = (key) => {
      if (seriesLabels.has(key)) return seriesLabels.get(key);
      if (key === 'label') return chart.xLabel || labels.label;
      if (key === 'value') return chart.yLabel || (chart.unit ? `${labels.value} (${chart.unit})` : labels.value);
      return labels[key] || key;
    };
    return [this.renderTable({
      align: keys.map((key) => (typeof rows[0]?.[key] === 'number' ? 'right' : 'left')),
      header: keys.map((key) => toRuns(headerFor(key))),
      rows: rows.map((row) => keys.map((key) => toRuns(row?.[key])))
    }), new Paragraph({ children: [] })];
  }

  // ---------------------------------------------------------- title and cover

  byline() {
    return [this.meta.author, this.meta.date].filter(Boolean).join('　·　');
  }

  // The title at the top of the first page (covers "none" and "block").
  renderTitleBlock() {
    const blocks = [];
    const { title, subtitle } = this.meta;
    const byline = this.byline();
    const block = this.theme.cover === 'block';
    const alignment = this.theme.titleAlign === 'center' && !block ? AlignmentType.CENTER : undefined;
    if (title) blocks.push(new Paragraph({ style: 'Title', alignment, children: [this.plainRun(title, { role: 'title', weight: this.headingWeight() })] }));
    if (subtitle) blocks.push(new Paragraph({ style: 'Subtitle', alignment, children: [this.plainRun(subtitle)] }));
    if (byline) {
      blocks.push(new Paragraph({
        alignment,
        spacing: { after: block ? 0 : 360 },
        children: [this.plainRun(byline, { color: this.colors.muted, size: this.sizes.byline })]
      }));
    }
    if (!block || !blocks.length) return blocks;
    // "Sideline": the title block in one cell with a vertical rule beside
    // it, so the rule is one bar in every renderer.
    return [new Table({
      width: { size: this.contentWidth, type: WidthType.DXA },
      columnWidths: [this.contentWidth],
      layout: TableLayoutType.FIXED,
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      rows: [new TableRow({ children: [new TableCell({
        width: { size: this.contentWidth, type: WidthType.DXA },
        margins: { left: 300, right: 0, top: 60, bottom: 60 },
        borders: { left: { style: BorderStyle.SINGLE, size: 24, color: this.colors.accent } },
        children: blocks
      })] })]
    }), new Paragraph({ spacing: { after: 360 }, children: [] })];
  }

  // A short accent rule: an empty paragraph with a top border, narrowed by
  // its indents.
  accentRule({ center = false, width = 1080, left = 0, available = this.contentWidth, color = this.colors.accent, before = 240, after = 240 } = {}) {
    const indent = center
      ? { left: Math.round((available - width) / 2), right: Math.round((available - width) / 2) }
      : { left, right: Math.max(0, available - left - width) };
    return new Paragraph({
      indent,
      spacing: { before, after },
      border: { top: { style: BorderStyle.SINGLE, size: 18, color, space: 1 } },
      children: []
    });
  }

  coverTitle(text, { alignment, color, indent, before = 0 } = {}) {
    const design = this.theme.design;
    const face = this.face('title', this.headingWeight(), text);
    return new Paragraph({
      alignment,
      indent,
      keepNext: true,
      spacing: { before, after: 200, line: Math.round(this.sizes.coverTitle * 11.5), lineRule: 'atLeast' },
      children: [new TextRun({
        text,
        font: fontAttributes(face),
        bold: face.bold,
        size: this.sizes.coverTitle,
        color: color || this.colors.title,
        allCaps: design.headingCase === 'upper' || undefined,
        smallCaps: design.headingCase === 'smallcaps' || undefined,
        characterSpacing: this.theme.headingTracking ? Math.round(this.theme.headingTracking * this.sizes.coverTitle * 10) : undefined
      })]
    });
  }

  coverText(text, { alignment, color = this.colors.muted, size = this.sizes.subtitle, indent, before = 0, after = 120 } = {}) {
    return new Paragraph({ alignment, indent, spacing: { before, after }, children: [this.plainRun(text, { color, size })] });
  }

  /** Children and section settings of a cover page, or null. */
  renderCover() {
    const { cover } = this.theme;
    if (!PAGE_COVERS.has(cover)) return null;
    const { title, subtitle, date } = this.meta;
    const heading = title || subtitle;
    if (!heading) return null;
    const colors = this.colors;
    const byline = this.byline();
    const center = this.theme.titleAlign === 'center';
    const alignment = center ? AlignmentType.CENTER : undefined;
    const children = [];

    if (cover === 'title') {
      // An APA title page: centred in the upper half, double spaced.
      children.push(this.coverTitle(heading, { alignment: AlignmentType.CENTER, before: 2880 }));
      if (subtitle && title) children.push(this.coverText(subtitle, { alignment: AlignmentType.CENTER, color: colors.text, size: this.sizes.body }));
      children.push(new Paragraph({ children: [] }));
      [this.meta.author, date].filter(Boolean).forEach((line) => children.push(this.coverText(line, { alignment: AlignmentType.CENTER, color: colors.text, size: this.sizes.body, after: 0 })));
      return { children, verticalAlign: VerticalAlignSection.TOP, bleed: false };
    }

    if (cover === 'page') {
      children.push(this.accentRule({ center, before: 0, after: 360 }));
      children.push(this.coverTitle(heading, { alignment }));
      if (subtitle && title) children.push(this.coverText(subtitle, { alignment, after: 480 }));
      if (byline) children.push(this.coverText(byline, { alignment, size: this.sizes.byline, before: 240 }));
      return { children, verticalAlign: center ? VerticalAlignSection.CENTER : VerticalAlignSection.BOTTOM, bleed: false };
    }

    // Full-bleed covers: the section has no side or top margins, so text
    // sits inside the usual margin through indents and cell margins.
    const pageWidth = this.pageWidth;
    const inset = { left: this.margin, right: this.margin };
    const block = (fill, width) => new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
      children: [new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] })]
    });
    const tableOf = (rows, widths) => new Table({
      width: { size: pageWidth, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      rows
    });

    if (cover === 'band') {
      // A colour band over the upper part of the page with the title in it.
      const bandHeight = Math.round(this.pageHeight * 0.56);
      const bandText = [
        ...(date ? [this.coverText(date, { color: colors.onFillMuted, size: this.sizes.small, after: 240 })] : []),
        this.coverTitle(heading, { color: colors.onFill }),
        ...(subtitle && title ? [this.coverText(subtitle, { color: colors.onFillMuted, after: 0 })] : [])
      ];
      children.push(tableOf([new TableRow({
        height: { value: bandHeight, rule: HeightRule.EXACT },
        children: [new TableCell({
          width: { size: pageWidth, type: WidthType.DXA },
          verticalAlign: VerticalAlign.BOTTOM,
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: colors.fill },
          margins: { left: this.margin, right: this.margin, bottom: 720, top: 720 },
          children: bandText
        })]
      })], [pageWidth]));
      if (this.meta.author) children.push(this.coverText(this.meta.author, { indent: inset, color: colors.text, size: this.sizes.byline, before: 600 }));
      return { children, verticalAlign: VerticalAlignSection.TOP, bleed: true };
    }

    // "shapes": a mosaic of colour blocks across the top, then the title.
    const columns = 4;
    const width = Math.floor(pageWidth / columns);
    const widths = Array.from({ length: columns }, (_, index) => (index === columns - 1 ? pageWidth - width * (columns - 1) : width));
    const rowHeight = Math.round(this.pageHeight * 0.11);
    const pattern = [
      [colors.accent, colors.soft, colors.accent2, colors.fill],
      [null, colors.accent2Soft, colors.accent, null]
    ];
    children.push(tableOf(pattern.map((fills) => new TableRow({
      height: { value: rowHeight, rule: HeightRule.EXACT },
      children: fills.map((fill, index) => block(fill, widths[index]))
    })), widths));
    children.push(this.coverTitle(heading, { indent: inset, before: 1440 }));
    if (subtitle && title) children.push(this.coverText(subtitle, { indent: inset, after: 240 }));
    children.push(this.accentRule({ left: this.margin, available: pageWidth, before: 120, after: 240 }));
    if (byline) children.push(this.coverText(byline, { indent: inset, size: this.sizes.byline }));
    return { children, verticalAlign: VerticalAlignSection.TOP, bleed: true };
  }

  // A static table of contents built from internal links: it needs no field
  // update prompt and works in Word, LibreOffice, Pages and Google Docs alike.
  renderTableOfContents(blocks) {
    const headings = collectHeadings(blocks, 3);
    if (headings.length === 0) return [];
    const minimum = Math.min(...headings.map((heading) => heading.level));
    return [
      new Paragraph({ style: 'NoureonTocTitle', children: [this.plainRun(TOC_LABELS[this.language] || TOC_LABELS.en, { role: 'heading', weight: this.headingWeight() })] }),
      ...headings.map((heading) => new Paragraph({
        indent: { left: (heading.level - minimum) * 420 },
        spacing: { after: 60 },
        children: [new InternalHyperlink({
          anchor: heading.anchor,
          children: [this.plainRun(runsToPlainText(heading.runs).trim(), { color: this.colors.text, size: this.theme.legacy ? (heading.level === minimum ? 22 : 21) : this.sizes.body })]
        })]
      })),
      new Paragraph({ children: [new PageBreak()] })
    ];
  }

  headerFooter({ sectionTotal = false } = {}) {
    const small = { color: this.colors.muted, size: this.sizes.small };
    const total = sectionTotal ? PageNumber.TOTAL_PAGES_IN_SECTION : PageNumber.TOTAL_PAGES;
    const numberInHeader = this.meta.pageNumbers && this.theme.pageNumber === 'header';
    let headers;
    if (numberInHeader) {
      // Running head on the left, page number on the right (APA).
      headers = { default: new Header({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: this.contentWidth }],
        children: [
          ...(this.meta.header ? [this.plainRun(this.meta.header, small)] : []),
          new TextRun({ children: [new Tab(), PageNumber.CURRENT], ...small })
        ]
      })] }) };
    } else if (this.meta.header) {
      headers = { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [this.plainRun(this.meta.header, small)] })] }) };
    }
    const footerParagraphs = [];
    if (this.meta.footer) {
      footerParagraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [this.plainRun(this.meta.footer, small)] }));
    }
    if (this.meta.pageNumbers && !numberInHeader) {
      this.track('body', 400, '0123456789 / ');
      footerParagraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ children: [PageNumber.CURRENT], ...small }),
          new TextRun({ text: ' / ', ...small }),
          new TextRun({ children: [total], ...small })
        ]
      }));
    }
    const footers = footerParagraphs.length ? { default: new Footer({ children: footerParagraphs }) } : undefined;
    return { headers, footers };
  }

  numberingConfig() {
    const bulletGlyphs = ['•', '◦', '▪'];
    const numberFormats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
    const levels = (build) => Array.from({ length: 9 }, (_, level) => ({
      level,
      alignment: AlignmentType.LEFT,
      ...build(level),
      style: { paragraph: { indent: { left: 420 * (level + 1) + 300, hanging: 300 } } }
    }));
    return [
      {
        reference: 'noureon-bullets',
        levels: levels((level) => ({ format: LevelFormat.BULLET, text: bulletGlyphs[level % 3] }))
      },
      ...[...this.orderedStarts].map((start) => ({
        reference: `noureon-numbers-${start}`,
        levels: levels((level) => ({
          format: numberFormats[level % 3],
          text: `%${level + 1}.`,
          start: level === 0 ? start : 1
        }))
      }))
    ];
  }

  // ---------------------------------------------------------- styles

  styles() {
    return this.theme.legacy ? this.legacyStyles() : this.designedStyles();
  }

  designedStyles() {
    const { colors, sizes, theme } = this;
    const { spacing, design } = theme;
    const body = this.face('body', 400);
    const heading = this.face('heading', this.headingWeight());
    const mono = this.face('mono', 400);
    const caseFor = (level) => (level <= 2 ? {
      allCaps: design.headingCase === 'upper' || undefined,
      smallCaps: design.headingCase === 'smallcaps' || undefined
    } : {});
    const tracking = (size) => (theme.headingTracking ? Math.round(theme.headingTracking * size * 10) : undefined);
    const decoration = (level) => {
      if (theme.headings === 'rule' && level === 1) return { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: colors.rule, space: 4 } } };
      if (theme.headings === 'bar' && level <= 2) return { border: { left: { style: BorderStyle.SINGLE, size: level === 1 ? 30 : 18, color: colors.accent, space: 10 } }, indent: { left: 240 } };
      if (theme.headings === 'shaded' && level === 1) return { shading: { type: ShadingType.CLEAR, color: 'auto', fill: colors.fill }, border: { left: { style: BorderStyle.SINGLE, size: 6, color: colors.fill, space: 6 } } };
      if (theme.headings === 'centered' && level === 1) return { alignment: AlignmentType.CENTER };
      return {};
    };
    const headingColor = (level) => {
      if (theme.headings === 'shaded' && level === 1) return colors.onFill;
      if (level <= 2) return colors.heading;
      if (level <= 4) return colors.subheading;
      return level === 5 ? colors.minor : colors.muted;
    };
    // Treatments follow a heading's rank below the top level the document
    // uses: sections written as ## get the main heading's size and rule.
    const headingStyle = (level) => {
      const rank = Math.min(6, Math.max(1, level - this.topLevel + 1));
      const size = sizes[`h${rank}`];
      return {
        run: {
          size,
          bold: heading.bold,
          italics: theme.headings === 'centered' && rank === 3 ? true : undefined,
          color: headingColor(rank),
          font: fontAttributes(heading),
          characterSpacing: rank <= 2 ? tracking(size) : undefined,
          ...caseFor(rank)
        },
        paragraph: {
          spacing: { before: spacing.headingBefore[rank - 1], after: spacing.headingAfter, line: theme.design.paragraphs === 'indented' ? spacing.line : undefined },
          keepNext: true,
          keepLines: true,
          ...decoration(rank)
        }
      };
    };
    return {
      default: {
        document: {
          run: {
            font: fontAttributes(body),
            size: sizes.body,
            color: colors.text,
            language: { value: 'en-US', eastAsia: theme.eastAsiaLanguage }
          },
          paragraph: { spacing: { after: spacing.after, line: spacing.line } }
        },
        title: {
          run: { size: sizes.title, bold: heading.bold, color: colors.title, font: fontAttributes(heading), characterSpacing: tracking(sizes.title), ...caseFor(1) },
          paragraph: { spacing: { after: 120, line: Math.max(240, Math.round(sizes.title * 11)), lineRule: 'atLeast' } }
        },
        heading1: headingStyle(1),
        heading2: headingStyle(2),
        heading3: headingStyle(3),
        heading4: headingStyle(4),
        heading5: headingStyle(5),
        heading6: headingStyle(6),
        hyperlink: { run: { color: colors.link, underline: { type: 'single' } } }
      },
      paragraphStyles: [
        {
          id: 'Subtitle',
          name: 'Subtitle',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: sizes.subtitle, color: colors.muted },
          paragraph: { spacing: { after: 160 } }
        },
        {
          id: 'NoureonCode',
          name: 'Code Block',
          basedOn: 'Normal',
          run: { font: fontAttributes(mono), size: sizes.code },
          paragraph: {
            spacing: { before: 80, after: 200, line: 264 },
            indent: { left: 170, right: 170 },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: colors.codeFill },
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: colors.codeBorder, space: 6 },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: colors.codeBorder, space: 6 },
              left: { style: BorderStyle.SINGLE, size: 4, color: colors.codeBorder, space: 6 },
              right: { style: BorderStyle.SINGLE, size: 4, color: colors.codeBorder, space: 6 }
            }
          }
        },
        {
          id: 'NoureonQuote',
          name: 'Quote Block',
          basedOn: 'Normal',
          run: { color: colors.quote },
          paragraph: {
            indent: { left: 360 },
            spacing: { after: 100 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: colors.quoteBar, space: 10 } }
          }
        },
        {
          id: 'NoureonCaption',
          name: 'Figure Caption',
          basedOn: 'Normal',
          run: { size: sizes.caption, color: colors.muted },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 40, after: 240, line: Math.min(spacing.line, 276) } }
        },
        {
          id: 'NoureonTocTitle',
          name: 'Contents Heading',
          basedOn: 'Normal',
          run: { size: sizes.toc, bold: heading.bold, color: colors.heading, font: fontAttributes(heading), ...caseFor(1) },
          paragraph: { spacing: { after: 200 } }
        }
      ]
    };
  }

  legacyStyles() {
    const { colors, sizes, theme } = this;
    const latin = theme.fonts.body.latin;
    const eastAsia = theme.fonts.body.eastAsian;
    const code = theme.fonts.code.latin;
    const heading = (size, color = colors.heading, before = 240) => ({
      run: { size, bold: true, color, font: { ascii: latin, hAnsi: latin, eastAsia, cs: latin } },
      paragraph: { spacing: { before, after: 120 }, keepNext: true, keepLines: true }
    });
    return {
      default: {
        document: {
          run: {
            font: { ascii: latin, hAnsi: latin, eastAsia, cs: latin },
            size: sizes.body,
            color: colors.text,
            language: { value: 'en-US', eastAsia: theme.eastAsiaLanguage }
          },
          paragraph: { spacing: { after: 140, line: 300 } }
        },
        title: { run: { size: sizes.title, bold: true, color: colors.title }, paragraph: { spacing: { after: 120 } } },
        heading1: heading(sizes.h1, colors.heading, 360),
        heading2: heading(sizes.h2, colors.heading, 300),
        heading3: heading(sizes.h3, colors.subheading),
        heading4: heading(sizes.h4, colors.subheading),
        heading5: heading(sizes.h5, colors.text),
        heading6: heading(sizes.h6, colors.muted),
        hyperlink: { run: { color: colors.link, underline: { type: 'single' } } }
      },
      paragraphStyles: [
        {
          id: 'Subtitle',
          name: 'Subtitle',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: sizes.subtitle, color: colors.muted },
          paragraph: { spacing: { after: 160 } }
        },
        {
          id: 'NoureonCode',
          name: 'Code Block',
          basedOn: 'Normal',
          run: { font: { ascii: code, hAnsi: code, cs: code, eastAsia }, size: sizes.code },
          paragraph: {
            spacing: { before: 80, after: 200, line: 264 },
            indent: { left: 170, right: 170 },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: colors.codeFill },
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: colors.codeBorder, space: 6 },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: colors.codeBorder, space: 6 },
              left: { style: BorderStyle.SINGLE, size: 4, color: colors.codeBorder, space: 6 },
              right: { style: BorderStyle.SINGLE, size: 4, color: colors.codeBorder, space: 6 }
            }
          }
        },
        {
          id: 'NoureonQuote',
          name: 'Quote Block',
          basedOn: 'Normal',
          run: { color: colors.quote },
          paragraph: {
            indent: { left: 360 },
            spacing: { after: 100 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: colors.quoteBar, space: 10 } }
          }
        },
        {
          id: 'NoureonCaption',
          name: 'Figure Caption',
          basedOn: 'Normal',
          run: { size: sizes.caption, color: colors.muted },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 40, after: 240 } }
        },
        {
          id: 'NoureonTocTitle',
          name: 'Contents Heading',
          basedOn: 'Normal',
          run: { size: sizes.toc, bold: true, color: colors.heading },
          paragraph: { spacing: { after: 200 } }
        }
      ]
    };
  }
}

async function composeDocx(descriptor, context = {}) {
  const { meta, blocks } = buildDocumentModel(descriptor.content);
  const baseName = descriptor.name.replace(/\.[^.]+$/, '');
  const language = context.language || 'zh-TW';
  const theme = meta.design
    ? buildDocumentTheme(meta.design.design, { content: descriptor.content, language })
    : legacyDocumentTheme(descriptor.content);
  const renderer = new DocxRenderer({
    meta,
    language,
    theme,
    chartImages: await renderChartImages(blocks, context)
  });

  renderer.topLevel = Math.min(6, ...collectHeadings(blocks, 6).map((heading) => heading.level)) || 1;
  const cover = renderer.renderCover();
  const body = [
    ...(cover ? [] : renderer.renderTitleBlock()),
    ...(meta.toc ? renderer.renderTableOfContents(blocks) : []),
    ...renderer.renderBlocks(blocks)
  ];
  const { headers, footers } = renderer.headerFooter({ sectionTotal: Boolean(cover) });
  const margin = renderer.margin;
  const size = {
    width: renderer.page.width,
    height: renderer.page.height,
    orientation: meta.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
  };
  const sections = [];
  if (cover) {
    sections.push({
      properties: {
        page: {
          size,
          margin: cover.bleed
            ? { top: 0, bottom: margin, left: 0, right: 0, header: 0, footer: 0 }
            : { top: margin, bottom: margin, left: margin, right: margin, header: 708, footer: 708 }
        },
        verticalAlign: cover.verticalAlign
      },
      children: cover.children
    });
  }
  sections.push({
    properties: {
      page: {
        size,
        margin: { top: margin, bottom: margin, left: margin, right: margin, header: 708, footer: 708 },
        ...(cover ? { pageNumbers: { start: 1 } } : {})
      }
    },
    headers,
    footers,
    children: body.length ? body : [new Paragraph({ children: [] })]
  });

  const document = new Document({
    creator: 'Noureon',
    lastModifiedBy: 'Noureon',
    title: meta.title || baseName,
    subject: meta.subtitle || undefined,
    description: meta.subtitle || meta.title || baseName,
    styles: renderer.styles(),
    numbering: { config: renderer.numberingConfig() },
    features: { updateFields: false },
    sections
  });
  return { document, renderer, theme, cover: cover ? { align: cover.verticalAlign } : null };
}

export async function buildDocxDocument(descriptor, context = {}) {
  return (await composeDocx(descriptor, context)).document;
}

const isBrowser = (context) => Boolean(context.document?.createElement && typeof context.window?.FontFace === 'function');

/**
 * Subsets and embeds the fonts a designed document uses. Returns the faces
 * embedded ({ typeface, slot, bytes }) for the preview, or [] when there is
 * nothing to embed or embedding failed (the file then names the fonts only).
 */
async function embedDocumentFonts(zip, renderer, context) {
  if (renderer.theme.legacy || !renderer.theme.embedded || !renderer.faces.length) return [];
  const assets = context.fontAssets || (isBrowser(context) ? await import('./pptx-assets.js') : null);
  if (!assets) return [];
  const families = await prepareEmbeddedFamilies(renderer.faces, {
    textByTypeface: renderer.textByTypeface,
    loadFontFile: assets.loadFontFile,
    subsetter: await assets.loadSubsetter(),
    fontSource,
    familyInfo: (family) => FONT_FAMILIES[family]
  });
  const embedded = new Set(await embedFontsInDocument(zip, families));
  return families.filter((family) => embedded.has(family.typeface))
    .flatMap((family) => Object.entries(family.faces).map(([slot, bytes]) => ({ typeface: family.typeface, slot, bytes, eastAsian: family.script !== 'latin' })));
}

export async function generateDocxFile(descriptor, context = {}) {
  const { document, renderer, cover } = await composeDocx(descriptor, context);
  let bytes = new Uint8Array(await Packer.toArrayBuffer(document));
  let fonts = [];
  try {
    const zip = await JSZip.loadAsync(bytes);
    fonts = await embedDocumentFonts(zip, renderer, context);
    if (fonts.length) bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  } catch {
    // Embedding is an enhancement: a font problem must not cost the file.
    fonts = [];
  }
  const blob = new Blob([bytes], { type: descriptor.mime });
  // The preview draws with the same subsets; they are not a second copy in
  // the file, only a handle to what was embedded.
  Object.defineProperty(blob, 'documentFonts', { value: fonts, enumerable: false });
  Object.defineProperty(blob, 'documentLayout', { value: { cover }, enumerable: false });
  return blob;
}
