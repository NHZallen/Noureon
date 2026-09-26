import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
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
  WidthType
} from 'docx';
import { buildDocumentModel, collectHeadings, runsToPlainText } from './document-model.js';
import { createDisplayEquation, createInlineEquation } from './docx-omml.js';

const HEADING_STYLES = ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'];
const TWIPS_PER_MM = 56.6929;

const PAGE_SIZES_MM = Object.freeze({
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B5: [176, 250], LETTER: [215.9, 279.4], LEGAL: [215.9, 355.6]
});
const PAGE_MARGIN = 1440;

const COLORS = Object.freeze({
  text: '1F2937', heading: '17365D', accent: '2B579A', muted: '6B7280', border: 'D1D5DB',
  headerFill: 'EEF2F7', stripeFill: 'F8FAFC', codeFill: 'F6F8FA', inlineCodeFill: 'EEF1F4', quote: '4B5563', quoteBar: 'B6C2D1', link: '1D4ED8'
});

const TOC_LABELS = Object.freeze({ 'zh-TW': '目錄', en: 'Contents', fr: 'Table des matières', ru: 'Содержание', es: 'Índice' });
const IMAGE_LABELS = Object.freeze({ 'zh-TW': '圖片', en: 'Image', fr: 'Image', ru: 'Изображение', es: 'Imagen' });
const CHART_TABLE_LABELS = Object.freeze({
  'zh-TW': { label: '項目', value: '數值', x: 'X', y: 'Y', size: '大小', source: '來源', target: '目標', start: '開始', end: '結束', count: '次數', min: '最小值', max: '最大值' },
  en: { label: 'Item', value: 'Value', x: 'X', y: 'Y', size: 'Size', source: 'Source', target: 'Target', start: 'Start', end: 'End', count: 'Count', min: 'Min', max: 'Max' },
  fr: { label: 'Élément', value: 'Valeur', x: 'X', y: 'Y', size: 'Taille', source: 'Source', target: 'Cible', start: 'Début', end: 'Fin', count: 'Nombre', min: 'Min', max: 'Max' },
  ru: { label: 'Элемент', value: 'Значение', x: 'X', y: 'Y', size: 'Размер', source: 'Источник', target: 'Цель', start: 'Начало', end: 'Конец', count: 'Количество', min: 'Мин.', max: 'Макс.' },
  es: { label: 'Elemento', value: 'Valor', x: 'X', y: 'Y', size: 'Tamaño', source: 'Origen', target: 'Destino', start: 'Inicio', end: 'Fin', count: 'Recuento', min: 'Mín.', max: 'Máx.' }
});

// East Asian text falls back to a font the reader's Office actually has; the
// document language tag tells Word how to break lines and pick glyph forms.
function resolveScriptSettings(text) {
  if (/[぀-ヿ]/.test(text)) return { eastAsiaFont: 'Yu Gothic', eastAsiaLanguage: 'ja-JP' };
  if (/[가-힯]/.test(text)) return { eastAsiaFont: 'Malgun Gothic', eastAsiaLanguage: 'ko-KR' };
  return { eastAsiaFont: 'Microsoft JhengHei', eastAsiaLanguage: 'zh-TW' };
}

const visualLength = (text) => [...String(text || '')].reduce((total, char) => total + (/[⺀-￿]/.test(char) ? 2 : 1), 0);

class DocxRenderer {
  constructor({ meta, language, fonts, chartImages }) {
    this.meta = meta;
    this.language = language;
    this.fonts = fonts;
    this.chartImages = chartImages;
    this.orderedInstance = 0;
    this.orderedStarts = new Set([1]);
    const [widthMm, heightMm] = PAGE_SIZES_MM[meta.pageSize] || PAGE_SIZES_MM.A4;
    const portraitWidth = Math.round(widthMm * TWIPS_PER_MM);
    const portraitHeight = Math.round(heightMm * TWIPS_PER_MM);
    this.page = { width: portraitWidth, height: portraitHeight };
    this.contentWidth = (meta.orientation === 'landscape' ? portraitHeight : portraitWidth) - PAGE_MARGIN * 2;
  }

  textRun(run, extra = {}) {
    if (run.break) return new TextRun({ break: 1 });
    const text = run.image ? `[${IMAGE_LABELS[this.language] || IMAGE_LABELS.en}${run.text ? `: ${run.text}` : ''}]` : run.text;
    return new TextRun({
      text,
      bold: run.bold || extra.bold || undefined,
      italics: run.italic || run.image || extra.italics || undefined,
      strike: run.strike || undefined,
      underline: run.underline ? {} : undefined,
      superScript: run.superscript || undefined,
      subScript: run.subscript || undefined,
      color: run.image ? COLORS.muted : extra.color,
      size: extra.size,
      style: run.link ? 'Hyperlink' : undefined,
      ...(run.code ? {
        font: { ascii: this.fonts.code, hAnsi: this.fonts.code, cs: this.fonts.code, eastAsia: this.fonts.eastAsia },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLORS.inlineCodeFill }
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

  renderBlocks(blocks, context = {}) {
    return blocks.flatMap((block) => this.renderBlock(block, context));
  }

  renderBlock(block, context) {
    switch (block.type) {
      case 'heading': {
        const children = this.inlineChildren(block.runs);
        return [new Paragraph({
          style: HEADING_STYLES[block.level - 1],
          keepNext: true,
          children: [new Bookmark({ id: block.anchor, children })]
        })];
      }
      case 'paragraph':
        return [new Paragraph({
          style: context.quote ? 'NoureonQuote' : undefined,
          indent: context.indent ? { left: context.indent } : undefined,
          children: this.inlineChildren(block.runs)
        })];
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
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border, space: 1 } },
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

  renderTable(block) {
    const widths = this.columnWidths(block);
    const columnCount = widths.length;
    const alignment = (index) => ({ center: AlignmentType.CENTER, right: AlignmentType.RIGHT })[block.align[index]] || AlignmentType.LEFT;
    const cell = (runs, index, { header = false, stripe = false } = {}) => new TableCell({
      width: { size: widths[index], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      shading: header
        ? { type: ShadingType.CLEAR, color: 'auto', fill: COLORS.headerFill }
        : stripe ? { type: ShadingType.CLEAR, color: 'auto', fill: COLORS.stripeFill } : undefined,
      children: [new Paragraph({
        alignment: alignment(index),
        spacing: { before: 0, after: 0 },
        children: this.inlineChildren(runs || [], header ? { bold: true } : {})
      })]
    });
    const pad = (row) => Array.from({ length: columnCount }, (_, index) => row[index] || []);
    const border = { style: BorderStyle.SINGLE, size: 4, color: COLORS.border };

    return new Table({
      width: { size: this.contentWidth, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: pad(block.header).map((runs, index) => cell(runs, index, { header: true })) }),
        ...block.rows.map((row, rowIndex) => new TableRow({
          cantSplit: true,
          children: pad(row).map((runs, index) => cell(runs, index, { stripe: rowIndex % 2 === 1 }))
        }))
      ]
    });
  }

  renderCode(block, context) {
    const lines = block.text.split('\n');
    const children = [];
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
      ? [new Paragraph({ style: 'NoureonCaption', keepNext: !image, children: [new TextRun({ text: chart.title })] })]
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

  renderTitleBlock() {
    const blocks = [];
    const { title, subtitle, author, date } = this.meta;
    if (title) blocks.push(new Paragraph({ style: 'Title', children: [new TextRun({ text: title })] }));
    if (subtitle) blocks.push(new Paragraph({ style: 'Subtitle', children: [new TextRun({ text: subtitle })] }));
    const byline = [author, date].filter(Boolean).join('　·　');
    if (byline) blocks.push(new Paragraph({ spacing: { after: 360 }, children: [new TextRun({ text: byline, color: COLORS.muted, size: 20 })] }));
    return blocks;
  }

  // A static table of contents built from internal links: it needs no field
  // update prompt and works in Word, LibreOffice, Pages and Google Docs alike.
  renderTableOfContents(blocks) {
    const headings = collectHeadings(blocks, 3);
    if (headings.length === 0) return [];
    const minimum = Math.min(...headings.map((heading) => heading.level));
    return [
      new Paragraph({ style: 'NoureonTocTitle', children: [new TextRun({ text: TOC_LABELS[this.language] || TOC_LABELS.en })] }),
      ...headings.map((heading) => new Paragraph({
        indent: { left: (heading.level - minimum) * 420 },
        spacing: { after: 60 },
        children: [new InternalHyperlink({
          anchor: heading.anchor,
          children: [new TextRun({ text: runsToPlainText(heading.runs).trim(), color: COLORS.text, size: heading.level === minimum ? 22 : 21 })]
        })]
      })),
      new Paragraph({ children: [new PageBreak()] })
    ];
  }

  headerFooter() {
    const small = { color: COLORS.muted, size: 18 };
    const headers = this.meta.header
      ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: this.meta.header, ...small })] })] }) }
      : undefined;
    const footerParagraphs = [];
    if (this.meta.footer) {
      footerParagraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: this.meta.footer, ...small })] }));
    }
    if (this.meta.pageNumbers) {
      footerParagraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ children: [PageNumber.CURRENT], ...small }),
          new TextRun({ text: ' / ', ...small }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], ...small })
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

  styles() {
    const { latin, eastAsia, code } = this.fonts;
    const heading = (size, color = COLORS.heading, before = 240) => ({
      run: { size, bold: true, color, font: { ascii: latin, hAnsi: latin, eastAsia, cs: latin } },
      paragraph: { spacing: { before, after: 120 }, keepNext: true, keepLines: true }
    });
    return {
      default: {
        document: {
          run: {
            font: { ascii: latin, hAnsi: latin, eastAsia, cs: latin },
            size: 22,
            color: COLORS.text,
            language: { value: 'en-US', eastAsia: this.fonts.eastAsiaLanguage }
          },
          paragraph: { spacing: { after: 140, line: 300 } }
        },
        title: { run: { size: 44, bold: true, color: '111827' }, paragraph: { spacing: { after: 120 } } },
        heading1: heading(32, COLORS.heading, 360),
        heading2: heading(28, COLORS.heading, 300),
        heading3: heading(24, COLORS.accent),
        heading4: heading(22, COLORS.accent),
        heading5: heading(22, COLORS.text),
        heading6: heading(20, COLORS.muted),
        hyperlink: { run: { color: COLORS.link, underline: { type: 'single' } } }
      },
      paragraphStyles: [
        {
          id: 'Subtitle',
          name: 'Subtitle',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: 28, color: COLORS.muted },
          paragraph: { spacing: { after: 160 } }
        },
        {
          id: 'NoureonCode',
          name: 'Code Block',
          basedOn: 'Normal',
          run: { font: { ascii: code, hAnsi: code, cs: code, eastAsia }, size: 19 },
          paragraph: {
            spacing: { before: 80, after: 200, line: 264 },
            indent: { left: 170, right: 170 },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLORS.codeFill },
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 },
              left: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 }
            }
          }
        },
        {
          id: 'NoureonQuote',
          name: 'Quote Block',
          basedOn: 'Normal',
          run: { color: COLORS.quote },
          paragraph: {
            indent: { left: 360 },
            spacing: { after: 100 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.quoteBar, space: 10 } }
          }
        },
        {
          id: 'NoureonCaption',
          name: 'Figure Caption',
          basedOn: 'Normal',
          run: { size: 19, color: COLORS.muted },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 40, after: 240 } }
        },
        {
          id: 'NoureonTocTitle',
          name: 'Contents Heading',
          basedOn: 'Normal',
          run: { size: 28, bold: true, color: COLORS.heading },
          paragraph: { spacing: { after: 200 } }
        }
      ]
    };
  }
}

async function renderChartImages(blocks, context) {
  const charts = [];
  const visit = (list) => list.forEach((block) => {
    if (block.type === 'chart') charts.push(block.chart);
    if (block.type === 'quote') visit(block.blocks);
    if (block.type === 'list') block.items.forEach((item) => visit(item.blocks));
  });
  visit(blocks);
  const images = new Map();
  if (charts.length === 0 || typeof context.loadChartImageRenderer !== 'function') return images;
  try {
    const { renderChartImage } = await context.loadChartImageRenderer();
    for (const chart of charts) {
      try {
        const image = await renderChartImage(chart, context);
        if (image) images.set(chart, image);
      } catch {
        // A chart that cannot be drawn falls back to its data table.
      }
    }
  } catch {
    // Missing browser support: every chart falls back to its data table.
  }
  return images;
}

export async function buildDocxDocument(descriptor, context = {}) {
  const { meta, blocks } = buildDocumentModel(descriptor.content);
  const baseName = descriptor.name.replace(/\.[^.]+$/, '');
  const scripts = resolveScriptSettings(descriptor.content);
  const renderer = new DocxRenderer({
    meta: { ...meta, title: meta.title },
    language: context.language || 'zh-TW',
    fonts: { latin: 'Calibri', code: 'Consolas', eastAsia: scripts.eastAsiaFont, eastAsiaLanguage: scripts.eastAsiaLanguage },
    chartImages: await renderChartImages(blocks, context)
  });

  const body = [
    ...renderer.renderTitleBlock(),
    ...(meta.toc ? renderer.renderTableOfContents(blocks) : []),
    ...renderer.renderBlocks(blocks)
  ];
  const { headers, footers } = renderer.headerFooter();

  return new Document({
    creator: 'Noureon',
    lastModifiedBy: 'Noureon',
    title: meta.title || baseName,
    subject: meta.subtitle || undefined,
    description: meta.subtitle || meta.title || baseName,
    styles: renderer.styles(),
    numbering: { config: renderer.numberingConfig() },
    features: { updateFields: false },
    sections: [{
      properties: {
        page: {
          size: {
            width: renderer.page.width,
            height: renderer.page.height,
            orientation: meta.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
          },
          margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN, header: 708, footer: 708 }
        }
      },
      headers,
      footers,
      children: body.length ? body : [new Paragraph({ children: [] })]
    }]
  });
}

export async function generateDocxFile(descriptor, context = {}) {
  const document = await buildDocxDocument(descriptor, context);
  const buffer = await Packer.toArrayBuffer(document);
  return new Blob([buffer], { type: descriptor.mime });
}
