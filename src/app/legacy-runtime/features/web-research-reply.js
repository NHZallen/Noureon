// A reply that searches the web the way ChatGPT does: the model is given two tools, web_search and open_page, and decides
// for itself what to look up, which results to open and when it knows enough, a round at a time (a repository's releases,
// then the page of one release, then its notes). Each call is a row in the step list. What the model says about a call is the
// call's `note`, shown between the rows; every word it writes as text is the answer and streams as it comes. For the models that have
// no search of their own but do call tools (OpenRouter's); the others get a search packet in front of the request.

import { loaderInstruction } from '../../../data/skill-tool.js';
import { loaderStepEvent, sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { hostOf } from '../../ui/sandbox/run-sources.js';
import { resultDate } from './model-request-formatting.js';
import { NOTE_PARAMETER, partialJsonString } from './tool-call-formats.js';
import { absoluteLinks, findPassages, pageWindow } from './web-page-text.js';

export const WEB_SEARCH_TOOL = Object.freeze({
  name: 'web_search',
  description: 'Search the web. Returns the titles, addresses and snippets of the best pages. Use it for anything that may have changed or that you are not sure of. Search again with other words when the results do not answer.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      note: NOTE_PARAMETER,
      query: { type: 'string', description: 'What to search for: the specific names, products or versions, a few words, no sentence.' },
      topic: { type: 'string', enum: ['general', 'news'], description: '"news" for what happened recently; otherwise "general".' }
    },
    required: ['query']
  })
});

export const OPEN_PAGE_TOOL = Object.freeze({
  name: 'open_page',
  description: 'Open one web page and read its text (the links in the text are written as [text](address), so open one to go deeper). Use it when a search result is not enough: the page of a repository\'s releases, tags or README, documentation, an article, a product page, a file\'s raw text. An address the user gave you is opened with it too. A long page is read a part at a time.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      note: NOTE_PARAMETER,
      url: { type: 'string', description: 'The full address (https://…) of the page to open.' },
      start: { type: 'integer', description: 'Where to start reading a long page, in characters (the end of the part before it is told). Leave out for the beginning.' }
    },
    required: ['url']
  })
});

export const FIND_IN_PAGE_TOOL = Object.freeze({
  name: 'find_in_page',
  description: 'Look for a word or phrase in a page (opened first if it was not) and get the passages around it, with where each starts. Use it on a long page to jump to what you need, such as a version number, a date or a name.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      note: NOTE_PARAMETER,
      url: { type: 'string', description: 'The full address of the page.' },
      query: { type: 'string', description: 'The word or phrase to look for.' }
    },
    required: ['url', 'query']
  })
});

export const RESEARCH_TOOLS = Object.freeze([WEB_SEARCH_TOOL, OPEN_PAGE_TOOL, FIND_IN_PAGE_TOOL]);
const TOOL_NAMES = new Set(RESEARCH_TOOLS.map((tool) => tool.name));

// Calls (searches, pages opened and looked through) in one reply.
export const MAX_RESEARCH_CALLS = 20;
// A page is kept whole (up to this) so it can be read on and searched; the model is given a window of it at a time.
const PAGE_KEPT_CHARS = 150_000;
const PAGE_CHARS = 10_000;
const SNIPPET_CHARS = 700;
const RESULTS_SHOWN = 8;

export const researchGuidance = (today = new Date().toISOString().slice(0, 10)) => [
  `You can search the web (web_search), open pages (open_page) and look for a word in a page (find_in_page). Today is ${today}. Python, if you have it, has no internet: everything from the web comes through these tools.`,
  'Search when the answer depends on facts that may have changed or that you do not know. Do not search for what you already know well.',
  'Research like a person who needs the real answer, not the first plausible one:',
  '- A result may have a Date: when its page was published. For what changes over time (versions, prices, news), prefer the newer pages; an undated result is not necessarily old.',
  '- A snippet is a hint. Open the page that is likely to hold the answer and read it; on a long page use find_in_page to jump to the word you need (a version, a date, a name, a price).',
  '- The text of a page has its links as [text](address): follow the ones that lead closer, one level after another (a repository to its releases, tags or files; a site to its docs, changelog or pricing page).',
  '- For a GitHub repository, its README and /releases, /tags and /commits pages are the first places; a version is also written in files such as package.json, pyproject.toml or a version file, whose raw text is at raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>.',
  '- When a search misses, search again with other words (the exact name, another language, a site name added). When a page cannot be read, try another route to the same fact before giving up.',
  '- Do not stop after one search and do not say you cannot look it up: you can. Stop when you have the answer or when the routes you tried are used up, and then say what you tried.',
  'Say what a call is for in its `note` argument: one short sentence in the language of your reply. The user sees it between the steps. Do not write text before a call: any text you write is shown as your answer at once.',
  'Cite what you rely on: each result and page has a number in square brackets. Put the number right after the sentence it supports, like [2], or [1][3] for several. Use only numbers you were given, never invent one, and do not add a list of sources at the end: the app shows them.',
  'Answer from what you read. Name the sources (site and title) naturally in your answer, and say plainly what you could not find or open.'
].join('\n');

const cut = (text, limit) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

/**
 * What the model is given for a search: its results, each with the number it is cited by (`numbers[i]`, the number the
 * reply knows that page as; the position when there are none), its address and the start of its text.
 */
export function searchResultText(query, results = [], numbers = []) {
  const shown = results.slice(0, RESULTS_SHOWN);
  if (shown.length === 0) return `No results for "${query}". Try other words.`;
  return [
    `Results for "${query}":`,
    ...shown.map((result, index) => [
      '',
      `[${numbers[index] ?? index + 1}] ${cut(result.title, 160) || hostOf(result.url)}`,
      `URL: ${result.url}`,
      // When the page was published, if the source says: what changes over time is best answered from the newer pages.
      ...(resultDate(result) ? [`Date: ${resultDate(result)}`] : []),
      `Snippet: ${cut(result.content, SNIPPET_CHARS) || '(none)'}`
    ].join('\n'))
  ].join('\n');
}

/** What the model is given for a page: its address, and a window of its text marked as the app's source material. */
export function pageText(page, start = 0, n = 0) {
  const window = pageWindow(page.text, start, PAGE_CHARS);
  const more = window.to < window.total;
  return [
    `Page${n ? ` [${n}]` : ''}: ${page.title || page.url}`,
    `URL: ${page.finalUrl || page.url}`,
    window.total > window.to - window.from
      ? `(Characters ${window.from}-${window.to} of ${window.total}.${more ? ` Call open_page with start=${window.to} for the next part, or find_in_page to jump to a word.` : ''})`
      : '',
    '<web_page_text>',
    window.text,
    '</web_page_text>'
  ].filter(Boolean).join('\n');
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
 * What the model says about a step comes in the call's `note` argument, not as text before it, so every word of text is
 * the answer and shows at once. A note is told once to `onEvent` as a narration (shown between the rows): as soon as it
 * is complete while the call is still being written, or when the round is done, whichever is first.
 */
export function createNotes(onEvent) {
  let told = new Set();
  const tell = (value) => {
    const note = String(value || '').replace(/\s+/g, ' ').trim();
    if (!note || told.has(note)) return;
    told.add(note);
    onEvent({ type: 'narration', text: note });
  };
  return {
    /** A new round: its notes are told afresh. */
    reset() { told = new Set(); },
    /** The arguments of a call as far as they have come. */
    fromArguments(raw) { tell(partialJsonString(raw, 'note', { complete: true })); },
    /** A call that has arrived whole. */
    fromCall(call) { tell(call?.args?.note); }
  };
}

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
  onSources = () => {},
  // Where a reply that was interrupted had got to (what `snapshot()` gave): the calls made so far and the pages numbered.
  resume = null
}) {
  let used = Math.max(0, Number(resume?.used) || 0);

  // Every page the model has been shown, numbered in the order it first appeared: the number the model cites it by, and the
  // one the saved sources carry, so an answer's [3] is the third page the reply met.
  const numbered = new Map((Array.isArray(resume?.numbered) ? resume.numbered : []).filter((entry) => entry?.url && Number(entry.n) > 0).map((entry) => [entry.url, { ...entry }]));
  const numberFor = (url, fields = {}) => {
    if (!numbered.has(url)) numbered.set(url, { n: numbered.size + 1, url });
    const entry = numbered.get(url);
    for (const [key, value] of Object.entries(fields)) if (value && !entry[key]) entry[key] = value;
    return entry;
  };

  // Searches and pages are fetched as soon as they are known and each only once: the calls of one round are started
  // together, so the waits overlap, and then answered one at a time in the order they were asked, so the step list reads
  // the same. A page asked for twice is one fetch, and the pages of one round go to the reader in one request.
  const searchPromises = new Map();
  const searchOnce = (query, topic) => {
    const key = `${topic}|${query.toLowerCase()}`;
    if (!searchPromises.has(key)) {
      const promise = searchWeb({ query, topic, signal });
      promise.catch(() => {});
      searchPromises.set(key, promise);
    }
    return { key, promise: searchPromises.get(key) };
  };

  const NO_READER = 'No page reader is set up: reading a page needs a Tavily or TinyFish API key in Settings. Tell the user.';
  const UNREADABLE = 'The page could not be read (it may block automated reading, need a login, or be down). Tell the user, or try another page.';
  // The pages asked for, whole, by address; `settled` has the ones that are done, `shown` the ones the model was already
  // given (a page it has read needs no new row; one only fetched ahead of its turn does).
  const pagePromises = new Map();
  const settled = new Map();
  const shown = new Set();
  let queued = [];
  const flush = async () => {
    const batch = queued;
    queued = [];
    try {
      const { pages, failed } = await openPage(batch.map((entry) => entry.url), signal, { maxChars: PAGE_KEPT_CHARS });
      for (const entry of batch) {
        const raw = pages.find((page) => page.url === entry.url || page.finalUrl === entry.url);
        const text = raw ? absoluteLinks(raw.text, raw.finalUrl || raw.url) : '';
        if (text) entry.resolve({ page: { ...raw, text } });
        else entry.resolve({ error: failed.find((item) => item.url === entry.url)?.reason === 'noReader' ? NO_READER : UNREADABLE });
      }
    } catch (error) {
      for (const entry of batch) {
        if (signal?.aborted || error?.name === 'AbortError') entry.reject(error);
        else entry.resolve({ error: `The page could not be read (${cut(error?.message, 200) || 'unknown error'}).` });
      }
    }
  };
  const pageOnce = (url) => {
    if (!pagePromises.has(url)) {
      const promise = new Promise((resolve, reject) => {
        if (queued.length === 0) queueMicrotask(flush);
        queued.push({ url, resolve, reject });
      });
      promise.then((outcome) => { settled.set(url, outcome); }, () => { pagePromises.delete(url); });
      pagePromises.set(url, promise);
    }
    return pagePromises.get(url);
  };

  const doSearch = async (call) => {
    const query = typeof call.args?.query === 'string' ? call.args.query.trim() : '';
    if (!query) return 'The call had no "query" argument.';
    const topic = call.args?.topic === 'news' ? 'news' : 'general';
    onEvent({ type: 'searching', label: sandboxText(language, 'webSearchingFor', { query: cut(query, 80) }) });
    const { key, promise } = searchOnce(query, topic);
    try {
      const data = await promise;
      const results = (Array.isArray(data?.results) ? data.results : []).filter((result) => result?.url);
      const entries = results.slice(0, RESULTS_SHOWN).map((result) => numberFor(result.url, { title: result.title || '', snippet: cut(result.content, 220), date: resultDate(result) }));
      const sources = entries.map(({ n, url, title, snippet, date }) => ({ title: title || '', url, n, ...(snippet ? { snippet } : {}), ...(date ? { date } : {}) }));
      onSources(sources);
      onEvent({ type: 'sources', sources });
      return searchResultText(query, results, entries.map((entry) => entry.n));
    } catch (error) {
      throwIfStopped(signal);
      // A search that failed may be tried again.
      searchPromises.delete(key);
      onEvent({ type: 'sources', sources: [] });
      return `The search failed (${cut(error?.message, 200) || 'unknown error'}). You can try other words, or answer without it and say so.`;
    }
  };

  const load = async (url) => {
    if (shown.has(url) && settled.has(url)) return settled.get(url);
    onEvent({ type: 'searching', label: sandboxText(language, 'webOpeningPage', { host: hostOf(url) }) });
    try {
      const outcome = await pageOnce(url);
      shown.add(url);
      if (outcome.page) {
        const entry = numberFor(url, { title: outcome.page.title || '' });
        outcome.n = entry.n;
        const source = { title: outcome.page.title || '', url: outcome.page.finalUrl || outcome.page.url, n: entry.n, ...(entry.snippet ? { snippet: entry.snippet } : {}), ...(entry.date ? { date: entry.date } : {}), read: true };
        onSources([source]);
        onEvent({ type: 'sources', sources: [source] });
      } else {
        onEvent({ type: 'sources', sources: [] });
      }
      return outcome;
    } catch (error) {
      throwIfStopped(signal);
      onEvent({ type: 'sources', sources: [] });
      return { error: `The page could not be read (${cut(error?.message, 200) || 'unknown error'}).` };
    }
  };

  const doOpen = async (call) => {
    const url = addressOf(call.args?.url);
    if (!url) return 'The call had no valid "url" argument (it must start with http:// or https://).';
    const start = Number.isFinite(Number(call.args?.start)) ? Number(call.args.start) : 0;
    if (shown.has(url) && settled.get(url)?.page && !start) return 'You already opened this page; its text is above. Use start to read further on, or find_in_page.';
    const { page, error, n } = await load(url);
    return error || pageText(page, start, n);
  };

  const doFind = async (call) => {
    const url = addressOf(call.args?.url);
    const query = typeof call.args?.query === 'string' ? call.args.query.trim() : '';
    if (!url || !query) return 'The call needs a valid "url" (http:// or https://) and a "query".';
    const { page, error, n } = await load(url);
    if (error) return error;
    const passages = findPassages(page.text, query);
    if (passages.length === 0) return `"${query}" is not in this page (${page.text.length} characters). Try another word, or open another page.`;
    return [
      `Passages with "${query}" in ${page.title || page.url}${n ? ` [${n}]` : ''}:`,
      ...passages.map((passage, index) => `\n${index + 1}. (from character ${passage.from})\n${passage.text}`)
    ].join('\n');
  };

  return {
    handles: (name) => TOOL_NAMES.has(name),
    /** Starts the searches and page reads of a round's calls together; `run` then answers them in order. */
    prefetch(calls) {
      let budget = Math.max(0, maxCalls - used);
      for (const call of calls || []) {
        if (!TOOL_NAMES.has(call.name)) continue;
        if (budget-- <= 0) break;
        if (call.name === WEB_SEARCH_TOOL.name) {
          const query = typeof call.args?.query === 'string' ? call.args.query.trim() : '';
          if (query) searchOnce(query, call.args?.topic === 'news' ? 'news' : 'general');
        } else {
          const url = addressOf(call.args?.url);
          if (url && !shown.has(url)) pageOnce(url);
        }
      }
    },
    get used() { return used; },
    /** What a reply needs to carry on from here after an interruption: the number of calls made and the pages numbered. */
    snapshot() { return { used, numbered: [...numbered.values()].map((entry) => ({ ...entry })) }; },
    get left() { return Math.max(0, maxCalls - used); },
    async run(call) {
      if (used >= maxCalls) return `The limit of ${maxCalls} searches and pages per reply is reached. Answer with what you have.`;
      used += 1;
      if (call.name === WEB_SEARCH_TOOL.name) return doSearch(call);
      return call.name === FIND_IN_PAGE_TOOL.name ? doFind(call) : doOpen(call);
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
  // { type: 'searching', label }, { type: 'sources', sources }, { type: 'narration', text }, { type: 'answering', more }, { type: 'answered' }.
  onEvent = () => {},
  onSources = () => {},
  // A reply taken up again after an interruption: { toolTurns, text, research } as `onRound` last reported them.
  resume = null,
  // Called after every round of calls with what is needed to take the reply up again from there.
  onRound = () => {},
  // The skills the model may load next to searching: createSkillLoader(...) (data/skill-tool.js), or null. `onEvent` is told { type: 'skill', name, label }.
  skills = null
}) {
  const toolTurns = Array.isArray(resume?.toolTurns) ? [...resume.toolTurns] : [];
  const research = createResearchCalls({ searchWeb, openPage, language, maxCalls, signal, onEvent, onSources, resume: resume?.research });
  const notes = createNotes(onEvent);
  let text = typeof resume?.text === 'string' ? resume.text : '';
  const guidance = [researchGuidance(today), skills ? loaderInstruction(skills) : ''].filter(Boolean).join('\n\n');
  const takesSkills = (name) => Boolean(skills?.handles(name));

  for (;;) {
    const skillTools = skills ? skills.tools : [];
    const canCall = research.left > 0 || skillTools.length > 0;
    let response = null;
    let roundStarted = false;
    notes.reset();
    // The words of a round are the answer (what the model says about a call is in the call's note), so they show as they come.
    const emit = (chunk) => {
      if (!chunk) return;
      // `more`: the round could still call a tool, so the work may go on after these words.
      if (!roundStarted) onEvent({ type: 'answering', more: canCall });
      // Words after a round of calls start a new paragraph when some were already written.
      const lead = !roundStarted && text && !text.endsWith('\n') ? '\n\n' : '';
      roundStarted = true;
      text += lead + chunk;
      onChunk(lead + chunk);
    };
    try {
      await streamApiCall(requestParts, emit, signal, false, {
        ...requestOptions,
        tools: canCall ? [...(research.left > 0 ? RESEARCH_TOOLS : []), ...skillTools] : [],
        toolTurns,
        additionalSystemInstruction: [requestOptions.additionalSystemInstruction, guidance].filter(Boolean).join('\n\n'),
        onToolArguments: ({ name, arguments: raw }) => {
          if (TOOL_NAMES.has(name)) notes.fromArguments(raw);
          requestOptions.onToolArguments?.({ name, arguments: raw });
        },
        onResponseComplete: (value) => { response = value; }
      });
    } catch (error) {
      // A stop keeps what was written; anything else is the caller's to handle.
      if (!signal?.aborted) throw error;
    }
    const calls = (response?.toolCalls || []).filter((call) => research.handles(call.name) || takesSkills(call.name));
    if (signal?.aborted || !canCall || calls.length === 0) {
      // The words of the round were the answer: the work is over.
      if (roundStarted && canCall) onEvent({ type: 'answered' });
      break;
    }

    // Everything the round asks for is fetched at once; the answers are taken in order, each after its note.
    research.prefetch(calls);
    const results = [];
    for (const call of calls) {
      let content;
      if (takesSkills(call.name)) {
        const step = loaderStepEvent(skills, call, language);
        if (step) onEvent(step);
        content = await skills.run(call);
      } else {
        notes.fromCall(call);
        content = await research.run(call);
      }
      results.push({ id: call.id, geminiId: call.geminiId, name: call.name, content });
      if (signal?.aborted) break;
    }
    toolTurns.push({ assistant: response, results });
    if (signal?.aborted) break;
    onRound({ toolTurns: [...toolTurns], text, research: research.snapshot() });
  }

  return { text, calls: research.used + (skills?.used || 0) };
}
