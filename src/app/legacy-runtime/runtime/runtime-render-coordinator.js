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

const SIDEBAR_RENDER_STEPS = RENDER_STEPS.filter(([name]) => (
  name !== 'renderChat' && name !== 'renderFilePreviews' && name !== 'applyLanguage'
));

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

  const renderSteps = (steps) => {
    for (const [name, callbackKey] of steps) {
        const callback = callbacks[callbackKey];
        if (typeof callback !== 'function') {
          warnMissingCallback(name);
          continue;
        }
        callback();
    }
  };

  return {
    renderAll() {
      renderSteps(RENDER_STEPS);
    },
    renderSidebar() {
      renderSteps(SIDEBAR_RENDER_STEPS);
    }
  };
}
