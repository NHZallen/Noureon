import { asksForCurrentFacts } from '../../runtime/features/auto-web-search.js';

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

// Words that carry no subject ("go look it up", "search", "please", the sentence-final particles), to tell a message that
// says what to search for from one that only says to search.
const FILLER = /搜索|搜尋|查詢|查證|查一下|查查|查|去|幫我|幫忙|請|麻煩|你|我|阿|啊|吧|嗎|呢|喔|哦|啦|一下|看看|找|google|search(?: for)?|look(?: it| that| this)? up|find out|please|can you|could you|go|do it|again|recherche|cherche|поищи|найди|busca/giu;
const MIN_SUBJECT_CHARS = 6;
const EARLIER_MESSAGES = 2;
const EARLIER_MESSAGE_CHARS = 200;

const subjectLength = (text = '') => String(text || '').replace(FILLER, '').replace(/[\s\p{P}\p{S}]/gu, '').length;
const messageText = (message) => (message?.parts || []).map((part) => part?.text || '').join(' ').trim();

/**
 * What to search for. A message that only says to search ("go look it up", "search again") has no subject of its own: the
 * subject is in the messages before it, so the last user messages that have one come first. Anything with a subject of
 * its own is searched as it is. `messages` is the conversation's, which may already end with this message.
 */
export const withSearchContext = (text, messages = []) => {
  const current = String(text || '').trim();
  if (subjectLength(current) >= MIN_SUBJECT_CHARS) return current;
  const earlier = (Array.isArray(messages) ? messages : []).filter((message) => message?.role === 'user').map(messageText);
  if (earlier.length > 0 && earlier.at(-1) === current) earlier.pop();
  const subjects = earlier.filter((entry) => subjectLength(entry) >= MIN_SUBJECT_CHARS).slice(-EARLIER_MESSAGES);
  return subjects.length > 0
    ? `${subjects.map((entry) => entry.slice(0, EARLIER_MESSAGE_CHARS)).join(' ')} ${current}`.trim()
    : current;
};

// The search is for what the text says, as it is. The date and "latest" are added only to a text that asks about what is
// current: on a text that does not, they were most of the query for a short one, and the search answered them (time
// converters for "current date", exam timetables for a date, pre-order pages for "latest").
// A query that was built is passed on to be built again (the council's, a search packet's): what it already has is not added twice.
export const buildTavilySearchQuery = (value = '') => {
  const text = String(value || '');
  const date = getSearchCurrentDate();
  const boost = isWorldCupQuery(text)
    ? ' FIFA World Cup official match report results scores wins group stage'
    : (isSportsResultsQuery(text) ? ' official results scores wins fixtures standings' : '');
  const sportsBoost = boost && !text.includes(boost.trim()) ? boost : '';
  const freshness = asksForCurrentFacts(text) && !text.includes(`${date} latest`) ? ` ${date} latest` : '';
  return normalizeSearchQuery(`${text}${freshness}${sportsBoost}`);
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

// The pages a page reader (TinyFish's Fetch, Tavily's Extract) gave back, each cut to `maxChars` (a page can be long, and
// the model may be given several). `requested` is what was asked for: the ones that did not come back are `failed`, so
// the model can be told what could not be read instead of silently getting fewer pages. The text may be called
// `text`, `markdown`, `content` or `raw_content`, the address `url`, and the one after redirects `final_url`.
export const normalizePageReads = (data, { requested = [], maxChars = 8000 } = {}) => {
  const list = Array.isArray(data?.results) ? data.results : [];
  const pages = list
    .map((item) => {
      const text = String(item?.text || item?.markdown || item?.raw_content || item?.content || '').trim();
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
        `URL: ${result.url || ''}`,
        `Content: ${String(result.content || result.raw_content || '').trim().slice(0, 1400) || 'No snippet returned.'}`
      );
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
