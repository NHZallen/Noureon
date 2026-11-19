// The card of the browser agent in the conversation (design: docs/superpowers/specs/2026-11-16-browser-agent-design.md, section 16).
// The card is the screen; a solid capsule at its lower edge says what is being done; the capsule turns the card over to the list of steps; two round
// buttons at the lower right shrink it to a pill and cancel the task. When the work is over it folds into a small tag, and the tag opens the card again.
// Until the live screen exists (phase 3) the screen is a quiet place holding the name of the site. The words say only the site, never what was clicked.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { createFocusMode } from '../browser-live/focus-mode.js';
import { createLiveView } from '../browser-live/live-view.js';
import { createPanelDock } from '../browser-live/panel-dock.js';
import { keepInPlace } from './keep-in-place.js';
import { measureCard, playMorph } from './card-morph.js';
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
 * `host`: where the card goes (right under the line of the steps of the reply). `onCancel`: the person pressed the cross (the browser is ended; the reply goes on).
 * `handle(event)` takes the `browser` events of the server; `complete()` says the reply is over.
 */
// How long the capsule keeps each of its two sentences once the time of the task is nearly up (half of about fifteen seconds).
const NOTICE_TURN_MS = 7500;

export function createBrowserCard({ document, host, language = 'zh-TW', onCancel = null, onAnswer = null, isWide = null, storage = null, fetchImpl = null, enter = false, restoring = false }) {
  const t = (key, values) => sandboxText(language, key, values);
  // The steps: the same kind of step on the same site is one step that goes on, so thirty clicks are not thirty lines.
  const steps = [];
  // The work list the model wrote for this reply (the server keeps its rules: a done task never changes); it takes the place of the steps in the list when there is one.
  let plan = null;
  // What the person added while the work went on (the reply is not cut for it): lines at the end of the list.
  const notes = [];
  let phase = 'run'; // run, queued, done, failed, cancelled
  let view = 'front'; // front, back, pill
  let queuedLabel = '';
  let domain = '';
  let dialog = null;
  // The live picture (phase 3): the source of it, what the person's buttons ask of the browser, and what is known of it (tabs, who has it, the ratio).
  let live = null;
  // Joined to the screen of the browser before the model used it: the card stays out of sight until the server says something about the work (`prepare`).
  let quiet = false;
  let liveView = null;
  let focus = null;
  let ratio = DEFAULT_RATIO;
  let control = 'model';
  let eyeOpen = false;
  // The last picture kept on the screen while the stream comes back (an object address), and the way it goes.
  let frozenUrl = '';
  let frozenOn = false;
  const thawPicture = () => {
    [liveView, focus?.view].forEach((entry) => entry?.thaw?.());
    if (frozenUrl) { try { document.defaultView?.URL?.revokeObjectURL?.(frozenUrl); } catch { /* nothing to let go */ } }
    frozenUrl = '';
    frozenOn = false;
  };
  const thawWhenDrawn = () => {
    const videos = [liveView, focus?.view].map((entry) => entry?.element?.querySelector?.('video')).filter(Boolean);
    if (!videos.length) { thawPicture(); return; }
    let done = false;
    const go = () => { if (done) return; done = true; thawPicture(); };
    // The kept picture goes when a new frame has really been drawn (a stream takes some seconds to bring its first frame: nothing black in between); the long wait is only for a stream that never comes.
    const drawn = (video) => { if (video.videoWidth > 0 && typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(go); else if (video.videoWidth > 0) go(); };
    for (const video of videos) {
      if (video.videoWidth > 0 && video.readyState >= 2) drawn(video);
      for (const name of ['playing', 'loadeddata', 'resize']) video.addEventListener?.(name, () => drawn(video), { once: true });
    }
    setTimeout(go, 12_000);
  };
  // The focus mode was open with the browser in the person's hands when the picture was lost: it opens again with the new picture (and whether the eye was open).
  let reopenFocus = false;
  let eyeWas = false;
  let zoomed = false;
  // The card has no picture yet (the browser is starting, or the first frame has not come): it is drawn with the loading look.
  let waitingFrame = false;
  // The picture was there once: when it is not there any more, the card is looking for it again (it is not starting the browser).
  let everLive = false;
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
  // The notice that the time of the task is nearly up: on the capsule for a while, and kept in the list.
  // From fifteen minutes before the end of the task the capsule says what is being done and how much time is left, by turns (about fifteen seconds for both).
  let timeNotice = '';
  let noticeTurn = false;
  let noticeTimer = null;
  const stopNotice = () => { if (noticeTimer) { clearInterval(noticeTimer); noticeTimer = null; } noticeTurn = false; };
  // The words of the failure when the server has its own (the browser was closed for sitting idle, the time of the task ran out).
  let failedLabel = '';
  const labelNow = () => {
    if (phase === 'queued') return queuedLabel;
    if (asking && phase === 'run') return askWords(language, asking.kind).need;
    if (phase === 'done') return t('browserDone');
    if (phase === 'cancelled') return t(endReason === 'time' ? 'browserTimeUp' : 'browserCancelled');
    if (phase === 'failed') return failedLabel || t('browserFailed');
    if (timeNotice && noticeTurn) return timeNotice;
    return steps.at(-1)?.label || t('browserCardLabel');
  };

  // What the row over the screen of the focus mode says: the same words, state and steps as the capsule of the card.
  const focusWords = () => ({ label: labelNow(), status: statusOf(), steps: steps.map((step) => ({ label: step.label, state: step.state })) });
  let shownView = null;
  // `morphs`: the change is played as a morph (card-morph.js), where the height of the whole changes a little at a time, and the page follows it by itself (at the end of a page, the
  // bottom stays and the top comes down): keeping the card in place by force would hold the room back and give it up at the end in one jump.
  // A card made again from a saved message (browser-tag.js) is built in its final shape, in one go: no fold, no keeping in place, while `restoring` (until `restored()`), even though it is already on the page.
  let restoringNow = restoring;
  const placed = () => !restoringNow && root.isConnected;
  const render = ({ morphs = false } = {}) => {
    // Any other change of the card keeps the card where it is on the screen.
    if (!morphs && shownView !== null && shownView !== view && placed()) keepInPlace(root, renderNow, { release: view !== 'pill' });
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
    // What the card is waiting for: the browser itself to start (nothing is connected yet), then the picture to come (the screen is being connected).
    screenSite.textContent = waitingFrame ? t('browserLoading') : (!live && phase === 'run') ? t(everLive ? 'browserLoading' : 'browserStarting') : domain;
    // Once it is over there is no task to cancel: only the shrink button stays (and a queue can be left, but not shrunk).
    cancelButton.hidden = phase === 'done' || phase === 'failed' || phase === 'cancelled';
    list.replaceChildren(...[...(plan || steps), ...notes].map((step) => {
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

  // The pill and the card turn into each other as one thing (card-morph.js): `data-morph` says which way while it goes.
  const morph = (direction, before) => {
    root.dataset.morph = direction;
    void playMorph({ direction, before, root, card, pill }).then(() => { if (root.dataset.morph === direction) delete root.dataset.morph; });
  };
  const setView = (next) => {
    if (view === next) return;
    const direction = (view === 'pill' && next === 'front') ? 'open' : (view === 'front' && next === 'pill') ? 'fold' : '';
    const before = direction && placed() ? measureCard({ root, card, pill }) : null;
    view = next;
    render({ morphs: Boolean(before) });
    if (before) morph(direction, before);
  };
  // The card finishes into its pill (done, stopped): the same fold as when the person folds it.
  const foldInto = (apply) => {
    const before = (view === 'front' || view === 'back') && placed() ? measureCard({ root, card, pill }) : null;
    apply();
    render({ morphs: Boolean(before) });
    if (before) morph('fold', before);
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

  let endReason = '';
  const cancel = ({ silent = false, reason = '' } = {}) => {
    if (phase === 'done' || phase === 'failed' || phase === 'cancelled') return;
    endReason = reason;
    steps.forEach((step) => { if (step.state === 'run') step.state = 'fail'; });
    closePlan('fail');
    foldInto(() => {
      closeAsk();
      phase = 'cancelled';
      view = 'pill';
      closeFocus();
    });
    if (silent) return;
    try {
      onCancel?.();
    } catch {
      // The reply stops by its own stop button as well.
    }
  };

  const finishRunning = (state) => steps.forEach((step) => { if (step.state === 'run') step.state = state; });
  // The reply is over: the task in hand is done (or stopped, when the work was); what was never begun stays as it is.
  const closePlan = (state) => plan?.forEach((task) => { if (task.state === 'run') task.state = state; });

  // The work is over: the card folds into its tag. A second look is one press away.
  const closeAsk = () => {
    asking?.panel?.destroy();
    asking = null;
    panelBox.replaceChildren();
  };

  const over = (next) => {
    closeAsk();
    if (next === 'done') foldInto(() => { phase = next; view = 'pill'; });
    else { phase = next; render(); }
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

  // The circle of the model: it appears where the model clicked or typed (the host says where), slides there and shrinks a little on a click, and goes when it has not moved for three seconds. While the person holds the
  // browser only their circle is on the screen; when they give it back, theirs goes and the model's comes again with its next step.
  // The model's circle goes when it has not moved for three seconds (Allen, 2026-11-19; the next click or typing brings it back where it works).
  const MODEL_CIRCLE_IDLE_MS = 3000;
  let modelCircleTimer = null;
  let pulseTimer = null;
  const circleViews = () => [liveView, focus?.view].filter((entry) => entry?.lensMounted);
  const hideModelCircle = () => { clearTimeout(modelCircleTimer); clearTimeout(pulseTimer); circleViews().forEach((entry) => entry.hideCursor('model')); };
  const showModelPoint = (event) => {
    if (control === 'user' || !(event.x >= 0 && event.x <= 1 && event.y >= 0 && event.y <= 1)) return;
    // Not drawn on frames of the old shape of the screen (a ratio was just switched): the next click shows it.
    const views = circleViews().filter((entry) => entry.pictureReady());
    if (!views.length) return;
    views.forEach((entry) => entry.moveCursor(event.x, event.y, 'model', { glide: true }));
    clearTimeout(pulseTimer);
    if (event.action === 'click') pulseTimer = setTimeout(() => circleViews().forEach((entry) => entry.pulse()), 300);
    clearTimeout(modelCircleTimer);
    modelCircleTimer = setTimeout(hideModelCircle, MODEL_CIRCLE_IDLE_MS);
  };

  const handle = (event) => {
    if (phase === 'cancelled') return;
    if (event?.event === 'point') { showModelPoint(event); return; }
    // The model looks at the page: the browser puts the dots back before every look of the model, so the eye is closed here too (the label and the screen say the same).
    if (event?.event === 'call' && eyeOpen) { eyeOpen = false; focus?.update({ reveal: false }); live?.controller?.onReveal?.(false); }
    // The first thing the server says about the work shows the card (it was joined to the screen out of sight, `prepare`).
    if (quiet) { quiet = false; root.hidden = false; }
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
    if (event?.event === 'steer') {
      const text = String(event.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (text && notes.length < 20) notes.push({ label: t('browserSteered', { text }), state: 'note' });
      render();
      return;
    }
    if (event?.event === 'plan') {
      plan = (Array.isArray(event.tasks) ? event.tasks : []).filter((task) => task?.text).slice(0, 12).map((task) => ({ label: String(task.text), state: task.status === 'doing' ? 'run' : task.status === 'done' ? 'done' : 'todo' }));
      if (!plan.length) plan = null;
      render();
      return;
    }
    // The browser was ended by the person (on this page or another one that watches the reply): the card is stopped, the reply goes on without telling the server again.
    if (event?.event === 'ended') {
      cancel({ silent: true });
      return;
    }
    // Fifteen minutes are left of the time of one task (the browser closes then): said on the capsule for a while and kept in the list.
    if (event?.event === 'timeleft') {
      const minutes = Math.max(1, Math.round(Number(event.minutes) || 15));
      const words = t('browserTimeLeft', { minutes });
      if (notes.length < 20) notes.push({ label: words, state: 'note' });
      timeNotice = words;
      noticeTurn = true;
      if (!noticeTimer) {
        noticeTimer = setInterval(() => {
          if (phase !== 'run') { stopNotice(); render(); return; }
          noticeTurn = !noticeTurn;
          render();
        }, NOTICE_TURN_MS);
        noticeTimer.unref?.();
      }
      render();
      return;
    }
    // The time of the task is up: the host closes the browser, and the card is the tag "Closed (time is up)".
    if (event?.event === 'timeup') {
      cancel({ silent: true, reason: 'time' });
      return;
    }
    if (event?.event === 'failed') {
      failedLabel = typeof event.label === 'string' && event.label.length <= 80 ? event.label : '';
      finishRunning('fail');
      closePlan('fail');
      over('failed');
      return;
    }
    if (event?.event !== 'call') return;
    if (phase === 'queued') {
      phase = 'run';
      view = 'front';
    }
    // The browser was lost and the model opened another one (or went on): the card works again, with a picture to be connected afresh.
    if (phase === 'failed') {
      phase = 'run';
      failedLabel = '';
      view = 'front';
      live = null;
      everLive = false;
      closeFocus();
      mountLive();
    }
    if (event.domain) domain = event.domain;
    if (event.action === 'close') {
      finishRunning('done');
      closePlan('done');
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
    // A list was written but the browser never came into use (or was only joined out of sight): there is nothing to show, and the screen is let go.
    if (!steps.length && (!live || quiet)) { phase = 'done'; root.hidden = true; quiet = false; notify(); return; }
    finishRunning('done');
    closePlan('done');
    over('done');
  };

  // What the person's buttons in the focus mode ask: the card answers what is its own, the rest goes to the owner of the live picture.
  const closeFocus = () => {
    // The screen is put away: what was shown as typed is dots again (the eye is the focus mode's).
    if (eyeOpen) { eyeOpen = false; live?.controller?.onReveal?.(false); }
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
      // The picture goes to the box of the message; the focus mode is left for the preview, so that the person can write something (or pick a tool) and send it.
      onScreenshot: async () => {
        const done = await live?.controller?.onScreenshot?.();
        if (done === false) return;
        closeFocus();
        if (view !== 'front') setView('front');
      },
      onStop: () => askCancel(),
      onTakeOver: () => { control = 'user'; hideModelCircle(); render(); live?.controller?.onTakeOver?.(); },
      onGiveBack: () => { control = 'model'; reopenFocus = false; circleViews().forEach((entry) => entry.hideCursor('user')); render(); live?.controller?.onGiveBack?.(); if (asking?.kind === 'takeover') asking.panel.finish?.('done'); },
      onRatio: (key) => { setRatio(key); live?.controller?.onRatio?.(key); }
    };
    // Whatever the card does not answer itself goes to the owner of the live picture (looked up when it is asked, so a later owner is the one).
    return new Proxy(own, { get: (target, name) => (name in target ? target[name] : live?.controller?.[name]) });
  };
  const openFocus = () => {
    if (!live || focus) return;
    focusFrom = view === 'pill' ? 'pill' : 'front';
    const panel = wide();
    // On a computer the screen opens big every time (a small side panel is as good as none); the person can make it smaller, and it is big again the next time.
    if (panel) zoomed = true;
    if (panel) dock.open({ zoomed });
    focus = createFocusMode({ document, language, layout: panel ? 'panel' : 'phone', source: live.source, state: { domain, url: live.url || '', ratio, control, zoomed, over: phase === 'done' || phase === 'failed' || phase === 'cancelled', ...focusWords(), origin: focusFrom }, controller: focusController(), readClipboard: live.readClipboard || null });
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
      screen.hidden = false;
      card.style.aspectRatio = '';
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
      screen.hidden = false;
      screen.classList.remove('is-fading');
      waitingFrame = true;
      // The loading look fades away when the first picture has really been drawn (not at the first sign of data: a black frame showed in between).
      let revealing = false;
      const reveal = () => {
        if (revealing || !waitingFrame || liveView?.element?.querySelector('video') !== video) return;
        revealing = true;
        screen.classList.add('is-fading');
        setTimeout(() => {
          if (liveView?.element?.querySelector('video') !== video) return;
          waitingFrame = false; screen.hidden = true; screen.classList.remove('is-fading');
          render();
        }, 260);
      };
      const ready = () => { if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(reveal); else reveal(); };
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('playing', ready, { once: true });
    } else {
      waitingFrame = false;
      screen.hidden = true;
    }
  };

  render();
  // A card that comes into the conversation while the work goes on rises and fades in (it was one frame from nothing to a card).
  if (enter) { root.dataset.enter = '1'; setTimeout(() => { delete root.dataset.enter; }, 450); }
  return {
    handle,
    /** `fn({ phase, view, focus })` after every change of what the card shows; also once at once. */
    watch(fn) { watchers.push(fn); fn({ phase, view, focus: Boolean(focus) }); },
    /** The card is taken off the page (the page joined the reply again and draws it afresh, or the reply is over): what it holds of the live screen is let go, so that the next card can have it. */
    dispose() {
      stopNotice();
      closeFocus();
      watchers.forEach((fn) => fn({ phase: 'disposed', view: 'pill', focus: false }));
      watchers.length = 0;
    },
    complete,
    cancel,
    /** The card is made and joined to the live screen out of sight; the first event of the work shows it. */
    prepare() { if (!steps.length && phase === 'run') { quiet = true; root.hidden = true; } },
    /** The last picture (a data address of a JPEG) is the screen of the card; the card has the shape of the picture. */
    setStill(url) {
      if (typeof url !== 'string' || !url) return;
      still.addEventListener('load', () => { if (still.naturalWidth > 0 && still.naturalHeight > 0) card.style.aspectRatio = `${still.naturalWidth} / ${still.naturalHeight}`; }, { once: true });
      still.src = url;
      still.hidden = false;
      screen.hidden = true;
    },
    /** How far the live picture has played (seconds), or -1: a picture that does not move any more while the page is in front has lost its stream. */
    playhead() {
      const video = liveView?.element?.querySelector?.('video');
      return video ? Number(video.currentTime) || 0 : -1;
    },
    /** Folds the card into its pill or tag (a saved message draws it so). */
    fold() { setView('pill'); },
    /** The card made from a saved message is complete: from now on it moves as any card does. */
    restored() { restoringNow = false; },
    /** The live picture is there (or gone: null). `live`: { source, controller, tabs, ratio, readClipboard }. */
    /**
     * The stream was lost while the person holds the browser: the last picture (a Blob) stays on the screen, with "Reconnecting…", and the focus mode stays open; the new stream takes its
     * place when it comes (`setLive`), so there is nothing to wait for and nothing to take over again.
     */
    freezePicture(blob) {
      thawPicture();
      frozenOn = true;
      const view = document.defaultView;
      try { if (blob && view?.URL?.createObjectURL) frozenUrl = view.URL.createObjectURL(blob); } catch { frozenUrl = ''; }
      [liveView, focus?.view].forEach((entry) => entry?.freeze?.(frozenUrl, t('browserReconnecting')));
    },
    setLive(next) {
      live = next || null;
      if (live) everLive = true;
      if (live?.ratio) ratio = live.ratio;
      if (!live) thawPicture();
      if (!live) {
        // The picture was lost while the person held the browser (a stream that dropped): the focus mode goes with it, and comes back with the picture, so that they do not have to take over again.
        if (focus && control === 'user') { reopenFocus = true; eyeWas = eyeOpen; }
        closeFocus();
      }
      mountLive();
      // A new stream while the last picture is kept: the focus mode that stayed open gets it, and the kept picture goes when the first frame of the new one is drawn.
      if (live && focus) focus.view.setSource(live.source);
      if (live && frozenOn) thawWhenDrawn();
      render();
      if (live && reopenFocus) {
        reopenFocus = false;
        const eye = eyeWas;
        eyeWas = false;
        if (control === 'user' && phase === 'run') {
          // What was shown as typed is dots again (the picture is a new one, and the browser must hear it too).
          if (eye) live.controller?.onReveal?.(false);
          openFocus();
          focus?.update({ control });
        }
      }
    },
    /** The tabs or who has the browser changed (the parts that are given). */
    liveState(next = {}) {
            if (live && typeof next.url === 'string') live.url = next.url;
      if (next.control && next.control !== control) {
        // Who holds the browser changed: the circle of the one who let go is hidden.
        if (next.control === 'user') hideModelCircle(); else circleViews().forEach((entry) => entry.hideCursor('user'));
      }
      if (next.control) control = next.control;
      if ('reveal' in next) eyeOpen = Boolean(next.reveal);
      if (control !== 'user') eyeOpen = false;
      focus?.update({ ...(typeof next.url === 'string' ? { url: next.url } : {}), control, ...('reveal' in next || control !== 'user' ? { reveal: eyeOpen } : {}) });
      render();
    },
    /** The circle goes to a point of the screen (0 to 1), the model's or the person's. */
    moveCursor(x, y, who) {
      if (who === 'user') hideModelCircle();
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
    /** Who holds the browser: 'model' or 'user'. */
    get control() { return control; },
    get view() { return view; },
    remove() {
      clearTimeout(modelCircleTimer);
      clearTimeout(pulseTimer);
      closeDialog();
      closeFocus();
      liveView?.destroy();
      root.remove();
    }
  };
}
