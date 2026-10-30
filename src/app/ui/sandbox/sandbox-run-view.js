// The "Processed for 10m 28s ›" line at the top of an Advanced mode reply, after ChatGPT's: collapsed to one
// line, opening to the process as one line per step (thinking, each Python run), each opening on its own to what
// the model thought, the code (coloured like other code blocks), its output and the files it made. The rows are
// drawn like the live step list is (ledger.js), so what streamed in is what stays.

import { memoryDoneLabel, sandboxText, skippedFileText } from '../../runtime/sandbox/sandbox-texts.js';
import { animateDetails } from '../motion/collapse-motion.js';
import { fillThinkingText } from '../thinking/thinking-text.js';
import { formatElapsed } from '../ledger/ledger.js';
import { createCodeCard } from './run-code-card.js';
import { createSourceChips, mergeSources, putFirstSiteIcon, sourcesRowLabel } from './run-sources.js';
import { RUN_STATUS } from './sandbox-run-block.js';
import { appendMiniRefs, pictureStepRow } from './picture-steps-view.js';
import { councilTimelineHTML } from '../council/council-timeline.js';

const element = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const formatSize = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

// One line of the process list, the same look the live step list has (ledger.js): an icon for the kind of step, the
// label, the time, and a small chevron when there is something to open. It is a details element so it also works from
// the saved markup, where no listener was attached.
function renderRow(document, { kind, label, time = '', failed = false, body, sources }) {
  const row = element(document, 'details', `ledger-row sandbox-run-row is-${failed ? 'failed' : 'done'}`);
  row.dataset.kind = kind;
  const head = element(document, 'summary', `ledger-row-head${body.length ? ' is-expandable' : ''}`);
  head.append(element(document, 'span', 'ledger-mark run-icon'), element(document, 'span', 'ledger-label', label));
  if (time) head.append(element(document, 'span', 'ledger-time', time));
  const content = element(document, 'div', 'ledger-body');
  content.append(...body);
  row.append(head, content);
  if (sources) putFirstSiteIcon(document, row, sources);
  return animateDetails(row);
}

// What the model thought before a run, or before the answer.
function thoughtRow(document, thought, language, { interrupted = false, label } = {}) {
  const pre = element(document, 'div', 'ledger-thought sandbox-run-thought-text');
  fillThinkingText(document, pre, thought);
  return renderRow(document, {
    kind: 'thought',
    label: label || sandboxText(language, interrupted ? 'thinkingInterrupted' : 'ledgerThought'),
    body: [pre]
  });
}

// The pages this message's own work found (a reply that was cut keeps the earlier ones in `sources` for the answer's [n], but its row counts only its own).
const ownSources = (run) => (run.sources || []).slice(run.sourcesBefore || 0);

// "Searched 2 sites": the sites the reply looked at, found by a search or read in full, as one row of chips.
function sourcesRows(document, sources, language) {
  const all = mergeSources(sources);
  return all.length ? [renderRow(document, { kind: 'search', label: sourcesRowLabel(language, all), body: [createSourceChips(document, all)], sources: all })] : [];
}

// "Using connector: GitHub": a row for each connector the reply used (the same row the live step list had; which tools it called is not kept).
function connectorRows(document, run, language) {
  const tools = (run.tools || []).map((tool) => renderRow(document, tool.kind === 'skill'
    ? { kind: 'skill', label: sandboxText(language, 'skillLoaded', { name: tool.name }), body: [] }
    : { kind: { memorySearching: 'memory-recall', memoryReviewing: 'memory-review', memoryWriting: 'memory-write' }[tool.key], label: memoryDoneLabel(language, tool.key, tool.count), body: [] }));
  return [...tools, ...(run.connectors || []).map((name) => renderRow(document, { kind: 'connector', label: sandboxText(language, 'connectorUsing', { connector: name }), body: [] }))];
}

// The pictures the text model looked at, was asked about and drew: a row each (ui/sandbox/picture-steps-view.js).
function pictureRows(document, run, language) {
  return (run.pictures || []).map((step) => {
    const made = pictureStepRow(document, step, language);
    const row = renderRow(document, { kind: made.kind, label: made.label, body: made.empty ? [] : made.body });
    appendMiniRefs(document, row.querySelector('.ledger-label'), made.references);
    return row;
  });
}

function stepRow(document, step, index, language) {
  const body = [createCodeCard(document, step.code, language, { shell: Boolean(step.command) })];

  const output = [step.stdout, step.stderr].filter(Boolean).join(step.stdout && step.stderr ? '\n' : '');
  if (output) {
    body.push(element(document, 'div', 'sandbox-run-label', sandboxText(language, 'sandboxOutput')));
    body.push(element(document, 'pre', 'ledger-output sandbox-run-output', output));
  }
  if (step.outputTrimmed) body.push(element(document, 'p', 'sandbox-run-note', sandboxText(language, 'sandboxOutputTrimmed')));
  if (step.error) {
    body.push(element(document, 'div', 'sandbox-run-label', step.timedOut ? sandboxText(language, 'sandboxTimedOut') : sandboxText(language, 'sandboxError')));
    body.push(element(document, 'pre', 'ledger-output is-error sandbox-run-output sandbox-run-error', step.error));
  }
  if (step.files.length) {
    const files = element(document, 'p', 'sandbox-run-files');
    files.append(element(document, 'span', 'sandbox-run-label', sandboxText(language, 'sandboxProduced')));
    // Documents handed to the design system show under their own names.
    const shown = (name) => (name.startsWith('.noureon/') ? name.slice('.noureon/'.length) : `/output/${name}`);
    files.append(document.createTextNode(` ${step.files.map((file) => `${shown(file.name)}（${formatSize(file.size)}）`).join('、')}`));
    body.push(files);
  }
  // A file the step made that is not offered (too large, no room in the cloud space): said here, so it is not a file that went missing.
  for (const file of Array.isArray(step.skipped) ? step.skipped : []) body.push(element(document, 'p', 'sandbox-run-note is-skipped', skippedFileText(language, file)));
  const number = index + 1;
  return renderRow(document, {
    kind: 'code',
    label: step.title ? sandboxText(language, 'ledgerRan', { n: number, title: step.title }) : sandboxText(language, 'ledgerRanUntitled', { n: number }),
    time: formatElapsed(step.elapsedMs || 0),
    failed: Boolean(step.error),
    body
  });
}

// "Processed for 10m 28s": the time of the whole reply, the way ChatGPT words it.
const formatTotal = (ms) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

function totalMs(run) {
  if (run.elapsedMs) return run.elapsedMs;
  // Replies saved before the total was kept: what the steps and the thinking add up to.
  return run.steps.reduce((sum, step) => sum + (step.elapsedMs || 0), 0) + (run.thoughtMs || 0);
}

// "Thought for 12s · Searched 5 sites · Made on this device": the reply's line, once it is written (the live line ends the same way, sandbox-ledger.js).
function summaryText(run, language) {
  const total = totalMs(run);
  const sources = mergeSources(ownSources(run));
  const head = [
    total > 0 ? sandboxText(language, 'workedFor', { t: formatTotal(total) }) : sandboxText(language, 'sandboxDone', { n: run.steps.length }),
    sources.length ? sourcesRowLabel(language, sources) : '',
    run.madeHere ? sandboxText(language, 'madeHere') : ''
  ].filter(Boolean).join(' · ');
  if (run.status === RUN_STATUS.stopped) return `${head} · ${sandboxText(language, 'sandboxStopped')}`;
  const last = run.steps.at(-1);
  if (run.status === RUN_STATUS.failed || (last && last.error && run.status !== RUN_STATUS.running)) {
    return `${head} · ${sandboxText(language, 'sandboxFailed')}`;
  }
  return head;
}

// "3 members discussed · 1m 20s ›": the line of a council's reply, opening to its timeline, then what the synthesizer did.
function councilSummaryText(run, language) {
  const total = totalMs(run);
  const head = [
    sandboxText(language, 'councilDiscussed', { n: run.council.members.length }),
    total > 0 ? formatTotal(total) : '',
    run.madeHere ? sandboxText(language, 'madeHere') : ''
  ].filter(Boolean).join(' · ');
  if (run.status === RUN_STATUS.stopped) return `${head} · ${sandboxText(language, 'sandboxStopped')}`;
  if (run.status === RUN_STATUS.failed) return `${head} · ${sandboxText(language, 'sandboxFailed')}`;
  return head;
}

function councilRunElement(document, container, run, language) {
  const details = element(document, 'details', 'sandbox-run-details is-council');
  const summary = element(document, 'summary', 'sandbox-run-summary', councilSummaryText(run, language));
  const list = element(document, 'div', 'sandbox-run-steps');
  const timeline = element(document, 'div', 'council-tl-saved');
  timeline.innerHTML = councilTimelineHTML({ ...run.council, stage: 'completed' }, { language });
  list.append(timeline);
  if (ownSources(run).length) list.append(...sourcesRows(document, ownSources(run), language));
  list.append(...connectorRows(document, run, language));
  run.steps.forEach((step, index) => {
    if (step.thought) list.append(thoughtRow(document, step.thought, language));
    list.append(stepRow(document, step, index, language));
  });
  if (run.thought) list.append(thoughtRow(document, run.thought, language, { interrupted: run.thoughtInterrupted, label: thinkingLabel(run, language) }));
  details.append(summary, list);
  animateDetails(details);
  container.append(details);
  return container;
}

// "Thinking · 12s ›" above an answer, opening to the thinking (the model's own,
// or the summary its provider gives).
const thinkingLabel = (run, language) => (run.thoughtInterrupted
  ? sandboxText(language, 'thinkingInterrupted')
  : run.thoughtMs
  ? sandboxText(language, run.thoughtKind === 'summary' ? 'thinkingDoneSummary' : 'thinkingDoneRaw', { s: Math.max(1, Math.round(run.thoughtMs / 1000)) })
  : sandboxText(language, 'sandboxThought'));

function renderReplyThinking(document, run, language) {
  const details = element(document, 'details', 'sandbox-run-details');
  const label = run.madeHere ? `${thinkingLabel(run, language)} · ${sandboxText(language, 'madeHere')}` : thinkingLabel(run, language);
  const pre = element(document, 'div', 'ledger-thought is-saved sandbox-run-thought-text');
  fillThinkingText(document, pre, run.thought);
  details.append(element(document, 'summary', 'sandbox-run-summary', label), pre);
  return animateDetails(details);
}

// A finished run (from the saved text) or a fallback notice.
export function createSandboxRunElement(document, run, { language = 'zh-TW' } = {}) {
  if (!run) return null;
  const container = element(document, 'div', 'sandbox-run');
  if (run.fallback) {
    container.append(element(document, 'p', 'sandbox-fallback-note', sandboxText(language, 'fallbackNotice', { reason: sandboxText(language, `reason.${run.fallback}`) })));
  }
  if (run.council) return councilRunElement(document, container, run, language);
  if (!run.steps.length && (ownSources(run).length || run.connectors?.length || run.tools?.length || run.pictures?.length || run.segment) && run.elapsedMs > 0) {
    // A reply that searched the web but ran no Python is a process like any other: the one line with how long it took,
    // as the live view had, opening to the pages and the thinking. (Replies saved before the time was kept have no line.)
    const details = element(document, 'details', 'sandbox-run-details');
    const summary = element(document, 'summary', 'sandbox-run-summary', summaryText(run, language));
    const list = element(document, 'div', 'sandbox-run-steps');
    list.append(...sourcesRows(document, ownSources(run), language), ...connectorRows(document, run, language), ...pictureRows(document, run, language));
    if (run.thought) list.append(thoughtRow(document, run.thought, language, { interrupted: run.thoughtInterrupted, label: thinkingLabel(run, language) }));
    details.append(summary, list);
    animateDetails(details);
    container.append(details);
    return container;
  }
  if (!run.steps.length) {
    // A reply without Python: the pages it searched, and how the model thought before it answered.
    if (ownSources(run).length) container.append(...sourcesRows(document, ownSources(run), language));
    container.append(...connectorRows(document, run, language), ...pictureRows(document, run, language));
    if (run.thought) container.append(renderReplyThinking(document, run, language));
    // Nothing else to say above the answer: only where it was made.
    else if (run.madeHere) container.append(element(document, 'p', 'sandbox-made-here', sandboxText(language, 'madeHere')));
    return container;
  }
  const details = element(document, 'details', 'sandbox-run-details');
  const summary = element(document, 'summary', 'sandbox-run-summary', summaryText(run, language));
  const list = element(document, 'div', 'sandbox-run-steps');
  if (ownSources(run).length) list.append(...sourcesRows(document, ownSources(run), language));
  list.append(...connectorRows(document, run, language), ...pictureRows(document, run, language));
  run.steps.forEach((step, index) => {
    if (step.thought) list.append(thoughtRow(document, step.thought, language));
    list.append(stepRow(document, step, index, language));
  });
  if (run.thought) list.append(thoughtRow(document, run.thought, language, { interrupted: run.thoughtInterrupted }));
  details.append(summary, list);
  animateDetails(details);
  container.append(details);
  return container;
}
