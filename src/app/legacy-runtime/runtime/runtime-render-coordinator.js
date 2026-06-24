const RENDER_STEPS = [
  ['renderHistorySidebar', 'renderHistorySidebar'],
  ['renderFolders', 'renderFolders'],
  ['renderAstras', 'renderAstras'],
  ['renderChat', 'renderChat'],
  ['renderArchivedChats', 'renderArchivedChats'],
  ['renderBatchActionBar', 'renderBatchActionBar'],
  ['renderFilePreviews', 'renderFilePreviews'],
  ['applyLanguage', 'applyLanguage']
];

export function createRuntimeRenderCoordinator({
  renderHistorySidebar,
  renderFolders,
  renderAstras,
  renderChat,
  renderArchivedChats,
  renderBatchActionBar,
  renderFilePreviews,
  applyLanguage,
  logger
} = {}) {
  const callbacks = {
    renderHistorySidebar,
    renderFolders,
    renderAstras,
    renderChat,
    renderArchivedChats,
    renderBatchActionBar,
    renderFilePreviews,
    applyLanguage
  };

  const warnMissingCallback = (name) => {
    if (typeof logger?.warn === 'function') {
      logger.warn(`[runtime-render-coordinator] Missing render callback: ${name}`);
    }
  };

  return {
    renderAll() {
      for (const [name, callbackKey] of RENDER_STEPS) {
        const callback = callbacks[callbackKey];
        if (typeof callback !== 'function') {
          warnMissingCallback(name);
          continue;
        }
        callback();
      }
    }
  };
}
