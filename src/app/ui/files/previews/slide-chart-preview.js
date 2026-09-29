// Draws a native chart for the slide preview from the same pptxgenjs chart
// definition the file carries (nativeChart), so the preview shows the data,
// colours, labels and axes PowerPoint will draw. The geometry follows
// PowerPoint's defaults closely enough for a preview; it is not a chart engine.

import { installedFonts } from '../design/fonts.js';
import { nativeChart } from '../generators/pptx-charts.js';

const SVG = 'http://www.w3.org/2000/svg';
const color = (value) => `#${String(value || '000000').replace('#', '')}`;

function create(document, name, attributes, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(key, String(value));
  }
  parent.appendChild(node);
  return node;
}

/** Formats a value with an Excel number format code of the kinds nativeChart writes. */
export function formatValue(value, code = '#,##0') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const decimals = (/\.(0+)/.exec(code)?.[1] || '').length;
  // Quoted literals ("%", or a no-break space and "%" in French) follow the number.
  const suffix = (/"([^"]*)"/.exec(code) || [])[1] || '';
  const text = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: code.includes(',') });
  return `${text}${suffix}`;
}

/** Rounded axis bounds and step, like PowerPoint's automatic axis. */
export function niceScale(minimum, maximum, { includeZero = true } = {}) {
  const low = includeZero ? Math.min(0, minimum) : minimum;
  const high = includeZero ? Math.max(0, maximum) : maximum;
  const span = high - low || Math.abs(high) || 1;
  const rough = span / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((value) => value >= rough * 0.999) || rough;
  return { min: Math.floor(low / step + 1e-9) * step, max: Math.ceil(high / step - 1e-9) * step || step, step };
}

const ticksOf = (scale) => {
  const ticks = [];
  for (let value = scale.min; value <= scale.max + scale.step / 2; value += scale.step) ticks.push(Number(value.toFixed(10)));
  return ticks;
};

/** Draws the chart element into `parent`. Returns false for non-native types. */
export function drawNativeChart(document, parent, element, { measure }) {
  const installed = installedFonts(element.language);
  const family = element.family || `"${installed.latin}", "${installed.eastAsian}", sans-serif`;
  // A chart read from a .pptx (free-form decks) arrives in drawing form already.
  const native = element.native || nativeChart(element, { fontFace: family });
  if (!native) return false;
  const group = create(document, 'g', { 'data-element': element.id }, parent);
  const box = { left: element.x + 6, right: element.x + element.w - 6, top: element.y + 6, bottom: element.y + element.h - 6 };
  return drawChart(document, group, native, box, { measure, family, background: element.colors?.background });
}

/**
 * Draws a chart in pptxgenjs's form ({ type, data, options }, the form
 * nativeChart returns) inside `box`, into the SVG group `group`. Shared by
 * the slide and sheet previews.
 */
export function drawChart(document, group, native, box, { measure, family, background = 'FFFFFF' }) {
  const { type, data, options } = native;
  // Callers may pass their own number formatting (sheet formats).
  const formatNumber = options.formatValue || formatValue;
  const size = options.catAxisLabelFontSize || 12;
  const label = (text, x, y, { anchor = 'middle', fill = options.catAxisLabelColor, fontSize = size, weight = 400 } = {}) => {
    const node = create(document, 'text', { x, y, 'text-anchor': anchor, 'font-size': fontSize, 'font-family': family, 'font-weight': weight, fill: color(fill) }, group);
    node.textContent = String(text);
    return node;
  };
  const textWidth = (text, fontSize = size) => measure(String(text), { size: fontSize, weight: 400, family });

  // Legend (bottom or right), drawn first so the plot area can shrink.
  const legendItems = options.showLegend
    ? (type === 'doughnut' ? data[0].labels.map((name, index) => ({ name, fill: options.chartColors[index] })) : data.map((series, index) => ({ name: series.name, fill: options.chartColors[index] })))
      .filter((item) => item.name && item.name.trim())
    : [];
  if (legendItems.length && options.legendPos === 'r') {
    const width = Math.max(...legendItems.map((item) => textWidth(item.name))) + 24;
    const top = (box.top + box.bottom) / 2 - (legendItems.length * size * 1.6) / 2;
    legendItems.forEach((item, index) => {
      const y = top + index * size * 1.6;
      create(document, 'rect', { x: box.right - width, y: y + size * 0.15, width: size * 0.6, height: size * 0.6, fill: color(item.fill) }, group);
      label(item.name, box.right - width + size, y + size * 0.75, { anchor: 'start', fill: options.legendColor });
    });
    box.right -= width + 12;
  } else if (legendItems.length) {
    const widths = legendItems.map((item) => textWidth(item.name) + size * 1.6);
    const total = widths.reduce((sum, width) => sum + width, 0);
    let x = (box.left + box.right) / 2 - total / 2;
    legendItems.forEach((item, index) => {
      create(document, 'rect', { x, y: box.bottom - size * 0.75, width: size * 0.6, height: size * 0.6, fill: color(item.fill) }, group);
      label(item.name, x + size * 0.85, box.bottom - size * 0.1, { anchor: 'start', fill: options.legendColor });
      x += widths[index];
    });
    box.bottom -= size * 1.8;
  }

  if (type === 'doughnut') {
    const values = data[0].values.map((value) => Math.max(0, value || 0));
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const radius = Math.min(box.right - box.left, box.bottom - box.top) / 2 - 4;
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const hole = radius * (options.holeSize ?? 50) / 100;
    const point = (r, angle) => `${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`;
    let angle = -Math.PI / 2;
    values.forEach((value, index) => {
      const sweep = Math.min((value / total) * Math.PI * 2, Math.PI * 2 - 1e-4);
      const end = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      create(document, 'path', {
        d: `M${point(radius, angle)}A${radius} ${radius} 0 ${large} 1 ${point(radius, end)}L${point(hole, end)}A${hole} ${hole} 0 ${large} 0 ${point(hole, angle)}Z`,
        fill: color(options.chartColors[index]), stroke: color(background), 'stroke-width': 1
      }, group);
      if (options.showPercent && value / total >= 0.04) {
        const middle = angle + sweep / 2;
        label(`${Math.round((value / total) * 100)}%`, cx + ((radius + hole) / 2) * Math.cos(middle), cy + ((radius + hole) / 2) * Math.sin(middle) + size * 0.35, { fill: options.dataLabelColor });
      }
      angle = end;
    });
    return true;
  }

  if (type === 'radar') {
    const labels = data[0].labels;
    const all = data.flatMap((series) => series.values).filter((value) => typeof value === 'number');
    const scale = niceScale(0, Math.max(...all, 0));
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2 + size * 0.3;
    const radius = Math.min(box.right - box.left - 120, box.bottom - box.top - size * 3) / 2;
    const at = (index, value) => {
      const angle = -Math.PI / 2 + (index / labels.length) * Math.PI * 2;
      const r = ((value - scale.min) / (scale.max - scale.min)) * radius;
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    };
    ticksOf(scale).slice(1).forEach((tick) => {
      create(document, 'path', { d: `${labels.map((_, index) => `${index ? 'L' : 'M'}${at(index, tick).join(' ')}`).join('')}Z`, fill: 'none', stroke: color(options.valGridLine.color), 'stroke-width': 0.75 }, group);
    });
    labels.forEach((name, index) => {
      const [x, y] = at(index, scale.max * 1.12);
      label(name, x, y + size * 0.35, { anchor: Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end' });
    });
    data.forEach((series, seriesIndex) => {
      const points = series.values.map((value, index) => at(index, value || 0));
      create(document, 'path', { d: `${points.map((point, index) => `${index ? 'L' : 'M'}${point.join(' ')}`).join('')}Z`, fill: 'none', stroke: color(options.chartColors[seriesIndex]), 'stroke-width': options.lineSize || 2 }, group);
      points.forEach(([x, y]) => create(document, 'circle', { cx: x, cy: y, r: 3, fill: color(options.chartColors[seriesIndex]) }, group));
    });
    return true;
  }

  // Axis charts: value axis on the left (or bottom for horizontal bars).
  const horizontal = type === 'bar' && options.barDir === 'bar';
  const stacked = type === 'bar' && options.barGrouping === 'stacked';
  const xy = type === 'scatter' || type === 'bubble';
  const format = options.valAxisLabelFormatCode || '#,##0';
  const series = xy ? data.slice(1) : data;
  const categories = xy ? [] : data[0].labels;
  let values;
  if (stacked) values = categories.map((_, index) => series.reduce((sum, item) => sum + (item.values[index] || 0), 0));
  else values = series.flatMap((item) => item.values).filter((value) => typeof value === 'number');
  const scale = niceScale(Math.min(...values, 0), Math.max(...values, 0));
  const ticks = ticksOf(scale);
  const xScale = xy ? niceScale(Math.min(...data[0].values), Math.max(...data[0].values), { includeZero: false }) : null;
  const titleSpace = xy && options.showCatAxisTitle ? size * 1.6 : 0;
  const valueTitleSpace = xy && options.showValAxisTitle ? size * 1.6 : 0;
  const categoryWidth = horizontal ? Math.max(...categories.map((name) => textWidth(name))) + 8 : 0;
  const tickWidth = horizontal ? 0 : Math.max(...ticks.map((tick) => textWidth(formatNumber(tick, format), size - 1))) + 8;
  // Category labels wider than their slot are set at 45°, as Office does.
  const longestCategory = !xy && !horizontal && categories.length ? Math.max(...categories.map((name) => textWidth(name))) : 0;
  const slotEstimate = (box.right - box.left - valueTitleSpace - tickWidth - 4) / (categories.length || 1);
  const rotated = longestCategory > slotEstimate * 0.95;
  const plot = {
    left: box.left + valueTitleSpace + (horizontal ? categoryWidth : tickWidth),
    right: box.right - (horizontal ? textWidth(formatNumber(Math.max(...values), options.dataLabelFormatCode || format)) + 6 : 4),
    top: box.top + size,
    bottom: box.bottom - titleSpace - (rotated ? Math.min(longestCategory * 0.71 + size, (box.bottom - box.top) * 0.4) : size * 1.6)
  };
  const valueAt = (value) => (horizontal
    ? plot.left + ((value - scale.min) / (scale.max - scale.min)) * (plot.right - plot.left)
    : plot.bottom - ((value - scale.min) / (scale.max - scale.min)) * (plot.bottom - plot.top));

  // Gridlines and value labels.
  ticks.forEach((tick) => {
    const position = valueAt(tick);
    const dash = options.valGridLine?.style === 'dash' ? '3 3' : null;
    if (horizontal) create(document, 'line', { x1: position, x2: position, y1: plot.top, y2: plot.bottom, stroke: color(options.valGridLine.color), 'stroke-width': 0.75, 'stroke-dasharray': dash }, group);
    else {
      create(document, 'line', { x1: plot.left, x2: plot.right, y1: position, y2: position, stroke: color(options.valGridLine.color), 'stroke-width': 0.75, 'stroke-dasharray': dash }, group);
      label(formatNumber(tick, format), plot.left - 6, position + size * 0.32, { anchor: 'end', fill: options.valAxisLabelColor, fontSize: size - 1 });
    }
  });
  if (horizontal) ticks.forEach((tick) => label(formatNumber(tick, format), valueAt(tick), plot.bottom + size * 1.2, { fill: options.valAxisLabelColor, fontSize: size - 1 }));

  if (xy) {
    const xAt = (value) => plot.left + ((value - xScale.min) / (xScale.max - xScale.min || 1)) * (plot.right - plot.left);
    ticksOf(xScale).forEach((tick) => label(formatNumber(tick, Number.isInteger(xScale.step) ? '#,##0' : '#,##0.0'), xAt(tick), plot.bottom + size * 1.2, { fill: options.valAxisLabelColor, fontSize: size - 1 }));
    create(document, 'line', { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, stroke: color(options.catAxisLineColor), 'stroke-width': 0.75 }, group);
    const sizes = series[0].sizes || [];
    const largest = Math.max(...sizes.map((value) => Math.abs(value || 0)), 1);
    series.forEach((item, seriesIndex) => item.values.forEach((value, index) => {
      if (typeof value !== 'number') return;
      const r = type === 'bubble' ? 4 + Math.sqrt(Math.abs(sizes[index] || 0) / largest) * 22 : (options.lineDataSymbolSize || 9) / 2;
      create(document, 'circle', { cx: xAt(data[0].values[index]), cy: valueAt(value), r, fill: color(options.chartColors[seriesIndex]), 'fill-opacity': type === 'bubble' ? 0.75 : 1 }, group);
    }));
    if (options.showCatAxisTitle) label(options.catAxisTitle, (plot.left + plot.right) / 2, box.bottom - 2, { fill: options.catAxisTitleColor });
    if (options.showValAxisTitle) {
      const title = label(options.valAxisTitle, box.left + size, (plot.top + plot.bottom) / 2, { fill: options.valAxisTitleColor });
      title.setAttribute('transform', `rotate(-90 ${box.left + size} ${(plot.top + plot.bottom) / 2})`);
    }
    return true;
  }

  // Category axis.
  const count = categories.length || 1;
  const slot = ((horizontal ? plot.bottom - plot.top : plot.right - plot.left)) / count;
  const order = (index) => (options.catAxisOrientation === 'maxMin' ? index : horizontal ? count - 1 - index : index);
  const slotCenter = (index) => (horizontal ? plot.top + slot * (order(index) + 0.5) : plot.left + slot * (index + 0.5));
  const zero = valueAt(Math.max(scale.min, Math.min(0, scale.max)));
  if (horizontal) create(document, 'line', { x1: zero, x2: zero, y1: plot.top, y2: plot.bottom, stroke: color(options.catAxisLineColor), 'stroke-width': 0.75 }, group);
  else create(document, 'line', { x1: plot.left, x2: plot.right, y1: zero, y2: zero, stroke: color(options.catAxisLineColor), 'stroke-width': 0.75 }, group);
  categories.forEach((name, index) => {
    if (horizontal) label(name, plot.left - 6, slotCenter(index) + size * 0.35, { anchor: 'end' });
    else if (rotated) {
      const x = slotCenter(index);
      const y = plot.bottom + size * 0.9;
      label(name, x, y, { anchor: 'end' }).setAttribute('transform', `rotate(-45 ${x} ${y})`);
    } else label(name, slotCenter(index), plot.bottom + size * 1.25);
  });

  if (type === 'line' || type === 'area') {
    series.forEach((item, seriesIndex) => {
      const fill = color(options.chartColors[seriesIndex]);
      const points = item.values.map((value, index) => (typeof value === 'number' ? [slotCenter(index), valueAt(value)] : null)).filter(Boolean);
      if (!points.length) return;
      if (type === 'area') {
        create(document, 'path', { d: `M${points[0][0]} ${zero}${points.map(([x, y]) => `L${x} ${y}`).join('')}L${points[points.length - 1][0]} ${zero}Z`, fill, 'fill-opacity': (options.chartColorsOpacity ?? 100) / 100 }, group);
      } else {
        create(document, 'path', { d: points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(''), fill: 'none', stroke: fill, 'stroke-width': options.lineSize || 2, 'stroke-linejoin': 'round' }, group);
        if (options.lineDataSymbol !== 'none') points.forEach(([x, y]) => create(document, 'circle', { cx: x, cy: y, r: (options.lineDataSymbolSize || 7) / 2, fill }, group));
      }
    });
    return true;
  }

  // Bars: clustered (series side by side) or stacked. A gap width of G% means
  // the gap between groups is G% of one bar.
  const gap = (options.barGapWidthPct ?? 150) / 100;
  const clustered = stacked ? 1 : series.length;
  const barSize = slot / (clustered + gap);
  const single = series.length === 1;
  categories.forEach((_, index) => {
    let base = 0;
    series.forEach((item, seriesIndex) => {
      const value = item.values[index];
      if (typeof value !== 'number') return;
      const from = stacked ? base : 0;
      const to = from + value;
      base = to;
      const fill = color(single ? options.chartColors[index % options.chartColors.length] : options.chartColors[seriesIndex % options.chartColors.length]);
      const offset = stacked ? 0 : seriesIndex;
      const start = slotCenter(index) - (clustered * barSize) / 2 + offset * barSize;
      const a = valueAt(from);
      const b = valueAt(to);
      if (horizontal) create(document, 'rect', { x: Math.min(a, b), y: start, width: Math.abs(b - a), height: barSize, fill }, group);
      else create(document, 'rect', { x: start, y: Math.min(a, b), width: barSize, height: Math.abs(b - a), fill }, group);
      if (options.showValue) {
        const text = formatNumber(value, options.dataLabelFormatCode || format);
        if (horizontal) label(text, b + (value >= 0 ? 4 : -4), start + barSize / 2 + size * 0.35, { anchor: value >= 0 ? 'start' : 'end', fill: options.dataLabelColor });
        else label(text, start + barSize / 2, value >= 0 ? b - 5 : b + size + 3, { fill: options.dataLabelColor });
      }
    });
  });
  return true;
}
