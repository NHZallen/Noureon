// A live step list for work the AI does in the background (Python runs, the
// visual check), shown inside the message it belongs to, the way chat
// products show tool use: one line per step with a status mark, the step in
// progress shimmering with its running time, finished steps folded to a line
// that opens to what happened. The same rows serve every kind of work.

const element = (document, name, className, text) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const MARKS = Object.freeze({ running: '', done: '✓', failed: '✕', pending: '' });

/** 4s, 1:05: nothing for the first seconds, so quick steps stay quiet. */
export function formatElapsed(milliseconds, { always = false } = {}) {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 3 && !always) return '';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * `host` is the element the list is put into (the message); with `before` it
 * goes in front of that child. `title` and `onStop` add a heading line with a
 * stop button. `texts.stop` is the button's word.
 */
export function createLedger({ document, host, before = null, title = '', onStop = null, texts = {} }) {
  const window = document.defaultView;
  const root = element(document, 'div', 'ledger');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  if (title) {
    const heading = element(document, 'div', 'ledger-heading');
    heading.append(element(document, 'span', 'ledger-heading-text', title));
    if (onStop) {
      const stop = element(document, 'button', 'ledger-stop', texts.stop || 'Stop');
      stop.type = 'button';
      stop.addEventListener('click', onStop);
      heading.append(stop);
    }
    root.append(heading);
  }
  const list = element(document, 'div', 'ledger-list');
  root.append(list);
  if (before && before.parentNode === host) host.insertBefore(root, before);
  else host.append(root);

  const rows = [];
  // One clock for every running row.
  const tick = () => rows.forEach((row) => row.draw());
  const timer = window?.setInterval?.(tick, 1000);
  let gone = false;

  function addRow(label, { body = false } = {}) {
    const node = element(document, 'div', 'ledger-row is-running');
    const head = element(document, 'div', 'ledger-row-head');
    const mark = element(document, 'span', 'ledger-mark');
    const text = element(document, 'span', 'ledger-label', label);
    const time = element(document, 'span', 'ledger-time');
    head.append(mark, text, time);
    const detail = element(document, 'div', 'ledger-detail');
    detail.hidden = true;
    const content = element(document, 'div', 'ledger-body');
    content.hidden = true;
    node.append(head, detail, content);
    list.append(node);

    const startedAt = Date.now();
    let state = 'running';
    let finishedAt = null;
    let expandable = body;
    let open = false;
    const draw = () => {
      mark.textContent = MARKS[state];
      node.classList.remove('is-running', 'is-done', 'is-failed', 'is-pending');
      node.classList.add(`is-${state}`);
      time.textContent = formatElapsed((finishedAt ?? Date.now()) - startedAt);
      head.classList.toggle('is-expandable', expandable);
      head.setAttribute('aria-expanded', expandable ? String(open) : 'false');
      content.hidden = !(expandable && open);
    };
    head.addEventListener('click', () => {
      if (!expandable) return;
      open = !open;
      draw();
    });

    const row = {
      node,
      body: content,
      draw,
      get state() { return state; },
      setLabel(value) { text.textContent = value; },
      setDetail(value) {
        detail.textContent = value || '';
        detail.hidden = !value;
      },
      // A row with something to show opens to it; `open` says whether it starts open.
      enableBody(startOpen = true) {
        expandable = true;
        open = startOpen;
        draw();
      },
      setOpen(value) {
        open = Boolean(value);
        draw();
      },
      finish(next = 'done') {
        if (state !== 'running') return;
        state = next;
        finishedAt = Date.now();
        detail.hidden = true;
        draw();
      }
    };
    rows.push(row);
    draw();
    node.scrollIntoView?.({ block: 'nearest' });
    return row;
  }

  return {
    element: root,
    list,
    addRow,
    get rows() { return rows; },
    // The row in progress, if any.
    get current() { return [...rows].reverse().find((row) => row.state === 'running') || null; },
    // Folds the rows that are done, so the newest is the one open.
    foldFinished() { rows.filter((row) => row.state !== 'running').forEach((row) => row.setOpen(false)); },
    remove() {
      if (gone) return;
      gone = true;
      if (timer) window.clearInterval(timer);
      root.remove();
    }
  };
}
