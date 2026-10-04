// The card of a deep research in the chat (docs/superpowers/specs/2026-10-04-deep-research-design.md, §3): the plan with its countdown while the
// person may change it, the progress while the server researches (with pause and stop), and the report when it is done. It is drawn from the
// store (runtime/research/research-store.js), which the live channel and the message both feed, so every page shows the same.

import { formatResearchTime, researchText } from '../../runtime/research/research-texts.js';
import { getResearchMode } from '../../runtime/research/research-bridge.js';
import { adoptMessage, getResearch, serverNow, subscribeResearch } from '../../runtime/research/research-store.js';
import { activityLine } from './research-render.js';
import { getFileMarkdownRenderer } from '../files/file-markdown-cards.js';

const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

const DOC_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';
const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
const EXPAND_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/></svg>';
const RING_LENGTH = 2 * Math.PI * 8;

const BULLET = {
  pending: '<span class="rc-bullet rc-bullet-pending" aria-hidden="true"></span>',
  active: '<span class="rc-bullet rc-bullet-active" aria-hidden="true"></span>',
  done: '<span class="rc-bullet rc-bullet-done" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8.5 3.2 3.2L13 4.5"/></svg></span>'
};

/** What the card says of a failed research: a reason it knows in the person's language, else the server's own words. */
const failureText = (language, error) => {
  if (error?.code === 'pause_expired') return researchText(language, 'pauseExpired');
  return researchText(language, 'failed', { reason: error?.message || '' });
};

/** Draws a card into `host` for the message, and keeps it up to date until the host leaves the page. */
export function mountResearchCard({ host, message, getLanguage, showNotification = () => {}, openReader = null }) {
  if (!host || host.__researchCard) return () => {};
  host.__researchCard = true;
  const id = message.id;
  adoptMessage(message);
  const state = { confirmStop: false, menu: false, busy: false, activity: false, shownPg: null };
  let timer = null;
  let unsubscribe = () => {};
  let closeMenu = () => {};

  const entry = () => getResearch(id);
  const language = () => getLanguage();
  const t = (key, values) => researchText(language(), key, values);

  const planOf = () => entry()?.plan || {};
  const secondsLeft = () => {
    const plan = planOf();
    return plan.startAt ? Math.max(0, Math.ceil((plan.startAt - serverNow(id)) / 1000)) : null;
  };
  const elapsedMs = () => {
    const plan = planOf();
    return (plan.stats?.activeMs || 0) + (plan.running ? Math.max(0, serverNow(id) - (plan.clock || 0)) : 0);
  };

  const itemsHtml = (plan) => `<div class="rc-items" role="list">${(plan.items || []).map((item) => `<div class="rc-item rc-item-${esc(item.state)}" role="listitem">${BULLET[item.state] || BULLET.pending}<span>${esc(item.text)}</span></div>`).join('')}</div>`;

  // How far the research is, 0 to 100 (the server counts it; a plan from before it did is counted from the items).
  const progressOf = (plan) => {
    if (Number.isFinite(plan.pg)) return Math.max(0, Math.min(100, Math.round(plan.pg)));
    const items = plan.items || [];
    return Math.round((items.filter((item) => item.state === 'done').length / Math.max(1, items.length)) * 70);
  };
  const progressHtml = (plan) => {
    const pg = progressOf(plan);
    return `<div class="rc-progress-row"><div class="rc-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pg}"><span style="width:${state.shownPg ?? pg}%"></span></div><span class="rc-pct">${pg}%</span></div>`;
  };
  // What the research is doing, for the person who waits: the last thing as one line; a click opens the last ones.
  const activityHtml = () => {
    const lines = (entry()?.activity || []).map((item) => activityLine(item, language())).filter(Boolean).slice(-8);
    if (!lines.length) return '';
    const latest = lines[lines.length - 1];
    const list = state.activity ? `<div class="rc-act-list">${lines.map((line) => `<div class="rc-act-line rc-act-${esc(line.kind)}">${esc(line.text)}</div>`).join('')}</div>` : '';
    return `<div class="rc-act"><button type="button" class="rc-act-head" data-act="activity" aria-expanded="${state.activity}" aria-label="${esc(t('activity'))}"><span class="rc-act-text">${esc(latest.text)}</span><svg class="rc-act-chev" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>${list}</div>`;
  };

  const planFooter = (plan, runId) => {
    const disabled = runId ? '' : ' disabled';
    const phase = plan.phase;
    if (phase === 'planning') return `<div class="rc-status"><span class="rc-spinner" aria-hidden="true"></span><span>${esc(t('planning'))}</span></div>`;
    if (phase === 'awaiting') {
      if (plan.revising) return `<div class="rc-status"><span class="rc-spinner" aria-hidden="true"></span><span>${esc(t('revising'))}</span></div>`;
      const left = secondsLeft();
      const editing = plan.editing;
      return `${editing ? `<div class="rc-hint">${esc(t('editingHint'))}</div>` : ''}<div class="rc-actions"><button type="button" class="rc-btn" data-act="edit"${disabled}>${esc(t('edit'))}</button><button type="button" class="rc-btn" data-act="cancel"${disabled}>${esc(t('cancel'))}</button><button type="button" class="rc-btn rc-btn-primary rc-start" data-act="start"${disabled}><span>${esc(t('start'))}</span>${editing || left === null ? '' : `<span class="rc-ring"><svg viewBox="0 0 20 20" aria-hidden="true"><circle class="rc-ring-bg" cx="10" cy="10" r="8"/><circle class="rc-ring-fg" cx="10" cy="10" r="8" stroke-dasharray="${RING_LENGTH.toFixed(2)}" stroke-dashoffset="0"/></svg><span class="rc-secs">${left}</span></span>`}</button></div>`;
    }
    if (phase === 'researching') {
      const done = (plan.items || []).filter((item) => item.state === 'done').length;
      const label = plan.paused ? t('paused') : plan.pausing ? t('pausing') : t('researching');
      const stats = `${plan.steers ? `${esc(t('steers', { n: plan.steers }))} · ` : ''}${t('searched', { n: plan.stats?.searches || 0 })} · <span class="rc-elapsed">${esc(t('elapsed', { t: formatResearchTime(elapsedMs()) }))}</span>`;
      if (state.confirmStop) {
        return `<div class="rc-confirm"><div class="rc-confirm-text">${esc(t('stopAsk'))}</div><div class="rc-actions">${done ? `<button type="button" class="rc-btn rc-btn-primary" data-act="stop-report"${disabled}>${esc(t('stopWrite'))}</button>` : ''}<button type="button" class="rc-btn" data-act="stop-discard"${disabled}>${esc(t('stopDiscard'))}</button><button type="button" class="rc-btn" data-act="stop-back">${esc(t('stopBack'))}</button></div></div>`;
      }
      return `<div class="rc-status">${plan.paused ? '' : '<span class="rc-spinner" aria-hidden="true"></span>'}<span>${esc(label)}</span><span class="rc-stats">${stats}</span></div>${progressHtml(plan)}${activityHtml()}<div class="rc-actions">${plan.paused || plan.pausing ? `<button type="button" class="rc-btn" data-act="resume"${disabled}>${esc(t('resume'))}</button>` : `<button type="button" class="rc-btn" data-act="pause"${disabled}>${esc(t('pause'))}</button>`}<button type="button" class="rc-btn" data-act="steer"${disabled}>${esc(t('steer'))}</button><button type="button" class="rc-btn" data-act="stop"${disabled}>${esc(t('stop'))}</button></div>`;
    }
    if (phase === 'writing') return `<div class="rc-status"><span class="rc-spinner" aria-hidden="true"></span><span>${esc(t('writing'))}</span>${entry()?.writing ? `<span class="rc-stats">${esc(t('sectionOf', { n: entry().writing.n, of: entry().writing.of }))}</span>` : ''}</div>${progressHtml(plan)}${activityHtml()}`;
    if (phase === 'stopped') return `<div class="rc-status rc-status-end">${esc(t('stopped'))}</div>`;
    if (phase === 'failed') return `<div class="rc-status rc-status-end">${esc(failureText(language(), plan.error))}</div>`;
    return '';
  };

  const planHtml = (plan, runId) => `<div class="rc-box"><div class="rc-title">${esc(plan.title || plan.topic || '')}</div>${itemsHtml(plan)}${planFooter(plan, runId)}</div><div class="rc-note">${esc(t('intro', { topic: plan.topic || plan.title || '' }))}</div>`;

  const previewOf = (text) => {
    const source = String(text || '');
    if (source.length <= 3600) return source;
    let cut = source.slice(0, 3600);
    const paragraph = cut.lastIndexOf('\n\n');
    if (paragraph > 1800) cut = cut.slice(0, paragraph);
    // A code block (a chart) that the cut left open is left out.
    const fences = cut.match(/^\s*```/gm) || [];
    return fences.length % 2 ? cut.slice(0, cut.lastIndexOf('```')) : cut;
  };

  const reportHtml = (report) => {
    const stats = t('doneStats', { t: formatResearchTime(report.stats?.ms), c: report.stats?.citations ?? 0, s: report.stats?.searches ?? 0 });
    const item = (act, key) => `<button type="button" role="menuitem" data-act="${act}"${state.busy ? ' disabled' : ''}>${esc(state.busy === act.replace('export-', '') ? t('preparing') : t(key))}</button>`;
    const menu = state.menu ? `<div class="rc-menu" role="menu">${item('copy', 'copy')}${item('export-md', 'exportMarkdown')}${item('export-docx', 'exportWord')}${item('export-pdf', 'exportPdf')}</div>` : '';
    return `<div class="rc-stats-line">${esc(stats)}</div><div class="rc-report"><div class="rc-report-head"><span class="rc-doc">${DOC_ICON}</span><span class="rc-report-title">${esc(report.title || '')}</span><span class="rc-report-actions"><span class="rc-menu-anchor"><button type="button" class="rc-chip" data-act="download-menu" aria-haspopup="menu" aria-expanded="${state.menu}">${DOWNLOAD_ICON}<span>${esc(t('download'))}</span></button>${menu}</span><button type="button" class="rc-chip" data-act="expand">${EXPAND_ICON}<span>${esc(t('expand'))}</span></button></span></div><div class="rc-report-body" data-act="expand"><div class="rc-preview"></div><div class="rc-fade"></div></div></div><div class="rc-note">${esc(t('intro', { topic: report.topic || report.title || '' }))}</div>`;
  };

  const fillPreview = (report) => {
    const slot = host.querySelector('.rc-preview');
    const renderer = getFileMarkdownRenderer();
    if (!slot || !renderer) return;
    try {
      slot.innerHTML = renderer(previewOf(report.text)).replace(/[ \u00a0]?\[\d{1,4}\]/g, '');
    } catch {
      slot.textContent = previewOf(report.text);
    }
  };

  const draw = () => {
    const current = entry();
    if (!host.isConnected) {
      stop();
      return;
    }
    let html;
    if (current?.report) html = reportHtml(current.report);
    else if (current?.plan) html = planHtml(current.plan, current.runId);
    else html = '';
    host.classList.toggle('rc-is-report', Boolean(current?.report));
    host.innerHTML = `<div class="rc">${html}</div>`;
    if (current?.report) fillPreview(current.report);
    moveBar();
    tick();
    const wantsTick = !current?.report && ['awaiting', 'researching'].includes(current?.plan?.phase);
    if (wantsTick && !timer) timer = setInterval(tick, 250);
    if (!wantsTick && timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // The bar is drawn at the width it had and then moved to the new one, so it slides.
  function moveBar() {
    const bar = host.querySelector('.rc-progress > span');
    if (!bar) {
      state.shownPg = null;
      return;
    }
    const pg = progressOf(planOf());
    if (state.shownPg === null || state.shownPg === pg) {
      state.shownPg = pg;
      return;
    }
    const view = host.ownerDocument.defaultView;
    const later = view?.requestAnimationFrame ? (fn) => view.requestAnimationFrame(fn) : (fn) => setTimeout(fn, 16);
    later(() => {
      if (host.isConnected) bar.style.width = `${pg}%`;
    });
    state.shownPg = pg;
  }

  // The countdown and the time spent move without drawing the card again.
  function tick() {
    if (!host.isConnected) {
      stop();
      return;
    }
    const plan = planOf();
    if (plan.phase === 'awaiting') {
      const left = secondsLeft();
      const secs = host.querySelector('.rc-secs');
      const ring = host.querySelector('.rc-ring-fg');
      if (secs && left !== null) secs.textContent = String(left);
      if (ring && left !== null) {
        const total = Math.max(1, (plan.countdownMs || 60000) / 1000);
        ring.setAttribute('stroke-dashoffset', (RING_LENGTH * (1 - Math.min(1, left / total))).toFixed(2));
      }
    } else if (plan.phase === 'researching') {
      const elapsed = host.querySelector('.rc-elapsed');
      if (elapsed) elapsed.textContent = t('elapsed', { t: formatResearchTime(elapsedMs()) });
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    unsubscribe();
    host.ownerDocument.removeEventListener('click', closeMenu);
  }

  const control = async (action, payload) => {
    const current = entry();
    const mode = getResearchMode();
    if (!current?.runId || !mode) return false;
    const result = await mode.control(current.runId, action, payload);
    if (!result.ok) {
      showNotification(t(result.code === 'wrong_phase' ? 'wrongPhase' : 'actionFailed'), 'warning');
      return false;
    }
    return true;
  };

  const act = async (name) => {
    const current = entry();
    switch (name) {
      case 'edit':
        await getResearchMode()?.beginEdit({ runId: current?.runId, messageId: id, title: current?.plan?.title });
        break;
      case 'activity':
        state.activity = !state.activity;
        draw();
        break;
      case 'steer':
        await getResearchMode()?.beginEdit({ runId: current?.runId, messageId: id, title: current?.plan?.title, kind: 'steer' });
        break;
      case 'cancel': await control('stop', { mode: 'discard' }); break;
      case 'start': await control('start'); break;
      case 'pause': await control('pause'); break;
      case 'resume': await control('resume'); break;
      case 'stop':
        state.confirmStop = true;
        draw();
        break;
      case 'stop-back':
        state.confirmStop = false;
        draw();
        break;
      case 'stop-report':
      case 'stop-discard':
        state.confirmStop = false;
        await control('stop', { mode: name === 'stop-report' ? 'report' : 'discard' });
        draw();
        break;
      case 'download-menu':
        state.menu = !state.menu;
        draw();
        break;
      case 'copy': {
        state.menu = false;
        const { copyReport } = await import('./research-export.js');
        if (current?.report) showNotification(await copyReport(current.report, language()) ? t('copied') : t('actionFailed'), 'success');
        draw();
        break;
      }
      case 'export-md':
      case 'export-docx':
      case 'export-pdf': {
        if (!current?.report || state.busy) break;
        const { exportWithNotice } = await import('./research-export.js');
        await exportWithNotice(name.slice(7), current.report, {
          language: language(),
          document: host.ownerDocument,
          showNotification,
          onBusy: (kind) => { state.busy = kind; if (kind === null) state.menu = false; draw(); }
        });
        break;
      }
      case 'expand':
        if (openReader) await openReader({ messageId: id });
        break;
      default: break;
    }
  };

  host.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act]');
    if (!button || !host.contains(button) || button.disabled) return;
    // The buttons inside the report's header do their own thing, not the card's "open".
    if (button.classList.contains('rc-report-body') && event.target.closest('a')) return;
    event.stopPropagation();
    void act(button.dataset.act).catch((error) => console.warn('A research action failed.', error));
  });
  closeMenu = (event) => {
    if (state.menu && !host.contains(event.target)) {
      state.menu = false;
      draw();
    }
  };
  host.ownerDocument.addEventListener('click', closeMenu);

  unsubscribe = subscribeResearch(id, () => {
    // A stop that was asked for is not asked again once the state has moved on.
    if (state.confirmStop && planOf().phase !== 'researching') state.confirmStop = false;
    draw();
  });
  draw();  return stop;
}
