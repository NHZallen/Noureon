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
                ALL_ELEMENTS.folderList.appendChild(folderElement);
            });
        };
        const createConversationElement = (conv) => {
            const item = document.createElement('div');
            item.className = `sidebar-item w-full text-left p-3 rounded-lg flex items-center justify-between cursor-pointer ${conv.id === activeConversationId && !isSelectionMode ? 'active' : ''}`;
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
                item.className = 'archived-chat-item';
                item.innerHTML = `
                    <div class="archived-chat-row">
                        <span class="archived-chat-title">${conv.title}</span>
                        <div class="archived-chat-actions">
                            <button data-id="${conv.id}" class="view-archived-btn text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200">${i18n[config.uiLanguage].view || '檢視'}</button>
                            <button data-id="${conv.id}" class="unarchive-btn text-xs bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200">${i18n[config.uiLanguage].restore || '還原'}</button>
                            <button data-id="${conv.id}" class="delete-btn text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200">${i18n[config.uiLanguage].delete || '刪除'}</button>
                        </div>
                    </div>
                    ${conv.summary ? `<p class="archived-chat-summary">${conv.summary}</p>` : ''}
                `;
                ALL_ELEMENTS.archivedChatsContainer.appendChild(item);
            });
            ALL_ELEMENTS.archivedChatsContainer.querySelectorAll('.view-archived-btn').forEach(btn => btn.addEventListener('click', (e) => showArchivedChatPreview(e.target.dataset.id, e)));
            ALL_ELEMENTS.archivedChatsContainer.querySelectorAll('.unarchive-btn').forEach(btn => btn.addEventListener('click', (e) => unarchiveChat(e.target.dataset.id, e)));
            ALL_ELEMENTS.archivedChatsContainer.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => deleteChat(e.target.dataset.id, e)));
        };
        const openCouncilPopoverFromAttachmentMenu = () => {
            renderCouncilControls();
            const toggleButton = document.getElementById('model-council-toggle-btn');
            if (!toggleButton) {
                showNotification(config.uiLanguage === 'en' ? 'Model Council is unavailable while Learning Mode is enabled.' : '學習模式開啟時無法使用模型理事會。', 'warning');
                return;
            }
            closeAllPopovers();
            toggleButton.click();
        };

        const ensureCouncilMenuButton = () => {
            const popover = ALL_ELEMENTS.fileOptionsPopover;
            if (!popover) return null;
            let button = document.getElementById('model-council-menu-btn');
            if (!button) {
                button = document.createElement('button');
                button.id = 'model-council-menu-btn';
                button.type = 'button';
                button.className = 'w-full text-left px-4 py-2 text-sm hover:bg-[var(--hover-bg)] flex items-center gap-3';
                button.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>
                    <span></span>
                `;
                button.addEventListener('click', openCouncilPopoverFromAttachmentMenu);
                const learningButton = document.getElementById('learning-mode-btn');
                popover.insertBefore(button, learningButton || null);
            }
            button.querySelector('span').textContent = getCouncilTexts().title;
            return button;
        };

        const updateFunctionButtonsState = () => {
            const { cameraBtn, uploadImageBtn, uploadFileBtn, webSearchPopoverBtn, learningModeBtn } = ALL_ELEMENTS;
            const conv = getActiveConversation();
            if (!conv) return;


            const modelInfo = normalizeConversationModel(conv);
            const { participants, synthesizer } = getCouncilSelectedModels(conv);
            const councilActive = isCouncilEnabled(conv);
            const provider = modelInfo?.provider;
            const supportsVision = councilActive
                ? participants.some(modelSupportsVision)
                : modelSupportsVision(modelInfo);
            const supportsDocumentUpload = councilActive
                ? true
                : hasSingleDocumentAccess(modelInfo);
            const supportsWebSearch = councilActive
                ? hasCouncilWebSearchAccess(synthesizer || modelInfo)
                : hasSingleWebSearchAccess(modelInfo);


            // 預設先顯示所有按鈕
            [cameraBtn, uploadImageBtn, uploadFileBtn, webSearchPopoverBtn, learningModeBtn].forEach(btn => btn.style.display = 'flex');
            document.querySelectorAll('#file-options-popover .border-t').forEach(sep => sep.style.display = 'block');
            [cameraBtn, uploadImageBtn, uploadFileBtn, webSearchPopoverBtn, learningModeBtn]
                .filter(Boolean)
                .forEach(btn => btn.style.display = 'flex');
            if (webSearchPopoverBtn) {
                webSearchPopoverBtn.style.display = supportsWebSearch ? 'flex' : 'none';
                webSearchPopoverBtn.classList.toggle('is-active', Boolean(conv.isWebSearchEnabled));
            }
            [cameraBtn, uploadImageBtn]
                .filter(Boolean)
                .forEach(btn => btn.style.display = supportsVision ? 'flex' : 'none');
            if (uploadFileBtn) {
                uploadFileBtn.style.display = supportsDocumentUpload ? 'flex' : 'none';
            }
            if (learningModeBtn) {
                learningModeBtn.style.display = councilActive ? 'none' : 'flex';
                learningModeBtn.classList.toggle('is-active', Boolean(config.isLearningMode));
            }
            const councilMenuButton = ensureCouncilMenuButton();
            if (councilMenuButton) {
                councilMenuButton.style.display = (config.isLearningMode && !councilActive) ? 'none' : 'flex';
                councilMenuButton.classList.toggle('is-active', councilActive);
            }
            
            if (!councilActive && provider === 'openrouter') {
    // 檢查當前 OpenRouter 模型是否支援圖片輸入
    const supportsVision = OPENROUTER_VISION_MODELS.includes(modelInfo?.id);


    if (webSearchPopoverBtn) webSearchPopoverBtn.style.display = supportsWebSearch ? 'flex' : 'none';
    
    // 2. 確保檔案上傳按鈕是顯示的 (flex)
    uploadFileBtn.style.display = supportsDocumentUpload ? 'flex' : 'none';


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
            const conv = getActiveConversation();
            if (!config.isLearningMode && isCouncilEnabled(conv)) {
                const message = config.uiLanguage === 'en'
                    ? 'Learning Mode is unavailable while Model Council is enabled.'
                    : '模型理事會模式無法啟用學習模式。';
                showNotification(message, 'warning');
                return;
            }
            config.isLearningMode = !config.isLearningMode;
            await saveConfig();
            renderInputIndicators();
            updateFunctionButtonsState();
            ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
            showNotification(config.isLearningMode ? (i18n[config.uiLanguage].learningEnabled || '學習模式已開啟') : (i18n[config.uiLanguage].learningDisabled || '學習模式已關閉'), 'success');
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


            if (config.isLearningMode) {
                activeIndicators.set('learning-mode-indicator', {
                    id: 'learning-mode-indicator',
                    html: `
                        <span class="input-indicator-content flex items-center gap-2">
                            <span class="input-indicator-leading">
                                <svg class="input-indicator-mode-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V5H6.5A2.5 2.5 0 0 0 4 7.5v12z"/></svg>
                            </span>
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
                            <span class="input-indicator-content flex items-center gap-2">
                                <span class="input-indicator-leading">
                                    <span class="astras-sidebar-avatar input-indicator-mode-icon" style="width: 18px; height: 18px; font-size: 0.7rem;">
                                    ${ast.avatarUrl ? `<img src="${ast.avatarUrl}" class="w-full h-full object-cover rounded-full">` : ast.name.charAt(0)}
                                </span>
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
                        <span class="input-indicator-content flex items-center gap-2">
                            <span class="input-indicator-leading">
                                <svg class="input-indicator-mode-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                            </span>
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
            if (isCouncilEnabled(conv)) {
                const { council } = getCouncilSelectedModels(conv);
                const texts = getCouncilTexts();
                const validation = getCouncilValidation(conv);
                const councilModeLabel = getCouncilModeLabel(council);
                activeIndicators.set('model-council-indicator', {
                    id: 'model-council-indicator',
                    html: `
                        <span class="input-indicator-content flex items-center gap-2">
                            <span class="input-indicator-leading">
                                <svg class="input-indicator-mode-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>
                            </span>
                            <span>${escapeHTML(councilModeLabel)}</span>
                        </span>
                        <button id="close-model-council-btn-input" class="ml-2 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10" title="${escapeHTML(validation.message || texts.title)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `,
                    eventListener: (el) => el.querySelector('#close-model-council-btn-input').addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        conv.council.enabled = false;
                        await persistCouncilConfig(conv);
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
                const existingIndicator = document.getElementById(indicatorData.id);
                if (!existingIndicator) {
                    const indicator = document.createElement('div');
                    indicator.id = indicatorData.id;
                    indicator.className = 'input-indicator-item flex items-center justify-between text-sm font-medium px-2 py-1 rounded-full enter';
                    indicator.innerHTML = indicatorData.html;
                    indicator.dataset.indicatorHtml = indicatorData.html;
                    container.appendChild(indicator);
                    indicatorData.eventListener(indicator);
                } else if (existingIndicator.dataset.indicatorHtml !== indicatorData.html) {
                    existingIndicator.innerHTML = indicatorData.html;
                    existingIndicator.dataset.indicatorHtml = indicatorData.html;
                    indicatorData.eventListener(existingIndicator);
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
        const seedCouncilParticipants = (conv) => {
            if (!conv) return;
            conv.council = normalizeCouncilConfig(conv.council);
            if (conv.council.participantModelIds.length > 0) return;
            const visibleModels = getVisibleCouncilModels();
            const seedIds = [];
            if (conv.model && MODELS.some(model => model.id === conv.model)) {
                seedIds.push(conv.model);
            }
            visibleModels.forEach(model => {
                if (seedIds.length < COUNCIL_MIN_MODELS && !seedIds.includes(model.id)) {
                    seedIds.push(model.id);
                }
            });
            conv.council.participantModelIds = seedIds.slice(0, COUNCIL_MAX_MODELS);
        };
        const persistCouncilConfig = async (conv, shouldRender = true) => {
            if (!conv) return;
            conv.council = normalizeCouncilConfig(conv.council);
            if (conv.council.enabled && config.isLearningMode) {
                config.isLearningMode = false;
            }
            config.lastCouncilConfig = cloneCouncilConfig(conv.council);
            await saveAppData();
            await saveConfig();
            if (shouldRender) {
                renderModelSwitcher();
                renderCouncilControls();
                renderInputIndicators();
                updateInputState();
                updateApiKeyWarningBadge();
            }
        };
        const getCouncilModeLabel = (council = {}) => {
            const texts = getCouncilTexts();
            const modeLabel = council.mode === 'deliberation' ? texts.deliberation : texts.consensus;
            if (config.uiLanguage === 'en') return `Council ${modeLabel}`;
            if (config.uiLanguage === 'fr') return `Conseil ${modeLabel}`;
            return `理事會${modeLabel}`;
        };
        const getCouncilModelList = (conv) => {
            const visibleModels = getVisibleCouncilModels();
            const selectedIds = new Set([
                ...(conv?.council?.participantModelIds || []),
                conv?.council?.synthesizerModelId
            ].filter(Boolean));
            selectedIds.forEach(modelId => {
                const model = MODELS.find(item => item.id === modelId);
                if (model && !visibleModels.some(item => item.id === model.id)) {
                    visibleModels.push(model);
                }
            });
            return visibleModels;
        };
        const renderCouncilControls = () => {
            const inputControls = ALL_ELEMENTS.fileInputContainer?.parentElement;
            if (!inputControls) return;
            let container = document.getElementById('model-council-control');
            const existingPopover = container?.querySelector('#model-council-popover');
            const wasVisible = existingPopover?.classList.contains('visible') || false;
            const existingScrollArea = existingPopover?.querySelector('.council-popover-scroll-area');
            const previousScrollTop = wasVisible ? (existingScrollArea?.scrollTop || 0) : 0;
            const previousModelSearch = wasVisible ? (existingPopover?.querySelector('[data-council-model-search]')?.value || '') : '';
            if (!container) {
                container = document.createElement('div');
                container.id = 'model-council-control';
            }
            if (container.parentElement !== inputControls || container.previousElementSibling !== ALL_ELEMENTS.fileInputContainer) {
                ALL_ELEMENTS.fileInputContainer.insertAdjacentElement('afterend', container);
            }
            const conv = getActiveConversation();
            if (!conv) {
                container.innerHTML = '';
                return;
            }
            conv.council = normalizeCouncilConfig(conv.council);
            if (config.isLearningMode && !conv.council.enabled) {
                container.innerHTML = '';
                return;
            }
            const texts = getCouncilTexts();
            const runtimeTexts = getCouncilRuntimeTexts();
            const validation = getCouncilValidation(conv);
            const modelList = getCouncilModelList(conv);
            const selectedParticipants = getModelsByIds(conv.council.participantModelIds);
            const synthesizer = MODELS.find(model => model.id === conv.council.synthesizerModelId);
            const participantSummary = formatCouncilModelSummary(selectedParticipants, 2);
            const isLocked = isCouncilRunning && conv.council.enabled;
            const lockAttr = isLocked ? 'disabled' : '';
            const enabledClass = conv.council.enabled ? 'is-enabled' : '';
            const statusText = conv.council.enabled
                ? (validation.ok ? `${texts.ready} · ${selectedParticipants.length} · ${synthesizer?.name || texts.selectSynthesizer}` : validation.message)
                : texts.disabled;
            const doneText = i18n[config.uiLanguage]?.done || i18n[config.uiLanguage]?.confirm || '完成';
            const dotClass = conv.council.enabled ? (validation.ok ? 'ready' : 'warning') : 'off';
            const supportsCouncilSearch = hasCouncilWebSearchAccess(synthesizer || normalizeConversationModel(conv));
            const searchDisabled = isLocked || conv.archived || !supportsCouncilSearch;
            const searchDisabledAttr = searchDisabled ? 'disabled' : '';
            const searchActiveClass = conv.isWebSearchEnabled ? 'is-active' : '';
            const searchTitle = supportsCouncilSearch
                ? (conv.isWebSearchEnabled ? runtimeTexts.searchEnabledNote : (i18n[config.uiLanguage]?.search || 'Search'))
                : (i18n[config.uiLanguage]?.webSearchNotAvailable || 'Web search is not available for this model.');
            const priceLabel = config.uiLanguage === 'en' ? 'Price' : '價格';
            const visionLabel = config.uiLanguage === 'en' ? 'Vision' : '視覺';
            const documentLabel = config.uiLanguage === 'en' ? 'Documents' : '文件';
            const searchLabel = i18n[config.uiLanguage]?.search || '搜尋';
            const modelSearchPlaceholder = config.uiLanguage === 'en' ? 'Search models' : '\u641c\u5c0b\u6a21\u578b';
            const providerLabel = config.uiLanguage === 'en' ? 'Provider' : '供應商';
            const abilityLabel = config.uiLanguage === 'en' ? 'Capabilities' : '能力';
            const noExtraAbilityLabel = config.uiLanguage === 'en' ? 'Text / file' : '文字 / 文件';
            const providerCountLabel = config.uiLanguage === 'en' ? 'providers' : '供應商';
            const makeModelTooltip = (model) => {
                const abilities = [
                    noExtraAbilityLabel,
                    modelSupportsVision(model) ? visionLabel : '',
                    modelSupportsDocumentUpload(model) ? documentLabel : '',
                    modelSupportsWebSearch(model) ? searchLabel : ''
                ].filter(Boolean).join(' · ');
                return `${model.name}\n${providerLabel}: ${getProviderLabel(model.provider)}\n${abilityLabel}: ${abilities}\n${priceLabel}: ${getModelPriceLabel(model)}`;
            };
            const createCouncilModelMetaHTML = (model) => `
                <span class="council-model-badges">
                    ${modelSupportsVision(model) ? `<span class="council-capability-badge" title="${escapeHTML(visionLabel)}"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>${escapeHTML(visionLabel)}</span>` : ''}
                    ${modelSupportsDocumentUpload(model) ? `<span class="council-capability-badge">${escapeHTML(documentLabel)}</span>` : ''}
                    ${modelSupportsWebSearch(model) ? `<span class="council-capability-badge">${escapeHTML(searchLabel)}</span>` : ''}
                </span>
                <small>${escapeHTML(getProviderLabel(model.provider))} · ${escapeHTML(priceLabel)}: ${escapeHTML(getModelPriceLabel(model))}</small>
            `;
            const buildCouncilModelGroups = (models) => {
                const groups = new Map();
                models.forEach(model => {
                    const key = getModelFamilyKey(model);
                    if (!groups.has(key)) {
                        groups.set(key, {
                            key,
                            name: getModelFamilyName(model) || model.name,
                            variants: []
                        });
                    }
                    groups.get(key).variants.push(model);
                });
                return Array.from(groups.values()).map(group => ({
                    ...group,
                    variants: group.variants.sort((a, b) => {
                        const providerCompare = getProviderLabel(a.provider).localeCompare(getProviderLabel(b.provider));
                        return providerCompare || a.name.localeCompare(b.name);
                    })
                }));
            };
            const modelGroups = buildCouncilModelGroups(modelList)
                .sort((a, b) => a.name.localeCompare(b.name));
            const renderSelectableCouncilModelRow = (model, type) => {
                const isParticipant = type === 'participant';
                const checked = conv.council.participantModelIds.includes(model.id);
                const selected = isParticipant ? checked : conv.council.synthesizerModelId === model.id;
                const maxed = isParticipant && !checked && conv.council.participantModelIds.length >= COUNCIL_MAX_MODELS;
                const disabled = isLocked || maxed;
                const tooltip = makeModelTooltip(model);
                const searchText = `${model.name} ${getProviderLabel(model.provider)} ${getModelApiId(model)}`.toLowerCase();
                return `
                    <label class="council-model-row ${selected ? 'selected' : ''} ${disabled ? 'is-disabled' : ''}" title="${escapeHTML(tooltip)}" data-council-search-text="${escapeHTML(searchText)}">
                        <input type="${isParticipant ? 'checkbox' : 'radio'}" ${isParticipant ? '' : 'name="council-synthesizer"'} ${isParticipant ? `data-council-participant="${escapeHTML(model.id)}"` : `data-council-synthesizer="${escapeHTML(model.id)}"`} ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                        <span>
                            <strong>${escapeHTML(model.name)}</strong>
                            ${createCouncilModelMetaHTML(model)}
                        </span>
                    </label>
                `;
            };
            const renderCouncilModelGroups = (type) => modelGroups.map(group => {
                if (group.variants.length === 1) {
                    return renderSelectableCouncilModelRow(group.variants[0], type);
                }
                const providerNames = group.variants.map(model => getProviderLabel(model.provider)).join(' · ');
                const groupSearchText = `${group.name} ${providerNames}`.toLowerCase();
                return `
                    <div class="council-model-group" data-council-group-search-text="${escapeHTML(groupSearchText)}">
                        <div class="council-model-family-row">
                            <span>
                                <strong>${escapeHTML(group.name)}</strong>
                                <small>${escapeHTML(String(group.variants.length))} ${escapeHTML(providerCountLabel)}</small>
                            </span>
                            <span class="council-family-provider-list">${escapeHTML(providerNames)}</span>
                        </div>
                        <div class="council-provider-variant-list">
                            ${group.variants.map(model => renderSelectableCouncilModelRow(model, type)).join('')}
                        </div>
                    </div>
                `;
            }).join('');
            const modelRows = renderCouncilModelGroups('participant');
            const synthesizerRows = renderCouncilModelGroups('synthesizer');
            container.innerHTML = `
                <div class="model-council-bar ${enabledClass} ${isLocked ? 'is-locked' : ''}">
                    <button type="button" id="model-council-toggle-btn" class="model-council-toggle" aria-expanded="${wasVisible ? 'true' : 'false'}" title="${escapeHTML(statusText)}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>
                        <span class="council-toggle-label">${texts.title}</span>
                        ${participantSummary ? `<span class="council-toggle-models">${escapeHTML(participantSummary)}</span>` : ''}
                        <span class="model-council-dot ${dotClass}" aria-hidden="true"></span>
                    </button>
                    <div id="model-council-popover" class="popover model-council-popover ${wasVisible ? 'visible' : ''}">
                        <div class="council-popover-sticky-controls">
                        <div class="council-popover-header">
                            <div>
                                <h3 class="council-popover-title">${texts.title}</h3>
                                <p class="model-council-status ${validation.ok || !conv.council.enabled ? '' : 'warning'}">${escapeHTML(statusText)}</p>
                            </div>
                            <button type="button" id="model-council-close-btn" class="council-popover-close" title="${escapeHTML(doneText)}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div class="council-popover-header compact council-config-row">
                            <div class="council-mode-cluster">
                                <button type="button" id="model-council-enabled" class="council-enable-pill ${conv.council.enabled ? 'is-active' : ''}" aria-pressed="${conv.council.enabled ? 'true' : 'false'}" ${lockAttr}>
                                    ${texts.enable}
                                </button>
                                <div class="council-mode-tabs">
                                    <button type="button" class="${conv.council.mode === 'consensus' ? 'active' : ''}" data-council-mode="consensus" ${lockAttr}>${texts.consensus}</button>
                                    <button type="button" class="${conv.council.mode === 'deliberation' ? 'active' : ''}" data-council-mode="deliberation" ${lockAttr}>${texts.deliberation}</button>
                                </div>
                            </div>
                            <div class="council-action-cluster">
                                <button type="button" id="model-council-search-toggle" class="council-search-toggle ${searchActiveClass}" aria-pressed="${conv.isWebSearchEnabled ? 'true' : 'false'}" title="${escapeHTML(searchTitle)}" ${searchDisabledAttr}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                    <span>${escapeHTML(searchLabel)}</span>
                                </button>
                                <label class="council-model-search-field" title="${escapeHTML(modelSearchPlaceholder)}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                                    <input type="search" data-council-model-search value="${escapeHTML(previousModelSearch)}" placeholder="${escapeHTML(modelSearchPlaceholder)}" aria-label="${escapeHTML(modelSearchPlaceholder)}" autocomplete="off">
                                </label>
                            </div>
                        </div>
                            ${isLocked ? `<p class="council-search-note is-locked">${escapeHTML(runtimeTexts.councilLocked)}</p>` : ''}
                        </div>
                        <div class="council-popover-scroll-area">
                        <div class="council-section">
                            <div class="council-section-title">${texts.participants} (${selectedParticipants.length}/${COUNCIL_MAX_MODELS})</div>
                            <div class="council-model-list">${modelRows}</div>
                        </div>
                        <div class="council-section">
                            <div class="council-section-title">${texts.synthesizer}</div>
                            <div class="council-model-list">${synthesizerRows}</div>
                        </div>
                        <div class="council-popover-bottom">
                        <label class="council-raw-row">
                            <input type="checkbox" id="model-council-show-raw" ${conv.council.showRawResponses ? 'checked' : ''} ${lockAttr}>
                            <span>${texts.rawNotes}</span>
                        </label>
                        <label class="council-raw-row">
                            <input type="checkbox" id="model-council-show-comparison" ${conv.council.showComparisonTable ? 'checked' : ''} ${lockAttr}>
                            <span>${runtimeTexts.comparisonToggle}</span>
                        </label>
                        <p class="council-validation ${validation.ok || !conv.council.enabled ? '' : 'warning'}">${escapeHTML(conv.council.enabled ? validation.message : texts.required)}</p>
                        <div class="council-popover-footer">
                            <button type="button" id="model-council-done-btn" class="council-done-btn">${escapeHTML(doneText)}</button>
                        </div>
                        </div>
                        </div>
                    </div>
                </div>
            `;
            const popover = container.querySelector('#model-council-popover');
            const scrollArea = container.querySelector('.council-popover-scroll-area');
            const toggleButton = container.querySelector('#model-council-toggle-btn');
            const updateCouncilStickyOffset = () => {
                const stickyControls = popover.querySelector('.council-popover-sticky-controls');
                popover.style.setProperty('--council-sticky-offset', `${stickyControls?.offsetHeight || 0}px`);
            };
            requestAnimationFrame(updateCouncilStickyOffset);
            if (wasVisible) {
                requestAnimationFrame(() => {
                    if (scrollArea) scrollArea.scrollTop = previousScrollTop;
                    updateCouncilStickyOffset();
                });
            }
            const closeCouncilPopover = () => {
                popover.classList.remove('visible');
                toggleButton.setAttribute('aria-expanded', 'false');
            };
            const modelSearchInput = container.querySelector('[data-council-model-search]');
            const applyCouncilModelSearch = () => {
                const query = (modelSearchInput?.value || '').trim().toLowerCase();
                container.querySelectorAll('.council-model-list > .council-model-row[data-council-search-text]').forEach(row => {
                    const matches = !query || (row.dataset.councilSearchText || '').includes(query);
                    row.hidden = !matches;
                });
                container.querySelectorAll('.council-model-group').forEach(group => {
                    const groupMatches = !!query && (group.dataset.councilGroupSearchText || '').includes(query);
                    let hasVisibleVariant = false;
                    group.querySelectorAll('.council-model-row[data-council-search-text]').forEach(row => {
                        const matches = !query || groupMatches || (row.dataset.councilSearchText || '').includes(query);
                        row.hidden = !matches;
                        hasVisibleVariant = hasVisibleVariant || matches;
                    });
                    group.hidden = !!query && !groupMatches && !hasVisibleVariant;
                });
            };
            modelSearchInput?.addEventListener('input', applyCouncilModelSearch);
            applyCouncilModelSearch();
            toggleButton.addEventListener('click', () => {
                const wasVisibleNow = popover.classList.contains('visible');
                closeAllPopovers();
                popover.classList.toggle('visible', !wasVisibleNow);
                if (!wasVisibleNow) {
                    requestAnimationFrame(() => {
                        if (scrollArea) scrollArea.scrollTop = 0;
                    });
                }
                toggleButton.setAttribute('aria-expanded', String(!wasVisibleNow));
            });
            container.querySelector('#model-council-close-btn').addEventListener('click', closeCouncilPopover);
            container.querySelector('#model-council-done-btn').addEventListener('click', closeCouncilPopover);
            container.querySelector('#model-council-enabled').addEventListener('click', async () => {
                if (isCouncilRunning) {
                    showNotification(runtimeTexts.councilLocked, 'warning');
                    renderCouncilControls();
                    return;
                }
                conv.council.enabled = !conv.council.enabled;
                if (conv.council.enabled) seedCouncilParticipants(conv);
                await persistCouncilConfig(conv);
                renderCouncilControls();
                if (conv.council.enabled && !conv.isWebSearchEnabled) {
                    showNotification(runtimeTexts.searchManualNotice, 'warning');
                }
            });
            container.querySelector('#model-council-search-toggle')?.addEventListener('click', async () => {
                if (isCouncilRunning) {
                    showNotification(runtimeTexts.councilLocked, 'warning');
                    renderCouncilControls();
                    return;
                }
                if (!supportsCouncilSearch || conv.archived) {
                    showNotification(i18n[config.uiLanguage]?.webSearchNotAvailable || '當前模型不支援或無法使用聯網搜尋。', 'warning');
                    return;
                }
                conv.isWebSearchEnabled = !conv.isWebSearchEnabled;
                await saveAppData();
                renderCouncilControls();
                renderInputIndicators();
            });
            container.querySelectorAll('[data-council-mode]').forEach(button => {
                button.addEventListener('click', async () => {
                    if (isCouncilRunning) {
                        showNotification(runtimeTexts.councilLocked, 'warning');
                        return;
                    }
                    conv.council.mode = button.dataset.councilMode;
                    await persistCouncilConfig(conv);
                    renderCouncilControls();
                });
            });
            container.querySelectorAll('[data-council-participant]').forEach(input => {
                input.addEventListener('change', async () => {
                    if (isCouncilRunning) {
                        showNotification(runtimeTexts.councilLocked, 'warning');
                        renderCouncilControls();
                        return;
                    }
                    const modelId = input.dataset.councilParticipant;
                    const nextIds = new Set(conv.council.participantModelIds);
                    if (input.checked) {
                        if (nextIds.size >= COUNCIL_MAX_MODELS) {
                            showNotification(texts.tooMany, 'warning');
                            renderCouncilControls();
                            return;
                        }
                        nextIds.add(modelId);
                    } else {
                        nextIds.delete(modelId);
                    }
                    conv.council.participantModelIds = Array.from(nextIds);
                    await persistCouncilConfig(conv);
                });
            });
            container.querySelectorAll('[data-council-synthesizer]').forEach(input => {
                input.addEventListener('change', async () => {
                    if (isCouncilRunning) {
                        showNotification(runtimeTexts.councilLocked, 'warning');
                        renderCouncilControls();
                        return;
                    }
                    if (!input.checked) return;
                    conv.council.synthesizerModelId = input.dataset.councilSynthesizer;
                    await persistCouncilConfig(conv);
                });
            });
            container.querySelector('#model-council-show-raw').addEventListener('change', async (event) => {
                if (isCouncilRunning) {
                    showNotification(runtimeTexts.councilLocked, 'warning');
                    renderCouncilControls();
                    return;
                }
                conv.council.showRawResponses = event.target.checked;
                await persistCouncilConfig(conv);
            });
            container.querySelector('#model-council-show-comparison').addEventListener('change', async (event) => {
                if (isCouncilRunning) {
                    showNotification(runtimeTexts.councilLocked, 'warning');
                    renderCouncilControls();
                    return;
                }
                conv.council.showComparisonTable = event.target.checked;
                await persistCouncilConfig(conv);
            });
        };
        import { createResponseProgressRenderers } from '/src/app/legacy-runtime/features/response-progress-renderers.js';
        const {
            renderCouncilProgress,
            renderSingleModelError,
            renderSingleModelProgress
        } = createResponseProgressRenderers({
            escapeHTML,
            getUiLanguage: () => config.uiLanguage,
            getCouncilRuntimeTexts
        });
        const isCouncilDeferredSectionVisible = (text = '') => /<details\b|共識與差異整理|模型理事會紀錄|Model council record|Compte rendu du conseil/i.test(String(text || ''));
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
            tier = getModelTiers(model);
            company = 'google'; 
        } else if (provider === 'openrouter') {
            tier = getModelTiers(model);
            company = model.id.split('/')[0];
        } else if (provider === 'stepfun') {
            tier = getModelTiers(model);
            company = 'stepfun';
        } else if (provider === 'nvidia') {
            tier = getModelTiers(model);
            company = getModelApiId(model).split('/')[0];
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

    if (isCouncilEnabled(conv)) {
        const { council } = getCouncilSelectedModels(conv);
        const texts = getCouncilTexts();
        const councilModeLabel = getCouncilModeLabel(council);
        ALL_ELEMENTS.modelSwitcherContainer.innerHTML = `
            <button id="current-model-btn" class="model-switcher-council-btn flex items-center gap-2 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] px-2 py-1 md:px-3 rounded-md ${isArchived ? 'cursor-not-allowed' : ''}" ${isArchived ? 'disabled' : ''}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>
                <span class="model-switcher-council-copy">
                    <span class="font-semibold text-sm md:text-base text-[var(--text-primary)]">${texts.title}</span>
                    <small>${escapeHTML(councilModeLabel)}</small>
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
        `;
        document.getElementById('current-model-btn')?.addEventListener('click', () => {
            if (isArchived) return;
            renderCouncilControls();
            const popover = document.getElementById('model-council-popover');
            const toggleButton = document.getElementById('model-council-toggle-btn');
            if (!popover || !toggleButton) return;
            closeAllPopovers();
            popover.classList.add('visible');
            toggleButton.setAttribute('aria-expanded', 'true');
            requestAnimationFrame(() => {
                popover.scrollTop = 0;
            });
        });
        return;
    }


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


    const modelVisionLabel = config.uiLanguage === 'zh-TW' ? '視覺' : 'Vision';
    const modelDocumentLabel = config.uiLanguage === 'zh-TW' ? '文件' : 'Documents';
    const translatedDocumentLabel = config.uiLanguage === 'zh-TW' ? '轉譯文件' : 'Translated documents';
    const modelSearchLabel = i18n[config.uiLanguage]?.search || '搜尋';
    const createModelRetirementHTML = (model) => {
        const retirementLabel = getModelRetirementLabel(model);
        return retirementLabel ? `<span class="model-retirement-date">${escapeHTML(retirementLabel)}</span>` : '';
    };
    const createVisionBadgeHTML = (model) => {
        if (!modelSupportsVision(model)) return '';
        return `
            <span class="model-vision-badge" title="${escapeHTML(modelVisionLabel)}" aria-label="${escapeHTML(modelVisionLabel)}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </span>
        `;
    };
    const createModelBadgesHTML = (model) => `
        <div class="model-option-meta-row">
            ${modelSupportsVision(model) ? `<span class="model-capability-pill">${createVisionBadgeHTML(model)}${escapeHTML(modelVisionLabel)}</span>` : ''}
            ${modelSupportsDocumentUpload(model) ? `<span class="model-capability-pill">${escapeHTML(modelDocumentLabel)}</span>` : (getSingleDocumentTranslatorModel() ? `<span class="model-capability-pill">${escapeHTML(translatedDocumentLabel)}</span>` : '')}
            ${modelSupportsWebSearch(model) ? `<span class="model-capability-pill">${escapeHTML(modelSearchLabel)}</span>` : ''}
        </div>
    `;

    const createModelOptionHTML = (model, descriptionText) => {
        return `
            <div data-model-id="${model.id}" class="model-option-btn-container ${isArchived ? 'cursor-not-allowed opacity-50' : ''}">
                <h4 class="font-semibold model-option-title"><span class="model-name-text">${model.name}</span>${createModelRetirementHTML(model)}</h4>
                ${createModelBadgesHTML(model)}
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
            const tiers = [...new Set(visibleModels
                .filter(model => model.provider === provider)
                .flatMap(model => model.tier || []))]
                .sort((a, b) => (a === 'free' ? -1 : 1) - (b === 'free' ? -1 : 1));
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
        const {
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
            updateInputState: () => updateInputState(),
            scheduleFrame: (callback) => requestAnimationFrame(callback),
            isAutoScrolling: () => isAutoScrolling
        });
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
    let isStreaming = true;


    targetElement.innerHTML = '';
    targetElement.classList.add('typing-cursor');


    const typewriterFrameQueue = createStreamingTextFrameQueue({
        drainText: (chunkToRender) => {
            fullText += chunkToRender;

            const fragment = document.createDocumentFragment();
            for (const char of chunkToRender) {
                const span = document.createElement('span');
                span.className = 'fade-in-char'; 
                if (char === '\n') {
                    fragment.appendChild(document.createElement('br'));
                } else {
                    span.textContent = char;
                    fragment.appendChild(span);
                }
            }
            targetElement.appendChild(fragment);

            const chatContainer = ALL_ELEMENTS.chatContainer;
            const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
            if (isNearBottom) {
                chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
            }
        },
        scheduleFrame: (callback) => requestAnimationFrame(callback),
        waitForFrame: () => new Promise(resolve => setTimeout(resolve, 16))
    });


    // 當 API 收到新資料時呼叫此函式
    const onChunkReceived = (chunk) => {
        typewriterFrameQueue.enqueue(chunk);
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


        await typewriterFrameQueue.flushUntilIdle();
        
        // 所有工作都完成了，進行最終清理
        targetElement.classList.remove('typing-cursor');
        // 為了確保所有 Markdown 和數學公式都能正確渲染，用完整的文字重新渲染一次最終結果
        targetElement.innerHTML = renderMarkdownWithFormulas(fullText);
    }


    // 返回完整的文字內容
    return fullText;
}

const renderIncrementalResponse = (targetElement, text, options = {}) => {
    const openKeys = options.preserveCouncilDetails ? getOpenCouncilDetailKeys(targetElement) : null;
    targetElement.innerHTML = options.final
        ? renderMarkdownWithFormulas(text)
        : renderMarkdown(`${text}${options.cursor ? '|' : ''}`);
    restoreOpenCouncilDetails(targetElement, openKeys);
};

const playbackTypewriterResponse = (targetElement, fullResponse, signal, preserveCouncilDetails = false) => new Promise(resolve => {
    targetElement.innerHTML = '';
    const playbackController = createTypewriterPlaybackController({
        text: fullResponse,
        signal,
        schedule: (callback, delay) => setTimeout(callback, delay),
        onStep: ({ currentText }) => {
            renderIncrementalResponse(targetElement, currentText, { cursor: true, preserveCouncilDetails });
            const chatContainer = ALL_ELEMENTS.chatContainer;
            const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
            const pauseCouncilAutoScroll = preserveCouncilDetails && isCouncilDeferredSectionVisible(currentText);
            if (!pauseCouncilAutoScroll && isNearBottom) {
                chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
            }
        },
        onFinish: () => {
            renderIncrementalResponse(targetElement, fullResponse, { final: true, preserveCouncilDetails });
            resolve();
        }
    });
    playbackController.start();
});

const isChatNearBottom = (threshold = 16) => {
    const chatContainer = ALL_ELEMENTS.chatContainer;
    if (!chatContainer) return false;
    return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight <= threshold;
};

const keepChatPositionAfterRender = (shouldStick, previousTop) => {
    const chatContainer = ALL_ELEMENTS.chatContainer;
    if (!chatContainer) return;
    if (shouldStick) {
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
    } else {
        chatContainer.scrollTop = previousTop;
    }
};

const {
    createStreamingMarkdownRenderer,
    streamMarkdownResponse
} = createStreamingMarkdownFeature({
    document,
    renderMarkdown,
    renderMarkdownWithFormulas,
    isChatNearBottom,
    getChatScrollTop: () => ALL_ELEMENTS.chatContainer?.scrollTop || 0,
    keepChatPositionAfterRender,
    scheduleFrame: (callback) => requestAnimationFrame(callback),
    waitForFrame: () => new Promise(resolve => setTimeout(resolve, 16)),
    getStreamErrorText: (error) => `?望?嚗?隤歹?${error.message}`,
    logError: (...args) => console.error(...args)
});

const playbackStreamingMarkdownResponse = (targetElement, fullResponse, signal, preserveCouncilDetails = false) => new Promise(resolve => {
    const renderer = createStreamingMarkdownRenderer(targetElement, { preserveCouncilDetails });
    const playbackController = createTypewriterPlaybackController({
        text: fullResponse,
        signal,
        schedule: (callback, delay) => setTimeout(callback, delay),
        getStep: ({ source, currentIndex }) => source.includes('```', Math.max(0, currentIndex - 3)) ? 5 : 1,
        onStep: ({ chunk }) => {
            renderer.appendText(chunk);
        },
        onFinish: () => {
            renderer.finish({ renderFormulas: true });
            resolve();
        }
    });
    playbackController.start();
});

const startProgressTicker = (tick, intervalMs = 250) => {
    let stopped = false;
    let timerId = null;
    const run = () => {
        if (stopped) return;
        tick();
        timerId = setTimeout(run, intervalMs);
    };
    timerId = setTimeout(run, intervalMs);
    return () => {
        stopped = true;
        if (timerId) clearTimeout(timerId);
    };
};

const stopProgressTicker = (ticker) => {
    if (typeof ticker === 'function') {
        ticker();
    } else if (ticker) {
        clearInterval(ticker);
        clearTimeout(ticker);
    }
};

const singleModelResponseLifecycle = createSingleModelResponseLifecycle({
    now: () => Date.now(),
    getOutputMode,
    renderSingleModelProgress,
    startProgressTicker,
    stopProgressTicker,
    buildSingleModelTranslatedRequestParts: (...args) => buildSingleModelTranslatedRequestParts(...args),
    streamApiCall: (...args) => streamApiCall(...args),
    streamMarkdownResponse,
    playbackStreamingMarkdownResponse,
    renderIncrementalResponse,
    getOpenCouncilDetailKeys,
    restoreOpenCouncilDetails
});

        import { createSubmitInputPreparationLifecycle } from '/src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js';
        const submitInputPreparationLifecycle = createSubmitInputPreparationLifecycle({
            elements: {
                messageInput: ALL_ELEMENTS.messageInput
            },
            getAbortController: () => abortController,
            setAbortController: (value) => { abortController = value; },
            createAbortController: () => new AbortController(),
            getUploadedFiles: () => uploadedFiles,
            setUploadedFiles: (files) => { uploadedFiles = files; },
            getActiveConversation,
            updateSubmitButtonState,
            getCouncilValidation,
            showNotification,
            renderCouncilControls,
            isCouncilEnabled,
            getCouncilRuntimeTexts,
            addMessageToUI,
            renderHistorySidebar,
            getAutoNaming: () => config.autoNaming,
            generateTitleAndSummary,
            saveAppData,
            getAutoWebSearchEnabled: () => config.enableAutoWebSearch,
            shouldPerformWebSearch,
            getAutoSearchNotice: () => i18n[config.uiLanguage].autoSearchNotice || '偵測到問題需要連網搜索，已自動開啟。',
            renderInputIndicators,
            adjustTextareaHeight,
            renderFilePreviews,
            requestFrame: (callback) => requestAnimationFrame(callback)
        });

        const handleFormSubmit = async (e) => {
            e.preventDefault();
            const preparedSubmit = await submitInputPreparationLifecycle.prepareSubmitResponse();
            if (!preparedSubmit.shouldContinue) return;
            const {
                abortController: submitAbortController,
                contentDiv,
                conversation: conv,
                responseUsesCouncil,
                userMessage,
                userMessageObject,
                userParts
            } = preparedSubmit;
            
            try {
                let fullResponse = '';
                const finalAiMessage = { role: 'model', parts: [{ text: '' }], createdAt: new Date().toISOString() };
                let councilMetadata = null;
                let responseRenderedInRealtime = false;


                // 1. 先等待 API 回應完全結束，獲取完整文字
                if (responseUsesCouncil) {
                    const councilResult = await runCouncilResponseRenderLifecycle({
                        contentDiv,
                        userParts,
                        signal: submitAbortController.signal,
                        getOutputMode,
                        runModelCouncil,
                        renderCouncilProgress,
                        createStreamingMarkdownRenderer,
                        appendRendererTextGradually,
                        startProgressTicker,
                        stopProgressTicker,
                        setCouncilRunning: (value) => { isCouncilRunning = value; },
                        renderCouncilControls,
                        renderInputIndicators,
                        requestFrame: (callback) => requestAnimationFrame(callback)
                    });
                    fullResponse = councilResult.fullResponse;
                    responseRenderedInRealtime = councilResult.responseRenderedInRealtime;
                    councilMetadata = councilResult.metadata;
                } else {
                    const modelInfo = normalizeConversationModel(conv);
                    const singleResult = await singleModelResponseLifecycle.run({
                        targetElement: contentDiv,
                        userParts,
                        modelInfo,
                        conversation: conv,
                        signal: submitAbortController.signal,
                        uiLanguage: config.uiLanguage
                    });
                    fullResponse = singleResult.fullResponse;
                    responseRenderedInRealtime = singleResult.responseRenderedInRealtime;
                }
                await finalizeAssistantResponse({
                    fullResponse,
                    finalAiMessage,
                    councilMetadata,
                    includeCouncilMetadata: responseUsesCouncil,
                    conversation: conv,
                    userMessageObject,
                    userMessageText: userMessage,
                    signal: submitAbortController.signal,
                    responseUsesCouncil,
                    responseRenderedInRealtime,
                    targetElement: contentDiv,
                    uiLanguage: config.uiLanguage,
                    memoryEnabled: config.memoryEnabled1,
                    autoMemoryEnabled: config.enableAutoMemory,
                    sendConversationToMail,
                    persistAppData: saveAppData,
                    completeSingleModelView: (options) => singleModelResponseLifecycle.completeView(options),
                    restoreRealtimeCouncilDetails: ({ targetElement }) => restoreOpenCouncilDetails(targetElement, getOpenCouncilDetailKeys(targetElement)),
                    renderRealtimeCouncilFinal: ({ targetElement, fullResponse }) => renderIncrementalResponse(targetElement, fullResponse, { final: true, preserveCouncilDetails: true }),
                    playbackCouncilResponse: ({ targetElement, fullResponse, signal }) => playbackStreamingMarkdownResponse(targetElement, fullResponse, signal, true),
                    extractPersonalMemory
                });
            } catch (error) {
                await persistAssistantResponseError({
                    error,
                    signal: submitAbortController?.signal,
                    conversation: conv,
                    targetElement: contentDiv,
                    errorPrefix: i18n[config.uiLanguage].errorPrefix,
                    fallbackModelName: normalizeConversationModel(conv)?.name || conv.model,
                    getLatestProgress: () => (!responseUsesCouncil && singleModelResponseLifecycle.getLatestProgress()),
                    stopSingleModelLifecycle: () => singleModelResponseLifecycle.stop(),
                    renderError: renderSingleModelError,
                    persistAppData: saveAppData
                });
            } finally {
                const lastMessageElement = runSubmitFinalCleanupLifecycle(
                    () => singleModelResponseLifecycle.stop(),
                    () => { isCouncilRunning = false; abortController = null; },
                    updateSubmitButtonState, updateInputState, renderCouncilControls, renderInputIndicators,
                    () => ALL_ELEMENTS.messageList.lastElementChild
                );
                applyModelMessagePostResponseActions({
                    lastMessageElement,
                    conversation: conv,
                    i18n,
                    uiLanguage: config.uiLanguage,
                    formatTimestamp: formatFullTimestamp
                });
            }
        };
