import { createWorkWindow } from '../../work-window/work-window.js';
import { visionText } from './vision-texts.js';

const PHASE_OF = Object.freeze({ rendering: 'render', reviewing: 'review', applying: 'redo', fixing: 'redo' });

/**
 * The window above the composer that shows the background visual check:
 * each slide as it is drawn, the contact sheets as they are put together,
 * the problems found, and the redoing. Cancellable with its stop button.
 */
export function createVisionProgress({ document, language, controller }) {
  const text = (key, values) => visionText(language, key, values);
  const box = createWorkWindow({
    document,
    anchor: document.getElementById?.('input-bar-container') || null,
    controller,
    texts: { stop: text('stop'), fold: text('fold'), unfold: text('unfold') },
    phases: [
      { key: 'render', label: text('phaseRender') },
      { key: 'sheets', label: text('phaseSheets') },
      { key: 'review', label: text('phaseReview') },
      { key: 'redo', label: text('phaseRedo') }
    ]
  });
  box.setTitle(text('preparing'));

  const create = (name, className) => Object.assign(document.createElement(name), { className });
  let caption = null;
  let thumbs = null;
  const cells = new Map();
  let sheets = null;
  let issuesList = null;
  const say = (line) => {
    caption ||= create('p', 'work-caption');
    caption.textContent = line;
    if (!caption.isConnected) box.body.append(caption);
  };

  return {
    set(key, values) {
      box.setTitle(text(key, values));
      const phase = PHASE_OF[key];
      if (phase) box.setPhase(phase);
      if (key === 'reviewing') {
        box.setProgress(0.7);
        if (sheets) say(text('reviewingSheets', { model: values?.model || '', count: sheets.children.length }));
      }
      if (key === 'applying' || key === 'fixing') box.setProgress(0.85);
    },
    // Free text, such as what the Python sandbox is doing while a deck is redone.
    setText(line) { box.setTitle(line); },
    // A slide has been drawn: its picture takes its place in the grid.
    slideRendered({ index, total, number, url }) {
      if (!thumbs) {
        thumbs = create('div', 'work-thumbs');
        for (let position = 0; position < total; position += 1) {
          const item = create('div', 'work-thumb');
          cells.set(position, item);
          thumbs.append(item);
        }
        box.body.append(thumbs);
      }
      cells.forEach((item) => item.classList.remove('is-current'));
      const item = cells.get(index);
      if (item) {
        const image = Object.assign(document.createElement('img'), { src: url, alt: '' });
        const label = create('span', 'work-thumb-number');
        label.textContent = String(number);
        item.replaceChildren(image, label);
        item.classList.add('is-current');
      }
      box.setPhase('render');
      box.setProgress(0.4 * ((index + 1) / total));
      say(text('slideProgress', { n: index + 1, total }));
    },
    // A contact sheet (four slides in one picture) is ready.
    sheetReady({ index, total, url }) {
      cells.forEach((item) => item.classList.remove('is-current'));
      if (!sheets) {
        sheets = create('div', 'work-sheets');
        box.body.append(sheets);
      }
      sheets.append(Object.assign(document.createElement('img'), { src: url, alt: '' }));
      box.setPhase('sheets');
      box.setProgress(0.4 + 0.3 * ((index + 1) / total));
      say(text('sheetsProgress', { n: index + 1, total }));
    },
    // The problems the model found: their slides are outlined, the first few listed.
    showIssues(issues) {
      for (const issue of issues) cells.get(issue.slide - 1)?.classList.add('has-issue');
      issuesList?.remove();
      issuesList = create('ul', 'work-issues');
      for (const issue of issues.slice(0, 4)) {
        const item = document.createElement('li');
        item.textContent = `${text('slide', { number: issue.slide })}: ${issue.problem}`;
        issuesList.append(item);
      }
      box.body.append(issuesList);
      say(text('issuesFound', { count: issues.length }));
    },
    remove: box.remove
  };
}
