// Markdown document → PDF. The same block model and document design as the
// Word generator (document-model.js, document-design.js): a PDF of a document
// looks like its Word file, with the same template, cover, heading and
// table treatments. Layout is pdfmake's; fonts are subsets of the files the
// app ships (pdf-fonts.js), so the PDF looks the same on every device.
//
// A PDF adds what a fixed page can do better than Word: a table of contents
// with page numbers, bookmarks for every section, and vector charts.

import { buildDocumentTheme } from '../design/document-design.js';
import { DOCUMENT_PRESETS } from '../design/document-presets.js';
import { renderChartImages, resolveDocumentImages } from './chart-images.js';
import { CHART_TABLE_LABELS, IMAGE_LABELS, TOC_LABELS } from './document-labels.js';
import { buildDocumentModel, collectHeadings, runsToPlainText } from './document-model.js';
import { latexToInlineRuns } from './latex-inline.js';
import { PdfFontSet } from './pdf-fonts.js';

const PT_PER_MM = 72 / 25.4;
const PAGE_SIZES_MM = Object.freeze({
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B5: [176, 250], LETTER: [215.9, 279.4], LEGAL: [215.9, 355.6]
});
const PAGE_COVERS = new Set(['page', 'band', 'shapes', 'title']);
// Header and footer text sits this far from the page edge (Word's 1.25 cm).
const HEADER_DISTANCE = 35.4;

const pt = (twips) => twips / 20;
const color = (hex) => `#${hex}`;
const visualLength = (text) => [...String(text || '')].reduce((total, char) => total + (/[⺀-￿]/.test(char) ? 2 : 1), 0);

const decodeEntities = (text) => String(text)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

class PdfRenderer {
  constructor({ meta, language, theme, fonts, chartImages }) {
    this.meta = meta;
    this.language = language;
    this.theme = theme;
    this.design = theme.design;
    this.colors = theme.colors;
    this.sizes = Object.fromEntries(Object.entries(theme.sizes).map(([key, value]) => [key, value / 2]));
    this.fonts = fonts;
    this.chartImages = chartImages;
    const [widthMm, heightMm] = PAGE_SIZES_MM[meta.pageSize] || PAGE_SIZES_MM.A4;
    const landscape = meta.orientation === 'landscape';
    this.pageWidth = (landscape ? heightMm : widthMm) * PT_PER_MM;
    this.pageHeight = (landscape ? widthMm : heightMm) * PT_PER_MM;
    this.margin = pt(theme.margin);
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.topLevel = 1;
    // Line heights in em. `lineSpacing` counts multiples of a 1.2 em line,
    // as in the Word file; headings and tables stay closer.
    const spacing = this.design.lineSpacing * 1.2;
    this.pitch = {
      body: spacing,
      heading: this.design.paragraphs === 'indented' ? spacing : Math.min(spacing, 1.3),
      table: Math.min(spacing, 1.38),
      code: 1.3,
      title: 1.18
    };
  }

  headingWeight() {
    return this.design.headingWeight;
  }

  // ---------------------------------------------------------- inline

  /** pdfmake inlines for model runs, split by font. */
  inline(runs = [], { role = 'body', bold = false, italic = false, color: textColor, pitch = this.pitch.body, upper = false } = {}) {
    const inlines = [];
    for (const run of runs) {
      if (run.break) {
        inlines.push({ text: '\n' });
        continue;
      }
      // An inline formula is text with superscripts and subscripts.
      if (run.math !== undefined) {
        const pieces = latexToInlineRuns(run.math).map((piece) => ({ ...piece, link: run.link }));
        inlines.push(...this.inline(pieces, { role, bold, color: textColor, pitch }));
        continue;
      }
      let text = run.image
        ? `[${IMAGE_LABELS[this.language] || IMAGE_LABELS.en}${run.text ? `: ${run.text}` : ''}]`
        : run.text;
      if (!text) continue;
      if (upper) text = text.toUpperCase();
      const runRole = run.code ? 'mono' : role;
      const weight = runRole === 'heading' ? this.headingWeight() : run.bold || bold ? 700 : 400;
      const props = {};
      const runColor = run.link ? color(this.colors.link) : run.image ? color(this.colors.muted) : textColor;
      if (runColor) props.color = runColor;
      if (run.link) {
        props.link = run.link;
        props.decoration = 'underline';
      } else if (run.underline) {
        props.decoration = 'underline';
      } else if (run.strike) {
        props.decoration = 'lineThrough';
      }
      if (run.superscript) props.sup = true;
      if (run.subscript) props.sub = true;
      // pdfmake draws a background over the whole line and places underlines
      // by the run's line height: in widely spaced text the shading would be
      // a tall block and the underline would drift below the text.
      if (run.code && pitch <= 1.8) props.background = color(this.colors.inlineCodeFill);
      const runPitch = props.decoration ? Math.min(pitch, 1.3) : pitch;
      for (const piece of this.fonts.runs(text, { role: runRole, weight, italic: Boolean(run.italic || run.image || italic), pitch: runPitch })) {
        inlines.push({ ...piece, ...props });
      }
    }
    return inlines;
  }

  /** Inlines for generated text (titles, labels, headers). */
  plain(text, options = {}) {
    return this.inline([{ text }], options);
  }

  // ---------------------------------------------------------- blocks

  renderBlocks(blocks, context = {}) {
    return blocks.flatMap((block) => this.renderBlock(block, context));
  }

  renderBlock(block, context) {
    switch (block.type) {
      case 'heading':
        return [this.renderHeading(block)];
      case 'paragraph':
        return [this.renderParagraph(block.runs, context)];
      case 'list':
        return [this.renderList(block, context, 0)];
      case 'table':
        return [this.renderTable(block)];
      case 'code':
        return [this.renderCode(block)];
      case 'quote':
        return [this.renderQuote(block, context)];
      case 'rule':
        return [{
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: this.contentWidth - (context.indent || 0), y2: 0, lineWidth: 0.75, lineColor: color(this.colors.border) }],
          margin: [0, 6, 0, 12]
        }];
      case 'pagebreak':
        return [{ text: '', pageBreak: 'after' }];
      case 'math': {
        // Typeset formulas are vector drawings; a formula MathJax cannot
        // read is shown as text.
        const image = this.mathImages?.get(block.latex);
        if (image) {
          const width = Math.min(this.contentWidth - (context.indent || 0), image.width * this.sizes.body * 1.05);
          return [{ svg: image.svg, width, alignment: 'center', margin: [0, 6, 0, 8] }];
        }
        return [{ text: this.inline([{ text: block.latex, code: true }]), alignment: 'center', margin: [0, 6, 0, 6] }];
      }
      case 'chart':
        return this.renderChart(block.chart);
      case 'image':
        return this.renderPicture(block, context);
      default:
        return [];
    }
  }

  // A picture at the text width (never enlarged) with its description below;
  // without the picture, the description in italics.
  renderPicture(block, context = {}) {
    const picture = this.pictures?.get(block);
    if (!picture) return block.alt ? [this.renderParagraph([{ text: block.alt, italic: true }], context)] : [];
    const available = this.contentWidth - (context.indent || 0);
    // Pixels at 96 dpi to points.
    const width = Math.min(available, picture.width * 0.75);
    const caption = block.alt
      ? [{ text: this.plain(block.alt, { pitch: this.pitch.table }), fontSize: this.sizes.caption, color: color(this.colors.muted), alignment: 'center', margin: [0, 2, 0, 12] }]
      : [];
    return [{
      stack: [{ image: picture.dataUrl, width, alignment: 'center', margin: [0, 4, 0, 4] }, ...caption],
      unbreakable: true
    }];
  }

  renderParagraph(runs, context = {}) {
    const firstLine = !context.quote && !context.list && !context.cell ? pt(this.theme.spacing.firstLine) : 0;
    return {
      text: this.inline(runs, { color: context.quote ? color(this.colors.quote) : undefined }),
      margin: [0, 0, 0, context.list ? 3 : pt(this.theme.spacing.after)],
      ...(firstLine ? { leadingIndent: firstLine } : {})
    };
  }

  rankOf(level) {
    return Math.min(6, Math.max(1, level - this.topLevel + 1));
  }

  headingColor(rank) {
    const { colors } = this;
    if (this.theme.headings === 'shaded' && rank === 1) return colors.onFill;
    if (rank <= 2) return colors.heading;
    if (rank <= 4) return colors.subheading;
    return rank === 5 ? colors.minor : colors.muted;
  }

  renderHeading(block) {
    const rank = this.rankOf(block.level);
    const size = this.sizes[`h${rank}`];
    const { headings } = this.theme;
    const upper = rank <= 2 && this.design.headingCase !== 'normal';
    const plainText = runsToPlainText(block.runs).trim();
    const text = {
      text: this.inline(block.runs, { role: 'heading', pitch: this.pitch.heading, upper, italic: headings === 'centered' && rank === 3 }),
      fontSize: this.design.headingCase === 'smallcaps' && rank <= 2 ? size * 0.9 : size,
      color: color(this.headingColor(rank)),
      id: block.anchor,
      headlineLevel: rank,
      ...(rank <= 2 && this.theme.headingTracking ? { characterSpacing: this.theme.headingTracking * size } : {}),
      ...(headings === 'centered' && rank === 1 ? { alignment: 'center' } : {})
    };
    if (rank <= 3) {
      text.outline = true;
      text.outlineText = plainText;
      const parent = this.outlineParents[rank - 2];
      if (parent) text.outlineParentId = parent;
      this.outlineParents[rank - 1] = block.anchor;
      this.outlineParents.length = rank;
    }
    if (this.meta.toc && block.level <= 3) {
      text.tocItem = true;
      text.tocStyle = { fontSize: this.sizes.body, color: color(this.colors.text), characterSpacing: 0 };
      text.tocMargin = [(block.level - this.tocMinimum) * 14, 0, 0, 4];
    }
    const margin = [0, pt(this.theme.spacing.headingBefore[rank - 1]), 0, pt(this.theme.spacing.headingAfter)];
    const cell = (layout, cellText = text) => ({
      table: { widths: ['*'], body: [[cellText]] },
      layout,
      margin,
      headlineLevel: rank
    });
    const none = () => 0;
    if (headings === 'rule' && rank === 1) {
      return cell({ hLineWidth: (index) => (index === 1 ? 0.75 : 0), vLineWidth: none, hLineColor: () => color(this.colors.rule), paddingLeft: none, paddingRight: none, paddingTop: none, paddingBottom: () => 4 });
    }
    if (headings === 'bar' && rank <= 2) {
      return cell({ hLineWidth: none, vLineWidth: (index) => (index === 0 ? (rank === 1 ? 3.75 : 2.25) : 0), vLineColor: () => color(this.colors.accent), paddingLeft: () => 10, paddingRight: none, paddingTop: () => 1, paddingBottom: () => 1 });
    }
    if (headings === 'shaded' && rank === 1) {
      return cell({ hLineWidth: none, vLineWidth: none, fillColor: () => color(this.colors.fill), paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 3, paddingBottom: () => 3 });
    }
    return { ...text, margin };
  }

  checkbox(checked) {
    const size = Math.round(this.sizes.body * 0.8 * 10) / 10;
    const top = (this.sizes.body * this.pitch.body - size) / 2;
    const line = color(this.colors.text);
    const shapes = [{ type: 'rect', x: 0, y: top, w: size, h: size, lineWidth: 0.75, lineColor: line }];
    if (checked) {
      shapes.push({ type: 'polyline', lineWidth: 1.1, lineColor: line, points: [{ x: size * 0.2, y: top + size * 0.52 }, { x: size * 0.42, y: top + size * 0.75 }, { x: size * 0.82, y: top + size * 0.25 }] });
    }
    return { width: size + 6, canvas: shapes };
  }

  renderList(block, context, level) {
    const items = block.items.map((item) => {
      const stack = [];
      let first = true;
      item.blocks.forEach((child) => {
        if (child.type === 'list') {
          stack.push(this.renderList(child, context, Math.min(level + 1, 8)));
          return;
        }
        if (first && (child.type === 'paragraph' || child.type === 'heading')) {
          stack.push(this.renderParagraph(child.runs, { ...context, list: true }));
        } else {
          stack.push(...this.renderBlock(child, { ...context, list: true }));
        }
        first = false;
      });
      if (!stack.length) stack.push({ text: ' ' });
      if (item.checked !== null) {
        return { columns: [this.checkbox(item.checked), { width: '*', stack }], columnGap: 0, listType: 'none' };
      }
      return stack.length === 1 ? stack[0] : { stack };
    });
    const common = {
      markerColor: color(this.colors.text),
      margin: [level === 0 ? 4 : 0, 0, 0, level === 0 ? pt(this.theme.spacing.after) : 0]
    };
    return block.ordered
      ? { ol: items, start: block.start, type: ['decimal', 'lower-alpha', 'lower-roman'][level % 3], ...common }
      : { ul: items, type: ['disc', 'circle', 'square'][level % 3], ...common };
  }

  columnWidths(block, available = this.contentWidth) {
    const count = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);
    const weights = Array.from({ length: count }, (_, index) => {
      const lengths = [block.header[index], ...block.rows.map((row) => row[index])]
        .map((runs) => Math.min(60, visualLength(runsToPlainText(runs || []))));
      return Math.max(4, ...lengths);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    // Cell padding (11 pt a column) comes out of the available width.
    return weights.map((weight) => Math.max(20, (weight / total) * (available - count * 11)));
  }

  tableLayout() {
    const { colors } = this;
    const style = this.theme.tables;
    const padding = { paddingLeft: () => 5.5, paddingRight: () => 5.5, paddingTop: () => 3.5, paddingBottom: () => 3.5 };
    const stripe = (row) => (row > 0 && row % 2 === 0 ? color(colors.stripeFill) : null);
    if (style === 'lines') {
      return {
        ...padding,
        hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 1.5 : index === 1 ? 0.75 : 0),
        vLineWidth: () => 0,
        hLineColor: () => color(colors.text)
      };
    }
    if (style === 'shaded') {
      return {
        ...padding,
        hLineWidth: (index) => (index === 0 ? 0 : 0.5),
        vLineWidth: () => 0,
        hLineColor: () => color(colors.border),
        fillColor: (row) => (row === 0 ? color(colors.headerFill) : stripe(row))
      };
    }
    return {
      ...padding,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => color(colors.border),
      vLineColor: () => color(colors.border),
      fillColor: (row) => (row === 0 ? color(colors.headerFill) : stripe(row))
    };
  }

  renderTable(block) {
    const widths = this.columnWidths(block);
    const count = widths.length;
    const alignment = (index) => ({ center: 'center', right: 'right' })[block.align[index]] || 'left';
    const pad = (row) => Array.from({ length: count }, (_, index) => row[index] || []);
    const cell = (runs, index, header) => ({
      text: this.inline(runs, { bold: header, pitch: this.pitch.table }),
      alignment: alignment(index)
    });
    return {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths,
        body: [
          pad(block.header).map((runs, index) => cell(runs, index, true)),
          ...block.rows.map((row) => pad(row).map((runs, index) => cell(runs, index, false)))
        ]
      },
      layout: this.tableLayout(),
      margin: [0, 2, 0, 10]
    };
  }

  renderCode(block) {
    const lines = block.text.split('\n');
    const text = [];
    lines.forEach((line, index) => {
      if (index > 0) text.push({ text: '\n' });
      if (line) text.push(...this.fonts.runs(line, { role: 'mono', weight: 400, pitch: this.pitch.code }));
    });
    const border = () => color(this.colors.codeBorder);
    return {
      table: { widths: ['*'], body: [[{ text: text.length ? text : ' ', preserveLeadingSpaces: true, fontSize: this.sizes.code }]] },
      layout: {
        hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: border, vLineColor: border,
        fillColor: () => color(this.colors.codeFill),
        paddingLeft: () => 7, paddingRight: () => 7, paddingTop: () => 5, paddingBottom: () => 5
      },
      margin: [0, 4, 0, 10]
    };
  }

  renderQuote(block, context) {
    const stack = this.renderBlocks(block.blocks, { ...context, quote: true });
    return {
      table: { widths: ['*'], body: [[{ stack: stack.length ? stack : [{ text: ' ' }] }]] },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (index) => (index === 0 ? 2.25 : 0),
        vLineColor: () => color(this.colors.quoteBar),
        paddingLeft: () => 10, paddingRight: () => 0, paddingTop: () => 2, paddingBottom: () => 0
      },
      margin: [0, 2, 0, pt(this.theme.spacing.after)]
    };
  }

  renderChart(chart) {
    const image = this.chartImages.get(chart);
    const caption = chart.title
      ? [{ text: this.plain(chart.title, { pitch: this.pitch.table }), fontSize: this.sizes.caption, color: color(this.colors.muted), alignment: 'center', margin: [0, 2, 0, 12] }]
      : [];
    if (image) {
      const svg = new TextDecoder().decode(image.svg);
      // SVG text is drawn in one face: the one its labels need.
      const labels = decodeEntities([...svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<]*)/g)].map((match) => match[1]).join(' '));
      const font = this.fonts.singleFace(labels, { role: 'body' });
      const width = Math.min(this.contentWidth, 480);
      return [{
        stack: [{ svg, width, height: Math.round(width * (image.height / image.width)), alignment: 'center', font, margin: [0, 4, 0, 4] }, ...caption],
        unbreakable: true
      }];
    }
    return [...caption.map((node) => ({ ...node, margin: [0, 4, 0, 4] })), ...this.renderChartTable(chart)];
  }

  // Without a browser to draw the chart, its data is a readable table.
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
    })];
  }

  // ---------------------------------------------------------- title and cover

  byline() {
    return [this.meta.author, this.meta.date].filter(Boolean).join('　·　');
  }

  titleText(text, { size, textColor = this.colors.title, alignment } = {}) {
    const upper = this.design.headingCase !== 'normal';
    return {
      text: this.plain(text, { role: 'heading', pitch: this.pitch.title, upper }),
      fontSize: size,
      color: color(textColor),
      ...(alignment ? { alignment } : {}),
      ...(this.theme.headingTracking ? { characterSpacing: this.theme.headingTracking * size } : {})
    };
  }

  smallText(text, { size = this.sizes.subtitle, textColor = this.colors.muted, alignment, margin = [0, 0, 0, 6] } = {}) {
    return { text: this.plain(text, { pitch: this.pitch.title }), fontSize: size, color: color(textColor), margin, ...(alignment ? { alignment } : {}) };
  }

  accentRule({ align = 'left', width = 54, available = this.contentWidth, margin = [0, 12, 0, 12] } = {}) {
    const x = align === 'center' ? (available - width) / 2 : 0;
    return { canvas: [{ type: 'line', x1: x, y1: 0, x2: x + width, y2: 0, lineWidth: 2.25, lineColor: color(this.colors.accent) }], margin };
  }

  // The title at the top of the first page (covers "none" and "block").
  renderTitleBlock() {
    const { title, subtitle } = this.meta;
    const byline = this.byline();
    const block = this.theme.cover === 'block';
    const alignment = this.theme.titleAlign === 'center' && !block ? 'center' : undefined;
    const parts = [];
    if (title) parts.push({ ...this.titleText(title, { size: this.sizes.title, alignment }), margin: [0, 0, 0, 6] });
    if (subtitle) parts.push(this.smallText(subtitle, { alignment, margin: [0, 0, 0, 8] }));
    if (byline) parts.push(this.smallText(byline, { size: this.sizes.byline, alignment, margin: [0, 0, 0, block ? 0 : 18] }));
    if (!parts.length) return [];
    if (!block) return parts;
    return [{
      table: { widths: ['*'], body: [[{ stack: parts }]] },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (index) => (index === 0 ? 3 : 0),
        vLineColor: () => color(this.colors.accent),
        paddingLeft: () => 15, paddingRight: () => 0, paddingTop: () => 3, paddingBottom: () => 3
      },
      margin: [0, 0, 0, 18]
    }];
  }

  /** Content and page-one background of a cover page, or null. */
  renderCover() {
    const { cover } = this.theme;
    if (!PAGE_COVERS.has(cover)) return null;
    const { title, subtitle, date, author } = this.meta;
    const heading = title || subtitle;
    if (!heading) return null;
    const { colors, sizes } = this;
    const byline = this.byline();
    const center = this.theme.titleAlign === 'center';
    const alignment = center ? 'center' : undefined;
    const coverTitle = (options = {}) => ({ ...this.titleText(heading, { size: sizes.coverTitle, ...options }), margin: [0, 0, 0, 10] });
    const areaHeight = this.pageHeight - this.margin * 2;
    const none = () => 0;
    const bare = { hLineWidth: none, vLineWidth: none, paddingLeft: none, paddingRight: none, paddingTop: none, paddingBottom: none };
    // A little shorter than the page, or its break would start a blank page.
    const fullPage = (stack, verticalAlignment, extra = {}) => ({
      table: { widths: ['*'], heights: [areaHeight - 12], body: [[{ stack, verticalAlignment }]] },
      layout: bare,
      ...extra
    });

    if (cover === 'title') {
      const lines = [{ ...this.titleText(heading, { size: sizes.coverTitle, alignment: 'center', textColor: colors.title }), margin: [0, 144, 0, 10] }];
      if (subtitle && title) lines.push(this.smallText(subtitle, { size: sizes.body, textColor: colors.text, alignment: 'center' }));
      lines.push({ text: ' ', margin: [0, 0, 0, 6] });
      [author, date].filter(Boolean).forEach((line) => lines.push(this.smallText(line, { size: sizes.body, textColor: colors.text, alignment: 'center', margin: [0, 0, 0, 2] })));
      return { content: [{ stack: lines, pageBreak: 'after' }], background: null };
    }

    if (cover === 'page') {
      const stack = [
        this.accentRule({ align: center ? 'center' : 'left', margin: [0, 0, 0, 18] }),
        coverTitle({ alignment }),
        ...(subtitle && title ? [this.smallText(subtitle, { alignment, margin: [0, 0, 0, 24] })] : []),
        ...(byline ? [this.smallText(byline, { size: sizes.byline, alignment, margin: [0, 12, 0, 0] })] : [])
      ];
      return { content: [fullPage(stack, center ? 'middle' : 'bottom', { pageBreak: 'after' })], background: null };
    }

    if (cover === 'band') {
      // A colour band over the upper part of the page with the title in it.
      const bandHeight = Math.round(this.pageHeight * 0.56);
      const stack = [
        ...(date ? [this.smallText(date, { size: sizes.small, textColor: colors.onFillMuted, margin: [0, 0, 0, 12] })] : []),
        coverTitle({ textColor: colors.onFill }),
        ...(subtitle && title ? [this.smallText(subtitle, { textColor: colors.onFillMuted, margin: [0, 0, 0, 0] })] : [])
      ];
      return {
        content: [{
          stack: [
            { table: { widths: ['*'], heights: [bandHeight - this.margin - 36], body: [[{ stack, verticalAlignment: 'bottom' }]] }, layout: bare },
            ...(author ? [this.smallText(author, { size: sizes.byline, textColor: colors.text, margin: [0, 66, 0, 0] })] : [])
          ],
          pageBreak: 'after'
        }],
        background: { canvas: [{ type: 'rect', x: 0, y: 0, w: this.pageWidth, h: bandHeight, color: color(colors.fill) }] }
      };
    }

    // "shapes": a mosaic of colour blocks across the top, then the title.
    const columns = 4;
    const blockWidth = this.pageWidth / columns;
    const rowHeight = Math.round(this.pageHeight * 0.11);
    const pattern = [
      [colors.accent, colors.soft, colors.accent2, colors.fill],
      [null, colors.accent2Soft, colors.accent, null]
    ];
    const rects = pattern.flatMap((fills, row) => fills.map((fill, index) => (fill
      ? { type: 'rect', x: index * blockWidth, y: row * rowHeight, w: blockWidth, h: rowHeight, color: color(fill) }
      : null)).filter(Boolean));
    const stack = [
      { ...coverTitle(), margin: [0, rowHeight * 2 - this.margin + 72, 0, 10] },
      ...(subtitle && title ? [this.smallText(subtitle, { margin: [0, 0, 0, 12] })] : []),
      this.accentRule({ margin: [0, 6, 0, 12] }),
      ...(byline ? [this.smallText(byline, { size: sizes.byline })] : [])
    ];
    return { content: [{ stack, pageBreak: 'after' }], background: { canvas: rects } };
  }

  renderTableOfContents(blocks) {
    const headings = collectHeadings(blocks, 3);
    if (headings.length === 0) return [];
    return [{
      toc: {
        title: {
          text: this.plain(TOC_LABELS[this.language] || TOC_LABELS.en, { role: 'heading', pitch: this.pitch.heading, upper: this.design.headingCase !== 'normal' }),
          fontSize: this.sizes.toc,
          color: color(this.colors.heading),
          margin: [0, 0, 0, 10]
        },
        numberStyle: { font: this.numberFont, fontSize: this.sizes.body, color: color(this.colors.muted) }
      },
      pageBreak: 'after'
    }];
  }

  // ---------------------------------------------------------- page furniture

  // Page numbers are the PDF's own: a cover counts but shows none, so the
  // footer, the table of contents and the reader's page count agree.
  pageFurniture({ coverPages }) {
    const small = { size: this.sizes.small, textColor: this.colors.muted };
    const numberInHeader = this.meta.pageNumbers && this.theme.pageNumber === 'header';
    const header = this.meta.header ? this.plain(this.meta.header, { pitch: 1.2 }) : null;
    const footer = this.meta.footer ? this.plain(this.meta.footer, { pitch: 1.2 }) : null;
    const number = (text) => ({ text, font: this.numberFont });
    const width = this.contentWidth;
    return {
      header: (page) => {
        if (page <= coverPages) return null;
        const margin = [this.margin, HEADER_DISTANCE, this.margin, 0];
        const base = { fontSize: small.size, color: color(small.textColor), margin };
        if (numberInHeader) {
          return { ...base, columns: [{ width: width - 60, text: header || ' ' }, { width: 60, text: [number(String(page))], alignment: 'right' }] };
        }
        return header ? { ...base, text: header, alignment: 'right' } : null;
      },
      footer: (page, pages) => {
        if (page <= coverPages) return null;
        const stack = [];
        if (footer) stack.push({ text: footer, alignment: 'center' });
        if (this.meta.pageNumbers && !numberInHeader) stack.push({ text: [number(`${page} / ${pages}`)], alignment: 'center' });
        if (!stack.length) return null;
        const height = stack.length * small.size * 1.3;
        return { stack, fontSize: small.size, color: color(small.textColor), margin: [this.margin, Math.max(4, this.margin - HEADER_DISTANCE - height), this.margin, 0] };
      }
    };
  }
}

const hasCjk = (text) => /[⺀-鿿가-힯豈-﫿＀-￯]/.test(text);

function collectFormulas(blocks, found = new Set()) {
  for (const block of blocks) {
    if (block.type === 'math' && block.latex) found.add(block.latex);
    if (block.type === 'quote') collectFormulas(block.blocks, found);
    if (block.type === 'list') block.items.forEach((item) => collectFormulas(item.blocks, found));
  }
  return found;
}

// MathJax loads only for documents with display formulas.
async function typesetFormulas(blocks, { color: textColor }) {
  const formulas = collectFormulas(blocks);
  const images = new Map();
  if (!formulas.size) return images;
  try {
    const { latexToSvg } = await import('./pdf-math.js');
    for (const latex of formulas) {
      const image = latexToSvg(latex, { color: textColor });
      if (image) images.set(latex, image);
    }
  } catch {
    // Without the typesetter every formula is shown as text.
  }
  return images;
}

async function loadFontAssets(context) {
  if (context.fontAssets) return context.fontAssets;
  if (!context.document?.createElement) throw new Error('PDF fonts need a browser or font assets');
  return import('./pptx-assets.js');
}

/**
 * The pdfmake document definition of a Markdown document and the fonts it
 * uses. Exposed for tests; generatePdfFile turns it into bytes.
 */
export async function composePdf(descriptor, context = {}) {
  const content = String(descriptor.content || '');
  const { meta, blocks } = buildDocumentModel(content);
  const language = context.language || 'zh-TW';
  // PDFs never had a look of their own before the design system: documents
  // without design keys get the standard template.
  const design = meta.design?.design || DOCUMENT_PRESETS.standard.params;
  const theme = buildDocumentTheme(design, { content, language });
  const assets = await loadFontAssets(context);
  const fonts = new PdfFontSet({
    roles: theme.roles,
    script: theme.script,
    loadFontFile: assets.loadFontFile,
    subsetter: await assets.loadSubsetter()
  });
  const labels = [TOC_LABELS[language], IMAGE_LABELS[language], ...Object.values(CHART_TABLE_LABELS[language] || {})].join('');
  const roles = ['body', 'heading', ...(/`|~~~|<code|<kbd/.test(content) ? ['mono'] : [])];
  await fonts.prepare({ sample: `${content}${labels}${meta.title}0123456789`, roles });

  const renderer = new PdfRenderer({ meta, language, theme, fonts, chartImages: await renderChartImages(blocks, context) });
  renderer.pictures = await resolveDocumentImages(blocks, context);
  renderer.mathImages = await typesetFormulas(blocks, { color: color(theme.colors.text) });
  renderer.topLevel = Math.min(6, ...collectHeadings(blocks, 6).map((heading) => heading.level)) || 1;
  renderer.tocMinimum = Math.min(...collectHeadings(blocks, 3).map((heading) => heading.level), 3);
  renderer.outlineParents = [];
  // Page numbers and list markers use the body face's digits.
  renderer.numberFont = fonts.runs('0', { role: 'body' })[0].font;
  fonts.reserve('0123456789 /.', { role: 'body' });

  const cover = renderer.renderCover();
  const body = [
    ...(cover ? cover.content : renderer.renderTitleBlock()),
    ...(meta.toc ? renderer.renderTableOfContents(blocks) : []),
    ...renderer.renderBlocks(blocks)
  ];
  const coverPages = cover ? 1 : 0;
  const { header, footer } = renderer.pageFurniture({ coverPages });
  const [bodyFace] = fonts.runs('a', { role: 'body' });

  const definition = {
    pageSize: { width: renderer.pageWidth, height: renderer.pageHeight },
    pageMargins: [renderer.margin, renderer.margin, renderer.margin, renderer.margin],
    info: {
      title: meta.title || descriptor.name.replace(/\.[^.]+$/, ''),
      author: meta.author || undefined,
      subject: meta.subtitle || undefined,
      creator: 'Noureon',
      producer: 'Noureon'
    },
    language: theme.eastAsiaLanguage && hasCjk(content) ? theme.eastAsiaLanguage : language,
    defaultStyle: { font: bodyFace.font, fontSize: renderer.sizes.body, color: color(theme.colors.text), lineHeight: bodyFace.lineHeight },
    header,
    footer,
    background: cover?.background ? (page) => (page === 1 ? cover.background : null) : undefined,
    // A heading never ends a page: it moves to the next one with its text.
    pageBreakBefore: (node, { getFollowingNodesOnPage }) => Boolean(node.headlineLevel)
      && getFollowingNodesOnPage().every((next) => next.headlineLevel || next.pageBreak === 'after'),
    content: body.length ? body : [{ text: ' ' }]
  };
  return { definition, fonts, theme, meta, coverPages };
}

let pdfmakeRequest = null;
let generation = 0;

async function loadPdfmake() {
  if (!pdfmakeRequest) {
    pdfmakeRequest = import('pdfmake').then((module) => {
      const pdfmake = module.default || module;
      // Documents never fetch anything: fonts are in memory, images are not
      // loaded from the network.
      pdfmake.setUrlAccessPolicy?.(() => false);
      pdfmake.setLocalAccessPolicy?.(() => false);
      return pdfmake;
    });
    pdfmakeRequest.catch(() => { pdfmakeRequest = null; });
  }
  return pdfmakeRequest;
}

const toBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

export async function generatePdfFile(descriptor, context = {}) {
  generation += 1;
  const prefix = `noureon-${generation}`;
  const { definition, fonts, coverPages } = await composePdf(descriptor, context);
  const pdfmake = await loadPdfmake();
  const { fonts: table, files } = await fonts.build(prefix);
  files.forEach(({ name, bytes }) => pdfmake.virtualfs.writeFileSync(name, toBase64(bytes), 'base64'));
  let bytes;
  try {
    // createPdf reads the font table immediately, so generations running at
    // the same time never see each other's fonts.
    pdfmake.fonts = table;
    const output = pdfmake.createPdf(definition);
    bytes = await output.getBuffer();
  } finally {
    files.forEach(({ name }) => delete pdfmake.virtualfs.storage[name]);
  }
  const blob = new Blob([bytes], { type: descriptor.mime || 'application/pdf' });
  Object.defineProperty(blob, 'documentLayout', { value: { coverPages }, enumerable: false });
  return blob;
}
