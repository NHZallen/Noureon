import { getRuntimeTexts } from '../../runtime/i18n/runtime-texts.js';

// After this long without a word, the dot says the reply is still being got ready.
const WAIT_STILL_MS = 15_000;

export function createResponseProgressRenderers({ escapeHTML, getUiLanguage, getCouncilRuntimeTexts }) {
  const getLanguage = () => getUiLanguage?.() || 'zh-TW';

  const renderCouncilProgress = (progress) => {
    if (typeof progress === 'string') return `<div class="council-progress-panel"><div class="council-progress-heading">${escapeHTML(progress)}</div></div>`;
    const localized = getRuntimeTexts(getLanguage());
    const runtimeTexts = getCouncilRuntimeTexts();
    const elapsedSeconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
    const stageLabels = { search: runtimeTexts.sharedSearch, translation: localized.attachmentTranslation, firstRound: localized.independentRound, deliberation: localized.secondRoundDiscussion, synthesis: localized.synthesis, completed: runtimeTexts.completed };
    const stageNotes = { translation: localized.councilTranslationNote, search: localized.councilSearchNote, firstRound: localized.councilIndependentNote, deliberation: localized.councilDiscussionNote, synthesis: localized.councilSynthesisNote, completed: localized.councilFinished };
    const statusText = { pending: runtimeTexts.pending, running: runtimeTexts.running, done: runtimeTexts.done, failed: runtimeTexts.failed, skipped: runtimeTexts.skippedStatus, exited: runtimeTexts.exited };
    const searchHTML = progress.search ? `<div class="council-progress-search ${escapeHTML(progress.search.status)}"><span class="council-progress-dot ${escapeHTML(progress.search.status)}"></span><span><strong>${escapeHTML(progress.search.label)}</strong> · ${escapeHTML(progress.search.detail)}</span></div>` : '';
    const modelRows = (progress.modelStates || []).map(model => `<div class="council-progress-model ${escapeHTML(model.status)}"><span class="council-progress-dot ${escapeHTML(model.status)}"></span><span class="council-progress-model-copy"><span class="council-progress-model-name">${escapeHTML(model.modelName)}</span><span class="council-progress-model-detail">${escapeHTML(model.detail || statusText[model.status] || model.status)}</span></span><span class="council-progress-model-status">${escapeHTML(statusText[model.status] || model.status)}</span>${model.canExit && progress.exit ? `<button type="button" class="council-progress-exit" data-council-exit="${escapeHTML(model.modelId)}">${escapeHTML(runtimeTexts.exitModel)}</button>` : ''}</div>`).join('');
    const doneCount = (progress.modelStates || []).filter(model => model.status === 'done').length;
    const runningCount = (progress.modelStates || []).filter(model => model.status === 'running').length;
    return `<div class="council-progress-panel"><div class="council-progress-orbit" aria-hidden="true"><span></span><span></span><span></span></div><div class="council-progress-heading"><span class="council-progress-stage">${escapeHTML(stageLabels[progress.stage] || runtimeTexts.running)}</span><span class="council-progress-time">${elapsedSeconds}s</span></div><div class="council-progress-message">${escapeHTML(progress.message || runtimeTexts.running)}</div><div class="council-progress-note">${escapeHTML(stageNotes[progress.stage] || stageNotes.firstRound)}</div><div class="council-progress-stats"><span>${escapeHTML(String(progress.activeParticipants || 0))}/${escapeHTML(String(progress.totalParticipants || 0))} ${localized.models}</span><span>${escapeHTML(String(doneCount))} ${localized.done}</span><span>${escapeHTML(String(runningCount))} ${localized.running}</span></div>${searchHTML}<div class="council-progress-models">${modelRows}</div></div>`;
  };

  // Before a reply's first word: a dot breathing in the person's accent (reply-wait.css), with a quiet "still getting ready" once it has been a while.
  // Only a slow step the person can follow (reading files, converting documents, searching) gets a line of its own. The view is drawn again every
  // second: `--wait-phase` is the time already waited, so the motion goes on instead of starting over.
  const renderSingleModelProgress = (progress) => {
    const localized = getRuntimeTexts(getLanguage());
    const elapsed = Math.max(0, Math.round(progress.elapsedMs || 0));
    const phase = `style="--wait-phase:-${elapsed}ms"`;
    const step = { fileReading: localized.waitReadingFiles, documentTranslation: localized.waitConvertingDocs, searchTranslation: localized.waitSearching }[progress.stage];
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
