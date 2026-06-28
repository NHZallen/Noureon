export function createResponseProgressRenderers({
  escapeHTML,
  getUiLanguage,
  getCouncilRuntimeTexts,
  getTranslations = () => ({})
}) {
  const getLanguage = () => getUiLanguage?.() || 'zh-TW';
  const getText = (key, fallback) => getTranslations?.()?.[key] || fallback;

  const renderThinkingIndicator = () => `
                <div class="assistant-thinking-indicator" role="status" aria-live="polite">
                    <span class="assistant-thinking-text">${escapeHTML(getText('thinkingStatus', 'Thinking…'))}</span>
                </div>
            `;

  const getStatusLabels = () => ({
    waiting: getText('councilStatusWaiting', 'Waiting'),
    thinking: getText('councilStatusThinking', 'Thinking'),
    responding: getText('councilStatusResponding', 'Responding'),
    done: getText('councilStatusDone', 'Done'),
    error: getText('councilStatusError', 'Error'),
    inProgress: getText('councilStatusInProgress', 'In progress')
  });

  const normalizeStatus = (status, { responseStarted = false, task = false } = {}) => {
    if (status === 'failed' || status === 'skipped' || status === 'error') return 'error';
    if (status === 'done' || status === 'completed') return 'done';
    if (task && status === 'running') return 'inProgress';
    if (status === 'responding' || responseStarted) return 'responding';
    if (status === 'running') return 'thinking';
    return 'waiting';
  };

  const renderStatusRow = ({ label, role = '', status }, statusLabels) => `
                <div class="council-status-row ${escapeHTML(status)}">
                    <span class="council-status-dot ${escapeHTML(status)}" aria-hidden="true"></span>
                    <span class="council-status-label">
                        ${escapeHTML(label)}
                        ${role ? `<span class="council-status-role">${escapeHTML(role)}</span>` : ''}
                    </span>
                    <span class="council-status-value">${escapeHTML(statusLabels[status] || status)}</span>
                </div>
            `;

  const renderStatusGroup = ({ key, label, rows, summary = '' }) => {
    if (!rows.length) return '';
    const bodyId = `council-status-${key}-body`;
    return `
                <div class="council-status-group is-open" data-council-status-group="${escapeHTML(key)}">
                    <button class="council-status-toggle" type="button" data-council-status-toggle="${escapeHTML(key)}" aria-expanded="true" aria-controls="${bodyId}">
                        <span class="council-status-chevron" aria-hidden="true">›</span>
                        <span>${escapeHTML(label)}</span>
                        <span class="council-status-summary">${escapeHTML(summary)}</span>
                    </button>
                    <div class="council-status-body-shell" id="${bodyId}" data-council-status-body="${escapeHTML(key)}" aria-hidden="false">
                        <div class="council-status-body">
                            <div class="council-status-list">${rows.join('')}</div>
                        </div>
                    </div>
                </div>
            `;
  };

  const renderCouncilProgress = (progress) => {
    if (typeof progress === 'string') {
      return renderThinkingIndicator();
    }
    const statusLabels = getStatusLabels();
    const preparationItems = [];
    if (progress.translation) {
      preparationItems.push({
        label: getText('councilDocumentTranslation', 'Document translation'),
        status: normalizeStatus(progress.translation.status, { task: true })
      });
    }
    if (progress.search) {
      preparationItems.push({
        label: getText('councilWebSearch', 'Web search'),
        status: normalizeStatus(progress.search.status, { task: true })
      });
    }

    const modelItems = (progress.modelStates || []).map(model => ({
      label: model.modelName,
      status: normalizeStatus(model.status, { responseStarted: model.responseStarted })
    }));
    if (progress.synthesizerModelName) {
      const synthesizerStatus = progress.synthesizerStatus
        || (progress.stage === 'synthesis' ? 'responding' : (progress.stage === 'completed' ? 'done' : 'pending'));
      modelItems.push({
        label: progress.synthesizerModelName,
        role: getText('councilSynthesizer', 'Synthesizer'),
        status: normalizeStatus(synthesizerStatus)
      });
    }

    const statusCounts = modelItems.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {});
    const summary = ['waiting', 'thinking', 'responding', 'done', 'error']
      .filter(status => statusCounts[status] > 0)
      .map(status => `${statusLabels[status]} ${statusCounts[status]}`)
      .join(' · ');
    const preparationRows = preparationItems.map(item => renderStatusRow(item, statusLabels));
    const modelRows = modelItems.map(item => renderStatusRow(item, statusLabels));

    return `
                <div class="council-status" role="status" aria-live="polite">
                    <div class="assistant-thinking-indicator">
                        <span class="assistant-thinking-text">${escapeHTML(getText('thinkingStatus', 'Thinking…'))}</span>
                    </div>
                    <div class="council-status-groups">
                        ${renderStatusGroup({
                          key: 'preparation',
                          label: getText('councilPreparationGroup', 'Translation and search'),
                          rows: preparationRows
                        })}
                        ${renderStatusGroup({
                          key: 'models',
                          label: getText('councilModelStatusGroup', 'Model status'),
                          rows: modelRows,
                          summary
                        })}
                    </div>
                </div>
            `;
  };

  const renderSingleModelProgress = () => renderThinkingIndicator();

  const renderSingleModelError = (progress = {}, errorMessage = '') => {
    const uiLanguage = getLanguage();
    const elapsedSeconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
    const title = uiLanguage === 'en' ? 'Request failed' : '請求失敗';
    const note = uiLanguage === 'en'
      ? 'The model stopped before returning a usable answer.'
      : '模型在回傳可用答案前中斷。';
    return `
                <details class="single-progress-panel single-progress-panel-error" open>
                    <summary>
                        <span>${escapeHTML(progress.modelName || '')}</span>
                        <span>${elapsedSeconds}s</span>
                    </summary>
                    <div class="council-progress-heading">
                        <span class="council-progress-stage">${escapeHTML(title)}</span>
                        <span class="council-progress-time">${elapsedSeconds}s</span>
                    </div>
                    <div class="council-progress-message">${escapeHTML(errorMessage || title)}</div>
                    <div class="council-progress-note">${escapeHTML(note)}</div>
                </details>
            `;
  };

  return {
    renderCouncilProgress,
    renderSingleModelError,
    renderSingleModelProgress
  };
}
