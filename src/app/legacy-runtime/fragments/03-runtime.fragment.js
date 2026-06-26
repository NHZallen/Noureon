        import { compressImage } from '/src/app/runtime/utils/image-compression.js';

        const handleBatchDelete = async () => {
            const count = selectedConversationIds.size;
            if (count === 0) return;
            if (!(await showCustomConfirm(`${i18n[config.uiLanguage].confirmBatchMoveToTrash || '您確定要將這'} ${count} ${i18n[config.uiLanguage].conversations || '個對話'} ${i18n[config.uiLanguage].moveToTrashConfirmText || '移至垃圾桶嗎？'}`))) return;
            selectedConversationIds.forEach(id => {
                const conv = conversations.find(c => c.id === id);
                if (conv) {
                    conv.deletedAt = new Date().toISOString();
                }
            });
            if (selectedConversationIds.has(conversationStateAccess.getCurrentConversationId())) {
                const nextConv = conversations.find(c => !c.archived && !c.deletedAt);
                conversationStateAccess.setCurrentConversationId(nextConv ? nextConv.id : null);
                if (!conversationStateAccess.getCurrentConversationId()) startNewChat();
            }
            await saveAppData();
            toggleSelectionMode();
            showNotification(`${i18n[config.uiLanguage].batchMoveToTrashSuccess || '已成功將'} ${count} ${i18n[config.uiLanguage].conversations || '個對話'} ${i18n[config.uiLanguage].movedToTrashText || '移至垃圾桶。'}`, 'success');
        };
        const handleBatchArchive = async () => {
            const count = selectedConversationIds.size;
            if (count === 0) return;
            conversations.forEach(c => {
                if (selectedConversationIds.has(c.id)) {
                    c.archived = true;
                }
            });
            if (selectedConversationIds.has(conversationStateAccess.getCurrentConversationId())) {
                const nextConv = conversations.find(c => !c.archived && !c.deletedAt);
                conversationStateAccess.setCurrentConversationId(nextConv ? nextConv.id : null);
                if (!conversationStateAccess.getCurrentConversationId()) startNewChat();
            }
            await saveAppData();
            toggleSelectionMode();
            runtimeDialogCoordinator.showNotification(`${i18n[config.uiLanguage].batchArchiveSuccess || '已成功封存'} ${count} ${i18n[config.uiLanguage].conversations || '個對話。'}`, 'success');
        };
        const handleBatchMove = () => {
            if (selectedConversationIds.size === 0) return;
            renderBatchMoveModal();
            toggleModal(ALL_ELEMENTS.batchMoveModal, true);
        };
        const renderBatchMoveModal = (singleConvId = null) => {
            const container = ALL_ELEMENTS.batchMoveFolderList;
            container.dataset.singleConvId = singleConvId || '';
            container.innerHTML = `
                <button class="w-full text-left p-2 rounded-md hover:bg-[var(--hover-bg)]" data-folder-id="none">
                    ${i18n[config.uiLanguage].moveOutOfFolder || '移出資料夾'}
                </button>
            `;
            folders.forEach(folder => {
                const btn = document.createElement('button');
                btn.className = 'w-full text-left p-2 rounded-md hover:bg-[var(--hover-bg)]';
                btn.dataset.folderId = folder.id;
                btn.textContent = folder.name;
                container.appendChild(btn);
            });
            const newFolderOption = document.createElement('button');
            newFolderOption.className = 'w-full text-left p-2 rounded-md hover:bg-[var(--hover-bg)] flex items-center gap-2 border-t border-[var(--border-color)] mt-2';
            newFolderOption.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path><line x1="12" y1="10" x2="12" y2="16"></line><line x1="9" y1="13" x2="15" y2="13"></line></svg>${i18n[config.uiLanguage].createNewFolder || '建立新資料夾'}`;
            newFolderOption.addEventListener('click', async () => {
                toggleModal(ALL_ELEMENTS.batchMoveModal, false);
                const name = await showCustomPrompt(i18n[config.uiLanguage].enterFolderName || '請輸入新資料夾名稱：', i18n[config.uiLanguage].createFolder || '建立資料夾');
                if (name) {
                    const newId = createNewFolder(name);
                    batchMoveToFolder(newId);
                }
            });
            container.appendChild(newFolderOption);
            container.querySelectorAll('button[data-folder-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const folderId = btn.dataset.folderId === 'none' ? null : btn.dataset.folderId;
                    batchMoveToFolder(folderId);
                });
            });
        };
        const batchMoveToFolder = async (folderId) => {
            const singleConvId = ALL_ELEMENTS.batchMoveFolderList.dataset.singleConvId;
            let idsToMove;
            if (singleConvId) {
                idsToMove = new Set([singleConvId]);
            } else {
                idsToMove = selectedConversationIds;
            }
            const count = idsToMove.size;
            idsToMove.forEach(convId => {
                moveConversationToFolder(convId, folderId);
            });
            toggleModal(ALL_ELEMENTS.batchMoveModal, false);
            if (!singleConvId) {
                toggleSelectionMode();
            }
            showNotification(`${i18n[config.uiLanguage].moved || '已移動'} ${count} ${i18n[config.uiLanguage].conversations || '個對話。'}`);
        };
        import { createLegacySearchUploadSidebarLifecycle } from '/src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js';
        import { createLegacyImportExportLifecycle } from '/src/app/runtime/features/import-export-lifecycle.js';
        import { createLegacyAuthImportLifecycle } from '/src/app/runtime/features/auth-import-lifecycle.js';
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
        const resolveSearchSetupSettingsModal = (...args) => legacyRuntimeContext.resolveBinding('settings.setupSettingsModal')(...args);
        const importExportLifecycle = createLegacyImportExportLifecycle({
            document,
            window,
            navigator,
            URL,
            File,
            JSZip,
            elements: ALL_ELEMENTS,
            getCurrentUser: () => currentUser,
            getConfig: () => config,
            mutateConfig: (mutator) => {
                if (typeof mutator === 'function') return mutator(config);
                Object.assign(config, mutator);
                return config;
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
            saveAppData,
            saveConfig,
            processInChunks,
            getBackupUsername,
            compressImage,
            analyzeImageBrightness,
            getDominantColorPalette,
            applyCustomWallpaper,
            applyUiTheme,
            applyLanguage,
            setAiBubbleColor,
            setUserBubbleColor,
            loadChat,
            startNewChat,
            showCustomConfirm,
            showNotification,
            toggleModal,
            getOutputMode,
            resolveSearchSetupSettingsModal,
            i18n,
            randomUUID: () => crypto.randomUUID(),
            delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            logger: console,
        });

        const {
            handleExport,
            performImport,
            handleImport,
        } = importExportLifecycle;
        const authImportLifecycle = createLegacyAuthImportLifecycle({
            elements: ALL_ELEMENTS,
            JSZip,
            getConfig: () => config,
            mutateConfig: (mutator) => {
                if (typeof mutator === 'function') return mutator(config);
                Object.assign(config, mutator);
                return config;
            },
            setCurrentUser: (nextUser) => {
                currentUser = nextUser;
                return currentUser;
            },
            createPasswordRecord,
            getUserKey,
            setItem,
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
            saveAppData,
            saveConfig,
            processInChunks,
            getBackupUsername,
            hashString,
            constantTimeEqual,
            showNotification,
            toggleModal,
            requestAnimationFrame,
            scheduleTimeout: (callback, ms) => setTimeout(callback, ms),
            delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            initChatApp: () => legacyRuntimeContext.resolveBinding('app.initChatApp')(),
            i18n,
            logger: console,
        });

        const {
            handleImportOnAuth,
            processAuthImport,
        } = authImportLifecycle;
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
        const setupVoiceInput = () => {
            if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
                ALL_ELEMENTS.voiceInputBtnMessage.addEventListener('click', () => toggleVoiceInput('message'));
                ALL_ELEMENTS.voiceInputBtnSearch.addEventListener('click', () => toggleVoiceInput('search'));
            } else {
                ALL_ELEMENTS.voiceInputBtnMessage.style.display = 'none';
                ALL_ELEMENTS.voiceInputBtnSearch.style.display = 'none';
                showNotification(i18n[config.uiLanguage].voiceNotSupported || '您的瀏覽器不支援語音輸入功能。', 'warning');
            }
        };
        const toggleVoiceInput = (target) => {
            if (currentSpeechRecognition) {
                currentSpeechRecognition.stop();
                return;
            }
            currentVoiceTarget = target;
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            currentSpeechRecognition = new SpeechRecognition();
            currentSpeechRecognition.lang = 'zh-TW';
            currentSpeechRecognition.continuous = true;
            currentSpeechRecognition.interimResults = true;
            currentSpeechRecognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                const inputEl = target === 'message' ? ALL_ELEMENTS.messageInput : ALL_ELEMENTS.modalSearchInput;
                inputEl.value = transcript;
                if (target === 'search') {
                    performSearchAndRenderResults();
                }
                resolveUploadUpdateInputState();
            };
            currentSpeechRecognition.onend = () => {
                currentSpeechRecognition = null;
                currentVoiceTarget = null;
                ALL_ELEMENTS.voiceInputBtnMessage.classList.remove('active');
                ALL_ELEMENTS.voiceInputBtnSearch.classList.remove('active');
            };
            currentSpeechRecognition.onerror = (event) => {
                showNotification(`${i18n[config.uiLanguage].voiceError || '語音輸入錯誤'}: ${event.error}`, 'error');
                currentSpeechRecognition = null;
            };
            currentSpeechRecognition.start();
            ALL_ELEMENTS[`voiceInputBtn${target.charAt(0).toUpperCase() + target.slice(1)}`].classList.add('active');
        };

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
