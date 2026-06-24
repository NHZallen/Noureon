export function createResponseProgressRenderers({
  escapeHTML,
  getUiLanguage,
  getCouncilRuntimeTexts
}) {
  const getLanguage = () => getUiLanguage?.() || 'zh-TW';

  const renderCouncilProgress = (progress) => {
    if (typeof progress === 'string') {
      return `<div class="council-progress-panel"><div class="council-progress-heading">${escapeHTML(progress)}</div></div>`;
    }
    const uiLanguage = getLanguage();
    const runtimeTexts = getCouncilRuntimeTexts();
    const elapsedSeconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
    const stageLabels = {
      search: runtimeTexts.sharedSearch,
      translation: uiLanguage === 'en' ? 'Attachment translation' : '附件轉譯',
      firstRound: uiLanguage === 'en' ? 'Independent round' : '第一輪獨立回答',
      deliberation: uiLanguage === 'en' ? 'Second-round discussion' : '第二輪討論',
      synthesis: uiLanguage === 'en' ? 'Synthesis' : '統整結論',
      completed: runtimeTexts.completed
    };
    const stageNotes = {
      translation: uiLanguage === 'en'
        ? 'Preparing detailed text packets for models that cannot read some attachment types directly.'
        : '正在為無法直接讀取部分附件類型的模型準備詳細轉譯包。',
      search: uiLanguage === 'en'
        ? 'Gathering one shared research packet so every member sees the same evidence.'
        : '正在建立同一份共同搜尋資料，讓所有理事看同樣的依據。',
      firstRound: uiLanguage === 'en'
        ? 'Members are answering independently. The page is alive; slower models may still be thinking.'
        : '各模型正在獨立作答，畫面沒有卡住，較慢的模型可能還在思考。',
      deliberation: uiLanguage === 'en'
        ? 'Members are comparing reasons without blindly following the majority.'
        : '理事正在比較理由，並避免只因多數意見就從眾。',
      synthesis: uiLanguage === 'en'
        ? 'The synthesizer is checking claims and turning the council into one useful answer.'
        : '統整模型正在檢查主張，把理事會結果整理成可用答案。',
      completed: uiLanguage === 'en' ? 'Council finished.' : '理事會完成。'
    };
    const modelCountLabel = uiLanguage === 'en' ? 'models' : '模型';
    const doneCountLabel = uiLanguage === 'en' ? 'done' : '完成';
    const runningCountLabel = uiLanguage === 'en' ? 'running' : '進行中';
    const statusText = {
      pending: runtimeTexts.pending,
      running: runtimeTexts.running,
      done: runtimeTexts.done,
      failed: runtimeTexts.failed,
      skipped: runtimeTexts.skippedStatus
    };
    const searchHTML = progress.search ? `
                <div class="council-progress-search ${escapeHTML(progress.search.status)}">
                    <span class="council-progress-dot ${escapeHTML(progress.search.status)}"></span>
                    <span><strong>${escapeHTML(progress.search.label)}</strong> · ${escapeHTML(progress.search.detail)}</span>
                </div>
            ` : '';
    const modelRows = (progress.modelStates || []).map(model => `
                <div class="council-progress-model ${escapeHTML(model.status)}">
                    <span class="council-progress-dot ${escapeHTML(model.status)}"></span>
                    <span class="council-progress-model-copy">
                        <span class="council-progress-model-name">${escapeHTML(model.modelName)}</span>
                        <span class="council-progress-model-detail">${escapeHTML(model.detail || statusText[model.status] || model.status)}</span>
                    </span>
                    <span class="council-progress-model-status">${escapeHTML(statusText[model.status] || model.status)}</span>
                </div>
            `).join('');
    const doneCount = (progress.modelStates || []).filter(model => model.status === 'done').length;
    const runningCount = (progress.modelStates || []).filter(model => model.status === 'running').length;
    return `
                <div class="council-progress-panel">
                    <div class="council-progress-orbit" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </div>
                    <div class="council-progress-heading">
                        <span class="council-progress-stage">${escapeHTML(stageLabels[progress.stage] || runtimeTexts.running)}</span>
                        <span class="council-progress-time">${elapsedSeconds}s</span>
                    </div>
                    <div class="council-progress-message">${escapeHTML(progress.message || runtimeTexts.running)}</div>
                    <div class="council-progress-note">${escapeHTML(stageNotes[progress.stage] || stageNotes.firstRound)}</div>
                    <div class="council-progress-stats">
                        <span>${escapeHTML(String(progress.activeParticipants || 0))}/${escapeHTML(String(progress.totalParticipants || 0))} ${modelCountLabel}</span>
                        <span>${escapeHTML(String(doneCount))} ${doneCountLabel}</span>
                        <span>${escapeHTML(String(runningCount))} ${runningCountLabel}</span>
                    </div>
                    ${searchHTML}
                    <div class="council-progress-models">${modelRows}</div>
                </div>
            `;
  };

  const renderSingleModelProgress = (progress) => {
    const uiLanguage = getLanguage();
    const elapsedSeconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
    const stageLabels = {
      preparing: uiLanguage === 'en' ? 'Preparing request' : '準備請求',
      documentTranslation: uiLanguage === 'en' ? 'Document translation' : '文件轉譯',
      searchTranslation: uiLanguage === 'en' ? 'Search' : '搜索',
      streaming: uiLanguage === 'en' ? 'Model answering' : '模型作答',
      completed: uiLanguage === 'en' ? 'Completed' : '完成'
    };
    const stageNotes = {
      preparing: uiLanguage === 'en'
        ? 'Checking the target model capabilities before sending the request.'
        : '正在檢查目標模型的原生能力，決定是否需要轉譯包。',
      documentTranslation: uiLanguage === 'en'
        ? 'A configured translator is turning unsupported documents into a detailed text packet for this turn only.'
        : '設定的轉譯模型正在把不支援的文件轉成只供本次請求使用的詳細文字包。',
      searchTranslation: uiLanguage === 'en'
        ? 'Gathering a web research packet for this turn.'
        : '正在為這次回覆整理搜索包。',
      streaming: uiLanguage === 'en'
        ? 'The selected model is streaming the final answer.'
        : '所選模型正在串流輸出最終回答。',
      completed: uiLanguage === 'en' ? 'The response is ready.' : '回應已完成。'
    };
    const receivedLabel = uiLanguage === 'en' ? 'received characters' : '已接收字元';
    return `
                <details class="single-progress-panel" open>
                    <summary>
                        <span>${escapeHTML(progress.modelName || '')}</span>
                        <span>${elapsedSeconds}s</span>
                    </summary>
                    <div class="council-progress-orbit" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </div>
                    <div class="council-progress-heading">
                        <span class="council-progress-stage">${escapeHTML(stageLabels[progress.stage] || stageLabels.preparing)}</span>
                        <span class="council-progress-time">${elapsedSeconds}s</span>
                    </div>
                    <div class="council-progress-message">${escapeHTML(progress.message || stageLabels[progress.stage] || stageLabels.preparing)}</div>
                    <div class="council-progress-note">${escapeHTML(stageNotes[progress.stage] || stageNotes.preparing)}</div>
                    <div class="council-progress-stats">
                        <span>${escapeHTML(receivedLabel)}: ${escapeHTML(String(progress.receivedChars || 0))}</span>
                        ${progress.translatorName ? `<span>${escapeHTML(progress.translatorName)}</span>` : ''}
                    </div>
                </details>
            `;
  };

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
