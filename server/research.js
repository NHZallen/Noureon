// Deep research, run to its end on the server (docs/superpowers/specs/2026-10-04-deep-research-design.md, §4): the model first writes a
// plan, the person has a minute to change it (the start time is kept here, so every page and a closed page agree), then it searches and
// reads for each item of the plan, writes notes, and last writes the report section by section. It can be paused and stopped, and it
// is taken up from its last checkpoint after a restart. The reply is a message of parts: { researchPlan } while it runs, and
// { researchReport } (with the report as a file) when it is done.

import { normalizePageReads, normalizeTinyfishSearch } from '../src/app/legacy-runtime/features/model-request-formatting.js';
import { createNotes, createResearchCalls, researchGuidance, RESEARCH_TOOLS } from '../src/app/legacy-runtime/features/web-research-reply.js';
import { createWebResearchTools } from '../src/app/legacy-runtime/features/web-research-tools.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';
import { addNumberedSources } from '../src/app/ui/citations/source-numbering.js';
import { parseAndNormalizeChartSchema } from '../src/app/ui/charts/chart-schema.js';
import { getCompactChartGuidance } from '../src/app/ui/charts/chart-selection-policy.js';
import { hostOf } from '../src/app/ui/sandbox/run-sources.js';
import { getErrorMessage, readErrorBody, ReplyError, scrubMessage } from './executor.js';
import { createModelAccess, DEFAULT_GENERATION } from './model-access.js';
import { ERROR_CODES } from './protocol.js';

export const RESEARCH_CHECKPOINT_VERSION = 1;

export const RESEARCH_LIMITS = Object.freeze({
  // How long the plan waits for the person before it starts by itself, and how long it waits while they are editing it.
  countdownMs: 60_000,
  holdMs: 10 * 60_000,
  // Calls (searches, pages opened, looks in a page) and time spent researching (a pause does not count).
  maxCalls: 300,
  maxActiveMs: 60 * 60_000,
  // How long one pause lasts at most (the keys of the run are kept for that long).
  maxPauseMs: 24 * 60 * 60_000,
  // The whole run, from the plan to the report; the keys are kept a little longer.
  maxRunMs: 26 * 60 * 60_000,
  maxItems: 8,
  maxActivity: 300,
  // What one item may use of the calls that are left, so the first items do not take them all.
  minItemCalls: 8,
  maxItemCalls: 60
});

// What of the notes the model is shown: all the notes when it writes the report (the longer the notes, the deeper the report), fewer
// while it researches an item (that prompt goes with every round).
const NOTES_BUDGET_CHARS = 90_000;
const ITEM_NOTES_BUDGET_CHARS = 24_000;
const MAX_REPORT_CHARS = 1_000_000;
const MAX_CHECKPOINT_TURNS_CHARS = 2_000_000;
const PHASES = ['planning', 'awaiting', 'researching', 'writing', 'done'];

const SUMMARY_HEADING = {
  'zh-TW': '執行摘要',
  en: 'Executive summary',
  fr: 'Résumé exécutif',
  ru: 'Краткое резюме',
  es: 'Resumen ejecutivo'
};
const LANGUAGE_NAME = { 'zh-TW': 'Traditional Chinese (繁體中文)', en: 'English', fr: 'French', ru: 'Russian', es: 'Spanish' };

const clip = (text, limit) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

/** The way a person's pages (and the tests) steer a run: `send(action, payload)` answers { ok } or { ok: false, reason }. */
export function createResearchControls() {
  let bound = null;
  return {
    bind(handler) { bound = handler; },
    unbind() { bound = null; },
    get phase() { return bound ? bound.phase() : null; },
    send(action, payload = {}) {
      if (!bound) return { ok: false, reason: 'not_running' };
      return bound.handle(action, payload);
    }
  };
}

// ----- what the model is asked

const planPrompt = ({ topic, language, instruction = '', previous = null }) => [
  `The user wants a deep research on this topic:\n${topic}`,
  previous ? `\nThe current research plan:\nTITLE: ${previous.title}\n${previous.items.map((item) => `ITEM: ${item.text}`).join('\n')}\n\nThe user asks to change it: ${instruction}\nWrite the whole plan again with the change made.` : '',
  `\nWrite the research plan. Answer only in these lines, nothing else:`,
  'TITLE: a short title of the research (a few words, the topic and the word for "research" in the language of the user)',
  'BRIEF: one or two sentences on what the research must find out and for whom',
  'ITEM: one research item, a short sentence on what to find out (4 to 6 items, each a different angle, in the order to research them)',
  `Write in the language of the topic (${LANGUAGE_NAME[language] || 'English'} if it is not clear).`
].filter(Boolean).join('\n');

/** The plan from the model's lines (TITLE, BRIEF, ITEM...). Numbered or bulleted lines count as items when no ITEM line is given. */
export function parsePlan(text, topic, maxItems = RESEARCH_LIMITS.maxItems) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.replace(/^[\s>*#-]+/, '').trim()).filter(Boolean);
  let title = '';
  let brief = '';
  const items = [];
  const loose = [];
  for (const line of lines) {
    const tagged = /^(TITLE|BRIEF|ITEM)\s*[:：]\s*(.+)$/i.exec(line);
    if (tagged) {
      const value = tagged[2].replace(/^\*+|\*+$/g, '').trim();
      const tag = tagged[1].toUpperCase();
      if (tag === 'TITLE' && !title) title = value;
      else if (tag === 'BRIEF' && !brief) brief = value;
      else if (tag === 'ITEM') items.push(value);
      continue;
    }
    const numbered = /^\d+[.)、]\s*(.+)$/.exec(line);
    if (numbered) loose.push(numbered[1].trim());
  }
  const chosen = (items.length ? items : loose).slice(0, maxItems).map((text, index) => ({ id: `i${index + 1}`, text: clip(text, 300), state: 'pending' }));
  if (!chosen.length) chosen.push({ id: 'i1', text: clip(topic, 300), state: 'pending' });
  return { title: clip(title || topic, 120), brief: clip(brief, 600), items: chosen };
}

const compactNotes = (items, notes, budget = NOTES_BUDGET_CHARS) => {
  const done = items.filter((item) => notes[item.id]);
  if (!done.length) return '';
  const each = Math.max(600, Math.floor(budget / done.length));
  return done.map((item) => `### ${item.text}\n${notes[item.id].length > each ? `${notes[item.id].slice(0, each)}…` : notes[item.id]}`).join('\n\n');
};

const itemPrompt = ({ topic, plan, item, notes, language }) => [
  `Deep research on: ${topic}`,
  plan.brief ? `Aim: ${plan.brief}` : '',
  `The plan:\n${plan.items.map((entry, index) => `${index + 1}. ${entry.text}${entry.id === item.id ? '   <- you are researching this one now' : ''}`).join('\n')}`,
  compactNotes(plan.items, notes, ITEM_NOTES_BUDGET_CHARS) ? `Notes from the items done before (do not repeat them; cite their numbers if you use them):\n${compactNotes(plan.items, notes, ITEM_NOTES_BUDGET_CHARS)}` : '',
  `Your task: research this item with the tools: ${item.text}`,
  'Search and read until you have solid, specific facts (names, numbers, dates, versions, what the sources agree and disagree on). Prefer primary and recent sources.',
  `When you have enough, write your notes for this item: detailed bullet points of the findings, each with the [number] of the source it comes from, in ${LANGUAGE_NAME[language] || 'English'} unless the topic is in another language. 500 to 1000 words: the report is written from these notes alone, so keep everything it will need (names, exact figures with units and dates, versions, quotes worth keeping, how the sources agree or disagree, background, caveats and what you could not find). Do not write the final report and do not add a list of sources.`
].filter(Boolean).join('\n\n');

const outlinePrompt = ({ topic, plan, notes, language, short }) => [
  `Deep research on: ${topic}`,
  plan.brief ? `Aim: ${plan.brief}` : '',
  `Report title: ${plan.title}`,
  `Notes:\n${compactNotes(plan.items, notes)}`,
  `Plan the sections of the final report${short ? ' (a short report: 3 or 4 sections)' : ' (a long, thorough report: 8 to 12 sections, each with its own angle, going from the background to the details, the comparisons and what it all means)'}. Answer only with lines like this, in order, nothing else:`,
  'SECTION: the heading of the section (no number)',
  `Write the headings in ${LANGUAGE_NAME[language] || 'English'} unless the topic is in another language. Do not make a section for the summary or the sources: they are added.`
].filter(Boolean).join('\n\n');

export const parseOutline = (text, plan, maxSections = 14) => {
  const headings = String(text || '').split(/\r?\n/)
    .map((line) => /^[\s>*#-]*SECTION\s*[:：]\s*(.+)$/i.exec(line)?.[1]?.replace(/^\*+|\*+$/g, '').trim())
    .filter(Boolean)
    .map((heading) => clip(heading, 160));
  const unique = [...new Set(headings)].slice(0, maxSections);
  return unique.length ? unique : plan.items.map((item) => clip(item.text, 160));
};

const sectionPrompt = ({ topic, plan, notes, outline, heading, sourcesText, language, short }) => [
  `You are writing one section of a research report on: ${topic}`,
  plan.brief ? `Aim: ${plan.brief}` : '',
  `Report title: ${plan.title}\nAll sections, in order: ${outline.join(' | ')}`,
  `Research notes (the facts you may use; the numbers in square brackets are the sources):\n${compactNotes(plan.items, notes)}`,
  sourcesText ? `The sources:\n${sourcesText}` : '',
  `Write the section "${heading}". Rules:`,
  `- Write only the body of the section, without its heading. Do not repeat what the other sections cover.`,
  `- ${short ? '150 to 350 words' : '800 to 1500 words: this is a long, thorough report that a person waited hours for, so go deep, explain the why and the how, give the specific figures, dates and names from the notes, compare, and draw out what it means. Use two to four "###" sub-headings inside the section and write mostly in full paragraphs rather than bullet lists'}, in ${LANGUAGE_NAME[language] || 'English'} unless the topic is in another language. Markdown: paragraphs, lists where they help; a table when comparing things; math as LaTeX between $ signs.`,
  '- Put the number of the source right after the sentence it supports, like [2], or [1][3] for several. Use only the numbers above, never invent one, and add no list of sources.',
  '- Say plainly what could not be found or is uncertain. Do not make up facts that are not in the notes.'
].filter(Boolean).join('\n');

const summaryPrompt = ({ topic, plan, sections, language }) => [
  `A research report on: ${topic}`,
  `Title: ${plan.title}`,
  `The sections:\n${sections.map((section) => `## ${section.heading}\n${clip(section.text, 2500)}`).join('\n\n')}`,
  `Write the executive summary of the report: 200 to 350 words, the main findings and what they mean, in ${LANGUAGE_NAME[language] || 'English'} unless the topic is in another language. Keep the [number] source marks of the facts you use. Write only the summary, no heading.`
].join('\n\n');

const chartPrompt = ({ topic, plan, notes, outline, language }) => [
  `A research report on: ${topic}`,
  `Report title: ${plan.title}\nThe sections: ${outline.join(' | ')}`,
  `Research notes (the numbers in square brackets are the sources):\n${compactNotes(plan.items, notes)}`,
  'Decide whether the report needs a chart. A chart is worth it only when the notes hold several numbers that can be compared (over time, between products or companies) and a picture shows it better than a sentence. Most reports need none, or one; never more than two.',
  'Use ONLY numbers that are written in the notes, exactly as written. Never estimate, convert or calculate a number for a chart.',
  'Every chart needs a short "title" (what it shows, in the language of the report) and a "unit" (for example "USD billion", "%", "mS/cm"). Numbers that are forecasts, targets or guidance and not results that happened must have "forecast": true in their row, so the chart draws them dashed; say so in the caption.',
  'If no chart is worth it, answer exactly: NONE',
  'Otherwise answer with one block for each chart, in this form and nothing else:',
  'SECTION: the heading of the section the chart belongs to, exactly as listed above',
  `CAPTION: one sentence on what the chart shows, in ${LANGUAGE_NAME[language] || 'English'} unless the topic is in another language, ending with the [number] of the source of the numbers`,
  '```chart\n{ the chart as JSON }\n```',
  getCompactChartGuidance()
].join('\n\n');

const numbersIn = (text) => [...String(text || '').matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, ''))).filter(Number.isFinite);
const numberLeaves = (value, found = []) => {
  if (typeof value === 'number' && Number.isFinite(value)) found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => numberLeaves(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => numberLeaves(item, found));
  return found;
};

/**
 * The charts a model proposed that may go into the report: each is a valid chart, belongs to a section of the report, and holds only numbers
 * that are in the notes (a chart of made-up or calculated numbers is left out). Returns [{ heading, caption, chart }].
 */
export function acceptCharts(text, { outline = [], notes = {} } = {}) {
  // The numbers of the sources, [2], are not findings.
  const known = new Set(numbersIn(Object.values(notes).join('\n').replace(/\[\d{1,4}\]/g, ' ')));
  const accepted = [];
  const pattern = /SECTION\s*[:：]\s*(.+?)\s*\n\s*CAPTION\s*[:：]\s*(.+?)\s*\n\s*```(?:chart|json)?[ \t]*\n([\s\S]*?)\n\s*```/gi;
  for (const match of String(text || '').matchAll(pattern)) {
    const heading = outline.find((entry) => entry.trim().toLowerCase() === match[1].replace(/^\*+|\*+$/g, '').trim().toLowerCase());
    if (!heading || accepted.length >= 2 || accepted.some((entry) => entry.heading === heading)) continue;
    const parsed = parseAndNormalizeChartSchema(match[3]);
    if (!parsed.ok) continue;
    const values = numberLeaves(parsed.chart.data ?? parsed.chart);
    if (!values.length || !values.every((value) => known.has(value))) continue;
    // A chart without a title of its own takes the heading of its section.
    const chart = parsed.chart.title ? parsed.chart : { ...parsed.chart, title: clip(heading, 80) };
    accepted.push({ heading, caption: clip(match[2], 300), chart });
  }
  return accepted;
}

// ----- the report

/** The headings of a Markdown report, in order: [{ level, text }]. */
export function reportHeadings(markdown) {
  const out = [];
  let fenced = false;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const found = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (found) out.push({ level: found[1].length, text: found[2].trim() });
  }
  return out;
}

/** The source numbers a text cites, [2] or [1][3]. */
export const citedNumbers = (markdown) => {
  const found = new Set();
  for (const match of String(markdown || '').matchAll(/\[(\d{1,4})\]/g)) found.add(Number(match[1]));
  return [...found].sort((a, b) => a - b);
};

/** The sources the report cites, one entry each (what was found of a page and what was read of it put together). */
export function reportSources(sources, cited) {
  const byNumber = new Map();
  for (const source of sources) {
    const n = Number(source.n);
    if (!n || !source.url) continue;
    const entry = byNumber.get(n) || { n, url: source.url };
    for (const key of ['title', 'snippet', 'date']) if (source[key] && !entry[key]) entry[key] = source[key];
    byNumber.set(n, entry);
  }
  return cited.filter((n) => byNumber.has(n)).map((n) => {
    const entry = byNumber.get(n);
    return { n, url: entry.url, title: clip(entry.title, 200) || hostOf(entry.url), site: hostOf(entry.url), ...(entry.snippet ? { snippet: clip(entry.snippet, 400) } : {}), ...(entry.date ? { date: entry.date } : {}) };
  });
}

// ----- the run

/**
 * Runs the research. `resume`: the checkpoint `onCheckpoint` last gave. `controls` (createResearchControls) is how the person's requests
 * reach the run: start, hold, release, plan {instruction}, pause, resume, stop {mode}. Resolves { parts, status, toolCalls } (status
 * 'done' or 'stopped'); throws a ReplyError (with `parts`, the message as it stands) when the research cannot go on.
 */
export async function executeResearch({
  spec,
  secrets,
  signal,
  resume = null,
  controls = createResearchControls(),
  limits = RESEARCH_LIMITS,
  onUpdate = () => {},
  onLive = () => {},
  onCheckpoint = async () => {},
  onProblem = () => {},
  fetchImpl = fetch,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  const language = spec.request.language;
  const topic = String(spec.research?.topic || '').trim();
  const access = createModelAccess({ spec, secrets, fetchImpl, grounding: false });
  const { streamApiCall, upstreamFetch, modelInfo, conversation, keyFor, config } = access;
  const cp = resume && resume.kind === 'research' && resume.version === RESEARCH_CHECKPOINT_VERSION ? resume : null;

  // ----- what the run knows (and what a checkpoint keeps)
  const startedAt = Number(cp?.startedAt) || now();
  let plan = cp?.plan ? { title: cp.plan.title, brief: cp.plan.brief || '', items: cp.plan.items.map((item) => ({ ...item })) } : null;
  let phase = PHASES.includes(cp?.phase) ? cp.phase : 'planning';
  let startAt = Number(cp?.startAt) || null;
  let paused = Boolean(cp?.paused);
  let pausedAt = Number(cp?.pausedAt) || 0;
  let pausing = false;
  let activeMs = Number(cp?.activeMs) || 0;
  let activeSince = 0;
  const notes = { ...(cp?.notes || {}) };
  let sources = Array.isArray(cp?.sources) ? cp.sources : [];
  let outline = Array.isArray(cp?.outline) ? cp.outline : null;
  const sections = Array.isArray(cp?.sections) ? cp.sections.map((section) => ({ ...section })) : [];
  let summary = typeof cp?.summary === 'string' ? cp.summary : '';
  let shortReport = Boolean(cp?.shortReport);
  let chartsDone = Boolean(cp?.chartsDone);
  // What the person added while it researched (steer): taken into every request that follows.
  const steering = Array.isArray(cp?.steering) ? cp.steering.map((entry) => ({ text: String(entry.text || '') })).filter((entry) => entry.text) : [];
  const steerText = () => (steering.length ? `\n\nThe person added these instructions while the research went on; follow them from now on:\n${steering.map((entry) => `- ${entry.text}`).join('\n')}` : '');
  let activity = Array.isArray(cp?.activity) ? cp.activity.slice(-limits.maxActivity) : [];
  let inItem = cp?.item && typeof cp.item === 'object' ? cp.item : null;
  // How far the whole research is, 0 to 100: the items are 70 of it (the item being researched counts by the calls it has used, so the
  // bar moves with every search and read), the report 30 (outline, each section, charts, summary). It never goes back.
  let itemRunning = false;
  let itemBase = 0;
  let itemShare = 1;
  let progressMax = 0;
  let report = null;
  let failure = null;

  // Set by the person's requests.
  let startNow = false;
  let heldUntil = 0;
  let instruction = '';
  let stopMode = null;
  let resumeNow = false;
  let revising = false;

  const activeNow = () => activeMs + (activeSince ? now() - activeSince : 0);
  const startClock = () => { if (!activeSince) activeSince = now(); };
  const stopClock = () => {
    if (activeSince) activeMs += now() - activeSince;
    activeSince = 0;
  };

  // ----- the ways a run is stopped
  const main = new AbortController();
  const work = new AbortController();
  const onRunAbort = () => { main.abort(); work.abort(); };
  if (signal?.aborted) onRunAbort();
  else signal?.addEventListener?.('abort', onRunAbort, { once: true });
  const aborted = () => main.signal.aborted;

  let wake = () => {};
  const nudge = () => {
    const call = wake;
    wake = () => {};
    call();
  };
  const sleep = (ms) => new Promise((resolve) => {
    if (main.signal.aborted) {
      resolve();
      return;
    }
    let timer = null;
    const done = () => {
      if (timer) clearTimer(timer);
      wake = () => {};
      main.signal.removeEventListener('abort', done);
      resolve();
    };
    timer = setTimer(done, Math.max(0, Math.min(Number(ms) || 0, 2_000_000_000)));
    wake = done;
    main.signal.addEventListener('abort', done, { once: true });
  });

  // ----- what the page sees
  const progress = () => {
    let value = 0;
    if (phase === 'researching') {
      const items = plan?.items || [];
      const done = items.filter((item) => item.state === 'done').length;
      const used = itemRunning ? Math.max(0, (research?.used || 0) - itemBase) : 0;
      const active = itemRunning ? Math.min(0.9, 1 - Math.exp(-used / Math.max(3, itemShare * 0.4))) : 0;
      value = ((done + active) / Math.max(1, items.length)) * 70;
    } else if (phase === 'writing') {
      if (!outline) value = 70;
      else if (sections.length >= outline.length) value = chartsDone || shortReport ? 95 : 93;
      else value = 73 + 19 * (sections.length / Math.max(1, outline.length));
    } else if (phase === 'done') value = 100;
    progressMax = Math.max(progressMax, Math.min(phase === 'done' ? 100 : 99, Math.floor(value)));
    return progressMax;
  };
  const planPart = () => ({
    title: plan?.title || '',
    topic,
    items: (plan?.items || []).map(({ id, text, state }) => ({ id, text, state })),
    phase: failure ? 'failed' : phase,
    ...(startAt ? { startAt } : {}),
    ...(heldUntil ? { editing: true } : {}),
    ...(revising ? { revising: true } : {}),
    ...(paused ? { paused: true } : pausing ? { pausing: true } : {}),
    ...(steering.length ? { steers: steering.length } : {}),
    ...(failure ? { error: failure } : {}),
    stats: { searches: research?.used || 0, sources: new Set(sources.map((source) => source.n)).size, activeMs: activeNow() },
    running: Boolean(activeSince),
    pg: progress(),
    clock: now(),
    countdownMs: limits.countdownMs
  });
  const messageParts = () => (report ? [{ text: '' }, { researchReport: report.part }] : [{ text: '' }, { researchPlan: planPart() }]);
  const checkpoint = async () => {
    // Where the research stands, to take it up from after a restart. The pages read in the item being researched are kept while they are not many.
    const turnsSize = inItem?.toolTurns ? JSON.stringify(inItem.toolTurns).length : 0;
    await onCheckpoint({
      version: RESEARCH_CHECKPOINT_VERSION,
      kind: 'research',
      startedAt,
      phase,
      plan,
      startAt,
      paused,
      pausedAt,
      activeMs: activeNow(),
      notes,
      sources,
      research: research?.snapshot?.() || cp?.research || null,
      outline,
      sections,
      summary,
      shortReport,
      chartsDone,
      steering,
      activity,
      item: inItem && turnsSize <= MAX_CHECKPOINT_TURNS_CHARS ? inItem : (inItem ? { id: inItem.id } : null)
    });
  };
  const publish = ({ save = false } = {}) => {
    const part = planPart();
    onLive({ rs: part });
    if (!report) onUpdate(messageParts());
    if (save) return checkpoint();
    return undefined;
  };
  const saveSoon = () => { Promise.resolve(publish({ save: true })).catch(() => {}); };
  const log = (entry) => {
    const next = { t: activeNow(), ...entry };
    activity.push(next);
    if (activity.length > limits.maxActivity) activity = activity.slice(-limits.maxActivity);
    onLive({ ra: next });
  };

  // ----- searching and reading
  let research = null;
  const addSources = (found) => {
    sources = addNumberedSources(sources, found);
    onLive({ src: sources });
  };
  const researchEvent = (event) => {
    if (event.type === 'searching') log({ type: 'searching', text: clip(event.label, 200) });
    else if (event.type === 'narration') log({ type: 'narration', text: clip(event.text, 300) });
    if (event.type === 'searching' || event.type === 'sources') publish();
  };
  const tools = createWebResearchTools({ getConfig: () => config, getApiKeyForProvider: keyFor, fetchImpl: upstreamFetch, getErrorMessage, readErrorBody, normalizePageReads, normalizeTinyfishSearch });
  research = createResearchCalls({
    searchWeb: tools.searchWeb,
    openPage: tools.fetchPageContents,
    language,
    maxCalls: limits.maxCalls,
    signal: work.signal,
    onEvent: researchEvent,
    onSources: addSources,
    resume: cp?.research || null
  });

  // ----- asking the model
  const baseOptions = (extra = {}) => ({
    conversation,
    modelInfo,
    genConfig: spec.request.generation || { ...DEFAULT_GENERATION },
    reasoningEffort: spec.request.reasoningEffort,
    webSearchEnabled: false,
    requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER,
    onReasoning: () => {},
    onSources: () => {},
    onSupports: () => {},
    ...extra
  });
  const withRetry = async (fn, sig) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        if (sig.aborted || attempt >= 3) throw error;
        onProblem('research_call_retried', error);
        await sleep(1500 * attempt);
        if (sig.aborted) throw error;
      }
    }
  };
  /** One model call that answers with text. `system` is added to the system instruction; the person's own is kept when `persona`. */
  const generate = async (prompt, { sig = main.signal, system = '', persona = true, history = [] } = {}) => withRetry(async () => {
    let out = '';
    await streamApiCall([{ text: prompt }], (chunk) => { out += chunk || ''; }, sig, false, baseOptions({
      historyForApi: history,
      systemInstructionText: persona ? spec.request.systemInstruction : '',
      additionalSystemInstruction: system,
      tools: []
    }));
    return out.trim();
  }, sig);

  // ----- the requests of the person
  const handle = (action, payload) => {
    const here = phase;
    const live = !failure && !aborted();
    if (!live) return { ok: false, reason: 'ended' };
    if (action === 'start') {
      if (here !== 'awaiting' || !plan) return { ok: false, reason: 'wrong_phase' };
      startNow = true;
    } else if (action === 'hold') {
      if (here !== 'awaiting' || !plan) return { ok: false, reason: 'wrong_phase' };
      startAt = null;
      heldUntil = now() + limits.holdMs;
      saveSoon();
    } else if (action === 'release') {
      if (here !== 'awaiting' || !plan) return { ok: false, reason: 'wrong_phase' };
      if (heldUntil) {
        heldUntil = 0;
        startAt = now() + limits.countdownMs;
        saveSoon();
      }
    } else if (action === 'plan') {
      const text = String(payload.instruction || '').trim().slice(0, 2000);
      if (here !== 'awaiting' || !plan) return { ok: false, reason: 'wrong_phase' };
      if (!text) return { ok: false, reason: 'empty' };
      instruction = text;
      heldUntil = 0;
      startAt = null;
      publish();
    } else if (action === 'steer') {
      const text = String(payload.instruction || '').trim().slice(0, 2000);
      if (here !== 'researching') return { ok: false, reason: 'wrong_phase' };
      if (!text) return { ok: false, reason: 'empty' };
      if (steering.length >= 20) return { ok: false, reason: 'too_many' };
      steering.push({ text });
      log({ type: 'steer', text: clip(text, 300) });
      saveSoon();
    } else if (action === 'pause') {
      if (here !== 'researching' || paused || pausing) return { ok: false, reason: 'wrong_phase' };
      pausing = true;
      publish();
    } else if (action === 'resume') {
      if (here !== 'researching' || !(paused || pausing)) return { ok: false, reason: 'wrong_phase' };
      pausing = false;
      if (paused) resumeNow = true;
      publish();
    } else if (action === 'stop') {
      const mode = payload.mode === 'report' ? 'report' : 'discard';
      if (mode === 'report' && here !== 'researching') return { ok: false, reason: 'wrong_phase' };
      stopMode = mode;
      work.abort();
      if (mode === 'discard') main.abort();
    } else {
      return { ok: false, reason: 'unknown_action' };
    }
    nudge();
    return { ok: true };
  };
  controls.bind({ phase: () => (failure || aborted() ? null : phase), handle });

  const finishParts = (status) => {
    if (!report) {
      phase = status === 'done' ? 'done' : 'stopped';
      stopClock();
      // An item the research was in the middle of when it stopped waits like the others (the card turns the one that is "active").
      for (const item of plan?.items || []) if (item.state === 'active') item.state = 'pending';
    }
    return { parts: messageParts(), status, toolCalls: research.used };
  };

  try {
    onLive({ r: { answer: '', thought: { text: '', kind: 'model', ended: false, ms: 0 }, sources, elapsedMs: now() - startedAt } });
    publish();

    // ----- planning
    if (phase === 'planning' || !plan) {
      phase = 'planning';
      publish();
      const text = await generate(planPrompt({ topic, language }), { history: spec.request.history, system: 'You plan deep research. Follow the answer format exactly.' });
      if (aborted()) return finishParts('stopped');
      plan = parsePlan(text, topic, limits.maxItems);
      phase = 'awaiting';
      startAt = now() + limits.countdownMs;
      log({ type: 'plan', text: plan.title });
      await publish({ save: true });
    }

    // ----- waiting for the person (the plan may be changed any number of times)
    if (phase === 'awaiting') {
      // A page that was gone while the run was taken up again is not left editing for ever.
      if (heldUntil === 0 && !startAt) startAt = now() + limits.countdownMs;
      while (!aborted() && !startNow) {
        if (instruction) {
          const wanted = instruction;
          instruction = '';
          revising = true;
          publish();
          let text = '';
          try {
            text = await generate(planPrompt({ topic, language, instruction: wanted, previous: plan }), { history: spec.request.history, system: 'You plan deep research. Follow the answer format exactly.' });
          } finally {
            revising = false;
          }
          if (aborted()) break;
          plan = parsePlan(text, topic, limits.maxItems);
          log({ type: 'plan', text: plan.title });
          // A new instruction that came while the plan was being written is taken before the countdown starts again.
          if (!instruction) startAt = now() + limits.countdownMs;
          await publish({ save: true });
          continue;
        }
        if (heldUntil) {
          if (now() >= heldUntil) {
            heldUntil = 0;
            startAt = now() + limits.countdownMs;
            await publish({ save: true });
            continue;
          }
          await sleep(heldUntil - now());
          continue;
        }
        if (startAt && now() >= startAt) break;
        await sleep(startAt ? startAt - now() : limits.holdMs);
      }
      if (aborted()) return finishParts('stopped');
      startAt = null;
      startNow = false;
      phase = 'researching';
      log({ type: 'phase', text: 'researching' });
      await publish({ save: true });
    }

    // ----- researching, an item at a time
    if (phase === 'researching') {
      startClock();
      const overBudget = () => research.left <= 0 || activeNow() >= limits.maxActiveMs;
      const pauseDeadline = () => Math.min(pausedAt + limits.maxPauseMs, startedAt + limits.maxRunMs - 5 * 60_000);

      // Waits while paused; false when the run was ended meanwhile (stop), or the pause ran out.
      const holdForPause = async () => {
        if (!paused && !pausing) return true;
        stopClock();
        paused = true;
        pausing = false;
        pausedAt = pausedAt || now();
        resumeNow = false;
        log({ type: 'paused' });
        await publish({ save: true });
        while (!resumeNow && !stopMode && !aborted()) {
          if (now() >= pauseDeadline()) {
            failure = { code: 'pause_expired', message: 'The research was paused for too long.' };
            await publish();
            throw new ReplyError('The research was paused for too long.', 'pause_expired');
          }
          await sleep(pauseDeadline() - now());
        }
        paused = false;
        pausedAt = 0;
        if (!stopMode && !aborted()) {
          log({ type: 'resumed' });
          startClock();
          await publish({ save: true });
        }
        return !stopMode && !aborted();
      };
      // A research taken up again while it was paused stays paused.
      if (paused) await holdForPause();

      for (const item of plan.items) {
        if (aborted() || stopMode) break;
        if (item.state === 'done') continue;
        if (overBudget()) break;
        const remainingItems = plan.items.filter((entry) => entry.state !== 'done').length;
        const share = Math.min(limits.maxItemCalls, Math.max(limits.minItemCalls, Math.ceil(research.left / Math.max(1, remainingItems))));
        const callsBefore = research.used;
        const itemBudget = () => Math.max(0, Math.min(research.left, share - (research.used - callsBefore)));
        const itemCalls = {
          handles: (name) => research.handles(name),
          prefetch: (calls) => research.prefetch(calls),
          get used() { return research.used; },
          snapshot: () => research.snapshot(),
          get left() { return overBudget() || stopMode ? 0 : itemBudget(); },
          run: (call) => research.run(call)
        };
        item.state = 'active';
        itemRunning = true;
        itemBase = callsBefore;
        itemShare = share;
        if (!inItem || inItem.id !== item.id) inItem = { id: item.id };
        log({ type: 'item', text: clip(item.text, 200) });
        await publish({ save: true });

        const noteMaker = createNotes((event) => researchEvent(event));
        const toolTurns = Array.isArray(inItem.toolTurns) ? [...inItem.toolTurns] : [];
        let text = typeof inItem.text === 'string' ? inItem.text : '';
        const prompt = itemPrompt({ topic, plan, item, notes, language });
        for (;;) {
          const canCall = itemCalls.left > 0;
          let response = null;
          let roundText = '';
          noteMaker.reset();
          try {
            await withRetry(async () => {
              roundText = '';
              response = null;
              await streamApiCall([{ text: `${prompt}${steerText()}` }], (chunk) => { roundText += chunk || ''; }, work.signal, false, baseOptions({
                historyForApi: [],
                systemInstructionText: '',
                tools: canCall ? RESEARCH_TOOLS : [],
                toolTurns,
                additionalSystemInstruction: `${researchGuidance()}\nThis is deep research: be thorough, cross-check important facts in a second source, and keep going until the item is well covered.`,
                onToolArguments: ({ name, arguments: raw }) => { if (research.handles(name)) noteMaker.fromArguments(raw); },
                onResponseComplete: (value) => { response = value; }
              }));
            }, work.signal);
          } catch (error) {
            // A stop (or the end of the run) leaves what there is; anything else is the research's failure.
            if (!work.signal.aborted) throw error;
          }
          if (roundText) text = `${text ? `${text}\n\n` : ''}${roundText}`.trim();
          const calls = (response?.toolCalls || []).filter((call) => research.handles(call.name));
          if (work.signal.aborted || !canCall || calls.length === 0) break;
          research.prefetch(calls);
          const results = [];
          for (const call of calls) {
            noteMaker.fromCall(call);
            const content = await research.run(call);
            results.push({ id: call.id, geminiId: call.geminiId, name: call.name, content });
            if (work.signal.aborted) break;
          }
          toolTurns.push({ assistant: response, results });
          // What was written in a round that called tools is not kept: the notes are written when the item is done.
          text = '';
          inItem = { id: item.id, toolTurns };
          await publish({ save: true });
          if (work.signal.aborted) break;
          // The end of a round is where a pause waits.
          if (pausing || paused) {
            const kept = await holdForPause();
            if (!kept) break;
          }
        }

        if (stopMode || aborted()) {
          // A stop in the middle of an item: what was read is not turned into notes (the report uses the items that were done).
          break;
        }
        notes[item.id] = text.trim() || 'No usable findings were written for this item.';
        item.state = 'done';
        itemRunning = false;
        inItem = null;
        await publish({ save: true });
        if (pausing || paused) {
          const kept = await holdForPause();
          if (!kept) break;
        }
      }
      stopClock();
      if (aborted()) return finishParts('stopped');
      if (stopMode === 'discard') return finishParts('stopped');
      // An item that was cut short by the stop goes back to waiting; the report is written from the items that are done.
      for (const item of plan.items) if (item.state === 'active') item.state = 'pending';
      if (stopMode === 'report') shortReport = true;
      phase = 'writing';
      inItem = null;
      log({ type: 'phase', text: 'writing' });
      await publish({ save: true });
    }

    // ----- writing the report
    if (phase === 'writing') {
      // A stop before the first item was done has nothing to write a report from.
      if (!Object.keys(notes).length) return finishParts('stopped');
      if (!outline) {
        const text = await generate(`${outlinePrompt({ topic, plan, notes, language, short: shortReport })}${steerText()}`, { system: 'You plan the sections of a research report. Follow the answer format exactly.' });
        if (aborted()) return finishParts('stopped');
        outline = parseOutline(text, plan, shortReport ? 4 : 14);
        await publish({ save: true });
      }
      const cited = new Set(citedNumbers(Object.values(notes).join('\n')));
      const sourcesText = reportSources(sources, [...cited]).map((source) => `[${source.n}] ${source.title} — ${source.url}`).join('\n');
      for (let index = sections.length; index < outline.length; index += 1) {
        const heading = outline[index];
        log({ type: 'section', text: heading });
        onLive({ rw: { n: index + 1, of: outline.length, heading } });
        const text = await generate(`${sectionPrompt({ topic, plan, notes, outline, heading, sourcesText, language, short: shortReport })}${steerText()}`, { system: 'You write a section of a research report with the facts and the source numbers you are given.' });
        if (aborted()) return finishParts('stopped');
        sections.push({ heading, text });
        await publish({ save: true });
      }
      // Charts: the model may propose one or two, with numbers that are in the notes; a failure here never costs the report.
      if (!chartsDone && !shortReport) {
        try {
          log({ type: 'section', text: 'charts' });
          const proposed = await generate(chartPrompt({ topic, plan, notes, outline, language }), { system: 'You decide whether a research report needs a chart and write it from the numbers in the notes. Follow the answer format exactly.', persona: false });
          if (aborted()) return finishParts('stopped');
          for (const found of acceptCharts(proposed, { outline, notes })) {
            const section = sections.find((entry) => entry.heading === found.heading);
            if (section) section.text = `${section.text.trimEnd()}\n\n\`\`\`chart\n${JSON.stringify(found.chart, null, 2)}\n\`\`\`\n\n*${found.caption}*`;
          }
        } catch (error) {
          if (aborted()) return finishParts('stopped');
          onProblem('research_charts_failed', error);
        }
        chartsDone = true;
        await publish({ save: true });
      }
      if (!summary) {
        summary = await generate(`${summaryPrompt({ topic, plan, sections, language })}${steerText()}`, { system: 'You write the executive summary of a research report.' });
        if (aborted()) return finishParts('stopped');
        await checkpoint();
      }
      const markdown = [
        `# ${plan.title}`,
        ...(summary ? [`## ${SUMMARY_HEADING[language] || SUMMARY_HEADING.en}\n\n${summary}`] : []),
        ...sections.map((section) => `## ${section.heading}\n\n${section.text}`)
      ].join('\n\n').concat('\n');
      const usedNumbers = citedNumbers(markdown);
      const listed = reportSources(sources, usedNumbers);
      stopClock();
      phase = 'done';
      log({ type: 'done' });
      // The whole report is in the message (not in a file): the model reads it in the next turns, and the page reads and exports it from here.
      report = {
        part: {
          title: plan.title,
          topic,
          text: markdown.slice(0, MAX_REPORT_CHARS),
          finishedAt: now(),
          stats: { ms: activeNow(), searches: research.used, citations: listed.length },
          sources: listed,
          toc: reportHeadings(markdown).slice(0, 200),
          activity: activity.slice(-limits.maxActivity),
          items: plan.items.map(({ id, text }) => ({ id, text })),
          phase: 'done',
          ...(shortReport ? { short: true } : {})
        }
      };
      onLive({ rs: { ...planPart(), phase: 'done' } });
      return { parts: messageParts(), status: 'done', toolCalls: research.used };
    }

    return finishParts(aborted() ? 'stopped' : 'done');
  } catch (error) {
    if (error instanceof ReplyError) {
      error.parts ??= messageParts();
      throw error;
    }
    if (aborted()) return finishParts('stopped');
    failure = { code: ERROR_CODES.providerError, message: scrubMessage(error?.message, secrets) };
    stopClock();
    const failed = new ReplyError(scrubMessage(error?.message, secrets), ERROR_CODES.providerError);
    failed.parts = messageParts();
    throw failed;
  } finally {
    stopClock();
    controls.unbind();
    signal?.removeEventListener?.('abort', onRunAbort);
  }
}
