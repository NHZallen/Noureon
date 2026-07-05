import { createAppBootstrapComposition } from '../../legacy-runtime/features/app-bootstrap-composition.js';
import { createStoreNavigationLifecycle } from '../../legacy-runtime/features/store-navigation-lifecycle.js';
import { createLegacyP2PLifecycle } from './p2p-lifecycle.js';
import { createTurnstileClient } from '../security/turnstile-client.js';

export function createLegacyAppBootstrapLifecycle({
    window,
    document,
    elements,
    Peer,
    QRCode,
    Html5Qrcode,
    JSZip,
    BlobCtor,
    getCurrentUser,
    getConfig,
    getConversations,
    getFolders,
    getAstras,
    getPersonalMemories,
    setSidebarOpen,
    setSendConfirmed,
    getAbortController,
    getCropperInstance,
    setCropperInstance,
    setEditingAstraForAvatarId,
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
    showNotification,
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
    handleWallpaperUpload,
    restoreDefaultWallpaper,
    handleConfirmCrop,
    handleDeleteAllData,
    applyLanguage,
    openStore,
    closeStore,
    handleAvatarUpload,
    handleConfirmAvatarCrop,
    showUpdateHistory,
    toggleTrashSelectionMode,
    handleBatchRestoreFromTrash,
    handleBatchDeleteFromTrash,
    handleEmptyTrash,
    updateFileInputUI,
    postJsonWithReadableError,
    setupHistorySidebarInteractions,
    setupHistorySidebarTriggers,
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
    const ensureSettingsDesktopLogoutButton = () => {
        const nav = ALL_ELEMENTS.settingsNav;
        if (!nav) return null;
        const existing = document.getElementById('settings-desktop-logout-btn');
        if (existing) return existing;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'settings-desktop-logout-btn';
        button.className = 'settings-nav-item settings-desktop-logout-btn w-full p-3 rounded-md text-left text-red-600';
        button.textContent = i18n[getConfig().uiLanguage]?.logout || '登出';
        nav.closest('nav')?.appendChild(button);
        return button;
    };
    const enhanceSettingsLogoutButton = () => {
        const button = ALL_ELEMENTS.logoutBtn;
        if (!button || button.querySelector('.settings-logout-label')) return;
        button.classList.add('flex', 'items-center', 'gap-2', 'px-3');
        button.title = i18n[getConfig().uiLanguage]?.logout || '登出';
        const label = document.createElement('span');
        label.className = 'settings-logout-label text-sm font-medium';
        label.textContent = i18n[getConfig().uiLanguage]?.logout || '登出';
        button.appendChild(label);
    };

    async function initChatApp() {
                const turnstile = createTurnstileClient({ window, document });
                const getTurnstileRequiredMessage = () => i18n[getConfig().uiLanguage]?.turnstileRequired || '請完成安全驗證後再送出。';
                const mountTurnstile = (name, anchorElement) => {
                    if (!turnstile.enabled) return;
                    turnstile.mount(name, anchorElement).catch((error) => {
                        logger.error('Cloudflare Turnstile failed to initialize:', error);
                        showNotification(i18n[getConfig().uiLanguage]?.turnstileLoadError || '安全驗證載入失敗，請重新整理後再試。', 'error');
                    });
                };
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
                await startNewChat();
                renderAll();
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
                ALL_ELEMENTS.openSearchBtn.addEventListener('click', () => {
                    toggleModal(ALL_ELEMENTS.searchModal, true);
                    ALL_ELEMENTS.openSearchBtn.classList.add('active'); // <-- ✨ 加上這一行
                    ALL_ELEMENTS.modalSearchInput.value = '';
                    ALL_ELEMENTS.searchResultsContainer.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${i18n[config.uiLanguage].searchPrompt}</p>`;
                    scheduleTimeout(() => ALL_ELEMENTS.modalSearchInput.focus(), 50);
                });
                ALL_ELEMENTS.apiKeyWarningBadge.addEventListener('click', () => {
                    resolveEventsSetupSettingsModal();
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
                });
                ALL_ELEMENTS.closeSearchModalBtn.addEventListener('click', () => {
                    toggleModal(ALL_ELEMENTS.searchModal, false);
                    ALL_ELEMENTS.openSearchBtn.classList.remove('active'); // <-- ✨ 加上這一行
                });
                ALL_ELEMENTS.performSearchBtn.addEventListener('click', performSearchAndRenderResults);
                ALL_ELEMENTS.modalSearchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        performSearchAndRenderResults();
                    }
                });
                ALL_ELEMENTS.modalSearchScopeSelect.addEventListener('change', performSearchAndRenderResults);
                const closeSearchView = () => toggleModal(ALL_ELEMENTS.searchViewModal, false);
                ALL_ELEMENTS.closeSearchViewModalBtn.addEventListener('click', closeSearchView);
                ALL_ELEMENTS.searchViewCloseBtn.addEventListener('click', closeSearchView);
                ALL_ELEMENTS.searchViewConfirmBtn.addEventListener('click', (e) => {
                    const convId = e.currentTarget.dataset.id;
                    if (convId) {
                        loadChat(convId);
                        toggleSidebar(false);
                        closeSearchView();
                        toggleModal(ALL_ELEMENTS.searchModal, false);
                    }
                });
                const closeTrashView = () => toggleModal(ALL_ELEMENTS.trashViewModal, false);
                ALL_ELEMENTS.closeTrashViewModalBtn.addEventListener('click', closeTrashView);
                ALL_ELEMENTS.trashViewCloseBtn.addEventListener('click', closeTrashView);
                ALL_ELEMENTS.settingsBtn.addEventListener('click', () => { resolveEventsSetupSettingsModal(); toggleModal(ALL_ELEMENTS.settingsModal, true); });
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
                ALL_ELEMENTS.importDataBtn.addEventListener('click', () => { ALL_ELEMENTS.importFileInput.value=''; toggleModal(ALL_ELEMENTS.importDataModal, true); });
                ALL_ELEMENTS.cancelImportBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.importDataModal, false));
                ALL_ELEMENTS.confirmImportBtn.addEventListener('click', handleImport);
                ALL_ELEMENTS.logoutBtn.addEventListener('click', handleLogout);
                settingsDesktopLogoutBtn?.addEventListener('click', handleLogout);
                ALL_ELEMENTS.userProfileBtn.addEventListener('click', openDashboard);
                ALL_ELEMENTS.closeDashboardBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.dataDashboardModal, false));
                ALL_ELEMENTS.messageList.addEventListener('click', (e) => {
                    const copyBtn = e.target.closest('.copy-content-btn');
                    if (copyBtn) {
                        const messageItem = copyBtn.closest('.message-item');
                        if (messageItem) {
                            const messageIndex = parseInt(messageItem.dataset.messageIndex);
                            const conv = getActiveConversation();
                            const msg = conv?.messages[messageIndex];
                            if (msg && msg.role === 'model') {
                                const textToCopy = msg.parts.map(p => p.text).join('\n');
                                copyTextToClipboard(textToCopy)
                                    .then(() => showNotification(i18n[config.uiLanguage].copySuccess || '內容已複製！', 'success'))
                                    .catch(err => {
                                        showNotification(i18n[config.uiLanguage].copyFailed || '複製失敗！瀏覽器可能限制了此功能。', 'error');
                                        logger.error('Could not copy text with any method: ', err);
                                    });
                            }
                        }
                    }
                });
    
    
                ALL_ELEMENTS.cameraBtn.addEventListener('click', () => {
                    ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
                    ALL_ELEMENTS.imageVideoInput.setAttribute('capture','environment');
                    ALL_ELEMENTS.imageVideoInput.click();
                });
                ALL_ELEMENTS.webSearchPopoverBtn.addEventListener('click', async () => {
                    ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
                    const conv = getActiveConversation();
                    const modelInfo = normalizeConversationModel(conv);
                    const imageMode = modelInfo?.outputModality === 'image';
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
                    ALL_ELEMENTS.imageVideoInput.removeAttribute('capture');
                    ALL_ELEMENTS.imageVideoInput.click();
                });
                ALL_ELEMENTS.uploadFileBtn.addEventListener('click', () => {
                    ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
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
                ALL_ELEMENTS.messageInput.addEventListener('input', (e) => {
                    setSendConfirmed(false);
                    resolveEventsUpdateInputState();
                    const wrapper = e.target.closest('.input-wrapper');
                    if (wrapper) {
                        wrapper.classList.remove('pulse-glow');
                        void wrapper.offsetWidth;
                        wrapper.classList.add('pulse-glow');
                    }
                });
                ALL_ELEMENTS.messageInput.addEventListener('input', adjustTextareaHeight);
                const expandBtn = document.getElementById('expand-input-btn');
                if (expandBtn) {
                    expandBtn.addEventListener('click', () => {
                        ALL_ELEMENTS.messageInput.classList.toggle('expanded');
                        expandBtn.classList.toggle('rotated');
                        adjustTextareaHeight(); // 點擊後重新計算一次高度
                    });
                }
                ALL_ELEMENTS.messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                        e.preventDefault();
                        if (!ALL_ELEMENTS.submitButton.disabled) {
                            submitChatForm();
                        }
                    }
                });
                const handleInputFocus = () => {
                    if (window.visualViewport) {
                        const smoothScrollToTarget = () => {
                            const inputBarContainer = document.getElementById('input-bar-container');
                            if (!inputBarContainer) return;
    
    
                            scheduleAnimationFrame(() => {
                                const PADDING_BOTTOM = 10;
                                const inputBarRect = inputBarContainer.getBoundingClientRect();
                                const viewportHeight = window.visualViewport.height;
                                const offset = inputBarRect.bottom - viewportHeight + PADDING_BOTTOM;
    
    
                                if (offset > 0) {
                                    const newScrollPosition = window.scrollY + offset;
                                    window.scrollTo({
                                        top: newScrollPosition,
                                        behavior: 'smooth'
                                    });
                                }
                            });
                        };
    
    
                        window.visualViewport.addEventListener('resize', smoothScrollToTarget, { once: true });
                    } else {
                        scheduleTimeout(() => {
                            const inputBarContainer = document.getElementById('input-bar-container');
                            if (inputBarContainer) {
                                inputBarContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
                            }
                        }, 300);
                    }
                };
    
    
                ALL_ELEMENTS.messageInput.addEventListener('focus', handleInputFocus);
    
    
                ALL_ELEMENTS.messageInput.addEventListener('input', () => {
                    const conv = getActiveConversation();
                    if (conv) {
                        conv.unsentMessage = ALL_ELEMENTS.messageInput.value;
                    }
                });
                ALL_ELEMENTS.submitButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (getAbortController()) {
            try { getAbortController().abort(); } catch {}
        } else if (!ALL_ELEMENTS.submitButton.disabled) {
            submitChatForm();
        }
    });
                ALL_ELEMENTS.chatForm.addEventListener('submit', handleFormSubmit);
                document.addEventListener('click', (e) => {
                    const targets = [
                        ALL_ELEMENTS.modelSwitcherContainer,
                        ALL_ELEMENTS.fileInputContainer,
                        document.getElementById('model-council-control')
                    ];
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
                        getPersonalMemories().push({ id: randomUUID(), content, enabled: true });
                        await saveAppData();
                        renderPersonalMemoryList();
                        showNotification(i18n[config.uiLanguage].memoryAdded);
                    }
                });
                ALL_ELEMENTS.uploadWallpaperBtn.addEventListener('click', () => ALL_ELEMENTS.wallpaperUploadInput.click());
                ALL_ELEMENTS.wallpaperUploadInput.addEventListener('change', handleWallpaperUpload);
                ALL_ELEMENTS.restoreWallpaperBtn.addEventListener('click', restoreDefaultWallpaper);
                ALL_ELEMENTS.confirmCropBtn.addEventListener('click', handleConfirmCrop);
                ALL_ELEMENTS.cancelCropBtn.addEventListener('click', () => {
                    toggleModal(ALL_ELEMENTS.wallpaperCropModal, false);
                    const cropper = getCropperInstance();
                    if (cropper) {
                        cropper.destroy();
                        setCropperInstance(null);
                    }
                });
                ALL_ELEMENTS.deleteAllDataBtn.addEventListener('click', handleDeleteAllData);
                ALL_ELEMENTS.uiLanguageSelect.addEventListener('change', (e) => {
                    config.uiLanguage = e.target.value;
                    applyLanguage(config.uiLanguage);
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
                ALL_ELEMENTS.cancelAvatarCropBtn.addEventListener('click', () => {
                     toggleModal(ALL_ELEMENTS.astrasAvatarModal, false);
                    const cropper = getCropperInstance();
                    if (cropper) {
                        cropper.destroy();
                        setCropperInstance(null);
                    }
                    setEditingAstraForAvatarId(null);
                });
                ALL_ELEMENTS.updateInfoBtn.addEventListener('click', showUpdateHistory);
                ALL_ELEMENTS.closeUpdateInfoModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.updateInfoModal, false));
                ALL_ELEMENTS.closeLatestUpdateModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.latestUpdateModal, false));
                ALL_ELEMENTS.trashBatchSelectBtn.addEventListener('click', toggleTrashSelectionMode);
                ALL_ELEMENTS.trashCancelSelectionBtn.addEventListener('click', toggleTrashSelectionMode);
                ALL_ELEMENTS.trashBatchRestoreBtn.addEventListener('click', handleBatchRestoreFromTrash);
                ALL_ELEMENTS.trashBatchDeleteBtn.addEventListener('click', handleBatchDeleteFromTrash);
                ALL_ELEMENTS.emptyTrashBtn.addEventListener('click', handleEmptyTrash);
                updateFileInputUI();
                mountTurnstile('feedback', ALL_ELEMENTS.sendFeedbackBtn);
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
                ALL_ELEMENTS.sendFeedbackBtn.addEventListener('click', async () => {
        const feedbackContent = ALL_ELEMENTS.feedbackTextarea.value.trim();
        const sendButton = ALL_ELEMENTS.sendFeedbackBtn;
        const turnstileToken = turnstile.getToken('feedback');
        
        if (!feedbackContent) {
            showNotification('請先輸入您的意見！', 'warning');
            return;
        }
        if (turnstile.enabled && !turnstileToken) {
            showNotification(getTurnstileRequiredMessage(), 'warning');
            return;
        }
        
        // Send through the optional same-origin form proxy.
        const FORM_ENDPOINT = '/api/google-form-submit';
    
    
        const originalButtonText = sendButton.textContent;
        sendButton.disabled = true;
        sendButton.textContent = '發送中...';
    
    
        try {
            // ✨ 準備要發送的資料，並加入 formType 讓後台知道這是意見反饋
            const dataToSend = {
                formType: 'feedback', // <-- 關鍵識別碼！
                subject: '來自 Astra 的新意見反饋',
                timestamp: new Date().toISOString(),
                message: feedbackContent,
                ...(turnstileToken ? { turnstileToken } : {})
            };
    
    
            await postJsonWithReadableError(FORM_ENDPOINT, dataToSend, { allowOpaqueFallback: false });
    
    
            showNotification('反饋已成功發送，感謝您！', 'success');
            ALL_ELEMENTS.feedbackTextarea.value = '';
    
    
        } catch (error) {
            logger.error('發送反饋時出錯:', error);
            const message = String(error?.message || '');
            showNotification(
                message.includes('Google form endpoint is not configured')
                    ? '意見反饋端點尚未設定，請在伺服器設定 GOOGLE_FORM_ENDPOINT。'
                    : '發送失敗，請檢查您的網路連線。',
                'error'
            );
        } finally {
            turnstile.reset('feedback');
            sendButton.disabled = false;
            sendButton.textContent = originalButtonText;
        }
    });
                ALL_ELEMENTS.proposeAstrasBtn.addEventListener('click', () => {
                    ALL_ELEMENTS.proposalNameInput.value = '';
                    ALL_ELEMENTS.proposalDescInput.value = '';
                    ALL_ELEMENTS.proposalInstructionsInput.value = '';
                    toggleModal(ALL_ELEMENTS.astrasProposalModal, true);
                    mountTurnstile('astra-proposal', ALL_ELEMENTS.submitProposalBtn);
                });
    
    
    
    
                ALL_ELEMENTS.cancelProposalBtn.addEventListener('click', () => {
                    toggleModal(ALL_ELEMENTS.astrasProposalModal, false);
                });
    
    
    
    
                ALL_ELEMENTS.submitProposalBtn.addEventListener('click', async () => {
        const name = ALL_ELEMENTS.proposalNameInput.value.trim();
        const description = ALL_ELEMENTS.proposalDescInput.value.trim();
        const instructions = ALL_ELEMENTS.proposalInstructionsInput.value.trim();
        const submitButton = ALL_ELEMENTS.submitProposalBtn;
        const turnstileToken = turnstile.getToken('astra-proposal');
    
    
        if (!name || !instructions) {
            showNotification('提案的「名稱」和「指令」是必填的喔！', 'warning');
            return;
        }
        if (turnstile.enabled && !turnstileToken) {
            showNotification(getTurnstileRequiredMessage(), 'warning');
            return;
        }
        
        // Send through the optional same-origin form proxy.
        const FORM_ENDPOINT = '/api/google-form-submit';
    
    
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
    
    
        try {
            // ✨ 準備要發送的資料，並加入 formType 讓後台知道這是 Astra 提案
            const dataToSend = {
                formType: 'astra_proposal', // <-- 關鍵識別碼！
                subject: `新的 Astra 提案: ${name}`,
                timestamp: new Date().toISOString(),
                proposal_name: name,
                proposal_desc: description,
                proposal_instructions: instructions,
                ...(turnstileToken ? { turnstileToken } : {})
            };
        
            await postJsonWithReadableError(FORM_ENDPOINT, dataToSend, { allowOpaqueFallback: false });
    
    
            toggleModal(ALL_ELEMENTS.astrasProposalModal, false);
            showNotification('感謝您的提案，已成功發送！', 'success');
            
        } catch (error) {
            logger.error('提交提案時出錯:', error);
            const message = String(error?.message || '');
            showNotification(
                message.includes('Google form endpoint is not configured')
                    ? 'Astra 提案端點尚未設定，請在伺服器設定 GOOGLE_FORM_ENDPOINT。'
                    : '提交失敗，請檢查您的網路連線。',
                'error'
            );
        } finally {
            turnstile.reset('astra-proposal');
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    });
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
                    } else {
                        closeAllPopovers();
                        popover.classList.add('visible');
                    }
                });
                // ==========================================
        // ✨ P2P 分享功能 (PeerJS Implementation)
        // ==========================================
    
        const p2pLifecycle = createLegacyP2PLifecycle({
            document,
            getElementById: (id) => document.getElementById(id),
            Peer,
            QRCode,
            Html5Qrcode,
            JSZip,
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
            startQRScanner,
            processReceivedData,
            updateP2PProgress
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
        window.__astraCloudRuntimeReady?.();
            }

    return {
        initChatApp
    };
}
