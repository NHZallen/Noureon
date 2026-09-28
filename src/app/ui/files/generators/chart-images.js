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
