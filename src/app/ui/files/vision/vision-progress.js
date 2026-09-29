import { createLedger } from '../../ledger/ledger.js';
import { createSandboxLedger } from '../../sandbox/sandbox-ledger.js';
import { keepEndInView } from '../../motion/collapse-motion.js';
import { fillThinkingText } from '../../thinking/thinking-text.js';
import { visionText } from './vision-texts.js';

/**
 * The automatic visual check as one quiet line under the message it checks
 * (`Visual check · Drawing slide 3 of 13`, shimmering while it works), which
 * opens to the steps: the slides as they are drawn, the contact sheets, the
 * model looking, the problems found and the redoing. `host` is the message;
 * the line's stop button stops the check through `controller`.
 */
export function createVisionProgress({ document, language, controller, host = null, before = null }) {
  const text = (key, values) => visionText(language, key, values);
  let floating = null;
  if (!host) {
    // No message to sit under (it was closed): a corner of the page instead.
    floating = document.createElement('div');
    floating.className = 'ledger-floating';
    document.body.append(floating);
  }
  const outer = createLedger({ document, host: host || floating, before });
  const parent = outer.addRow(text('ledgerTitle'));
  parent.enableBody(false);
  parent.addAction(text('stop'), () => controller?.abort());
  const ledger = createLedger({ document, host: parent.body });
  // The line says which step it is at, so it can stay folded.
  const sync = () => {
    const current = ledger.current;
    parent.setLabel(current ? `${text('ledgerTitle')} · ${current.label}` : text('ledgerTitle'));
  };
  controller?.signal?.addEventListener('abort', () => remove(), { once: true });

  const create = (name, className) => Object.assign(document.createElement(name), { className });
  const rows = {};
  let thumbs = null;
  const cells = new Map();
  let sheets = null;
  let redo = null;
  let thought = null;
  let thoughtText = '';

  const open = (name, label, options) => {
    // A step starts when the one before it is done.
    ledger.current?.finish('done');
    ledger.foldFinished();
    rows[name] = ledger.addRow(label, options);
    return rows[name];
  };
  const finish = (name, label) => {
    const row = rows[name];
    if (!row) return;
    if (label) row.setLabel(label);
    row.finish('done');
  };

  const progress = {
    set(key, values) {
      if (key === 'preparing') open('prepare', text('preparing'));
      else if (key === 'rendering') {
        finish('prepare');
        if (!rows.render) open('render', text('rendering'));
      } else if (key === 'reviewing') {
        finish('sheets', text('sheetsDone', { total: sheets?.children.length ?? 0 }));
        open('review', text('reviewingSheets', { model: values?.model || '', count: sheets?.children.length ?? 0 }));
        // What the model is looking at stays in view while it looks.
        rows.sheets?.setOpen(true);
        rows.review.doneLabel = text('reviewedBy', { model: values?.model || '' });
      } else if (key === 'applying' || key === 'fixing') {
        redo = open('redo', text(key, values));
        redo.enableBody(true);
      }
    },
    // Free text, such as what the Python sandbox is doing while a deck is redone.
    setText(line) { (redo || ledger.current)?.setDetail(line); },
    // A slide has been drawn: its picture takes its place in the grid.
    slideRendered({ index, total, number, url }) {
      if (!rows.render) open('render', text('rendering'));
      const row = rows.render;
      row.setLabel(text('slideProgress', { n: index + 1, total }));
      if (!thumbs) {
        thumbs = create('div', 'ledger-thumbs');
        for (let position = 0; position < total; position += 1) {
          const item = create('div', 'ledger-thumb');
          cells.set(position, item);
          thumbs.append(item);
        }
        row.body.append(thumbs);
        row.enableBody(true);
      }
      cells.forEach((item) => item.classList.remove('is-current'));
      const item = cells.get(index);
      if (item) {
        const image = Object.assign(document.createElement('img'), { src: url, alt: '' });
        const label = create('span', 'ledger-thumb-number');
        label.textContent = String(number);
        item.replaceChildren(image, label);
        item.classList.add('is-current');
      }
    },
    // A contact sheet (four slides in one picture) is ready.
    sheetReady({ index, total, url }) {
      cells.forEach((item) => item.classList.remove('is-current'));
      if (!rows.sheets) {
        finish('render', text('renderedSlides', { total: cells.size }));
        open('sheets', text('sheetsProgress', { n: 1, total }));
        sheets = create('div', 'ledger-sheets');
        rows.sheets.body.append(sheets);
        rows.sheets.enableBody(true);
      }
      sheets.append(Object.assign(document.createElement('img'), { src: url, alt: '' }));
      rows.sheets.setLabel(text('sheetsProgress', { n: index + 1, total }));
    },
    // What the model is thinking while it looks, as it streams.
    thinking(chunk) {
      const row = rows.review;
      if (!row || !chunk) return;
      if (!thought) {
        thought = create('pre', 'ledger-thought');
        row.body.append(thought);
        row.enableBody(true);
      }
      thoughtText = (thoughtText + chunk).slice(-12_000);
      keepEndInView(thought, () => fillThinkingText(document, thought, thoughtText));
    },
    // The problems the model found: their slides are outlined, the first few listed.
    showIssues(issues) {
      for (const issue of issues) cells.get(issue.slide - 1)?.classList.add('has-issue');
      if (rows.review) rows.review.setLabel(rows.review.doneLabel || rows.review.node.textContent);
      ledger.current?.finish('done');
      const row = ledger.addRow(text('issuesFound', { count: issues.length }), { body: true });
      const list = create('ul', 'ledger-issues');
      for (const issue of issues.slice(0, 6)) {
        const item = document.createElement('li');
        item.textContent = `${text('slide', { number: issue.slide })}: ${issue.problem}`;
        list.append(item);
      }
      row.body.append(list);
      row.enableBody(true);
      row.finish('done');
    },
    // The Python steps of the redoing go inside its row.
    python(language = 'zh-TW') {
      redo ||= open('redo', text('fixing', { model: '' }));
      redo.enableBody(true);
      return createSandboxLedger({ document, host: redo.body, language });
    }
  };
  function remove() {
    outer.remove();
    floating?.remove();
  }
  for (const key of ['set', 'slideRendered', 'sheetReady', 'showIssues', 'python']) {
    const method = progress[key];
    progress[key] = (...args) => {
      const result = method(...args);
      sync();
      return result;
    };
  }
  return { ...progress, remove };
}
