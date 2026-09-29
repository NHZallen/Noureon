// The work window while an Advanced mode reply runs Python: what the AI is
// doing right now (the status), and for each run its code, what it prints as
// it prints, and the files it made (pictures as thumbnails). The stop button
// of the composer stops the reply, so the window has none of its own.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { createWorkWindow } from '../work-window/work-window.js';

const MAX_OUTPUT_CHARS = 4000;
const MAX_CODE_CHARS = 6000;
const IMAGE_TYPES = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' });

const extensionOf = (name) => String(name || '').split('.').pop().toLowerCase();

const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function createSandboxWorkWindow({ document, language = 'zh-TW' }) {
  const text = (key, values) => sandboxText(language, key, values);
  const box = createWorkWindow({
    document,
    anchor: document.getElementById?.('input-bar-container') || null,
    controller: null,
    texts: { stop: '', fold: text('workFold'), unfold: text('workUnfold') },
    showStop: false
  });
  const urls = [];
  const steps = new Map();
  const create = (name, className, content) => {
    const node = document.createElement(name);
    node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  const startStep = ({ n, title, code }) => {
    // Earlier runs fold up to their heading, the newest is open.
    steps.forEach((step) => { step.details.open = false; });
    const details = create('details', 'work-step');
    details.open = true;
    const summary = create('summary', 'work-step-summary');
    const heading = create('span', 'work-step-heading', title ? `${text('sandboxStep', { n })} · ${title}` : text('sandboxStep', { n }));
    const state = create('span', 'work-step-state', text('workRunning'));
    summary.append(heading, state);
    const source = code.length > MAX_CODE_CHARS ? `${code.slice(0, MAX_CODE_CHARS)}\n…` : code;
    const codeBlock = create('pre', 'work-code', source);
    const output = create('pre', 'work-output');
    output.hidden = true;
    const files = create('div', 'work-files');
    files.hidden = true;
    details.append(summary, codeBlock, output, files);
    box.body.append(details);
    steps.set(n, { details, state, output, files, written: '' });
    details.scrollIntoView?.({ block: 'nearest' });
  };

  const addOutput = ({ n, stream, text: chunk }) => {
    const step = steps.get(n);
    if (!step) return;
    step.written = (step.written + chunk).slice(-MAX_OUTPUT_CHARS);
    step.output.hidden = false;
    step.output.textContent = step.written;
    step.output.classList.toggle('is-error', stream === 'stderr');
    step.output.scrollTop = step.output.scrollHeight;
  };

  const endStep = ({ n, ok, error, files, elapsedMs }) => {
    const step = steps.get(n);
    if (!step) return;
    step.state.textContent = `${ok ? text('workDone') : text('workFailed')} · ${(elapsedMs / 1000).toFixed(1)} s`;
    step.state.classList.toggle('is-error', !ok);
    if (error) {
      step.output.hidden = false;
      step.output.classList.add('is-error');
      step.output.textContent = `${step.written ? `${step.written}\n` : ''}${String(error).slice(-1200)}`;
    }
    for (const file of files) {
      const kind = IMAGE_TYPES[extensionOf(file.name)];
      if (kind && file.bytes?.length) {
        const url = document.defaultView.URL.createObjectURL(new document.defaultView.Blob([file.bytes], { type: kind }));
        urls.push(url);
        const figure = create('figure', 'work-file work-file-image');
        const image = document.createElement('img');
        image.src = url;
        image.alt = file.name;
        figure.append(image, create('figcaption', 'work-file-name', file.name));
        step.files.append(figure);
      } else {
        const chip = create('div', 'work-file work-file-chip');
        chip.append(create('span', 'work-file-type', extensionOf(file.name).toUpperCase().slice(0, 5) || 'FILE'), create('span', 'work-file-name', file.name), create('span', 'work-file-size', sizeText(file.size || file.bytes?.length || 0)));
        step.files.append(chip);
      }
      step.files.hidden = false;
    }
    if (files.length) step.files.scrollIntoView?.({ block: 'nearest' });
  };

  return {
    status(line) { box.setTitle(line); },
    event(event) {
      if (event.type === 'step') startStep(event);
      else if (event.type === 'output') addOutput(event);
      else if (event.type === 'step-end') endStep(event);
    },
    remove() {
      box.remove();
      urls.forEach((url) => document.defaultView.URL.revokeObjectURL(url));
    }
  };
}
