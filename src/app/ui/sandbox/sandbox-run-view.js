// The "Processed for 10m 28s ›" line at the top of an Advanced mode reply, after ChatGPT's: collapsed to one
// line, opening to the process as one line per step (thinking, each Python run), each opening on its own to what
// the model thought, the code (coloured like other code blocks), its output and the files it made. The rows are
// drawn like the live step list is (ledger.js), so what streamed in is what stays.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { animateDetails } from '../motion/collapse-motion.js';
import { fillThinkingText } from '../thinking/thinking-text.js';
import { formatElapsed } from '../ledger/ledger.js';
import { createCodeCard } from './run-code-card.js';
import { createSourceChips, pagesReadLabel, sourcesLabel, splitSources } from './run-sources.js';
import { RUN_STATUS } from './sandbox-run-block.js';

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
function renderRow(document, { kind, label, time = '', failed = false, body }) {
  const row = element(document, 'details', `ledger-row sandbox-run-row is-${failed ? 'failed' : 'done'}`);
  row.dataset.kind = kind;
  const head = element(document, 'summary', 'ledger-row-head is-expandable');
  head.append(element(document, 'span', 'ledger-mark run-icon'), element(document, 'span', 'ledger-label', label));
  if (time) head.append(element(document, 'span', 'ledger-time', time));
  const content = element(document, 'div', 'ledger-body');
  content.append(...body);
  row.append(head, content);
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

// "Searched 2 sites": the pages the web search found, as chips; and "Read 2 pages": the pages the user linked, which were read.
function sourcesRows(document, sources, language) {
  const { searched, read } = splitSources(sources);
  return [
    ...(searched.length ? [renderRow(document, { kind: 'search', label: sourcesLabel(language, searched.length), body: [createSourceChips(document, searched)] })] : []),
    ...(read.length ? [renderRow(document, { kind: 'search', label: pagesReadLabel(language, read.length), body: [createSourceChips(document, read)] })] : [])
  ];
}

// What the model said before a run, between the steps in ordinary text.
function narrationBlock(document, text) {
  const block = element(document, 'div', 'sandbox-run-narration');
  fillThinkingText(document, block, text);
  return block;
}

function stepRow(document, step, index, language) {
  const body = [createCodeCard(document, step.code, language)];

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

function summaryText(run, language) {
  const total = totalMs(run);
  const head = total > 0 ? sandboxText(language, 'processedIn', { t: formatTotal(total) }) : sandboxText(language, 'sandboxDone', { n: run.steps.length });
  if (run.status === RUN_STATUS.stopped) return `${head} · ${sandboxText(language, 'sandboxStopped')}`;
  const last = run.steps.at(-1);
  if (run.status === RUN_STATUS.failed || (last && last.error && run.status !== RUN_STATUS.running)) {
    return `${head} · ${sandboxText(language, 'sandboxFailed')}`;
  }
  return head;
}

// "Thinking · 12s ›" above an answer, opening to the thinking (the model's own,
// or the summary its provider gives).
function renderReplyThinking(document, run, language) {
  const details = element(document, 'details', 'sandbox-run-details');
  const label = run.thoughtInterrupted
    ? sandboxText(language, 'thinkingInterrupted')
    : run.thoughtMs
    ? sandboxText(language, run.thoughtKind === 'summary' ? 'thinkingDoneSummary' : 'thinkingDoneRaw', { s: Math.max(1, Math.round(run.thoughtMs / 1000)) })
    : sandboxText(language, 'sandboxThought');
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
  if (!run.steps.length) {
    // A reply without Python: the pages it searched, and how the model thought before it answered.
    if (run.sources?.length) container.append(...sourcesRows(document, run.sources, language));
    if (run.thought) container.append(renderReplyThinking(document, run, language));
    return container;
  }
  const details = element(document, 'details', 'sandbox-run-details');
  const summary = element(document, 'summary', 'sandbox-run-summary', summaryText(run, language));
  const list = element(document, 'div', 'sandbox-run-steps');
  if (run.sources?.length) list.append(...sourcesRows(document, run.sources, language));
  run.steps.forEach((step, index) => {
    if (step.thought) list.append(thoughtRow(document, step.thought, language));
    if (step.narration) list.append(narrationBlock(document, step.narration));
    list.append(stepRow(document, step, index, language));
  });
  if (run.thought) list.append(thoughtRow(document, run.thought, language, { interrupted: run.thoughtInterrupted }));
  details.append(summary, list);
  animateDetails(details);
  container.append(details);
  return container;
}
