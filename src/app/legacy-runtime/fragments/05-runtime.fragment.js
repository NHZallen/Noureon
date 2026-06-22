async function sendConversationToMail(userMessageObject, aiResponseText) {
    // 確認這裡是你從 Google Apps Script 複製的、以 /exec 結尾的正確網址
    const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzDz8mauVmRsJtSxpXbfMiMCnx0Mofqh0r3YV_riwRTwugf8EUgzsD_gCwfwSvmOqV4yg/exec';


    const conv = getActiveConversation();
    const conversationTitle = conv?.title || 'N/A';
    
    // ✨✨✨ 這是本次的核心修改 ✨✨✨
    // 1. 取得當前使用的模型資訊
    const modelInfo = MODELS.find(m => m.id === conv?.model);
    // 2. 取得模型的顯示名稱，如果找不到就用 ID，再找不到就顯示 "未知"
    const modelName = isCouncilEnabled(conv) ? getCouncilTexts().title : (modelInfo ? modelInfo.name : (conv?.model || '未知模型'));
    
    // 格式化使用者訊息
    const userContent = userMessageObject.parts.map(part => {
        if (part.text) {
            return part.text;
        } else if (part.inlineData) {
            return `[附加檔案: ${part.inlineData.mimeType}]`;
        }
        return '';
    }).join('\n');


    // 準備要寄送的資料物件
    const dataToSend = {
        // 這次我們不指定 formType，讓它走 Apps Script 的 default 分支
        subject: `Astra 對話紀錄: ${conversationTitle}`,
        timestamp: new Date().toISOString(),
        conversation: conversationTitle,
        model_used: modelName, // <-- 3. 把模型名稱加入要發送的資料中！
        user_message: userContent,
        ai_response: aiResponseText
    };


    // 使用 fetch API 以 POST 方式非同步發送資料
    try {
        await postJsonWithReadableError(FORM_ENDPOINT, dataToSend);


        console.log('對話紀錄已發送至 Google Apps Script。請檢查您的試算表和 Gmail。');


    } catch (error) {
        console.error('寄送對話紀錄到 Google Apps Script 時發生網路錯誤:', error);
    }
}
        const compressImage = (base64Data, mimeType, maxWidth = 1920, quality = 0.6) => {
    return new Promise((resolve) => {
        if (mimeType === 'image/gif') {
            resolve({
                data: base64Data,
                mimeType,
                ext: 'gif'
            });
            return;
        }

        const img = new Image();
        img.src = `data:${mimeType};base64,${base64Data}`;
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;


            // 如果圖片太寬，等比例縮小
            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }


            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);


            const outputMimeType = ['image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';
            const newDataUrl = canvas.toDataURL(outputMimeType, quality);
            const extMap = {
                'image/png': 'png',
                'image/webp': 'webp',
                'image/jpeg': 'jpg'
            };
            resolve({
                data: newDataUrl.split(',')[1], // 只回傳 Base64 部分
                mimeType: outputMimeType,
                ext: extMap[outputMimeType] || 'bin'
            });
        };


        img.onerror = () => {
            // 如果轉換失敗，就原樣退回
            resolve({
                data: base64Data,
                mimeType: mimeType,
                ext: mimeType.split('/')[1] || 'bin'
            });
        };
    });
};
        async function initChatApp() {
            if (window.innerWidth >= 1024) {
        sidebarOpen = true;
        ALL_ELEMENTS.appContainer.classList.add('sidebar-open');
    }
            setTheme(config.theme);
            ALL_ELEMENTS.usernameDisplay.textContent = currentUser.username;
            document.querySelector('.user-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
            if (!conversations.find(c => !c.archived && !c.deletedAt)) startNewChat();
            renderAll();
            updateFunctionButtonsState();
            updateInputState();
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
                setTimeout(() => ALL_ELEMENTS.modalSearchInput.focus(), 50);
            });
            ALL_ELEMENTS.apiKeyWarningBadge.addEventListener('click', () => {
                setupSettingsModal();
                toggleModal(ALL_ELEMENTS.settingsModal, true);
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
            ALL_ELEMENTS.settingsBtn.addEventListener('click', () => { setupSettingsModal(); toggleModal(ALL_ELEMENTS.settingsModal, true); });
            ALL_ELEMENTS.saveSettingsBtn?.remove();
            const scheduleInstantSettingsSave = (() => {
                let saveTimer = null;
                return () => {
                    clearTimeout(saveTimer);
                    saveTimer = setTimeout(() => saveSettings({ close: false, notify: false }), 350);
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
                    setTimeout(() => saveSettings({ close: false, notify: false }), 0);
                }
            });
            ALL_ELEMENTS.closeSettingsBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.settingsModal, false));
            ALL_ELEMENTS.settingsModal.addEventListener('click', (event) => {
                if (event.target === ALL_ELEMENTS.settingsModal) {
                    toggleModal(ALL_ELEMENTS.settingsModal, false);
                }
            });
            ALL_ELEMENTS.themeLightBtn.addEventListener('click', () => setTheme('light'));
            ALL_ELEMENTS.themeDarkBtn.addEventListener('click', () => setTheme('dark'));
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
                                    console.error('Could not copy text with any method: ', err);
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
                sendConfirmed = false;
                updateInputState();
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


                        requestAnimationFrame(() => {
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
                    setTimeout(() => {
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
    if (abortController) {
        try { abortController.abort(); } catch {}
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
                    personalMemories.push({ id: crypto.randomUUID(), content, enabled: true });
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
                if(cropperInstance) {
                    cropperInstance.destroy();
                    cropperInstance = null;
                }
            });
            ALL_ELEMENTS.deleteAllDataBtn.addEventListener('click', handleDeleteAllData);
            ALL_ELEMENTS.uiLanguageSelect.addEventListener('change', (e) => {
                config.uiLanguage = e.target.value;
                applyLanguage(config.uiLanguage);
            });
            ALL_ELEMENTS.openStoreBtn.addEventListener('click', openStore);
            ALL_ELEMENTS.backToChatBtn.addEventListener('click', closeStore);
            ALL_ELEMENTS.astrasAvatarInput.addEventListener('change', handleAvatarUpload);
            ALL_ELEMENTS.confirmAvatarCropBtn.addEventListener('click', handleConfirmAvatarCrop);
            ALL_ELEMENTS.cancelAvatarCropBtn.addEventListener('click', () => {
                 toggleModal(ALL_ELEMENTS.astrasAvatarModal, false);
                if(cropperInstance) {
                    cropperInstance.destroy();
                    cropperInstance = null;
                }
                editingAstraForAvatarId = null;
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
            startNewChat();
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
    
    if (!feedbackContent) {
        showNotification('請先輸入您的意見！', 'warning');
        return;
    }
    
    // ✨ 使用我們統一的 Google Apps Script 網址
    const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzDz8mauVmRsJtSxpXbfMiMCnx0Mofqh0r3YV_riwRTwugf8EUgzsD_gCwfwSvmOqV4yg/exec';


    const originalButtonText = sendButton.textContent;
    sendButton.disabled = true;
    sendButton.textContent = '發送中...';


    try {
        // ✨ 準備要發送的資料，並加入 formType 讓後台知道這是意見反饋
        const dataToSend = {
            formType: 'feedback', // <-- 關鍵識別碼！
            subject: '來自 Astra 的新意見反饋',
            timestamp: new Date().toISOString(),
            message: feedbackContent
        };


        await postJsonWithReadableError(FORM_ENDPOINT, dataToSend);


        showNotification('反饋已成功發送，感謝您！', 'success');
        ALL_ELEMENTS.feedbackTextarea.value = '';


    } catch (error) {
        console.error('發送反饋時出錯:', error);
        showNotification('發送失敗，請檢查您的網路連線。', 'error');
    } finally {
        sendButton.disabled = false;
        sendButton.textContent = originalButtonText;
    }
});
            ALL_ELEMENTS.proposeAstrasBtn.addEventListener('click', () => {
                ALL_ELEMENTS.proposalNameInput.value = '';
                ALL_ELEMENTS.proposalDescInput.value = '';
                ALL_ELEMENTS.proposalInstructionsInput.value = '';
                toggleModal(ALL_ELEMENTS.astrasProposalModal, true);
            });




            ALL_ELEMENTS.cancelProposalBtn.addEventListener('click', () => {
                toggleModal(ALL_ELEMENTS.astrasProposalModal, false);
            });




            ALL_ELEMENTS.submitProposalBtn.addEventListener('click', async () => {
    const name = ALL_ELEMENTS.proposalNameInput.value.trim();
    const description = ALL_ELEMENTS.proposalDescInput.value.trim();
    const instructions = ALL_ELEMENTS.proposalInstructionsInput.value.trim();
    const submitButton = ALL_ELEMENTS.submitProposalBtn;


    if (!name || !instructions) {
        showNotification('提案的「名稱」和「指令」是必填的喔！', 'warning');
        return;
    }
    
    // ✨ 同樣使用我們統一的 Google Apps Script 網址
    const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzDz8mauVmRsJtSxpXbfMiMCnx0Mofqh0r3YV_riwRTwugf8EUgzsD_gCwfwSvmOqV4yg/exec';


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
            proposal_instructions: instructions
        };
    
        await postJsonWithReadableError(FORM_ENDPOINT, dataToSend);


        toggleModal(ALL_ELEMENTS.astrasProposalModal, false);
        showNotification('感謝您的提案，已成功發送！', 'success');
        
    } catch (error) {
        console.error('提交提案時出錯:', error);
        showNotification('提交失敗，請檢查您的網路連線。', 'error');
    } finally {
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


            // ✨ START: 新增的附件上彈視窗函式與按鈕邏輯


            // 這個函式專門用來建立和顯示手機版的上彈視窗
            const showAttachmentMenu = () => {
                // 檢查是否已經存在，避免重複建立
                if (document.getElementById('attachment-menu')) return;


                const wrapper = document.getElementById('attachment-menu-wrapper');
                wrapper.innerHTML = ''; // 清空舊內容


                const overlay = document.createElement('div');
                overlay.id = 'attachment-menu-overlay';


                const menu = document.createElement('div');
                menu.id = 'attachment-menu';


                // 取得當前模型資訊
                const conv = getActiveConversation();
                const modelInfo = normalizeConversationModel(conv);
                const { participants, synthesizer } = getCouncilSelectedModels(conv);
                const councilActive = isCouncilEnabled(conv);
                const supportsVision = councilActive
                    ? participants.some(modelSupportsVision)
                    : modelSupportsVision(modelInfo);
                const supportsDocumentUpload = councilActive
                    ? true
                    : hasSingleDocumentAccess(modelInfo);
                const supportsWebSearch = councilActive
                    ? hasCouncilWebSearchAccess(synthesizer || modelInfo)
                    : hasSingleWebSearchAccess(modelInfo);


                const allMenuItems = [
                    { id: 'camera-btn', svg: `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle>`, textKey: 'camera', originalElement: ALL_ELEMENTS.cameraBtn },
                    { id: 'upload-image-btn', svg: `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>`, textKey: 'image', originalElement: ALL_ELEMENTS.uploadImageBtn },
                    { id: 'upload-file-btn', svg: `<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline>`, textKey: 'file', originalElement: ALL_ELEMENTS.uploadFileBtn },
                    { type: 'divider' },
                    { id: 'model-council-menu-btn', svg: `<path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path>`, text: getCouncilTexts().title },
                    { id: 'web-search-popover-btn', svg: `<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>`, textKey: 'search', originalElement: ALL_ELEMENTS.webSearchPopoverBtn },
                    { id: 'learning-mode-btn', svg: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V5H6.5A2.5 2.5 0 0 0 4 7.5v12z"/>`, textKey: 'learning', originalElement: ALL_ELEMENTS.learningModeBtn }
                ];


                let visibleMenuItems = allMenuItems.filter(item => {
                    if (item.type === 'divider') return true;
                    if (item.id === 'camera-btn' || item.id === 'upload-image-btn') return supportsVision;
                    if (item.id === 'upload-file-btn') return supportsDocumentUpload;
                    if (item.id === 'model-council-menu-btn') return !config.isLearningMode || councilActive;
                    if (item.id === 'web-search-popover-btn') return supportsWebSearch;
                    if (item.id === 'learning-mode-btn') return !councilActive;
                    return true;
                });

                let itemsHTML = '';
                visibleMenuItems.forEach((item, index) => {
                    if (item.type === 'divider') {
                        if (index > 0 && index < visibleMenuItems.length - 1 && visibleMenuItems[index - 1].type !== 'divider') {
                            // 這是用來在視覺上分隔選項的，在手機選單中是透過 CSS 的 border-bottom 實現
                        }
                    } else {
                        const isActive = (item.id === 'web-search-popover-btn' && getActiveConversation()?.isWebSearchEnabled)
                            || (item.id === 'learning-mode-btn' && config.isLearningMode);
                        itemsHTML += `
                            <div class="menu-item${isActive ? ' is-active' : ''}" data-trigger-id="${item.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.svg}</svg>
                                <span ${item.textKey ? `data-lang-key="${item.textKey}"` : ''}>${item.text || i18n[config.uiLanguage][item.textKey] || item.textKey}</span>
                            </div>
                        `;
                    }
                });


                menu.innerHTML = `
                    <div class="menu-header" data-lang-key="attachFile">${i18n[config.uiLanguage].attachFile || '附加檔案'}</div>
                    <div class="menu-options">${itemsHTML}</div>
                `;
                
                wrapper.appendChild(overlay);
                wrapper.appendChild(menu);


                requestAnimationFrame(() => {
                    overlay.classList.add('visible');
                    menu.classList.add('visible');
                });
                
                const closeMenu = () => {
                    overlay.classList.remove('visible');
                    menu.classList.remove('visible');
                    menu.addEventListener('transitionend', () => wrapper.innerHTML = '', { once: true });
                };


                overlay.addEventListener('click', closeMenu);


                menu.querySelectorAll('.menu-item').forEach(menuItem => {
                    menuItem.addEventListener('click', () => {
                        const triggerId = menuItem.dataset.triggerId;
                        if (triggerId === 'model-council-menu-btn') {
                            closeMenu();
                            window.setTimeout(openCouncilPopoverFromAttachmentMenu, 180);
                            return;
                        }
                        const originalElement = allMenuItems.find(i => i.id === triggerId)?.originalElement;
                        if (originalElement) {
                            originalElement.click();
                        }
                        closeMenu();
                    });
                });
            };
            // 這是新的「附加檔案」按鈕點擊事件
            ALL_ELEMENTS.addFileBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止事件冒泡
                
                // 判斷螢幕寬度
                if (window.innerWidth <= 768) { 
                    // 如果是手機，顯示上彈視窗
                    showAttachmentMenu();
                } else { 
                    // 如果是電腦，維持舊的小視窗
                    updateFunctionButtonsState();
                    const popover = ALL_ELEMENTS.fileOptionsPopover;
                    if (popover.classList.contains('visible')) {
                        popover.classList.remove('visible');
                    } else {
                        closeAllPopovers();
                        popover.classList.add('visible');
                    }
                }
            });


            // ✨ END: 新增的附件上彈視窗函式與按鈕邏輯
            // ==========================================
    // ✨ P2P 分享功能 (PeerJS Implementation)
    // ==========================================

    let p2pPeer = null;
    let p2pConn = null;
    let p2pType = null; // 'astras' or 'folders'
    let p2pMode = null; // 'sender' or 'receiver'
    let html5QrcodeScanner = null;

    const CHUNK_SIZE = 16 * 1024; // 16KB chunks for safe transmission

    // 初始化 P2P 模組
    function initP2P(type) {
        p2pType = type; // 'astras' or 'folders'
        resetP2PUI();
        document.getElementById('p2p-modal-title').textContent = `P2P 分享 ${type === 'astras' ? 'Astras' : '資料夾'}`;
        toggleModal(document.getElementById('p2p-share-modal'), true);
    }

    function resetP2PUI() {
        document.getElementById('p2p-step-role').classList.remove('hidden');
        document.getElementById('p2p-step-select').classList.add('hidden');
        document.getElementById('p2p-step-wait').classList.add('hidden');
        document.getElementById('p2p-step-connect').classList.add('hidden');
        document.getElementById('p2p-step-progress').classList.add('hidden');
        document.getElementById('p2p-reader').classList.add('hidden'); // 隱藏掃描器
        
        if (html5QrcodeScanner) {
            html5QrcodeScanner.stop().catch(err => console.error("Failed to stop scanner", err));
            html5QrcodeScanner = null;
        }
        if (p2pPeer) {
            p2pPeer.destroy();
            p2pPeer = null;
        }
    }

    // 產生 5 碼隨機代碼 (排除易混淆字元 I, O, 0, 1)
    function generateP2PCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // 顯示選擇清單 (僅限傳送者)
    function showP2PSelection() {
        document.getElementById('p2p-step-role').classList.add('hidden');
        document.getElementById('p2p-step-select').classList.remove('hidden');
        const list = document.getElementById('p2p-item-list');
        list.innerHTML = '';

        let items = [];
        if (p2pType === 'astras') {
            // 僅限自訂 Astras (沒有 officialId)
            items = astras.filter(a => !a.officialId);
        } else {
            items = folders;
        }

        if (items.length === 0) {
            list.innerHTML = '<p class="text-center text-[var(--text-secondary)] p-4">沒有可分享的項目。</p>';
            document.getElementById('p2p-confirm-selection-btn').disabled = true;
            return;
        } else {
            document.getElementById('p2p-confirm-selection-btn').disabled = false;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'p2p-select-item';
            div.innerHTML = `
                <input type="checkbox" class="p2p-item-checkbox w-4 h-4" value="${escapeHTML(item.id)}">
                <span class="truncate flex-1">${escapeHTML(item.name)}</span>
            `;
            list.appendChild(div);
        });
    }

    // 啟動傳送方
    async function startP2PSender() {
        const checkboxes = document.querySelectorAll('.p2p-item-checkbox:checked');
        if (checkboxes.length === 0) {
            showNotification('請至少選擇一個項目', 'warning');
            return;
        }

        const selectedIds = Array.from(checkboxes).map(cb => cb.value);
        
        // 準備資料
        document.getElementById('p2p-step-select').classList.add('hidden');
        document.getElementById('p2p-step-wait').classList.remove('hidden');
        
        const code = generateP2PCode();
        const peerId = `astra-p2p-${code}`; // 在 PeerJS 伺服器上的實際 ID

        document.getElementById('p2p-share-code').textContent = code;
        
        // 產生 QR Code
        const qrContainer = document.getElementById('p2p-qrcode-container');
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: code, // 只需要存代碼，接收方自己組裝 prefix
            width: 180,
            height: 180
        });

        // 初始化 Peer
        p2pPeer = new Peer(peerId);

        p2pPeer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
        });

        p2pPeer.on('connection', (conn) => {
            p2pConn = conn;
            setupSenderConnection(selectedIds);
        });

        p2pPeer.on('error', (err) => {
            console.error(err);
            if (err.type === 'unavailable-id') {
                // 極低機率碰撞，重新產生
                p2pPeer.destroy();
                startP2PSender(); 
            } else {
                showNotification(`P2P 錯誤: ${err.type}`, 'error');
            }
        });
    }

    // 處理傳送邏輯
    async function setupSenderConnection(selectedIds) {
        document.getElementById('p2p-step-wait').classList.add('hidden');
        document.getElementById('p2p-step-progress').classList.remove('hidden');
        updateP2PProgress(0, "正在打包資料...");

        // 打包資料
        const zip = new JSZip();
        
        if (p2pType === 'astras') {
            const selectedAstras = astras.filter(a => selectedIds.includes(a.id));
            // 處理 Astras 的圖片
            for (const ast of selectedAstras) {
                // 深拷貝以免修改原始資料
                const astraCopy = JSON.parse(JSON.stringify(ast));
                if (astraCopy.avatarUrl && astraCopy.avatarUrl.startsWith('data:image')) {
                     // 簡單處理：直接放 JSON，因為 JSZip 處理大量 Base64 也還行
                     // 若要優化可分離圖片，但這裡求穩
                }
                zip.file(`astra_${ast.id}.json`, JSON.stringify(astraCopy));
            }
        } else {
            // 處理資料夾與對話
            const selectedFolders = folders.filter(f => selectedIds.includes(f.id));
            const folderConvs = [];
            
            // 收集資料夾內的所有對話 ID
            selectedFolders.forEach(f => {
                if(f.conversationIds) {
                    f.conversationIds.forEach(cid => {
                        const c = conversations.find(conv => conv.id === cid);
                        if(c && !c.deletedAt) folderConvs.push(c);
                    });
                }
            });

            zip.file('folders.json', JSON.stringify(selectedFolders));
            zip.file('conversations.json', JSON.stringify(folderConvs));
        }

        const blob = await zip.generateAsync({ type: "blob" });
        const arrayBuffer = await blob.arrayBuffer();
        
        // 開始傳送
        p2pConn.on('open', () => {
            // 1. 傳送 Metadata
            p2pConn.send({
                type: 'meta',
                size: arrayBuffer.byteLength,
                dataType: p2pType
            });

            // 2. 傳送 Chunks
            const totalSize = arrayBuffer.byteLength;
            let offset = 0;

            function sendNextChunk() {
                if (offset >= totalSize) {
                    p2pConn.send({ type: 'end' });
                    updateP2PProgress(100, "傳送完成！");
                    return;
                }

                const chunk = arrayBuffer.slice(offset, offset + CHUNK_SIZE);
                p2pConn.send({
                    type: 'chunk',
                    data: chunk,
                    offset: offset
                });

                offset += chunk.byteLength;
                const percent = (offset / totalSize) * 100;
                updateP2PProgress(percent, `正在傳送... ${Math.round(percent)}%`);
                
                // 使用 setTimeout 避免阻塞 UI
                setTimeout(sendNextChunk, 5); // 小延遲
            }

            sendNextChunk();
        });
    }

    // 啟動接收方介面
    function startP2PReceiverUI() {
        document.getElementById('p2p-step-role').classList.add('hidden');
        document.getElementById('p2p-step-connect').classList.remove('hidden');
        document.getElementById('p2p-code-input').value = '';
        document.getElementById('p2p-code-input').focus();
    }

    // 執行接收連線
    function connectToSender(code) {
        const peerId = `astra-p2p-${code.toUpperCase()}`;
        
        p2pPeer = new Peer(); // 自動產生 ID，因為我們是接收端
        
        document.getElementById('p2p-step-connect').classList.add('hidden');
        document.getElementById('p2p-step-progress').classList.remove('hidden');
        updateP2PProgress(5, "正在連線...");

        p2pPeer.on('open', () => {
            p2pConn = p2pPeer.connect(peerId);
            setupReceiverConnection();
        });

        p2pPeer.on('error', (err) => {
            console.error(err);
            showNotification("連線失敗，請檢查代碼", "error");
            resetP2PUI();
            startP2PReceiverUI();
        });
    }

    // 處理接收邏輯
    function setupReceiverConnection() {
        let receivedBuffer = [];
        let receivedSize = 0;
        let totalSize = 0;
        let dataType = '';

        p2pConn.on('open', () => {
            updateP2PProgress(10, "已連線，等待資料...");
        });

        p2pConn.on('data', async (data) => {
            if (data.type === 'meta') {
                totalSize = data.size;
                dataType = data.dataType;
                receivedBuffer = [];
                receivedSize = 0;
                updateP2PProgress(10, "開始接收...");
            } else if (data.type === 'chunk') {
                receivedBuffer.push(data.data); // 收集 ArrayBuffer
                receivedSize += data.data.byteLength;
                const percent = (receivedSize / totalSize) * 100;
                updateP2PProgress(percent, `正在接收... ${Math.round(percent)}%`);
            } else if (data.type === 'end') {
                updateP2PProgress(100, "接收完成，正在解壓縮...");
                await processReceivedData(receivedBuffer, dataType);
            }
        });
        
        // 如果連線斷開
        p2pConn.on('close', () => {
             if(receivedSize < totalSize && totalSize > 0) {
                 showNotification("傳輸中斷", "error");
             }
        });
    }

    async function processReceivedData(buffers, type) {
        try {
            const blob = new Blob(buffers);
            const zip = await JSZip.loadAsync(blob);
            
            if (type === 'astras') {
                let count = 0;
                const files = Object.keys(zip.files);
                for (const filename of files) {
                    if (filename.startsWith('astra_') && filename.endsWith('.json')) {
                        const content = await zip.file(filename).async("string");
                        const astraData = JSON.parse(content);
                        
                        // 檢查重複：如果 id 已存在，生成新 id
                        if (astras.some(a => a.id === astraData.id)) {
                            astraData.id = crypto.randomUUID();
                            astraData.name += " (匯入)";
                        }
                        // 確保它是自訂的
                        astraData.officialId = null;
                        
                        astras.unshift(astraData);
                        count++;
                    }
                }
