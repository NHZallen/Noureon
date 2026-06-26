        import {
            FOLDER_SVGS,
            FOLDER_TEXT_COLORS,
        } from '/src/app/legacy-runtime/data/folder-metadata.js';
        import { createLegacyConversationMailSender } from '/src/app/runtime/features/conversation-mail.js';
        import { createLegacySubmitInputCouncilLifecycle } from '/src/app/runtime/legacy-core/submit-input-council-lifecycle.js';

        const sendConversationToMail = createLegacyConversationMailSender({
            getActiveConversation,
            getModels: () => MODELS,
            isCouncilEnabled,
            getCouncilTexts,
            postJsonWithReadableError,
            logger: console,
        });

        const renderFolders = () => {
            const folderList = runtimeDomAccess.getRequiredElement('folderList');
            folderList.innerHTML = '';
            folders.forEach(folder => {
                const folderConvs = folder.conversationIds
                    .map(id => conversations.find(c => c.id === id))
                    .filter(c => c && !c.archived && !c.deletedAt)
                    .sort((a,b) => {
                        if (a.pinned && !b.pinned) return -1;
                        if (!a.pinned && b.pinned) return 1;
                        const dateB = b.lastUpdatedAt || b.createdAt;
                        const dateA = a.lastUpdatedAt || a.createdAt;
                        return new Date(dateB) - new Date(dateA);
                    });
                const folderElement = document.createElement('div');
                folderElement.className = 'folder-item text-sm';
                folderElement.dataset.id = folder.id;
                folderElement.dataset.open = folder.isOpen;
                // 取得 SVG 路徑，如果找不到就用預設的
                const svgPath = FOLDER_SVGS[folder.icon] || FOLDER_SVGS['default'];
                // 取得 SVG 線條顏色 (使用原有的 FOLDER_COLORS)
                const iconColor = resolveFolderColor(folder.color, FOLDER_COLORS, FOLDER_COLORS.gray);
                // 取得文字顏色 (使用新的 FOLDER_TEXT_COLORS)
                const textColor = FOLDER_TEXT_COLORS[folder.textColor] || FOLDER_TEXT_COLORS.gray;


                folderElement.innerHTML = `
                    <div class="folder-summary sidebar-item p-3 rounded-lg flex items-center justify-between">
                        <div class="flex items-center gap-2 truncate">
                            <svg class="folder-arrow flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            
                            <!-- 修改：這裡顯示 SVG 圖示，顏色套用在 style 的 color 屬性上 -->
                            <span class="folder-icon mr-1 flex-shrink-0" style="--folder-icon-color: ${iconColor}; color: ${iconColor};">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="folder-icon-svg">
                                    ${svgPath}
                                </svg>
                            </span>
                            
                            <!-- 修改：文字顏色獨立設定 -->
                            <span class="font-medium truncate" style="color: ${textColor};">${folder.name}</span>
                        </div>
                        <button data-id="${folder.id}" class="folder-options-btn flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--active-bg)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button>
                    </div>
                    <!-- 修改點 1: 移除這裡的 padding 和 margin，移到內部 div -->
                    <div class="folder-content-container">
                        <!-- 修改點 2: 新增這層 div 作為包裝，並加上樣式 -->
                        <div class="pl-4 mt-1 space-y-1">
                            <!-- 對話內容會被加到這裡 -->
                        </div>
                    </div>
                `;
                
                // 修改點 3: 選擇器要多選一層 div，確保對話是加在包裝層內
                const contentContainer = folderElement.querySelector('.folder-content-container > div');
                folderConvs.forEach(conv => {
                    contentContainer.appendChild(createConversationElement(conv));
                });
                const folderSummary = folderElement.querySelector('.folder-summary');
                let pressTimer = null;
                let touchMoved = false;
                const startPress = (e) => {
                    if (window.innerWidth >= 768 || isSelectionMode) return;
                    touchMoved = false;
                    pressTimer = setTimeout(() => {
                        e.preventDefault();
                        showMobileContextMenuForFolder(folder.id);
                        pressTimer = null;
                    }, 500);
                };
                const cancelPress = () => {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                };
                const handleClick = async (e) => {
                    if (pressTimer || !touchMoved) {
                        cancelPress();
                        if (e.target.closest('.folder-options-btn')) return;
                        const folderItem = e.currentTarget.closest('.folder-item');
                        const folderObj = folders.find(f => f.id === folderItem.dataset.id);
                        if (folderObj) {
                            folderObj.isOpen = !folderObj.isOpen;
                            folderItem.dataset.open = folderObj.isOpen;
                            await saveAppData();
                        }
                    }
                };
                folderSummary.addEventListener('touchstart', startPress, { passive: true });
                folderSummary.addEventListener('touchend', cancelPress);
                folderSummary.addEventListener('touchmove', () => { touchMoved = true; cancelPress(); }, { passive: true });
                folderSummary.addEventListener('mousedown', startPress);
                folderSummary.addEventListener('mouseup', cancelPress);
                folderSummary.addEventListener('mouseleave', cancelPress);
                folderSummary.addEventListener('click', handleClick);
                const folderOptionsBtn = folderElement.querySelector('.folder-options-btn');
                folderOptionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    createFolderMenu(folder.id, folderOptionsBtn);
                });
                folderList.appendChild(folderElement);
            });
        };
        const createConversationElement = (conv) => {
            const item = document.createElement('div');
            const currentConversationId = conversationStateAccess.getCurrentConversationId();
            item.className = `sidebar-item w-full text-left p-3 rounded-lg flex items-center justify-between cursor-pointer ${conv.id === currentConversationId && !isSelectionMode ? 'active' : ''}`;
            item.dataset.id = conv.id;
            const modelInfo = normalizeConversationModel(conv);
            const modelCodename = isCouncilEnabled(conv) ? getCouncilTexts().title : (modelInfo ? modelInfo.name.split(' (')[0] : '');
            const modelNameSuffix = modelCodename ? `<span class="model-suffix">${modelCodename}</span>` : '';
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'flex-1 flex items-center justify-between truncate';
            contentWrapper.innerHTML = `
                <div class="flex-1 flex items-center gap-2 truncate">
                    <span class="truncate">${conv.title}${conv.pinned ? ' <span class="pinned-icon">📌</span>' : ''}</span>
                    ${modelNameSuffix}
                 </div>
                <button class="chat-options-btn flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--hover-bg)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button>
            `;
            if (isSelectionMode) {
                item.classList.add('pr-2');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'conv-select-checkbox h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3 flex-shrink-0';
                checkbox.checked = selectedConversationIds.has(conv.id);
                checkbox.dataset.id = conv.id;
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        selectedConversationIds.add(conv.id);
                    } else {
                        selectedConversationIds.delete(conv.id);
                    }
                    renderBatchActionBar();
                });
                checkbox.addEventListener('click', e => e.stopPropagation());
                item.appendChild(checkbox);
                contentWrapper.querySelector('.chat-options-btn').classList.add('hidden');
            }
            item.appendChild(contentWrapper);
            let pressTimer = null;
            let touchMoved = false;
            const startPress = (e) => {
                if (window.innerWidth >= 768 || isSelectionMode) return;
                touchMoved = false;
                pressTimer = setTimeout(() => {
                    e.preventDefault();
                    showMobileContextMenu(conv.id, e.currentTarget);
                    pressTimer = null;
                }, 500);
            };
            const cancelPress = () => {
                clearTimeout(pressTimer);
                pressTimer = null;
            };
            const handleClick = () => {
                if (pressTimer || !touchMoved) {
                    cancelPress();
                    if (isSelectionMode) {
                        const checkbox = item.querySelector('.conv-select-checkbox');
                        if (checkbox) {
                            checkbox.checked = !checkbox.checked;
                            checkbox.dispatchEvent(new Event('change'));
                        }
                    } else {
                        loadChat(conv.id);
                        legacyRuntimeContext.resolveBinding('sidebar.toggleSidebar')(false);
                    }
                }
            };
            item.addEventListener('touchstart', startPress, { passive: true });
            item.addEventListener('touchend', cancelPress);
            item.addEventListener('touchmove', () => {
                touchMoved = true;
                cancelPress();
            }, { passive: true });
            item.addEventListener('mousedown', startPress);
            item.addEventListener('mouseup', cancelPress);
            item.addEventListener('mouseleave', cancelPress);
            item.addEventListener('click', handleClick);
            const chatOptionsBtn = contentWrapper.querySelector('.chat-options-btn');
            if (chatOptionsBtn) {
                chatOptionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    createHistoryMenu(conv.id, chatOptionsBtn);
                });
            }
            return item;
        };
        const renderArchivedChats = () => {
            const archivedChatsContainer = runtimeDomAccess.getRequiredElement('archivedChatsContainer');
            archivedChatsContainer.innerHTML = '';
            const archived = conversations.filter(c => c.archived).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            if (archived.length === 0) {
                archivedChatsContainer.innerHTML = `<p class="text-sm text-[var(--text-secondary)] text-center p-4">${i18n[uiLanguage].noArchivedChats || '沒有已封存的對話。'}</p>`;
                return;
            }
            archived.forEach(conv => {
                const item = document.createElement('div');
                item.className = 'archived-chat-item';
                item.innerHTML = `
                    <div class="archived-chat-row">
                        <span class="archived-chat-title">${conv.title}</span>
                        <div class="archived-chat-actions">
                            <button data-id="${conv.id}" class="view-archived-btn text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200">${i18n[uiLanguage].view || '檢視'}</button>
                            <button data-id="${conv.id}" class="unarchive-btn text-xs bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200">${i18n[uiLanguage].restore || '還原'}</button>
                            <button data-id="${conv.id}" class="delete-btn text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200">${i18n[uiLanguage].delete || '刪除'}</button>
                        </div>
                    </div>
                    ${conv.summary ? `<p class="archived-chat-summary">${conv.summary}</p>` : ''}
                `;
                archivedChatsContainer.appendChild(item);
            });
            archivedChatsContainer.querySelectorAll('.view-archived-btn').forEach(btn => btn.addEventListener('click', (e) => showArchivedChatPreview(e.target.dataset.id, e)));
            archivedChatsContainer.querySelectorAll('.unarchive-btn').forEach(btn => btn.addEventListener('click', (e) => unarchiveChat(e.target.dataset.id, e)));
            archivedChatsContainer.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => deleteChat(e.target.dataset.id, e)));
        };
        const submitInputCouncilState = {
            get config() { return config; },
            get conversations() { return conversations; },
            get astras() { return astras; },
            get uploadedFiles() { return uploadedFiles; },
            set uploadedFiles(next) { uploadedFiles = next; },
            get abortController() { return abortController; },
            set abortController(next) { abortController = next; },
            get isCouncilRunning() { return isCouncilRunning; },
            set isCouncilRunning(next) { isCouncilRunning = next; },
            get isAutoScrolling() { return isAutoScrolling; }
        };
        let addMessageToUI;
        let renderChat;
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
            getConfig: () => config,
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
            sendConversationToMail,
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
        legacyRuntimeContext.registerLazyBinding('submit.adjustTextareaHeight', () => {
            const runtimeEntryAdjustTextareaHeight = legacyRuntimeContext.resolveOptionalBinding(
                'runtimeEntry.submit.adjustTextareaHeight'
            );
            if (runtimeEntryAdjustTextareaHeight) return runtimeEntryAdjustTextareaHeight;
            return adjustTextareaHeight;
        });
        legacyRuntimeContext.registerLazyBinding('submit.renderFilePreviews', () => renderFilePreviews);
        const getActiveAstrasId = () => {
            const conv = getActiveConversation();
            return conv ? conv.astrasId : null;
        };
        const setAstrasForConversation = async (astrasId) => {
            const conv = getActiveConversation();
            if (conv) {
                conv.astrasId = astrasId;
                await saveAppData();
                runtimeRenderCoordinator.renderAll();
                legacyRuntimeContext.resolveBinding('input.updateInputState')();
            }
        };
        const deactivateAstras = async () => {
            const conv = getActiveConversation();
            if (conv) {
                conv.astrasId = null;
                await saveAppData();
                runtimeRenderCoordinator.renderAll();
                legacyRuntimeContext.resolveBinding('input.updateInputState')();
                runtimeDialogCoordinator.showNotification(i18n[config.uiLanguage].astrasDeactivated || '已關閉 Astras。', 'success');
            }
        };
        const createAstras = async () => {
            editingAstrasId = null;
            ALL_ELEMENTS.astrasCreateModal.querySelector('h2').textContent = i18n[config.uiLanguage].createAstras;
            ALL_ELEMENTS.astrasNameInput.value = '';
            ALL_ELEMENTS.astrasDescInput.value = '';
            ALL_ELEMENTS.astrasInstructionsInput.value = '';
            toggleModal(ALL_ELEMENTS.astrasCreateModal, true);
        };
        const handleSaveAstras = async () => {
            const name = ALL_ELEMENTS.astrasNameInput.value.trim();
            const description = ALL_ELEMENTS.astrasDescInput.value.trim();
            const instructions = ALL_ELEMENTS.astrasInstructionsInput.value.trim();
            if (!name || !instructions) {
                showNotification(i18n[config.uiLanguage].nameAndInstructionsRequired || '名稱和指令為必填。', 'error');
                return;
            }
            if (editingAstrasId) {
                const ast = astras.find(a => a.id === editingAstrasId);
                if (ast) {
                    ast.name = name;
                    ast.description = description;
                    ast.instructions = instructions;
                    showNotification(i18n[config.uiLanguage].astrasUpdated || 'Astras 已更新');
                }
                editingAstrasId = null;
            } else {
                const newAstras = {
                    id: crypto.randomUUID(),
                    name,
                    description,
                    instructions,
                    avatarUrl: null,
                    officialId: null,
                };
                astras.unshift(newAstras);
                showNotification(i18n[config.uiLanguage].astrasCreated ||'Astras 已創建');
            }
            await saveAppData();
            renderAstras();
            toggleModal(ALL_ELEMENTS.astrasCreateModal, false);
            ALL_ELEMENTS.astrasNameInput.value = '';
            ALL_ELEMENTS.astrasDescInput.value = '';
            ALL_ELEMENTS.astrasInstructionsInput.value = '';
            ALL_ELEMENTS.astrasCreateModal.querySelector('h2').textContent = i18n[config.uiLanguage].createAstras;
        };
        const deleteAstras = async (id) => {
            if (!(await showCustomConfirm(i18n[config.uiLanguage].confirmDeleteAstras || '確定刪除此 Astras？'))) return;
            astras = runtimeAppDataStore.replaceAstras(
                astras.filter(a => a.id !== id)
            );
            conversations.forEach(c => {
                if (c.astrasId === id) c.astrasId = null;
            });
            await saveAppData();
            runtimeRenderCoordinator.renderAll();
            runtimeDialogCoordinator.showNotification(i18n[config.uiLanguage].astrasDeleted || 'Astras 已刪除');
        };
        const createAstrasMenu = (astrasId, targetButton) => {
            const existingPopover = document.getElementById('history-popover');
            if (existingPopover) {
                existingPopover.remove();
                if (existingPopover.dataset.targetId === targetButton.id) return;
            }
            const rect = targetButton.getBoundingClientRect();
            const popover = document.createElement('div');
            popover.id = 'history-popover';
            popover.className = 'popover absolute w-48 rounded-lg border border-[var(--border-color)] z-50';
            popover.dataset.targetId = targetButton.id;
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 150) {
                popover.style.bottom = `${window.innerHeight - rect.top}px`;
                popover.style.transformOrigin = 'bottom';
            } else {
                popover.style.top = `${rect.bottom}px`;
                popover.style.transformOrigin = 'top';
            }
            popover.style.left = `${rect.left}px`;
            const astra = astras.find(a => a.id === astrasId);
            let menuHTML = '';
            if (astra && astra.officialId) {
                menuHTML = `
                    <button data-id="${astrasId}" class="edit-avatar-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].editAvatar || '編輯頭像'}</button>
                    <button data-id="${astrasId}" class="delete-astras-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${i18n[config.uiLanguage].delete || '刪除'}</button>
                `;
            } else {
                menuHTML = `
                    <button data-id="${astrasId}" class="edit-astras-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].edit || '編輯'}</button>
                    <button data-id="${astrasId}" class="edit-avatar-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].editAvatar || '編輯頭像'}</button>
                    <button data-id="${astrasId}" class="delete-astras-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${i18n[config.uiLanguage].delete || '刪除'}</button>
                `;
            }
            popover.innerHTML = menuHTML;
            document.body.appendChild(popover);
            requestAnimationFrame(() => popover.classList.add('visible'));
            const editBtn = popover.querySelector('.edit-astras-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    const ast = astras.find(a => a.id === astrasId);
                    if (ast) {
                        editingAstrasId = astrasId;
                        ALL_ELEMENTS.astrasNameInput.value = ast.name;
                        ALL_ELEMENTS.astrasDescInput.value = ast.description;
                        ALL_ELEMENTS.astrasInstructionsInput.value = ast.instructions;
                        ALL_ELEMENTS.astrasCreateModal.querySelector('h2').textContent = i18n[config.uiLanguage].editAstras || '編輯 Astras';
                        toggleModal(ALL_ELEMENTS.astrasCreateModal, true);
                    }
                    popover.remove();
                });
            }
            popover.querySelector('.edit-avatar-btn').addEventListener('click', () => {
                openAvatarEditor(astrasId);
                popover.remove();
            });
            popover.querySelector('.delete-astras-btn').addEventListener('click', () => { deleteAstras(astrasId); popover.remove(); });
        };
        import { createMediaAttachmentRenderer as createMessageMediaAttachmentRenderer } from '/src/app/legacy-runtime/features/media-attachment-renderer.js';
        import { createMediaPreviewLifecycle as createMessageMediaPreviewLifecycle } from '/src/app/legacy-runtime/features/media-preview-lifecycle.js';
        import { createMessageListLifecycle } from '/src/app/legacy-runtime/features/message-list-lifecycle.js';
        const {
            buildMediaAttachmentView: buildMessageMediaAttachmentView,
            getInlineMediaSrc: getMessageInlineMediaSrc
        } = createMessageMediaAttachmentRenderer({ escapeHTML });
        const {
            bindMediaPreviewButtons: bindMessageMediaPreviewButtons
        } = createMessageMediaPreviewLifecycle({
            document,
            navigator,
            fetch,
            File,
            escapeHTML,
            getInlineMediaSrc: getMessageInlineMediaSrc,
            getUiLanguage: () => config.uiLanguage
        });
        ({
            addMessageToUI,
            renderChat
        } = createMessageListLifecycle({
            document,
            elements: {
                headerTitle: ALL_ELEMENTS.headerTitle,
                modelSwitcherContainer: ALL_ELEMENTS.modelSwitcherContainer,
                messageList: ALL_ELEMENTS.messageList,
                chatContainer: ALL_ELEMENTS.chatContainer
            },
            getActiveConversation,
            getAutoNaming: () => config.autoNaming,
            getCurrentUserName: () => currentUser.username,
            getText: (key) => ({
                newChat: i18n[config.uiLanguage].newChat,
                archived: i18n[config.uiLanguage].archived || '已封存',
                howCanIHelp: i18n[config.uiLanguage].howCanIHelp || '有什麼可以為您服務的嗎？',
                copyContent: i18n[config.uiLanguage].copyContent || '複製內容'
            }[key]),
            buildMessageRenderView,
            buildMediaAttachmentView: buildMessageMediaAttachmentView,
            renderUserText,
            renderMarkdownWithFormulas,
            formatTimestamp: formatFullTimestamp,
            bindMediaPreviewButtons: bindMessageMediaPreviewButtons,
            saveAppData,
            renderModelSwitcher,
            renderInputIndicators,
            renderCouncilControls,
            setupMessageIntersectionObserver,
            updateInputState: () => legacyRuntimeContext.resolveBinding('input.updateInputState')(),
            scheduleFrame: (callback) => requestAnimationFrame(callback),
            isAutoScrolling: () => isAutoScrolling
        }));
        import { createBatchActionBarLifecycle } from '/src/app/legacy-runtime/features/batch-action-bar-lifecycle.js';
        import { createLegacyFolderLifecycle } from '/src/app/runtime/features/folder-lifecycle.js';
        import { createLegacyTransitionBusLifecycle } from '/src/app/runtime/legacy-core/transition-bus-lifecycle.js';
        import { createLegacySettingsAuthProviderLifecycle } from '/src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js';
        import {
            FOLDER_SVGS as FOLDER_ICON_OPTIONS,
        } from '/src/app/legacy-runtime/data/folder-metadata.js';
        const settingsAuthProviderState = {
            get config() { return config; },
            set config(next) { config = next; },
            get conversations() { return conversations; },
            set conversations(next) { conversations = next; },
            get folders() { return folders; },
            set folders(next) { folders = next; },
            get astras() { return astras; },
            set astras(next) { astras = next; },
            get personalMemories() { return personalMemories; },
            set personalMemories(next) { personalMemories = next; },
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
            renderHistorySidebar,
            conversationStateAccess,
            getProviderLabel,
            getModelPriceLabel,
            getCouncilTranslatorCandidates,
            getSingleTranslatorCandidates,
            escapeHTML,
            hexToRgba,
            renderPersonalMemoryList: (...args) => renderPersonalMemoryList(...args),
            renderModelManagementUI: (...args) => renderModelManagementUI(...args),
            renderUiColorOptions: (...args) => renderUiColorOptions(...args),
            renderTrash: (...args) => renderTrash(...args),
            renderModelSwitcher,
            renderChat,
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
            getFolders: () => folders,
            getConversations: () => conversations,
            replaceFolders: (nextFolders) => {
                folders = runtimeAppDataStore.replaceFolders(nextFolders);
                return folders;
            },
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
            getUiLanguage: () => config.uiLanguage,
            randomUUID: () => crypto.randomUUID(),
            scheduleAnimationFrame: requestAnimationFrame,
            logger: console
        });
        const toggleSelectionMode = () => {
    isSelectionMode = !isSelectionMode;
    selectedConversationIds.clear();


    // ???詨?靽格嚗??霈?摮???? 'active' CSS 憿
    ALL_ELEMENTS.selectionModeBtn.classList.toggle('active', isSelectionMode);


    // ???芸?嚗???唳?曌????蝷箸?摮?
    if (isSelectionMode) {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[config.uiLanguage].cancelBatchSelect || '???寞活?詨?';
    } else {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[config.uiLanguage].batchSelect || '?寞活?詨?';
    }


    renderAll();
};
        const batchActionBarLifecycle = createBatchActionBarLifecycle({
            elements: ALL_ELEMENTS,
            getI18n: () => i18n,
            getIsSelectionMode: () => isSelectionMode,
            getSelectedConversationIds: () => selectedConversationIds,
            getUiLanguage: () => config.uiLanguage
        });
        const renderBatchActionBar = (...args) => batchActionBarLifecycle.renderBatchActionBar(...args);
        const transitionBusState = {
            get config() { return config; },
            set config(next) { config = next; },
            get conversations() { return conversations; },
            set conversations(next) { conversations = next; },
            get folders() { return folders; },
            set folders(next) { folders = next; },
            get astras() { return astras; },
            set astras(next) { astras = next; },
            get personalMemories() { return personalMemories; },
            set personalMemories(next) { personalMemories = next; },
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
