import {
  appendSvgElement, createChartSvg, formatChartNumber, getPlotBox, scaleLinear
} from './chart-utils.js';

const shortLabel = (value, limit = 15) => {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
};

export function calculateSankeyLayout(chart) {
  const plotBox = { ...getPlotBox(), x: 72, width: 520, right: 592 };
  const nodes = chart.nodes.map((node, index) => ({ ...node, index, depth: 0, value: 1 }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  chart.links.forEach((link) => {
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    source.value += link.value;
    target.value += link.value;
  });
  for (let pass = 0; pass < Math.min(8, chart.nodes.length + chart.links.length); pass += 1) {
    chart.links.forEach((link) => {
      byId.get(link.target).depth = Math.max(byId.get(link.target).depth, Math.min(3, byId.get(link.source).depth + 1));
    });
  }
  const maxDepth = Math.max(1, ...nodes.map((node) => node.depth));
  const columns = Array.from({ length: maxDepth + 1 }, () => []);
  nodes.forEach((node) => columns[Math.min(maxDepth, node.depth)].push(node));
  columns.forEach((column, columnIndex) => {
    const total = column.reduce((sum, node) => sum + node.value, 0) || 1;
    let y = plotBox.y;
    column.forEach((node) => {
      const gap = 14;
      node.width = 18;
      node.height = Math.max(20, (plotBox.height - gap * (column.length - 1)) * node.value / total);
      node.x = scaleLinear(columnIndex, [0, maxDepth], [plotBox.x, plotBox.right - node.width]);
      node.y = y;
      node.centerY = y + node.height / 2;
      node.visualDepth = columnIndex;
      y += node.height + gap;
    });
  });
  const maxValue = Math.max(...chart.links.map((link) => link.value), 1);
  const links = chart.links.map((link, index) => {
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    const x1 = source.x + source.width;
    const x2 = target.x;
    const bend = Math.max(36, Math.abs(x2 - x1) / 2);
    return {
      ...link,
      index,
      sourceLabel: source.label,
      targetLabel: target.label,
      width: scaleLinear(link.value, [0, maxValue], [4, 24]),
      path: `M ${x1} ${source.centerY} C ${x1 + bend} ${source.centerY} ${x2 - bend} ${target.centerY} ${x2} ${target.centerY}`
    };
  });
  return { plotBox, nodes, links };
}

export function renderSankeyChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-sankey', labelledBy: options.labelledBy });
  const { nodes, links } = calculateSankeyLayout(chart);
  const linkLayer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-sankey-links' });
  const nodeLayer = appendSvgElement(svg, 'g', { class: 'ac-chart-sankey-nodes' });

  links.forEach((link) => appendSvgElement(linkLayer, 'path', {
    class: 'ac-chart-sankey-link',
    d: link.path,
    fill: 'none',
    'stroke-width': link.width,
    tabindex: 0,
    'data-chart-interactive': 'true',
    'data-chart-index': link.index,
    'data-chart-source': link.source,
    'data-chart-target': link.target,
    'aria-label': `${link.sourceLabel} to ${link.targetLabel}: ${formatChartNumber(link.value)}${chart.unit ? ` ${chart.unit}` : ''}`
  }));

  nodes.forEach((node) => {
    appendSvgElement(nodeLayer, 'rect', {
      class: 'ac-chart-sankey-node',
      x: node.x, y: node.y, width: node.width, height: Math.max(2, node.height), rx: 6,
      tabindex: 0, 'data-chart-interactive': 'true', 'data-chart-index': node.index,
      'data-chart-node-id': node.id,
      'aria-label': `${node.label}: ${formatChartNumber(node.value)}${chart.unit ? ` ${chart.unit}` : ''}`
    });
    appendSvgElement(nodeLayer, 'text', {
      class: 'ac-chart-axis-label ac-chart-sankey-label',
      x: node.visualDepth === 0 ? node.x - 9 : node.x + node.width + 9,
      y: node.centerY + 4,
      'text-anchor': node.visualDepth === 0 ? 'end' : 'start'
    }, shortLabel(node.label));
  });
  return svg;
}
