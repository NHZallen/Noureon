import { createMemorySummaryRuntimeService } from '../memory/memory-summary-runtime-service.js';
import { createMemorySummaryBootstrap } from '../memory/memory-summary-bootstrap.js';

/** Connects complete-memory maintenance and the explicitly refreshed display overview to legacy bindings. */
export function createLegacyMemorySummaryLifecycle({
  state,
  runtimeAppDataStore,
  replaceMemoryState,
  persistMemoryState,
  rebuildHistoryIndex,
  memoryModelClient,
  crypto,
  legacyRuntimeContext,
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
    getConversations: () => state.conversations,
    rebuildSummary: requestMemorySummaryRebuild
  });

  legacyRuntimeContext.registerLazyBinding('memory.getOverview', () => memorySummaryRuntime.getOverview);
  legacyRuntimeContext.registerLazyBinding('memory.updateSummary', () => memorySummaryRuntime.updateSummary);
  legacyRuntimeContext.registerLazyBinding('memory.refreshOverview', () => memorySummaryRuntime.refreshOverview);
  legacyRuntimeContext.registerLazyBinding('memory.getWorkStatus', () => memoryWorkScheduler.getStatus);

  return { requestMemorySummaryRebuild, ensureMemorySummaryFresh };
}
