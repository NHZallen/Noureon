// Browser-only: draws a chart with the chat's own renderer off-screen and
// exports it as a self-contained SVG plus a PNG fallback, so documents show
// exactly the chart the user saw in the conversation.

import { createChartPlaceholderElement } from '../../charts/chart-markdown-placeholders.js';
import { mountChartPlaceholder } from '../../charts/chart-renderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RENDER_WIDTH_PX = 760;
const PNG_SCALE = 2;
const DEFERRED_TIMEOUT_MS = 3000;
// Office's SVG renderer cannot load web fonts; name fonts it has locally.
const EXPORT_FONT_STACK = '"Segoe UI", "Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", Arial, sans-serif';

const INLINED_PROPERTIES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'letter-spacing', 'visibility', 'display'
];

const REMOVED_SELECTOR = [
  '[data-chart-hit-area]',
  '.ac-chart-interaction-overlay',
  '[class*="hit-area"]',
  '[class*="tooltip"]',
  '[class*="focus-ring"]',
  '[class*="crosshair"]'
].join(',');

// Background tabs never run animation frames, so a download started just
// before the user switches away must not wait on one; the timer still fires.
const nextFrame = (window) => new Promise((resolve) => {
  const timer = window.setTimeout(resolve, 50);
  window.requestAnimationFrame?.(() => {
    window.clearTimeout(timer);
    resolve();
  });
});

async function waitForDeferredChart(host, window) {
  const started = Date.now();
  while (host.querySelector('.ac-chart-deferred, [data-chart-deferred="true"] .ac-chart-deferred') && Date.now() - started < DEFERRED_TIMEOUT_MS) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  await nextFrame(window);
}

function inlineComputedStyles(source, target, window) {
  const computed = window.getComputedStyle(source);
  const declarations = INLINED_PROPERTIES
    .map((property) => [property, computed.getPropertyValue(property)])
    .filter(([, value]) => value && value !== 'normal' && value !== 'auto')
    .map(([property, value]) => `${property}:${value}`);
  if (source.tagName?.toLowerCase() === 'text' || source.tagName?.toLowerCase() === 'tspan') {
    declarations.push(`font-family:${EXPORT_FONT_STACK}`);
  }
  target.setAttribute('style', declarations.join(';'));
  target.removeAttribute('class');
  const sourceChildren = [...source.children];
  const targetChildren = [...target.children];
  sourceChildren.forEach((child, index) => {
    if (targetChildren[index]) inlineComputedStyles(child, targetChildren[index], window);
  });
}

const estimateTextWidth = (text, fontSize) => [...String(text || '')]
  .reduce((total, char) => total + (/[⺀-￿]/.test(char) ? fontSize : fontSize * 0.58), 0);

// Donut, stacked-bar and radar legends are HTML next to the SVG in the chat.
// A document needs them inside the picture, so they are redrawn below it.
function appendLegend(svg, host, width, height, window) {
  const items = [...host.querySelectorAll('.ac-chart-legend-item')].map((item) => ({
    color: window.getComputedStyle(item.querySelector('.ac-chart-legend-swatch') || item).backgroundColor || '#64748b',
    label: item.querySelector('.ac-chart-legend-label')?.textContent?.trim() || '',
    value: item.querySelector('.ac-chart-legend-value')?.textContent?.trim() || ''
  })).filter((item) => item.label);
  if (items.length === 0) return height;

  const fontSize = Math.max(13, Math.round(width / 52));
  const swatch = Math.round(fontSize * 0.85);
  const gap = Math.round(fontSize * 1.4);
  const rowHeight = Math.round(fontSize * 2);
  const padding = Math.round(fontSize * 1.2);
  const rows = [[]];
  let cursor = 0;
  items.forEach((item) => {
    const text = item.value ? `${item.label}  ${item.value}` : item.label;
    const itemWidth = swatch + fontSize * 0.5 + estimateTextWidth(text, fontSize);
    if (cursor > 0 && cursor + itemWidth > width - padding * 2) {
      rows.push([]);
      cursor = 0;
    }
    rows.at(-1).push({ ...item, text, itemWidth });
    cursor += itemWidth + gap;
  });

  const group = svg.ownerDocument.createElementNS(SVG_NS, 'g');
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((total, item) => total + item.itemWidth, 0) + gap * (row.length - 1);
    let x = Math.max(padding, (width - rowWidth) / 2);
    // Text is vertically centred on this line; the swatch is centred on it too.
    const centerY = height + padding + rowIndex * rowHeight + fontSize * 0.35;
    row.forEach((item) => {
      const rect = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(centerY - swatch / 2));
      rect.setAttribute('width', String(swatch));
      rect.setAttribute('height', String(swatch));
      rect.setAttribute('rx', String(Math.round(swatch / 4)));
      rect.setAttribute('style', `fill:${item.color}`);
      const label = svg.ownerDocument.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(x + swatch + fontSize * 0.5));
      label.setAttribute('y', String(centerY));
      label.setAttribute('style', `fill:#374151;font-size:${fontSize}px;dominant-baseline:middle;font-family:${EXPORT_FONT_STACK}`);
      label.textContent = item.text;
      group.append(rect, label);
      x += item.itemWidth + gap;
    });
  });
  svg.appendChild(group);
  return height + padding * 2 + rows.length * rowHeight - rowHeight / 2;
}

async function svgToPng(svgText, width, height, { document, window }) {
  const blob = new window.Blob([svgText], { type: 'image/svg+xml' });
  const url = window.URL.createObjectURL(blob);
  try {
    const image = new window.Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('chart image failed to load'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * PNG_SCALE);
    canvas.height = Math.round(height * PNG_SCALE);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) throw new Error('chart image could not be encoded');
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

export async function renderChartImage(chart, { document = globalThis.document, window = globalThis.window } = {}) {
  if (!document?.body || !window?.getComputedStyle) return null;
  const host = document.createElement('div');
  // .model-message scopes the chart stylesheet; the host sits off-screen but
  // stays laid out so computed styles and fonts resolve normally.
  host.className = 'model-message ac-file-chart-export';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-30000px;top:0;width:${RENDER_WIDTH_PX}px;pointer-events:none;`;
  document.body.appendChild(host);
  try {
    const placeholder = createChartPlaceholderElement({ document, chart });
    host.appendChild(placeholder);
    if (!mountChartPlaceholder(placeholder, { messageRole: 'assistant' })) return null;
    await waitForDeferredChart(host, window);

    const svg = host.querySelector('svg.ac-chart-svg') || host.querySelector('.ac-chart svg');
    if (!svg) return null;
    const viewBox = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    const [, , width, height] = viewBox.length === 4 && viewBox.every(Number.isFinite)
      ? viewBox
      : [0, 0, svg.clientWidth || RENDER_WIDTH_PX, svg.clientHeight || 360];

    const clone = svg.cloneNode(true);
    inlineComputedStyles(svg, clone, window);
    clone.querySelectorAll(REMOVED_SELECTOR).forEach((node) => node.remove());
    clone.querySelectorAll('*').forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (/^(?:on|tabindex|aria-|data-|role)/i.test(attribute.name)) node.removeAttribute(attribute.name);
      });
    });
    const totalHeight = appendLegend(clone, host, width, height, window);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(totalHeight));
    clone.removeAttribute('role');
    clone.removeAttribute('aria-labelledby');
    clone.removeAttribute('style');

    const svgText = new window.XMLSerializer().serializeToString(clone);
    const png = await svgToPng(svgText, width, totalHeight, { document, window });
    return { svg: new TextEncoder().encode(svgText), png, width, height: totalHeight };
  } finally {
    host.remove();
  }
}
