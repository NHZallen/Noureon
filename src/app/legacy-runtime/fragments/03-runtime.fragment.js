        import { createLegacyBatchImportVoiceLifecycle } from '/src/app/runtime/legacy-core/batch-import-voice-lifecycle.js';
        import { createLegacySearchUploadSidebarLifecycle } from '/src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js';
        import { createLegacyModelMemoryDashboardLifecycle } from '/src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js';
        const resolveUploadUpdateInputState = (...args) => legacyRuntimeContext.resolveBinding('input.updateInputState')(...args);
        const searchUploadSidebarLifecycle = createLegacySearchUploadSidebarLifecycle({
            window,
            document,
            navigator,
            fetch,
            File,
            FileReaderCtor: FileReader,
            ImageCtor: Image,
            elements: ALL_ELEMENTS,
            getConfig: () => config,
            getConversations: () => conversations,
            getUploadedFiles: () => uploadedFiles,
            setUploadedFiles: (files) => {
                uploadedFiles = files;
                return uploadedFiles;
            },
            getSidebarOpen: () => sidebarOpen,
            setSidebarOpen: (nextSidebarOpen) => {
                sidebarOpen = nextSidebarOpen;
                return sidebarOpen;
            },
            escapeHTML,
            renderUserText,
            renderMarkdownWithFormulas,
            loadChat,
            toggleModal,
            callApiWithSchema,
            resolveUploadUpdateInputState,
            i18n,
            randomUUID: () => crypto.randomUUID(),
            scheduleTimeout: (...args) => setTimeout(...args),
            clearScheduledTimeout: (...args) => clearTimeout(...args),
            logger: console
        });
        const {
            performSearchAndRenderResults,
            showConversationInViewModal,
            generateSearchKeywords,
            calculateRelevanceScores,
            renderFilePreviews,
            removeFile,
            handleFileSelection,
            toggleSidebar
        } = searchUploadSidebarLifecycle;
        legacyRuntimeContext.registerLazyBinding('sidebar.toggleSidebar', () => toggleSidebar);
        const batchImportVoiceLifecycle = createLegacyBatchImportVoiceLifecycle({
            window,
            document,
            navigator,
            URL,
            File,
            JSZip,
            elements: ALL_ELEMENTS,
            legacyRuntimeContext,
            getConfig: () => config,
            mutateConfig: (mutator) => {
                if (typeof mutator === 'function') return mutator(config);
                Object.assign(config, mutator);
                return config;
            },
            getCurrentUser: () => currentUser,
            setCurrentUser: (nextUser) => {
                currentUser = nextUser;
                return currentUser;
            },
            getConversations: () => conversations,
            getFolders: () => folders,
            getAstras: () => astras,
            getPersonalMemories: () => personalMemories,
            replaceAllAppData: (nextAppData) => {
                const snapshot = runtimeAppDataStore.replaceAll(nextAppData);
                conversations = snapshot.conversations;
                folders = snapshot.folders;
                astras = snapshot.astras;
                personalMemories = snapshot.personalMemories;
                return snapshot;
            },
            replaceFolders: (nextFolders) => {
                folders = runtimeAppDataStore.replaceFolders(nextFolders);
                return folders;
            },
            replacePersonalMemories: (nextPersonalMemories) => {
                personalMemories = runtimeAppDataStore.replacePersonalMemories(nextPersonalMemories);
                return personalMemories;
            },
            getSelectedConversationIds: () => selectedConversationIds,
            conversationStateAccess,
            runtimeDialogCoordinator,
            saveAppData,
            saveConfig,
            toggleSelectionMode,
            toggleModal,
            showNotification,
            showCustomConfirm,
            showCustomPrompt,
            moveConversationToFolder,
            createNewFolder,
            startNewChat,
            processInChunks,
            getBackupUsername,
            createPasswordRecord,
            getUserKey,
            setItem,
            hashString,
            constantTimeEqual,
            requestAnimationFrame,
            analyzeImageBrightness,
            getDominantColorPalette,
            applyCustomWallpaper,
            applyUiTheme,
            applyLanguage,
            setAiBubbleColor,
            setUserBubbleColor,
            loadChat,
            getOutputMode,
            resolveUploadUpdateInputState,
            performSearchAndRenderResults,
            getCurrentSpeechRecognition: () => currentSpeechRecognition,
            setCurrentSpeechRecognition: (nextRecognition) => {
                currentSpeechRecognition = nextRecognition;
                return currentSpeechRecognition;
            },
            setCurrentVoiceTarget: (nextTarget) => {
                currentVoiceTarget = nextTarget;
                return currentVoiceTarget;
            },
            i18n,
            randomUUID: () => crypto.randomUUID(),
            scheduleTimeout: (callback, ms) => setTimeout(callback, ms),
            delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            logger: console
        });

        const {
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
            toggleVoiceInput
        } = batchImportVoiceLifecycle;
        const modelMemoryDashboardLifecycle = createLegacyModelMemoryDashboardLifecycle({
            Chart,
            document,
            requestAnimationFrame,
            crypto,
            elements: ALL_ELEMENTS,
            getConfig: () => config,
            getConversations: () => conversations,
            getFolders: () => folders,
            getPersonalMemories: () => personalMemories,
            replacePersonalMemories: (nextPersonalMemories) => {
                personalMemories = runtimeAppDataStore.replacePersonalMemories(nextPersonalMemories);
                return personalMemories;
            },
            getModelPieChart: () => modelPieChart,
            setModelPieChart: (chart) => { modelPieChart = chart; },
            models: MODELS,
            i18n,
            getModelTiers,
            getModelApiId,
            saveConfig,
            saveAppData,
            runtimeDialogCoordinator,
            showNotification,
            showCustomConfirm,
            toggleModal,
            callApiWithSchema,
            getActiveConversation,
            normalizeConversationModel,
            isCouncilEnabled,
            getCouncilValidation,
            getApiKeyForProvider,
            setupTimeAnalysis,
            console
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
            renderModelUsageChart
        } = modelMemoryDashboardLifecycle;


        function closeAllPopovers() {
            document.querySelectorAll('.popover.visible').forEach(popover => {
                popover.classList.remove('visible');
            });
        }
        async function copyTextToClipboard(text) {
            if (navigator.clipboard && window.isSecureContext) {
                try {
                    await navigator.clipboard.writeText(text);
                    return;
                } catch (err) {
                    console.warn('Clipboard API 失敗，改用備用方案。', err);
                }
            }
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.top = "-9999px";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if (!successful) {
                    throw new Error('備用複製指令失敗。');
                }
            } catch (err) {
                document.body.removeChild(textArea);
                throw err;
            }
            document.body.removeChild(textArea);
        }

        const coreTailState = {
            get conversations() { return conversations; },
            set conversations(next) { conversations = next; },
            get folders() { return folders; },
            set folders(next) { folders = next; },
            get astras() { return astras; },
            set astras(next) { astras = next; },
            get personalMemories() { return personalMemories; },
            set personalMemories(next) { personalMemories = next; },
            get config() { return config; },
            set config(next) { config = next; },
            get currentUser() { return currentUser; },
            set currentUser(next) { currentUser = next; },
            get sidebarOpen() { return sidebarOpen; },
            set sidebarOpen(next) { sidebarOpen = next; },
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

        const coreTailDependencies = {
            window,
            document,
            navigator,
            fetch,
            File,
            Event,
            Blob,
            Image,
            FileReader,
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
            random: () => Math.random(),
            elements: ALL_ELEMENTS,
            state: coreTailState,
            runtimeConfigAccess,
            runtimeAppDataStore,
            runtimeDialogCoordinator,
            legacyRuntimeContext,
            i18n,
            OFFICIAL_ASTRAS,
            updateLogs,
            UI_THEME_COLORS,
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
            renderBatchMoveModal,
            showFolderSettingsModal,
            deleteFolder,
            deleteAstras,
            showCustomConfirm,
            formatFullTimestamp,
            renderUserText,
            renderMarkdownWithFormulas,
            startNewChat,
            renderAll,
            setupVoiceInput,
            updateFunctionButtonsState,
            toggleSidebar,
            saveSettings,
            handleExport,
            handleImport,
            handleLogout,
            handleFileSelection,
            handleFormSubmit,
            handleRename,
            handleSaveFolderSettings,
            performSearchAndRenderResults,
            loadChat,
            openDashboard,
            getActiveConversation,
            copyTextToClipboard,
            normalizeConversationModel,
            getCouncilSelectedModels,
            isCouncilEnabled,
            hasCouncilWebSearchAccess,
            hasSingleWebSearchAccess,
            hasSingleDocumentAccess,
            modelSupportsVision,
            getCouncilTexts,
            renderInputIndicators,
            toggleLearningMode,
            toggleSelectionMode,
            handleBatchDelete,
            handleBatchArchive,
            handleBatchMove,
            submitChatForm,
            closeAllPopovers,
            showCustomPrompt,
            createNewFolder,
            createAstras,
            handleSaveAstras,
            renderPersonalMemoryList,
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
            handleImportOnAuth,
            processAuthImport,
            installTouchGuards,
            registerServiceWorker,
            showCustomDialog
        };

        legacyRuntimeContext.registerLazyBinding(
            'runtime.coreTailDependencies',
            () => coreTailDependencies
        );

        const resolveCoreTailFunction = (name) => {
            const binding = legacyRuntimeContext.resolveBinding(`coreTail.${name}`);
            if (typeof binding !== 'function') {
                throw new TypeError(`Legacy core tail binding "coreTail.${name}" must be a function.`);
            }
            return binding;
        };

        function setupTimeAnalysis(...args) { return resolveCoreTailFunction('setupTimeAnalysis')(...args); }
        function updateTimeDistributionChart(...args) { return resolveCoreTailFunction('updateTimeDistributionChart')(...args); }
        function getDominantColorPalette(...args) { return resolveCoreTailFunction('getDominantColorPalette')(...args); }
        function applyUiTheme(...args) { return resolveCoreTailFunction('applyUiTheme')(...args); }
        function renderUiColorOptions(...args) { return resolveCoreTailFunction('renderUiColorOptions')(...args); }
        function analyzeImageBrightness(...args) { return resolveCoreTailFunction('analyzeImageBrightness')(...args); }
        function applyCustomWallpaper(...args) { return resolveCoreTailFunction('applyCustomWallpaper')(...args); }
        function handleWallpaperUpload(...args) { return resolveCoreTailFunction('handleWallpaperUpload')(...args); }
        function handleConfirmCrop(...args) { return resolveCoreTailFunction('handleConfirmCrop')(...args); }
        function restoreDefaultWallpaper(...args) { return resolveCoreTailFunction('restoreDefaultWallpaper')(...args); }
        function openStore(...args) { return resolveCoreTailFunction('openStore')(...args); }
        function closeStore(...args) { return resolveCoreTailFunction('closeStore')(...args); }
        function renderStore(...args) { return resolveCoreTailFunction('renderStore')(...args); }
        function handleSubscription(...args) { return resolveCoreTailFunction('handleSubscription')(...args); }
        function openAvatarEditor(...args) { return resolveCoreTailFunction('openAvatarEditor')(...args); }
        function handleAvatarUpload(...args) { return resolveCoreTailFunction('handleAvatarUpload')(...args); }
        function handleConfirmAvatarCrop(...args) { return resolveCoreTailFunction('handleConfirmAvatarCrop')(...args); }
        function applyLanguage(...args) { return resolveCoreTailFunction('applyLanguage')(...args); }
        function showMobileContextMenu(...args) { return resolveCoreTailFunction('showMobileContextMenu')(...args); }
        function showMobileContextMenuForFolder(...args) { return resolveCoreTailFunction('showMobileContextMenuForFolder')(...args); }
        function showMobileContextMenuForAstras(...args) { return resolveCoreTailFunction('showMobileContextMenuForAstras')(...args); }
        function setupScrollToBottomButton(...args) { return resolveCoreTailFunction('setupScrollToBottomButton')(...args); }
        function showUpdateHistory(...args) { return resolveCoreTailFunction('showUpdateHistory')(...args); }
        function checkAndShowLatestUpdate(...args) { return resolveCoreTailFunction('checkAndShowLatestUpdate')(...args); }
        function setupMessageIntersectionObserver(...args) { return resolveCoreTailFunction('setupMessageIntersectionObserver')(...args); }
        function renderTrash(...args) { return resolveCoreTailFunction('renderTrash')(...args); }
        function handleRestoreTrashItem(...args) { return resolveCoreTailFunction('handleRestoreTrashItem')(...args); }
        function handleDeleteTrashItemPermanently(...args) { return resolveCoreTailFunction('handleDeleteTrashItemPermanently')(...args); }
        function showTrashItemInViewModal(...args) { return resolveCoreTailFunction('showTrashItemInViewModal')(...args); }
        function toggleTrashSelectionMode(...args) { return resolveCoreTailFunction('toggleTrashSelectionMode')(...args); }
        function renderTrashBatchActionBar(...args) { return resolveCoreTailFunction('renderTrashBatchActionBar')(...args); }
        function handleBatchRestoreFromTrash(...args) { return resolveCoreTailFunction('handleBatchRestoreFromTrash')(...args); }
        function handleBatchDeleteFromTrash(...args) { return resolveCoreTailFunction('handleBatchDeleteFromTrash')(...args); }
        function handleEmptyTrash(...args) { return resolveCoreTailFunction('handleEmptyTrash')(...args); }
        function updateDisplayedVersion(...args) { return resolveCoreTailFunction('updateDisplayedVersion')(...args); }
