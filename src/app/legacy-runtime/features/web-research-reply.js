// A reply that searches the web the way ChatGPT does: the model is given two tools, web_search and open_page, and decides
// for itself what to look up, which results to open and when it knows enough, a round at a time (a repository's releases,
// then the page of one release, then its notes). Each call is a row in the step list. The model's own words before a call
// are shown between the rows; the words after the last call are the answer and stream as usual. For the models that have
// no search of their own but do call tools (OpenRouter's); the others get a search packet in front of the request.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { hostOf } from '../../ui/sandbox/run-sources.js';

export const WEB_SEARCH_TOOL = Object.freeze({
  name: 'web_search',
  description: 'Search the web. Returns the titles, addresses and snippets of the best pages. Use it for anything that may have changed or that you are not sure of. Search again with other words when the results do not answer.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for: the specific names, products or versions, a few words, no sentence.' },
      topic: { type: 'string', enum: ['general', 'news'], description: '"news" for what happened recently; otherwise "general".' }
    },
    required: ['query']
  })
});

export const OPEN_PAGE_TOOL = Object.freeze({
  name: 'open_page',
  description: 'Open one web page and read its text. Use it when a search result is not enough: the page of a repository\'s releases, tags or README, documentation, an article, a product page. An address the user gave you is opened with it too.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The full address (https://…) of the page to open.' }
    },
    required: ['url']
  })
});

export const RESEARCH_TOOLS = Object.freeze([WEB_SEARCH_TOOL, OPEN_PAGE_TOOL]);
const TOOL_NAMES = new Set(RESEARCH_TOOLS.map((tool) => tool.name));

// Calls (searches and pages opened) in one reply.
export const MAX_RESEARCH_CALLS = 8;
const PAGE_CHARS = 12_000;
const SNIPPET_CHARS = 700;
const RESULTS_SHOWN = 8;
// A round's first words are held back this long: if a call follows, they were the model saying what it is about to do.
const NARRATION_HOLD_CHARS = 400;

export const researchGuidance = (today = new Date().toISOString().slice(0, 10)) => [
  `You can search the web (web_search) and open pages (open_page). Today is ${today}.`,
  'Search when the answer depends on facts that may have changed or that you do not know. Do not search for what you already know well.',
  'Look at the results before you decide what to open. When a snippet does not answer, open the page: for a GitHub repository its /releases, /tags or /commits pages or its README tell what a snippet cannot. Search again with other words when the results miss.',
  'Stop when you can answer, and answer from what you read. Name the sources (site and title) in your answer in a natural way, and say plainly when you could not find something or could not open a page.'
].join('\n');

const cut = (text, limit) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

/** What the model is given for a search: numbered results with their address and the start of their text. */
export function searchResultText(query, results = []) {
  const shown = results.slice(0, RESULTS_SHOWN);
  if (shown.length === 0) return `No results for "${query}". Try other words.`;
  return [
    `Results for "${query}":`,
    ...shown.map((result, index) => [
      '',
      `${index + 1}. ${cut(result.title, 160) || hostOf(result.url)}`,
      `URL: ${result.url}`,
      `Snippet: ${cut(result.content, SNIPPET_CHARS) || '(none)'}`
    ].join('\n'))
  ].join('\n');
}

/** What the model is given for a page: its address, and its text marked as the app's source material. */
export function pageText(page) {
  return [
    `Page: ${page.title || page.url}`,
    `URL: ${page.finalUrl || page.url}`,
    ...(page.truncated ? ['(The page is longer: only its first part is given.)'] : []),
    '<web_page_text>',
    page.text,
    '</web_page_text>'
  ].join('\n');
}

const addressOf = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

const throwIfStopped = (signal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
};

/**
 * The model's searches and page openings, run for it: `run(call)` does one call (a row in the step list, the pages reported)
 * and answers with the text the model reads. A call over the limit, a repeated page and a bad argument are answered with
 * what to do instead. Shared by the reply that only searches (below) and Advanced mode, where it goes with Python.
 */
export function createResearchCalls({
  searchWeb,
  openPage,
  language = 'zh-TW',
  maxCalls = MAX_RESEARCH_CALLS,
  signal,
  onEvent = () => {},
  onSources = () => {}
}) {
  const opened = new Set();
  let used = 0;

  const doSearch = async (call) => {
    const query = typeof call.args?.query === 'string' ? call.args.query.trim() : '';
    if (!query) return 'The call had no "query" argument.';
    onEvent({ type: 'searching', label: sandboxText(language, 'webSearchingFor', { query: cut(query, 80) }) });
    try {
      const data = await searchWeb({ query, topic: call.args?.topic === 'news' ? 'news' : 'general', signal });
      const results = (Array.isArray(data?.results) ? data.results : []).filter((result) => result?.url);
      const sources = results.slice(0, RESULTS_SHOWN).map((result) => ({ title: result.title || '', url: result.url }));
      onSources(sources);
      onEvent({ type: 'sources', sources });
      return searchResultText(query, results);
    } catch (error) {
      throwIfStopped(signal);
      onEvent({ type: 'sources', sources: [] });
      return `The search failed (${cut(error?.message, 200) || 'unknown error'}). You can try other words, or answer without it and say so.`;
    }
  };

  const doOpen = async (call) => {
    const url = addressOf(call.args?.url);
    if (!url) return 'The call had no valid "url" argument (it must start with http:// or https://).';
    if (opened.has(url)) return 'You already opened this page; its text is above.';
    opened.add(url);
    onEvent({ type: 'searching', label: sandboxText(language, 'webOpeningPage', { host: hostOf(url) }) });
    try {
      const { pages, failed } = await openPage([url], signal, { maxChars: PAGE_CHARS });
      const [page] = pages;
      if (!page) {
        onEvent({ type: 'sources', sources: [] });
        return failed[0]?.reason === 'noReader'
          ? 'No page reader is set up: reading a page needs a Tavily or TinyFish API key in Settings. Tell the user.'
          : 'The page could not be read (it may block automated reading, need a login, or be down). Tell the user, or try another page.';
      }
      const source = { title: page.title || '', url: page.finalUrl || page.url, read: true };
      onSources([source]);
      onEvent({ type: 'sources', sources: [source] });
      return pageText(page);
    } catch (error) {
      throwIfStopped(signal);
      onEvent({ type: 'sources', sources: [] });
      return `The page could not be read (${cut(error?.message, 200) || 'unknown error'}).`;
    }
  };

  return {
    handles: (name) => TOOL_NAMES.has(name),
    get used() { return used; },
    get left() { return Math.max(0, maxCalls - used); },
    async run(call) {
      if (used >= maxCalls) return `The limit of ${maxCalls} searches and pages per reply is reached. Answer with what you have.`;
      used += 1;
      return call.name === WEB_SEARCH_TOOL.name ? doSearch(call) : doOpen(call);
    }
  };
}

export async function runWebResearchReply({
  streamApiCall,
  requestParts,
  onChunk = () => {},
  signal,
  requestOptions = {},
  searchWeb,
  openPage,
  language = 'zh-TW',
  maxCalls = MAX_RESEARCH_CALLS,
  today,
  // { type: 'searching', label }, { type: 'sources', sources }, { type: 'narration', text }, { type: 'answering' }.
  onEvent = () => {},
  onSources = () => {}
}) {
  const toolTurns = [];
  const research = createResearchCalls({ searchWeb, openPage, language, maxCalls, signal, onEvent, onSources });
  let text = '';
  let answering = false;
  const guidance = researchGuidance(today);

  for (;;) {
    const canCall = research.left > 0;
    let response = null;
    let held = '';
    let holding = canCall;
    let roundStarted = false;
    const deliver = (chunk) => {
      if (!chunk) return;
      if (!answering) {
        answering = true;
        onEvent({ type: 'answering' });
      }
      // Words after a round of calls start a new paragraph when some were already written.
      const lead = !roundStarted && text && !text.endsWith('\n') ? '\n\n' : '';
      roundStarted = true;
      text += lead + chunk;
      onChunk(lead + chunk);
    };
    const emit = (chunk) => {
      if (!chunk) return;
      if (!holding) {
        deliver(chunk);
        return;
      }
      held += chunk;
      if (held.length > NARRATION_HOLD_CHARS) {
        holding = false;
        const flushed = held;
        held = '';
        deliver(flushed);
      }
    };
    try {
      await streamApiCall(requestParts, emit, signal, false, {
        ...requestOptions,
        tools: canCall ? RESEARCH_TOOLS : [],
        toolTurns,
        additionalSystemInstruction: [requestOptions.additionalSystemInstruction, guidance].filter(Boolean).join('\n\n'),
        onResponseComplete: (value) => { response = value; }
      });
    } catch (error) {
      // A stop keeps what was written; anything else is the caller's to handle.
      if (!signal?.aborted) throw error;
    }
    const calls = (response?.toolCalls || []).filter((call) => research.handles(call.name));
    if (signal?.aborted || !canCall || calls.length === 0) {
      holding = false;
      deliver(held);
      break;
    }

    // What was held back was the model saying what it is about to do.
    if (held.trim()) onEvent({ type: 'narration', text: held.trim() });
    const results = [];
    for (const call of calls) {
      const content = await research.run(call);
      results.push({ id: call.id, geminiId: call.geminiId, name: call.name, content });
      if (signal?.aborted) break;
    }
    toolTurns.push({ assistant: response, results });
    if (signal?.aborted) break;
  }

  return { text, calls: research.used };
}
