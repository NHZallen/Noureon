// The memory state kept in step with its projection in the synced settings (config.memorySync): a new memory state is saved with its
// projection, and at the start of the page the projection of another device is merged into the local memory state.

import { memorySyncProjectionEquals, mergeSyncedMemoryState, projectMemoryStateForSync } from './memory-sync-projection.js';
import { consolidateOverlappingTopicSummaries } from './topic-summaries.js';
import { SERVICES, getService } from '../services.js';

export function createMemorySyncState({ state, runtimeAppDataStore, saveConfig, saveAppData, console = globalThis.console }) {
    // The projection is saved when it changed, or when it still has the summary fields of the earlier format.
    const projectionNeedsSave = (projection, nextProjection) => Boolean(projection?.memorySummary || projection?.memoryOverview)
        || !memorySyncProjectionEquals(projection, nextProjection);

    const replaceMemoryState = (nextMemoryState) => {
        const savedMemoryState = runtimeAppDataStore.replaceMemoryState(nextMemoryState);
        const nextProjection = projectMemoryStateForSync(savedMemoryState);
        if (projectionNeedsSave(state.config.memorySync, nextProjection)) {
            state.config.memorySync = nextProjection;
            void saveConfig().catch(error => console.warn('Memory sync projection could not save.', error));
        }
        void getService(SERVICES.memorySummarySync)?.captureMemoryState(savedMemoryState);
        return savedMemoryState;
    };

    const restoreMemorySync = async () => {
        const projection = state.config.memorySync;
        if (!projection) return;
        const currentMemoryState = runtimeAppDataStore.getMemoryState?.() || {};
        const restoredMemoryState = consolidateOverlappingTopicSummaries(mergeSyncedMemoryState(currentMemoryState, projection));
        runtimeAppDataStore.replaceMemoryState(restoredMemoryState);
        const nextProjection = projectMemoryStateForSync(restoredMemoryState);
        if (projectionNeedsSave(projection, nextProjection)) {
            state.config.memorySync = nextProjection;
            await saveConfig();
        }
        await saveAppData();
        void getService(SERVICES.memorySummarySync)?.captureMemoryState(restoredMemoryState);
    };

    return { replaceMemoryState, restoreMemorySync };
}
