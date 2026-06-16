            astras.forEach(ast => {
                const item = document.createElement('div');
                item.className = `sidebar-item w-full text-left p-2.5 rounded-lg flex items-center justify-between cursor-pointer ${ast.id === getActiveAstrasId() && !isSelectionMode ? 'active' : ''}`;
                item.dataset.id = ast.id;
                const avatarUrl = ast.avatarUrl;
                const initials = ast.name.charAt(0);
                const avatarElement = `
                    <div class="astras-sidebar-avatar">
                        ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">` : initials}
                    </div>`;
                item.innerHTML = `
                    <div class="flex items-center truncate flex-1">
                        ${avatarElement}
                        <span class="truncate pr-2 text-sm">${ast.name}</span>
                    </div>
                    <button class="astras-options-btn flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--hover-bg)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </button>
                `;
                let pressTimer = null;
                let touchMoved = false;
                const startPress = (e) => {
                    if (window.innerWidth >= 768 || isSelectionMode) return;
                    touchMoved = false;
                    pressTimer = setTimeout(() => {
                        e.preventDefault();
                        showMobileContextMenuForAstras(ast.id);
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
                        if (isSelectionMode) return;
                        setAstrasForConversation(ast.id);
                        toggleSidebar(false);
                    }
                };
                item.addEventListener('touchstart', startPress, { passive: true });
                item.addEventListener('touchend', cancelPress);
                item.addEventListener('touchmove', () => { touchMoved = true; cancelPress(); }, { passive: true });
                item.addEventListener('mousedown', startPress);
                item.addEventListener('mouseup', cancelPress);
                item.addEventListener('mouseleave', cancelPress);
                item.addEventListener('click', handleClick);
                const optionsBtn = item.querySelector('.astras-options-btn');
                optionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    createAstrasMenu(ast.id, optionsBtn);
                });
                ALL_ELEMENTS.astrasList.appendChild(item);
            });
        };
        const renderFolders = () => {
            ALL_ELEMENTS.folderList.innerHTML = '';
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
                const iconColor = FOLDER_COLORS[folder.color] || FOLDER_COLORS.gray;
                // 取得文字顏色 (使用新的 FOLDER_TEXT_COLORS)
                const textColor = FOLDER_TEXT_COLORS[folder.textColor] || FOLDER_TEXT_COLORS.gray;


                folderElement.innerHTML = `
                    <div class="folder-summary sidebar-item p-3 rounded-lg flex items-center justify-between">
                        <div class="flex items-center gap-2 truncate">
                            <svg class="folder-arrow flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            
                            <!-- 修改：這裡顯示 SVG 圖示，顏色套用在 style 的 color 屬性上 -->
                            <span class="folder-icon mr-1 flex-shrink-0" style="color: ${iconColor};">
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
                ALL_ELEMENTS.folderList.appendChild(folderElement);
            });
        };
        const createConversationElement = (conv) => {
            const item = document.createElement('div');
            item.className = `sidebar-item w-full text-left p-3 rounded-lg flex items-center justify-between cursor-pointer ${conv.id === activeConversationId && !isSelectionMode ? 'active' : ''}`;
            item.dataset.id = conv.id;
            const modelInfo = MODELS.find(m => m.id === conv.model);
            const modelCodename = modelInfo ? modelInfo.name.split(' (')[0] : '';
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
                        toggleSidebar(false);
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
            ALL_ELEMENTS.archivedChatsContainer.innerHTML = '';
            const archived = conversations.filter(c => c.archived).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (archived.length === 0) {
                ALL_ELEMENTS.archivedChatsContainer.innerHTML = `<p class="text-sm text-[var(--text-secondary)] text-center p-4">${i18n[config.uiLanguage].noArchivedChats || '沒有已封存的對話。'}</p>`;
                return;
            }
            archived.forEach(conv => {
                const item = document.createElement('div');
                item.className = 'p-3 bg-[var(--sidebar-bg)] rounded-md border border-[var(--border-color)]';
                item.innerHTML = `
                    <div class="flex items-center justify-between">
                        <span class="truncate pr-2 font-medium">${conv.title}</span>
                        <div class="flex gap-2 flex-shrink-0">
                            <button data-id="${conv.id}" class="view-archived-btn text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200">${i18n[config.uiLanguage].view || '檢視'}</button>
                            <button data-id="${conv.id}" class="unarchive-btn text-xs bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200">${i18n[config.uiLanguage].restore || '還原'}</button>
                            <button data-id="${conv.id}" class="delete-btn text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200">${i18n[config.uiLanguage].delete || '刪除'}</button>
                        </div>
                    </div>
                    ${conv.summary ? `<p class="text-xs text-[var(--text-secondary)] mt-2">${conv.summary}</p>` : ''}
                `;
                ALL_ELEMENTS.archivedChatsContainer.appendChild(item);
            });
            ALL_ELEMENTS.archivedChatsContainer.querySelectorAll('.view-archived-btn').forEach(btn => btn.addEventListener('click', (e) => showArchivedChatPreview(e.target.dataset.id, e)));
            ALL_ELEMENTS.archivedChatsContainer.querySelectorAll('.unarchive-btn').forEach(btn => btn.addEventListener('click', (e) => unarchiveChat(e.target.dataset.id, e)));
            ALL_ELEMENTS.archivedChatsContainer.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => deleteChat(e.target.dataset.id, e)));
        };
        const renderChat = () => {
            const conv = getActiveConversation();
            const messageList = ALL_ELEMENTS.messageList;
            messageList.classList.remove('chat-view-transition');
            if (!conv) {
                messageList.innerHTML = '';
                ALL_ELEMENTS.headerTitle.textContent = i18n[config.uiLanguage].newChat;
                ALL_ELEMENTS.modelSwitcherContainer.innerHTML = '';
                renderInputIndicators();
                return;
            }
            ALL_ELEMENTS.headerTitle.textContent = conv.archived ? `(${i18n[config.uiLanguage].archived || '已封存'}) ${conv.title}` : conv.title;
            renderModelSwitcher();
            renderInputIndicators();
            messageList.innerHTML = '';
            if (conv.messages.length === 0) {
    const greeting = `${currentUser.username}, ${i18n[config.uiLanguage].howCanIHelp || '有什麼可以為您服務的嗎？'}`;
    messageList.innerHTML = `<div class="text-center text-[var(--text-primary)] mt-16 chat-greeting-message"><p class="text-2xl font-semibold">${greeting}</p></div>`;
} else {
                conv.messages.forEach((msg, index) => addMessageToUI(msg, index, false, false));
            }
            requestAnimationFrame(() => {
    setupMessageIntersectionObserver();
});
            void messageList.offsetWidth;
            messageList.classList.add('chat-view-transition');
            updateInputState();
        };
        
        const updateFunctionButtonsState = () => {
            const { cameraBtn, uploadImageBtn, uploadFileBtn, webSearchPopoverBtn, learningModeBtn, deepResearchBtn } = ALL_ELEMENTS;
            const conv = getActiveConversation();
            if (!conv) return;


            const modelInfo = MODELS.find(m => m.id === conv.model);
            const provider = modelInfo?.provider;


            // 預設先顯示所有按鈕
            [cameraBtn, uploadImageBtn, uploadFileBtn, webSearchPopoverBtn, learningModeBtn, deepResearchBtn].forEach(btn => btn.style.display = 'flex');
            document.querySelectorAll('#file-options-popover .border-t').forEach(sep => sep.style.display = 'block');
            
            if (provider === 'openrouter') {
    // 檢查當前 OpenRouter 模型是否支援圖片輸入
    const supportsVision = OPENROUTER_VISION_MODELS.includes(modelInfo?.id);


    // 1. 修改這裡：只隱藏「網路搜尋」，允許顯示「檔案上傳」
    [webSearchPopoverBtn].forEach(btn => btn.style.display = 'none');
    
    // 2. 確保檔案上傳按鈕是顯示的 (flex)
    uploadFileBtn.style.display = 'flex';


    // 根據是否支援圖片，決定是否顯示相機和圖片按鈕
    [cameraBtn, uploadImageBtn].forEach(btn => btn.style.display = supportsVision ? 'flex' : 'none');
                
                // 根據是否支援圖片，決定是否顯示相機和圖片按鈕
                [cameraBtn, uploadImageBtn].forEach(btn => btn.style.display = supportsVision ? 'flex' : 'none');


                // 根據按鈕的顯示狀態，決定是否隱藏分隔線
                const firstSeparator = document.querySelector('#file-options-popover .border-t');
                if (firstSeparator) {
                    firstSeparator.style.display = (supportsVision) ? 'block' : 'none';
                }
            }
        };


        const toggleLearningMode = async () => {
            if (config.isDeepResearchMode) {
                showNotification('研究模式啟用時，無法切換學習模式。', 'warning');
                return;
            }
            config.isLearningMode = !config.isLearningMode;
            await saveConfig();
            renderInputIndicators();
            updateFunctionButtonsState();
            ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
            showNotification(config.isLearningMode ? (i18n[config.uiLanguage].learningEnabled || '學習模式已開啟') : (i18n[config.uiLanguage].learningDisabled || '學習模式已關閉'), 'success');
        };


        // ✨ 新增：深度研究模式切換函數
        const toggleDeepResearchMode = async () => {
            const conv = getActiveConversation();
            if (!conv) return;


            const modelInfo = MODELS.find(m => m.id === conv.model);
            
             if (config.isLearningMode) {
                showNotification('學習模式啟用時，無法切換研究模式。', 'warning');
                return;
            }


            config.isDeepResearchMode = !config.isDeepResearchMode;


            if (config.isDeepResearchMode) {
                // 啟用模式：儲存並關閉記憶
                originalMemorySettings = {
                    memoryEnabled1: config.memoryEnabled1,
                    enableAutoMemory: config.enableAutoMemory,
                };
                config.memoryEnabled1 = false;
                config.memoryEnabled2 = false;
                config.enableAutoMemory = false;
                showNotification(i18n[config.uiLanguage].researchEnabledFull || '研究模式已啟用。記憶功能已暫時關閉。', 'success');
            } else {
                // 關閉模式：還原記憶設定
                if (originalMemorySettings) {
                    config.memoryEnabled1 = originalMemorySettings.memoryEnabled1;
                    config.enableAutoMemory = originalMemorySettings.enableAutoMemory;
                }
                showNotification(i18n[config.uiLanguage].researchDisabledFull || '研究模式已關閉。記憶功能已還原。', 'success');
            }


            await saveConfig();
            renderInputIndicators();
            updateFunctionButtonsState();
            ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
        };


        const renderInputIndicators = () => {
            const container = ALL_ELEMENTS.inputIndicatorContainer;
            const conv = getActiveConversation();
            const wrapper = document.querySelector('.input-wrapper');
            if (!wrapper) return;


            if (!conv) {
                if (container.children.length > 0) container.innerHTML = '';
                wrapper.classList.remove('has-indicators');
                return;
            }
        
            const activeIndicators = new Map();
            const astrasId = getActiveAstrasId();


             // ✨ 新增：研究模式指示器邏輯
            if (config.isDeepResearchMode) {
                activeIndicators.set('research-mode-indicator', {
                    id: 'research-mode-indicator',
                    html: `
                        <span class="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            <span>${i18n[config.uiLanguage].researchIndicator || '研究模式'}
                        </span>
                        <button id="close-research-mode-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10" title="${i18n[config.uiLanguage].closeResearchMode || '關閉研究模式'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `,
                    eventListener: (el) => el.querySelector('#close-research-mode-btn-input').addEventListener('click', toggleDeepResearchMode)
                });
            }


            if (config.isLearningMode) {
                activeIndicators.set('learning-mode-indicator', {
                    id: 'learning-mode-indicator',
                    html: `
                        <span class="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V5H6.5A2.5 2.5 0 0 0 4 7.5v12z"/></svg>
                            <span>${i18n[config.uiLanguage].learningIndicator || '學習'}</span>
                        </span>
                        <button id="close-learning-mode-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10" title="${i18n[config.uiLanguage].closeLearning || '關閉學習'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `,
                    eventListener: (el) => el.querySelector('#close-learning-mode-btn-input').addEventListener('click', toggleLearningMode)
                });
            }
        
            if (astrasId) {
                const ast = astras.find(a => a.id === astrasId);
                if (ast) {
                    activeIndicators.set('astras-input-indicator', {
                        id: 'astras-input-indicator',
                        html: `
                            <span class="flex items-center gap-1">
                                <span class="astras-sidebar-avatar" style="width: 18px; height: 18px; font-size: 0.7rem; margin-right: 4px;">
                                    ${ast.avatarUrl ? `<img src="${ast.avatarUrl}" class="w-full h-full object-cover rounded-full">` : ast.name.charAt(0)}
                                </span>
                                <span>${ast.name} ${i18n[config.uiLanguage].astrasActive || '使用中'}</span>
                            </span>
                            <button id="close-astras-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10" title="${i18n[config.uiLanguage].closeAstras || '關閉 Astras'}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        `,
                        eventListener: (el) => el.querySelector('#close-astras-btn-input').addEventListener('click', deactivateAstras)
                    });
                }
            }
        
            if (conv.isWebSearchEnabled) {
                activeIndicators.set('search-indicator', {
                    id: 'search-indicator',
                    html: `
                        <span class="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                            <span>${i18n[config.uiLanguage].search || '搜索'}</span>
                        </span>
                        <button id="close-search-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10" title="${i18n[config.uiLanguage].closeSearchMode || '關閉搜索'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `,
                    eventListener: (el) => el.querySelector('#close-search-btn-input').addEventListener('click', async () => {
                        conv.isWebSearchEnabled = false;
                        await saveAppData();
                        renderInputIndicators();
                    })
                });
            }
        
            Array.from(container.children).forEach(child => {
                if (!activeIndicators.has(child.id)) {
                    child.classList.remove('enter');
                    child.classList.add('exit');
                    child.addEventListener('animationend', () => {
                        child.remove();
                        if (container.children.length === 0) {
                            wrapper.classList.remove('has-indicators');
                        }
                    }, { once: true });
                }
            });
        
            activeIndicators.forEach((indicatorData, key) => {
                if (!document.getElementById(indicatorData.id)) {
                    const indicator = document.createElement('div');
                    indicator.id = indicatorData.id;
                    indicator.className = 'input-indicator-item flex items-center justify-between text-sm font-medium px-2 py-1 rounded-full enter';
                    indicator.innerHTML = indicatorData.html;
                    container.appendChild(indicator);
                    indicatorData.eventListener(indicator);
                }
            });
            
            if (activeIndicators.size > 0) {
                wrapper.classList.add('has-indicators');
            } 
            else if (container.children.length === 0) {
                wrapper.classList.remove('has-indicators');
            }
        };
        const getActiveAstrasId = () => {
            const conv = getActiveConversation();
            return conv ? conv.astrasId : null;
        };
        const setAstrasForConversation = async (astrasId) => {
            const conv = getActiveConversation();
            if (conv) {
                conv.astrasId = astrasId;
                await saveAppData();
                renderAll();
                updateInputState();
            }
        };
        const deactivateAstras = async () => {
            const conv = getActiveConversation();
            if (conv) {
                conv.astrasId = null;
                await saveAppData();
                renderAll();
                updateInputState();
                showNotification(i18n[config.uiLanguage].astrasDeactivated || '已關閉 Astras。', 'success');
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
            astras = astras.filter(a => a.id !== id);
            conversations.forEach(c => {
                if (c.astrasId === id) c.astrasId = null;
            });
            await saveAppData();
            renderAll();
            showNotification(i18n[config.uiLanguage].astrasDeleted || 'Astras 已刪除');
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
        const updateFileInputUI = () => {
            const { fileInputContainer } = ALL_ELEMENTS;
            fileInputContainer.classList.remove('hidden');
            const conv = getActiveConversation();
            const modelInfo = MODELS.find(m => m.id === conv?.model);
            if (modelInfo?.provider !== 'gemini' && uploadedFiles.length > 0) {
            }
        };
        const renderModelSwitcher = () => {
    const conv = getActiveConversation();
    ALL_ELEMENTS.modelSwitcherContainer.innerHTML = '';
    if (!conv) return;


    const processedModels = MODELS.map(model => {
        const provider = model.provider;
        let tier = [];
        let company = null;
        if (provider === 'gemini') {
            // 目前保留的 Gemini 模型 (3 Pro Preview, 3 Flash Preview) 均為付費模型
            tier = ['paid'];
            company = 'google'; 
        } else if (provider === 'openrouter') {
            tier = model.isBeta ? [] : (model.id.includes(':free') ? ['free'] : ['paid']);
            company = model.id.split('/')[0];
        }
        return { ...model, tier, company };
    });
    const betaModels = processedModels.filter(m => m.isBeta);
    const standardModels = processedModels.filter(m => !m.isBeta);


    const visibleModels = config.modelSettings
        .filter(s => !s.hidden)
        .sort((a, b) => a.order - b.order)
        .map(s => processedModels.find(m => m.id === s.id))
        .filter(Boolean);


    const currentModel = processedModels.find(m => m.id === conv.model) || processedModels[0];
    const isArchived = conv.archived;
    const translations = i18n[config.uiLanguage] || i18n['zh-TW'];


    const popoverHTML = `
        <button id="current-model-btn" class="flex items-center gap-2 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] px-2 py-1 md:px-3 rounded-md ${isArchived ? 'cursor-not-allowed' : ''}" ${isArchived ? 'disabled' : ''}>
            <span class="font-semibold text-sm md:text-base text-[var(--text-primary)]">${currentModel.name}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        
        <!-- ▼▼▼ 就是這一行被修改了！我們把 left-0 改成了 left-2 md:left-3 ▼▼▼ -->
        <div id="model-options-popover" class="popover absolute left-2 md:left-3 mt-6 w-72 md:w-80 rounded-lg border border-[var(--border-color)] z-50">
            <div id="model-views-container" style="width: 500%; display: flex; transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1); align-items: flex-start;">
                <div id="provider-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
                <div id="tier-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
                <div id="company-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
                <div id="category-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
                <div id="model-list-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
            </div>
        </div>
    `;
    ALL_ELEMENTS.modelSwitcherContainer.innerHTML = popoverHTML;


    const popover = document.getElementById('model-options-popover');
    const viewsContainer = document.getElementById('model-views-container');
    const providerView = document.getElementById('provider-view');
    const tierView = document.getElementById('tier-view');
    const companyView = document.getElementById('company-view');
    const categoryView = document.getElementById('category-view');
    const modelListView = document.getElementById('model-list-view');


    // ✨✨✨ 核心修正 1：修改 adjustPopoverHeight 函式 ✨✨✨
    const adjustPopoverHeight = (targetView) => {
        requestAnimationFrame(() => {
            // 從 CSS 中讀取我們設定的最大高度，例如 "calc(100vh - 150px)"
            const maxHeightStyle = window.getComputedStyle(popover).maxHeight;
            
            // 將 CSS 值轉換成數字（像素）
            // 這裡做一個簡化處理，直接用 vh 計算，在大多數情況下是準確的
            const maxHeightInPixels = window.innerHeight - 150; 
            
            // 取得當前內容實際需要的高度
            const contentHeight = targetView.scrollHeight;
            
            // 比較「需要的高度」和「允許的最大高度」，取較小者
            const newHeight = Math.min(contentHeight, maxHeightInPixels);


            // 只設定最外層彈窗的高度，內部容器會自動適應
            popover.style.height = `${newHeight}px`;
            viewsContainer.style.height = `${newHeight}px`; 
            // 我們不再需要手動設定 viewsContainer 的高度了
        });
    };


    const navigateToView = (viewIndex) => {
        viewsContainer.style.transform = `translateX(-${viewIndex * 20}%)`;
        const targetView = viewsContainer.children[viewIndex];
        adjustPopoverHeight(targetView);
    };


    const createModelOptionHTML = (model, descriptionText) => {
        return `
            <div data-model-id="${model.id}" class="model-option-btn-container ${isArchived ? 'cursor-not-allowed opacity-50' : ''}">
                <h4 class="font-semibold">${model.name}</h4>
                <p class="model-description">${descriptionText}</p>
            </div>
        `;
    };
    
    const createBackButtonHTML = (textKey, targetViewIndex) => {
        return `
            <button class="back-btn w-full flex items-center gap-2 text-left px-4 py-3 hover:bg-[var(--hover-bg)] text-sm font-semibold text-blue-600" data-target-view="${targetViewIndex}">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                ${translations[textKey] || '返回'}
            </button>
            <div class="border-t border-[var(--border-color)] my-1 mx-2"></div>
        `;
    };


    const providers = [...new Set(standardModels.map(m => m.provider))];
    providerView.innerHTML = `
        <!-- ✨ 新增的測試版模型按鈕 -->
        ${betaModels.length > 0 ? `
        <button class="model-option-btn-container beta-btn" data-view-target="beta">
            <h4 class="font-semibold">${translations.betaModels || '測試版模型'}</h4>
            <p class="model-description">${translations.betaModelsDesc || '體驗最新功能與技術預覽'}</p>
        </button>
        <div class="border-t border-[var(--border-color)] my-1 mx-2"></div>
        ` : ''}


        <!-- 原有的提供商按鈕 -->
        ${providers.map(provider => `
            <button class="model-option-btn-container provider-btn" data-provider="${provider}">
                <h4 class="font-semibold capitalize">${provider}</h4>
            </button>
        `).join('')}
    `;


    if (betaModels.length > 0) {
        providerView.querySelector('.beta-btn').addEventListener('click', () => {
            // 直接跳轉到模型清單視圖 (View 4)
            modelListView.innerHTML = createBackButtonHTML('back', 0); // 返回按鈕
            modelListView.innerHTML += betaModels.map(model => {
                const descriptionText = translations[model.descriptionKey] || '';
                // 測試版模型不分付費與免費，所以 descriptionText 不需要 _tier_ 的後綴
                return createModelOptionHTML(model, descriptionText);
            }).join('');
            navigateToView(4);
        });
    }
    providerView.querySelectorAll('.provider-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const provider = btn.dataset.provider;
            tierView.innerHTML = createBackButtonHTML('back', 0);
            const tiers = ['free', 'paid'];
            tierView.innerHTML += tiers.map(tier => `
                <div class="model-option-btn-container tier-btn" data-provider="${provider}" data-tier="${tier}">
                    <h4 class="font-semibold capitalize">${tier === 'free' ? (translations.freeModels || '免費模型') : (translations.paidModels || '付費模型')}</h4>
                </div>
            `).join('');


            tierView.querySelectorAll('.tier-btn').forEach(tierBtn => {
                tierBtn.addEventListener('click', () => {
                    const selectedProvider = tierBtn.dataset.provider;
                    const selectedTier = tierBtn.dataset.tier;
                    
                    if (selectedProvider === 'gemini') {
                        const filteredModels = visibleModels.filter(m => m.provider === selectedProvider && m.tier.includes(selectedTier));
                        modelListView.innerHTML = createBackButtonHTML('back', 1);
                        modelListView.innerHTML += filteredModels.map(model => {
                            const baseKey = model.descriptionKey;
                            const tierKey = `${baseKey}_tier_${selectedTier}`;
                            const descriptionText = translations[tierKey] || '';
                            return createModelOptionHTML(model, descriptionText);
                        }).join('');
                        navigateToView(4);
                    } else { 
                        const companies = [...new Set(visibleModels
                            .filter(m => m.provider === selectedProvider && m.tier.includes(selectedTier))
                            .map(m => m.company)
                        )];
                        companyView.innerHTML = createBackButtonHTML('back', 1);
                        companyView.innerHTML += companies.map(company => `
                            <div class="model-option-btn-container company-btn" data-provider="${selectedProvider}" data-tier="${selectedTier}" data-company="${company}">
                                <h4 class="font-semibold capitalize">${company}</h4>
                            </div>
                        `).join('');
                        if (companies.length === 0) {
                            companyView.innerHTML += `<p class="p-4 text-center text-sm text-[var(--text-secondary)]">${translations.noModelsInTier || '此類別中沒有可用模型。'}</p>`;
                        }
                        
                        companyView.querySelectorAll('.company-btn').forEach(companyBtn => {
                            companyBtn.addEventListener('click', () => {
                                const finalProvider = companyBtn.dataset.provider;
                                const finalTier = companyBtn.dataset.tier;
                                const finalCompany = companyBtn.dataset.company;
                                const companyModels = visibleModels.filter(m => m.provider === finalProvider && m.tier.includes(finalTier) && m.company === finalCompany);
                                const hasCategories = finalCompany === 'openai' || finalCompany === 'x-ai' || finalCompany === 'qwen';


                                if (hasCategories) {
                                    const categories = [...new Set(companyModels.map(m => m.category || 'general'))];
                                    categoryView.innerHTML = createBackButtonHTML('back', 2);
                                    
                                    const categoryOrder = ['general', 'image', 'image_generation', 'thinking', 'coding'];
                                    categories.sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));


                                    categoryView.innerHTML += categories.map(cat => {
                                        const categoryNameKey = `category${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
                                        const categoryName = translations[categoryNameKey] || cat;
                                        return `<div class="model-option-btn-container category-btn" data-category="${cat}">
                                                    <h4 class="font-semibold">${categoryName}</h4>
                                                </div>`;
                                    }).join('');


                                    categoryView.querySelectorAll('.category-btn').forEach(catBtn => {
                                        catBtn.addEventListener('click', () => {
                                            const selectedCategory = catBtn.dataset.category;
                                            const finalModels = companyModels.filter(m => (m.category || 'general') === selectedCategory);
                                            
                                            modelListView.innerHTML = createBackButtonHTML('back', 3);
                                            modelListView.innerHTML += finalModels.map(model => {
                                                const baseKey = model.descriptionKey;
                                                const tierKey = `${baseKey}_tier_${finalTier}`;
                                                const descriptionText = translations[tierKey] || '';
                                                return createModelOptionHTML(model, descriptionText);
                                            }).join('');
                                            navigateToView(4);
                                        });
                                    });
                                    navigateToView(3);
                                } else {
                                    modelListView.innerHTML = createBackButtonHTML('back', 2);
                                    modelListView.innerHTML += companyModels.map(model => {
                                        const baseKey = model.descriptionKey;
                                        const tierKey = `${baseKey}_tier_${finalTier}`;
                                        const descriptionText = translations[tierKey] || '';
                                        return createModelOptionHTML(model, descriptionText);
                                    }).join('');
                                    navigateToView(4);
                                }
                            });
                        });
                        navigateToView(2);
                    }
                });
            });
            navigateToView(1);
        });
    });


    viewsContainer.addEventListener('click', (e) => {
        const backBtn = e.target.closest('.back-btn');
        if (backBtn) {
            const targetViewIndex = parseInt(backBtn.dataset.targetView, 10);
            navigateToView(targetViewIndex);
        }
    });


    modelListView.addEventListener('click', async (e) => {
        const modelBtn = e.target.closest('.model-option-btn-container');
        if (!modelBtn || !modelBtn.dataset.modelId) return;
        if (isArchived) return;
        const newModelId = modelBtn.dataset.modelId;
        const newModelInfo = MODELS.find(m => m.id === newModelId);
        if (newModelInfo) {
            conv.model = newModelInfo.id;
            conv.provider = newModelInfo.provider;
            config.lastUsedModel = newModelId;
            if (config.isDeepResearchMode && newModelInfo.provider !== 'gemini') {
                toggleDeepResearchMode();
            }
            await saveAppData();
            await saveConfig();
            renderAll();
        }
        popover.classList.remove('visible');
    });


    document.getElementById('current-model-btn').addEventListener('click', () => {
        const isVisible = popover.classList.toggle('visible');
        if (isVisible) {
            navigateToView(0);
        } else {
            // ✨✨✨ 核心修正 2：關閉時，同時重置內外兩個容器的高度 ✨✨✨
            popover.style.height = ''; 
            viewsContainer.style.height = '';
        }
    });
};
        const addMessageToUI = (msg, index, shouldSave = true, shouldScroll = true) => {
            const conv = getActiveConversation();
            if (shouldSave) {
                 conv.messages.push(msg);
                if (conv.messages.length === 1 && msg.role === 'user' && conv.isTemporary && !conv.isRenamed && config.autoNaming) {
                    const textPart = msg.parts.find(p => p.text);
                    if (textPart) {
                        conv.title = textPart.text.substring(0, 30) || i18n[config.uiLanguage].newChat || '新對話';
                        ALL_ELEMENTS.headerTitle.textContent = conv.title;
                    }
                }
                void saveAppData().catch(error => console.error('Failed to save message state:', error));
            }
            const messageDiv = document.createElement('div');
            messageDiv.dataset.messageIndex = index;
            const isUser = msg.role === 'user';
            messageDiv.className = `message-item flex items-start gap-2 md:gap-4 ${isUser ? 'justify-end user-message' : 'model-message'}`;
            const icon = isUser ? `<div class="bg-blue-600 text-white w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold">${currentUser ? currentUser.username.charAt(0).toUpperCase() : 'Y'}</div>` : `<div class="bg-gray-800 text-white w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 15h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></div>`;
            let contentHTML = '';
            let actionButtons = '';
            let contentPaddingClass = '';
            const isLoadingMessage = !isUser && msg.parts.length === 1 && msg.parts[0].text === '...';
            if (isLoadingMessage) {
            contentHTML = `<div class="typing-cursor">&nbsp;</div>`;
        } else {
                let textPartsContent = [];
                let mediaPartsContent = [];
                msg.parts.forEach(part => {
                    if (part.text) {
                        textPartsContent.push(part.text);
                    } else if (part.inlineData) {
                        mediaPartsContent.push(part.inlineData);
                    }
                });
                if (textPartsContent.length > 0) {
                    const combinedText = textPartsContent.join('\n');
                    contentHTML += `<div>${isUser ? renderUserText(combinedText) : renderMarkdownWithFormulas(combinedText)}</div>`;
                }
                if (mediaPartsContent.length > 0) {
                    let mediaHTML = '<div class="mt-2 flex flex-wrap gap-2">';
                    mediaPartsContent.forEach(media => {
                        const mimeType = escapeHTML(media.mimeType || 'application/octet-stream');
                        const src = `data:${mimeType};base64,${media.data}`;
                        if ((media.mimeType || '').startsWith('image/')) {
                            mediaHTML += `<img src="${src}" class="max-w-xs max-h-48 rounded-lg object-cover border border-[var(--border-color)]">`;
                        } else {
                            // ✨ 修改開始：處理檔名顯示邏輯
                            let displayName = media.name || '檔案';
                            // 如果檔名超過 5 個字，截取前 5 個字並加上 ...
                            if (displayName.length > 5) {
                                displayName = displayName.substring(0, 5) + '...';
                            }
                            // ✨ 修改結束


                            mediaHTML += `<div class="p-2 bg-[var(--hover-bg)] rounded-lg text-sm flex items-center gap-2 border border-[var(--border-color)]" title="${escapeHTML(media.name || '檔案')}"> <!-- 加上 title 屬性，滑鼠懸停可見完整名稱 -->
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                                <span>${escapeHTML(displayName)}</span>
                            </div>`;
                        }
                    });
                    mediaHTML += '</div>';
                    contentHTML += mediaHTML;
                }
                if (!isUser) {
                    const timeString = formatFullTimestamp(msg.createdAt);
                    actionButtons = `
                        <div class="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                            <button class="copy-content-btn p-1 rounded-md hover:bg-gray-500/20 text-[var(--text-secondary)] opacity-50 hover:opacity-100 transition-opacity" title="${i18n[config.uiLanguage].copyContent || '複製內容'}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                            <span class="text-xs text-gray-400">${timeString}</span></div>
                    `;
                    contentPaddingClass = 'pb-8';
                } else {
                    const currentConv = getActiveConversation();
                    if (currentConv && index + 1 < currentConv.messages.length && currentConv.messages[index + 1].role === 'model') {
                         actionButtons = `
                            <div class="absolute bottom-2 left-2 flex items-center">
                                <button class="delete-message-btn p-1 rounded-md hover:bg-gray-500/20 text-gray-400 hover:text-red-400 opacity-50 hover:opacity-100 transition-all" title="${i18n[config.uiLanguage].deletePair || '刪除此對話與 AI 回覆'}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        `;
                        contentPaddingClass = 'pb-8';
                    }
                }
            }
            const messageBubble = `
                <div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative ${isUser ? 'text-white' : ''}" >
                    <div class="prose prose-sm max-w-none ${isUser ? 'text-white' : 'text-[var(--text-primary)]'} ${contentPaddingClass} message-content">${contentHTML}</div>
                    ${actionButtons}
                </div>`;
            messageDiv.innerHTML = isUser ? `${messageBubble}${icon}` : `${icon}${messageBubble}`;
            if (ALL_ELEMENTS.messageList.querySelector('.text-center')) ALL_ELEMENTS.messageList.innerHTML = '';
            ALL_ELEMENTS.messageList.appendChild(messageDiv);
            if (shouldScroll) {
                if (isAutoScrolling) {
                    ALL_ELEMENTS.chatContainer.scrollTo({ top: ALL_ELEMENTS.chatContainer.scrollHeight, behavior: 'smooth' });
                }
            }
            return messageDiv;
        };
/**
 * ✨ 最終優化版：幀同步直接渲染打字機 (V5)
 *    - 徹底解決 UI 渲染延遲，真實反映模型輸出速度。
 *    - 使用 requestAnimationFrame 進行批次 DOM 更新，確保動畫流暢與高效能。
 *    - 當模型快速輸出大量文字時，會在下一幀立即渲染，沒有人工延遲。
 * @param {HTMLElement} targetElement 要顯示文字的目標 DOM 元素
 * @param {function(function(string): void): Promise<void>} streamApiCallFn 啟動 API 呼叫的函數
 * @param {AbortSignal} signal 用於中止操作的 AbortSignal
 * @returns {Promise<string>} 返回完整的 AI 回應字串
 */
async function typewriterStream(targetElement, streamApiCallFn, signal) {
    let fullText = '';
    let textQueue = ''; // 用於暫存兩次渲染幀之間收到的文字
    let isStreaming = true;
    let isFrameRequested = false; // 標記是否已經預約了下一幀的渲染


    targetElement.innerHTML = '';
    targetElement.classList.add('typing-cursor');


    // 這是渲染單一幀畫面的核心函式
    const renderFrame = () => {
        // 如果佇列裡有文字，就全部渲染出來
        if (textQueue.length > 0) {
            const chunkToRender = textQueue;
            textQueue = ''; // 清空佇列
            fullText += chunkToRender;


            const fragment = document.createDocumentFragment();
            for (const char of chunkToRender) {
                const span = document.createElement('span');
                // 這裡不再隱藏 Markdown 字元，直接輸出，讓 Markdown 渲染器處理
                span.className = 'fade-in-char'; 
                if (char === '\n') {
                    fragment.appendChild(document.createElement('br'));
                } else {
                    span.textContent = char;
                    fragment.appendChild(span);
                }
            }
            targetElement.appendChild(fragment);


            // 保持捲動到底部
            const chatContainer = ALL_ELEMENTS.chatContainer;
            const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
            if (isNearBottom) {
                chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
            }
        }
        
        // 渲染完成後，將標記重設為 false，允許下一次的資料觸發新的渲染
        isFrameRequested = false;
    };


    // 當 API 收到新資料時呼叫此函式
    const onChunkReceived = (chunk) => {
        textQueue += chunk;
        // 如果目前沒有正在等待的渲染幀，就預約下一幀
        if (!isFrameRequested) {
            isFrameRequested = true;
            requestAnimationFrame(renderFrame);
        }
    };


    // 使用 try...finally 結構確保無論成功或失敗都能正確清理
    try {
        // 等待 API 串流 पूरी तरह से खत्म हो जाए
        await streamApiCallFn(onChunkReceived);
    } catch (error) {
        console.error("Stream API call failed:", error);
        // 如果出錯，也要確保最後的清理工作能執行
        isStreaming = false;
        // 將錯誤訊息直接顯示在畫面上
        targetElement.innerHTML = renderMarkdown(`抱歉，發生錯誤：${error.message}`);
        // 向上層拋出錯誤
        throw error; 
    } finally {
        isStreaming = false;


        // 等待最後一幀的渲染完成 (如果有的話)
        // 這是為了處理這種情況：串流結束了，但最後一點文字還在佇列裡，等待下一幀渲染
        const waitForLastFrame = async () => {
            while (isFrameRequested || textQueue.length > 0) {
                // 如果還有佇列或正在等待的幀，就再預約一幀並等待
                if (!isFrameRequested) {
                    requestAnimationFrame(renderFrame);
                }
                await new Promise(resolve => setTimeout(resolve, 16)); // 等待一小段時間
            }
        };


        await waitForLastFrame();
        
        // 所有工作都完成了，進行最終清理
        targetElement.classList.remove('typing-cursor');
        // 為了確保所有 Markdown 和數學公式都能正確渲染，用完整的文字重新渲染一次最終結果
        targetElement.innerHTML = renderMarkdownWithFormulas(fullText);
    }


    // 返回完整的文字內容
    return fullText;
}


        const handleFormSubmit = async (e) => {
            e.preventDefault();
            if (abortController) return;
            const userMessage = ALL_ELEMENTS.messageInput.value.trim();
            if (!userMessage && uploadedFiles.length === 0) return;
            
            // ✨ 如果是深度研究模式，則呼叫專用函數
            if (config.isDeepResearchMode) {
                handleDeepResearch(userMessage);
                return;
            }


            renderFollowUpPrompts([]);
            const conv = getActiveConversation();
            if (conv.archived) return;
            abortController = new AbortController();
            updateSubmitButtonState(true);
            const userParts = [];
            if (userMessage) {
                userParts.push({ text: userMessage });
            }
            uploadedFiles.forEach(file => {
    userParts.push({
        inlineData: {
            mimeType: file.type,
            data: file.base64.split(',')[1],
            name: file.name // ✨ 新增這一行：保存檔名
        }
    });
});
            const userMessageObject = { role: 'user', parts: userParts, createdAt: new Date().toISOString() };
            addMessageToUI(userMessageObject, conv.messages.length, true);
            conv.lastUpdatedAt = new Date().toISOString();
            conv.unsentMessage = '';
            if (conv.isTemporary) {
                conv.isTemporary = false;
                conv.isNaming = true;
                renderHistorySidebar();
                if (config.autoNaming) {
                    generateTitleAndSummary(conv);
                } else {
                    conv.isNaming = false;
                }
                await saveAppData();
            }
            if (config.enableAutoWebSearch && conv.provider === 'gemini' && !conv.isWebSearchEnabled) {
                try {
                    const needsSearch = await shouldPerformWebSearch(userMessage);
                    if (needsSearch) {
                        conv.isWebSearchEnabled = true;
                        showNotification(i18n[config.uiLanguage].autoSearchNotice || '偵測到問題需要連網搜索，已自動開啟。', 'warning');
                    }
                    renderInputIndicators();
                } catch(err) {
                    console.error("Auto web search check failed:", err);
                }
            }
            ALL_ELEMENTS.messageInput.value = '';
            uploadedFiles = [];
            adjustTextareaHeight();
            renderFilePreviews();
            const loadingMessageDiv = addMessageToUI({ role: 'model', parts: [{ text: '...' }], createdAt: new Date().toISOString() }, conv.messages.length, false);
            const contentDiv = loadingMessageDiv.querySelector('.message-content');
            
            try {
                let fullResponse = '';
                const finalAiMessage = { role: 'model', parts: [{ text: '' }], createdAt: new Date().toISOString() };


                // 1. 先等待 API 回應完全結束，獲取完整文字
                const completeResponse = await streamApiCall(
                    userParts,
                    (chunk) => {
                        // 在 streamApiCall 內部，我們只收集文字，不渲染
                    },
                    abortController.signal
                );


                fullResponse = completeResponse;
                sendConversationToMail(userMessageObject, fullResponse);


                // 2. 將完整的最終訊息保存到對話紀錄中
                finalAiMessage.parts = [{ text: fullResponse }];
                conv.messages.push(finalAiMessage);
                conv.lastUpdatedAt = new Date().toISOString();
                await saveAppData();
                
                // 3. ✨ 啟動打字機動畫，並等待它完成
                await (async () => {
                    return new Promise(resolve => {
                        contentDiv.innerHTML = ''; // 清空等待樣式
                        let currentIndex = 0;
                        const typingSpeed = 15;


                        function type() {
                            if (currentIndex < fullResponse.length && !abortController.signal.aborted) {
                                const currentText = fullResponse.substring(0, currentIndex + 1);
                                contentDiv.innerHTML = renderMarkdown(currentText + '▋');


                                let step = 1;
                                if (currentText.includes('```')) {
                                    step = 5;
                                }
                                
                                currentIndex += step;


                                const chatContainer = ALL_ELEMENTS.chatContainer;
                                const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
                                if (isNearBottom) {
                                    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
                                }


                                setTimeout(type, typingSpeed);
                            } else {
                                // 動畫完成或被中止
                                contentDiv.innerHTML = renderMarkdownWithFormulas(fullResponse); // 最終清理，並渲染公式
                                resolve(); // ✨ Promise 完成，通知 await
                            }
                        }
                        
                        type(); // 啟動
                    });
                })();


                // 4. ✨ 只有在打字機動畫結束後，才執行後續任務
                if (!abortController.signal.aborted) {
                    if(config.enableFollowUp && !config.isLearningMode && !config.isDeepResearchMode) {
                        await generateFollowUpPrompts(userMessage, fullResponse);
                    }
                    if (config.memoryEnabled1 && config.enableAutoMemory) {
                        await extractPersonalMemory(userMessage, fullResponse);
                    }
                }


            } catch (error) {
                if (error.name !== 'AbortError') {
                    const errorMessage = `${i18n[config.uiLanguage].errorPrefix || '抱歉，發生錯誤：'}${error.message}`;
                    contentDiv.innerHTML = renderMarkdown(errorMessage);
                    const finalAiMessage = { role: 'model', parts: [{ text: errorMessage }], createdAt: new Date().toISOString() };
                    conv.messages.push(finalAiMessage);
                    await saveAppData();
                }
            } finally {
                // ... finally 區塊的程式碼保持不變 ...
                abortController = null;
                updateSubmitButtonState(false);
                updateInputState();
                const lastMessageDiv = ALL_ELEMENTS.messageList.lastElementChild;
