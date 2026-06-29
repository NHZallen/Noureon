import {
  appendSvgElement, createAxisTitles, createChartSvg, formatChartNumber, getPlotBox,
  niceTicks, scaleLinear
} from './chart-utils.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

const formatDateTick = (time) => new Date(time).toISOString().slice(5, 10);
const dateTime = (value) => Date.parse(`${value}T00:00:00Z`);

const truncateLabel = (label, limit = 15) => {
  const text = String(label || '');
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 3))}...` : text;
};

export function getGanttDomain(chart) {
  const times = chart.data.flatMap((row) => (
    row.kind === 'milestone'
      ? [dateTime(row.date)]
      : [dateTime(row.start), dateTime(row.end)]
  )).filter(Number.isFinite);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const padding = Math.max(DAY_MS, (max - min) * 0.04);
  return [min - padding, max + padding];
}

export function getTaskDurationDays(row) {
  if (row.kind === 'milestone') return 0;
  return Math.max(1, Math.round((dateTime(row.end) - dateTime(row.start)) / DAY_MS) + 1);
}

export function renderGanttChart(document, chart, options = {}) {
  const svg = createChartSvg(document, { className: 'ac-chart-svg-gantt', labelledBy: options.labelledBy });
  const basePlot = getPlotBox();
  const plotBox = { ...basePlot, x: 132, width: basePlot.right - 132, right: basePlot.right };
  const domain = getGanttDomain(chart);
  const xScale = (value) => scaleLinear(value, domain, [plotBox.x, plotBox.right]);
  const laneHeight = Math.min(42, Math.max(24, plotBox.height / chart.data.length));
  const barHeight = Math.min(18, laneHeight * 0.45);

  niceTicks(domain[0], domain[1], 5).forEach((tick) => {
    const x = xScale(tick);
    appendSvgElement(svg, 'line', {
      class: 'ac-chart-grid-line ac-chart-gantt-grid',
      x1: x,
      x2: x,
      y1: plotBox.y,
      y2: plotBox.bottom
    });
    appendSvgElement(svg, 'text', {
      class: 'ac-chart-axis-label ac-chart-gantt-date-label',
      x,
      y: plotBox.bottom + 24,
      'text-anchor': 'middle'
    }, formatDateTick(tick));
  });

  createAxisTitles(svg, chart, { plotBox });
  const layer = appendSvgElement(svg, 'g', { class: 'ac-chart-series ac-chart-gantt-series' });

  chart.data.forEach((row, index) => {
    const y = plotBox.y + index * laneHeight + laneHeight / 2;
    appendSvgElement(svg, 'text', {
      class: 'ac-chart-axis-label ac-chart-gantt-task-label',
      x: plotBox.x - 14,
      y: y + 4,
      'text-anchor': 'end'
    }, truncateLabel(row.label));

    if (row.kind === 'milestone') {
      const x = xScale(dateTime(row.date));
      const size = 8;
      appendSvgElement(layer, 'path', {
        class: 'ac-chart-gantt-item ac-chart-gantt-milestone',
        d: `M ${x} ${y - size} L ${x + size} ${y} L ${x} ${y + size} L ${x - size} ${y} Z`,
        tabindex: 0,
        'data-chart-interactive': 'true',
        'data-chart-index': index,
        'data-chart-kind': 'milestone',
        'aria-label': `${row.label}: ${row.date}`
      });
      return;
    }

    const x = xScale(dateTime(row.start));
    const endX = xScale(dateTime(row.end) + DAY_MS);
    const width = Math.max(8, endX - x);
    const progressWidth = Math.max(0, Math.min(width, width * row.progress / 100));
    appendSvgElement(layer, 'rect', {
      class: 'ac-chart-gantt-track',
      x,
      y: y - barHeight / 2,
      width,
      height: barHeight,
      rx: barHeight / 2
    });
    appendSvgElement(layer, 'rect', {
      class: 'ac-chart-gantt-progress',
      x,
      y: y - barHeight / 2,
      width: progressWidth,
      height: barHeight,
      rx: barHeight / 2,
      'data-chart-progress-bounded': 'true'
    });
    appendSvgElement(layer, 'rect', {
      class: 'ac-chart-gantt-item ac-chart-gantt-task',
      x,
      y: y - barHeight / 2,
      width,
      height: barHeight,
      rx: barHeight / 2,
      fill: 'transparent',
      tabindex: 0,
      'data-chart-interactive': 'true',
      'data-chart-index': index,
      'data-chart-kind': 'task',
      'data-chart-duration': getTaskDurationDays(row),
      'aria-label': `${row.label}: ${row.start} to ${row.end}, ${formatChartNumber(row.progress)}%`
    });
  });

  return svg;
}
