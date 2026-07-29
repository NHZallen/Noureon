import {
  applyManualMemorySummaryEdit,
  markMemoryOverviewNeedsRefresh,
  normalizeMemoryOverview,
  normalizeMemorySummary,
  reconcileMemoryOverview
} from './memory-summary-state.js';

export function createMemorySummaryRuntimeService({
  getMemoryState,
  replaceMemoryState,
  persistMemoryState,
  rebuildHistoryIndex,
  createMemoryOverview,
  createId = prefix => `${prefix}:${crypto.randomUUID()}`
} = {}) {
  if (typeof getMemoryState !== 'function' || typeof replaceMemoryState !== 'function') {
    throw new TypeError('Memory summary runtime service requires memory state access.');
  }
  if (typeof persistMemoryState !== 'function' || typeof rebuildHistoryIndex !== 'function' || typeof createMemoryOverview !== 'function') {
    throw new TypeError('Memory summary runtime service requires persistence, rebuilding, and overview creation.');
  }

  let rebuilding = null;
  let refreshingOverview = null;
  const getSummary = () => getMemoryState()?.memorySummary || null;
  const getOverview = () => getMemoryState()?.memoryOverview || null;

  const updateSummary = async ({ title, content, key, sectionId } = {}) => {
    const memoryState = getMemoryState() || {};
    const memorySummary = applyManualMemorySummaryEdit({
      summary: memoryState.memorySummary,
      title,
      content,
      key,
      sectionId,
      createId
    });
    replaceMemoryState({
      ...memoryState,
      memorySummary,
      memoryOverview: markMemoryOverviewNeedsRefresh({ overview: memoryState.memoryOverview })
    });
    await persistMemoryState();
    // A direct addition or edit is already saved and authoritative. Queue an
    // immediate model reconciliation as well so the rest of the compact
    // current-state view can catch up without asking the user to approve it.
    void rebuildSummary().catch(() => {});
    return memorySummary;
  };

  const rebuildSummary = () => {
    if (rebuilding) return rebuilding;
    rebuilding = (async () => {
      const memoryState = getMemoryState() || {};
      replaceMemoryState({
        ...memoryState,
        memorySummary: {
          ...normalizeMemorySummary(memoryState.memorySummary || {}),
          status: 'pending',
          lastError: '',
          needsRefresh: true
        },
        memoryOverview: markMemoryOverviewNeedsRefresh({ overview: memoryState.memoryOverview })
      });
      await persistMemoryState();
      try {
        const result = await rebuildHistoryIndex({ forceCapture: true });
        if (result?.failed > 0) {
          const latest = getMemoryState() || {};
          if (latest.memorySummary) {
            replaceMemoryState({
              ...latest,
              memorySummary: {
                ...latest.memorySummary,
                status: 'failed',
                lastError: `${result.failed} memory task${result.failed === 1 ? '' : 's'} failed.`,
                needsRefresh: true
              }
            });
            await persistMemoryState();
          }
        }
        return result;
      } catch (error) {
        const latest = getMemoryState() || {};
        if (latest.memorySummary) {
          replaceMemoryState({
            ...latest,
            memorySummary: {
              ...latest.memorySummary,
              status: 'failed',
              lastError: String(error?.message || error),
              needsRefresh: true
            }
          });
          await persistMemoryState();
        }
        throw error;
      }
    })().finally(() => { rebuilding = null; });
    return rebuilding;
  };

  const refreshOverview = () => {
    if (refreshingOverview) return refreshingOverview;
    refreshingOverview = (async () => {
      const memoryState = getMemoryState() || {};
      const memorySummary = normalizeMemorySummary(memoryState.memorySummary || {});
      if (memorySummary.sections.length === 0) {
        const memoryOverview = normalizeMemoryOverview({
          ...memoryState.memoryOverview,
          overview: '',
          sections: [],
          status: 'idle',
          lastError: '',
          needsRefresh: false,
          basedOnMemorySummaryUpdatedAt: memorySummary.updatedAt
        });
        replaceMemoryState({ ...memoryState, memoryOverview });
        await persistMemoryState();
        return { skipped: true };
      }
      const pendingOverview = normalizeMemoryOverview({
        ...memoryState.memoryOverview,
        status: 'pending',
        lastError: '',
        needsRefresh: true
      });
      replaceMemoryState({ ...memoryState, memoryOverview: pendingOverview });
      await persistMemoryState();
      try {
        const patch = await createMemoryOverview({ memorySummary });
        const latest = getMemoryState() || {};
        const canonicalChanged = latest.memorySummary?.updatedAt !== memorySummary.updatedAt;
        const memoryOverview = reconcileMemoryOverview({
          overview: latest.memoryOverview,
          patch,
          memorySummary: latest.memorySummary || memorySummary,
          createId
        });
        replaceMemoryState({
          ...latest,
          memoryOverview: canonicalChanged
            ? markMemoryOverviewNeedsRefresh({ overview: memoryOverview })
            : memoryOverview
        });
        await persistMemoryState();
        return { refreshed: !canonicalChanged, stale: canonicalChanged };
      } catch (error) {
        const latest = getMemoryState() || {};
        replaceMemoryState({
          ...latest,
          memoryOverview: normalizeMemoryOverview({
            ...latest.memoryOverview,
            status: 'failed',
            lastError: String(error?.message || error),
            needsRefresh: true
          })
        });
        await persistMemoryState();
        throw error;
      }
    })().finally(() => { refreshingOverview = null; });
    return refreshingOverview;
  };

  return { getSummary, getOverview, updateSummary, rebuildSummary, refreshOverview };
}
