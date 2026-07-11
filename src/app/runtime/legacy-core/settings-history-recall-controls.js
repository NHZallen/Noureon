export function createSettingsHistoryRecallControls({
  document,
  elements,
  legacyRuntimeContext,
  getConfig
} = {}) {
  const getHistoryRecallStatus = () => (
    typeof legacyRuntimeContext?.resolveOptionalBinding === 'function'
      ? legacyRuntimeContext.resolveOptionalBinding('memory.getHistoryRecallStatus')
      : null
  );
  const grantHistoryRecallConsent = () => (
    typeof legacyRuntimeContext?.resolveOptionalBinding === 'function'
      ? legacyRuntimeContext.resolveOptionalBinding('memory.grantHistoryRecallConsent')
      : null
  );
  const revokeHistoryRecallConsent = () => (
    typeof legacyRuntimeContext?.resolveOptionalBinding === 'function'
      ? legacyRuntimeContext.resolveOptionalBinding('memory.revokeHistoryRecallConsent')
      : null
  );
  const rebuildHistoryIndex = () => (
    typeof legacyRuntimeContext?.resolveOptionalBinding === 'function'
      ? legacyRuntimeContext.resolveOptionalBinding('memory.rebuildHistoryIndex')
      : null
  );

  const ensureHistoryRecallSettingsControl = () => {
    const existingToggle = document.getElementById('history-recall-toggle-switch');
    if (existingToggle) {
      elements.historyRecallToggleSwitch = existingToggle;
      elements.historyRecallStatus = document.getElementById('history-recall-status');
      elements.rebuildHistoryIndexButton = document.getElementById('rebuild-history-index-button');
      return;
    }
    const section = document.getElementById('memory-section');
    if (!section) return;
    const container = document.createElement('div');
    container.id = 'history-recall-control';
    container.className = 'mt-5 pt-5 border-t border-[var(--border-color)] space-y-2';
    container.innerHTML = `
      <div class="flex items-center justify-between">
        <label for="history-recall-toggle-switch" class="flex-1 text-sm font-medium">跨對話回憶</label>
        <div class="relative inline-block w-12 h-6 mr-2 align-middle select-none transition duration-200 ease-in">
          <input type="checkbox" id="history-recall-toggle-switch" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
          <label for="history-recall-toggle-switch" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
        </div>
      </div>
      <p class="text-xs text-[var(--text-secondary)]">開啟後，這台裝置會把目前問題傳給 Gemini Embedding 2，用本機索引找最多三段相關的舊對話摘要。聊天畫面不會顯示來源。</p>
      <p id="history-recall-status" class="text-xs text-[var(--text-secondary)]"></p>
      <button id="rebuild-history-index-button" type="button" class="px-3 py-1.5 rounded-md btn-outline-white text-sm">建立本機索引</button>
    `;
    const autoMemoryRow = elements.autoMemoryToggleSwitch?.closest?.('.flex.items-center.justify-between');
    if (autoMemoryRow?.after) autoMemoryRow.after(container);
    else section.appendChild(container);
    elements.historyRecallToggleSwitch = container.querySelector('#history-recall-toggle-switch');
    elements.historyRecallStatus = container.querySelector('#history-recall-status');
    elements.rebuildHistoryIndexButton = container.querySelector('#rebuild-history-index-button');
  };

  const refreshHistoryRecallStatus = async () => {
    const statusElement = elements.historyRecallStatus;
    if (!statusElement) return;
    const getStatus = getHistoryRecallStatus();
    const status = typeof getStatus === 'function' ? await getStatus() : null;
    if (!status?.consentLoaded || !status.indexLoaded) {
      statusElement.textContent = '正在讀取此裝置的本機索引…';
      return;
    }
    const rebuild = status.rebuild || {};
    if (rebuild.state === 'running') {
      statusElement.textContent = `建立索引中：${rebuild.completed}／${rebuild.total}。完成 ${rebuild.total}／${rebuild.total} 才表示全部完成。`;
      return;
    }
    if (rebuild.state === 'complete') {
      statusElement.textContent = `索引已完成：${rebuild.completed}／${rebuild.total}（新增 ${rebuild.indexed}，略過 ${rebuild.skipped}，失敗 ${rebuild.failed}）。`;
      return;
    }
    if (getConfig().historyRecallEnabled && !status.consented) {
      statusElement.textContent = '此裝置尚未同意；目前不會檢索或傳送舊對話。儲存設定時可啟用。';
      return;
    }
    statusElement.textContent = getConfig().historyRecallEnabled
      ? `已啟用，本機索引有 ${status.indexRecordCount} 筆對話膠囊。`
      : '目前關閉；不會查詢舊對話或呼叫 Embedding。';
  };

  const resolveHistoryRecallEnabled = async ({ requested, showCustomConfirm }) => {
    if (!requested) {
      const revokeConsent = revokeHistoryRecallConsent();
      if (typeof revokeConsent === 'function') await revokeConsent();
      return false;
    }
    const getStatus = getHistoryRecallStatus();
    const status = typeof getStatus === 'function' ? await getStatus() : null;
    if (!status || status.consented) return true;
    const accepted = await showCustomConfirm(
      '啟用跨對話回憶後，這台裝置會把你目前的問題傳給 Gemini Embedding 2，並從本機索引找相關舊對話。向量與索引不會同步。要在這台裝置啟用嗎？',
      '啟用跨對話回憶'
    );
    if (!accepted) return false;
    const grantConsent = grantHistoryRecallConsent();
    if (typeof grantConsent === 'function') await grantConsent();
    return true;
  };

  const bindHistoryIndexRebuild = () => {
    const button = elements.rebuildHistoryIndexButton;
    if (!button || button.dataset.memoryIndexBound === 'true') return;
    button.dataset.memoryIndexBound = 'true';
    button.addEventListener('click', async () => {
      if (getConfig().historyRecallEnabled !== true) {
        if (elements.historyRecallStatus) elements.historyRecallStatus.textContent = '請先開啟並儲存跨對話回憶。';
        return;
      }
      const rebuild = rebuildHistoryIndex();
      if (typeof rebuild !== 'function') return;
      button.disabled = true;
      const progressTimer = globalThis.setInterval(() => { void refreshHistoryRecallStatus(); }, 250);
      try {
        await rebuild();
      } finally {
        globalThis.clearInterval(progressTimer);
        button.disabled = false;
        await refreshHistoryRecallStatus();
      }
    });
  };

  return {
    ensureHistoryRecallSettingsControl,
    refreshHistoryRecallStatus,
    resolveHistoryRecallEnabled,
    bindHistoryIndexRebuild
  };
}
