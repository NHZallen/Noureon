import { getRuntimeTexts } from '../../runtime/i18n/runtime-texts.js';

export function createResponseProgressRenderers({ escapeHTML, getUiLanguage, getCouncilRuntimeTexts }) {
  const getLanguage = () => getUiLanguage?.() || 'zh-TW';

  const renderCouncilProgress = (progress) => {
    if (typeof progress === 'string') return `<div class="council-progress-panel"><div class="council-progress-heading">${escapeHTML(progress)}</div></div>`;
    const localized = getRuntimeTexts(getLanguage());
    const runtimeTexts = getCouncilRuntimeTexts();
    const elapsedSeconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
    const stageLabels = { search: runtimeTexts.sharedSearch, translation: localized.attachmentTranslation, firstRound: localized.independentRound, deliberation: localized.secondRoundDiscussion, synthesis: localized.synthesis, completed: runtimeTexts.completed };
    const stageNotes = { translation: localized.councilTranslationNote, search: localized.councilSearchNote, firstRound: localized.councilIndependentNote, deliberation: localized.councilDiscussionNote, synthesis: localized.councilSynthesisNote, completed: localized.councilFinished };
    const statusText = { pending: runtimeTexts.pending, running: runtimeTexts.running, done: runtimeTexts.done, failed: runtimeTexts.failed, skipped: runtimeTexts.skippedStatus };
    const searchHTML = progress.search ? `<div class="council-progress-search ${escapeHTML(progress.search.status)}"><span class="council-progress-dot ${escapeHTML(progress.search.status)}"></span><span><strong>${escapeHTML(progress.search.label)}</strong> · ${escapeHTML(progress.search.detail)}</span></div>` : '';
    const modelRows = (progress.modelStates || []).map(model => `<div class="council-progress-model ${escapeHTML(model.status)}"><span class="council-progress-dot ${escapeHTML(model.status)}"></span><span class="council-progress-model-copy"><span class="council-progress-model-name">${escapeHTML(model.modelName)}</span><span class="council-progress-model-detail">${escapeHTML(model.detail || statusText[model.status] || model.status)}</span></span><span class="council-progress-model-status">${escapeHTML(statusText[model.status] || model.status)}</span></div>`).join('');
    const doneCount = (progress.modelStates || []).filter(model => model.status === 'done').length;
    const runningCount = (progress.modelStates || []).filter(model => model.status === 'running').length;
    return `<div class="council-progress-panel"><div class="council-progress-orbit" aria-hidden="true"><span></span><span></span><span></span></div><div class="council-progress-heading"><span class="council-progress-stage">${escapeHTML(stageLabels[progress.stage] || runtimeTexts.running)}</span><span class="council-progress-time">${elapsedSeconds}s</span></div><div class="council-progress-message">${escapeHTML(progress.message || runtimeTexts.running)}</div><div class="council-progress-note">${escapeHTML(stageNotes[progress.stage] || stageNotes.firstRound)}</div><div class="council-progress-stats"><span>${escapeHTML(String(progress.activeParticipants || 0))}/${escapeHTML(String(progress.totalParticipants || 0))} ${localized.models}</span><span>${escapeHTML(String(doneCount))} ${localized.done}</span><span>${escapeHTML(String(runningCount))} ${localized.running}</span></div>${searchHTML}<div class="council-progress-models">${modelRows}</div></div>`;
  };

  // One breathing dot in the colour of the person's theme (a reply with no text yet). The words next to it are only there when they say something:
  // the stage of a document translation or a search, the characters received when the text itself is not shown (output at the end), and the
  // seconds once the wait is long. The markup keeps one shape from tick to tick so that patch-html.js changes only the text and the dot's
  // animation is not started again: the label is never empty (a zero-width space stands in).
  const EMPTY_LABEL = '\u200b';
  const SECONDS_SHOWN_AFTER = 5;

  const renderSingleModelProgress = (progress) => {
    const localized = getRuntimeTexts(getLanguage());
    const elapsedSeconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
    const parts = [];
    if (progress.stage === 'documentTranslation') parts.push(progress.message || localized.documentTranslation);
    else if (progress.stage === 'searchTranslation') parts.push(progress.message || localized.search);
    if (progress.translatorName && (progress.stage === 'documentTranslation' || progress.stage === 'searchTranslation')) parts.push(progress.translatorName);
    if (progress.receivedChars > 0) parts.push(`${localized.receivedCharacters}: ${progress.receivedChars}`);
    if (elapsedSeconds >= SECONDS_SHOWN_AFTER) parts.push(`${elapsedSeconds}s`);
    return `<div class="progress-dot" role="status" aria-label="${escapeHTML(localized.modelAnswering)}"><span class="progress-dot-mark" aria-hidden="true"></span><span class="progress-dot-label">${escapeHTML(parts.join(' · ') || EMPTY_LABEL)}</span></div>`;
  };

  const renderSingleModelError = (progress = {}, errorMessage = '') => {
    const localized = getRuntimeTexts(getLanguage());
    const elapsedSeconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
    return `<details class="single-progress-panel single-progress-panel-error" open><summary><span>${escapeHTML(progress.modelName || '')}</span><span>${elapsedSeconds}s</span></summary><div class="council-progress-heading"><span class="council-progress-stage">${escapeHTML(localized.requestFailed)}</span><span class="council-progress-time">${elapsedSeconds}s</span></div><div class="council-progress-message">${escapeHTML(errorMessage || localized.requestFailed)}</div><div class="council-progress-note">${escapeHTML(localized.progressFailedNote)}</div></details>`;
  };

  return { renderCouncilProgress, renderSingleModelError, renderSingleModelProgress };
}
