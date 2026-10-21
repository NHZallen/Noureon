import { createMemorySummaryRuntimeService } from '../memory/memory-summary-runtime-service.js';
import { createMemorySummaryBootstrap } from '../memory/memory-summary-bootstrap.js';

/** Complete-memory maintenance and the explicitly refreshed display overview; returns the overview functions the settings use. */
export function createMemorySummaryLifecycle({
  getConversations,
  runtimeAppDataStore,
  replaceMemoryState,
  persistMemoryState,
  rebuildHistoryIndex,
  memoryModelClient,
  crypto,
  memoryWorkScheduler
} = {}) {
  const getMemoryState = () => runtimeAppDataStore.getMemoryState?.() || {};
  const memorySummaryRuntime = createMemorySummaryRuntimeService({
    getMemoryState,
    replaceMemoryState,
    persistMemoryState,
    rebuildHistoryIndex,
    createMemoryOverview: options => {
      if (typeof memoryModelClient?.summarizeOverview !== 'function') {
        throw new Error('Choose a memory model before updating the visible memory overview.');
      }
      return memoryModelClient.summarizeOverview(options);
    },
    createId: prefix => `${prefix}:${crypto.randomUUID()}`
  });
  const requestMemorySummaryRebuild = memorySummaryRuntime.rebuildSummary;
  const ensureMemorySummaryFresh = createMemorySummaryBootstrap({
    getMemoryState,
    getConversations,
    rebuildSummary: requestMemorySummaryRebuild
  });

  return {
    requestMemorySummaryRebuild,
    ensureMemorySummaryFresh,
    getOverview: memorySummaryRuntime.getOverview,
    updateSummary: memorySummaryRuntime.updateSummary,
    refreshOverview: memorySummaryRuntime.refreshOverview,
    getWorkStatus: memoryWorkScheduler.getStatus
  };
}
