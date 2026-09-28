// Native Excel charts: DrawingML chart parts written next to the workbook
// write-excel-file produces. Each chart references its sheet's cells, so it
// follows edits in Excel; the cached values let viewers that do not
// calculate (and the first paint in Excel) show it straight away.
//
// Parts per sheet with charts: xl/drawings/drawingN.xml (one anchored
// graphic frame per chart), its relationships to xl/charts/chartM.xml, a
// <drawing> element and relationship in the sheet, and content types.
// Element order follows the schema strictly; Excel repairs files otherwise.

import { cellAddress } from './spreadsheet-spec.js';

const EMU_PER_PX = 9525;
const NS = {
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  xdr: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
};
const RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const GRID = 'D9D9D9';
const AXIS = 'BFBFBF';
const TEXT = '595959';

const escapeXml = (value) => String(value).replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]));
const hex = (color) => String(color || '000000').replace('#', '').toUpperCase();
const quoteSheet = (name) => `'${String(name).replace(/'/g, "''")}'`;
const absolute = (address) => address.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
// Sheet row index r of the layout (0 = first data row) is Excel row r + 2.
const range = (sheetName, column, from, to) => `${quoteSheet(sheetName)}!${absolute(cellAddress(from + 1, column))}:${absolute(cellAddress(to + 1, column))}`;

const solid = (color) => `<a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill>`;
const line = (color, width = 9525) => `<a:ln w="${width}" cap="flat">${solid(color)}</a:ln>`;
const noLine = '<a:ln><a:noFill/></a:ln>';

function textProperties(font, { size = 900, color = TEXT, bold = false } = {}) {
  const face = escapeXml(font);
  return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="${bold ? 1 : 0}">${solid(color)}<a:latin typeface="${face}"/><a:ea typeface="${face}"/><a:cs typeface="${face}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
}

function stringReference(formula, values) {
  const points = values.map((value, index) => `<c:pt idx="${index}"><c:v>${escapeXml(value ?? '')}</c:v></c:pt>`).join('');
  return `<c:strRef><c:f>${escapeXml(formula)}</c:f><c:strCache><c:ptCount val="${values.length}"/>${points}</c:strCache></c:strRef>`;
}

function numberReference(formula, values, format) {
  const points = values.map((value, index) => (value === null || value === undefined ? '' : `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`)).join('');
  return `<c:numRef><c:f>${escapeXml(formula)}</c:f><c:numCache><c:formatCode>${escapeXml(format || 'General')}</c:formatCode><c:ptCount val="${values.length}"/>${points}</c:numCache></c:numRef>`;
}

function seriesXml(chart, series, index, { sheetName }) {
  const name = `<c:tx>${stringReference(`${quoteSheet(sheetName)}!${absolute(cellAddress(0, series.column))}`, [series.name])}</c:tx>`;
  const categories = `<c:cat>${stringReference(range(sheetName, chart.x, chart.from, chart.to), chart.categories)}</c:cat>`;
  const values = `<c:val>${numberReference(range(sheetName, series.column, chart.from, chart.to), series.values, series.format)}</c:val>`;
  const head = `<c:idx val="${index}"/><c:order val="${index}"/>${name}`;
  switch (chart.type) {
    case 'column':
    case 'bar':
      return `<c:ser>${head}<c:spPr>${solid(series.color)}${noLine}</c:spPr><c:invertIfNegative val="0"/>${categories}${values}</c:ser>`;
    case 'line':
      return `<c:ser>${head}<c:spPr>${line(series.color, 28575)}</c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${solid(series.color)}${noLine}</c:spPr></c:marker>${categories}${values}<c:smooth val="0"/></c:ser>`;
    case 'area':
      return `<c:ser>${head}<c:spPr>${solid(series.color)}${noLine}</c:spPr>${categories}${values}</c:ser>`;
    case 'radar':
      return `<c:ser>${head}<c:spPr>${line(series.color, 28575)}</c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${solid(series.color)}${noLine}</c:spPr></c:marker>${categories}${values}</c:ser>`;
    case 'pie':
    case 'doughnut': {
      const points = chart.pointColors.map((color, point) => `<c:dPt><c:idx val="${point}"/><c:bubble3D val="0"/><c:spPr>${solid(color)}${line('FFFFFF', 12700)}</c:spPr></c:dPt>`).join('');
      return `<c:ser>${head}${points}${categories}${values}</c:ser>`;
    }
    case 'scatter': {
      const xValues = `<c:xVal>${numberReference(range(sheetName, chart.x, chart.from, chart.to), chart.xValues, 'General')}</c:xVal>`;
      const yValues = `<c:yVal>${numberReference(range(sheetName, series.column, chart.from, chart.to), series.values, series.format)}</c:yVal>`;
      return `<c:ser>${head}<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>${solid(series.color)}${noLine}</c:spPr></c:marker>${xValues}${yValues}<c:smooth val="0"/></c:ser>`;
    }
    default:
      return '';
  }
}

function axisXml(kind, { id, crossId, position, font, gridlines = false, format = null, deleted = false, reversed = false, crosses = 'autoZero' }) {
  const grid = gridlines ? `<c:majorGridlines><c:spPr>${line(GRID)}</c:spPr></c:majorGridlines>` : '';
  const numberFormat = `<c:numFmt formatCode="${escapeXml(format || 'General')}" sourceLinked="${format ? 0 : 1}"/>`;
  const common = `<c:axId val="${id}"/><c:scaling><c:orientation val="${reversed ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="${deleted ? 1 : 0}"/><c:axPos val="${position}"/>${grid}${numberFormat}<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:noFill/>${kind === 'cat' ? line(AXIS) : noLine}</c:spPr>${textProperties(font)}<c:crossAx val="${crossId}"/><c:crosses val="${crosses}"/>`;
  if (kind === 'cat') return `<c:catAx>${common}<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  return `<c:valAx>${common}<c:crossBetween val="${kind === 'x' ? 'midCat' : 'between'}"/></c:valAx>`;
}

function plotXml(chart, { sheetName, font }) {
  const series = chart.series.map((item, index) => seriesXml(chart, item, index, { sheetName })).join('');
  const axisIds = '<c:axId val="500000001"/><c:axId val="500000002"/>';
  const valueFormat = chart.series[0]?.format || null;
  const categoryAxis = (position, options = {}) => axisXml('cat', { id: 500000001, crossId: 500000002, position, font, ...options });
  const valueAxis = (position, options = {}) => axisXml('val', { id: 500000002, crossId: 500000001, position, font, gridlines: true, format: valueFormat, ...options });
  switch (chart.type) {
    case 'column':
    case 'bar': {
      const grouping = chart.stacked ? 'stacked' : 'clustered';
      const horizontal = chart.type === 'bar';
      // Horizontal bars list the first row at the top, as the table does;
      // the value axis then crosses at the far end to stay at the bottom.
      return `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${series}<c:gapWidth val="80"/>${chart.stacked ? '<c:overlap val="100"/>' : '<c:overlap val="-10"/>'}${axisIds}</c:barChart>${categoryAxis(horizontal ? 'l' : 'b', { reversed: horizontal })}${valueAxis(horizontal ? 'b' : 'l', { crosses: horizontal ? 'max' : 'autoZero' })}`;
    }
    case 'line':
      return `<c:lineChart><c:grouping val="${chart.stacked ? 'stacked' : 'standard'}"/><c:varyColors val="0"/>${series}<c:marker val="1"/>${axisIds}</c:lineChart>${categoryAxis('b')}${valueAxis('l')}`;
    case 'area':
      return `<c:areaChart><c:grouping val="${chart.stacked ? 'stacked' : 'standard'}"/><c:varyColors val="0"/>${series}${axisIds}</c:areaChart>${categoryAxis('b')}${valueAxis('l')}`;
    case 'radar':
      return `<c:radarChart><c:radarStyle val="marker"/><c:varyColors val="0"/>${series}${axisIds}</c:radarChart>${categoryAxis('b')}${valueAxis('l')}`;
    case 'pie':
      return `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`;
    case 'doughnut':
      return `<c:doughnutChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
    case 'scatter':
      return `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}${axisIds}</c:scatterChart>${axisXml('x', { id: 500000001, crossId: 500000002, position: 'b', font })}${valueAxis('l')}`;
    default:
      return '';
  }
}

/** The chart part (xl/charts/chartN.xml) of one laid-out chart. */
export function chartXml(chart, { sheetName, font }) {
  const face = escapeXml(font);
  const title = chart.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="0">${solid('404040')}<a:latin typeface="${face}"/><a:ea typeface="${face}"/></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="0">${solid('404040')}<a:latin typeface="${face}"/><a:ea typeface="${face}"/></a:rPr><a:t>${escapeXml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>';
  const pie = chart.type === 'pie' || chart.type === 'doughnut';
  const legend = pie || chart.series.length > 1
    ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${textProperties(font)}</c:legend>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plotXml(chart, { sheetName, font })}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr>${solid('FFFFFF')}<a:ln><a:noFill/></a:ln></c:spPr>${textProperties(font)}</c:chartSpace>`;
}

function drawingXml(charts, firstId) {
  const anchors = charts.map((chart, index) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${chart.anchor.column}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.anchor.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${chart.width * EMU_PER_PX}" cy="${chart.height * EMU_PER_PX}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${firstId + index}" name="Chart ${index + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS.c}"><c:chart xmlns:c="${NS.c}" r:id="rIdChart${index + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS.xdr}" xmlns:a="${NS.a}" xmlns:r="${NS.r}">${anchors}</xdr:wsDr>`;
}

// The library writes self-closing relationship lists when a part has none.
const openList = (xml, tag) => xml.replace(new RegExp(`<${tag}([^>]*)/>`), `<${tag}$1></${tag}>`);

/** Adds the charts of every sheet in `layout` to the package. */
export async function addCharts(zip, layout) {
  let chartNumber = 0;
  let drawingNumber = 0;
  const overrides = [];
  for (const [index, sheet] of layout.sheets.entries()) {
    if (!sheet.charts?.length) continue;
    const sheetPath = `xl/worksheets/sheet${index + 1}.xml`;
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) continue;
    drawingNumber += 1;
    const drawingRelationships = [];
    sheet.charts.forEach((chart, chartIndex) => {
      chartNumber += 1;
      zip.file(`xl/charts/chart${chartNumber}.xml`, chartXml(chart, { sheetName: sheet.name, font: layout.font.family }));
      overrides.push(`<Override PartName="/xl/charts/chart${chartNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      drawingRelationships.push(`<Relationship Id="rIdChart${chartIndex + 1}" Type="${RELATIONSHIP}/chart" Target="../charts/chart${chartNumber}.xml"/>`);
    });
    zip.file(`xl/drawings/drawing${drawingNumber}.xml`, drawingXml(sheet.charts, 2));
    zip.file(`xl/drawings/_rels/drawing${drawingNumber}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRelationships.join('')}</Relationships>`);
    overrides.push(`<Override PartName="/xl/drawings/drawing${drawingNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);

    const relsPath = `xl/worksheets/_rels/sheet${index + 1}.xml.rels`;
    let rels = zip.file(relsPath) ? await zip.file(relsPath).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
    rels = openList(rels, 'Relationships').replace('</Relationships>', `<Relationship Id="rIdDrawing1" Type="${RELATIONSHIP}/drawing" Target="../drawings/drawing${drawingNumber}.xml"/></Relationships>`);
    zip.file(relsPath, rels);
    // <drawing> comes after autoFilter, mergeCells and the page settings;
    // the library writes nothing that must follow it.
    const sheetXml = await sheetFile.async('string');
    zip.file(sheetPath, sheetXml.replace('</worksheet>', '<drawing r:id="rIdDrawing1"/></worksheet>'));
  }
  if (overrides.length) {
    const typesFile = zip.file('[Content_Types].xml');
    zip.file('[Content_Types].xml', (await typesFile.async('string')).replace('</Types>', `${overrides.join('')}</Types>`));
  }
  return chartNumber;
}
