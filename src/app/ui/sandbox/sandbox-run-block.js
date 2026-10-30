// What Advanced mode keeps in a reply's text: a single-line JSON block at the
// very start with the Python runs (title, code, output, files) or the reason
// the reply switched to Standard mode.
//
//   ```noureon-run
//   {"v":1,"status":"done","steps":[…]}
//   ```
//
// Being part of the text, it is saved, synced, exported and shared with the
// message. It is lifted out before Markdown rendering and drawn as the
// collapsible "Ran code N times" row; the model only ever sees a one-line
// summary of it.

import { stripCitationMarkers } from '../citations/citation-model.js';
import { normalizePictureSteps } from '../../../data/picture-steps.js';

const FENCE = '```noureon-run';
const BLOCK_PATTERN = /^```noureon-run\n([^\n]*)\n```[ \t]*(?:\n+|$)/;

// Display limits for what is stored per step.
export const STORED_TEXT_CHARS = 50_000;
const STORED_CODE_CHARS = 100_000;
// At least the most runs a reply may make (MAX_RUNS_WITH_CLI, 100, in runtime/sandbox/sandbox-guidance.js): a step left out takes the card of
// the file it made with it (2026-10-20: a reply of 22 steps saved its presentation in the 21st, and the card was gone).
export const MAX_STEPS = 120;
const STORED_THOUGHT_CHARS = 6000;
// What the model said before a run ("I'll check the environment first"), shown between the steps.
// (A council's members may meet many pages, all cited by number.)
const MAX_SOURCES = 100;
// The connectors a reply used: their names, one row each.
const MAX_CONNECTORS = 12;

export const RUN_STATUS = Object.freeze({ running: 'running', done: 'done', failed: 'failed', stopped: 'stopped' });

const clip = (value, limit) => {
  const text = String(value ?? '');
  return text.length > limit ? { text: text.slice(0, limit), trimmed: true } : { text, trimmed: false };
};

const cleanStep = (step = {}) => {
  const stdout = clip(step.stdout, STORED_TEXT_CHARS);
  const stderr = clip(step.stderr, STORED_TEXT_CHARS);
  return {
    title: String(step.title || '').slice(0, 200),
    ...(step.thought ? { thought: clip(step.thought, STORED_THOUGHT_CHARS).text } : {}),
    code: clip(step.code, STORED_CODE_CHARS).text,
    // A command line of a CLI tool, not Python.
    ...(step.command ? { command: true } : {}),
    stdout: stdout.text,
    stderr: stderr.text,
    ...(stdout.trimmed || stderr.trimmed || step.outputTrimmed ? { outputTrimmed: true } : {}),
    ...(step.error ? { error: clip(step.error, 8000).text } : {}),
    // `id` names the message part holding the file (sandbox-files.js).
    files: (Array.isArray(step.files) ? step.files : []).slice(0, 20).map((file) => ({
      name: String(file.name || ''),
      size: Number(file.size) || 0,
      ...(typeof file.id === 'string' && /^[\w-]{1,64}$/.test(file.id) ? { id: file.id } : {})
    })),
    ...(Array.isArray(step.skipped) && step.skipped.length ? { skipped: step.skipped.slice(0, 20).map((file) => ({ name: String(file.name || ''), reason: String(file.reason || ''), ...(Number(file.size) > 0 ? { size: Number(file.size) } : {}), ...(Number(file.limit) > 0 ? { limit: Number(file.limit) } : {}) })) } : {}),
    elapsedMs: Math.max(0, Math.round(Number(step.elapsedMs) || 0)),
    ...(step.timedOut ? { timedOut: true } : {}),
    ...(step.stopped ? { stopped: true } : {})
  };
};

// The pages a web search found, for the "Searched N sites" row: only web addresses are kept.
export function normalizeSources(sources) {
  const seen = new Set();
  const kept = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const url = String(source?.url || '').trim().slice(0, 600);
    // A page that was searched and then opened is both, so each is kept once.
    const key = `${source?.read ? 'read' : 'found'} ${url}`;
    if (!/^https?:\/\/[^\s]+$/i.test(url) || seen.has(key)) continue;
    seen.add(key);
    // `n` is the number the model was told the page by (it cites it with [n]); `snippet` and `date` are for the sources list.
    const n = Number(source?.n);
    kept.push({
      title: String(source?.title || '').slice(0, 160),
      url,
      ...(Number.isInteger(n) && n > 0 && n < 1000 ? { n } : {}),
      ...(source?.date ? { date: String(source.date).slice(0, 40) } : {}),
      ...(String(source?.snippet || '').trim() ? { snippet: String(source.snippet).replace(/\s+/g, ' ').trim().slice(0, 220) } : {}),
      ...(source?.read ? { read: true } : {})
    });
    if (kept.length >= MAX_SOURCES) break;
  }
  return kept;
}

// The skills the model loaded and the times it looked up or wrote the memory, one row each (kept so that the saved reply shows them as the live step list did).
const MAX_TOOLS = 20;
const MEMORY_KEYS = ['memorySearching', 'memoryReviewing', 'memoryWriting'];
const MAX_MEMORY_ITEMS = 10;
// Which notes (their ids) and which past conversations (id and day) a memory step gave back, so that the step can be opened: never the words of either.
const memoryItemsOf = (tool) => {
  const ids = (Array.isArray(tool.ids) ? tool.ids : []).filter((id) => typeof id === 'string' && id && id.length <= 80).slice(0, MAX_MEMORY_ITEMS);
  const chats = (Array.isArray(tool.chats) ? tool.chats : []).filter((chat) => typeof chat?.id === 'string' && chat.id && chat.id.length <= 80).slice(0, MAX_MEMORY_ITEMS).map((chat) => ({ id: chat.id, at: String(chat.at || '').slice(0, 40) }));
  return { ...(ids.length ? { ids } : {}), ...(chats.length ? { chats } : {}) };
};
/** The answer of a memory search put on its step: how many, and which (`tool-end` event → the record's tool). */
export function applyToolEnd(tool, event) {
  if (!tool || !Number.isInteger(event?.count)) return;
  tool.count = event.count;
  if (Array.isArray(event.ids) && event.ids.length) tool.ids = event.ids;
  if (Array.isArray(event.chats) && event.chats.length) tool.chats = event.chats;
}
export function normalizeTools(tools) {
  const out = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.kind === 'memory' && MEMORY_KEYS.includes(tool.key)) out.push({ kind: 'memory', key: tool.key, ...(Number.isInteger(tool.count) && tool.count >= 0 ? { count: Math.min(tool.count, 1000) } : {}), ...memoryItemsOf(tool) });
    else if (tool?.kind === 'skill') {
      const name = String(tool.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (name && !out.some((entry) => entry.kind === 'skill' && entry.name === name)) out.push({ kind: 'skill', name });
    }
    if (out.length >= MAX_TOOLS) break;
  }
  return out;
}

/** The row a step event of a tool leaves in the saved reply ({ kind, name | key }), or null (the event is not one of a skill or the memory). */
export const toolOfEvent = (event) => (event?.type === 'skill' && event.name ? { kind: 'skill', name: event.name } : event?.type === 'memory' && event.key ? { kind: 'memory', key: event.key } : null);

/** The answer of a memory search ends its row (`tool-end` with the count of notes or past conversations that came back): the last memory row without a count gets it. */
export function noteToolEnd(tools, event) {
  if (event?.type !== 'tool-end' || !Number.isInteger(event.count) || !Array.isArray(tools)) return;
  const last = [...tools].reverse().find((tool) => tool.kind === 'memory');
  if (last && last.count === undefined) applyToolEnd(last, event);
}

// The names of the connectors a reply used, each once.
export function normalizeConnectors(connectors) {
  return [...new Set((Array.isArray(connectors) ? connectors : []).map((name) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter(Boolean))].slice(0, MAX_CONNECTORS);
}

const COUNCIL_STAGES = ['translation', 'firstRound', 'deliberation', 'synthesis'];
const MEMBER_STATUSES = ['done', 'failed', 'exited', 'skipped', 'running', 'pending'];
const count = (value) => Math.max(0, Math.min(100_000_000, Math.round(Number(value) || 0)));

// A council's record (council-record.js): its members (how each ended, what it searched and wrote) and its stages (how long each took).
export function normalizeCouncilRecord(council) {
  if (!council || typeof council !== 'object') return null;
  const members = (Array.isArray(council.members) ? council.members : []).slice(0, 8).map((member) => {
    const counts = member?.counts && typeof member.counts === 'object'
      ? Object.fromEntries(['search', 'page', 'skill', 'connector'].filter((key) => count(member.counts[key]) > 0).map((key) => [key, count(member.counts[key])]))
      : {};
    return {
      name: String(member?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      status: MEMBER_STATUSES.includes(member?.status) ? member.status : 'done',
      ...(count(member?.chars) > 0 ? { chars: count(member.chars) } : {}),
      ...(Object.keys(counts).length ? { counts } : {})
    };
  }).filter((member) => member.name);
  if (!members.length) return null;
  const stages = (Array.isArray(council.stages) ? council.stages : []).filter((entry) => COUNCIL_STAGES.includes(entry?.key)).slice(0, 8).map((entry) => ({
    key: entry.key,
    ...(count(entry.ms) > 0 ? { ms: count(entry.ms) } : {}),
    ...(Number.isFinite(Number(entry.done)) && entry.done !== undefined ? { done: count(entry.done), failed: count(entry.failed) } : {})
  }));
  return { mode: council.mode === 'deliberation' ? 'deliberation' : 'consensus', members, stages };
}

export function normalizeSandboxRun(run = {}) {
  const steps = (Array.isArray(run.steps) ? run.steps : []).slice(0, MAX_STEPS).map(cleanStep);
  const status = Object.values(RUN_STATUS).includes(run.status) ? run.status : RUN_STATUS.done;
  return {
    v: 1,
    status,
    steps,
    // How long the reply took in all (thinking, runs and files), for the "Processed for 1m 5s" line.
    ...(Number(run.elapsedMs) > 0 ? { elapsedMs: Math.round(Number(run.elapsedMs)) } : {}),
    ...(normalizeSources(run.sources).length ? { sources: normalizeSources(run.sources) } : {}),
    ...(normalizeSources(run.sources).length && Number.isInteger(run.sourcesBefore) && run.sourcesBefore > 0 ? { sourcesBefore: Math.min(run.sourcesBefore, 1000) } : {}),
    ...(normalizeConnectors(run.connectors).length ? { connectors: normalizeConnectors(run.connectors) } : {}),
    ...(normalizeTools(run.tools).length ? { tools: normalizeTools(run.tools) } : {}),
    // A message of a reply that was cut where the person added a message: its process line is drawn even when it has nothing but the time.
    ...(run.segment ? { segment: true } : {}),
    // The pictures a text model looked at, asked about and drew (data/picture-steps.js).
    ...(normalizePictureSteps(run.pictures).length ? { pictures: normalizePictureSteps(run.pictures) } : {}),
    ...(run.thought ? { thought: clip(run.thought, STORED_THOUGHT_CHARS).text } : {}),
    ...(run.thought && run.thoughtKind === 'summary' ? { thoughtKind: 'summary' } : {}),
    ...(run.thought && run.thoughtInterrupted ? { thoughtInterrupted: true } : {}),
    ...(run.thought && Number(run.thoughtMs) > 0 ? { thoughtMs: Math.round(Number(run.thoughtMs)) } : {}),
    ...(run.fallback ? { fallback: String(run.fallback) } : {}),
    // The council that made the reply: its line and timeline (sandbox-run-view.js).
    ...(normalizeCouncilRecord(run.council) ? { council: normalizeCouncilRecord(run.council) } : {}),
    // The server did not take the reply, and it was made on the person's device: said on the reply's line.
    ...(run.madeHere ? { madeHere: true } : {})
  };
}

export function formatSandboxRunBlock(run) {
  // JSON.stringify escapes newlines, so the payload is one line and cannot
  // close the fence.
  return `${FENCE}\n${JSON.stringify(normalizeSandboxRun(run))}\n\`\`\`\n\n`;
}

// Splits a reply into its run (or null) and the rest of the text.
export function liftSandboxRunBlock(text = '') {
  const source = String(text || '');
  if (!source.startsWith(FENCE)) return { run: null, text: source };
  const match = BLOCK_PATTERN.exec(source);
  if (!match) return { run: null, text: source };
  try {
    return { run: normalizeSandboxRun(JSON.parse(match[1])), text: source.slice(match[0].length) };
  } catch {
    return { run: null, text: source.slice(match[0].length) };
  }
}

export const hasSandboxRunBlock = (text = '') => String(text || '').startsWith(FENCE);

// One line for the model (and for memory, search and titles): what ran and
// what it produced, never the code or its output.
export function summarizeSandboxRun(run) {
  if (!run) return '';
  if (!run.steps.length) return run.fallback ? '[Answered in Standard mode.]\n' : '';
  const files = [...new Set(run.steps.flatMap((step) => step.files.map((file) => file.name)))];
  const produced = files.length ? `; it created ${files.map((name) => `/output/${name}`).join(', ')}` : '';
  if (run.steps.some((step) => step.command)) return `[Earlier in this reply ${run.steps.length} step${run.steps.length === 1 ? '' : 's'} (Python or CLI commands) ran in the sandbox${produced}. That environment is gone.]\n`;
  return `[Earlier in this reply Python ran ${run.steps.length} time${run.steps.length === 1 ? '' : 's'} in the sandbox${produced}. That environment is gone.]\n`;
}

export function summarizeSandboxRunText(text = '') {
  const { run, text: rest } = liftSandboxRunBlock(text);
  // The [n] that cite its sources mean nothing to a later reply (which numbers its own pages), so the model is not shown them.
  return run ? `${summarizeSandboxRun(run)}${stripCitationMarkers(rest, run.sources)}` : String(text || '');
}

// History sent to the model: each model message's run block becomes its
// one-line summary. Stored messages are never changed.
export function compactSandboxRunsForApi(history = []) {
  if (!Array.isArray(history)) return history;
  return history.map((message) => {
    if (message?.role !== 'model' && message?.role !== 'assistant') return message;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    let changed = false;
    const next = parts.map((part) => {
      if (typeof part?.text !== 'string' || !hasSandboxRunBlock(part.text)) return part;
      changed = true;
      return { ...part, text: summarizeSandboxRunText(part.text) };
    });
    return changed ? { ...message, parts: next } : message;
  });
}

/**
 * The text of a reply whose run lists every file the reply keeps as a part (`{ sandboxFile }`): a file's card comes from the step that
 * lists it with the part's id. A reply saved while the run kept fewer steps lost the ids of the files its last steps made; they are listed
 * again here, for the view only (the stored message is not changed). The text is given back as it is when nothing is missing.
 */
export function withRunFilesListed(text, parts) {
  const source = String(text ?? '');
  const files = (Array.isArray(parts) ? parts : []).map((part) => part?.sandboxFile).filter((file) => typeof file?.id === 'string' && file.name);
  if (!files.length || !source.startsWith(FENCE) || files.every((file) => source.includes(`"id":"${file.id}"`))) return source;
  const { run, text: rest } = liftSandboxRunBlock(source);
  if (!run?.steps.length) return source;
  const listed = new Set(run.steps.flatMap((step) => step.files.map((file) => file.id).filter(Boolean)));
  for (const file of files) {
    if (listed.has(file.id)) continue;
    // The newest step that lists the file without an id is where it was made; otherwise it is listed under the last step.
    const step = [...run.steps].reverse().find((entry) => entry.files.some((item) => item.name === file.name && !item.id)) || run.steps.at(-1);
    const entry = [...step.files].reverse().find((item) => item.name === file.name && !item.id);
    if (entry) Object.assign(entry, { id: file.id, size: Number(file.size) || entry.size });
    else step.files.push({ name: file.name, size: Number(file.size) || 0, id: file.id });
  }
  return `${formatSandboxRunBlock(run)}${rest}`;
}
