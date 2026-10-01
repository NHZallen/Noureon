// The two things the app does on the web for a model that has no search of its own: a search (Tavily or TinyFish, the one
// chosen in Settings) and the reading of whole pages (TinyFish's Fetch or Tavily's Extract). Used for the search packet that
// goes in front of a request, for the pages the user linked (provider-request-support.js) and for the model's own searching
// and page opening in a reply (web-research-reply.js).

import { getSearchProvider } from '../../runtime/kernel/search-provider.js';

const MAX_PAGES_AT_ONCE = 10;

export function createWebResearchTools({
  getConfig,
  getApiKeyForProvider,
  fetchImpl = fetch,
  getErrorMessage,
  readErrorBody,
  normalizeTinyfishSearch,
  normalizePageReads
}) {
  const postWithKey = async (url, { apiKey, body, signal, failure }) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });
    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      throw new Error(getErrorMessage(errorBody, `${failure} HTTP ${response.status}`));
    }
    return response.json();
  };

  const depth = () => (getConfig().tavilySearchDepth === 'advanced' ? 'advanced' : 'basic');

  /** Whether a search or a page reader can be used: the key of one of the two is set. */
  const hasKey = () => ['tinyfish', 'tavily'].some((name) => Boolean(getApiKeyForProvider(name)));

  /** A web search from the chosen source: { results: [{ title, url, content }] }. Throws when its key is not set. */
  const searchWeb = async ({ query, topic = 'general', maxResults = 6, searchDepth, signal }) => {
    const source = getSearchProvider(getConfig());
    const apiKey = getApiKeyForProvider(source);
    if (!apiKey) throw new Error(`No ${source} API key`);
    if (source === 'tinyfish') {
      return normalizeTinyfishSearch(await postWithKey('/api/tinyfish-search', {
        apiKey,
        signal,
        failure: 'TinyFish',
        body: { query, domain_type: topic === 'news' ? 'news' : 'web' }
      }), maxResults);
    }
    return postWithKey('/api/tavily-search', {
      apiKey,
      signal,
      failure: 'Tavily',
      body: {
        query,
        search_depth: searchDepth || depth(),
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: true,
        topic
      }
    });
  };

  // The one that is the search source is tried first, the other if it has no key or leaves pages unread, so having
  // either key is enough.
  const PAGE_READERS = {
    tinyfish: (urls, apiKey, signal) => postWithKey('/api/tinyfish-fetch', {
      apiKey,
      signal,
      failure: 'TinyFish',
      body: { urls, format: 'markdown' }
    }),
    tavily: (urls, apiKey, signal) => postWithKey('/api/tavily-extract', {
      apiKey,
      signal,
      failure: 'Tavily',
      body: { urls, extract_depth: 'advanced', format: 'markdown', include_images: false }
    })
  };

  /**
   * Reads whole pages (up to ten at a time). Returns { pages, failed, reader }, with `failed` as [{ url, reason }]
   * ('noReader' when there is no key at all, 'failed' when the pages could not be read). Only a stop by the person throws.
   */
  const fetchPageContents = async (urls, signal, options = {}) => {
    const requested = [...new Set((urls || []).map((url) => String(url || '').trim()).filter((url) => /^https?:\/\//i.test(url)))].slice(0, MAX_PAGES_AT_ONCE);
    if (requested.length === 0) return { pages: [], failed: [], reader: null };
    const first = getSearchProvider(getConfig());
    const readers = [first, first === 'tinyfish' ? 'tavily' : 'tinyfish'].filter((reader) => getApiKeyForProvider(reader));
    if (readers.length === 0) {
      return { pages: [], failed: requested.map((url) => ({ url, reason: 'noReader' })), reader: null };
    }
    const pages = [];
    let unread = requested;
    let used = null;
    for (const reader of readers) {
      if (unread.length === 0) break;
      try {
        const data = await PAGE_READERS[reader](unread, getApiKeyForProvider(reader), signal);
        const read = normalizePageReads(data, { requested: unread, maxChars: options.maxChars || 8000 });
        if (read.pages.length > 0) used ??= reader;
        pages.push(...read.pages);
        unread = read.failed;
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;
      }
    }
    return { pages, failed: unread.map((url) => ({ url, reason: 'failed' })), reader: used };
  };

  return { fetchPageContents, hasKey, searchWeb };
}
