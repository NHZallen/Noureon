// Draws the charts of a document model as images (SVG and PNG), for the Word
// and PDF generators. Without a browser, or when a chart cannot be drawn,
// the chart is simply missing from the map and its data becomes a table.

export async function renderChartImages(blocks, context) {
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

// Picture blocks (Markdown images referring to "upload:N" or "asset:name"),
// resolved once before a document is written: PNG or JPEG bytes with their
// size in pixels. An image that cannot be found is left out of the map and
// its description is written instead.
const parseImageDataUrl = (value) => {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(value || ''));
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { type: match[1].toLowerCase() === 'png' ? 'png' : 'jpg', bytes, dataUrl: value };
};

export async function resolveDocumentImages(blocks, context) {
  const images = new Map();
  if (typeof context.resolveImage !== 'function') return images;
  const pending = [];
  const visit = (list) => list.forEach((block) => {
    if (block.type === 'image') pending.push(block);
    if (block.type === 'quote') visit(block.blocks);
    if (block.type === 'list') block.items.forEach((item) => visit(item.blocks));
  });
  visit(blocks);
  for (const block of pending) {
    try {
      const resolved = await context.resolveImage(block.source);
      const parsed = parseImageDataUrl(resolved?.data);
      const width = Number(resolved?.pixels?.width);
      const height = Number(resolved?.pixels?.height);
      if (parsed && width > 0 && height > 0) images.set(block, { ...parsed, width, height });
    } catch {
      // The description stands in for the picture.
    }
  }
  return images;
}
