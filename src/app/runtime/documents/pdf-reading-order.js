const normalizeWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();

export function reconstructPdfReadingOrder(items = []) {
  const spans = items.map((item, originalIndex) => ({
    text: normalizeWhitespace(item.str),
    x: Number(item.transform?.[4] || 0),
    y: Number(item.transform?.[5] || 0),
    width: Number(item.width || 0),
    height: Number(item.height || Math.abs(item.transform?.[3] || 0)),
    fontName: item.fontName || '',
    originalIndex
  })).filter(item => item.text);
  const lines = [];
  for (const span of [...spans].sort((left, right) => right.y - left.y || left.x - right.x)) {
    let line = lines.find(candidate => Math.abs(candidate.y - span.y) <= Math.max(2, span.height * 0.35));
    if (!line) {
      line = { y: span.y, spans: [] };
      lines.push(line);
    }
    line.spans.push(span);
  }
  lines.sort((left, right) => right.y - left.y);
  const orderedLines = lines.flatMap(line => {
    const sortedSpans = line.spans.sort((left, right) => left.x - right.x);
    const segments = [];
    let current = [];
    for (const span of sortedSpans) {
      const previous = current.at(-1);
      const gap = previous ? span.x - (previous.x + previous.width) : 0;
      if (current.length && gap > Math.max(60, span.height * 6)) {
        segments.push({ y: line.y, spans: current });
        current = [];
      }
      current.push(span);
    }
    if (current.length) segments.push({ y: line.y, spans: current });
    return segments;
  });
  for (const line of orderedLines) {
    line.minX = Math.min(...line.spans.map(span => span.x));
    line.maxX = Math.max(...line.spans.map(span => span.x + span.width));
    line.centerX = (line.minX + line.maxX) / 2;
  }
  const pageMinX = orderedLines.length ? Math.min(...orderedLines.map(line => line.minX)) : 0;
  const pageMaxX = orderedLines.length ? Math.max(...orderedLines.map(line => line.maxX)) : 0;
  const midpoint = pageMinX + ((pageMaxX - pageMinX) / 2);
  const tolerance = Math.max(8, (pageMaxX - pageMinX) * 0.04);
  const leftColumn = orderedLines.filter(line => line.maxX < midpoint + tolerance);
  const rightColumn = orderedLines.filter(line => line.minX > midpoint - tolerance);
  const spanning = orderedLines.filter(line => !leftColumn.includes(line) && !rightColumn.includes(line));
  const columnsDetected = leftColumn.length >= 2 && rightColumn.length >= 2;
  let readingOrder = orderedLines;
  if (columnsDetected) {
    const topY = Math.max(...leftColumn.map(line => line.y), ...rightColumn.map(line => line.y));
    const bottomY = Math.min(...leftColumn.map(line => line.y), ...rightColumn.map(line => line.y));
    readingOrder = [
      ...spanning.filter(line => line.y > topY),
      ...leftColumn,
      ...spanning.filter(line => line.y <= topY && line.y > bottomY),
      ...rightColumn,
      ...spanning.filter(line => line.y <= bottomY)
    ];
  }
  return {
    text: readingOrder.map(line => line.spans.map(span => span.text).join(' ')).join('\n'),
    rawText: [...spans].sort((left, right) => left.originalIndex - right.originalIndex).map(span => span.text).join(' '),
    spans,
    lines: orderedLines,
    columnsDetected
  };
}

export function shouldFallbackPdfPageToOcr(text) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < 20) return true;
  const replacementCharacters = (normalized.match(/\uFFFD/g) || []).length;
  const controlCharacters = (normalized.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  return (replacementCharacters + controlCharacters) / normalized.length > 0.05;
}
