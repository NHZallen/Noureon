// What an Advanced mode reply shows while it works, as a step list in the
// message (see ledger.js): the model thinking, Python being prepared, each
// run with its code, what it prints as it prints, and the files it made
// (pictures as thumbnails), then the files being finished. Fed by the events
// runSandboxReply reports.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { createLedger } from '../ledger/ledger.js';
import { keepEndInView } from '../motion/collapse-motion.js';
import { fillThinkingText } from '../thinking/thinking-text.js';

const MAX_OUTPUT_CHARS = 4000;
const MAX_CODE_CHARS = 6000;
const MAX_THOUGHT_CHARS = 12_000;
const IMAGE_TYPES = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' });

const extensionOf = (name) => String(name || '').split('.').pop().toLowerCase();
const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function createSandboxLedger({ document, host, before = null, language = 'zh-TW' }) {
  const text = (key, values) => sandboxText(language, key, values);
  const list = createLedger({ document, host, before });
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
      row.thought = create('pre', 'ledger-thought');
      row.body.append(row.thought);
      row.enableBody(true);
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
      row.enableBody(true);
    }
    keepEndInView(row.writing, () => { row.writing.textContent = source.length > MAX_CODE_CHARS ? `${source.slice(0, MAX_CODE_CHARS)}\n…` : source; });
  };

  const startStep = ({ n, title, code }) => {
    // The run shows the code itself; the draft in the thinking row goes.
    list.current?.writing?.remove();
    const running = title ? text('sandboxRunning', { n, title }) : text('sandboxRunningUntitled', { n });
    const row = begin(running, { body: true });
    row.doneLabel = title ? text('ledgerRan', { n, title }) : text('ledgerRanUntitled', { n });
    row.enableBody(true);
    const source = code.length > MAX_CODE_CHARS ? `${code.slice(0, MAX_CODE_CHARS)}\n…` : code;
    const output = create('pre', 'ledger-output');
    output.hidden = true;
    const files = create('div', 'ledger-files');
    files.hidden = true;
    row.body.append(create('pre', 'ledger-code', source), output, files);
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

  return {
    event(event) {
      if (event.type === 'round') {
        const row = begin(event.label);
        row.doneLabel = event.doneLabel;
      } else if (event.type === 'prepare') {
        list.current?.setDetail(event.text);
      } else if (event.type === 'finishing') {
        begin(event.label);
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
    },
    // The status line for callers that only have text (the visual check's redo).
    detail(line) { list.current?.setDetail(line); },
    remove() {
      list.remove();
      urls.forEach((url) => document.defaultView.URL.revokeObjectURL(url));
    }
  };
}
