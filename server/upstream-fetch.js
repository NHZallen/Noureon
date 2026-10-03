// What the browser asks of this app's own /api/... functions (which exist only to get past the browsers' cross-site rules: web
// search, page reading, and NVIDIA's chat), done by the server straight at the services, with the same fields passed on and no
// others. It is a `fetch` that knows these five paths, so the shared code that makes the requests (web-research-tools.js,
// stream-api-call.js) runs here unchanged.

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';
const TINYFISH_SEARCH_URL = 'https://api.search.tinyfish.ai';
const TINYFISH_FETCH_URL = 'https://api.fetch.tinyfish.ai';
const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const TINYFISH_SEARCH_PARAMETERS = ['query', 'domain_type', 'location', 'language', 'page', 'recency_minutes', 'after_date', 'before_date'];
const TINYFISH_DOMAIN_TYPES = new Set(['web', 'news', 'research_paper']);
const MAX_URLS = 10;
const isWebAddress = (value) => /^https?:\/\/[^\s]+$/i.test(value);
const addressesOf = (body) => [...new Set((Array.isArray(body?.urls) ? body.urls : []).map((value) => String(value || '').trim()).filter(isWebAddress))].slice(0, MAX_URLS);

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const keyOf = (init) => String(new Headers(init?.headers).get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
const parse = (init) => {
  try {
    return typeof init?.body === 'string' ? JSON.parse(init.body) : {};
  } catch {
    return {};
  }
};

/** A fetch for the shared code: its five paths go to the services, anything else to `fetchImpl` as it is. */
export function createUpstreamFetch({ fetchImpl = fetch, timeoutMs = 45_000 } = {}) {
  const upstream = (url, options, signal) => fetchImpl(url, { ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)) });

  return async function searchFetch(input, init = {}) {
    const path = String(input);
    const key = keyOf(init);
    const body = parse(init);
    const signal = init.signal;
    if (!path.startsWith('/api/')) return fetchImpl(input, init);
    if (!key) return reply(401, { error: 'Missing key' });

    if (path === '/api/nvidia-chat') {
      // The chat itself, streamed: no time limit but the reply's own (the signal).
      return fetchImpl(NVIDIA_CHAT_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: typeof init.body === 'string' ? init.body : JSON.stringify(body), signal });
    }
    if (path === '/api/tavily-search') {
      return upstream(TAVILY_SEARCH_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, signal);
    }
    if (path === '/api/tavily-extract') {
      const urls = addressesOf(body);
      if (urls.length === 0) return reply(400, { error: 'Missing page addresses (http or https)' });
      return upstream(TAVILY_EXTRACT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          extract_depth: ['basic', 'advanced'].includes(body.extract_depth) ? body.extract_depth : 'basic',
          format: ['markdown', 'text'].includes(body.format) ? body.format : 'markdown',
          include_images: false
        })
      }, signal);
    }
    if (path === '/api/tinyfish-search') {
      const query = String(body.query || '').trim();
      if (!query) return reply(400, { error: 'Missing search query' });
      const url = new URL(TINYFISH_SEARCH_URL);
      for (const name of TINYFISH_SEARCH_PARAMETERS) {
        const value = body[name];
        if (value === undefined || value === null || value === '') continue;
        if (name === 'domain_type' && !TINYFISH_DOMAIN_TYPES.has(value)) continue;
        url.searchParams.set(name, String(value));
      }
      return upstream(url, { method: 'GET', headers: { 'X-API-Key': key } }, signal);
    }
    if (path === '/api/tinyfish-fetch') {
      const urls = addressesOf(body);
      if (urls.length === 0) return reply(400, { error: 'Missing page addresses (http or https)' });
      return upstream(TINYFISH_FETCH_URL, {
        method: 'POST',
        headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, format: ['markdown', 'html', 'json'].includes(body.format) ? body.format : 'markdown' })
      }, signal);
    }
    return reply(404, { error: 'Not found' });
  };
}
