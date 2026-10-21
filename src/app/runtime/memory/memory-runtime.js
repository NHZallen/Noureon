// The memory of the page (memory v2): the index of past conversations and its recall, what is learned from each finished turn, the
// topic summaries and the memory summary, and the work that keeps them in step when a conversation is deleted. Made once with the
// workspace features (shell/workspace-features.js); the memory functions it returns are what the settings, the reply and the
// trash reach.

import { createMemoryCaptureService } from './memory-capture-service.js';
import { createMemoryWorkScheduler } from './memory-work-scheduler.js';
import { createGeminiEmbeddingClient } from './gemini-embedding-client.js';
import { createHistoryIndexStore } from './history-index-store.js';
import { createHistoryIndexPersistenceRuntime } from './history-index-persistence-runtime.js';
import { createHistoryIndexingService } from './history-indexing-service.js';
import { createHistoryRetrievalService } from './history-retrieval-service.js';
import { createHistoryRecallRuntime } from './history-recall-runtime.js';
import { createDeviceHistoryRecallConsentRuntime } from './device-history-recall-consent.js';
import { memorySyncProjectionEquals, projectMemoryStateForSync } from './memory-sync-projection.js';
import { createHistoryIndexRebuildService } from './history-index-rebuild-service.js';
import { createTopicSummaryService } from './topic-summaries.js';
import { createMemoryInvalidationService } from './memory-invalidation-service.js';
import { createMediaMemoryService } from './media-memory-service.js';
import { createMemoryTaskClients } from './memory-task-clients.js';
import { createConfiguredMemoryModelClient } from './memory-model-runtime-client.js';
import { createMemorySummaryLifecycle } from '../shell/memory-summary-lifecycle.js';
import { createHistoryIndexAuditService } from './history-index-audit-service.js';
import { hasCurrentHistoryIndexRecords, migrateHistoryIndexSourceFingerprint } from './history-index-records.js';
import { createHistoryIndexSourceRepair } from './history-index-source-repair.js';
import { createDeviceDerivedMemoryRuntime } from './device-derived-memory-persistence.js';
import { SERVICES, getService } from '../services.js';

export function createMemoryRuntime({
    document, Event, fetch, crypto, setTimeout, clearTimeout, console, runtimeConfigAccess, runtimeAppDataStore, liveConversationsBridge,
    getCurrentUser, runtimeStorageAdapter, models: MODELS, runMemoryModel, modelSupportsVision, getApiKeyForProvider, hashString,
    saveAppData, saveConfig
}) {
    const getConfig = () => runtimeConfigAccess.getConfig();
    const getConversations = () => liveConversationsBridge.getConversations();
    const historyIndex = createHistoryIndexStore();
    const getMemoryOwner = () => getCurrentUser()?.username || 'anonymous';
    const notifyHistoryIndexChanged = () => {
        if (typeof document?.dispatchEvent === 'function' && typeof Event === 'function') {
            document.dispatchEvent(new Event('noureon:history-index-changed'));
        }
    };
    const historyIndexPersistenceRuntime = createHistoryIndexPersistenceRuntime({
        index: historyIndex,
        storage: runtimeStorageAdapter,
        getOwner: getMemoryOwner,
        onLoaded: notifyHistoryIndexChanged,
        logger: console
    });
    const historyIndexPersistence = historyIndexPersistenceRuntime.persistence;
    const ensureHistoryIndexReady = historyIndexPersistenceRuntime.ensureReady;
    const historyIndexingService = createHistoryIndexingService({
        index: historyIndex,
        embeddingClient: createGeminiEmbeddingClient({
            getApiKey: () => getApiKeyForProvider('gemini'),
            fetchImpl: fetch
        }),
        persistence: null
    });
    const memoryModelClient = createConfiguredMemoryModelClient({
        getConfig,
        models: MODELS,
        runMemoryModel,
        modelSupportsVision
    });
    const memoryTaskClients = createMemoryTaskClients({
        memoryModelClient,
        getGeminiApiKey: () => getApiKeyForProvider('gemini'),
        fetchImpl: fetch
    });
    const localMemoryStorage = runtimeStorageAdapter?.getItem
    ? runtimeStorageAdapter
    : {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {}
    };
    const deviceDerivedMemoryRuntime = createDeviceDerivedMemoryRuntime({
        storage: localMemoryStorage,
        storageKey: () => `noureon:derived-memory:v1:${getMemoryOwner()}`,
        fallbackStorageKeys: () => getMemoryOwner() === 'anonymous'
        ? []
        : ['noureon:derived-memory:v1:anonymous'],
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        replaceMemoryState: nextState => runtimeAppDataStore.replaceMemoryState?.(nextState),
        saveAppData,
        logger: console
    });
    const ensureDeviceDerivedMemoryReady = deviceDerivedMemoryRuntime.ensureReady;
    const persistMemoryState = deviceDerivedMemoryRuntime.persist;
    const deviceHistoryRecallConsent = createDeviceHistoryRecallConsentRuntime({
        storage: localMemoryStorage,
        storageKey: () => `noureon:history-recall-device-consent:v1:${getMemoryOwner()}`,
        // The setting is synced with the account, and so is the consent that was given when it was turned on.
        isImplied: () => getConfig()?.historyRecallEnabled === true,
        logger: console,
        onLoaded: notifyHistoryIndexChanged
    });
    const ensureHistoryRecallConsentReady = deviceHistoryRecallConsent.ensureReady;
    const historyRetrievalService = createHistoryRetrievalService({
        index: historyIndex,
        embeddingClient: createGeminiEmbeddingClient({
            getApiKey: () => getApiKeyForProvider('gemini'),
            fetchImpl: fetch
        }),
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        getConversations,
        modelQueryResolver: memoryTaskClients.queryResolver
    });
    let historyIndexRebuildStatus = { state: 'idle', completed: 0, total: 0, indexed: 0, skipped: 0, failed: 0 };
    let historyIndexOptimizeStatus = { state: 'idle', completed: 0, total: 0, repaired: 0, removed: 0, failed: 0 };
    const historyRecallRuntime = createHistoryRecallRuntime({
        consent: deviceHistoryRecallConsent,
        retrieval: historyRetrievalService,
        ensureIndexReady: ensureHistoryIndexReady,
        ensureConsentReady: ensureHistoryRecallConsentReady,
        ensureDerivedReady: ensureDeviceDerivedMemoryReady,
        getIndexStatus: () => ({
            indexLoaded: historyIndexPersistenceRuntime.isLoaded(),
            indexRecordCount: historyIndex.getAll().length,
            activeOwnerKind: getMemoryOwner() === 'anonymous' ? 'anonymous' : 'authenticated',
            persistence: historyIndexPersistence?.getDiagnostics?.() || null,
            rebuild: historyIndexRebuildStatus,
            optimize: historyIndexOptimizeStatus
        })
    });
    const replaceMemoryState = nextMemoryState => {
        const savedMemoryState = runtimeAppDataStore.replaceMemoryState?.(nextMemoryState);
        const nextState = savedMemoryState || nextMemoryState;
        const nextProjection = projectMemoryStateForSync(nextState);
        const hasLegacySummaryProjection = Boolean(
            getConfig().memorySync?.memorySummary || getConfig().memorySync?.memoryOverview
        );
        if (hasLegacySummaryProjection || !memorySyncProjectionEquals(getConfig().memorySync, nextProjection)) {
            getConfig().memorySync = nextProjection;
            void saveConfig().catch(error => console.warn('Memory sync projection could not save.', error));
        }
        void getService(SERVICES.memorySummarySync)?.captureMemoryState(nextState);
        return savedMemoryState;
    };
    const mediaMemoryService = createMediaMemoryService({
        mediaClient: memoryTaskClients.mediaClient,
        hashString,
        createId: prefix => `${prefix}:${crypto.randomUUID()}`
    });
    const topicSummaryService = createTopicSummaryService({
        index: historyIndex,
        topicClient: memoryTaskClients.topicClient,
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        replaceMemoryState,
        createId: prefix => `${prefix}:${crypto.randomUUID()}`
    });
    const memoryCaptureService = createMemoryCaptureService({
        captureClient: memoryTaskClients.captureClient,
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        replaceMemoryState,
        indexCapsule: options => historyIndexingService.indexCapsule(options),
        indexConversationFragments: options => historyIndexingService.indexConversationFragments(options),
        indexMediaMemory: options => historyIndexingService.indexMediaMemory(options),
        updateTopicSummary: options => topicSummaryService.updateForCapsule(options),
        enrichTurns: options => mediaMemoryService.enrichTurns(options),
        createId: prefix => `${prefix}:${crypto.randomUUID()}`
    });
    const captureCompletedTurnAndPersist = async options => {
        const previousMemoryState = runtimeAppDataStore.getMemoryState?.();
        try {
            return await memoryCaptureService.captureCompletedTurn(options);
        } finally {
            if (runtimeAppDataStore.getMemoryState?.() !== previousMemoryState) {
                await persistMemoryState();
                if (historyIndexPersistence?.save) await historyIndexPersistence.save();
                notifyHistoryIndexChanged();
            }
        }
    };
    const memoryInvalidationService = createMemoryInvalidationService({
        index: historyIndex,
        persistence: historyIndexPersistence,
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        replaceMemoryState
    });
    const invalidateMemoryConversation = async ({ skipSummaryRebuild = false, ...options } = {}) => {
        memoryWorkScheduler.cancelConversation(options?.conversationId);
        const result = await memoryInvalidationService.invalidateConversation(options);
        await persistMemoryState({
            allowEmpty: true,
            emptyReason: 'permanent-deletion'
        });
        notifyHistoryIndexChanged();
        if (!skipSummaryRebuild && result.memorySummaryRefreshRequired) {
            void requestMemorySummaryRebuild().catch(error => console.warn('Memory summary could not refresh after deletion.', error));
        }
        return result;
    };
    const repairHistoryIndexedSource = createHistoryIndexSourceRepair({
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        indexCapsule: options => historyIndexingService.indexCapsule(options),
        indexConversationFragments: options => historyIndexingService.indexConversationFragments(options),
        indexMediaMemory: options => historyIndexingService.indexMediaMemory(options)
    });
    const historyIndexRebuildService = createHistoryIndexRebuildService({
        getConversations,
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        captureCompletedTurn: options => memoryCaptureService.captureCompletedTurn(options),
        hashString,
        hasIndexedSource: options => hasCurrentHistoryIndexRecords({
            ...options,
            records: historyIndex.getAll(),
            mediaMemories: runtimeAppDataStore.getMemoryState?.()?.mediaMemories || []
        }),
        migrateSourceFingerprint: options => migrateHistoryIndexSourceFingerprint({
            ...options,
            memoryState: runtimeAppDataStore.getMemoryState?.() || {},
            replaceMemoryState,
            index: historyIndex
        }),
        repairIndexedSource: repairHistoryIndexedSource
    });
    let historyIndexWorkPromise = null;
    const rebuildHistoryIndex = options => {
        if (historyIndexWorkPromise) return historyIndexWorkPromise;
        historyIndexWorkPromise = (async () => {
            await Promise.all([ensureHistoryIndexReady(), ensureDeviceDerivedMemoryReady()]);
            try {
                return await historyIndexRebuildService.rebuild({
                    ...options,
                    onProgress: status => {
                        historyIndexRebuildStatus = status;
                        notifyHistoryIndexChanged();
                    }
                });
            } finally {
                await persistMemoryState();
                if (historyIndexPersistence?.save) {
                    await historyIndexPersistence.save();
                }
                notifyHistoryIndexChanged();
            }
        })().finally(() => { historyIndexWorkPromise = null; });
        return historyIndexWorkPromise;
    };
    const historyIndexAuditService = createHistoryIndexAuditService({
        getConversations,
        getMemoryState: () => runtimeAppDataStore.getMemoryState?.() || {},
        index: historyIndex,
        hashString,
        captureCompletedTurn: options => memoryCaptureService.captureCompletedTurn(options),
        indexCapsule: options => historyIndexingService.indexCapsule(options),
        indexMediaMemory: options => historyIndexingService.indexMediaMemory(options),
        repairIndexedSource: repairHistoryIndexedSource,
        persistence: historyIndexPersistence,
        persistMemoryState
    });
    let latestHistoryIndexAudit = null;
    const auditHistoryIndex = async () => {
        if (historyIndexWorkPromise) await historyIndexWorkPromise;
        await Promise.all([ensureHistoryIndexReady(), ensureDeviceDerivedMemoryReady()]);
        latestHistoryIndexAudit = await historyIndexAuditService.audit();
        return latestHistoryIndexAudit;
    };
    const optimizeHistoryIndex = () => {
        if (historyIndexWorkPromise) return historyIndexWorkPromise;
        historyIndexWorkPromise = (async () => {
            await Promise.all([ensureHistoryIndexReady(), ensureDeviceDerivedMemoryReady()]);
            const report = latestHistoryIndexAudit || await historyIndexAuditService.audit();
            try {
                return await historyIndexAuditService.optimize(report, {
                    onProgress: status => {
                        historyIndexOptimizeStatus = { state: 'running', ...status };
                        notifyHistoryIndexChanged();
                    }
                });
            } finally {
                historyIndexOptimizeStatus = {
                    ...historyIndexOptimizeStatus,
                    state: 'complete'
                };
                latestHistoryIndexAudit = null;
                notifyHistoryIndexChanged();
            }
        })().finally(() => { historyIndexWorkPromise = null; });
        return historyIndexWorkPromise;
    };
    const memoryWorkScheduler = createMemoryWorkScheduler({
        runJob: async job => {
            await Promise.all([ensureHistoryIndexReady(), ensureDeviceDerivedMemoryReady()]);
            return captureCompletedTurnAndPersist(job);
        },
        schedule: (callback, delay) => setTimeout(callback, delay),
        cancel: timer => clearTimeout(timer)
    });
    const memorySummary = createMemorySummaryLifecycle({
        getConversations,
        runtimeAppDataStore,
        replaceMemoryState,
        persistMemoryState,
        rebuildHistoryIndex,
        memoryModelClient,
        crypto,
        memoryWorkScheduler
    });
    const { requestMemorySummaryRebuild, ensureMemorySummaryFresh } = memorySummary;
    // The functions the settings, the requests, imports and the trash use (through getMemory() of shell.js).
    const memory = Object.freeze({
        retrieveHistory: historyRecallRuntime.retrieve,
        grantHistoryRecallConsent: historyRecallRuntime.grant,
        revokeHistoryRecallConsent: historyRecallRuntime.revoke,
        getHistoryRecallStatus: historyRecallRuntime.getStatus,
        invalidateConversation: invalidateMemoryConversation,
        rebuildHistoryIndex,
        auditHistoryIndex,
        optimizeHistoryIndex,
        getOverview: memorySummary.getOverview,
        updateSummary: memorySummary.updateSummary,
        refreshOverview: memorySummary.refreshOverview,
        getWorkStatus: memorySummary.getWorkStatus
    });
    return { replaceMemoryState, captureCompletedTurnAndPersist, invalidateMemoryConversation, memoryWorkScheduler, ensureMemorySummaryFresh, memory };
}
