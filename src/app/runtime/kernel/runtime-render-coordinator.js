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
  logger,
  diagnostics = false
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

  const traceRender = (scope, options) => {
    if (!diagnostics || !options?.reason || typeof logger?.debug !== 'function') return;
    logger.debug(`[runtime-render-coordinator] ${scope}`, options);
  };

  const renderSteps = (steps, options) => {
    for (const [name, callbackKey] of steps) {
        const callback = callbacks[callbackKey];
        if (typeof callback !== 'function') {
          warnMissingCallback(name);
          continue;
        }
        callback(options);
    }
  };

  return {
    renderAll(options) {
      traceRender('renderAll', options);
      renderSteps(RENDER_STEPS, options);
    },
    renderSidebar(options) {
      traceRender('renderSidebar', options);
      renderSteps(SIDEBAR_RENDER_STEPS, options);
    }
  };
}
