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
                legacyRuntimeContext.resolveBinding('input.updateInputState')();
            }
        };
        const deactivateAstras = async () => {
            const conv = getActiveConversation();
            if (conv) {
                conv.astrasId = null;
                await saveAppData();
                renderAll();
                legacyRuntimeContext.resolveBinding('input.updateInputState')();
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
                legacyRuntimeContext.resolveBinding('input.updateInputState')();
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
        import { createCouncilControlsLifecycle } from '/src/app/legacy-runtime/features/council-controls-lifecycle.js';
        const { renderCouncilControls } = createCouncilControlsLifecycle({
            closeAllPopovers,
            councilMaxModels: COUNCIL_MAX_MODELS,
            document,
            elements: ALL_ELEMENTS,
            escapeHTML,
            formatCouncilModelSummary,
            getActiveConversation,
            getConfig: () => config,
            getCouncilModelList,
            getCouncilRuntimeTexts,
            getCouncilTexts,
            getCouncilValidation,
            getI18n: () => i18n,
            getIsCouncilRunning: () => isCouncilRunning,
            getModelApiId,
            getModelFamilyKey,
            getModelFamilyName,
            getModelPriceLabel,
            getModelsByIds,
            getProviderLabel,
            hasCouncilWebSearchAccess,
            modelSupportsDocumentUpload,
            modelSupportsVision,
            modelSupportsWebSearch,
            models: MODELS,
            normalizeConversationModel,
            normalizeCouncilConfig,
            persistCouncilConfig,
            renderInputIndicators,
            requestFrame: requestAnimationFrame,
            saveAppData,
            seedCouncilParticipants,
            showNotification
        });
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
        import { createModelSwitcherLifecycle } from '/src/app/legacy-runtime/features/model-switcher-lifecycle.js';
        const { renderModelSwitcher } = createModelSwitcherLifecycle({
            closeAllPopovers,
            document,
            elements: ALL_ELEMENTS,
            escapeHTML,
            getActiveConversation,
            getConfig: () => config,
            getCouncilModeLabel,
            getCouncilSelectedModels,
            getCouncilTexts,
            getI18n: () => i18n,
            getModelApiId,
            getModelRetirementLabel,
            getModelTiers,
            getSingleDocumentTranslatorModel,
            isCouncilEnabled,
            modelSupportsDocumentUpload,
            modelSupportsVision,
            modelSupportsWebSearch,
            models: MODELS,
            renderAll,
            renderCouncilControls,
            requestFrame: requestAnimationFrame,
            saveAppData,
            saveConfig,
            window
        });
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
            updateInputState: () => legacyRuntimeContext.resolveBinding('input.updateInputState')(),
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
        legacyRuntimeContext.registerLazyBinding('submit.updateSubmitButtonState', () => updateSubmitButtonState);
        legacyRuntimeContext.registerLazyBinding('submit.generateTitleAndSummary', () => generateTitleAndSummary);
        legacyRuntimeContext.registerLazyBinding('submit.shouldPerformWebSearch', () => shouldPerformWebSearch);
        legacyRuntimeContext.registerLazyBinding('submit.adjustTextareaHeight', () => adjustTextareaHeight);
        legacyRuntimeContext.registerLazyBinding('submit.renderFilePreviews', () => renderFilePreviews);
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
            updateSubmitButtonState: (...args) => legacyRuntimeContext.resolveBinding('submit.updateSubmitButtonState')(...args),
            getCouncilValidation,
            showNotification,
            renderCouncilControls,
            isCouncilEnabled,
            getCouncilRuntimeTexts,
            addMessageToUI,
            renderHistorySidebar,
            getAutoNaming: () => config.autoNaming,
            generateTitleAndSummary: (...args) => legacyRuntimeContext.resolveBinding('submit.generateTitleAndSummary')(...args),
            saveAppData,
            getAutoWebSearchEnabled: () => config.enableAutoWebSearch,
            shouldPerformWebSearch: (...args) => legacyRuntimeContext.resolveBinding('submit.shouldPerformWebSearch')(...args),
            getAutoSearchNotice: () => i18n[config.uiLanguage].autoSearchNotice || '偵測到問題需要連網搜索，已自動開啟。',
            renderInputIndicators,
            adjustTextareaHeight: (...args) => legacyRuntimeContext.resolveBinding('submit.adjustTextareaHeight')(...args),
            renderFilePreviews: (...args) => legacyRuntimeContext.resolveBinding('submit.renderFilePreviews')(...args),
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
                    updateSubmitButtonState, (...args) => legacyRuntimeContext.resolveBinding('input.updateInputState')(...args), renderCouncilControls, renderInputIndicators,
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
