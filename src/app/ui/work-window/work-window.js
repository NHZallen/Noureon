// A small window above the composer that shows what the AI is doing while it
// works in the background (the visual check of a deck, Python runs): a title
// with the current step and a timer, the phases it goes through, a body the
// caller fills with what is really happening, and a stop button. It can be
// folded to its title. Black and white, like the rest of the app.

const PIXELS_FOLD = 640;

const element = (document, name, className, text) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const clock = (milliseconds) => {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * `anchor` is the composer's container (the window sits above it); without
 * one the window is fixed to the bottom of the page. `texts` gives the words
 * of the buttons: { stop, fold, unfold }. `phases` is [{ key, label }]. Without
 * `showStop` the window has no stop button (something else stops the work).
 */
export function createWorkWindow({ document, anchor = null, controller, texts, phases = [], startFolded = null, showStop = true }) {
  const window = document.defaultView;
  const root = element(document, 'div', 'work-window');
  const bar = element(document, 'div', 'work-window-bar');
  const spinner = element(document, 'span', 'work-window-spinner');
  const title = element(document, 'span', 'work-window-title');
  title.setAttribute('role', 'status');
  title.setAttribute('aria-live', 'polite');
  const timer = element(document, 'span', 'work-window-timer', '0:00');
  const foldButton = element(document, 'button', 'work-window-button');
  foldButton.type = 'button';
  const stopButton = element(document, 'button', 'work-window-button work-window-stop', texts.stop);
  stopButton.type = 'button';
  bar.append(spinner, title, timer, foldButton);
  if (showStop) bar.append(stopButton);

  const meter = element(document, 'div', 'work-window-meter');
  const meterFill = element(document, 'div', 'work-window-meter-fill');
  meter.append(meterFill);

  const body = element(document, 'div', 'work-window-body');
  const phaseList = element(document, 'ol', 'work-window-phases');
  phaseList.hidden = phases.length === 0;
  const phaseNodes = new Map();
  for (const phase of phases) {
    const item = element(document, 'li', 'work-window-phase', phase.label);
    phaseList.append(item);
    phaseNodes.set(phase.key, item);
  }
  const content = element(document, 'div', 'work-window-content');
  body.append(phaseList, content);
  root.append(bar, meter, body);

  let folded = startFolded ?? Boolean(window?.matchMedia?.(`(max-width: ${PIXELS_FOLD}px)`)?.matches);
  const drawFold = () => {
    root.classList.toggle('is-folded', folded);
    foldButton.textContent = folded ? '+' : '–';
    const label = folded ? texts.unfold : texts.fold;
    foldButton.setAttribute('aria-label', label);
    foldButton.title = label;
    foldButton.setAttribute('aria-expanded', String(!folded));
  };
  foldButton.addEventListener('click', () => {
    folded = !folded;
    drawFold();
  });
  drawFold();

  const startedAt = Date.now();
  const tick = window?.setInterval?.(() => { timer.textContent = clock(Date.now() - startedAt); }, 1000);

  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    if (tick) window.clearInterval(tick);
    controller?.signal?.removeEventListener('abort', remove);
    root.remove();
    holder?.remove();
  };
  stopButton.addEventListener('click', () => controller?.abort());
  controller?.signal?.addEventListener('abort', remove, { once: true });

  // Above the composer when there is one, else fixed to the page.
  let holder = null;
  if (anchor) {
    holder = element(document, 'div', 'work-window-anchor');
    holder.append(root);
    anchor.append(holder);
  } else {
    root.classList.add('is-floating');
    document.body.append(root);
  }

  return {
    body: content,
    setTitle(text) { title.textContent = text; },
    // The phase in progress; those before it are done.
    setPhase(key) {
      let before = true;
      for (const [name, node] of phaseNodes) {
        const active = name === key;
        node.classList.toggle('is-active', active);
        node.classList.toggle('is-done', before && !active);
        if (active) before = false;
      }
    },
    // 0 to 1, or null for none (the bar is what stays visible when folded).
    setProgress(fraction) {
      meter.hidden = fraction === null;
      meterFill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction ?? 0)) * 100)}%`;
    },
    remove
  };
}
