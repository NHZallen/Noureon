const decodeXml = value => String(value || '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const stripHtml = value => decodeXml(String(value || '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ''))
  .replace(/\u00a0/g, ' ')
  .trim();

const parseHtmlTable = html => {
  const rows = [...String(html || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(row => [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map(cell => stripHtml(cell[1])));
  return {
    headers: rows[0] || [],
    rows: rows.slice(1)
  };
};

export async function extractDocxDocument({ bytes, name = 'document.docx' } = {}) {
  const [{ default: mammoth }, { default: JSZip }] = await Promise.all([
    import('mammoth'),
    import('jszip')
  ]);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const mammothInput = typeof Buffer === 'function'
    ? { buffer: Buffer.from(bytes) }
    : { arrayBuffer };
  const [semantic, zip] = await Promise.all([
    mammoth.convertToHtml(mammothInput, { includeDefaultStyleMap: true }),
    JSZip.loadAsync(bytes)
  ]);
  const blocks = [...semantic.value.matchAll(/<(h[1-6]|p|li|table)[^>]*>([\s\S]*?)<\/\1>/gi)];
  let currentHeading = '';
  let paragraph = 0;
  const sections = [];
  for (const match of blocks) {
    const tag = match[1].toLowerCase();
    const text = stripHtml(match[2]);
    if (!text) continue;
    if (tag.startsWith('h')) currentHeading = text;
    paragraph += 1;
    if (tag === 'table') {
      const table = parseHtmlTable(match[0]);
      sections.push({
        chunkType: 'table',
        headers: table.headers,
        rows: table.rows,
        sourceLocator: {
          type: 'docx',
          heading: currentHeading || undefined,
          paragraphStart: paragraph,
          paragraphEnd: paragraph
        }
      });
      continue;
    }
    sections.push({
      chunkType: tag === 'li' ? 'list' : 'prose',
      text,
      sourceLocator: {
        type: 'docx',
        heading: currentHeading || undefined,
        paragraphStart: paragraph,
        paragraphEnd: paragraph
      }
    });
  }
  const auxiliaryFiles = ['word/footnotes.xml', 'word/endnotes.xml', 'word/comments.xml'];
  for (const path of auxiliaryFiles) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('text');
    const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => decodeXml(match[1])).join(' ').trim();
    if (text) {
      paragraph += 1;
      sections.push({
        chunkType: 'prose',
        text,
        sourceLocator: { type: 'docx', heading: path.split('/').at(-1), paragraphStart: paragraph, paragraphEnd: paragraph }
      });
    }
  }
  return {
    supported: true,
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    method: 'mammoth-ooxml',
    sections,
    warnings: semantic.messages?.map(message => String(message.message || message)) || []
  };
}

export async function extractXlsxDocument({ bytes, name = 'workbook.xlsx' } = {}) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const readXml = async path => zip.file(path)?.async('text') || '';
  const [workbookXml, relationshipsXml, sharedStringsXml, stylesXml] = await Promise.all([
    readXml('xl/workbook.xml'),
    readXml('xl/_rels/workbook.xml.rels'),
    readXml('xl/sharedStrings.xml'),
    readXml('xl/styles.xml')
  ]);
  const attributes = tag => Object.fromEntries([...String(tag).matchAll(/([\w:]+)="([^"]*)"/g)]
    .map(match => [match[1], decodeXml(match[2])]));
  const relationships = new Map([...relationshipsXml.matchAll(/<Relationship\b[^>]*>/g)].map(match => {
    const value = attributes(match[0]);
    return [value.Id, `xl/${String(value.Target || '').replace(/^\//, '').replace(/^xl\//, '')}`];
  }));
  const sharedStrings = [...sharedStringsXml.matchAll(/<si[\s\S]*?<\/si>/g)].map(match => (
    [...match[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(item => decodeXml(item[1])).join('')
  ));
  const customFormats = new Map([...stylesXml.matchAll(/<numFmt\b[^>]*>/g)].map(match => {
    const value = attributes(match[0]);
    return [Number(value.numFmtId), value.formatCode || ''];
  }));
  const styleFormats = [...(stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] || '').matchAll(/<xf\b[^>]*>/g)]
    .map(match => Number(attributes(match[0]).numFmtId || 0));
  const sheetDefinitions = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].map(match => attributes(match[0]));
  const columnIndex = letters => [...String(letters || '')].reduce((value, letter) => (value * 26) + letter.charCodeAt(0) - 64, 0) - 1;
  const decodeCellAddress = address => {
    const match = String(address || '').match(/^([A-Z]+)(\d+)$/i);
    return match ? { column: columnIndex(match[1].toUpperCase()), row: Number(match[2]) - 1 } : { column: 0, row: 0 };
  };
  const encodeColumn = index => {
    let value = Number(index) + 1;
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  };
  const sections = [];
  const sheets = [];
  for (const sheetDefinition of sheetDefinitions) {
    const sheetName = sheetDefinition.name || 'Sheet';
    const sheetPath = relationships.get(sheetDefinition['r:id']);
    const worksheetXml = await readXml(sheetPath);
    const reference = attributes(worksheetXml.match(/<dimension\b[^>]*>/)?.[0] || '').ref || 'A1:A1';
    const [rangeStart, rangeEnd = rangeStart] = reference.split(':').map(decodeCellAddress);
    const hiddenRows = [...worksheetXml.matchAll(/<row\b[^>]*hidden="1"[^>]*>/g)]
      .map(match => Number(attributes(match[0]).r)).filter(Boolean);
    const hiddenColumns = [];
    for (const match of worksheetXml.matchAll(/<col\b[^>]*hidden="1"[^>]*>/g)) {
      const value = attributes(match[0]);
      for (let column = Number(value.min || 1) - 1; column < Number(value.max || value.min || 1); column += 1) {
        hiddenColumns.push(encodeColumn(column));
      }
    }
    const cellMap = new Map();
    for (const match of worksheetXml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g)) {
      const value = attributes(match[0].match(/<c\b[^>]*>/)?.[0] || match[0]);
      const address = value.r;
      if (!address) continue;
      const rawXml = match[0].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      const formula = match[0].match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1] ?? null;
      const inlineValue = [...match[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(item => decodeXml(item[1])).join('');
      const rawValue = decodeXml(rawXml);
      const displayedValue = value.t === 's'
        ? sharedStrings[Number(rawValue)] ?? rawValue
        : value.t === 'inlineStr' ? inlineValue
          : value.t === 'b' ? (rawValue === '1' ? 'TRUE' : 'FALSE')
            : rawValue;
      const styleIndex = Number(value.s || 0);
      const numberFormatId = styleFormats[styleIndex] || 0;
      cellMap.set(address, {
        address,
        rawValue,
        displayedValue,
        formula: formula == null ? null : decodeXml(formula),
        styleIndex,
        numberFormatId,
        numberFormatCode: customFormats.get(numberFormatId) || null,
        rowHidden: hiddenRows.includes(decodeCellAddress(address).row + 1),
        columnHidden: hiddenColumns.includes(encodeColumn(decodeCellAddress(address).column))
      });
    }
    const merges = [...worksheetXml.matchAll(/<mergeCell\b[^>]*>/g)]
      .map(match => attributes(match[0]).ref).filter(Boolean);
    const mergedLookup = new Map();
    for (const merge of merges) {
      const [start, end = start] = merge.split(':').map(decodeCellAddress);
      const anchor = `${encodeColumn(start.column)}${start.row + 1}`;
      for (let row = start.row; row <= end.row; row += 1) {
        for (let column = start.column; column <= end.column; column += 1) {
          mergedLookup.set(`${encodeColumn(column)}${row + 1}`, anchor);
        }
      }
    }
    const cellAt = (row, column) => {
      const address = `${encodeColumn(column)}${row + 1}`;
      const sourceAddress = mergedLookup.get(address) || address;
      const source = cellMap.get(sourceAddress);
      return source ? { ...source, address, mergedFrom: sourceAddress !== address ? sourceAddress : null } : {
        address, mergedFrom: null, rawValue: null, displayedValue: '', formula: null,
        styleIndex: 0, numberFormatId: 0, numberFormatCode: null,
        rowHidden: hiddenRows.includes(row + 1), columnHidden: hiddenColumns.includes(encodeColumn(column))
      };
    };
    const headers = [];
    for (let column = rangeStart.column; column <= rangeEnd.column; column += 1) {
      headers.push(String(cellAt(rangeStart.row, column).displayedValue || `${encodeColumn(column)}${rangeStart.row + 1}`));
    }
    const rows = [];
    const cells = [];
    for (let row = rangeStart.row + 1; row <= rangeEnd.row; row += 1) {
      const values = [];
      for (let column = rangeStart.column; column <= rangeEnd.column; column += 1) {
        const cell = cellAt(row, column);
        values.push([`value=${cell.rawValue ?? ''}`, cell.displayedValue !== String(cell.rawValue ?? '') ? `display=${cell.displayedValue}` : '', cell.formula ? `formula=${cell.formula}` : ''].filter(Boolean).join('; '));
        cells.push(cell);
      }
      rows.push(values);
    }
    const hidden = ['hidden', 'veryHidden'].includes(sheetDefinition.state);
    sections.push({
      chunkType: 'table',
      headers,
      rows,
      sourceLocator: {
        type: 'xlsx',
        sheet: sheetName,
        range: reference,
        rowStart: rangeStart.row + 2,
        rowEnd: rangeEnd.row + 1,
        columnStart: rangeStart.column,
        columnEnd: rangeEnd.column
      },
      tableMetadata: {
        hidden,
        merges,
        hiddenRows,
        hiddenColumns,
        cells
      }
    });
    sheets.push({ sheet: sheetName, range: reference, hidden, merges, rowCount: rangeEnd.row - rangeStart.row + 1, columnCount: rangeEnd.column - rangeStart.column + 1 });
  }
  return {
    supported: true,
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    method: 'sheetjs',
    sections,
    sheets,
    warnings: []
  };
}

const xmlText = xml => [...String(xml || '').matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
  .map(match => decodeXml(match[1])).join(' ').trim();

export async function extractPptxDocument({ bytes, name = 'slides.pptx' } = {}) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const slidePaths = Object.keys(zip.files)
    .filter(path => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
  const sections = [];
  const slides = [];
  for (let index = 0; index < slidePaths.length; index += 1) {
    const slideNumber = index + 1;
    const xml = await zip.file(slidePaths[index]).async('text');
    const shapes = [...xml.matchAll(/<(p:sp|p:pic)[\s\S]*?<\/\1>/g)];
    let element = 0;
    for (const shape of shapes) {
      const text = xmlText(shape[0]);
      const nameMatch = shape[0].match(/<p:cNvPr[^>]*name="([^"]+)"[^>]*>/);
      const altMatch = shape[0].match(/<p:cNvPr[^>]*descr="([^"]+)"[^>]*>/);
      if (!text && !altMatch?.[1]) continue;
      element += 1;
      const offset = shape[0].match(/<a:off[^>]*x="([^"]+)"[^>]*y="([^"]+)"/);
      sections.push({
        chunkType: 'slide',
        text: [text, altMatch?.[1] ? `Alt text: ${decodeXml(altMatch[1])}` : ''].filter(Boolean).join('\n'),
        sourceLocator: { type: 'pptx', slide: slideNumber, element: nameMatch?.[1] || `textBox-${element}` },
        position: offset ? { x: Number(offset[1]), y: Number(offset[2]) } : null
      });
    }
    const tableFrames = [...xml.matchAll(/<p:graphicFrame[\s\S]*?<a:tbl[\s\S]*?<\/a:tbl>[\s\S]*?<\/p:graphicFrame>/g)];
    for (const frame of tableFrames) {
      const tableRows = [...frame[0].matchAll(/<a:tr[\s\S]*?<\/a:tr>/g)]
        .map(row => [...row[0].matchAll(/<a:tc[\s\S]*?<\/a:tc>/g)].map(cell => xmlText(cell[0])));
      if (!tableRows.length) continue;
      element += 1;
      const nameMatch = frame[0].match(/<p:cNvPr[^>]*name="([^"]+)"[^>]*>/);
      sections.push({
        chunkType: 'table',
        headers: tableRows[0],
        rows: tableRows.slice(1),
        sourceLocator: { type: 'pptx', slide: slideNumber, element: nameMatch?.[1] || `table-${element}` }
      });
    }
    const notesPath = `ppt/notesSlides/notesSlide${slideNumber}.xml`;
    const notesFile = zip.file(notesPath);
    const notes = notesFile ? xmlText(await notesFile.async('text')) : '';
    if (notes) sections.push({
      chunkType: 'slide', text: `Speaker notes: ${notes}`,
      sourceLocator: { type: 'pptx', slide: slideNumber, element: 'speaker-notes' }
    });
    slides.push({ slide: slideNumber, elementCount: element, hasNotes: Boolean(notes) });
  }
  return {
    supported: true,
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    method: 'pptx-ooxml',
    sections,
    slides,
    warnings: []
  };
}
