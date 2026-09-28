// The "Ran code N times ›" row at the top of an Advanced mode reply, after
// ChatGPT's "Analyzed" row and Claude's tool steps: collapsed to one line,
// opening to each run's code (coloured like other code blocks), output and
// created files. While the reply is being written the same element shows the
// current step instead.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
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

const formatSeconds = (language, ms) => sandboxText(language, 'sandboxSeconds', { s: (ms / 1000).toFixed(ms < 10_000 ? 1 : 0) });

function renderStep(document, step, index, language) {
  // Plain blocks rather than a list: the chat's list styles would number
  // the steps a second time.
  const item = element(document, 'div', 'sandbox-run-step');
  const head = element(document, 'div', 'sandbox-run-step-head');
  head.append(
    element(document, 'span', 'sandbox-run-step-number', String(index + 1)),
    element(document, 'span', 'sandbox-run-step-title', step.title || sandboxText(language, 'sandboxStep', { n: index + 1 }))
  );
  if (step.elapsedMs) head.append(element(document, 'span', 'sandbox-run-step-time', formatSeconds(language, step.elapsedMs)));
  item.append(head);

  const pre = element(document, 'pre', 'sandbox-run-code');
  pre.append(element(document, 'code', 'language-python', step.code));
  item.append(pre);

  const output = [step.stdout, step.stderr].filter(Boolean).join(step.stdout && step.stderr ? '\n' : '');
  if (output) {
    item.append(element(document, 'div', 'sandbox-run-label', sandboxText(language, 'sandboxOutput')));
    item.append(element(document, 'pre', 'sandbox-run-output', output));
  }
  if (step.outputTrimmed) item.append(element(document, 'p', 'sandbox-run-note', sandboxText(language, 'sandboxOutputTrimmed')));
  if (step.error) {
    item.append(element(document, 'div', 'sandbox-run-label', step.timedOut ? sandboxText(language, 'sandboxTimedOut') : sandboxText(language, 'sandboxError')));
    item.append(element(document, 'pre', 'sandbox-run-output sandbox-run-error', step.error));
  }
  if (step.files.length) {
    const files = element(document, 'p', 'sandbox-run-files');
    files.append(element(document, 'span', 'sandbox-run-label', sandboxText(language, 'sandboxProduced')));
    // Documents handed to the design system show under their own names.
    const shown = (name) => (name.startsWith('.noureon/') ? name.slice('.noureon/'.length) : `/output/${name}`);
    files.append(document.createTextNode(` ${step.files.map((file) => `${shown(file.name)}（${formatSize(file.size)}）`).join('、')}`));
    item.append(files);
  }
  return item;
}

function summaryText(run, language) {
  if (run.status === RUN_STATUS.stopped) return `${sandboxText(language, 'sandboxDone', { n: run.steps.length })} · ${sandboxText(language, 'sandboxStopped')}`;
  const last = run.steps.at(-1);
  if (run.status === RUN_STATUS.failed || (last && last.error && run.status !== RUN_STATUS.running)) {
    return `${sandboxText(language, 'sandboxDone', { n: run.steps.length })} · ${sandboxText(language, 'sandboxFailed')}`;
  }
  return sandboxText(language, 'sandboxDone', { n: run.steps.length });
}

// A finished run (from the saved text) or a fallback notice.
export function createSandboxRunElement(document, run, { language = 'zh-TW' } = {}) {
  if (!run) return null;
  const container = element(document, 'div', 'sandbox-run');
  if (run.fallback) {
    container.append(element(document, 'p', 'sandbox-fallback-note', sandboxText(language, 'fallbackNotice', { reason: sandboxText(language, `reason.${run.fallback}`) })));
  }
  if (!run.steps.length) return container;
  const details = element(document, 'details', 'sandbox-run-details');
  const summary = element(document, 'summary', 'sandbox-run-summary', summaryText(run, language));
  const list = element(document, 'div', 'sandbox-run-steps');
  run.steps.forEach((step, index) => list.append(renderStep(document, step, index, language)));
  details.append(summary, list);
  container.append(details);
  return container;
}

// The live line while the reply is being written: a status and the steps so far.
export function createSandboxLiveElement(document) {
  const container = element(document, 'div', 'sandbox-run sandbox-run-live');
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  const line = element(document, 'div', 'sandbox-run-live-line');
  line.append(element(document, 'span', 'sandbox-run-spinner'), element(document, 'span', 'sandbox-run-live-text'));
  container.append(line);
  return {
    element: container,
    update(statusText) {
      container.querySelector('.sandbox-run-live-text').textContent = statusText;
    },
    remove: () => container.remove()
  };
}
