// The card of the browser agent in the conversation (design: docs/superpowers/specs/2026-11-16-browser-agent-design.md, section 16).
// The card is the screen; a solid capsule at its lower edge says what is being done; the capsule turns the card over to the list of steps; two round
// buttons at the lower right shrink it to a pill and cancel the task. When the work is over it folds into a small tag, and the tag opens the card again.
// Until the live screen exists (phase 3) the screen is a quiet place holding the name of the site. The words say only the site, never what was clicked.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { createFocusMode } from '../browser-live/focus-mode.js';
import { createLiveView } from '../browser-live/live-view.js';
import { createPanelDock } from '../browser-live/panel-dock.js';
import { keepInPlace } from './keep-in-place.js';
import { cssRatio, DEFAULT_RATIO } from '../browser-live/ratios.js';
import { askWords, createAskPanel } from './browser-panels.js';

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M6 6l12 12M18 6L6 18',
  warn: 'M12 4l9 16H3zM12 10v4.5M12 17.2h.01',
  shrink: 'M4 14h6v6M20 10h-6V4',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9S14.4 18.4 12 21c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z'
};

const icon = (document, name, size = 16, width = 2) => {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(width));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
};

/**
 * `host`: where the card goes (right under the line of the steps of the reply). `onCancel`: the person cancelled the task (the reply is stopped).
 * `handle(event)` takes the `browser` events of the server; `complete()` says the reply is over.
 */
export function createBrowserCard({ document, host, language = 'zh-TW', onCancel = null, onAnswer = null, isWide = null, storage = null, fetchImpl = null }) {
  const t = (key, values) => sandboxText(language, key, values);
  // The steps: the same kind of step on the same site is one step that goes on, so thirty clicks are not thirty lines.
  const steps = [];
  let phase = 'run'; // run, queued, done, failed, cancelled
  let view = 'front'; // front, back, pill
  let queuedLabel = '';
  let domain = '';
  let dialog = null;
  // The live picture (phase 3): the source of it, what the person's buttons ask of the browser, and what is known of it (tabs, who has it, the ratio).
  let live = null;
  let liveView = null;
  let focus = null;
  let ratio = DEFAULT_RATIO;
  let control = 'model';
  let zoomed = false;
  // The card has no picture yet (the browser is starting, or the first frame has not come): it is drawn with the loading look.
  let waitingFrame = false;
  // The last picture of the live screen, kept on the card while the stream is looked for again (the stream is gone, the picture is not).
  let held = false;
  // Where the focus mode was opened from ('front': the card, 'pill': the pill): the round button of the focus mode is Shrink from the card and Expand from the pill.
  let focusFrom = 'front';
  // The question the person is asked now (a confirmation, a login…): its panel takes the place of the card.
  let asking = null;
  const watchers = [];
  // Who looks at the picture changes what it costs: the live connection is made only while the card shows it (or the focus mode is open).
  const notify = () => { const now = { phase, view, focus: Boolean(focus) }; watchers.forEach((fn) => fn(now)); };
  // A computer (1024 px and more) has the side panel, a phone the page of its own.
  const wide = () => (isWide ? isWide() : Boolean(document.defaultView?.matchMedia?.('(min-width: 1024px)')?.matches));
  const dock = createPanelDock({ document, storage });

  const make = (tag, className, attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
  };
  const button = (className, label, onClick, child) => {
    const node = make('button', className, { type: 'button', 'aria-label': label, title: label });
    if (child) node.append(child);
    node.addEventListener('click', onClick);
    return node;
  };

  const root = make('div', 'bcard');
  const card = make('div', 'bcard-card');
  const front = make('div', 'bcard-face bcard-front');
  const back = make('div', 'bcard-face bcard-back');
  const screen = make('div', 'bcard-screen');
  const screenSite = make('span', 'bcard-site');
  screen.append(icon(document, 'globe', 22, 1.6), screenSite);
  const capsule = make('button', 'bcard-capsule', { type: 'button', 'aria-label': t('browserProgress') });
  const capsuleLead = make('span', 'bcard-lead');
  const capsuleText = make('span', 'bcard-text', { 'aria-live': 'polite' });
  capsule.append(capsuleLead, capsuleText);
  const shrinkButton = button('bcard-round', t('browserShrink'), () => setView('pill'), icon(document, 'shrink', 20));
  const cancelButton = button('bcard-round', t('browserCancel'), () => askCancel(), icon(document, 'cross', 18));
  const buttons = make('span', 'bcard-buttons');
  buttons.append(shrinkButton, cancelButton);
  // The last picture of the browser, kept with a saved message: it takes the place of the screen when the tag is opened.
  const still = make('img', 'bcard-still', { alt: '' });
  still.hidden = true;
  front.append(still, screen, capsule, buttons);

  const backHead = make('div', 'bcard-back-head');
  const backTitle = make('span', '', {});
  backTitle.textContent = t('browserProgress');
  backHead.append(backTitle, button('bcard-back-close', t('browserBack'), () => setView('front'), icon(document, 'cross', 15)));
  const list = make('ul', 'bcard-steps');
  back.append(backHead, list);
  card.append(front, back);

  // The pill: the capsule alone (while the work goes on) or the tag it folds into (when it is over); a press opens the card again.
  const pill = make('button', 'bcard-pill', { type: 'button' });
  const pillLead = make('span', 'bcard-lead');
  const pillText = make('span', 'bcard-text');
  // Waiting in the line: the pill has its own cross inside (leave the line); the card comes when the browser is there.
  const pillCross = make('span', 'bcard-pill-cross', { role: 'button', tabindex: '0' });
  pillCross.append(icon(document, 'cross', 14));
  pill.append(pillLead, pillText, pillCross);
  pill.addEventListener('click', () => {
    if (phase === 'queued') return;
    // With a live picture the pill takes to the focus mode; without one (nothing to look at yet) it opens the card.
    if (live) openFocus();
    else setView('front');
  });
  const pillCrossAction = (event) => {
    event.stopPropagation();
    askCancel();
  };
  pillCross.addEventListener('click', pillCrossAction);
  pillCross.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') pillCrossAction(event); });
  capsule.addEventListener('click', () => setView('back'));
  const panelBox = make('div', 'bcard-panel');
  panelBox.hidden = true;
  root.append(card, pill, panelBox);
  host.append(root);

  const statusOf = () => (asking && phase === 'run' ? 'help' : phase === 'queued' ? 'run' : phase === 'cancelled' || phase === 'failed' ? 'fail' : phase);
  const leadFor = (state) => {
    const wrap = make('span', `bcard-icon is-${state}`);
    if (state === 'run') wrap.append(make('i', 'bcard-spin'));
    else wrap.append(icon(document, state === 'done' ? 'check' : state === 'help' ? 'warn' : 'cross', 14, 2.4));
    return wrap;
  };
  const labelNow = () => {
    if (phase === 'queued') return queuedLabel;
    if (asking && phase === 'run') return askWords(language, asking.kind).need;
    if (held && phase === 'run') return t('browserReconnecting');
    if (phase === 'done') return t('browserDone');
    if (phase === 'cancelled') return t('browserCancelled');
    if (phase === 'failed') return t('browserFailed');
    return steps.at(-1)?.label || t('browserCardLabel');
  };

  // What the row over the screen of the focus mode says: the same words, state and steps as the capsule of the card.
  const focusWords = () => ({ label: labelNow(), status: statusOf(), steps: steps.map((step) => ({ label: step.label, state: step.state })) });
  let shownView = null;
  const render = () => {
    // A change of the card (to its pill, back) keeps the card where it is on the screen.
    if (shownView !== null && shownView !== view && root.isConnected) keepInPlace(root, renderNow, { release: view !== 'pill' });
    else renderNow();
    shownView = view;
    notify();
  };
  const renderNow = () => {
    const status = statusOf();
    const label = labelNow();
    root.dataset.phase = phase;
    root.dataset.view = view;
    pillCross.hidden = phase !== 'queued';
    pillCross.setAttribute('aria-label', t('browserCancelQueue'));
    // A question (a confirmation, a password, a code, a card…) is shown under the card or the pill, which stay where they are.
    card.hidden = view === 'pill';
    pill.hidden = view !== 'pill';
    panelBox.hidden = !(asking && phase === 'run');
    // The card is turned over (or not): the face that is not seen does not take the focus.
    card.classList.toggle('is-flipped', view === 'back');
    front.inert = view === 'back';
    back.inert = view !== 'back';
    capsuleLead.replaceChildren(leadFor(status));
    capsuleText.textContent = label;
    pillLead.replaceChildren(leadFor(status));
    pillText.textContent = label;
    pill.classList.toggle('is-tag', phase === 'done' || phase === 'cancelled');
    pill.setAttribute('aria-label', label);
    const busy = waitingFrame || (!live && (phase === 'run' || phase === 'queued'));
    screen.classList.toggle('is-loading', busy);
    screenSite.textContent = waitingFrame ? t('browserLoading') : domain;
    // Once it is over there is no task to cancel: only the shrink button stays (and a queue can be left, but not shrunk).
    cancelButton.hidden = phase === 'done' || phase === 'failed' || phase === 'cancelled';
    list.replaceChildren(...steps.map((step) => {
      const row = make('li', `bcard-step is-${step.state}`);
      const tick = make('i', 'bcard-tick');
      if (step.state === 'done') tick.append(icon(document, 'check', 9, 3.2));
      else if (step.state === 'fail') tick.append(icon(document, 'cross', 9, 3.2));
      const text = make('span');
      text.textContent = step.label;
      row.append(tick, text);
      return row;
    }));
    // The last step is in view as the list grows.
    list.scrollTop = list.scrollHeight;
    focus?.update({ domain, ratio, control, zoomed, over: phase === 'done' || phase === 'failed' || phase === 'cancelled', ...focusWords(), origin: focusFrom });
  };

  // The pill and the card change into each other (a short grow or shrink); `data-anim` says which, and goes when it is over.
  let animTimer = null;
  const setView = (next) => {
    if (view === next) return;
    const motion = (view === 'pill' && next === 'front') ? 'grow' : (view === 'front' && next === 'pill') ? 'shrink' : '';
    view = next;
    clearTimeout(animTimer);
    if (motion) {
      root.dataset.anim = motion;
      animTimer = setTimeout(() => { delete root.dataset.anim; }, 400);
    } else {
      delete root.dataset.anim;
    }
    render();
  };

  const closeDialog = () => {
    dialog?.remove();
    dialog = null;
  };
  // Asking first: a small card in the middle, a light veil, no blur.
  const askCancel = () => {
    if (dialog) return;
    const veil = make('div', 'bcard-veil');
    const box = make('div', 'bcard-dialog', { role: 'alertdialog', 'aria-modal': 'true' });
    const ask = make('div', 'bcard-dialog-text');
    ask.textContent = t('browserCancelAsk');
    const body = make('div', 'bcard-dialog-body');
    body.textContent = t('browserCancelBody');
    const keep = make('button', 'bcard-dialog-button', { type: 'button' });
    keep.textContent = t('browserCancelNo');
    const yes = make('button', 'bcard-dialog-button is-danger', { type: 'button' });
    yes.textContent = t('browserCancelYes');
    const row = make('div', 'bcard-dialog-row');
    row.append(keep, yes);
    box.append(ask, body, row);
    veil.append(box);
    keep.addEventListener('click', closeDialog);
    veil.addEventListener('click', (event) => { if (event.target === veil) closeDialog(); });
    yes.addEventListener('click', () => {
      closeDialog();
      cancel();
    });
    document.addEventListener('keydown', function onKey(event) {
      if (event.key !== 'Escape') return;
      document.removeEventListener('keydown', onKey);
      closeDialog();
    });
    dialog = veil;
    document.body.append(veil);
    keep.focus?.();
  };

  const cancel = () => {
    if (phase === 'done' || phase === 'failed' || phase === 'cancelled') return;
    steps.forEach((step) => { if (step.state === 'run') step.state = 'fail'; });
    closeAsk();
    phase = 'cancelled';
    view = 'pill';
    closeFocus();
    render();
    try {
      onCancel?.();
    } catch {
      // The reply stops by its own stop button as well.
    }
  };

  const finishRunning = (state) => steps.forEach((step) => { if (step.state === 'run') step.state = state; });

  // The work is over: the card folds into its tag. A second look is one press away.
  const closeAsk = () => {
    asking?.panel?.destroy();
    asking = null;
    panelBox.replaceChildren();
  };

  const over = (next) => {
    closeAsk();
    held = false;
    still.classList.remove('is-stale');
    phase = next;
    if (next === 'done') view = 'pill';
    render();
  };

  // The answer of the person goes to the server; when it does not get there (or the reply is not running any more, e.g. the server was just updated), the panel
  // is made again with a line that says so, instead of staying locked for ever.
  const showAsk = (event, note = '') => {
    const panel = createAskPanel({ document, language, ask: event, onAnswer: (id, payload) => answerAsk(event, id, payload), helpers: { fetch: fetchImpl, takeOver: () => { openFocus(); focus?.update({ control: 'user' }); focusController().onTakeOver(); } } });
    if (!panel) return false;
    asking?.panel?.destroy();
    asking = { id: event.id, kind: event.kind, panel };
    panelBox.replaceChildren(panel.element);
    if (note) { const line = make('div', 'bpanel-error'); line.setAttribute('role', 'alert'); line.textContent = note; panel.element.append(line); }
    return true;
  };
  const answerAsk = (event, id, payload) => {
    let result;
    try { result = onAnswer?.(id, payload); } catch { result = null; }
    if (!result || typeof result.then !== 'function') return;
    const failed = (note) => { if (asking && asking.id === event.id && phase === 'run') { showAsk(event, note); render(); } };
    result.then((res) => {
      if (res?.ok === false) failed(t(res.status === 404 ? 'browserAnswerGone' : 'browserAnswerFailed'));
      else if (res?.data?.answered === false) failed(t('browserAnswerGone'));
    }, () => failed(t('browserAnswerFailed')));
  };

  const handle = (event) => {
    if (phase === 'cancelled') return;
    if (event?.event === 'ask') {
      closeAsk();
      if (phase === 'queued') phase = 'run';
      if (!showAsk(event)) return;
      if (view === 'back') view = 'front';
      render();
      asking.panel.focus?.();
      return;
    }
    if (event?.event === 'answer') {
      if (asking && asking.id === event.id) { closeAsk(); render(); }
      return;
    }
    if (event?.event === 'queued') {
      phase = 'queued';
      view = 'pill';
      queuedLabel = event.label || '';
      render();
      return;
    }
    if (event?.event === 'failed') {
      finishRunning('fail');
      over('failed');
      return;
    }
    if (event?.event !== 'call') return;
    if (phase === 'queued') {
      phase = 'run';
      view = 'front';
    }
    if (event.domain) domain = event.domain;
    if (event.action === 'close') {
      finishRunning('done');
      steps.push({ key: 'close', label: event.label, state: 'done' });
      over('done');
      return;
    }
    const key = `${event.action === 'open' ? 'open' : 'act'}:${event.domain || ''}`;
    const last = steps.at(-1);
    if (event.action !== 'open' && last?.key === key) {
      last.state = 'run';
    } else {
      finishRunning('done');
      steps.push({ key, label: event.label, state: 'run' });
    }
    render();
  };

  // The reply is over (the browser may not have been closed by the model): what ran is done.
  const complete = () => {
    if (phase !== 'run' && phase !== 'queued') return;
    finishRunning('done');
    over('done');
  };

  // What the person's buttons in the focus mode ask: the card answers what is its own, the rest goes to the owner of the live picture.
  const closeFocus = () => {
    focus?.destroy();
    focus = null;
    zoomed = false;
    dock.close();
    notify();
  };
  const focusController = () => {
    const own = {
      // Back to where it was opened from: a card stays a card, a pill stays a pill (the view is not touched while the focus mode is open).
      onClose: () => { closeFocus(); },
      onExpand: () => { closeFocus(); setView('front'); },
      // Opened from the card: Shrink leaves the focus mode and the card becomes the pill.
      onShrink: () => { closeFocus(); setView('pill'); },
      onZoom: (value) => { zoomed = Boolean(value); dock.setZoom(zoomed); focus?.update({ zoomed }); live?.controller?.onZoom?.(zoomed); },
      onStop: () => askCancel(),
      onTakeOver: () => { control = 'user'; render(); live?.controller?.onTakeOver?.(); },
      onGiveBack: () => { control = 'model'; render(); live?.controller?.onGiveBack?.(); if (asking?.kind === 'takeover') asking.panel.finish?.('done'); },
      onRatio: (key) => { setRatio(key); live?.controller?.onRatio?.(key); }
    };
    // Whatever the card does not answer itself goes to the owner of the live picture (looked up when it is asked, so a later owner is the one).
    return new Proxy(own, { get: (target, name) => (name in target ? target[name] : live?.controller?.[name]) });
  };
  const openFocus = () => {
    if (!live || focus) return;
    focusFrom = view === 'pill' ? 'pill' : 'front';
    const panel = wide();
    if (panel) dock.open({ zoomed });
    focus = createFocusMode({ document, language, layout: panel ? 'panel' : 'phone', source: live.source, state: { domain, url: live.url || '', tabs: live.tabs || [], ratio, control, zoomed, over: phase === 'done' || phase === 'failed' || phase === 'cancelled', ...focusWords(), origin: focusFrom }, controller: focusController(), readClipboard: live.readClipboard || null });
    if (panel) dock.mountHandle(focus.element, sandboxText(language, 'browserResize'));
    notify();
  };
  const setRatio = (key) => {
    ratio = key;
    card.style.aspectRatio = live ? cssRatio(ratio) : '';
    liveView?.setRatio(ratio);
    render();
  };
  const mountLive = () => {
    liveView?.destroy();
    liveView = null;
    if (!live) {
      waitingFrame = false;
      screen.hidden = held;
      if (!held) card.style.aspectRatio = '';
      return;
    }
    liveView = createLiveView({ document, host: front, ratio, source: live.source });
    liveView.element.classList.add('bcard-live');
    liveView.element.style.aspectRatio = '';
    liveView.element.addEventListener('click', () => { if (view === 'front') openFocus(); });
    front.prepend(liveView.element);
    card.style.aspectRatio = cssRatio(ratio);
    // Until the first picture arrives the card says it is loading (a black card for seconds looks broken); the live picture takes its place with the first frame.
    const video = liveView.element.querySelector('video');
    if (video && video.readyState < 2) {
      screen.hidden = held;
      waitingFrame = !held;
      const ready = () => { waitingFrame = false; screen.hidden = true; if (held) { held = false; still.hidden = true; still.classList.remove('is-stale'); } render(); };
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('playing', ready, { once: true });
    } else {
      waitingFrame = false;
      screen.hidden = true;
    }
  };

  render();
  return {
    handle,
    /** `fn({ phase, view, focus })` after every change of what the card shows; also once at once. */
    watch(fn) { watchers.push(fn); fn({ phase, view, focus: Boolean(focus) }); },
    complete,
    cancel,
    /** The last picture (a data address of a JPEG) is the screen of the card; the card has the shape of the picture. */
    setStill(url) {
      if (typeof url !== 'string' || !url) return;
      still.addEventListener('load', () => { if (still.naturalWidth > 0 && still.naturalHeight > 0) card.style.aspectRatio = `${still.naturalWidth} / ${still.naturalHeight}`; }, { once: true });
      still.src = url;
      still.hidden = false;
      screen.hidden = true;
    },
    /** The picture the live screen shows now, as a small JPEG (a data address), or '' when there is none (nothing is playing yet, or the picture cannot be read). */
    captureFrame() {
      const video = liveView?.element?.querySelector?.('video');
      if (!video || !(video.videoWidth > 0) || video.readyState < 2) return '';
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.6);
        return /^data:image\/jpeg;base64,/.test(url) ? url : '';
      } catch {
        return '';
      }
    },
    /** How far the live picture has played (seconds), or -1: a picture that does not move any more while the page is in front has lost its stream. */
    playhead() {
      const video = liveView?.element?.querySelector?.('video');
      return video ? Number(video.currentTime) || 0 : -1;
    },
    /** The stream is gone and is looked for again: this picture stays on the card (instead of the loading screen) until the new stream's first picture comes. */
    holdFrame(url) {
      if (typeof url !== 'string' || !url) return;
      held = true;
      card.style.aspectRatio = cssRatio(ratio);
      still.src = url;
      still.classList.add('is-stale');
      still.hidden = false;
      screen.hidden = true;
      render();
    },
    /** Folds the card into its pill or tag (a saved message draws it so). */
    fold() { setView('pill'); },
    /** The live picture is there (or gone: null). `live`: { source, controller, tabs, ratio, readClipboard }. */
    setLive(next) {
      live = next || null;
      if (live?.ratio) ratio = live.ratio;
      if (!live) closeFocus();
      mountLive();
      render();
    },
    /** The tabs or who has the browser changed (the parts that are given). */
    liveState(next = {}) {
      if (live && next.tabs) live.tabs = next.tabs;
      if (live && typeof next.url === 'string') live.url = next.url;
      if (next.control) control = next.control;
      focus?.update({ ...(next.tabs ? { tabs: next.tabs } : {}), ...(typeof next.url === 'string' ? { url: next.url } : {}), control });
      render();
    },
    /** The circle goes to a point of the screen (0 to 1), the model's or the person's. */
    moveCursor(x, y, who) {
      liveView?.moveCursor(x, y, who);
      focus?.view.moveCursor(x, y, who);
    },
    openFocus,
    closeFocus,
    get element() { return root; },
    get focus() { return focus; },
    get ratio() { return ratio; },
    get zoomed() { return zoomed; },
    get phase() { return phase; },
    get view() { return view; },
    remove() {
      clearTimeout(animTimer);
      closeDialog();
      closeFocus();
      liveView?.destroy();
      root.remove();
    }
  };
}
