import {
  DEFAULT_DONUT_PALETTE, appendSvgElement, createChartSvg, formatChartNumber, getPlotBox
} from './chart-utils.js';

const splitRectangles = (items, box, horizontal = box.width >= box.height) => {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0], ...box }];
  const total = items.reduce((sum, item) => sum + item.weight, 0) || items.length;
  let split = 1;
  let firstTotal = items[0].weight;
  while (split < items.length - 1 && firstTotal + items[split].weight <= total / 2) {
    firstTotal += items[split].weight;
    split += 1;
  }
  const ratio = Math.max(0.002, Math.min(0.998, firstTotal / total));
  const firstBox = horizontal
    ? { ...box, width: box.width * ratio }
    : { ...box, height: box.height * ratio };
  const secondBox = horizontal
    ? { x: box.x + firstBox.width, y: box.y, width: box.width - firstBox.width, height: box.height }
    : { x: box.x, y: box.y + firstBox.height, width: box.width, height: box.height - firstBox.height };
  return [
    ...splitRectangles(items.slice(0, split), firstBox, !horizontal),
    ...splitRectangles(items.slice(split), secondBox, !horizontal)
  ];
};

export function renderTreemapChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-treemap', labelledBy: options.labelledBy });
  const plotBox = { ...getPlotBox(), x: 28, y: 22, width: 584, height: 310, right: 612, bottom: 332 };
  const palette = chart.colors?.palette?.length ? chart.colors.palette : DEFAULT_DONUT_PALETTE;
  const items = chart.data.map((row, index) => ({ index, row, weight: Math.max(0, row.value) }));
  const layout = splitRectangles(items, plotBox);
  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-treemap-series' });

  layout.forEach(({ row, index, x, y, width, height }) => {
    const inset = 2;
    const node = appendSvgElement(layer, 'g', { class: 'ac-chart-treemap-item' });
    appendSvgElement(node, 'rect', {
      class: 'ac-chart-treemap-node',
      x: x + inset,
      y: y + inset,
      width: Math.max(1, width - inset * 2),
      height: Math.max(1, height - inset * 2),
      rx: 7,
      fill: palette[index % palette.length],
      tabindex: 0,
      'data-chart-interactive': 'true',
      'data-chart-index': index,
      'aria-label': `${row.label}: ${formatChartNumber(row.value)}${chart.unit ? ` ${chart.unit}` : ''}`
    });
    const labelFits = width >= 82 && height >= 42;
    if (labelFits) {
      appendSvgElement(node, 'text', {
        class: 'ac-chart-treemap-label',
        x: x + 12,
        y: y + 22,
        'data-chart-label-fits': 'true'
      }, row.label.length > 18 ? `${row.label.slice(0, 16)}…` : row.label);
      if (height >= 62) appendSvgElement(node, 'text', {
        class: 'ac-chart-treemap-value', x: x + 12, y: y + 42
      }, `${formatChartNumber(row.value)}${chart.unit ? ` ${chart.unit}` : ''}`);
    }
  });
  return svg;
}
