import { installTouchGuards } from '/src/pwa/touch-guards.js';
import { createGeneratedImageRuntimeLoader } from '/src/app/runtime/legacy-core/generated-image-runtime.js';
import { registerServiceWorker } from '/src/pwa/register-service-worker.js';
import { normalizeFolderColorSelection, resolveFolderColor } from '/src/utils/folder-colors.js';
import { getTextColorForBackground } from '/src/utils/color-contrast.js';
import { getMessageTypeIcon } from '/src/app/legacy-runtime/features/message-type-icon.js';
import { formatFullTimestamp } from '/src/app/legacy-runtime/features/date-formatting.js';
import { buildMessageRenderView } from '/src/app/legacy-runtime/features/message-markup-renderer.js';
import { buildQuotedUserParts, createQuoteInquiryLifecycle } from '/src/app/legacy-runtime/features/quote-inquiry-lifecycle.js';
import { createSidebarAstrasLifecycle } from '/src/app/legacy-runtime/features/sidebar-astras-lifecycle.js';
import { createConversationStateAccess } from '/src/app/legacy-runtime/runtime/conversation-state-access.js';
import { createRuntimeRenderCoordinator } from '/src/app/legacy-runtime/runtime/runtime-render-coordinator.js';
import { createRuntimeDialogCoordinator } from '/src/app/legacy-runtime/runtime/runtime-dialog-coordinator.js';
import { createRuntimeConfigAccess } from '/src/app/legacy-runtime/runtime/runtime-config-access.js';
import { createRuntimeDomAccess } from '/src/app/legacy-runtime/runtime/runtime-dom-access.js';
import { createTrustedHtmlSanitizer, escapeHTML, getBackupUsername, getErrorMessage, hexToRgba, postJsonWithReadableError, processInChunks, readErrorBody, renderUserText } from '/src/app/runtime/legacy-core/legacy-core-utilities.js';
import { createHistorySidebarHelpers } from '/src/app/runtime/legacy-core/history-sidebar-helpers.js';
import { createMarkdownRenderingHelpers } from '/src/app/runtime/legacy-core/markdown-rendering-helpers.js';
import { createWorkspaceLoad } from '/src/app/runtime/legacy-core/workspace-load.js';
import { createConversationActions, getDefaultFolder, getDefaultGenConfig } from '/src/app/runtime/legacy-core/conversation-actions.js';
import { observeMessageCharts } from '/src/app/ui/charts/chart-renderer.js';
import { createActiveConversationStore } from '/src/app/runtime/kernel/active-conversation-store.js';
import { createLiveConversationsBridge } from '/src/app/runtime/kernel/live-conversations-bridge.js';
import { createLegacyRuntimeDomRegistry } from '/src/app/runtime/kernel/dom-registry.js';
import { createRuntimeAppKernel } from '/src/app/runtime-app.js';
import { createDialogNotificationLifecycle } from '/src/app/runtime/features/dialog-notification-lifecycle.js';
import { arrangeInputMediaPreview } from '/src/app/runtime/features/input-media-placement.js';
import { createCloudWorkspaceLiveLifecycle } from '/src/app/runtime/features/cloud-workspace-live-lifecycle.js';
import { createDesktopComposerLayout } from '/src/app/runtime/features/desktop-composer-layout.js';
import { createLegacyRuntimeStorageAdapter } from '/src/app/runtime/kernel/storage-adapter.js';
import { createLegacyRuntimeConfigPersistence } from '/src/app/runtime/kernel/config-persistence.js';
import { normalizeApiKeyValue } from '/src/app/runtime/kernel/config-normalization.js';
import { createLegacyRuntimeAppDataPersistence } from '/src/app/runtime/kernel/app-data-persistence.js';
import { notifyCloudConversationSave } from '/src/app/runtime/kernel/cloud-conversation-save-observer.js';
import { createSensitiveConfigPersistence, createSensitiveConfigStore } from '/src/app/runtime/security/sensitive-config-store.js';
import { CHEAP_MODEL_ID, COUNCIL_MAX_MODELS, COUNCIL_MIN_MODELS, COUNCIL_RESPONSE_CHAR_LIMIT, COUNCIL_RETRY_DELAY_MS, MODELS, OPENROUTER_VISION_MODELS, createLegacyModelRegistry, getModelReasoningConfig, modelGeneratesImages, normalizeReasoningEffort } from '/src/app/runtime/legacy-core/model-registry.js';
import { createCouncilValidation } from '/src/app/runtime/legacy-core/council-validation.js';
import { FOLDER_COLORS, UI_THEME_COLORS } from '/src/app/runtime/legacy-core/runtime-ui-colors.js';
import { SERVICES, getService } from '/src/app/runtime/services.js';
import { createShellState } from '/src/app/runtime/legacy-core/shell-state.js';
import * as passwordRecords from '/src/app/runtime/security/password-records.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Chart from 'chart.js/auto';
import Cropper from 'cropperjs';
import { getKatex } from '/src/app/vendors/katex-vendor.js';
import { loadArchiveVendor } from '/src/app/vendors/archive-vendor.js';
import { loadSharingVendor } from '/src/app/vendors/sharing-vendor.js';
import { i18n } from '/src/data/i18n.js';
import { OFFICIAL_ASTRAS } from '/src/data/astras-data.js';
import { updateLogs } from '/src/data/update-logs.js';
import { PRODUCT_VERSION as productVersion } from '/src/data/version.js';

// The start of the chat page after signing in, and the height of the message field: made at the end of this module with the start of
// the page (app-bootstrap-lifecycle.js, startup-lifecycle.js), and called only once the page runs.
let appBootstrapLifecycle = null;
let startupLifecycle = null;
const initChatApp = (...args) => appBootstrapLifecycle.initChatApp(...args);
const adjustTextareaHeight = (...args) => startupLifecycle?.adjustTextareaHeight(...args);
// The memory functions (memory-runtime.js, made with the workspace features below), or null before they exist.
let getMemoryFunctions = () => null;
const getMemory = () => getMemoryFunctions();
const sanitizeTrustedHTML = createTrustedHtmlSanitizer({ sanitizer: DOMPurify });

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('auth-container').classList.add('visible');
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
        const getText = (key, fallback) => i18n[runtimeConfigAccess.getUiLanguage()]?.[key] || fallback;
        const getConfig = () => runtimeConfigAccess.getConfig();
        const getUiLanguage = () => runtimeConfigAccess.getUiLanguage();
        const legacyModelRegistry = createLegacyModelRegistry({
            getConfig,
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
        const getOutputMode = () => 'realtime';
        let quoteInquiryLifecycle = null;
        // Who is signed in, the files waiting to be sent, the reply being made, the batch selection, the quoted text, the sidebar.
        const { session, uploads, reply, selection, quote, sidebar } = createShellState();
        const { getCurrentUser } = session;
        const {
            getCouncilTexts,
            getCouncilRuntimeTexts,
            getModelRetirementLabel,
            getModelPriceLabel,
            getCouncilAttachmentTranslationNeed,
            formatCouncilModelSummary,
            getCouncilValidation
        } = createCouncilValidation({ configAccess: runtimeConfigAccess, registry: legacyModelRegistry, i18n, getUploadedFiles: uploads.getUploadedFiles, getApiKeyForProvider: (provider) => getApiKeyForProvider(provider) });
        const runtimeStorageAdapter = createLegacyRuntimeStorageAdapter({
            indexedDBFactory: indexedDB,
            dbName: 'ChatAppDB',
            storeName: 'keyValue',
            version: 1
        });
        const { getItem, setItem, removeItem, readItems, setItemsAtomic } = runtimeStorageAdapter;
        let folderUiStatePersistencePromise;
        const getFolderUiStatePersistence = () => folderUiStatePersistencePromise ||= import('/src/app/runtime/kernel/folder-ui-state.js').then(({ createFolderUiStatePersistence }) => createFolderUiStatePersistence({ getUsername: () => getCurrentUser()?.username || null, getItem, setItem }));
        const saveFolderUiState = async (folders) => (await getFolderUiStatePersistence()).save(folders);
        const getGeneratedImageRuntime = createGeneratedImageRuntimeLoader({
            document,
            fetch,
            navigator,
            File,
            getItem,
            setItem,
            getUserName: () => getCurrentUser()?.username || 'anonymous',
            getActiveConversation: () => getActiveConversation(),
            buildSingleModelTranslatedRequestParts: (...args) => buildSingleModelTranslatedRequestParts(...args),
            getApiKeyForProvider: provider => getApiKeyForProvider(provider),
            getModelReasoningConfig,
            normalizeReasoningEffort,
            getText,
            showNotification: (...args) => showNotification(...args),
            getUiLanguage,
            getImageReadyText: () => getText('imageReadyToEdit', 'Image is ready for targeted editing.'),
            escapeHTML,
            setUploadedFiles: uploads.setUploadedFiles,
            renderFilePreviews: () => renderFilePreviews(),
            focusMessageInput: () => ALL_ELEMENTS.messageInput?.focus()
        });
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
            getCurrentUser,
            getItem,
            setItem,
            removeItem,
            getApiKeys: () => sensitiveConfigStore.getApiKeys(),
            replaceApiKeys: (apiKeys) => sensitiveConfigStore.replaceApiKeys(apiKeys),
            onSaved: () => getService(SERVICES.workspaceSync)?.queueLocalChange('sensitive')
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
        const { hashString, constantTimeEqual, createPasswordRecord, verifyPasswordRecord } = passwordRecords;
        const upgradeLegacyPasswordRecord = (password, userKey, userRecord) => passwordRecords.upgradeLegacyPasswordRecord(password, userKey, userRecord, setItem);
        const getConfigKey = () => `chatConfig_v_v8.6_${getCurrentUser().username}`;
        const getAppDataKey = () => `chatAppData_v8.6_${getCurrentUser().username}`;
        const getUserKey = (username) => `chatUser_${username}`;
        const runtimeAppDataPersistence = createLegacyRuntimeAppDataPersistence({
            setItem,readItem:getItem,readItems,setItemsAtomic,
            getCurrentUser,
            getAppData: () => runtimeAppDataStore.getSnapshot(),
            getAppDataKey,
            onSaved: notifyCloudConversationSave
        });
        const runtimeConfigPersistence = createLegacyRuntimeConfigPersistence({
            getCurrentUser,
            getConfig: () => runtimeConfigStore.getConfig(),
            getConfigKey,
            setItem,
            onSaved: () => getService(SERVICES.workspaceSync)?.queueLocalChange('config')
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
            requestAnimationFrame,
            getText
        });
        const runtimeDialogCoordinator = createRuntimeDialogCoordinator({
            showNotification: (...args) => showNotification(...args),
            logger: console
        });
         document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal').forEach(m => {
    if (!m.classList.contains('visible')) {
      m.classList.add('hidden');
      m.classList.remove('visible');
    }
  });
});
        const {
            renderMarkdown,
            renderMarkdownWithFormulas
        } = createMarkdownRenderingHelpers({
            marked,
            sanitizer: DOMPurify,
            DOMParser,
            katex: getKatex(),
            getUiLanguage,
            getText,
            logger: console
        });
        observeMessageCharts({
            root: ALL_ELEMENTS.messageList,
            chartLabel: getText('chart', 'Chart')
        });
        const saveConfig = async () => { await runtimeConfigPersistence.saveConfig(); };
        const { loadConfig, loadAppData } = createWorkspaceLoad({
            getCurrentUser, storage: runtimeStorageAdapter, configAccess: runtimeConfigAccess, appDataStore: runtimeAppDataStore,
            sensitiveConfigPersistence: runtimeSensitiveConfigPersistence, getConfigKey, getAppDataKey, mergeSensitiveApiKeys,
            saveSensitiveConfig, saveConfig: () => saveConfig(), normalizeCouncilConfig, normalizeConversationModel,
            getCouncilTranslatorCandidates, getSingleTranslatorCandidates, getFolderUiStatePersistence, showNotification
        });
        const saveAppData = async (options) => { await runtimeAppDataPersistence.saveAppData(options); };
        const cloudDeletionLifecycle = import('/src/app/runtime/legacy-core/cloud-delete-lifecycle.js')
            .then(({ createCloudDeletionLifecycle }) => createCloudDeletionLifecycle({
                getCurrentUser,
                getConversations: runtimeAppDataStore.getConversations,
                getAstras: runtimeAppDataStore.getAstras,
                getSync: () => getService(SERVICES.cloudSync)
            }));
        const deleteConversationsFromCloud = async (...args) =>
            (await cloudDeletionLifecycle).deleteConversations(...args);
        const deleteAstrasFromCloud = async (...args) =>
            (await cloudDeletionLifecycle).deleteAstras(...args);
        const deleteFolderFromCloud = async (...args) =>
            (await cloudDeletionLifecycle).deleteFolder(...args);
        let cancelPendingMemoryCapture = () => {};
        let invalidateConversationMemory = async () => {};
        const {
            startNewChat,
            loadChat,
            deleteChat,
            archiveChat,
            unarchiveChat,
            showArchivedChatPreview,
            togglePinChat,
            showRenameModal,
            handleRename
        } = createConversationActions({
            window, document, elements: ALL_ELEMENTS, i18n, uploads, disconnectMessageObserver: () => disconnectMessageObserver(),
            toggleSidebar: (...args) => toggleSidebar(...args),
            updateFunctionButtonsState: () => updateFunctionButtonsState(),
            runtimeConfigAccess, liveConversationsBridge, conversationStateAccess, runtimeAppDataStore, runtimeDialogCoordinator,
            cloneCouncilConfig, getText, toggleModal, saveAppData, renderMarkdown, bindGeneratedImageAssets,
            getActiveConversation: () => getActiveConversation(),
            renderAll: (...args) => renderAll(...args),
            renderSidebar: () => runtimeRenderCoordinator.renderSidebar(),
            adjustTextareaHeight,
            updateInputState: (...args) => updateInputState(...args),
            updateApiKeyWarningBadge: () => updateApiKeyWarningBadge(),
            getQuoteInquiry: () => quoteInquiryLifecycle,
            cancelPendingMemoryCapture: (id) => cancelPendingMemoryCapture(id),
            invalidateConversationMemory: (...args) => invalidateConversationMemory(...args)
        });
        const getActiveConversation = () => {
            const conv = conversationStateAccess.getCurrentConversation();
            if (conv) normalizeConversationModel(conv);
            return conv;
        };
        const desktopComposerLayout = createDesktopComposerLayout({
            window,
            elements: {
                chatWorkspace: ALL_ELEMENTS.chatWorkspace,
                chatContainer: ALL_ELEMENTS.chatContainer,
                inputBarContainer: ALL_ELEMENTS.inputBarContainer
            },
            getActiveConversation,
            ResizeObserver,
            requestFrame: requestAnimationFrame,
            cancelFrame: (frameId) => window.cancelAnimationFrame?.(frameId),
            scheduleTimeout: setTimeout,
            clearScheduledTimeout: clearTimeout
        });
        const historySidebarHelpers = createHistorySidebarHelpers({
            document,
            elements: ALL_ELEMENTS,
            getRequiredElement: (...args) => runtimeDomAccess.getRequiredElement(...args),
            getActiveConversation,
            getMessageTypeIcon,
            getConfig,
            hexToRgba,
            getTextColorForBackground,
            getConversations: () => liveConversationsBridge.getConversations(),
            createConversationElement: (...args) => createConversationElement(...args),
            getNamingText: () => getText('naming', 'AI is naming...'),
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
            renderHistorySidebar,
            renderFolders: () => renderFolders(),
            renderAstras: () => renderAstras(),
            renderChat:options=>renderChat(options),
            renderArchivedChats: () => renderArchivedChats(),
            renderBatchActionBar: () => renderBatchActionBar(),
            renderFilePreviews: () => renderFilePreviews(),
            applyLanguage: () => applyLanguage(runtimeConfigAccess.getUiLanguage()),
            logger:console,diagnostics:import.meta.env.DEV
        });
        const renderAll=(...args)=>runtimeRenderCoordinator.renderAll(...args);
        // Lists, header, greeting and the attachment menu write their words when drawn: drawn again when the language changes.
        window?.addEventListener?.('astra:language-changed', () => {
            if (!getCurrentUser()) return;
            renderAll({ animate: false, scrollMode: 'preserve', reason: 'language' });
            updateFunctionButtonsState();
        });
        const renderSidebar=(...args)=>runtimeRenderCoordinator.renderSidebar(...args);
        const sidebarAstrasLifecycle = createSidebarAstrasLifecycle({
            elements: ALL_ELEMENTS,
            getAstras: () => runtimeAppDataStore.getAstras(),
            getActiveAstrasId: () => getActiveAstrasId(),
            getIsSelectionMode: selection.isSelectionMode,
            getText,
            setAstrasForConversation: (...args) => setAstrasForConversation(...args),
            toggleSidebar: (...args) => toggleSidebar(...args),
            createAstrasMenu: (...args) => createAstrasMenu(...args),
            showMobileContextMenuForAstras: (...args) => showMobileContextMenuForAstras(...args),
            setTimeoutFn: (...args) => setTimeout(...args),
            clearTimeoutFn: (...args) => clearTimeout(...args),
            window
        });
        const renderAstras = (...args) => sidebarAstrasLifecycle.renderAstras(...args);


        import { createLegacySidebarChatAstraRenderLifecycle } from '/src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js';
        import { createLegacySubmitInputCouncilLifecycle } from '/src/app/runtime/legacy-core/submit-input-council-lifecycle.js';
        import { createRequestDecisions } from '/src/app/runtime/decisions/decision-request.js';
        import { createLegacySettingsAuthProviderLifecycle } from '/src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js';

        let renderFolders;
        let createConversationElement;
        let renderArchivedChats;
        let addMessageToUI;
        let isActiveConversationViewCurrent;
        let refreshMessageHistorySources;
        let renderChat;
        let getActiveAstrasId;
        let setAstrasForConversation;
        let deactivateAstras;
        let createAstras;
        let handleSaveAstras;
        let deleteAstras;
        let createAstrasMenu;
        let cancelMessageEditing = () => {};
        let getComposerEditSubmission = () => null;
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
            updateSubmitButtonState: (...args) => updateSubmitButtonState(...args),
            updateInputState: (...args) => updateInputState(...args),
            generateTitleAndSummary: (...args) => generateTitleAndSummary(...args),
            adjustTextareaHeight,
            renderFilePreviews: (...args) => renderFilePreviews(...args),
            uploads, reply, getAstras: () => runtimeAppDataStore.getAstras(),
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
            getConfig,
            runtimeConfigAccess,
            getCouncilRuntimeTexts,
            getCouncilSelectedModels,
            getCouncilTexts,
            getCouncilTranslatorModel,
            getCouncilValidation,
            getModelApiId,
            getModelFamilyKey,
            getModelFamilyName,
            getModelPriceLabel,
            getModelRetirementLabel,
            getModelTiers,
            getModelsByIds,
            getApiKeyForProvider,
            requestDecisions: createRequestDecisions({ getApiKeyForProvider, getConfig, logger: console }),
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
            renderChat: (...args) => renderChat(...args),
            renderHistorySidebar,
            renderSidebar,
            renderMarkdown,
            renderMarkdownWithFormulas,
            renderUserText,
            addMessageToUI: (...args) => addMessageToUI(...args),
            refreshMessageHistorySources: (...args) => refreshMessageHistorySources(...args),
            buildSingleModelTranslatedRequestParts: (...args) => buildSingleModelTranslatedRequestParts(...args),
            streamApiCall: (...args) => streamApiCall(...args),
            runModelCouncil: (...args) => runModelCouncil(...args),
            extractPersonalMemory: (...args) => extractPersonalMemory(...args),
            saveAppData,
            saveConfig,
            showNotification,
            showCustomDialog,
            updateApiKeyWarningBadge: (...args) => updateApiKeyWarningBadge(...args),
            getFileInputContainer: () => ALL_ELEMENTS.fileInputContainer,
            getActiveAstrasId: () => getActiveAstrasId(),
            deactivateAstras: (...args) => deactivateAstras(...args),
            onRegularSubmit: () => cancelMessageEditing(),
            getComposerEditSubmission: () => getComposerEditSubmission(),
            getQuoteReference: quote.getQuoteReference,
            buildQuotedUserParts: ({ question, quoteReference: reference }) => buildQuotedUserParts({
                question,
                quoteReference: reference,
                getText
            }),
            clearQuoteReference: () => quoteInquiryLifecycle?.clearQuote(),
            beginFirstSubmit: () => desktopComposerLayout.beginFirstSubmit(),
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
            handleFormSubmit,
            submitEditedMessage
        } = submitInputCouncilLifecycle;
        quoteInquiryLifecycle = createQuoteInquiryLifecycle({
            window,
            document,
            elements: ALL_ELEMENTS,
            getActiveConversation,
            getText,
            getQuoteReference: quote.getQuoteReference,
            setQuoteReference: quote.setQuoteReference,
            onComposerChange: () => {
                updateInputState();
                adjustTextareaHeight();
            }
        });
        quoteInquiryLifecycle.init();
        const settingsAuthProviderLifecycle = createLegacySettingsAuthProviderLifecycle({
            window,
            document,
            fetch,
            AbortSignal,
            requestAnimationFrame,
            setTimeout,
            console,
            elements: ALL_ELEMENTS,
            runtimeConfigAccess, runtimeAppDataStore, session, uploads, reply, quote,
            getMemory,
            initChatApp,
            runtimeStorageAdapter,
            models: MODELS,
            i18n,
            cheapModelId: CHEAP_MODEL_ID,
            councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
            councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS,
            councilMaxModels: COUNCIL_MAX_MODELS,
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
            runMemoryModel,
            buildSingleModelTranslatedRequestParts,
            runModelCouncil,
            callApiWithSchema,
            generateTitleAndSummary,
            updateSubmitButtonState,
            updateInputState,
            getTavilySearchDepth,
            isMobileSettingsViewport,
            openSettingsMobileSection,
            setupSettingsModal,
            saveSettings,
            createHistoryMenu,
            setTheme,
            updateThemeButtons,
            handleLogin,
            handleLogout,
            handleDeleteAllData
        } = settingsAuthProviderLifecycle;
        const sidebarChatAstraRenderLifecycle = createLegacySidebarChatAstraRenderLifecycle({
            window,
            document,
            navigator,
            fetch,
            File,
            crypto,
            requestAnimationFrame,
            elements: ALL_ELEMENTS,
            toggleSidebar: (...args) => toggleSidebar(...args),
            updateInputState,
            generateTitleAndSummary,
            runtimeAppDataStore, liveConversationsBridge, session, selection,
            isAutoScrolling: () => isAutoScrolling(),
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
            deleteAstrasFromCloud,
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
            getGeneratedImageAssetStore: async () => (await getGeneratedImageRuntime()).assetStore,
            syncComposerLayout: (...args) => desktopComposerLayout.sync(...args)
        });
        ({
            renderFolders,
            createConversationElement,
            renderArchivedChats,
            addMessageToUI,
            isActiveConversationViewCurrent,
            refreshMessageHistorySources,
            renderChat,
            getActiveAstrasId,
            setAstrasForConversation,
            deactivateAstras,
            createAstras,
            handleSaveAstras,
            deleteAstras,
            createAstrasMenu
        } = sidebarChatAstraRenderLifecycle);
        // Editing a sent message (message-editing-lifecycle.js) loads the first time one is edited; until then no editor is open.
        let messageEditingLifecycle = null;
        let messageEditingLoad = null;
        const loadMessageEditing = () => messageEditingLoad ||= import('/src/app/legacy-runtime/features/message-editing-lifecycle.js').then(({ createMessageEditingLifecycle }) => createMessageEditingLifecycle({
            document,
            elements: ALL_ELEMENTS,
            getActiveConversation,
            getUploadedFiles: uploads.getUploadedFiles,
            setUploadedFiles: uploads.setUploadedFiles,
            renderFilePreviews: (...args) => renderFilePreviews(...args),
            renderInputIndicators: (...args) => renderInputIndicators(...args),
            updateInputState,
            renderChat: (...args) => renderChat(...args),
            saveAppData,
            invalidateConversationMemory: (...args) => invalidateConversationMemory(...args),
            submitEditedMessage: (...args) => submitEditedMessage(...args),
            getText,
            isMobile: () => window.matchMedia('(max-width: 768px)').matches
        })).then((lifecycle) => (messageEditingLifecycle = lifecycle), (error) => {
            messageEditingLoad = null;
            throw error;
        });
        const startMessageEditing = (...args) => loadMessageEditing()
            .then((lifecycle) => lifecycle.startMessageEditing(...args))
            .catch((error) => console.error('Failed to open the message editor:', error));
        cancelMessageEditing = (...args) => messageEditingLifecycle?.cancelMessageEditing(...args);
        getComposerEditSubmission = (...args) => messageEditingLifecycle?.getComposerEditSubmission(...args) ?? null;
        import { createBatchActionBarLifecycle } from '/src/app/legacy-runtime/features/batch-action-bar-lifecycle.js';
        import { createLegacyFolderLifecycle } from '/src/app/runtime/features/folder-lifecycle.js';
        import { createWorkspaceFeatures } from '/src/app/runtime/legacy-core/workspace-features.js';
        import { createPageFeatures } from '/src/app/runtime/legacy-core/page-features.js';
        import { createMemorySyncState } from '/src/app/runtime/memory/memory-sync-state.js';
        import { createLegacyAppBootstrapLifecycle } from '/src/app/runtime/features/app-bootstrap-lifecycle.js';
        import { createLegacyStartupLifecycle } from '/src/app/runtime/features/startup-lifecycle.js';
        import { initializeComposerRichEditor } from '/src/app/runtime/features/composer-rich-editor.js';
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
            deferConversationFolderSync: id => getService(SERVICES.cloudSync)?.deferConversationFolderSync?.([id]),
            deleteFolderFromCloud,
            renderFolders,
            renderAll,
            renderSidebar,
            showCustomConfirm,
            showNotification,
            toggleModal,
            showRenameModal,
            folderColors: FOLDER_COLORS,
            folderIconOptions: FOLDER_ICON_OPTIONS,
            normalizeFolderColorSelection: (selectedColor) =>
                normalizeFolderColorSelection(selectedColor, FOLDER_COLORS),
            getI18n: () => i18n,
            getUiLanguage,
            randomUUID: () => crypto.randomUUID(),
            scheduleAnimationFrame: requestAnimationFrame,
            logger: console
        });
        const batchActionBarLifecycle = createBatchActionBarLifecycle({
            elements: ALL_ELEMENTS,
            getI18n: () => i18n,
            selection,
            getUiLanguage,
            renderSidebar
        });
        const { renderBatchActionBar, toggleSelectionMode } = batchActionBarLifecycle;
        const workspaceFeatures = createWorkspaceFeatures({
            window, document, navigator, fetch, File, FileReader, Image, URL, Event, Chart, loadArchiveVendor,
            requestAnimationFrame, setTimeout, clearTimeout, crypto, console,
            elements: ALL_ELEMENTS, i18n, models: MODELS,
            runtimeConfigAccess, runtimeAppDataStore, liveConversationsBridge, runtimeStorageAdapter, runtimeDialogCoordinator,
            conversationStateAccess, session, uploads, sidebar, selection,
            updateInputState, setupSettingsModal, initChatApp,
            applyUiTheme: (...args) => applyUiTheme(...args),
            applyLanguage: (...args) => applyLanguage(...args),
            setupTimeAnalysis: (...args) => setupTimeAnalysis(...args),
            getSensitiveApiKeys, mergeSensitiveApiKeys, saveSensitiveConfig, saveConfig, saveAppData,
            showNotification, showCustomConfirm, showCustomPrompt, toggleModal, toggleSelectionMode,
            escapeHTML, renderUserText, renderMarkdownWithFormulas,
            startNewChat, loadChat, getActiveConversation, moveConversationToFolder, createNewFolder,
            normalizeConversationModel, isCouncilEnabled, modelSupportsVision, getCouncilValidation, getApiKeyForProvider,
            getGeneratedImageRuntime, runMemoryModel, callApiWithSchema, getOutputMode, hashString, constantTimeEqual,
            processInChunks, getBackupUsername, createPasswordRecord, getUserKey, setItem
        });
        const {
            renderPersonalMemoryList, refineAndStoreMemories, extractPersonalMemory, updateApiKeyWarningBadge, openDashboard,
            renderDashboardStats, renderModelUsageChart, performSearchAndRenderResults, generateSearchKeywords, calculateRelevanceScores,
            renderFilePreviews, removeFile, handleFileSelection, toggleSidebar, handleBatchDelete, handleBatchArchive, handleBatchMove,
            renderBatchMoveModal, batchMoveToFolder, handleExport, performImport, handleImport, handleImportOnAuth, processAuthImport,
            setupVoiceInput, toggleVoiceInput, closeAllPopovers, copyTextToClipboard,
            cancelMemoryCapture: cancelMemoryCaptureWork, invalidateMemoryConversation, ensureMemorySummaryFresh
        } = workspaceFeatures;
        cancelPendingMemoryCapture = cancelMemoryCaptureWork;
        invalidateConversationMemory = invalidateMemoryConversation;
        getMemoryFunctions = workspaceFeatures.getMemory;
        const {
            setupTimeAnalysis, updateTimeDistributionChart, applyUiTheme, renderUiColorOptions, openStore, closeStore, renderStore,
            handleSubscription, openAvatarEditor, handleAvatarUpload, handleConfirmAvatarCrop, cancelAvatarCrop, applyLanguage, showMobileContextMenu,
            showMobileContextMenuForFolder, showMobileContextMenuForAstras, setupScrollToBottomButton, checkAndShowLatestUpdate,
            setupMessageIntersectionObserver, disconnectMessageObserver, isAutoScrolling, renderTrash, handleRestoreTrashItem, handleDeleteTrashItemPermanently,
            showTrashItemInViewModal, toggleTrashSelectionMode, renderTrashBatchActionBar, handleBatchRestoreFromTrash,
            handleBatchDeleteFromTrash, handleEmptyTrash, updateDisplayedVersion
        } = createPageFeatures({
            window, document, navigator, fetch, File, Event, Image, FileReader, Chart, Cropper,
            ResizeObserver, IntersectionObserver, requestAnimationFrame, setTimeout, clearTimeout, crypto, console,
            elements: ALL_ELEMENTS, runtimeConfigAccess, runtimeAppDataStore, liveConversationsBridge, runtimeDialogCoordinator, i18n,
            OFFICIAL_ASTRAS, updateLogs, productVersion, UI_THEME_COLORS, getMemory,
            updateInputState, setTheme, updateThemeButtons, saveConfig, saveAppData, deleteConversationsFromCloud, deleteAstrasFromCloud,
            showNotification, showCustomConfirm, toggleModal, escapeHTML, sanitizeTrustedHTML,
            renderAll, renderAstras, renderInputIndicators, renderCouncilControls, renderPersonalMemoryList,
            showRenameModal, togglePinChat, archiveChat, deleteChat, moveConversationToFolder, renderBatchMoveModal,
            showFolderSettingsModal, deleteFolder, deleteAstras, editAstras: sidebarChatAstraRenderLifecycle.editAstras,
            formatFullTimestamp, renderUserText, renderMarkdownWithFormulas, bindGeneratedImageAssets
        });
        // Created after the workspace and page features so its dependencies are plain
        // references. Its listeners only receive async cloud events, so ordering is safe.
        createCloudWorkspaceLiveLifecycle({
            window,configAccess:runtimeConfigAccess,appDataStore:runtimeAppDataStore,
            getDefaultFolder,getDefaultGenConfig,normalizeCouncilConfig,normalizeConversationModel,
            models:MODELS,maxCouncilModels:COUNCIL_MAX_MODELS,
            getCouncilTranslatorCandidates,getSingleTranslatorCandidates,
            applyUiTheme,applyLanguage,
            renderSidebar,renderChat,getActiveConversation,isActiveConversationViewCurrent,
            onActiveConversationUnavailable:({conversationId})=>{
                if (conversationStateAccess.getCurrentConversationId() !== conversationId) return;
                const nextConversation = runtimeAppDataStore.getConversations()
                    .find(conversation => !conversation.archived && !conversation.deletedAt && conversation.id !== conversationId);
                if (nextConversation) loadChat(nextConversation.id);
                else void startNewChat({keepSidebarOpen:true});
            },
            onRemoteConversationsMovedToTrash: async ({conversationIds})=>{
                for (const conversationId of conversationIds || []) {
                    await invalidateMemoryConversation({conversationId,skipSummaryRebuild:true});
                }
            },
            onRemoteConversationsPermanentlyDeleted: async ({conversationIds})=>{
                for (const conversationId of conversationIds || []) {
                    await invalidateMemoryConversation({conversationId,skipSummaryRebuild:true});
                }
            },
            onRemoteConversationsApplied:()=>ensureMemorySummaryFresh({force:true}),
            onMemorySyncApplied:()=>ensureMemorySummaryFresh({force:true}),
            saveAppData,busy:()=>reply.getAbortController()&&liveConversationsBridge.getConversations().find(c=>c.__astraPendingResponse)
        });

        // The start of the page: the chat page once signed in (app-bootstrap-lifecycle.js), the sign-in page and loading (startup-lifecycle.js).
        const { replaceMemoryState, restoreMemorySync } = createMemorySyncState({ runtimeConfigAccess, runtimeAppDataStore, saveConfig, saveAppData, console });
        appBootstrapLifecycle = createLegacyAppBootstrapLifecycle({
            window, document, elements: ALL_ELEMENTS, loadArchiveVendor, loadSharingVendor, BlobCtor: Blob,
            getCurrentUser, getConfig, getConversations: () => liveConversationsBridge.getConversations(),
            getFolders: () => runtimeAppDataStore.getFolders(), getAstras: () => runtimeAppDataStore.getAstras(),
            getPersonalMemories: () => runtimeAppDataStore.getPersonalMemories(),
            getMemoryState: () => runtimeAppDataStore.getMemoryState(), replaceMemoryState,
            getCurrentConversationId: () => conversationStateAccess.getCurrentConversationId(),
            setCurrentConversationId: (id) => conversationStateAccess.setCurrentConversationId(id),
            setSidebarOpen: sidebar.setSidebarOpen, setSendConfirmed: reply.setSendConfirmed, getAbortController: reply.getAbortController,
            startNewChat, renderAll, setTheme, setupVoiceInput, setupScrollToBottomButton, updateDisplayedVersion, checkAndShowLatestUpdate,
            updateFunctionButtonsState, updateInputState, setupSettingsModal, toggleSidebar, toggleModal, saveSettings, saveAppData,
            handleExport, handleImport, handleLogout, handleFileSelection, handleFormSubmit, handleRename, handleSaveFolderSettings,
            performSearchAndRenderResults, loadChat, openDashboard, getActiveConversation, copyTextToClipboard, startMessageEditing,
            showNotification, showCustomConfirm, normalizeConversationModel, getCouncilSelectedModels, isCouncilEnabled,
            hasCouncilWebSearchAccess, hasSingleWebSearchAccess, hasSingleDocumentAccess, modelSupportsVision, getCouncilTexts,
            renderInputIndicators, toggleLearningMode, toggleSelectionMode, handleBatchDelete, handleBatchArchive, handleBatchMove,
            adjustTextareaHeight, submitChatForm, closeAllPopovers, showCustomPrompt, createNewFolder, createAstras, handleSaveAstras,
            renderPersonalMemoryList, handleDeleteAllData, applyLanguage, applyUiTheme, openStore, closeStore, handleAvatarUpload,
            handleConfirmAvatarCrop, cancelAvatarCrop, toggleTrashSelectionMode, handleBatchRestoreFromTrash, handleBatchDeleteFromTrash, handleEmptyTrash,
            updateFileInputUI, postJsonWithReadableError, openCouncilPopoverFromAttachmentMenu, setupHistorySidebarInteractions,
            setupHistorySidebarTriggers, requestMemorySummaryBootstrap: ensureMemorySummaryFresh, escapeHTML, getDefaultFolder,
            isMobileSettingsViewport, openSettingsMobileSection, i18n,
            randomUUID: () => crypto.randomUUID(), random: () => Math.random(), scheduleTimeout: setTimeout,
            clearScheduledTimeout: clearTimeout, scheduleAnimationFrame: requestAnimationFrame, logger: console
        });
        startupLifecycle = createLegacyStartupLifecycle({
            window, document, globalObject: globalThis, elements: ALL_ELEMENTS,
            getConfig, setCurrentUser: session.setCurrentUser,
            getItem, getUserKey, loadConfig, loadAppData, restoreMemorySync,
            getText: (key) => getText(key, ''),
            applyLanguage, applyUiTheme, initChatApp: appBootstrapLifecycle.initChatApp, handleLogin, handleImportOnAuth, processAuthImport,
            toggleModal, installTouchGuards, registerServiceWorker, showCustomDialog, getComputedStyle
        });

let pageStart = null;
/** Starts the page once (runtime-entry.js): the message field, the sign-in page and the loading of the workspace. */
export function startPage() {
    if (pageStart) return pageStart;
    initializeComposerRichEditor({ editor: ALL_ELEMENTS.messageInput, inputIndicatorContainer: ALL_ELEMENTS.inputIndicatorContainer, document });
    startupLifecycle.bindAuthStartupListeners();
    pageStart = Promise.resolve(startupLifecycle.initializeApp());
    startupLifecycle.bindLoginLanguageSwitcher();
    startupLifecycle.runStartupPostlude();
    return pageStart;
}
