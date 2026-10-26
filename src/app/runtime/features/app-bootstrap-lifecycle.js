import { createAppBootstrapComposition } from './app-bootstrap-composition.js';
import { createStoreNavigationLifecycle } from './store-navigation-lifecycle.js';
import { createP2PLifecycle } from './p2p-lifecycle.js';
import { addConfirmedProfileEntry } from '../memory/memory-profile-management.js';
import { openWhenBuilt, prepareWhenIdle } from './open-settings-when-built.js';
import { installFileCardInteractions } from '../../ui/files/file-card-interactions.js';
import { fitPopoverToViewport } from '../../ui/dom/fit-popover-to-viewport.js';
import { collectSandboxInputs, setSandboxFileHooks } from '../../ui/sandbox/sandbox-files.js';
import { installCodeHighlighting } from '../../ui/code/code-highlighting.js';
import { installScrollbarArrows } from '../../ui/scroll/scrollbar-arrows.js';
import { SERVICES, getService } from '../services.js';
import { createAppShellEnhancements } from './app-shell-enhancements.js';
import { setupConversationSearchModal } from './conversation-search-modal.js';
import { bindMessageListActions } from './message-list-actions.js';
import { bindComposerInput } from './composer-input-bindings.js';
import { bindFeedbackForms } from './feedback-forms.js';
import { modelGeneratesImages } from '../shell/model-registry.js';

export function createAppBootstrapLifecycle({
    window,
    document,
    elements,
    loadSharingVendor,
    loadArchiveVendor,
    BlobCtor,
    getCurrentUser,
    getConfig,
    getConversations,
    getFolders,
    getAstras,
    getPersonalMemories,
    getMemoryState = () => ({ profileEntries: [] }),
    replaceMemoryState = () => {},
    setSidebarOpen,
    setSendConfirmed,
    getAbortController,
    startNewChat,
    renderAll,
    setupVoiceInput,
    setupScrollToBottomButton,
    updateDisplayedVersion,
    checkAndShowLatestUpdate,
    updateFunctionButtonsState,
    updateInputState,
    setupSettingsModal,
    toggleSidebar,
    toggleModal,
    saveSettings,
    saveAppData,
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
    startMessageEditing = () => {},
    showNotification,
    showCustomConfirm = async () => false,
    normalizeConversationModel,
    getCouncilSelectedModels,
    isCouncilEnabled,
    hasCouncilWebSearchAccess,
    hasSingleWebSearchAccess,
    renderInputIndicators,
    toggleLearningMode,
    toggleSelectionMode,
    handleBatchDelete,
    handleBatchArchive,
    handleBatchMove,
    adjustTextareaHeight,
    submitChatForm,
    closeAllPopovers,
    showCustomPrompt,
    createNewFolder,
    createAstras,
    handleSaveAstras,
    renderPersonalMemoryList,
    handleDeleteAllData,
    applyLanguage,
    applyUiTheme,
    openStore,
    closeStore,
    handleAvatarUpload,
    handleConfirmAvatarCrop,
    cancelAvatarCrop,
    toggleTrashSelectionMode,
    handleBatchRestoreFromTrash,
    handleBatchDeleteFromTrash,
    handleEmptyTrash,
    updateFileInputUI,
    postJsonWithReadableError,
    setupHistorySidebarInteractions,
    setupHistorySidebarTriggers,
    requestMemorySummaryBootstrap = () => Promise.resolve({ skipped: true }),
    escapeHTML,
    getDefaultFolder,
    isMobileSettingsViewport,
    openSettingsMobileSection,
    i18n,
    randomUUID,
    random,
    scheduleTimeout,
    clearScheduledTimeout,
    scheduleAnimationFrame,
    logger = console
} = {}) {
    const ALL_ELEMENTS = elements;
    const resolveEventsUpdateInputState = updateInputState;
    const resolveEventsSetupSettingsModal = setupSettingsModal;
    const { enhanceLocalizedFileInput, ensureSettingsDesktopLogoutButton, enhanceSettingsLogoutButton } = createAppShellEnhancements({ document, elements: ALL_ELEMENTS, i18n, getConfig });

    async function initChatApp() {
        const config = getConfig();
        const currentUser = getCurrentUser();
        if (window.innerWidth >= 1024) {
            setSidebarOpen(false);
            ALL_ELEMENTS.sidebar.classList.remove('open');
            ALL_ELEMENTS.appContainer.classList.remove('sidebar-open');
        }
        const currentUserLabel = currentUser.displayName || currentUser.email || currentUser.username;
        ALL_ELEMENTS.usernameDisplay.textContent = currentUserLabel;
        document.querySelector('.user-avatar').textContent = currentUserLabel.charAt(0).toUpperCase();
        enhanceSettingsLogoutButton();
        const settingsDesktopLogoutBtn = ensureSettingsDesktopLogoutButton();
        setupConversationSearchModal({
            window, document, elements: ALL_ELEMENTS, i18n, config, toggleModal, performSearchAndRenderResults,
            scheduleAnimationFrame, scheduleTimeout, clearScheduledTimeout
        });
        await startNewChat();
        void requestMemorySummaryBootstrap().catch((error) => {
            logger.warn('Memory summary bootstrap could not start.', error);
        });
        updateFunctionButtonsState();
        resolveEventsUpdateInputState();
        setupVoiceInput();
        setupScrollToBottomButton();
        updateDisplayedVersion();
        checkAndShowLatestUpdate();
        ALL_ELEMENTS.menuToggleBtn.addEventListener('click', () => toggleSidebar());
        ALL_ELEMENTS.sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
        ALL_ELEMENTS.sidebarOverlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
        ALL_ELEMENTS.newChatBtn.addEventListener('click', () => startNewChat());
        ALL_ELEMENTS.newChatBtnHeader.addEventListener('click', () => startNewChat()); // ✨ 新增這一行
        ALL_ELEMENTS.apiKeyWarningBadge.addEventListener('click', () => openWhenBuilt({ setup: resolveEventsSetupSettingsModal, show: () => {
            toggleModal(ALL_ELEMENTS.settingsModal, true);
            if (isMobileSettingsViewport()) {
                openSettingsMobileSection('model-management');
                return;
            }
            const navItems = ALL_ELEMENTS.settingsNav.querySelectorAll('.settings-nav-item');
            navItems.forEach(i => i.classList.remove('active'));
            document.querySelector('.settings-nav-item[data-section="model-management"]').classList.add('active');
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            document.getElementById('model-management-section').classList.add('active');
        } }));
        const closeTrashView = () => toggleModal(ALL_ELEMENTS.trashViewModal, false);
        ALL_ELEMENTS.closeTrashViewModalBtn.addEventListener('click', closeTrashView);
        ALL_ELEMENTS.trashViewCloseBtn.addEventListener('click', closeTrashView);
        ALL_ELEMENTS.settingsBtn.addEventListener('click', () => openWhenBuilt({ setup: resolveEventsSetupSettingsModal, show: () => toggleModal(ALL_ELEMENTS.settingsModal, true) }));
        prepareWhenIdle({ setup: resolveEventsSetupSettingsModal });
        ALL_ELEMENTS.saveSettingsBtn?.remove();
        const scheduleInstantSettingsSave = (() => {
            let saveTimer = null;
            return () => {
                clearScheduledTimeout(saveTimer);
                saveTimer = scheduleTimeout(() => saveSettings({ close: false, notify: false }), 350);
            };
        })();
        ALL_ELEMENTS.settingsModal.addEventListener('change', (event) => {
            if (event.target.closest('#settings-modal')) {
                saveSettings({ close: false, notify: false });
            }
        });
        ALL_ELEMENTS.settingsModal.addEventListener('input', (event) => {
            if (event.target.matches('input, textarea')) {
                scheduleInstantSettingsSave();
            }
        });
        ALL_ELEMENTS.settingsModal.addEventListener('click', (event) => {
            if (event.target.closest('.color-swatch, .color-option, .translator-picker-option')) {
                scheduleTimeout(() => saveSettings({ close: false, notify: false }), 0);
            }
        });
        ALL_ELEMENTS.closeSettingsBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.settingsModal, false));
        ALL_ELEMENTS.settingsModal.addEventListener('click', (event) => {
            if (event.target === ALL_ELEMENTS.settingsModal) {
                toggleModal(ALL_ELEMENTS.settingsModal, false);
            }
        });
        ALL_ELEMENTS.openArchivedModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.archivedChatsModal, true));
        ALL_ELEMENTS.closeArchivedModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.archivedChatsModal, false));
        const closeViewArchivedModal = () => toggleModal(ALL_ELEMENTS.viewArchivedChatModal, false);
        ALL_ELEMENTS.closeViewArchivedModalBtn.addEventListener('click', closeViewArchivedModal);
        ALL_ELEMENTS.closeViewArchivedModalBtnFooter.addEventListener('click', closeViewArchivedModal);
        ALL_ELEMENTS.saveRenameBtn.addEventListener('click', handleRename);
        ALL_ELEMENTS.cancelRenameBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.renameModal, false));
        ALL_ELEMENTS.saveFolderSettingsBtn.addEventListener('click', handleSaveFolderSettings);
        ALL_ELEMENTS.cancelFolderSettingsBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.folderSettingsModal, false));
        ALL_ELEMENTS.exportDataBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.exportDataModal, true));
        ALL_ELEMENTS.cancelExportBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.exportDataModal, false));
        ALL_ELEMENTS.confirmExportBtn.addEventListener('click', handleExport);
        enhanceLocalizedFileInput(ALL_ELEMENTS.importFileInput);
        enhanceLocalizedFileInput(ALL_ELEMENTS.importFileInputAuth);
        ALL_ELEMENTS.importDataBtn.addEventListener('click', () => {
            ALL_ELEMENTS.importFileInput.value='';
            ALL_ELEMENTS.importFileInput.dispatchEvent(new window.Event('change'));
            toggleModal(ALL_ELEMENTS.importDataModal, true);
        });
        ALL_ELEMENTS.cancelImportBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.importDataModal, false));
        ALL_ELEMENTS.confirmImportBtn.addEventListener('click', handleImport);
        ALL_ELEMENTS.logoutBtn.addEventListener('click', handleLogout);
        settingsDesktopLogoutBtn?.addEventListener('click', handleLogout);
        ALL_ELEMENTS.userProfileBtn.addEventListener('click', openDashboard);
        ALL_ELEMENTS.closeDashboardBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.dataDashboardModal, false));
        // Delegated on the document so file cards inside council details
        // and the file preview dialog behave like cards in the message list.
        installFileCardInteractions({
            root: document,
            window,
            getUiLanguage: () => getConfig().uiLanguage,
            notify: (message, type) => showNotification(message, type),
            copyText: (text) => copyTextToClipboard(text),
            logError: (...args) => logger.error?.(...args)
        });
        // "Run again" on a file made in Advanced mode reads the open
        // conversation's files and saves what it makes.
        setSandboxFileHooks({
            inputs: () => collectSandboxInputs(getActiveConversation()),
            save: saveAppData
        });
        // Code blocks in messages and file previews get VS Code colours.
        installCodeHighlighting({ document, window });
        bindMessageListActions({ window, document, elements: ALL_ELEMENTS, i18n, config, getConfig, getActiveConversation, copyTextToClipboard, showNotification, startMessageEditing, logger });
        ALL_ELEMENTS.cameraBtn.addEventListener('click', () => {
            ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
            ALL_ELEMENTS.imageVideoInput.value = '';
            ALL_ELEMENTS.imageVideoInput.setAttribute('capture','environment');
            ALL_ELEMENTS.imageVideoInput.click();
        });
        ALL_ELEMENTS.webSearchPopoverBtn.addEventListener('click', async () => {
            ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
            const conv = getActiveConversation();
            const modelInfo = normalizeConversationModel(conv);
            const { synthesizer } = getCouncilSelectedModels(conv);
            const supportsWebSearch = isCouncilEnabled(conv)
            ? hasCouncilWebSearchAccess(synthesizer || modelInfo)
            : hasSingleWebSearchAccess(modelInfo);
            if (!conv || !supportsWebSearch || conv.archived) {
                showNotification(i18n[config.uiLanguage].webSearchNotAvailable || '當前模型不支援或無法使用聯網搜尋。', 'warning');
                return;
            }
            conv.isWebSearchEnabled = !conv.isWebSearchEnabled;
            renderInputIndicators();
            await saveAppData();
        });
        ALL_ELEMENTS.learningModeBtn.addEventListener('click', toggleLearningMode);
        ALL_ELEMENTS.uploadImageBtn.addEventListener('click', () => {
            ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
            ALL_ELEMENTS.imageVideoInput.value = '';
            ALL_ELEMENTS.imageVideoInput.removeAttribute('capture');
            ALL_ELEMENTS.imageVideoInput.click();
        });
        ALL_ELEMENTS.uploadFileBtn.addEventListener('click', () => {
            ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
            ALL_ELEMENTS.fileUploadInput.value = '';
            ALL_ELEMENTS.fileUploadInput.click();
        });
        ALL_ELEMENTS.imageVideoInput.addEventListener('change', handleFileSelection);
        ALL_ELEMENTS.fileUploadInput.addEventListener('change', handleFileSelection);
        ALL_ELEMENTS.selectionModeBtn.addEventListener('click', toggleSelectionMode);
        ALL_ELEMENTS.cancelSelectionBtn.addEventListener('click', toggleSelectionMode);
        ALL_ELEMENTS.batchDeleteBtn.addEventListener('click', handleBatchDelete);
        ALL_ELEMENTS.batchArchiveBtn.addEventListener('click', handleBatchArchive);
        ALL_ELEMENTS.batchMoveBtn.addEventListener('click', handleBatchMove);
        ALL_ELEMENTS.batchMoveCancelBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.batchMoveModal, false));
        ALL_ELEMENTS.batchMoveConfirmBtn.addEventListener('click', () => { /* Logic moved to option clicks */ });
        bindComposerInput({
            window, document, elements: ALL_ELEMENTS, setSendConfirmed, updateInputState: resolveEventsUpdateInputState, adjustTextareaHeight,
            submitChatForm, getActiveConversation, getAbortController, scheduleAnimationFrame, scheduleTimeout,
            getConfig, renderInputIndicators,
            // A reply that a message may be put into: a council or a picture is not one (features/reply-steering.js).
            isSteerable: () => { const conv = getActiveConversation(); return !conv || (!isCouncilEnabled(conv) && !modelGeneratesImages(normalizeConversationModel(conv))); }
        });
        ALL_ELEMENTS.chatForm.addEventListener('submit', handleFormSubmit);
        installScrollbarArrows(document);
        document.addEventListener('click', (e) => {
            let clickedInsidePopover = false;
            document.querySelectorAll('.popover.visible').forEach(popover => {
                if (popover.contains(e.target)) clickedInsidePopover = true;
            });
            const clickedOnPopoverTrigger =
            ALL_ELEMENTS.modelSwitcherContainer.contains(e.target) ||
            ALL_ELEMENTS.fileInputContainer.contains(e.target) ||
            document.getElementById('model-council-control')?.contains(e.target) ||
            e.target.closest('.chat-options-btn') ||
            e.target.closest('.astras-options-btn') ||
            e.target.closest('.folder-options-btn');
            if (!clickedInsidePopover && !clickedOnPopoverTrigger) {
                closeAllPopovers();
            }
            const colorMenus = document.querySelectorAll('.color-dropdown-menu.show');
            colorMenus.forEach(menu => {
                if (!menu.parentElement.contains(e.target)) {
                    menu.classList.remove('show');
                }
            });
        });
        ALL_ELEMENTS.newFolderBtn.addEventListener('click', async () => {
            const name = await showCustomPrompt(i18n[config.uiLanguage].enterFolderName, i18n[config.uiLanguage].createFolder);
            if (name) {
                createNewFolder(name);
                showNotification(i18n[config.uiLanguage].folderCreated);
            }
        });
        ALL_ELEMENTS.newAstrasBtn.addEventListener('click', createAstras);
        ALL_ELEMENTS.saveAstrasBtn.addEventListener('click', handleSaveAstras);
        ALL_ELEMENTS.cancelAstrasBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.astrasCreateModal, false));
        ALL_ELEMENTS.addPersonalMemoryBtn.addEventListener('click', async () => {
            const content = await showCustomPrompt(i18n[config.uiLanguage].enterNewMemory, i18n[config.uiLanguage].addMemory);
            if (content) {
                replaceMemoryState(addConfirmedProfileEntry(getMemoryState(), {
                    id: randomUUID(),
                    content
                }));
                await saveAppData();
                renderPersonalMemoryList();
                showNotification(i18n[config.uiLanguage].memoryAdded);
            }
        });
        ALL_ELEMENTS.deleteAllDataBtn.addEventListener('click', handleDeleteAllData);
        ALL_ELEMENTS.uiLanguageSelect.addEventListener('change', (e) => {
            config.uiLanguage = e.target.value;
            applyLanguage(config.uiLanguage);
            renderInputIndicators();
        });
        ALL_ELEMENTS.colorSchemeSelect?.addEventListener('change', (e) => {
            config.colorScheme = e.target.value;
            applyUiTheme();
        });
        const storeNavigationLifecycle = createStoreNavigationLifecycle({
            getOpenStoreButton: () => ALL_ELEMENTS.openStoreBtn,
            getBackToChatButton: () => ALL_ELEMENTS.backToChatBtn,
            openStore,
            closeStore
        });
        storeNavigationLifecycle.bind();
        ALL_ELEMENTS.astrasAvatarInput.addEventListener('change', handleAvatarUpload);
        ALL_ELEMENTS.confirmAvatarCropBtn.addEventListener('click', handleConfirmAvatarCrop);
        ALL_ELEMENTS.cancelAvatarCropBtn.addEventListener('click', cancelAvatarCrop);
        ALL_ELEMENTS.closeLatestUpdateModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.latestUpdateModal, false));
        ALL_ELEMENTS.closeLatestUpdateXBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.latestUpdateModal, false));
        // The link opens the update notes page (/updates) in a new tab; the window of the new version closes as it is followed.
        ALL_ELEMENTS.latestUpdateHistoryBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.latestUpdateModal, false));
        ALL_ELEMENTS.trashBatchSelectBtn.addEventListener('click', toggleTrashSelectionMode);
        ALL_ELEMENTS.trashCancelSelectionBtn.addEventListener('click', toggleTrashSelectionMode);
        ALL_ELEMENTS.trashBatchRestoreBtn.addEventListener('click', handleBatchRestoreFromTrash);
        ALL_ELEMENTS.trashBatchDeleteBtn.addEventListener('click', handleBatchDeleteFromTrash);
        ALL_ELEMENTS.emptyTrashBtn.addEventListener('click', handleEmptyTrash);
        updateFileInputUI();
        bindFeedbackForms({ window, document, elements: ALL_ELEMENTS, i18n, getConfig, toggleModal, showNotification, postJsonWithReadableError, logger });
        const initializeSpotlightEffect = () => {
            const spotlightElements = document.querySelectorAll('.spotlight-effect');
            spotlightElements.forEach(el => {
                const handleMove = (e) => {
                    const rect = el.getBoundingClientRect();
                    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
                    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
                    el.style.setProperty('--spotlight-x', `${x}px`);
                    el.style.setProperty('--spotlight-y', `${y}px`);
                };
                el.addEventListener('mousemove', handleMove);
                el.addEventListener('touchmove', handleMove, { passive: true });
            });
        };
        initializeSpotlightEffect();
        document.querySelectorAll('.sidebar-section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // 如果點擊的是按鈕，則不觸發折疊
                if (e.target.closest('button')) {
                    return;
                }
                const section = header.closest('.sidebar-section');
                if (section) {
                    const isOpen = section.dataset.open === 'true';
                    section.dataset.open = !isOpen;
                }
            });
        });

        ALL_ELEMENTS.addFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateFunctionButtonsState();
            const popover = ALL_ELEMENTS.fileOptionsPopover;
            if (popover.classList.contains('visible')) {
                popover.classList.remove('visible');
                ALL_ELEMENTS.addFileBtn.setAttribute('aria-expanded', 'false');
            } else {
                closeAllPopovers();
                popover.classList.add('visible');
                fitPopoverToViewport(popover, window);
                ALL_ELEMENTS.addFileBtn.setAttribute('aria-expanded', 'true');
            }
        });
        // ==========================================
        // ✨ P2P 分享功能 (PeerJS Implementation)
        // ==========================================

        const p2pLifecycle = createP2PLifecycle({
            document,
            getElementById: (id) => document.getElementById(id),
            loadSharingVendor,
            loadArchiveVendor,
            BlobCtor,
            getAstras,
            getFolders,
            getConversations,
            getDefaultFolder,
            saveAppData,
            renderAll,
            showNotification,
            toggleModal,
            escapeHTML,
            getText: (key, fallback) => i18n[getConfig().uiLanguage]?.[key] || fallback,
            randomUUID,
            random,
            scheduleTimeout: setTimeout,
            logger
        });
        const {
            initP2P,
            resetP2PUI,
            setP2PMode,
            showP2PSelection,
            startP2PReceiverUI,
            startP2PSender,
            connectToSender,
            startQRScanner
        } = p2pLifecycle;
        const appBootstrapComposition = createAppBootstrapComposition({
            allElements: ALL_ELEMENTS,
            getElementById: (id) => document.getElementById(id),
            setupHistorySidebarInteractions,
            setupHistorySidebarTriggers,
            initP2P,
            toggleP2PModal: (open) => toggleModal(document.getElementById('p2p-share-modal'), open),
            resetP2PUI,
            setP2PMode,
            showP2PSelection,
            startP2PReceiverUI,
            startP2PSender,
            getP2PCodeInputValue: () => document.getElementById('p2p-code-input').value,
            showNotification,
            getText: (key, fallback) => i18n[getConfig().uiLanguage]?.[key] || fallback,
            connectToSender,
            startQRScanner: () => startQRScanner()
        });
        appBootstrapComposition.runLateBootstrapBindings();
        getService(SERVICES.cloudRuntimeReady)?.();
    }

    return {
        initChatApp
    };
}
