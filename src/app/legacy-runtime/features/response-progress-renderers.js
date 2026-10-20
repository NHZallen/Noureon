import { getRuntimeTexts } from '../../runtime/i18n/runtime-texts.js';
import { councilTimelineHTML } from '../../ui/council/council-timeline.js';

// After this long without a word, the dot says the reply is still being got ready.
const WAIT_STILL_MS = 15_000;

export function createResponseProgressRenderers({ escapeHTML, getUiLanguage, getCouncilRuntimeTexts }) {
  const getLanguage = () => getUiLanguage?.() || 'zh-TW';

  // A council while it goes on: the timeline of its stages, with the members of the stage that runs (council-timeline.js). `openMembers`: the
  // members the person opened to what they searched and read.
  const renderCouncilProgress = (progress) => {
    if (typeof progress === 'string') return `<div class="council-progress-panel"><div class="council-progress-heading">${escapeHTML(progress)}</div></div>`;
    const runtimeTexts = getCouncilRuntimeTexts();
    const members = (progress.modelStates || []).map((model) => ({ id: model.modelId, name: model.modelName, status: model.status, chars: model.chars, counts: model.counts, steps: model.steps, canExit: model.canExit }));
    const timeline = councilTimelineHTML({ mode: progress.mode, stage: progress.stage, elapsedMs: progress.elapsedMs, stages: progress.stages, members }, {
      language: getLanguage(),
      live: true,
      open: progress.openMembers instanceof Set ? progress.openMembers : new Set(),
      exitLabel: progress.exit ? runtimeTexts.exitModel : ''
    });
    return `<div class="council-tl-panel" role="status">${timeline}</div>`;
  };

  // Before a reply's first word: a dot breathing in the person's accent (reply-wait.css), with a quiet "still getting ready" once it has been a while.
  // Only a slow step the person can follow (reading files, turning them into PDFs, converting documents, searching) gets a line of its own. The view is drawn again every
  // second: `--wait-phase` is the time already waited, so the motion goes on instead of starting over.
  const renderSingleModelProgress = (progress) => {
    const localized = getRuntimeTexts(getLanguage());
    const elapsed = Math.max(0, Math.round(progress.elapsedMs || 0));
    const phase = `style="--wait-phase:-${elapsed}ms"`;
    const step = { fileReading: localized.waitReadingFiles, makingPdf: localized.waitMakingPdf, documentTranslation: localized.waitConvertingDocs, searchTranslation: localized.waitSearching }[progress.stage];
    if (step) return `<div class="ledger reply-wait-step" role="status" ${phase}><div class="ledger-row is-running"><div class="ledger-row-head"><span class="ledger-mark" aria-hidden="true"></span><span class="ledger-label">${escapeHTML(step)}</span></div></div></div>`;
    const still = elapsed >= WAIT_STILL_MS ? `<span class="reply-wait-still">${escapeHTML(localized.waitStill)}</span>` : '';
    return `<div class="reply-wait" role="status" aria-label="${escapeHTML(localized.preparingRequest)}"><span class="reply-wait-dot" ${phase} aria-hidden="true"></span>${still}</div>`;
  };

  const renderSingleModelError = (progress = {}, errorMessage = '') => {
    const localized = getRuntimeTexts(getLanguage());
    const elapsedSeconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
    return `<details class="single-progress-panel single-progress-panel-error" open><summary><span>${escapeHTML(progress.modelName || '')}</span><span>${elapsedSeconds}s</span></summary><div class="council-progress-heading"><span class="council-progress-stage">${escapeHTML(localized.requestFailed)}</span><span class="council-progress-time">${elapsedSeconds}s</span></div><div class="council-progress-message">${escapeHTML(errorMessage || localized.requestFailed)}</div><div class="council-progress-note">${escapeHTML(localized.progressFailedNote)}</div></details>`;
  };

  return { renderCouncilProgress, renderSingleModelError, renderSingleModelProgress };
}
