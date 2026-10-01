// What an Advanced mode reply shows while it works, as a step list in the
// message (see ledger.js): the model thinking, Python being prepared, each
// run with its code, what it prints as it prints, and the files it made
// (pictures as thumbnails), then the files being finished. Fed by the events
// runSandboxReply reports.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { createLedger, formatElapsed } from '../ledger/ledger.js';
import { createCodeCard } from './run-code-card.js';
import { createSourceChips, mergeSources, putFirstSiteIcon, sourcesRowLabel } from './run-sources.js';
import { keepEndInView } from '../motion/collapse-motion.js';
import { fillThinkingText } from '../thinking/thinking-text.js';

const MAX_OUTPUT_CHARS = 4000;
const MAX_CODE_CHARS = 6000;
const MAX_THOUGHT_CHARS = 12_000;
const IMAGE_TYPES = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' });

const extensionOf = (name) => String(name || '').split('.').pop().toLowerCase();
const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * `summary` puts all the steps under one line, "Working · Reading page: github.com ›  24s", which says what the work is at and
 * opens to the steps (`open`: it starts open). The steps are folded either way, newest too. Without it the steps are the list
 * itself (where this is inside a row of another list, such as the visual check's).
 */
export function createSandboxLedger({ document, host, before = null, language = 'zh-TW', summary = false, open = false }) {
  const text = (key, values) => sandboxText(language, key, values);
  const outer = summary ? createLedger({ document, host, before }) : null;
  const line = outer ? outer.addRow(text('processWorking')) : null;
  line?.enableBody(open);
  const list = line ? createLedger({ document, host: line.body }) : createLedger({ document, host, before });
  const startedAt = Date.now();
  // The line says which step the work is at, so the steps can stay folded.
  const syncLine = () => {
    const current = list.current;
    if (line && current) line.setLabel(`${text('processWorking')} · ${current.label}`);
  };
  const urls = [];
  const steps = new Map();
  const create = (name, className, content) => {
    const node = document.createElement(name);
    node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  // Ends the row in progress; rows that name what they did say so in the past.
  const endCurrent = (state = 'done') => {
    const row = list.current;
    if (!row) return;
    if (row.doneLabel) row.setLabel(row.doneLabel);
    row.finish(state);
  };
  const begin = (label, options) => {
    endCurrent();
    list.foldFinished();
    return list.addRow(label, options);
  };

  // The model's thinking, as it streams, in the row of the round it belongs to.
  const addThought = ({ text: chunk }) => {
    const row = list.current;
    if (!row || !chunk) return;
    if (!row.thought) {
      row.thought = create('div', 'ledger-thought');
      row.body.append(row.thought);
      // The thinking is there to open when wanted, not opened for the reader while it streams.
      row.enableBody(false);
    }
    row.thoughtText = ((row.thoughtText || '') + chunk).slice(-MAX_THOUGHT_CHARS);
    // Reading further up is never pulled down to the newest line.
    keepEndInView(row.thought, () => fillThinkingText(document, row.thought, row.thoughtText));
  };

  // The code as the model writes it (before it runs).
  const addCode = ({ text: source }) => {
    const row = list.current;
    if (!row || !source) return;
    if (!row.writing) {
      row.writing = create('pre', 'ledger-code');
      row.body.append(row.writing);
      row.enableBody(false);
    }
    keepEndInView(row.writing, () => { row.writing.textContent = source.length > MAX_CODE_CHARS ? `${source.slice(0, MAX_CODE_CHARS)}\n…` : source; });
  };

  const startStep = ({ n, title, code }) => {
    // The run shows the code itself; the draft in the thinking row goes.
    list.current?.writing?.remove();
    const running = title ? text('sandboxRunning', { n, title }) : text('sandboxRunningUntitled', { n });
    const row = begin(running, { body: true, kind: 'code' });
    row.doneLabel = title ? text('ledgerRan', { n, title }) : text('ledgerRanUntitled', { n });
    row.enableBody(false);
    const source = code.length > MAX_CODE_CHARS ? `${code.slice(0, MAX_CODE_CHARS)}\n…` : code;
    const output = create('pre', 'ledger-output');
    output.hidden = true;
    const files = create('div', 'ledger-files');
    files.hidden = true;
    row.body.append(createCodeCard(document, source, language), output, files);
    steps.set(n, { row, output, files, written: '' });
  };

  const addOutput = ({ n, stream, text: chunk }) => {
    const step = steps.get(n);
    if (!step) return;
    step.row.setDetail('');
    step.written = (step.written + chunk).slice(-MAX_OUTPUT_CHARS);
    step.output.hidden = false;
    step.output.classList.toggle('is-error', stream === 'stderr');
    keepEndInView(step.output, () => { step.output.textContent = step.written; });
  };

  const addFile = (step, file) => {
    const kind = IMAGE_TYPES[extensionOf(file.name)];
    const view = document.defaultView;
    if (kind && file.bytes?.length) {
      const url = view.URL.createObjectURL(new view.Blob([file.bytes], { type: kind }));
      urls.push(url);
      const figure = create('figure', 'ledger-file ledger-file-image');
      const image = document.createElement('img');
      image.src = url;
      image.alt = file.name;
      figure.append(image, create('figcaption', 'ledger-file-name', file.name));
      step.files.append(figure);
    } else {
      const chip = create('div', 'ledger-file ledger-file-chip');
      chip.append(
        create('span', 'ledger-file-type', extensionOf(file.name).toUpperCase().slice(0, 5) || 'FILE'),
        create('span', 'ledger-file-name', file.name),
        create('span', 'ledger-file-size', sizeText(file.size || file.bytes?.length || 0))
      );
      step.files.append(chip);
    }
    step.files.hidden = false;
  };

  const endStep = ({ n, ok, error, files }) => {
    const step = steps.get(n);
    if (!step) return;
    if (error) {
      step.output.hidden = false;
      step.output.classList.add('is-error');
      step.output.textContent = `${step.written ? `${step.written}\n` : ''}${String(error).slice(-1200)}`;
    }
    files.forEach((file) => addFile(step, file));
    step.row.setDetail('');
    step.row.setLabel(step.row.doneLabel);
    step.row.finish(ok ? 'done' : 'failed');
  };

  // What the model says before a run, in ordinary text between the step lines (the saved reply draws it the same way).
  const addNarration = ({ text: said }) => {
    if (!String(said || '').trim()) return;
    const block = create('div', 'sandbox-run-narration');
    fillThinkingText(document, block, String(said).trim());
    list.list.append(block);
  };

  // A web search that runs before the model: a row in progress, which becomes the finished, folded row that opens
  // to the pages it found (or goes, if it found none).
  const startSearch = ({ label }) => {
    const row = begin(label, { body: true, kind: 'search' });
    row.searching = true;
  };
  // The sites a reply looked at are one row however many searches and pages that took: the row of the first grows, and the
  // rows of the calls after it are only there while they run.
  let webRow = null;
  let webSources = [];
  const addSources = ({ sources }) => {
    const searching = list.current?.searching ? list.current : null;
    const all = mergeSources(webSources, sources || []);
    if (!all.length) {
      searching?.discard();
      return;
    }
    const label = sourcesRowLabel(language, all);
    if (webRow) {
      searching?.discard();
      webRow.setLabel(label);
      webRow.body.replaceChildren(createSourceChips(document, all));
    } else {
      const row = searching || begin(label, { body: true, kind: 'search' });
      if (searching) row.setLabel(label);
      row.body.append(createSourceChips(document, all));
      putFirstSiteIcon(document, row.node, all);
      row.enableBody(false);
      row.searching = false;
      row.finish('done');
      webRow = row;
    }
    webSources = all;
  };

  const handle = (event) => {
      if (event.type === 'narration') {
        addNarration(event);
      } else if (event.type === 'searching') {
        startSearch(event);
      } else if (event.type === 'sources') {
        addSources(event);
      } else if (event.type === 'round') {
        const row = begin(event.label, { kind: 'thought' });
        row.doneLabel = event.doneLabel;
      } else if (event.type === 'answering') {
        // Writing the answer is not thinking: that row is over and folds.
        endCurrent();
        list.foldFinished();
        if (line) {
          // The line becomes what the saved reply shows once the answer is written.
          line.setLabel(text('processedIn', { t: formatElapsed(Date.now() - startedAt, { always: true }) }));
          line.finish('done');
          line.node.classList.add('is-quiet');
        }
      } else if (event.type === 'prepare') {
        list.current?.setDetail(event.text);
      } else if (event.type === 'finishing') {
        begin(event.label, { kind: 'file' });
      } else if (event.type === 'thinking') {
        addThought(event);
      } else if (event.type === 'code') {
        addCode(event);
      } else if (event.type === 'step') {
        startStep(event);
      } else if (event.type === 'output') {
        addOutput(event);
      } else if (event.type === 'step-end') {
        endStep(event);
      }
  };

  return {
    event(event) {
      handle(event);
      syncLine();
    },
    // The status line for callers that only have text (the visual check's redo).
    detail(status) { list.current?.setDetail(status); },
    remove() {
      (outer || list).remove();
      urls.forEach((url) => document.defaultView.URL.revokeObjectURL(url));
    }
  };
}
