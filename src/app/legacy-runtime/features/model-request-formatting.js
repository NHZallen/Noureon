const TAVILY_QUERY_CHAR_LIMIT = 380;

export const getSearchCurrentDate = () => new Date().toISOString().slice(0, 10);

export const isWorldCupQuery = (value = '') => /(\bworld cup\b|\bfifa\b|世界盃|世界杯|美加墨)/i.test(String(value || ''));

export const isSportsResultsQuery = (value = '') => /(\bmatch\b|\bmatches\b|\bscore\b|\bscores\b|\bfixture\b|\bfixtures\b|\bstandings\b|\bgroup stage\b|\bwin\b|\bwins\b|\bwon\b|贏幾場|贏了幾場|幾勝|比分|賽果|戰績|小組賽|足球|賽程|排名)/i.test(String(value || '')) || isWorldCupQuery(value);

export const normalizeSearchQuery = (value = '') => String(value || '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, TAVILY_QUERY_CHAR_LIMIT)
  .trim();

export const buildTavilySearchQuery = (value = '') => {
  const text = String(value || '');
  const sportsBoost = isWorldCupQuery(text)
    ? ' FIFA World Cup official match report results scores wins group stage'
    : (isSportsResultsQuery(text) ? ' official results scores wins fixtures standings' : '');
  return normalizeSearchQuery(`${text} current date ${getSearchCurrentDate()} latest${sportsBoost}`);
};

// TinyFish's search answers with a list of results that carry a snippet; this gives them the shape Tavily's have, so
// one packet format serves both. The field names are taken defensively: a result's text may come as `snippet`,
// `text` or `content`, and its site as `site_name`, `domain` or `source`.
export const normalizeTinyfishSearch = (data, limit = 6) => {
  const list = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
  return {
    results: list
      .map((item) => ({
        title: String(item?.title || item?.site_name || item?.domain || '').trim(),
        url: String(item?.url || item?.link || '').trim(),
        content: String(item?.snippet || item?.text || item?.content || item?.description || '').trim()
      }))
      .filter((item) => item.url)
      .slice(0, limit)
  };
};

// The pages TinyFish's Fetch read, each cut to `maxChars` (a page can be long, and the model reads many of them).
// `requested` is what was asked for: the ones that did not come back are `failed`, so the model is told what it
// could not read instead of silently getting fewer pages.
export const normalizeTinyfishFetch = (data, { requested = [], maxChars = 8000 } = {}) => {
  const list = Array.isArray(data?.results) ? data.results : [];
  const pages = list
    .map((item) => {
      const text = String(item?.text || item?.markdown || item?.content || '').trim();
      return {
        url: String(item?.url || '').trim(),
        finalUrl: String(item?.final_url || item?.url || '').trim(),
        title: String(item?.title || '').trim(),
        language: String(item?.language || '').trim(),
        text: text.slice(0, maxChars),
        truncated: text.length > maxChars
      };
    })
    .filter((page) => page.url && page.text);
  const got = new Set(pages.flatMap((page) => [page.url, page.finalUrl]));
  return { pages, failed: requested.filter((url) => !got.has(url)) };
};

export const formatTavilySearchPacket = (data, query, label = 'Web search packet', provider = 'Tavily') => {
  const results = Array.isArray(data?.results) ? data.results : [];
  const lines = [
    `# ${label}`,
    '',
    `Provider: ${provider}`,
    `Query: ${data?.query || query}`,
    `Current date: ${getSearchCurrentDate()}`,
    `Retrieved at: ${new Date().toISOString()}`
  ];
  if (data?.answer) {
    lines.push('', `## ${provider} answer`, String(data.answer).trim());
  }
  if (results.length > 0) {
    lines.push('', '## Sources');
    results.slice(0, 8).forEach((result, index) => {
      lines.push(
        '',
        `${index + 1}. ${result.title || 'Untitled source'}`,
        `URL: ${result.url || ''}`
      );
      // The text of the page itself when it was read in full (TinyFish's Fetch), which holds the snippet and more.
      lines.push(result.page
        ? `Page text: ${result.page}`
        : `Content: ${String(result.content || result.raw_content || '').trim().slice(0, 1400) || 'No snippet returned.'}`);
      if (typeof result.score === 'number') {
        lines.push(`Score: ${result.score.toFixed(3)}`);
      }
    });
  } else {
    lines.push('', `No ${provider} results were returned.`);
  }
  lines.push(
    '',
    'Use this as system-generated web context. Do not say or imply that the user wrote this packet. Prefer dated source evidence from the Sources section when making current factual claims, and state uncertainty when sources conflict.'
  );
  return lines.join('\n');
};
