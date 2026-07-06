import { installTouchGuards } from '/src/pwa/touch-guards.js';
import { registerServiceWorker } from '/src/pwa/register-service-worker.js';
import { normalizeFolderColorSelection, resolveFolderColor } from '/src/utils/folder-colors.js';
import { getTextColorForBackground } from '/src/utils/color-contrast.js';
import { getMessageTypeIcon } from '/src/app/legacy-runtime/features/message-type-icon.js';
import { formatFullTimestamp } from '/src/app/legacy-runtime/features/date-formatting.js';
import { buildTimeDistributionChartData } from '/src/app/legacy-runtime/features/time-distribution-chart-data.js';
import { buildConversationMobileContextMenuMarkup, buildFolderMobileContextMenuMarkup, buildAstraMobileContextMenuMarkup } from '/src/app/legacy-runtime/features/mobile-context-menu-markup.js';
import { getOpenCouncilDetailKeys, restoreOpenCouncilDetails, isCouncilComparisonSummary, normalizeCouncilComparisonDetails, hasUnclosedCouncilDetails } from '/src/app/legacy-runtime/features/streaming-council-details.js';
import { createStreamingTextFrameQueue } from '/src/app/legacy-runtime/features/streaming-text-frame-queue.js';
import { createTypewriterPlaybackController } from '/src/app/legacy-runtime/features/typewriter-playback-controller.js';
import { appendRendererTextGradually } from '/src/app/legacy-runtime/features/renderer-gradual-append-controller.js';
import { createStreamingMarkdownFeature } from '/src/app/legacy-runtime/features/streaming-markdown-renderer.js';
import { createSingleModelResponseLifecycle } from '/src/app/legacy-runtime/features/single-model-response-lifecycle.js';
import { runCouncilResponseRenderLifecycle } from '/src/app/legacy-runtime/features/council-response-render-lifecycle.js';
import { finalizeAssistantResponse, persistAssistantResponseError } from '/src/app/legacy-runtime/features/assistant-response-finalization.js';
import { runSubmitFinalCleanupLifecycle } from '/src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js';
import { applyModelMessagePostResponseActions } from '/src/app/legacy-runtime/features/model-message-post-response-actions.js';
import { buildMessageRenderView } from '/src/app/legacy-runtime/features/message-markup-renderer.js';
import { createMediaAttachmentRenderer as createArchivedMediaAttachmentRenderer } from '/src/app/legacy-runtime/features/media-attachment-renderer.js';
import { createMediaPreviewLifecycle as createArchivedMediaPreviewLifecycle } from '/src/app/legacy-runtime/features/media-preview-lifecycle.js';
import { createConversationViewRenderer as createArchivedConversationViewRenderer } from '/src/app/legacy-runtime/features/conversation-view-renderer.js';
import { createSidebarAstrasLifecycle } from '/src/app/legacy-runtime/features/sidebar-astras-lifecycle.js';
import { createModelUsageChartLifecycle } from '/src/app/legacy-runtime/features/model-usage-chart-lifecycle.js';
import { createLegacyRuntimeContext } from '/src/app/legacy-runtime/runtime/legacy-runtime-context.js';
import { createConversationStateAccess } from '/src/app/legacy-runtime/runtime/conversation-state-access.js';
import { createRuntimeRenderCoordinator } from '/src/app/legacy-runtime/runtime/runtime-render-coordinator.js';
import { createRuntimeDialogCoordinator } from '/src/app/legacy-runtime/runtime/runtime-dialog-coordinator.js';
import { createRuntimeConfigAccess } from '/src/app/legacy-runtime/runtime/runtime-config-access.js';
import { createRuntimeDomAccess } from '/src/app/legacy-runtime/runtime/runtime-dom-access.js';
import { createTrustedHtmlSanitizer, escapeHTML, getErrorMessage, hexToRgba, readErrorBody, renderUserText } from '/src/app/runtime/legacy-core/legacy-core-utilities.js';
import { createHistorySidebarHelpers } from '/src/app/runtime/legacy-core/history-sidebar-helpers.js';
import { createMarkdownRenderingHelpers } from '/src/app/runtime/legacy-core/markdown-rendering-helpers.js';
import { observeMessageCharts } from '/src/app/ui/charts/chart-renderer.js';
import { createActiveConversationStore } from '/src/app/runtime/kernel/active-conversation-store.js';
import { createLiveConversationsBridge } from '/src/app/runtime/kernel/live-conversations-bridge.js';
import { createLegacyRuntimeDomRegistry } from '/src/app/runtime/kernel/dom-registry.js';
import { createRuntimeAppKernel } from '/src/app/runtime-app.js';
import { createDialogNotificationLifecycle } from '/src/app/runtime/features/dialog-notification-lifecycle.js';
import { arrangeInputMediaPreview } from '/src/app/runtime/features/input-media-placement.js';
import { createCloudWorkspaceLiveLifecycle } from '/src/app/runtime/features/cloud-workspace-live-lifecycle.js';
import { createLegacyRuntimeStorageAdapter } from '/src/app/runtime/kernel/storage-adapter.js';
import { createLegacyRuntimeConfigPersistence } from '/src/app/runtime/kernel/config-persistence.js';
import { normalizeApiKeyValue, normalizeLoadedLegacyConfig } from '/src/app/runtime/kernel/config-normalization.js';
import { normalizeLoadedLegacyAppData } from '/src/app/runtime/kernel/app-data-normalization.js';
import { createLegacyRuntimeAppDataPersistence } from '/src/app/runtime/kernel/app-data-persistence.js';
import { createSensitiveConfigPersistence, createSensitiveConfigStore } from '/src/app/runtime/security/sensitive-config-store.js';
import { removeSensitiveConfig } from '/src/app/runtime/security/sensitive-config-redaction.js';
import { CHEAP_MODEL_ID, COUNCIL_MAX_MODELS, COUNCIL_MIN_MODELS, COUNCIL_RESPONSE_CHAR_LIMIT, COUNCIL_RETRY_DELAY_MS, COUNCIL_TEXT, MODELS, OPENROUTER_VISION_MODELS, createLegacyModelRegistry, getModelReasoningConfig, modelGeneratesImages, normalizeReasoningEffort } from '/src/app/runtime/legacy-core/model-registry.js';
import { createCloudConversationDeletion } from '/src/app/runtime/legacy-core/cloud-delete-lifecycle.js';

const legacyRuntimeContext = createLegacyRuntimeContext();
const resolveFoundationUpdateInputState = (...args) => legacyRuntimeContext.resolveBinding('input.updateInputState')(...args);
const { marked, DOMPurify, Chart, JSZip, Cropper, katex, Peer, QRCode, Html5Qrcode } = globalThis;
const i18n = globalThis.i18n;
const demoConversations = globalThis.demoConversations;
const OFFICIAL_ASTRAS = globalThis.OFFICIAL_ASTRAS;
const updateLogs = globalThis.updateLogs;
const sanitizeTrustedHTML = createTrustedHtmlSanitizer({ sanitizer: DOMPurify });

const postJsonWithReadableError = async (url, data, options = {}) => {
    const request = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', ...(options.headers || {}) },
        body: JSON.stringify(data),
        signal: options.signal
    };
    let response;
    try {
        response = await fetch(url, request);
    } catch (error) {
        if (options.allowOpaqueFallback !== false) {
            await fetch(url, { ...request, mode: 'no-cors' });
            return { ok: true, opaque: true };
        }
        throw error;
    }

    if (!response.ok) {
        const errorBody = await readErrorBody(response);
        throw new Error(getErrorMessage(errorBody, `HTTP ${response.status}`));
    }

    return response;
};

const getBackupUsername = (rawData) => rawData?.backup_identity?.username || rawData?.user_credentials?.username || '';

async function processInChunks(items, processFn, chunkSize = 50, onProgress) {
    const total = items.length;
    let index = 0;

    while (index < total) {
        const chunk = items.slice(index, index + chunkSize);
        await Promise.all(chunk.map((item) => processFn(item)));
        index += chunk.length;

        if (onProgress) {
            onProgress(index, total);
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('auth-container').classList.add('visible');
        import('/src/app/runtime/features/demo-model-homepage.js').then(({ setupDemoModelHomepage }) => setupDemoModelHomepage({ document, demoConversations }));
    });
        const ALL_ELEMENTS = createLegacyRuntimeDomRegistry();
        const runtimeDomAccess = createRuntimeDomAccess({
            getElements: () => ALL_ELEMENTS,
            logger: console
        });
        arrangeInputMediaPreview({
            document,
            inputMediaPreview: runtimeDomAccess.getOptionalElement('filePreviewContainer'),
            settingsButton: runtimeDomAccess.getOptionalElement('settingsBtn')
        });
        import { compareVersions } from '/src/app/legacy-runtime/features/version-compare.js';
        const FOLDER_COLORS = { black: '#000000',gray: '#808080', red: '#f87171', yellow: '#facc15', green: '#4ade80', blue: '#60a5fa', indigo: '#818cf8', purple: '#a78bfa', pink: '#f472b6' };
        const AI_BUBBLE_COLORS = { default: {light: '#f7f7f8'}, gray: {light: '#f3f4f6'}, blue: {light: '#eef6ff'}, green: {light: '#eef8f1'}, yellow: {light: '#fff9db'}, orange: {light: '#fff3e8'}, red: {light: '#fff1f2'}, purple: {light: '#f6f0ff'}, pink: {light: '#fff0f6'}, teal: {light: '#ecfdf7'} };
        const USER_BUBBLE_COLORS = { default: {light: '#e8f3ff'}, gray: {light: '#eef0f3'}, blue: {light: '#e8f3ff'}, green: {light: '#eaf7ef'}, yellow: {light: '#fff7d6'}, orange: {light: '#fff0e3'}, red: {light: '#ffedf0'}, purple: {light: '#f2ecff'}, pink: {light: '#ffedf5'}, teal: {light: '#e7f8f5'} };
        const UI_THEME_COLORS = { Red: '#ef4444', Orange: '#f97316', Amber: '#f59e0b', Yellow: '#eab308', Lime: '#84cc16', Green: '#22c55e', Emerald: '#10b981', Teal: '#14b8a6', Cyan: '#06b6d4', Sky: '#0ea5e9', Blue: '#3b82f6', Indigo: '#6366f1', Violet: '#8b5cf6', Purple: '#a855f7', Fuchsia: '#d946ef', Pink: '#ec4899', Rose: '#f43f5e', Slate: '#64748b' };
        const runtimeAppKernel = createRuntimeAppKernel({
            elements: ALL_ELEMENTS,
            defaultModelId: MODELS[0].id
        });
        const runtimeAppDataStore = runtimeAppKernel.appDataStore;
        const liveConversationsBridge = createLiveConversationsBridge({
            getConversations: () => runtimeAppDataStore.getConversations(),
            replaceConversations: (nextConversations) => runtimeAppDataStore.replaceConversations(nextConversations)
        });
        const activeConversationStore = createActiveConversationStore(null);
        const conversationStateAccess = createConversationStateAccess({
            getConversations: () => liveConversationsBridge.getConversations(),
            getCurrentConversationId: () => activeConversationStore.getActiveConversationId(),
            setCurrentConversationId: (id) => activeConversationStore.setActiveConversationId(id)
        });
        const runtimeConfigStore = runtimeAppKernel.configStore;
        const runtimeConfigAccess = createRuntimeConfigAccess({
            getConfig: () => runtimeConfigStore.getConfig(),
            replaceConfig: (nextConfig) => runtimeConfigStore.replaceConfig(nextConfig)
        });
        const getCouncilTexts = () => {
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            return COUNCIL_TEXT[uiLanguage] || COUNCIL_TEXT['zh-TW'];
        };
        const legacyModelRegistry = createLegacyModelRegistry({
            getConfig: () => runtimeConfigAccess.getConfig(),
            normalizeConversationModel: (conv) => normalizeConversationModel(conv)
        });
        const {
            getDefaultCouncilConfig,
            getCanonicalModelId,
            normalizeCouncilConfig,
            cloneCouncilConfig,
            isCouncilEnabled,
            getVisibleCouncilModels,
            getModelsByIds,
            getCouncilSelectedModels,
            getModelApiId,
            getProviderLabel,
            getModelFamilyKey,
            getModelFamilyName,
            modelSupportsUploadedFile,
            modelSupportsVision,
            modelSupportsDocumentUpload,
            modelSupportsCouncilTranslation,
            getCouncilTranslatorCandidates,
            modelSupportsSingleTranslation,
            getSingleTranslatorCandidates,
            getCouncilTranslatorModel,
            getSingleDocumentTranslatorModel,
            modelUsesNativeWebSearch,
            modelUsesTavilySearch,
            modelSupportsWebSearch,
            hasSingleDocumentAccess,
            hasSingleWebSearchAccess,
            getCouncilSharedSearchModel,
            hasCouncilWebSearchAccess,
            conversationNeedsTavilySearch,
            getModelTiers
        } = legacyModelRegistry;
        const getOutputMode = () => runtimeConfigAccess.getConfig().outputMode === 'realtime' ? 'realtime' : 'typewriter';
        const getModelRetirementLabel = (model) => {
            const retirementDate = model?.retirementDate || model?.deprecationDate || model?.sunsetDate;
            if (!retirementDate) return '';
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            const label = uiLanguage === 'en'
                ? 'Retires'
                : (uiLanguage === 'fr' ? 'Retrait' : 'Retires');
            return `${label} ${retirementDate}`;
        };
        const getModelPriceLabel = (model) => {
            if (!model) return '';
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            if (getModelTiers(model).includes('free')) return uiLanguage === 'en' ? 'Free' : 'Free';
            const priceKey = model.descriptionKey ? `${model.descriptionKey}_tier_paid` : '';
            const localizedPrice = priceKey ? i18n[uiLanguage]?.[priceKey] : '';
            if (localizedPrice) return localizedPrice;
            if (model.provider === 'gemini') return uiLanguage === 'en' ? 'Google API pricing' : 'Google API pricing';
            if (model.provider === 'openrouter') return uiLanguage === 'en' ? 'OpenRouter pricing' : 'OpenRouter pricing';
            if (model.provider === 'stepfun') return 'Step Plan credits';
            return uiLanguage === 'en' ? 'Provider pricing' : 'Provider pricing';
        };        const getCouncilRuntimeTexts = () => {
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            if (uiLanguage === 'en') {
                return {
                    visualOnly: 'visual participants',
                    skipped: 'skipped',
                    noVisionParticipants: 'At least one participant model must support images for this council request',
                    skippedVisualReason: 'Skipped because this model does not support the attached image/video',
                    sharedSearch: 'Shared search packet',
                    searchRunning: 'Searching once for shared council context',
                    searchDone: 'Shared search packet ready',
                    searchFailed: 'Shared search failed; continuing without it',
                    firstRound: 'Council members are thinking',
                    deliberation: 'Council members are revising',
                    synthesis: 'Synthesizer is combining the council',
                    completed: 'Council completed',
                    pending: 'Waiting',
                    running: 'Thinking',
                    done: 'Done',
                    failed: 'Failed',
                    skippedStatus: 'Skipped',
                    activeVisionNote: 'Only image-capable members will answer this image request.',
                    comparisonToggle: 'Summarize agreements and differences',
                    retrying: 'Retrying once',
                    councilLocked: 'Council is running; settings are locked until this reply finishes.',
                    searchManualNotice: 'Council mode does not enable Search automatically. Turn on Search before sending if this question needs current web information.',
                    searchEnabledNote: 'Search is on: the council will use one shared search packet.'
                };
            }
            if (uiLanguage === 'fr') {
                return {
                    visualOnly: 'visual participants',
                    skipped: 'skipped',
                    noVisionParticipants: 'At least one participant model must support images for this council request',
                    skippedVisualReason: 'Skipped because this model does not support the attached image/video',
                    sharedSearch: 'Shared search packet',
                    searchRunning: 'Searching once for shared council context',
                    searchDone: 'Shared search packet ready',
                    searchFailed: 'Shared search failed; continuing without it',
                    firstRound: 'Council members are thinking',
                    deliberation: 'Council members are revising',
                    synthesis: 'Synthesizer is combining the council',
                    completed: 'Council completed',
                    pending: 'Waiting',
                    running: 'Thinking',
                    done: 'Done',
                    failed: 'Failed',
                    skippedStatus: 'Skipped',
                    activeVisionNote: 'Only image-capable members will answer this image request.',
                    comparisonToggle: 'Summarize agreements and differences',
                    retrying: 'Retrying once',
                    councilLocked: 'Council is running; settings are locked until this reply finishes.',
                    searchManualNotice: 'Council mode does not enable Search automatically. Turn on Search before sending if this question needs current web information.',
                    searchEnabledNote: 'Search is on: the council will use one shared search packet.'
                };
            }
            return {
                visualOnly: 'visual participants',
                skipped: 'skipped',
                noVisionParticipants: 'At least one participant model must support images for this council request',
                skippedVisualReason: 'Skipped because this model does not support the attached image/video',
                sharedSearch: 'Shared search packet',
                searchRunning: 'Searching once for shared council context',
                searchDone: 'Shared search packet ready',
                searchFailed: 'Shared search failed; continuing without it',
                firstRound: 'Council members are thinking',
                deliberation: 'Council members are revising',
                synthesis: 'Synthesizer is combining the council',
                completed: 'Council completed',
                pending: 'Waiting',
                running: 'Thinking',
                done: 'Done',
                failed: 'Failed',
                skippedStatus: 'Skipped',
                activeVisionNote: 'Only image-capable members will answer this image request.',
                comparisonToggle: 'Summarize agreements and differences',
                retrying: 'Retrying once',
                councilLocked: 'Council is running; settings are locked until this reply finishes.',
                searchManualNotice: 'Council mode does not enable Search automatically. Turn on Search before sending if this question needs current web information.',
                searchEnabledNote: 'Search is on: the council will use one shared search packet.'
            };
        };
        const isVisualUploadedFile = (file) => {
            const mimeType = file?.type || file?.mimeType || file?.inlineData?.mimeType || '';
            return mimeType.startsWith('image/') || mimeType.startsWith('video/');
        };
        const getUploadedFileKind = (file) => isVisualUploadedFile(file) ? 'visual' : 'document';
        const isUploadedAttachmentLike = (file) => Boolean(file?.inlineData || file?.base64 || file?.type || file?.mimeType);
        const getCouncilVisualFiles = (files = uploadedFiles) => (files || []).filter(file => isUploadedAttachmentLike(file) && isVisualUploadedFile(file));
        const getCouncilDocumentFiles = (files = uploadedFiles) => (files || []).filter(file => isUploadedAttachmentLike(file) && !isVisualUploadedFile(file));
        const getCouncilAttachmentTranslationNeed = (models = [], files = uploadedFiles) => {
            const selectedModels = (models || []).filter(Boolean);
            const visualFiles = getCouncilVisualFiles(files);
            const documentFiles = getCouncilDocumentFiles(files);
            const needsVisualPacket = visualFiles.length > 0 && selectedModels.some(model => !modelSupportsVision(model));
            const needsDocumentPacket = documentFiles.length > 0 && selectedModels.some(model => !modelSupportsDocumentUpload(model));
            return {
                needsVisualPacket,
                needsDocumentPacket,
                needsAnyPacket: needsVisualPacket || needsDocumentPacket,
                visualFiles,
                documentFiles
            };
        };
        const getCouncilRunnableParticipants = (participants = [], files = uploadedFiles) => {
            const visualFiles = getCouncilVisualFiles(files);
            if (visualFiles.length === 0) {
                return { activeParticipants: participants, skippedParticipants: [] };
            }
            const activeParticipants = participants.filter(model => visualFiles.every(file => modelSupportsUploadedFile(model, file)));
            const skippedParticipants = participants.filter(model => !activeParticipants.some(active => active.id === model.id));
            return { activeParticipants, skippedParticipants };
        };
        const formatCouncilModelSummary = (models = [], limit = 3) => {
            const names = models.map(model => model?.name).filter(Boolean);
            if (names.length === 0) return '';
            if (names.length <= limit) return names.join(' / ');
            return `${names.slice(0, limit).join(' / ')} +${names.length - limit}`;
        };
        const getCouncilValidation = (conv, files = uploadedFiles) => {
            const texts = getCouncilTexts();
            if (!isCouncilEnabled(conv)) {
                return { ok: true, message: '' };
            }
            conv.council = normalizeCouncilConfig(conv.council);
            const { council, participants, synthesizer } = getCouncilSelectedModels(conv);
            if (participants.length < COUNCIL_MIN_MODELS) {
                return { ok: false, reason: 'tooFew', message: texts.tooFew };
            }
            if (participants.length > COUNCIL_MAX_MODELS) {
                return { ok: false, reason: 'tooMany', message: texts.tooMany };
            }
            if (!council.synthesizerModelId || !synthesizer) {
                return { ok: false, reason: 'missingSynthesizer', message: texts.missingSynthesizer };
            }
            const selectedCouncilModels = [...participants, synthesizer].filter(Boolean);
            const translationNeed = getCouncilAttachmentTranslationNeed(selectedCouncilModels, files);
            const translatorModel = translationNeed.needsAnyPacket ? getCouncilTranslatorModel() : null;
            const tavilySearchModel = conv?.isWebSearchEnabled && modelUsesTavilySearch(synthesizer)
                ? { id: 'tavily-search', name: 'Tavily Search', provider: 'tavily' }
                : null;
            const missingKeyModels = [...selectedCouncilModels, ...(translatorModel ? [translatorModel] : []), ...(tavilySearchModel ? [tavilySearchModel] : [])]
                .filter((model, index, arr) => arr.findIndex(item => item.id === model.id) === index)
                .filter(model => !getApiKeyForProvider(model.provider));
            if (missingKeyModels.length > 0) {
                return {
                    ok: false,
                    reason: 'missingApiKey',
                    message: `${texts.missingApiKey}: ${missingKeyModels.map(model => model.name).join(', ')}`
                };
            }
            if (translationNeed.needsAnyPacket && !translatorModel) {
                return {
                    ok: false,
                    reason: 'missingCouncilTranslator',
                    message: 'Council attachments need a translator model that supports both vision and file upload. Choose one in Settings.'
                };
            }
            if (translationNeed.needsAnyPacket) {
                return {
                    ok: true,
                    reason: 'readyWithAttachmentTranslation',
                    message: `${texts.ready} with attachment translator: ${translatorModel.name}`
                };
            }
            return { ok: true, reason: 'ready', message: texts.ready };
        };        let itemToRename = { id: null, type: null };
        let currentUser = null;
        let abortController = null;
        let isCouncilRunning = false;
        let isSelectionMode = false;
        let selectedConversationIds = new Set();
        let uploadedFiles = [];
        let sendConfirmed = false;
        let sidebarOpen = false;
        let isFollowUpExpanded = true;
        let editingAstrasId = null;
        let currentSpeechRecognition = null;
        let currentVoiceTarget = null;
        let modelPieChart = null;
        let timeDistChart = null;
        let cropperInstance = null;
        let messageObserver = null;
        let currentStoreCategory = 'all';
        let editingAstraForAvatarId = null;
        let isAutoScrolling = false;
        const runtimeStorageAdapter = createLegacyRuntimeStorageAdapter({
            indexedDBFactory: indexedDB,
            dbName: 'ChatAppDB',
            storeName: 'keyValue',
            version: 1
        });
        const { getItem, setItem, removeItem } = runtimeStorageAdapter;
        let folderUiStatePersistencePromise;
        const getFolderUiStatePersistence = () => folderUiStatePersistencePromise ||= import('/src/app/runtime/kernel/folder-ui-state.js').then(({ createFolderUiStatePersistence }) => createFolderUiStatePersistence({ getUsername: () => currentUser?.username || null, getItem, setItem }));
        const saveFolderUiState = async (folders) => (await getFolderUiStatePersistence()).save(folders);
        let generatedImageRuntimePromise;
        const getGeneratedImageRuntime = () => {
            if (!generatedImageRuntimePromise) {
                generatedImageRuntimePromise = Promise.all([
                    import('/src/app/legacy-runtime/features/generated-image-assets.js'),
                    import('/src/app/legacy-runtime/features/openrouter-image-generation.js'),
                    import('/src/app/legacy-runtime/features/image-generation-response-lifecycle.js'),
                    import('/src/app/legacy-runtime/features/generated-image-interactions.js')
                ]).then(([assetsModule, apiModule, lifecycleModule, interactionsModule]) => {
                    const assetStore = assetsModule.createGeneratedImageAssetStore({
                        getItem,
                        setItem,
                        getUserName: () => currentUser?.username || 'anonymous'
                    });
                    const generateImage = apiModule.createOpenRouterImageGenerator({ fetchImpl: fetch });
                    const responseLifecycle = lifecycleModule.createImageGenerationResponseLifecycle({
                        buildSingleModelTranslatedRequestParts: (...args) => buildSingleModelTranslatedRequestParts(...args),
                        generateImage,
                        saveImageAsset: image => assetStore.save(image),
                        getStoredImageDataUrl: descriptor => assetStore.getDataUrl(descriptor),
                        getApiKey: provider => getApiKeyForProvider(provider),
                        getModelReasoningConfig,
                        normalizeReasoningEffort
                    });
                    const interactions = interactionsModule.createGeneratedImageInteractions({
                        document,
                        getImageDataUrl: descriptor => assetStore.getDataUrl(descriptor),
                        attachAnnotatedImage: async ({ dataUrl, descriptor }) => {
                            const blob = await (await fetch(dataUrl)).blob();
                            uploadedFiles = [{
                                name: `astra-targeted-edit-${descriptor.id}.png`,
                                type: 'image/png',
                                size: blob.size,
                                base64: dataUrl,
                                targetedEdit: true
                            }];
                            legacyRuntimeContext.resolveBinding('submit.renderFilePreviews')();
                            ALL_ELEMENTS.messageInput?.focus();
                            showNotification(i18n[runtimeConfigAccess.getUiLanguage()]?.imageReadyToEdit || 'Image is ready for targeted editing.', 'success');
                        },
                        getUiLanguage: () => runtimeConfigAccess.getUiLanguage(),
                        navigator,
                        fetchImpl: fetch,
                        FileCtor: File,
                        escapeHTML,
                        getText: (key, fallback) => i18n[runtimeConfigAccess.getUiLanguage()]?.[key] || fallback,
                        logWarn: (...args) => console.warn(...args)
                    });
                    return { assetStore, interactions, responseLifecycle };
                });
            }
            return generatedImageRuntimePromise;
        };
        const bindGeneratedImageAssets = async (root, assets) => {
            const { assetStore, interactions } = await getGeneratedImageRuntime();
            await assetStore.bind(root, assets);
            interactions.bind(root, assets);
        };
        const sensitiveConfigStore = createSensitiveConfigStore({
            initialApiKeys: runtimeConfigAccess.getConfig().apiKeys,
            normalizeApiKeyValue
        });
        const runtimeSensitiveConfigPersistence = createSensitiveConfigPersistence({
            getCurrentUser: () => currentUser,
            getItem,
            setItem,
            removeItem,
            getApiKeys: () => sensitiveConfigStore.getApiKeys(),
            replaceApiKeys: (apiKeys) => sensitiveConfigStore.replaceApiKeys(apiKeys),
            onSaved: () => globalThis.__astraCloudWorkspaceSync?.queueLocalChange('sensitive')
        });
        const getSensitiveApiKeys = () => sensitiveConfigStore.getApiKeys();
        const setApiKeyForProvider = (provider, value) => sensitiveConfigStore.setApiKey(provider, value);
        const mergeSensitiveApiKeys = (apiKeys) => sensitiveConfigStore.mergeApiKeys(apiKeys);
        const clearSensitiveApiKeys = () => sensitiveConfigStore.clearApiKeys();
        const saveSensitiveConfig = async () => { await runtimeSensitiveConfigPersistence.saveSensitiveConfig(); };
        window.addEventListener('astra:cloud-sensitive-config', (event) => {
            const apiKeys = event.detail?.apiKeys || event.detail;
            if (apiKeys && typeof apiKeys === 'object') mergeSensitiveApiKeys(apiKeys);
        });
        function getApiKeyForProvider(provider) {
            return sensitiveConfigStore.getApiKey(provider);
        }
        function normalizeConversationModel(conv) {
            if (!conv) return null;
            const canonicalModelId = getCanonicalModelId(conv.model);
            let modelInfo = MODELS.find(m => m.id === canonicalModelId);
            if (!modelInfo) {
                modelInfo = MODELS.find(m => m.id === runtimeConfigAccess.getConfig().defaultModel) || MODELS[0];
            }
            conv.model = modelInfo.id;
            conv.provider = modelInfo.provider;
            return modelInfo;
        }

        function submitChatForm() {
            const form = ALL_ELEMENTS?.chatForm;
            if (!form) return;
            if (typeof SubmitEvent === 'function') {
                form.dispatchEvent(new SubmitEvent('submit', {
                    bubbles: true,
                    cancelable: true,
                    submitter: ALL_ELEMENTS?.submitButton || null
                }));
            } else {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }
        const hashString = async (str) => {
            const data = new TextEncoder().encode(str);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };
        const bytesToHex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const hexToBytes = (hex) => new Uint8Array((hex.match(/.{1,2}/g) || []).map(byte => parseInt(byte, 16)));
        const constantTimeEqual = (a, b) => {
            if (a.length !== b.length) return false;
            let diff = 0;
            for (let i = 0; i < a.length; i += 1) {
                diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
            }
            return diff === 0;
        };
        const derivePasswordHash = async (password, saltHex, iterations = 210000) => {
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                'PBKDF2',
                false,
                ['deriveBits']
            );
            const bits = await window.crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    hash: 'SHA-256',
                    salt: hexToBytes(saltHex),
                    iterations
                },
                keyMaterial,
                256
            );
            return bytesToHex(new Uint8Array(bits));
        };
        const createPasswordRecord = async (username, password) => {
            const saltBytes = new Uint8Array(16);
            window.crypto.getRandomValues(saltBytes);
            const passwordSalt = bytesToHex(saltBytes);
            const passwordIterations = 210000;
            const passwordHash = await derivePasswordHash(password, passwordSalt, passwordIterations);
            return {
                username,
                passwordHash,
                passwordSalt,
                passwordIterations,
                passwordKdf: 'PBKDF2-SHA-256'
            };
        };
        const verifyPasswordRecord = async (password, userRecord) => {
            if (userRecord?.passwordKdf === 'PBKDF2-SHA-256' && userRecord.passwordSalt) {
                const derivedHash = await derivePasswordHash(password, userRecord.passwordSalt, userRecord.passwordIterations || 210000);
                return constantTimeEqual(derivedHash, userRecord.passwordHash || '');
            }

            const legacyHash = await hashString(password);
            return constantTimeEqual(legacyHash, userRecord?.passwordHash || '');
        };
        const upgradeLegacyPasswordRecord = async (password, userKey, userRecord) => {
            if (userRecord?.passwordKdf === 'PBKDF2-SHA-256') return userRecord;
            const upgradedRecord = await createPasswordRecord(userRecord.username, password);
            await setItem(userKey, JSON.stringify(upgradedRecord));
            return upgradedRecord;
        };
        const getConfigKey = () => `chatConfig_v_v8.6_${currentUser.username}`;
        const getAppDataKey = () => `chatAppData_v8.6_${currentUser.username}`;
        const getUserKey = (username) => `chatUser_${username}`;
        const runtimeAppDataPersistence = createLegacyRuntimeAppDataPersistence({
            getCurrentUser: () => currentUser,
            getAppData: () => runtimeAppDataStore.getSnapshot(),
            getAppDataKey,
            setItem,
            onSaved: (snapshot) => globalThis.__astraCloudSyncV2?.captureWorkspace(snapshot)
        });
        const runtimeConfigPersistence = createLegacyRuntimeConfigPersistence({
            getCurrentUser: () => currentUser,
            getConfig: () => runtimeConfigStore.getConfig(),
            getConfigKey,
            setItem,
            onSaved: () => globalThis.__astraCloudWorkspaceSync?.queueLocalChange('config')
        });
        const {
            showNotification,
            toggleModal,
            showCustomDialog,
            showCustomConfirm,
            showCustomPrompt
        } = createDialogNotificationLifecycle({
            document,
            elements: ALL_ELEMENTS,
            setTimeout,
            clearTimeout,
            requestAnimationFrame
        });
        const runtimeDialogCoordinator = createRuntimeDialogCoordinator({
            showNotification: (...args) => showNotification(...args),
            logger: console
        });
         document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal').forEach(m => {
    if (!m.classList.contains('visible')) {
      m.classList.add('hidden');   // display:none
      m.classList.remove('visible');
    }
  });
});
        const throttle = (func, limit) => {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        };
        const {
            renderMarkdown,
            renderMarkdownWithFormulas
        } = createMarkdownRenderingHelpers({
            marked,
            sanitizer: DOMPurify,
            DOMParser,
            katex,
            getUiLanguage: () => runtimeConfigAccess.getConfig().uiLanguage,
            getText: (key, fallback) => i18n[runtimeConfigAccess.getConfig().uiLanguage]?.[key] || fallback,
            logger: console
        });
        observeMessageCharts({
            root: ALL_ELEMENTS.messageList,
            chartLabel: i18n[runtimeConfigAccess.getConfig().uiLanguage]?.chart || 'Chart'
        });
        const saveConfig = async () => { await runtimeConfigPersistence.saveConfig(); };
        const loadConfig = async () => {
            if (!currentUser) return;
            await runtimeSensitiveConfigPersistence.loadSensitiveConfig();
            const saved = await getItem(getConfigKey());
            if (saved) {
                const savedConfig = JSON.parse(saved);
                if (savedConfig.apiKeys) {
                    mergeSensitiveApiKeys(savedConfig.apiKeys);
                    await saveSensitiveConfig();
                }
                const normalSavedConfig = removeSensitiveConfig(savedConfig);
                const normalizedConfig = normalizeLoadedLegacyConfig({
                    currentConfig: runtimeConfigAccess.getConfig(),
                    savedConfig: normalSavedConfig,
                    models: MODELS,
                    maxCouncilModels: COUNCIL_MAX_MODELS,
                    councilTranslatorCandidates: getCouncilTranslatorCandidates(),
                    singleTranslatorCandidates: getSingleTranslatorCandidates()
                });
                runtimeConfigAccess.replaceConfig(normalizedConfig);
            } else {
                const normalizedConfig = normalizeLoadedLegacyConfig({
                    currentConfig: runtimeConfigAccess.getConfig(),
                    savedConfig: null,
                    models: MODELS,
                    maxCouncilModels: COUNCIL_MAX_MODELS,
                    councilTranslatorCandidates: getCouncilTranslatorCandidates(),
                    singleTranslatorCandidates: getSingleTranslatorCandidates()
                });
                runtimeConfigAccess.mutateConfig(normalizedConfig);
            }
        };
        const saveAppData = async () => { await runtimeAppDataPersistence.saveAppData(); };
        const deleteConversationsFromCloud = createCloudConversationDeletion({
            getCurrentUser: () => currentUser,
            getConversations: () => runtimeAppDataStore.getConversations(),
            getSync: () => globalThis.__astraCloudSyncV2 || window.__astraCloudSyncV2
        });
        const loadAppData = async () => {
            if (!currentUser) return;
            const saved = await getItem(getAppDataKey());
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    const normalizedData = normalizeLoadedLegacyAppData({
                        rawData: data,
                        defaultFolder: getDefaultFolder(),
                        defaultGenConfig: getDefaultGenConfig(),
                        lastCouncilConfig: runtimeConfigAccess.getConfig().lastCouncilConfig,
                        normalizeCouncilConfig,
                        normalizeConversationModel
                    });
                    runtimeAppDataStore.replaceAll(normalizedData);
                } catch (e) {
                    console.error("Failed to parse app data:", e);
                    showNotification("Stored app data could not be read and was reset.", "error");
                    runtimeAppDataStore.replaceAll({
                        conversations: [],
                        folders: [],
                        astras: [],
                        personalMemories: []
                    });
                    await removeItem(getAppDataKey());
                }
            } else {
                runtimeAppDataStore.replaceAll({
                    conversations: [],
                    folders: [],
                    astras: [],
                    personalMemories: []
                });
            }
            await (await getFolderUiStatePersistence()).restore(runtimeAppDataStore.getFolders());
        };
        const getDefaultGenConfig = () => ({ temperature: 0.7, topP: 0.95, maxTokens: null });
        const getDefaultFolder = () => ({ color: 'gray', icon: 'default', textColor: 'gray', isOpen: false});
        const createBaseConversation = (title) => {
            const currentConfig = runtimeConfigAccess.getConfig();
            const defaultModelInfo = MODELS.find(m => m.id === currentConfig.lastUsedModel) || MODELS.find(m => m.id === currentConfig.defaultModel) || MODELS[0];
            const now = new Date().toISOString();
            return {
                id: crypto.randomUUID(),
                title: title,
                summary: '',
                messages: [],
                model: defaultModelInfo.id,
                provider: defaultModelInfo.provider,
                archived: false,
                createdAt: now,
                lastUpdatedAt: now,
                genConfig: getDefaultGenConfig(),
                imageConfig: { aspectRatio: '1:1', resolution: '1K' },
                council: cloneCouncilConfig(currentConfig.lastCouncilConfig),
                isRenamed: false,
                folderId: null,
                astrasId: null,
                isWebSearchEnabled: false,
                pinned: false,
                isTemporary: true,
                isNaming: false,
                deletedAt: null,
                 unsentMessage: ''
            };
        };
        const startNewChat = async () => {
            const currentConversations = liveConversationsBridge.getConversations();
            const oldTempChatCount = currentConversations.length;
            const cleanedConversations = liveConversationsBridge.replaceConversations(
                currentConversations.filter(c => !c.isTemporary || c.messages.length > 0)
            );
            if (cleanedConversations.length < oldTempChatCount) {
                 await saveAppData();
            }
            uploadedFiles = [];
            const newConv = createBaseConversation('新對話');
            liveConversationsBridge.getConversations().unshift(newConv);
            conversationStateAccess.setCurrentConversationId(newConv.id);
            renderAll();
            ALL_ELEMENTS.messageInput.value = '';
            setTimeout(adjustTextareaHeightAlias, 0);
            legacyRuntimeContext.resolveBinding('sidebar.toggleSidebar')(false);
            resolveFoundationUpdateInputState();
            updateApiKeyWarningBadge();
        };
        const loadChat = (id) => {
            if (messageObserver) {
        messageObserver.disconnect();
            }
            if (id !== conversationStateAccess.getCurrentConversationId()) {
                const previousConv = getActiveConversation();
                if (previousConv && previousConv.isTemporary && previousConv.messages.length === 0) {
                    const currentConversations = liveConversationsBridge.getConversations();
                    liveConversationsBridge.replaceConversations(
                        currentConversations.filter(c => c.id !== previousConv.id)
                    );
                }
                conversationStateAccess.setCurrentConversationId(id);
                uploadedFiles = [];
                renderAll();
                const conv = getActiveConversation();
                ALL_ELEMENTS.messageInput.value = conv ? conv.unsentMessage || '' : '';
                setTimeout(adjustTextareaHeightAlias, 0);
            }
            resolveFoundationUpdateInputState();
            updateApiKeyWarningBadge();
            legacyRuntimeContext.resolveBinding('input.updateFunctionButtonsState')();
        };
        const deleteChat = async (id, event) => {
    event?.stopPropagation();
    const currentConversations = liveConversationsBridge.getConversations();
    const conv = currentConversations.find(c => c.id === id);
    if (conv) {
        const deletedAt = new Date().toISOString();
        conv.deletedAt = deletedAt;
        conv.lastUpdatedAt = deletedAt;
        conv.archived = false;
        if (conv.folderId) {
            const folder = runtimeAppDataStore.getFolders().find(f => f.id === conv.folderId);
            if (folder) {
                folder.conversationIds = folder.conversationIds.filter(cid => cid !== id);
            }
            conv.folderId = null;
        }
        await saveAppData();

        if (conversationStateAccess.getCurrentConversationId() === id) {
            startNewChat();
        } else {
            runtimeRenderCoordinator.renderAll();
        }
        runtimeDialogCoordinator.showNotification(i18n[runtimeConfigAccess.getUiLanguage()].chatMovedToTrash || 'Chat moved to trash.', 'success');
    }
};
        const archiveChat = async (id, event) => {
            event?.stopPropagation();
            const currentConversations = liveConversationsBridge.getConversations();
            const conv = currentConversations.find(c => c.id === id);
            if(conv) conv.archived = true;
            await saveAppData();
            if (conversationStateAccess.getCurrentConversationId() === id) {
                const latestConversations = liveConversationsBridge.getConversations();
                const nextConv = latestConversations.find(c => !c.archived && !c.deletedAt);
                conversationStateAccess.setCurrentConversationId(nextConv ? nextConv.id : null);
                if (!conversationStateAccess.getCurrentConversationId()) startNewChat();
                else loadChat(conversationStateAccess.getCurrentConversationId());
            } else {
                runtimeRenderCoordinator.renderAll();
            }
        };
        const unarchiveChat = async (id, event) => {
            event?.stopPropagation();
            const currentConversations = liveConversationsBridge.getConversations();
            const conv = currentConversations.find(c => c.id === id);
            if(conv) conv.archived = false;
            await saveAppData();
            runtimeRenderCoordinator.renderAll();
        };
        const {
            getInlineMediaSrc: getArchivedInlineMediaSrc,
            renderMediaAttachmentGrid: renderArchivedMediaAttachmentGrid
        } = createArchivedMediaAttachmentRenderer({ escapeHTML });
        const {
            bindMediaPreviewButtons: bindArchivedMediaPreviewButtons
        } = createArchivedMediaPreviewLifecycle({
            document,
            navigator,
            fetch,
            File,
            escapeHTML,
            getInlineMediaSrc: getArchivedInlineMediaSrc,
            getUiLanguage: () => runtimeConfigAccess.getUiLanguage()
        });
        const archivedConversationViewRenderer = createArchivedConversationViewRenderer({
            document,
            renderUserText,
            renderModelText: renderMarkdown,
            renderMediaAttachmentGrid: renderArchivedMediaAttachmentGrid,
            bindMediaPreviewButtons: bindArchivedMediaPreviewButtons,
            mediaMode: 'inlineData',
            wrapTextParts: true
        });
        const showArchivedChatPreview = (id, event) => {
            event?.stopPropagation();
            const currentConversations = liveConversationsBridge.getConversations();
            const conv = currentConversations.find(c => c.id === id);
            if (!conv) return;
            ALL_ELEMENTS.viewArchivedTitle.textContent = conv.title;
            const contentContainer = ALL_ELEMENTS.viewArchivedContent;
            archivedConversationViewRenderer.renderConversationMessages({
                conversation: conv,
                contentContainer,
                emptyHTML: '<p class="text-center text-[var(--text-secondary)]">No messages in this archived chat.</p>'
            });
            toggleModal(ALL_ELEMENTS.viewArchivedChatModal, true);
        };
        const togglePinChat = async (id, event) => {
            event?.stopPropagation();
            const currentConversations = liveConversationsBridge.getConversations();
            const conv = currentConversations.find(c => c.id === id);
            if (conv) {
                conv.pinned = !conv.pinned;
                await saveAppData();
                runtimeRenderCoordinator.renderAll();
            }
        };
        const showRenameModal = (id, type, event) => {
            event?.stopPropagation();
            itemToRename = { id, type };
            let currentTitle = '';
            if (type === 'conversation') {
                const currentConversations = liveConversationsBridge.getConversations();
                const conv = currentConversations.find(c => c.id === id);
                if (conv) currentTitle = conv.title;
            } else if (type === 'folder') {
                const folder = runtimeAppDataStore.getFolders().find(f => f.id === id);
                if (folder) currentTitle = folder.name;
            }
            ALL_ELEMENTS.renameModal.querySelector('h2').textContent = type === 'folder' ? 'Rename folder' : 'Rename chat';
            ALL_ELEMENTS.renameInput.value = currentTitle;
            toggleModal(ALL_ELEMENTS.renameModal, true);
            ALL_ELEMENTS.renameInput.focus();
        };
        const handleRename = async () => {
            const newTitle = ALL_ELEMENTS.renameInput.value.trim();
            if (!newTitle || !itemToRename.id) return;
            if (itemToRename.type === 'conversation') {
                const currentConversations = liveConversationsBridge.getConversations();
                const conv = currentConversations.find(c => c.id === itemToRename.id);
                if (conv) { conv.title = newTitle; conv.isRenamed = true; }
            } else if (itemToRename.type === 'folder') {
                const folder = runtimeAppDataStore.getFolders().find(f => f.id === itemToRename.id);
                if (folder) { folder.name = newTitle; }
            }
            await saveAppData();
            runtimeRenderCoordinator.renderAll();
            toggleModal(ALL_ELEMENTS.renameModal, false);
            itemToRename = { id: null, type: null };
        };
        const getActiveConversation = () => {
            const conv = conversationStateAccess.getCurrentConversation();
            if (conv) normalizeConversationModel(conv);
            return conv;
        };
        const historySidebarHelpers = createHistorySidebarHelpers({
            document,
            elements: ALL_ELEMENTS,
            getRequiredElement: (...args) => runtimeDomAccess.getRequiredElement(...args),
            getActiveConversation,
            getMessageTypeIcon,
            userBubbleColors: USER_BUBBLE_COLORS,
            aiBubbleColors: AI_BUBBLE_COLORS,
            getConfig: () => runtimeConfigAccess.getConfig(),
            hexToRgba,
            getTextColorForBackground,
            getConversations: () => liveConversationsBridge.getConversations(),
            createConversationElement: (...args) => createConversationElement(...args),
            getNamingText: () => i18n[runtimeConfigAccess.getUiLanguage()].naming || 'AI is naming...',
            requestAnimationFrame,
            setTimeout,
            setupMessageIntersectionObserver: (...args) => setupMessageIntersectionObserver(...args)
        });
        const {
            renderHistorySidebarContent,
            setupHistorySidebarInteractions,
            setupHistorySidebarTriggers,
            toggleHistorySidebar
        } = historySidebarHelpers;
        const renderHistorySidebar = () => {
            const currentConversations = liveConversationsBridge.getConversations();
            const sortedConversations = currentConversations
                .filter(historySidebarHelpers.isVisibleConversation);
            return historySidebarHelpers.renderHistorySidebar(sortedConversations);
        };
        const runtimeRenderCoordinator = createRuntimeRenderCoordinator({
            renderHistorySidebar: () => renderHistorySidebar(),
            renderFolders: () => renderFolders(),
            renderAstras: () => renderAstras(),
            renderChat: () => renderChat(),
            renderArchivedChats: () => renderArchivedChats(),
            renderBatchActionBar: () => renderBatchActionBar(),
            renderFilePreviews: () => renderFilePreviews(),
            applyLanguage: () => applyLanguage(runtimeConfigAccess.getUiLanguage()),
            logger: console
        });
        const renderAll = (...args) => runtimeRenderCoordinator.renderAll(...args);
        createCloudWorkspaceLiveLifecycle({
            window, configAccess: runtimeConfigAccess, appDataStore: runtimeAppDataStore,
            getDefaultFolder, getDefaultGenConfig, normalizeCouncilConfig, normalizeConversationModel,
            models:MODELS,
            maxCouncilModels:COUNCIL_MAX_MODELS,
            getCouncilTranslatorCandidates,getSingleTranslatorCandidates,applyCustomWallpaper:()=>applyCustomWallpaper(),
            applyUiTheme:()=>applyUiTheme(),renderAll,busy:()=>abortController&&getActiveConversation()
        });
        const sidebarAstrasLifecycle = createSidebarAstrasLifecycle({
            elements: ALL_ELEMENTS,
            getAstras: () => runtimeAppDataStore.getAstras(),
            getActiveAstrasId: () => getActiveAstrasId(),
            getIsSelectionMode: () => isSelectionMode,
            setAstrasForConversation: (...args) => setAstrasForConversation(...args),
            toggleSidebar: (...args) => legacyRuntimeContext.resolveBinding('sidebar.toggleSidebar')(...args),
            createAstrasMenu: (...args) => createAstrasMenu(...args),
            showMobileContextMenuForAstras: (...args) => showMobileContextMenuForAstras(...args),
            setTimeoutFn: (...args) => setTimeout(...args),
            clearTimeoutFn: (...args) => clearTimeout(...args),
            window
        });
        const renderAstras = (...args) => sidebarAstrasLifecycle.renderAstras(...args);


        import { createLegacySidebarChatAstraRenderLifecycle } from '/src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js';
        import { createLegacySubmitInputCouncilLifecycle } from '/src/app/runtime/legacy-core/submit-input-council-lifecycle.js';
        import { createLegacySettingsAuthProviderLifecycle } from '/src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js';

        let renderFolders;
        let createConversationElement;
        let renderArchivedChats;
        let addMessageToUI;
        let renderChat;
        let getActiveAstrasId;
        let setAstrasForConversation;
        let deactivateAstras;
        let createAstras;
        let handleSaveAstras;
        let deleteAstras;
        let createAstrasMenu;
        const submitInputCouncilState = {
            get config() { return runtimeConfigAccess.getConfig(); },
            get conversations() { return liveConversationsBridge.getConversations(); },
            get astras() { return runtimeAppDataStore.getAstras(); },
            get uploadedFiles() { return uploadedFiles; },
            set uploadedFiles(next) { uploadedFiles = next; },
            get abortController() { return abortController; },
            set abortController(next) { abortController = next; },
            get isCouncilRunning() { return isCouncilRunning; },
            set isCouncilRunning(next) { isCouncilRunning = next; },
            get isAutoScrolling() { return isAutoScrolling; }
        };
        const imageGenerationResponseLifecycle = {
            run: async options => (await getGeneratedImageRuntime()).responseLifecycle.run(options)
        };
        const submitInputCouncilLifecycle = createLegacySubmitInputCouncilLifecycle({
            window,
            document,
            AbortController,
            requestAnimationFrame,
            setTimeout,
            clearTimeout,
            elements: ALL_ELEMENTS,
            legacyRuntimeContext,
            state: submitInputCouncilState,
            models: MODELS,
            openRouterVisionModels: OPENROUTER_VISION_MODELS,
            i18n,
            councilMinModels: COUNCIL_MIN_MODELS,
            councilMaxModels: COUNCIL_MAX_MODELS,
            councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
            councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS,
            closeAllPopovers: (...args) => closeAllPopovers(...args),
            escapeHTML,
            formatCouncilModelSummary,
            formatFullTimestamp,
            getActiveConversation,
            getConfig: () => runtimeConfigAccess.getConfig(),
            runtimeConfigAccess,
            getCouncilRuntimeTexts,
            getCouncilSelectedModels,
            getCouncilTexts,
            getCouncilValidation,
            getModelApiId,
            getModelFamilyKey,
            getModelFamilyName,
            getModelPriceLabel,
            getModelRetirementLabel,
            getModelTiers,
            getModelsByIds,
            getApiKeyForProvider,
            getOutputMode,
            getProviderLabel,
            getSingleDocumentTranslatorModel,
            getVisibleCouncilModels,
            hasCouncilWebSearchAccess,
            hasSingleDocumentAccess,
            hasSingleWebSearchAccess,
            isCouncilEnabled,
            modelSupportsDocumentUpload,
            modelSupportsVision,
            modelSupportsWebSearch,
            modelUsesTavilySearch,
            modelGeneratesImages,
            imageGenerationResponseLifecycle,
            normalizeCouncilConfig,
            cloneCouncilConfig,
            normalizeConversationModel,
            renderAll,
            renderHistorySidebar,
            renderMarkdown,
            renderMarkdownWithFormulas,
            renderUserText,
            addMessageToUI: (...args) => addMessageToUI(...args),
            buildSingleModelTranslatedRequestParts: (...args) => buildSingleModelTranslatedRequestParts(...args),
            streamApiCall: (...args) => streamApiCall(...args),
            runModelCouncil: (...args) => runModelCouncil(...args),
            extractPersonalMemory: (...args) => extractPersonalMemory(...args),
            saveAppData,
            saveConfig,
            showNotification,
            updateApiKeyWarningBadge: (...args) => updateApiKeyWarningBadge(...args),
            getFileInputContainer: () => ALL_ELEMENTS.fileInputContainer,
            getActiveAstrasId: () => getActiveAstrasId(),
            deactivateAstras: (...args) => deactivateAstras(...args),
            logger: console
        });
        const {
            openCouncilPopoverFromAttachmentMenu,
            ensureCouncilMenuButton,
            updateFunctionButtonsState,
            toggleLearningMode,
            renderInputIndicators,
            updateFileInputUI,
            seedCouncilParticipants,
            persistCouncilConfig,
            getCouncilModeLabel,
            getCouncilModelList,
            renderCouncilControls,
            renderModelSwitcher,
            renderCouncilProgress,
            renderSingleModelError,
            renderSingleModelProgress,
            typewriterStream,
            renderIncrementalResponse,
            playbackTypewriterResponse,
            playbackStreamingMarkdownResponse,
            startProgressTicker,
            stopProgressTicker,
            handleFormSubmit
        } = submitInputCouncilLifecycle;
        legacyRuntimeContext.registerLazyBinding('input.updateFunctionButtonsState', () => updateFunctionButtonsState);
        legacyRuntimeContext.registerLazyBinding('submit.updateSubmitButtonState', () => updateSubmitButtonState);
        legacyRuntimeContext.registerLazyBinding('submit.generateTitleAndSummary', () => generateTitleAndSummary);
        legacyRuntimeContext.registerLazyBinding('submit.shouldPerformWebSearch', () => shouldPerformWebSearch);
        const resolveRuntimeEntryAdjustTextareaHeight = () => legacyRuntimeContext.resolveOptionalBinding(
            'runtimeEntry.submit.adjustTextareaHeight'
        );
        const adjustTextareaHeightAlias = (...args) => {
            const runtimeEntryAdjustTextareaHeight = resolveRuntimeEntryAdjustTextareaHeight();
            if (runtimeEntryAdjustTextareaHeight) {
                return runtimeEntryAdjustTextareaHeight(...args);
            }
            return undefined;
        };
        legacyRuntimeContext.registerLazyBinding('submit.adjustTextareaHeight', () => {
            const runtimeEntryAdjustTextareaHeight = resolveRuntimeEntryAdjustTextareaHeight();
            if (runtimeEntryAdjustTextareaHeight) return runtimeEntryAdjustTextareaHeight;
            return adjustTextareaHeightAlias;
        });
        legacyRuntimeContext.registerLazyBinding('submit.renderFilePreviews', () => renderFilePreviews);
        const settingsAuthProviderState = {
            get config() { return runtimeConfigAccess.getConfig(); },
            set config(next) { runtimeConfigAccess.replaceConfig(next); },
            get conversations() { return liveConversationsBridge.getConversations(); },
            set conversations(next) { liveConversationsBridge.replaceConversations(next); },
            get folders() { return runtimeAppDataStore.getFolders(); },
            set folders(next) { runtimeAppDataStore.replaceFolders(next); },
            get astras() { return runtimeAppDataStore.getAstras(); },
            set astras(next) { runtimeAppDataStore.replaceAstras(next); },
            get personalMemories() { return runtimeAppDataStore.getPersonalMemories(); },
            set personalMemories(next) { runtimeAppDataStore.replacePersonalMemories(next); },
            get uploadedFiles() { return uploadedFiles; },
            set uploadedFiles(next) { uploadedFiles = next; },
            get currentUser() { return currentUser; },
            set currentUser(next) { currentUser = next; },
            get abortController() { return abortController; },
            set abortController(next) { abortController = next; }
        };
        const settingsAuthProviderLifecycle = createLegacySettingsAuthProviderLifecycle({
            window,
            document,
            fetch,
            AbortSignal,
            requestAnimationFrame,
            setTimeout,
            console,
            elements: ALL_ELEMENTS,
            state: settingsAuthProviderState,
            legacyRuntimeContext,
            runtimeStorageAdapter,
            models: MODELS,
            i18n,
            cheapModelId: CHEAP_MODEL_ID,
            councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
            councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS,
            councilMaxModels: COUNCIL_MAX_MODELS,
            aiBubbleColors: AI_BUBBLE_COLORS,
            userBubbleColors: USER_BUBBLE_COLORS,
            getActiveConversation,
            normalizeConversationModel,
            getModelApiId,
            getApiKeyForProvider,
            getDefaultGenConfig,
            modelSupportsUploadedFile,
            modelSupportsVision,
            getErrorMessage,
            readErrorBody,
            getSingleDocumentTranslatorModel,
            modelUsesTavilySearch,
            getCouncilSelectedModels,
            getCouncilTexts,
            getCouncilRuntimeTexts,
            getCouncilAttachmentTranslationNeed,
            getCouncilTranslatorModel,
            getCouncilSharedSearchModel,
            modelUsesNativeWebSearch,
            modelSupportsDocumentUpload,
            conversationNeedsTavilySearch,
            getCouncilValidation,
            isCouncilEnabled,
            getOutputMode,
            renderHistorySidebar,
            conversationStateAccess,
            getProviderLabel,
            getModelPriceLabel,
            setApiKeyForProvider,
            mergeSensitiveApiKeys,
            clearSensitiveApiKeys,
            saveSensitiveConfig,
            getCouncilTranslatorCandidates,
            getSingleTranslatorCandidates,
            escapeHTML,
            hexToRgba,
            renderPersonalMemoryList: (...args) => renderPersonalMemoryList(...args),
            renderModelManagementUI: (...args) => renderModelManagementUI(...args),
            renderUiColorOptions: (...args) => renderUiColorOptions(...args),
            renderTrash: (...args) => renderTrash(...args),
            renderModelSwitcher,
            renderChat: (...args) => renderChat(...args),
            renderStore: (...args) => renderStore(...args),
            updateApiKeyWarningBadge: (...args) => updateApiKeyWarningBadge(...args),
            applyUiTheme: (...args) => applyUiTheme(...args),
            applyLanguage: (...args) => applyLanguage(...args),
            togglePinChat,
            archiveChat,
            deleteChat,
            showRenameModal,
            moveConversationToFolder: (...args) => moveConversationToFolder(...args),
            createNewFolder: (...args) => createNewFolder(...args),
            showCustomPrompt,
            showCustomConfirm,
            showCustomDialog,
            showNotification,
            toggleModal,
            saveConfig,
            loadConfig,
            loadAppData,
            getSensitiveApiKeys,
            mergeSensitiveApiKeys,
            saveSensitiveConfig,
            saveAppData,
            applyCustomWallpaper: (...args) => applyCustomWallpaper(...args),
            getUserKey,
            getItem,
            setItem,
            removeItem,
            verifyPasswordRecord,
            upgradeLegacyPasswordRecord,
            createPasswordRecord,
            renderAll,
            logger: console
        });
        const {
            streamApiCall,
            providerRequestSupport,
            councilResponseLifecycle,
            buildSingleModelTranslatedRequestParts,
            extractTextFromParts,
            fetchTavilySearchPacket,
            filterPartsForModelCapability,
            getSearchQueryFromParts,
            streamCouncilApiCallWithRetry,
            truncateCouncilText,
            runModelCouncil,
            callApiWithSchema,
            shouldPerformWebSearch,
            generateTitleAndSummary,
            updateSubmitButtonState,
            updateInputState,
            getTavilySearchDepth,
            isMobileSettingsViewport,
            openSettingsMobileSection,
            setupSettingsModal,
            saveSettings,
            setAiBubbleColor,
            setUserBubbleColor,
            renderAiBubbleColorDropdown,
            renderUserBubbleColorDropdown,
            createHistoryMenu,
            setTheme,
            updateThemeButtons,
            handleLogin,
            handleLogout,
            handleDeleteAllData
        } = settingsAuthProviderLifecycle;
        legacyRuntimeContext.registerLazyBinding('settings.setupSettingsModal', () => setupSettingsModal);
        legacyRuntimeContext.registerLazyBinding('input.updateInputState', () => updateInputState);
        const sidebarChatAstraRenderState = {
            get config() { return runtimeConfigAccess.getConfig(); },
            get conversations() { return liveConversationsBridge.getConversations(); },
            get folders() { return runtimeAppDataStore.getFolders(); },
            get astras() { return runtimeAppDataStore.getAstras(); },
            set astras(next) { runtimeAppDataStore.replaceAstras(next); },
            get currentUser() { return currentUser; },
            get editingAstrasId() { return editingAstrasId; },
            set editingAstrasId(next) { editingAstrasId = next; },
            get selectedConversationIds() { return selectedConversationIds; },
            get isSelectionMode() { return isSelectionMode; },
            get isAutoScrolling() { return isAutoScrolling; }
        };
        const sidebarChatAstraRenderLifecycle = createLegacySidebarChatAstraRenderLifecycle({
            window,
            document,
            navigator,
            fetch,
            File,
            crypto,
            requestAnimationFrame,
            elements: ALL_ELEMENTS,
            legacyRuntimeContext,
            state: sidebarChatAstraRenderState,
            runtimeDomAccess,
            runtimeConfigAccess,
            conversationStateAccess,
            runtimeRenderCoordinator,
            runtimeDialogCoordinator,
            i18n,
            getActiveConversation,
            normalizeConversationModel,
            isCouncilEnabled,
            getCouncilTexts,
            resolveFolderColor,
            folderColors: FOLDER_COLORS,
            saveAppData,
            saveFolderUiState,
            renderAstras,
            renderAll,
            renderBatchActionBar: (...args) => renderBatchActionBar(...args),
            loadChat,
            createHistoryMenu,
            createFolderMenu: (...args) => createFolderMenu(...args),
            deleteChat,
            showArchivedChatPreview,
            unarchiveChat,
            showMobileContextMenu: (...args) => showMobileContextMenu(...args),
            showMobileContextMenuForFolder: (...args) => showMobileContextMenuForFolder(...args),
            openAvatarEditor: (...args) => openAvatarEditor(...args),
            toggleModal,
            showNotification,
            showCustomConfirm,
            buildMessageRenderView,
            escapeHTML,
            renderUserText,
            renderMarkdownWithFormulas,
            formatFullTimestamp,
            renderModelSwitcher,
            renderInputIndicators,
            renderCouncilControls,
            setupMessageIntersectionObserver: (...args) => setupMessageIntersectionObserver(...args),
            bindGeneratedImageAssets,
            replaceAstras: (nextAstras) => runtimeAppDataStore.replaceAstras(nextAstras)
        });
        ({
            renderFolders,
            createConversationElement,
            renderArchivedChats,
            addMessageToUI,
            renderChat,
            getActiveAstrasId,
            setAstrasForConversation,
            deactivateAstras,
            createAstras,
            handleSaveAstras,
            deleteAstras,
            createAstrasMenu
        } = sidebarChatAstraRenderLifecycle);
        import { createBatchActionBarLifecycle } from '/src/app/legacy-runtime/features/batch-action-bar-lifecycle.js';
        import { createLegacyFolderLifecycle } from '/src/app/runtime/features/folder-lifecycle.js';
        import { createLegacyTransitionBusLifecycle } from '/src/app/runtime/legacy-core/transition-bus-lifecycle.js';
        import {
            FOLDER_SVGS as FOLDER_ICON_OPTIONS,
        } from '/src/app/legacy-runtime/data/folder-metadata.js';
        const {
            createNewFolder,
            moveConversationToFolder,
            deleteFolder,
            showFolderSettingsModal,
            handleSaveFolderSettings,
            createFolderMenu
        } = createLegacyFolderLifecycle({
            document,
            elements: ALL_ELEMENTS,
            getFolders: () => runtimeAppDataStore.getFolders(),
            getConversations: () => liveConversationsBridge.getConversations(),
            replaceFolders: (nextFolders) => runtimeAppDataStore.replaceFolders(nextFolders),
            getDefaultFolder,
            saveAppData,
            renderFolders,
            renderAll,
            showCustomConfirm,
            showNotification,
            toggleModal,
            showRenameModal,
            folderColors: FOLDER_COLORS,
            folderIconOptions: FOLDER_ICON_OPTIONS,
            normalizeFolderColorSelection: (selectedColor) =>
                normalizeFolderColorSelection(selectedColor, FOLDER_COLORS),
            getI18n: () => i18n,
            getUiLanguage: () => runtimeConfigAccess.getUiLanguage(),
            randomUUID: () => crypto.randomUUID(),
            scheduleAnimationFrame: requestAnimationFrame,
            logger: console
        });
        const toggleSelectionMode = () => {
    isSelectionMode = !isSelectionMode;
    selectedConversationIds.clear();

    if (isSelectionMode) {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[runtimeConfigAccess.getUiLanguage()].cancelBatchSelect || 'Cancel batch select';
    } else {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[runtimeConfigAccess.getUiLanguage()].batchSelect || 'Batch select';
    }

    renderAll();
};
        const batchActionBarLifecycle = createBatchActionBarLifecycle({
            elements: ALL_ELEMENTS,
            getI18n: () => i18n,
            getIsSelectionMode: () => isSelectionMode,
            getSelectedConversationIds: () => selectedConversationIds,
            getUiLanguage: () => runtimeConfigAccess.getUiLanguage()
        });
        const renderBatchActionBar = (...args) => batchActionBarLifecycle.renderBatchActionBar(...args);
        const transitionBusState = {
            get config() { return runtimeConfigAccess.getConfig(); },
            set config(next) { runtimeConfigAccess.replaceConfig(next); },
            get conversations() { return liveConversationsBridge.getConversations(); },
            set conversations(next) { liveConversationsBridge.replaceConversations(next); },
            get folders() { return runtimeAppDataStore.getFolders(); },
            set folders(next) { runtimeAppDataStore.replaceFolders(next); },
            get astras() { return runtimeAppDataStore.getAstras(); },
            set astras(next) { runtimeAppDataStore.replaceAstras(next); },
            get personalMemories() { return runtimeAppDataStore.getPersonalMemories(); },
            set personalMemories(next) { runtimeAppDataStore.replacePersonalMemories(next); },
            get uploadedFiles() { return uploadedFiles; },
            set uploadedFiles(next) { uploadedFiles = next; },
            get sidebarOpen() { return sidebarOpen; },
            set sidebarOpen(next) { sidebarOpen = next; },
            get currentUser() { return currentUser; },
            set currentUser(next) { currentUser = next; },
            get currentSpeechRecognition() { return currentSpeechRecognition; },
            set currentSpeechRecognition(next) { currentSpeechRecognition = next; },
            get currentVoiceTarget() { return currentVoiceTarget; },
            set currentVoiceTarget(next) { currentVoiceTarget = next; },
            get selectedConversationIds() { return selectedConversationIds; },
            get conversationStateAccess() { return conversationStateAccess; },
            get modelPieChart() { return modelPieChart; },
            set modelPieChart(next) { modelPieChart = next; },
            get sendConfirmed() { return sendConfirmed; },
            set sendConfirmed(next) { sendConfirmed = next; },
            get abortController() { return abortController; },
            set abortController(next) { abortController = next; },
            get cropperInstance() { return cropperInstance; },
            set cropperInstance(next) { cropperInstance = next; },
            get editingAstraForAvatarId() { return editingAstraForAvatarId; },
            set editingAstraForAvatarId(next) { editingAstraForAvatarId = next; },
            get editingAstrasId() { return editingAstrasId; },
            set editingAstrasId(next) { editingAstrasId = next; },
            get currentStoreCategory() { return currentStoreCategory; },
            set currentStoreCategory(next) { currentStoreCategory = next; },
            get messageObserver() { return messageObserver; },
            set messageObserver(next) { messageObserver = next; },
            get timeDistChart() { return timeDistChart; },
            set timeDistChart(next) { timeDistChart = next; },
            get isAutoScrolling() { return isAutoScrolling; },
            set isAutoScrolling(next) { isAutoScrolling = next; }
        };
        const transitionBusLifecycle = createLegacyTransitionBusLifecycle({
            window,
            document,
            navigator,
            fetch,
            File,
            FileReader,
            Image,
            URL,
            Event,
            Blob,
            Chart,
            Cropper,
            Peer,
            QRCode,
            Html5Qrcode,
            JSZip,
            ResizeObserver,
            IntersectionObserver,
            requestAnimationFrame,
            setTimeout,
            clearTimeout,
            crypto,
            console,
            globalObject: globalThis,
            getComputedStyle,
            elements: ALL_ELEMENTS,
            legacyRuntimeContext,
            state: transitionBusState,
            runtimeConfigAccess,
            runtimeAppDataStore,
            runtimeDialogCoordinator,
            i18n,
            officialAstras: OFFICIAL_ASTRAS,
            updateLogs,
            uiThemeColors: UI_THEME_COLORS,
            models: MODELS,
            getSensitiveApiKeys,
            mergeSensitiveApiKeys,
            saveSensitiveConfig,
            setTheme,
            updateThemeButtons,
            setAiBubbleColor,
            setUserBubbleColor,
            saveConfig,
            saveAppData,
            showNotification,
            toggleModal,
            renderAstras,
            escapeHTML,
            sanitizeTrustedHTML,
            showRenameModal,
            togglePinChat,
            archiveChat,
            deleteChat,
            moveConversationToFolder,
            showFolderSettingsModal,
            deleteFolder,
            deleteAstras,
            showCustomConfirm,
            showCustomPrompt,
            showCustomDialog,
            formatFullTimestamp,
            renderUserText,
            renderMarkdownWithFormulas,
            startNewChat,
            renderAll,
            updateFunctionButtonsState,
            saveSettings,
            handleLogout,
            handleFormSubmit,
            handleRename,
            handleSaveFolderSettings,
            loadChat,
            getActiveConversation,
            normalizeConversationModel,
            getCouncilSelectedModels,
            isCouncilEnabled,
            hasCouncilWebSearchAccess,
            hasSingleWebSearchAccess,
            hasSingleDocumentAccess,
            modelSupportsVision,
            getGeneratedImageBlob: async descriptor => (await getGeneratedImageRuntime()).assetStore.getBlob(descriptor),
            saveGeneratedImageBlob: async (descriptor, blob) => {
                descriptor.storageKey = `generatedImage:${currentUser?.username || 'anonymous'}:${descriptor.id}`;
                await setItem(descriptor.storageKey, blob);
            },
            getCouncilTexts,
            renderInputIndicators,
            toggleLearningMode,
            toggleSelectionMode,
            submitChatForm,
            createNewFolder,
            createAstras,
            handleSaveAstras,
            handleDeleteAllData,
            updateFileInputUI,
            postJsonWithReadableError,
            openCouncilPopoverFromAttachmentMenu,
            setupHistorySidebarInteractions,
            setupHistorySidebarTriggers,
            getDefaultFolder,
            isMobileSettingsViewport,
            openSettingsMobileSection,
            getItem,
            getUserKey,
            loadConfig,
            loadAppData,
            handleLogin,
            installTouchGuards,
            registerServiceWorker,
            getModelTiers,
            getModelApiId,
            getApiKeyForProvider,
            getCouncilValidation,
            callApiWithSchema,
            getOutputMode,
            hashString,
            constantTimeEqual,
            processInChunks,
            getBackupUsername,
            createPasswordRecord,
            setItem,
            logger: console
        });
        const {
            renderModelManagementUI,
            moveModelOrder,
            renderPersonalMemoryList,
            refineAndStoreMemories,
            extractPersonalMemory,
            updateApiKeyWarningBadge,
            openDashboard,
            renderDashboardStats,
            renderModelUsageChart,
            performSearchAndRenderResults,
            showConversationInViewModal,
            generateSearchKeywords,
            calculateRelevanceScores,
            renderFilePreviews,
            removeFile,
            handleFileSelection,
            toggleSidebar,
            handleBatchDelete,
            handleBatchArchive,
            handleBatchMove,
            renderBatchMoveModal,
            batchMoveToFolder,
            handleExport,
            performImport,
            handleImport,
            handleImportOnAuth,
            processAuthImport,
            setupVoiceInput,
            toggleVoiceInput,
            closeAllPopovers,
            copyTextToClipboard,
            setupTimeAnalysis,
            updateTimeDistributionChart,
            getDominantColorPalette,
            applyUiTheme,
            renderUiColorOptions,
            analyzeImageBrightness,
            applyCustomWallpaper,
            handleWallpaperUpload,
            handleConfirmCrop,
            restoreDefaultWallpaper,
            openStore,
            closeStore,
            renderStore,
            handleSubscription,
            openAvatarEditor,
            handleAvatarUpload,
            handleConfirmAvatarCrop,
            applyLanguage,
            showMobileContextMenu,
            showMobileContextMenuForFolder,
            showMobileContextMenuForAstras,
            setupScrollToBottomButton,
            showUpdateHistory,
            checkAndShowLatestUpdate,
            setupMessageIntersectionObserver,
            renderTrash,
            handleRestoreTrashItem,
            handleDeleteTrashItemPermanently,
            showTrashItemInViewModal,
            toggleTrashSelectionMode,
            renderTrashBatchActionBar,
            handleBatchRestoreFromTrash,
            handleBatchDeleteFromTrash,
            handleEmptyTrash,
            updateDisplayedVersion
        } = transitionBusLifecycle;
        transitionBusLifecycle.registerSidebarBindings();
        transitionBusLifecycle.registerCoreTailDependencies();

export { legacyRuntimeContext };
