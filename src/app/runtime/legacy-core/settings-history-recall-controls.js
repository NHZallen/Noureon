export function createSettingsHistoryRecallControls({
  document,
  elements,
  legacyRuntimeContext,
  getConfig,
  getText = (_key, fallback) => fallback
} = {}) {
  let statusUpdatesBound = false;
  const formatText = (key, fallback, values = {}) => Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    getText(key, fallback)
  );
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
  const auditHistoryIndex = () => typeof legacyRuntimeContext?.resolveOptionalBinding === 'function'
    ? legacyRuntimeContext.resolveOptionalBinding('memory.auditHistoryIndex')
    : null;
  const optimizeHistoryIndex = () => typeof legacyRuntimeContext?.resolveOptionalBinding === 'function'
    ? legacyRuntimeContext.resolveOptionalBinding('memory.optimizeHistoryIndex')
    : null;

  const ensureHistoryRecallSettingsControl = () => {
    const existingToggle = document.getElementById('history-recall-toggle-switch');
    if (existingToggle) {
      elements.historyRecallToggleSwitch = existingToggle;
      elements.historyRecallStatus = document.getElementById('history-recall-status');
      elements.rebuildHistoryIndexButton = document.getElementById('rebuild-history-index-button');
      elements.auditHistoryIndexButton = document.getElementById('audit-history-index-button');
      const title = document.getElementById('history-recall-title');
      const description = document.getElementById('history-recall-description');
      if (title) {
        title.dataset.langKey = 'historyRecallTitle';
        title.textContent = getText('historyRecallTitle', '跨對話回憶');
      }
      if (description) {
        description.dataset.langKey = 'historyRecallDescription';
        description.textContent = getText('historyRecallDescription', '開啟後，這台裝置會把目前問題傳給 Gemini Embedding 2，用本機索引找最多三段相關的舊對話摘要。聊天畫面不會顯示來源。');
      }
      if (elements.rebuildHistoryIndexButton) {
        elements.rebuildHistoryIndexButton.dataset.langKey = 'historyRecallBuildIndex';
        elements.rebuildHistoryIndexButton.textContent = getText('historyRecallBuildIndex', '建立本機索引');
      }
      if (elements.auditHistoryIndexButton) {
        elements.auditHistoryIndexButton.dataset.langKey = 'historyRecallAuditIndex';
        elements.auditHistoryIndexButton.textContent = getText('historyRecallAuditIndex', '檢查本機索引');
      }
      return;
    }
    const section = document.getElementById('memory-section');
    if (!section) return;
    const container = document.createElement('div');
    container.id = 'history-recall-control';
    container.className = 'mt-5 pt-5 border-t border-[var(--border-color)] space-y-2';
    container.innerHTML = `
      <div class="flex items-center justify-between">
        <label id="history-recall-title" for="history-recall-toggle-switch" class="flex-1 text-sm font-medium" data-lang-key="historyRecallTitle">${getText('historyRecallTitle', '跨對話回憶')}</label>
        <div class="relative inline-block w-12 h-6 mr-2 align-middle select-none transition duration-200 ease-in">
          <input type="checkbox" id="history-recall-toggle-switch" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
          <label for="history-recall-toggle-switch" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
        </div>
      </div>
      <p id="history-recall-description" class="text-xs text-[var(--text-secondary)]" data-lang-key="historyRecallDescription">${getText('historyRecallDescription', '開啟後，這台裝置會把目前問題傳給 Gemini Embedding 2，用本機索引找最多三段相關的舊對話摘要。聊天畫面不會顯示來源。')}</p>
      <p id="history-recall-status" class="text-xs text-[var(--text-secondary)]"></p>
      <div class="flex flex-wrap gap-2">
        <button id="audit-history-index-button" type="button" class="px-3 py-1.5 rounded-md btn-outline-white text-sm" data-lang-key="historyRecallAuditIndex">${getText('historyRecallAuditIndex', '檢查本機索引')}</button>
        <button id="rebuild-history-index-button" type="button" class="px-3 py-1.5 rounded-md btn-outline-white text-sm" data-lang-key="historyRecallBuildIndex">${getText('historyRecallBuildIndex', '建立本機完整索引')}</button>
      </div>
    `;
    const autoMemoryRow = elements.autoMemoryToggleSwitch?.closest?.('.flex.items-center.justify-between');
    if (autoMemoryRow?.after) autoMemoryRow.after(container);
    else section.appendChild(container);
    elements.historyRecallToggleSwitch = container.querySelector('#history-recall-toggle-switch');
    elements.historyRecallStatus = container.querySelector('#history-recall-status');
    elements.rebuildHistoryIndexButton = container.querySelector('#rebuild-history-index-button');
    elements.auditHistoryIndexButton = container.querySelector('#audit-history-index-button');
  };

  const refreshHistoryRecallStatus = async ({ preferCurrentCount = false } = {}) => {
    const statusElement = elements.historyRecallStatus;
    if (!statusElement) return;
    const getStatus = getHistoryRecallStatus();
    const status = typeof getStatus === 'function' ? await getStatus() : null;
    if (!status?.consentLoaded || !status.indexLoaded) {
      statusElement.textContent = getText('historyRecallStatusLoading', '正在讀取此裝置的本機索引…');
      return;
    }
    const rebuild = status.rebuild || {};
    if (rebuild.state === 'running') {
      statusElement.textContent = formatText('historyRecallStatusBuilding', '建立索引中：{completed}／{total}。完成 {total}／{total} 才表示全部完成。', rebuild);
      return;
    }
    if (rebuild.state === 'complete' && !preferCurrentCount) {
      statusElement.textContent = formatText('historyRecallStatusComplete', '索引已完成：{completed}／{total}（新增 {indexed}，略過 {skipped}，失敗 {failed}）。', rebuild);
      return;
    }
    if (getConfig().historyRecallEnabled && !status.consented) {
      statusElement.textContent = getText('historyRecallStatusConsentRequired', '此裝置尚未同意；目前不會檢索或傳送舊對話。儲存設定時可啟用。');
      return;
    }
    statusElement.textContent = getConfig().historyRecallEnabled
      ? formatText('historyRecallStatusEnabled', '已啟用，本機索引有 {count} 筆對話膠囊。', { count: status.indexRecordCount })
      : getText('historyRecallStatusDisabled', '目前關閉；不會查詢舊對話或呼叫 Embedding。');
  };

  const bindHistoryIndexStatusUpdates = () => {
    if (statusUpdatesBound || typeof document?.addEventListener !== 'function') return;
    statusUpdatesBound = true;
    document.addEventListener('noureon:history-index-changed', () => {
      void refreshHistoryRecallStatus({ preferCurrentCount: true });
    });
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
      getText('historyRecallConsentMessage', '啟用跨對話回憶後，這台裝置會把你目前的問題傳給 Gemini Embedding 2，並從本機索引找相關舊對話。向量與索引不會同步。要在這台裝置啟用嗎？'),
      getText('historyRecallConsentTitle', '啟用跨對話回憶')
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
        if (elements.historyRecallStatus) elements.historyRecallStatus.textContent = getText('historyRecallEnableFirst', '請先開啟並儲存跨對話回憶。');
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

  const bindHistoryIndexAudit = ({ showCustomDialog }) => {
    const button = elements.auditHistoryIndexButton;
    if (!button || button.dataset.memoryAuditBound === 'true') return;
    button.dataset.memoryAuditBound = 'true';
    button.addEventListener('click', async () => {
      const audit = auditHistoryIndex();
      if (typeof audit !== 'function') return;
      button.disabled = true;
      try {
        const report = await audit();
        const message = formatText(
          'historyRecallAuditResult',
          '正常：{healthy}\n缺少：{missing}\n過期：{outdated}\n重複或孤兒：{extra}',
          report
        );
        if (!report.repairable) {
          await showCustomDialog({
            title: getText('historyRecallAuditTitle', '索引檢查結果'),
            message: `${message}\n\n${getText('historyRecallAuditHealthy', '目前不需要優化。')}`,
            buttons: [{ text: getText('confirm', '確定'), class: 'px-4 py-2 rounded-md btn-primary', value: () => false }]
          });
          return;
        }
        const shouldOptimize = await showCustomDialog({
          title: getText('historyRecallAuditTitle', '索引檢查結果'),
          message,
          buttons: [
            { text: getText('cancel', '取消'), class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md', value: () => false },
            { text: getText('historyRecallOptimize', '優化'), class: 'px-4 py-2 rounded-md btn-primary', value: () => true }
          ]
        });
        if (!shouldOptimize) return;
        const optimize = optimizeHistoryIndex();
        if (typeof optimize !== 'function') return;
        const result = await optimize();
        await showCustomDialog({
          title: getText('historyRecallOptimizeComplete', '索引優化完成'),
          message: formatText('historyRecallOptimizeResult', '修復：{repaired}\n移除：{removed}\n未變更：{unchanged}\n失敗：{failed}', result),
          buttons: [{ text: getText('confirm', '確定'), class: 'px-4 py-2 rounded-md btn-primary', value: () => true }]
        });
      } finally {
        button.disabled = false;
        await refreshHistoryRecallStatus({ preferCurrentCount: true });
      }
    });
  };

  return {
    ensureHistoryRecallSettingsControl,
    refreshHistoryRecallStatus,
    resolveHistoryRecallEnabled,
    bindHistoryIndexRebuild,
    bindHistoryIndexAudit,
    bindHistoryIndexStatusUpdates
  };
}
