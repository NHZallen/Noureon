// A column of a table that holds only numbers (prices, counts, percentages, amounts) is lined up at the right, like in a sheet: the digits of
// one column stand under each other. A column with any other text, or one the author aligned by hand, is left as it is.

const NUMBER = /^[\s\-+−~≈<>]*(?:NT\$|US\$|[$€£¥])?\s*\d[\d,]*(?:\.\d+)?\s*(?:%|[A-Za-z]{1,3}|元|萬|億|件|個|筆|張|人|天|分|秒|小時|次)?\s*$/;

export function markNumericColumns(table) {
  const rows = [...(table?.rows || [])];
  const body = rows.filter((row) => row.parentElement?.tagName !== 'THEAD' && !row.querySelector('th'));
  if (!body.length) return;
  const columnCount = Math.max(...rows.map((row) => row.cells.length));
  for (let column = 0; column < columnCount; column += 1) {
    const cells = body.map((row) => row.cells[column]).filter(Boolean);
    const filled = cells.filter((cell) => cell.textContent.trim() !== '');
    if (!filled.length || cells.some((cell) => cell.getAttribute('align') || cell.style?.textAlign)) continue;
    if (!filled.every((cell) => NUMBER.test(cell.textContent))) continue;
    rows.forEach((row) => row.cells[column]?.classList.add('ac-table-number'));
  }
}
