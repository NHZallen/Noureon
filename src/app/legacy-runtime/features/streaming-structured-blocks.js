const CHART_FENCE_LANGUAGE_PATTERN = /^(chart|json|javascript|js)$/i;
const PARTIAL_CHART_FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})[ \t]*(?:c(?:h(?:a(?:r(?:t)?)?)?)?)?[ \t]*$/i;
const CHART_SOURCE_HINT_PATTERN = /"type"\s*:|\bseries\s*:|\boption\s*=/i;

function getSourceLines(text = '') {
  const source = String(text || '');
  const lines = [];
  let start = 0;
  while (start < source.length) {
    const newline = source.indexOf('\n', start);
    const end = newline < 0 ? source.length : newline + 1;
    const raw = source.slice(start, end);
    lines.push({
      start,
      end,
      text: raw.replace(/\n$/, '').replace(/\r$/, '')
    });
    start = end;
  }
  return lines;
}

function isClosingFence(line, openingFence) {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return Boolean(
    match
    && match[1][0] === openingFence[0]
    && match[1].length >= openingFence.length
  );
}

function hasChartIntent(language, source) {
  return language === 'chart' || CHART_SOURCE_HINT_PATTERN.test(source);
}

export function findTrailingStreamingChart(text = '') {
  const source = String(text || '');
  const lines = getSourceLines(source);
  let active = null;
  let lastClosed = null;

  for (const line of lines) {
    if (active) {
      if (isClosingFence(line.text, active.fence)) {
        lastClosed = {
          ...active,
          complete: true,
          end: line.end,
          source: source.slice(active.sourceStart, line.start)
        };
        active = null;
      }
      continue;
    }

    const opening = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[ \t]*$/.exec(line.text);
    const language = opening?.[2]?.toLowerCase() || '';
    if (opening && CHART_FENCE_LANGUAGE_PATTERN.test(language)) {
      active = {
        start: line.start,
        sourceStart: line.end,
        fence: opening[1],
        language
      };
    }
  }

  if (active) {
    const chartSource = source.slice(active.sourceStart);
    if (hasChartIntent(active.language, chartSource)) {
      return {
        ...active,
        complete: false,
        end: source.length,
        source: chartSource,
        prefix: source.slice(0, active.start)
      };
    }
    return null;
  }

  if (lastClosed && !source.slice(lastClosed.end).trim() && hasChartIntent(lastClosed.language, lastClosed.source)) {
    return {
      ...lastClosed,
      prefix: source.slice(0, lastClosed.start)
    };
  }

  const lastLine = lines.at(-1);
  if (lastLine && PARTIAL_CHART_FENCE_PATTERN.test(lastLine.text)) {
    return {
      start: lastLine.start,
      sourceStart: lastLine.end,
      end: source.length,
      fence: /^ {0,3}(`{3,}|~{3,})/.exec(lastLine.text)?.[1] || '```',
      language: 'chart',
      source: '',
      prefix: source.slice(0, lastLine.start),
      complete: false,
      partialOpening: true
    };
  }

  return null;
}

const getPipeCount = (line) => (String(line || '').match(/\|/g) || []).length;
const isGeneratedTableRow = (line) => /^\s*\|/.test(line) || getPipeCount(line) >= 2;

function isTableDelimiter(line) {
  const trimmed = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = trimmed.split('|').map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function findTrailingStreamingTable(text = '') {
  const source = String(text || '');
  const analysisSource = source.endsWith('\n') ? source.slice(0, -1) : source;
  const lines = analysisSource.split('\n');
  const offsets = [];
  let offset = 0;
  lines.forEach((line) => {
    offsets.push(offset);
    offset += line.length + 1;
  });

  let match = null;
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isGeneratedTableRow(lines[index]) || !isTableDelimiter(lines[index + 1])) continue;
    const trailingLines = lines.slice(index + 2);
    if (trailingLines.every((line) => line.length > 0 && isGeneratedTableRow(line))) {
      match = {
        start: offsets[index],
        end: source.length,
        prefix: source.slice(0, offsets[index]),
        source: source.slice(offsets[index])
      };
    }
  }
  return match;
}
