                userControls.classList.add('hidden');
                const count = selectedConversationIds.size;
                selectionCount.textContent = `${i18n[config.uiLanguage].selected || '已選取'} ${count} ${i18n[config.uiLanguage].items || '個項目'}`;
                const hasSelection = count > 0;
                batchDeleteBtn.disabled = !hasSelection;
                batchArchiveBtn.disabled = !hasSelection;
                batchMoveBtn.disabled = !hasSelection;
            } else {
                batchActionBar.classList.add('hidden');
                userControls.classList.remove('hidden');
            }
        };
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
            if (selectedConversationIds.has(activeConversationId)) {
                const nextConv = conversations.find(c => !c.archived && !c.deletedAt);
                activeConversationId = nextConv ? nextConv.id : null;
                if (!activeConversationId) startNewChat();
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
            if (selectedConversationIds.has(activeConversationId)) {
                const nextConv = conversations.find(c => !c.archived && !c.deletedAt);
                activeConversationId = nextConv ? nextConv.id : null;
                if (!activeConversationId) startNewChat();
            }
            await saveAppData();
            toggleSelectionMode();
            showNotification(`${i18n[config.uiLanguage].batchArchiveSuccess || '已成功封存'} ${count} ${i18n[config.uiLanguage].conversations || '個對話。'}`, 'success');
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
        const highlightText = (text, query) => {
            if (!query || !text) return text;
            try {
                const safeQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`(${safeQuery})`, 'gi');
                return text.replace(regex, '<mark class="bg-yellow-300 dark:bg-yellow-500 rounded px-1">$1</mark>');
            } catch (e) {
                console.error("Highlight regex error:", e);
                return text;
            }
        };
        const performSearchAndRenderResults = async () => {
            const query = ALL_ELEMENTS.modalSearchInput.value.trim();
            const scope = ALL_ELEMENTS.modalSearchScopeSelect.value;
            const container = ALL_ELEMENTS.searchResultsContainer;
            container.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${i18n[config.uiLanguage].searching || '正在搜尋中...'}</p>`;
            if (!query) {
                container.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${i18n[config.uiLanguage].searchPrompt}</p>`;
                return;
            }
            let results = [];
            if (scope === 'natural') {
                try {
                    const weightedKeywords = await generateSearchKeywords(query);
                    if (!weightedKeywords || weightedKeywords.length === 0) {
                        throw new Error(i18n[config.uiLanguage].keywordGenerationFailed || '無法從您的查詢中提取關鍵字。');
                    }
                    results = calculateRelevanceScores(weightedKeywords);
                } catch (error) {
                    container.innerHTML = `<p class="text-center text-red-500">${error.message}</p>`;
                    return;
                }
            } else {
    const lowerCaseQuery = query.toLowerCase();
    const searchIn = scope === 'keyword-title' ? ['title'] : ['title', 'content'];
    
    // ✨ 核心修正：在搜尋前過濾掉垃圾桶中的內容
    conversations
        .filter(c => !c.deletedAt)
        .forEach(conv => {
            let matchFound = false;
            let titleHTML = conv.title;
                    let snippetHTML = '';
                    if (searchIn.includes('title') && conv.title.toLowerCase().includes(lowerCaseQuery)) {
                        matchFound = true;
                        titleHTML = highlightText(conv.title, query);
                    }
                    if (searchIn.includes('content')) {
                        for (const msg of conv.messages) {
                            for (const part of msg.parts) {
                                if (part.text && part.text.toLowerCase().includes(lowerCaseQuery)) {
                                    matchFound = true;
                                    const text = part.text;
                                    const matchIndex = text.toLowerCase().indexOf(lowerCaseQuery);
                                    const start = Math.max(0, matchIndex - 40);
                                    const end = Math.min(text.length, matchIndex + query.length + 40);
                                    snippetHTML = (start > 0 ? '...' : '') + highlightText(text.substring(start, end), query) + (end < text.length ? '...' : '');
                                    break;
                                }
                            }
                            if (snippetHTML) break;
                        }
                    }
                    if (matchFound) {
                        results.push({ conv, titleHTML, snippetHTML, score: 0 });
                    }
                });
            }
            if (scope === 'natural') {
                results.sort((a, b) => b.score - a.score);
            }
            container.innerHTML = '';
            if (results.length === 0) {
                container.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${i18n[config.uiLanguage].noResultsFound || '找不到符合的對話。'}</p>`;
                return;
            }
            results.forEach(({ conv, titleHTML, snippetHTML, score }) => {
                const item = document.createElement('div');
                item.className = 'p-3 rounded-md hover:bg-[var(--hover-bg)] border border-transparent hover:border-[var(--border-color)]';
                item.dataset.id = conv.id;
                const scoreHTML = scope === 'natural' ? `
                    <div class="flex items-center gap-2 mt-2">
                        <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                            <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${score}%"></div>
                        </div>
                        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">${score}</span>
                    </div>
                ` : '';
                item.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex-1 min-w-0">
                            <div class="font-medium truncate">${titleHTML || highlightText(conv.title, query)}</div>
                            ${snippetHTML ? `<p class="text-xs text-[var(--text-secondary)] mt-1 truncate">${snippetHTML}</p>` : ''}
                        </div>
                        <button data-id="${conv.id}" class="search-view-btn ml-2 flex-shrink-0 text-xs bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full hover:bg-blue-200">${i18n[config.uiLanguage].view || '檢視'}</button>
                    </div>
                    ${scoreHTML}
                `;
                const titleArea = item.querySelector('.flex-1');
                titleArea.addEventListener('click', () => {
    loadChat(conv.id);
    toggleSidebar(false);
    toggleModal(ALL_ELEMENTS.searchModal, false);
    ALL_ELEMENTS.openSearchBtn.classList.remove('active'); // <-- ✨ 加上這一行
});
                const viewBtn = item.querySelector('.search-view-btn');
                viewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showConversationInViewModal(conv.id);
                });
                let pressTimer = null;
                item.addEventListener('touchstart', (e) => {
                    if (e.target.closest('button')) return;
                    pressTimer = setTimeout(() => {
                        e.preventDefault();
                        showConversationInViewModal(conv.id);
                    }, 500);
                }, { passive: false });
                item.addEventListener('touchend', () => clearTimeout(pressTimer));
                item.addEventListener('touchmove', () => clearTimeout(pressTimer));
                container.appendChild(item);
            });
        };
        const showConversationInViewModal = (convId) => {
            const conv = conversations.find(c => c.id === convId);
            if (!conv) return;
            ALL_ELEMENTS.searchViewTitle.textContent = conv.title;
            const contentContainer = ALL_ELEMENTS.searchViewContent;
            contentContainer.innerHTML = '';
            if (conv.messages.length === 0) {
                contentContainer.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${i18n[config.uiLanguage].noMessages || '此對話沒有訊息。'}</p>`;
            } else {
                 conv.messages.forEach(msg => {
                    const isUser = msg.role === 'user';
                    const messageDiv = document.createElement('div');
                    messageDiv.className = `flex items-start gap-2 md:gap-4 ${isUser ? 'justify-end user-message' : 'model-message'}`;
                    const icon = isUser
                        ? `<div class="bg-blue-600 text-white w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold">${currentUser ? currentUser.username.charAt(0).toUpperCase() : 'Y'}</div>`
                        : `<div class="bg-gray-800 text-white w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 15h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></div>`;
                    let contentHTML = msg.parts.map(p => p.text ? (isUser ? renderUserText(p.text) : renderMarkdownWithFormulas(p.text)) : '').join('');
                    const messageBubble = `<div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble"><div class="prose prose-sm max-w-none message-content ${isUser ? 'text-white' : 'text-[var(--text-primary)]'}">${contentHTML}</div></div>`;
                    messageDiv.innerHTML = isUser ? `${messageBubble}${icon}` : `${icon}${messageBubble}`;
                    contentContainer.appendChild(messageDiv);
                });
            }
            ALL_ELEMENTS.searchViewConfirmBtn.dataset.id = convId;
            toggleModal(ALL_ELEMENTS.searchViewModal, true);
        };
        const generateSearchKeywords = async (naturalQuery) => {
            const prompt = `分析以下自然語言查詢，提取 5-10 個最相關的核心關鍵字。對於每個關鍵字，根據其在查詢中的重要性，給予一個 1 到 10 的權重分數（10為最重要）。請嚴格按照以下 JSON 格式輸出，不要有任何額外的文字或解釋。
範例:
查詢: "去年夏天在巴黎鐵塔附近吃的最好吃的法國可麗餅是什麼？"
輸出: [{"keyword": "可麗餅", "weight": 10}, {"keyword": "巴黎鐵塔", "weight": 9}, {"keyword": "法國", "weight": 7}, {"keyword": "吃", "weight": 5}, {"keyword": "去年夏天", "weight": 4}]
查詢內容：${naturalQuery}`;
            const responseSchema = {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        keyword: { type: "STRING" },
                        weight: { type: "INTEGER", minimum: 1, maximum: 10 }
                    },
                    required: ["keyword", "weight"]
                },
                minItems: 3,
                maxItems: 10
            };
            return await callApiWithSchema(prompt, responseSchema);
        };
        const calculateRelevanceScores = (weightedKeywords) => {
    let results = [];
    let processedConvIds = new Set();
    const totalWeightSum = weightedKeywords.reduce((sum, kw) => sum + kw.weight, 0);


    // ✨ 核心修正：在計分前過濾掉垃圾桶中的內容
    conversations
        .filter(c => !c.deletedAt)
        .forEach(conv => {
            if (processedConvIds.has(conv.id)) return;
                let totalScore = 0;
                let maxPossibleScore = 0;
                let foundKeywords = new Set();
                let bestSnippet = '';
                let titleHTML = conv.title;
                const totalMessages = conv.messages.length;
                weightedKeywords.forEach(kw => {
                    const keywordLower = kw.keyword.toLowerCase();
                    maxPossibleScore += kw.weight * 10;
                    if (conv.title.toLowerCase().includes(keywordLower)) {
                        totalScore += kw.weight * 10;
                        foundKeywords.add(keywordLower);
                        titleHTML = highlightText(titleHTML, kw.keyword);
                    }
                    conv.messages.forEach((msg, msgIndex) => {
                        msg.parts.forEach(part => {
                            if (part.text && part.text.toLowerCase().includes(keywordLower)) {
                                foundKeywords.add(keywordLower);
                                const occurrences = (part.text.toLowerCase().match(new RegExp(keywordLower, 'g')) || []).length;
                                totalScore += kw.weight * occurrences * 0.5;
                                const recencyWeight = (msgIndex + 1) / totalMessages;
                                totalScore += kw.weight * recencyWeight * 2;
                                const roleWeight = msg.role === 'user' ? 1.5 : 1;
                                totalScore += kw.weight * roleWeight;
                                if (!bestSnippet) {
                                    const text = part.text;
                                    const matchIndex = text.toLowerCase().indexOf(keywordLower);
                                    const start = Math.max(0, matchIndex - 40);
                                    const end = Math.min(text.length, matchIndex + kw.keyword.length + 40);
                                    bestSnippet = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
                                }
                            }
                        });
                    });
                });
                if (foundKeywords.size > 0) {
                    const coverageRatio = foundKeywords.size / weightedKeywords.length;
                    totalScore *= (1 + coverageRatio);
                    let finalScore = Math.min(100, Math.round((totalScore / maxPossibleScore) * 100 * 3));
                    finalScore = Math.min(99, finalScore);
                    const allKeywordsQuery = weightedKeywords.map(kw => kw.keyword).join('|');
                    const highlightedSnippet = highlightText(bestSnippet, allKeywordsQuery);
                    results.push({
                        conv,
                        titleHTML: highlightText(conv.title, allKeywordsQuery),
                        snippetHTML: highlightedSnippet,
                        score: finalScore
                    });
                    processedConvIds.add(conv.id);
                }
            });
            return results;
        };
        const renderFilePreviews = () => {
            const { filePreviewContainer } = ALL_ELEMENTS;
            filePreviewContainer.innerHTML = '';
            uploadedFiles.forEach(file => {
                const previewEl = document.createElement('div');
                previewEl.className = 'relative w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden file-preview-item';
                if (file.type.startsWith('image/')) {
                    previewEl.innerHTML = `<img src="${file.base64}" class="w-full h-full object-cover">`;
                } else {
                    previewEl.innerHTML = `<div class="w-full h-full flex items-center justify-center">
                       <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    </div>`;
                }
                const removeBtn = document.createElement('button');
                removeBtn.className = 'absolute top-0 right-0 m-1 w-5 h-5 bg-black bg-opacity-50 text-white rounded-full flex items-center justify-center text-xs';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = () => removeFile(file.id);
                previewEl.appendChild(removeBtn);
                filePreviewContainer.appendChild(previewEl);
            });
            updateInputState();
        };
        const handleFileSelection = (event) => {
            const files = event.target.files;
            if (!files) return;
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    uploadedFiles.push({
                        id: crypto.randomUUID(),
                        name: file.name,type: file.type,
                        base64: e.target.result,
                    });
                    renderFilePreviews();
                };
                reader.readAsDataURL(file);
            });
            event.target.value = '';
        };
        const removeFile = (fileId) => {
            uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
            renderFilePreviews();
        };
        const handleExport = async () => {
    const dataToExport = {
        backup_identity: {
            username: currentUser.username,
            exportedAt: new Date().toISOString(),
            authVersion: currentUser.passwordKdf === 'PBKDF2-SHA-256' ? 2 : 1
        }
    };
    
    // 1. 收集資料
    const rawData = {};
    if (ALL_ELEMENTS.exportHistoryCheck.checked) { 
        rawData.conversations = conversations; 
        rawData.folders = folders; 
    }
    if (ALL_ELEMENTS.exportAstrasCheck.checked) { 
        rawData.astras = astras; 
    }
    if (ALL_ELEMENTS.exportSettingsCheck.checked) {
        rawData.settings = {
            defaultModel: config.defaultModel, theme: config.theme, modelSettings: config.modelSettings,
            enableFollowUp: config.enableFollowUp, aiBubbleColor: config.aiBubbleColor, userBubbleColor: config.userBubbleColor,
            autoNaming: config.autoNaming, enableAutoWebSearch: config.enableAutoWebSearch, memoryEnabled1: config.memoryEnabled1,
            enableAutoMemory: config.enableAutoMemory, customWallpaper: config.customWallpaper, wallpaperBrightness: config.wallpaperBrightness,
            uiTheme: config.uiTheme, uiLanguage: config.uiLanguage, aiDefaultLanguage: config.aiDefaultLanguage,
            isLearningMode: config.isLearningMode
        };
    }
    if (document.getElementById('export-api-check').checked) { rawData.apiKeys = config.apiKeys; }
    if (ALL_ELEMENTS.exportMemoryCheck.checked) { rawData.personalMemories = personalMemories; }


    if (Object.keys(rawData).length === 0) {
        showNotification(i18n[config.uiLanguage].selectDataToExportNotice || '請至少選擇一項要匯出的資料。', 'warning');
        return;
    }


    // 按鈕狀態更新
    const originalBtnText = ALL_ELEMENTS.confirmExportBtn.textContent;
    ALL_ELEMENTS.confirmExportBtn.textContent = "正在處理檔案...";
    ALL_ELEMENTS.confirmExportBtn.disabled = true;


    const dataClone = JSON.parse(JSON.stringify(rawData));
    Object.assign(dataToExport, dataClone);


    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `chatbot_backup_${currentUser.username}_${timestamp}.zip`;
    
    try {
        const zip = new JSZip();
        // ✨ 建立兩個資料夾
        const imagesFolder = zip.folder("images");
        const filesFolder = zip.folder("files");


        // --- 處理對話中的附件 START ---
        if (dataToExport.conversations) {
            for (const conv of dataToExport.conversations) {
                for (const msg of conv.messages) {
                    if (msg.parts) {
                        for (const part of msg.parts) {
                            if (part.inlineData && part.inlineData.data) {
                                const originalMime = part.inlineData.mimeType;
                                
                                // 判斷是圖片還是其他檔案
                                if (originalMime.startsWith('image/')) {
                                    // === 圖片處理流程 (壓縮 -> images/) ===
                                    const processed = await compressImage(part.inlineData.data, originalMime, 1920, 0.6);
                                    const imgName = `img_${crypto.randomUUID().slice(0,8)}.${processed.ext}`;
                                    
                                    imagesFolder.file(imgName, processed.data, {base64: true});
                                    
                                    part.inlineData._zipRef = `images/${imgName}`;
                                    part.inlineData.mimeType = processed.mimeType; // 更新為 jpeg
                                } else {
                                    // === 其他檔案處理流程 (原樣 -> files/) ===
                                    // 嘗試從 mimeType 猜測副檔名，或者直接用 bin
                                    let ext = 'bin';
                                    if (originalMime.includes('pdf')) ext = 'pdf';
                                    else if (originalMime.includes('text') || originalMime.includes('plain')) ext = 'txt';
                                    else if (originalMime.includes('csv')) ext = 'csv';
                                    else if (originalMime.includes('json')) ext = 'json';
                                    
                                    const fileName = `file_${crypto.randomUUID().slice(0,8)}.${ext}`;
                                    
                                    filesFolder.file(fileName, part.inlineData.data, {base64: true});
                                    part.inlineData._zipRef = `files/${fileName}`;
                                    // 檔案不修改 mimeType
                                }
                                
                                // 刪除原始 Base64 數據以節省 JSON 空間
                                delete part.inlineData.data;
                            }
                        }
                    }
                }
            }
        }
        // --- 處理附件 END ---


        // B. 處理 Astras 頭像 (這一定放 images)
        if (dataToExport.astras) {
            for (const ast of dataToExport.astras) {
                if (ast.avatarUrl && ast.avatarUrl.startsWith('data:image')) {
                    const matches = ast.avatarUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        const mimeType = matches[1];
                        const base64Data = matches[2];
                        const processed = await compressImage(base64Data, mimeType, 256, 0.7);
                        const imgName = `avatar_${ast.id.slice(0,8)}.${processed.ext}`;
                        
                        imagesFolder.file(imgName, processed.data, {base64: true});
                        ast._avatarZipRef = `images/${imgName}`;
                        delete ast.avatarUrl;
                    }
                }
            }
        }


        zip.file("data.json", JSON.stringify(dataToExport));


        const blob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 9 }
        });


        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{ description: 'Astra Backup (ZIP)', accept: { 'application/zip': ['.zip'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                toggleModal(ALL_ELEMENTS.exportDataModal, false);
                showNotification(i18n[config.uiLanguage].exportSuccess || '資料匯出成功！', 'success');
                return;
            } catch (err) { console.log("File System API skipped."); }
        }


        const shareFile = new File([blob], fileName, { type: 'application/zip' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] }) && /Mobi|Android/i.test(navigator.userAgent)) {
            await navigator.share({ files: [shareFile], title: 'Astra Backup', text: 'Chat backup.' });
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }


        toggleModal(ALL_ELEMENTS.exportDataModal, false);
        showNotification(i18n[config.uiLanguage].exportSuccess || '資料匯出成功！', 'success');


    } catch (error) {
        console.error("Export failed:", error);
        showNotification(`${i18n[config.uiLanguage].exportFailed || '匯出失敗'}: ${error.message}`, 'error');
    } finally {
        ALL_ELEMENTS.confirmExportBtn.textContent = originalBtnText;
        ALL_ELEMENTS.confirmExportBtn.disabled = false;
    }
};
        const performImport = async (data) => {
            if (!currentUser) {
                throw new Error("無法在沒有登入使用者的情況下匯入資料。");
            }
            conversations = data.conversations || [];
            folders = data.folders || [];
            astras = data.astras || [];
            personalMemories = data.personalMemories || [];
            await saveAppData();
            if (data.settings) {
                Object.assign(config, data.settings);
            }
            if (data.apiKeys) {
                config.apiKeys = { ...config.apiKeys, ...data.apiKeys };
            }
            await saveConfig();
        };
        const handleImport = async () => {
    const file = ALL_ELEMENTS.importFileInput.files[0];
    if (!file) {
        showNotification(i18n[config.uiLanguage].selectFileError || '請選擇檔案。', 'error');
        return;
    }

    // 1. 初始化 UI
    const { importProgressContainer, importProgressBar, importStatusText, importPercentage, importWarningText, confirmImportBtn } = ALL_ELEMENTS;
    
    importProgressContainer.classList.remove('hidden');
    importWarningText.classList.remove('hidden');
    confirmImportBtn.disabled = true; // 禁用按鈕防止重複點擊
    confirmImportBtn.textContent = "處理中...";
    
    const updateProgress = (percent, text) => {
        importProgressBar.style.width = `${percent}%`;
        importPercentage.textContent = `${Math.round(percent)}%`;
        if (text) importStatusText.textContent = text;
    };

    try {
        updateProgress(5, "正在讀取檔案...");
        
        // 模擬您要求的等待時間 (雖然技術上不需要，但為了符合您的需求，這裡先等待 1 秒讓使用者看清進度條出現)
        await new Promise(r => setTimeout(r, 1000));

        let rawData = null;
        let zip = null;

        // 2. 判斷檔案類型並讀取
        if (file.name.endsWith('.zip') || file.type.includes('zip')) {
            updateProgress(10, "正在解壓縮 ZIP...");
            zip = await JSZip.loadAsync(file);
            
            let jsonFile = zip.file("data.json");
            if (!jsonFile) {
                // 嘗試尋找任何 .json 檔案 (兼容舊版備份)
                const files = Object.keys(zip.files);
                const jsonFileName = files.find(name => name.endsWith('.json'));
                if (jsonFileName) jsonFile = zip.file(jsonFileName);
            }
            
            if (!jsonFile) throw new Error("ZIP 檔案中找不到 JSON 資料。");
            
            updateProgress(20, "正在解析 JSON 結構...");
            const jsonContent = await jsonFile.async("string");
            
            // 注意：如果 JSON 本身巨大 (例如 500MB 文字)，這裡還是可能崩潰。
            // 但通常 ZIP 裡的 JSON 即使大也能被現代手機解析，瓶頸通常在 DOM 渲染或圖片處理。
            rawData = JSON.parse(jsonContent);

        } else {
            updateProgress(10, "正在解析 JSON...");
            const text = await file.text();
            rawData = JSON.parse(text);
        }

        // 3. 權限檢查 (維持原有邏輯)
        const backupUsername = getBackupUsername(rawData);
        if (backupUsername && backupUsername !== currentUser.username) {
            const confirmed = await showCustomConfirm(
                i18n[config.uiLanguage].importUserMismatch.replace('{backupUser}', backupUsername).replace('{currentUser}', currentUser.username),
                i18n[config.uiLanguage].importUserMismatchTitle
            );
            if (!confirmed) throw new Error("使用者取消匯入");
        } else {
            // 簡單確認
            if (!(await showCustomConfirm(i18n[config.uiLanguage].importOverwriteWarning, i18n[config.uiLanguage].importConfirmation))) {
                throw new Error("使用者取消匯入");
            }
        }

        // 4. 開始分階段匯入資料
        updateProgress(30, "準備匯入資料...");

        // 清空現有資料 (根據需求，這裡是覆蓋模式)
        conversations = [];
        folders = [];
        astras = [];
        personalMemories = [];

        // --- 處理設定 (Settings) ---
        if (rawData.settings) Object.assign(config, rawData.settings);
        if (rawData.apiKeys) config.apiKeys = { ...config.apiKeys, ...rawData.apiKeys };
        await saveConfig();

        // --- 處理 Astras (分塊處理) ---
        const astrasToImport = rawData.astras || [];
        if (astrasToImport.length > 0) {
            await processInChunks(astrasToImport, async (ast) => {
                // 處理 Astra 頭像 (如果是 ZIP 格式)
                if (ast._avatarZipRef && zip) {
                    try {
                        const fileInZip = zip.file(ast._avatarZipRef);
                        if (fileInZip) {
                            const base64 = await fileInZip.async("base64");
                            let mime = 'image/png';
                            if (ast._avatarZipRef.endsWith('.jpg') || ast._avatarZipRef.endsWith('.jpeg')) mime = 'image/jpeg';
                            ast.avatarUrl = `data:${mime};base64,${base64}`;
                            delete ast._avatarZipRef;
                        }
                    } catch (e) { console.warn("Astra 頭像還原失敗", e); }
                }
                astras.push(ast);
            }, 10, (current, total) => {
                // 進度 30% ~ 40% 分配給 Astras
                const p = 30 + (current / total) * 10;
                updateProgress(p, `正在匯入 Astras (${current}/${total})...`);
            });
        }

        // --- 處理資料夾 ---
        if (rawData.folders) {
            folders = rawData.folders;
        }

        // --- 處理記憶 ---
        if (rawData.personalMemories) {
            personalMemories = rawData.personalMemories;
        }

        // --- 處理對話 (最佔資源的部分 - 分塊處理) ---
        const convsToImport = rawData.conversations || [];
        if (convsToImport.length > 0) {
            // 為了避免記憶體峰值，我們直接操作全域變數 conversations，而不是建立巨大的暫存陣列
            await processInChunks(convsToImport, async (conv) => {
                // 處理每則訊息中的圖片/檔案附件
                for (const msg of conv.messages) {
                    if (msg.parts) {
                        for (const part of msg.parts) {
                            // 處理 ZIP 參照還原
                            if (part.inlineData && part.inlineData._zipRef && zip) {
                                try {
                                    const fileName = part.inlineData._zipRef;
                                    const fileInZip = zip.file(fileName);
                                    if (fileInZip) {
                                        const base64 = await fileInZip.async("base64");
                                        part.inlineData.data = base64;
                                        delete part.inlineData._zipRef;
                                    }
                                } catch (e) { console.warn("附件還原失敗", e); }
                            }
                        }
                    }
                }
                conversations.push(conv);
            }, 5, (current, total) => { // 每次處理 5 個對話，避免卡頓
                // 進度 40% ~ 90% 分配給對話
                const p = 40 + (current / total) * 50;
                updateProgress(p, `正在還原對話 (${current}/${total})...`);
            });
        }

        // 5. 儲存至 IndexedDB (這是另一個耗時操作)
        updateProgress(90, "正在寫入資料庫...");
        
        // 為了防止 saveAppData (JSON.stringify) 導致記憶體不足，
        // 如果資料真的超級大，這裡其實應該拆分儲存 key，但為了相容性，我們先維持原樣。
        // 在分塊處理後，記憶體壓力已經比原本小很多了（因為 GC 有機會介入）。
        await saveAppData();

        updateProgress(100, "匯入完成！");
        
        // 稍微等待一下讓使用者看到 100%
        await new Promise(r => setTimeout(r, 500));

        // 6. 後續 UI 更新
        toggleModal(ALL_ELEMENTS.importDataModal, false);
        showNotification(i18n[config.uiLanguage].importSuccess, 'success');

        if (config.customWallpaper) {
            try {
                const brightness = await analyzeImageBrightness(config.customWallpaper);
                config.wallpaperBrightness = brightness;
                if (config.uiTheme.mode === 'adaptive') {
                    const palette = await getDominantColorPalette(config.customWallpaper);
                    config.uiTheme.adaptivePalette = palette;
                    config.uiTheme.adaptiveColor = palette[0] || '#3b82f6';
                }
                await saveConfig();
            } catch (err) { }
        }
        
        applyCustomWallpaper();
        applyUiTheme();
        setAiBubbleColor();
        setUserBubbleColor();
        applyLanguage(config.uiLanguage);
        setupSettingsModal();
        
        const firstConv = conversations.find(c => !c.archived && !c.deletedAt);
        if (firstConv) loadChat(firstConv.id);
        else startNewChat();

    } catch (error) {
        if (error.message === "使用者取消匯入") {
            showNotification("已取消匯入", "info");
        } else {
            console.error(error);
            showNotification(`${i18n[config.uiLanguage].importFailed}: ${error.message}`, 'error');
            updateProgress(0, "匯入失敗");
            importProgressBar.classList.add('bg-red-500');
        }
    } finally {
        // 重置 UI 狀態
        confirmImportBtn.disabled = false;
        confirmImportBtn.textContent = i18n[config.uiLanguage].confirmAndImport || "確認並匯入";
        // 不要立即隱藏進度條，讓使用者看到結果，下次打開視窗時再重置
    }
};
        const handleImportOnAuth = () => {
            toggleModal(ALL_ELEMENTS.importDataModalAuth, true);
        };
        const processAuthImport = async () => {
    const username = ALL_ELEMENTS.usernameInput.value.trim();
    const password = ALL_ELEMENTS.passwordInput.value;
    const file = ALL_ELEMENTS.importFileInputAuth.files[0];

    if (!file) {
        showNotification(i18n[config.uiLanguage].selectFileError || '請選擇檔案。', 'error');
        return;
    }

    // 1. 初始化 UI
    const { 
        importProgressContainerAuth, 
        importProgressBarAuth, 
        importStatusTextAuth, 
        importPercentageAuth,
        confirmImportBtnAuth 
    } = ALL_ELEMENTS;

    importProgressContainerAuth.classList.remove('hidden');
    confirmImportBtnAuth.disabled = true;
    confirmImportBtnAuth.textContent = "驗證與處理中...";

    const updateProgress = (percent, text) => {
        importProgressBarAuth.style.width = `${percent}%`;
        importPercentageAuth.textContent = `${Math.round(percent)}%`;
        if (text) importStatusTextAuth.textContent = text;
    };

    try {
        updateProgress(5, "正在讀取並驗證...");
        
        // 模擬等待 (讓使用者有反應時間)
        await new Promise(r => setTimeout(r, 1000));

        let rawData = null;
        let zip = null;

        // 2. 讀取檔案
        if (file.name.endsWith('.zip') || file.type.includes('zip')) {
            updateProgress(10, "正在解壓縮...");
            zip = await JSZip.loadAsync(file);
            
            let jsonFile = zip.file("data.json");
            if (!jsonFile) {
                const files = Object.keys(zip.files);
                const jsonFileName = files.find(name => name.endsWith('.json'));
                if (jsonFileName) jsonFile = zip.file(jsonFileName);
            }
            
            if (!jsonFile) throw new Error("ZIP 檔案中找不到 JSON 資料。");
            
            updateProgress(15, "正在解析結構...");
            const jsonContent = await jsonFile.async("string");
            rawData = JSON.parse(jsonContent);

        } else {
            updateProgress(10, "正在解析 JSON...");
            const text = await file.text();
            rawData = JSON.parse(text);
        }

        // 3. 驗證帳號密碼 (這是 processAuthImport 特有的步驟)
        updateProgress(20, "正在驗證身份...");
        
        const backupUsername = getBackupUsername(rawData);
        if (!backupUsername) {
            throw new Error(i18n[config.uiLanguage].importInvalidFile || '備份檔案格式無效或缺少驗證資訊。');
        }
        
        if (backupUsername !== username) {
            throw new Error(i18n[config.uiLanguage].importAuthMismatch || '帳號或密碼與備份檔案不符。');
        }

        if (rawData.user_credentials?.passwordHash) {
            const legacyHash = await hashString(password);
            if (!constantTimeEqual(rawData.user_credentials.passwordHash, legacyHash)) {
                throw new Error(i18n[config.uiLanguage].importAuthMismatch || '帳號或密碼與備份檔案不符。');
            }
        }

        // 驗證通過，寫入使用者資訊
        const userKey = getUserKey(username);
        currentUser = await createPasswordRecord(username, password);
        await setItem(userKey, JSON.stringify(currentUser));
        await setItem('chat_lastUser', username);

        // 4. 開始分階段還原資料 (這裡修復了 restoreAttachmentsFromZip 報錯的問題)
        updateProgress(30, "身份驗證通過，開始還原...");

        // 清空全域變數準備接收資料
        conversations = [];
        folders = [];
        astras = [];
        personalMemories = [];

        // --- 處理 Astras ---
        const astrasToImport = rawData.astras || [];
        if (astrasToImport.length > 0) {
            await processInChunks(astrasToImport, async (ast) => {
                if (ast._avatarZipRef && zip) {
                    try {
                        const fileInZip = zip.file(ast._avatarZipRef);
                        if (fileInZip) {
                            const base64 = await fileInZip.async("base64");
                            let mime = 'image/png';
                            if (ast._avatarZipRef.endsWith('.jpg') || ast._avatarZipRef.endsWith('.jpeg')) mime = 'image/jpeg';
                            ast.avatarUrl = `data:${mime};base64,${base64}`;
                            delete ast._avatarZipRef;
                        }
                    } catch (e) { console.warn("Astra 頭像還原失敗", e); }
                }
                astras.push(ast);
            }, 10, (current, total) => {
                const p = 30 + (current / total) * 10;
                updateProgress(p, `還原 Astras (${current}/${total})...`);
            });
        }

        // --- 處理資料夾與記憶 ---
        if (rawData.folders) folders = rawData.folders;
        if (rawData.personalMemories) personalMemories = rawData.personalMemories;

        // --- 處理對話 (最耗資源的部分) ---
        const convsToImport = rawData.conversations || [];
        if (convsToImport.length > 0) {
            await processInChunks(convsToImport, async (conv) => {
                for (const msg of conv.messages) {
                    if (msg.parts) {
                        for (const part of msg.parts) {
                            // 處理 ZIP 參照還原
                            if (part.inlineData && part.inlineData._zipRef && zip) {
                                try {
                                    const fileName = part.inlineData._zipRef;
                                    const fileInZip = zip.file(fileName);
                                    if (fileInZip) {
                                        const base64 = await fileInZip.async("base64");
                                        part.inlineData.data = base64;
                                        delete part.inlineData._zipRef;
                                    }
                                } catch (e) { console.warn("附件還原失敗", e); }
                            }
                        }
                    }
                }
                conversations.push(conv);
            }, 5, (current, total) => {
                const p = 40 + (current / total) * 50;
                updateProgress(p, `還原對話 (${current}/${total})...`);
            });
        }

        // 5. 寫入資料庫與設定
        updateProgress(95, "正在寫入資料庫...");
        
        await saveAppData();
        if (rawData.settings) Object.assign(config, rawData.settings);
        if (rawData.apiKeys) config.apiKeys = { ...config.apiKeys, ...rawData.apiKeys };
        await saveConfig();

        updateProgress(100, "匯入成功！");
        await new Promise(r => setTimeout(r, 500));

        // 6. 關閉視窗並進入 App
        toggleModal(ALL_ELEMENTS.importDataModalAuth, false);
        
        // UI 轉場動畫
        ALL_ELEMENTS.authContainer.classList.add('fade-out');
        ALL_ELEMENTS.appContainer.classList.remove('hidden');
        requestAnimationFrame(() => {
            ALL_ELEMENTS.appContainer.classList.add('visible');
        });

        const hideAuthContainer = () => {
            ALL_ELEMENTS.authContainer.style.display = 'none';
            ALL_ELEMENTS.authContainer.classList.remove('visible');
        };
        ALL_ELEMENTS.authContainer.addEventListener('transitionend', hideAuthContainer, { once: true });
        setTimeout(hideAuthContainer, 500);

        // 初始化應用程式
        initChatApp();
        showNotification(i18n[config.uiLanguage].importSuccess || '匯入成功！', 'success');

    } catch (error) {
        console.error(error);
        showNotification(`${i18n[config.uiLanguage].importFailed || '匯入失敗'}: ${error.message}`, 'error');
        updateProgress(0, "發生錯誤");
        importProgressBarAuth.classList.add('bg-red-500');
        importStatusTextAuth.classList.add('text-red-500');
    } finally {
        confirmImportBtnAuth.disabled = false;
        confirmImportBtnAuth.textContent = i18n[config.uiLanguage].confirmAndImport || "確認並匯入";
    }
};
        const renderModelManagementUI = () => {
    const container = ALL_ELEMENTS.modelManagementList;
    container.innerHTML = '';


    // --- 步驟 1: 準備並分類所有模型 ---
    const processedModels = MODELS.map(model => {
        const provider = model.provider;
        let tier = [];
        let company = null;
        if (provider === 'gemini') {
            tier = ['free', 'paid'];
            company = 'google'; 
        } else if (provider === 'openrouter') {
            tier = model.id.includes(':free') ? ['free'] : ['paid'];
            company = model.id.split('/')[0];
        }
        return { ...model, tier, company };
    });


    const sortedModels = [...config.modelSettings]
        .sort((a, b) => a.order - b.order)
        .map(setting => ({
            setting,
            info: processedModels.find(m => m.id === setting.id)
        }))
        .filter(item => item.info); // 確保模型存在


    // 建立巢狀結構來存放分類後的模型
    const categorizedModels = {};


    sortedModels.forEach(item => {
        const { info, setting } = item;
        const { provider, tier, company } = info;


        if (!categorizedModels[provider]) categorizedModels[provider] = {};
        
        tier.forEach(t => {
            if (!categorizedModels[provider][t]) categorizedModels[provider][t] = {};
            
            if (provider === 'openrouter') {
                if (!categorizedModels[provider][t][company]) categorizedModels[provider][t][company] = [];
                categorizedModels[provider][t][company].push(item);
            } else {
                if (!categorizedModels[provider][t]['models']) categorizedModels[provider][t]['models'] = [];
                categorizedModels[provider][t]['models'].push(item);
            }
        });
    });


    // --- 步驟 2: 根據分類後的結構動態產生 HTML ---
    
    // 輔助函式：產生單個可排序的模型項目
    const createModelItemHTML = (item, index, total) => {
        const { setting, info } = item;
        return `
            <div class="model-management-item flex items-center p-2 bg-[var(--input-field-bg)] rounded-lg mb-1" data-model-id="${info.id}">
                <span class="flex-1 font-medium">${info.name}</span>
                <input type="radio" name="default-model-radio" class="w-4 h-4 mr-4 text-blue-600" ${config.defaultModel === info.id ? 'checked' : ''}>
                <button class="toggle-visibility-btn p-1 rounded-full hover:bg-[var(--hover-bg)]" title="${setting.hidden ? '顯示' : '隱藏'}">
                    ${setting.hidden ? '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" /></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.432 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573 3.007-9.963 7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>'}
                </button>
                <div class="flex gap-1 ml-2">
                    <button class="move-up-btn p-1 rounded hover:bg-[var(--hover-bg)] disabled:opacity-50" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button class="move-down-btn p-1 rounded hover:bg-[var(--hover-bg)] disabled:opacity-50" ${index === total - 1 ? 'disabled' : ''}>↓</button>
                </div>
            </div>
        `;
    };


    // 輔助函式：建立一個可折疊的區塊
    const createCollapsibleSection = (title, level = 0) => {
        const details = document.createElement('details');
        details.className = `collapsible-section level-${level}`;
        details.style.marginLeft = `${level * 15}px`;
        details.innerHTML = `
            <summary class="collapsible-summary text-sm font-semibold capitalize cursor-pointer p-2 rounded hover:bg-[var(--hover-bg)]">${title}</summary>
            <div class="collapsible-content pl-4 pt-1"></div>
        `;
        return details;
    };


    // 遍歷提供商
    for (const provider in categorizedModels) {
        const providerSection = createCollapsibleSection(provider, 0);
        const providerContent = providerSection.querySelector('.collapsible-content');
        
        // 遍歷費用類型
        for (const tier in categorizedModels[provider]) {
            const tierSection = createCollapsibleSection(tier === 'free' ? '免費模型' : '付費模型', 1);
            const tierContent = tierSection.querySelector('.collapsible-content');
            
            const tierData = categorizedModels[provider][tier];


            if (provider === 'openrouter') {
                // 遍歷公司
                for (const company in tierData) {
                    const companySection = createCollapsibleSection(company, 2);
                    const companyContent = companySection.querySelector('.collapsible-content');
                    const models = tierData[company];
                    
                    companyContent.innerHTML = models.map((item, index) => createModelItemHTML(item, index, models.length)).join('');
                    tierContent.appendChild(companySection);
                }
            } else { // for Gemini
                const models = tierData['models'] || [];
                tierContent.innerHTML = models.map((item, index) => createModelItemHTML(item, index, models.length)).join('');
            }
            providerContent.appendChild(tierSection);
        }
        container.appendChild(providerSection);
    }
    
    // --- 步驟 3: 綁定事件 ---
    container.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const modelId = e.currentTarget.closest('.model-management-item').dataset.modelId;
            const setting = config.modelSettings.find(s => s.id === modelId);
            if (setting) {
                setting.hidden = !setting.hidden;
                await saveConfig();
                renderModelManagementUI(); // 重繪整個UI
            }
        });
    });


    container.querySelectorAll('input[name="default-model-radio"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            const modelId = e.currentTarget.closest('.model-management-item').dataset.modelId;
            config.defaultModel = modelId;
            await saveConfig();
            // 不需重繪，只需通知即可
            showNotification(i18n[config.uiLanguage].defaultModelUpdated || '預設模型已更新');
        });
    });


    container.querySelectorAll('.move-up-btn, .move-down-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modelId = e.currentTarget.closest('.model-management-item').dataset.modelId;
            const direction = e.currentTarget.classList.contains('move-up-btn') ? 'up' : 'down';
            moveModelOrder(modelId, direction);
        });
    });
};
        const moveModelOrder = async (modelId, direction) => {
    // 獲取模型及其詳細分類資訊
    const allModelsInfo = MODELS.map(model => {
        let tier = [];
        let company = null;
        if (model.provider === 'gemini') {
            tier = ['free', 'paid'];
            company = 'google';
        } else if (model.provider === 'openrouter') {
            tier = model.id.includes(':free') ? ['free'] : ['paid'];
            company = model.id.split('/')[0];
        }
        return { ...model, tier, company };
    });


    const modelToMoveInfo = allModelsInfo.find(m => m.id === modelId);
    if (!modelToMoveInfo) return;


    // 找出與被移動模型屬於同一分類的所有模型設定
    const siblingSettings = config.modelSettings.filter(setting => {
        const info = allModelsInfo.find(m => m.id === setting.id);
        if (!info) return false;
        
        // 判斷是否在同一個最終群組
        const sameProvider = info.provider === modelToMoveInfo.provider;
        const sameTier = info.tier.some(t => modelToMoveInfo.tier.includes(t));
        const sameCompany = info.company === modelToMoveInfo.company;


        return sameProvider && sameTier && sameCompany;
    }).sort((a, b) => a.order - b.order);


    const localIndex = siblingSettings.findIndex(s => s.id === modelId);


    if (direction === 'up' && localIndex > 0) {
        // 在本地群組中找到要交換位置的目標
        const targetSetting = siblingSettings[localIndex - 1];
        // 在全域設定中找到它們的索引
        const globalIndex1 = config.modelSettings.findIndex(s => s.id === modelId);
        const globalIndex2 = config.modelSettings.findIndex(s => s.id === targetSetting.id);
        // 交換它們的 order 值
        [config.modelSettings[globalIndex1].order, config.modelSettings[globalIndex2].order] = [config.modelSettings[globalIndex2].order, config.modelSettings[globalIndex1].order];


    } else if (direction === 'down' && localIndex < siblingSettings.length - 1) {
        const targetSetting = siblingSettings[localIndex + 1];
        const globalIndex1 = config.modelSettings.findIndex(s => s.id === modelId);
        const globalIndex2 = config.modelSettings.findIndex(s => s.id === targetSetting.id);
        [config.modelSettings[globalIndex1].order, config.modelSettings[globalIndex2].order] = [config.modelSettings[globalIndex2].order, config.modelSettings[globalIndex1].order];
    }
    
    // 根據新的 order 值重新排序整個陣列，並更新 order 屬性以確保連續性
    config.modelSettings.sort((a, b) => a.order - b.order);
    config.modelSettings.forEach((s, i) => s.order = i);


    await saveConfig();
    renderModelManagementUI(); // 重新渲染UI
    showNotification(i18n[config.uiLanguage].modelOrderUpdated || '模型順序已更新');
};
        function toggleSidebar(show) {
    const { sidebar, sidebarOverlay, appContainer } = ALL_ELEMENTS;
    sidebarOpen = typeof show === 'boolean' ? show : !sidebarOpen;


    // 判斷是否為電腦版螢幕
    if (window.innerWidth >= 1024) {
        // --- 電腦版邏輯：切換 class 來推擠 ---
        appContainer.classList.toggle('sidebar-open', sidebarOpen);
    } else {
        // --- 手機版邏輯：維持原本的覆蓋效果 ---
        if (sidebarOpen) {
            sidebar.style.transform = 'translateX(0)';
            sidebarOverlay.classList.add('visible');
        } else {
            sidebar.style.transform = 'translateX(-100%)';
            sidebarOverlay.classList.remove('visible');
        }
    }
}
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
                updateInputState();
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
        const renderPersonalMemoryList = () => {
            const container = ALL_ELEMENTS.personalMemoryList;
            container.innerHTML = '';
            personalMemories.forEach(memory => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-color)]';
                item.innerHTML = `
    <div class="flex items-center gap-2 flex-1 min-w-0"> <!-- ✨ 修改: 加上 min-w-0 確保 flex 容器可被壓縮 -->
        <input type="checkbox" class="memory-enabled-checkbox w-4 h-4" data-id="${memory.id}" ${memory.enabled ? 'checked' : ''}>
        <span class="text-sm word-break: break-word;">${memory.content}</span> <!-- ✨ 修改: 移除 truncate 並允許換行 -->
    </div>
    <button class="delete-memory-btn text-red-600 hover:text-red-800" data-id="${memory.id}">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
    </button>
                `;
                container.appendChild(item);
            });
            container.querySelectorAll('.memory-enabled-checkbox').forEach(cb => {
                cb.addEventListener('change', async (e) => {
                    const id = e.target.dataset.id;
                    const memory = personalMemories.find(m => m.id === id);
                    if (memory) {
                        memory.enabled = e.target.checked;
                        await saveAppData();
                    }
                });
            });
            container.querySelectorAll('.delete-memory-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    if (await showCustomConfirm(i18n[config.uiLanguage].confirmDeleteMemory || '確定刪除此記憶？')) {
                        personalMemories = personalMemories.filter(m => m.id !== id);
                        await saveAppData();
                        renderPersonalMemoryList();
                    }
                });
            });
        };
        const refineAndStoreMemories = async (potentialMemories) => {
            if (potentialMemories.length === 0) return;


            if (personalMemories.length === 0) {
                potentialMemories.forEach(content => {
                    personalMemories.push({ id: crypto.randomUUID(), content, enabled: true });
                });
                await saveAppData();
                renderPersonalMemoryList();
                showNotification('已自動添加新的個人記憶。', 'success');
                return;
            }
            
            const prompt = `# 核心身份：記憶整合專家
你的任務是維護一個精簡、高效、無冗餘的用戶記憶庫。你將收到一個 "現有記憶庫" 和一個 "潛在的新記憶" 列表。你的工作不是簡單地添加，而是進行智能化的整合。


# 最高指導原則：整合優先原則 (Consolidation-First Principle)
你的首要目標是**減少記憶的總數量**，同時**增加單條記憶的資訊密度**。**新增 (ADD) 是一件需要極力避免的事情**，只有在資訊完全獨立且無法與任何現有記憶合併時，才被允許。


# 你的行動層級 (按此順序判斷)：
1.  **忽略 (IGNORE):** 如果新記憶與現有記憶在語意上完全重複，或只是換句話說。
2.  **更新 (UPDATE):** 如果新記憶是對現有記憶的**補充、具體化、修正或概括**。這是你最常用的工具。
3.  **新增 (ADD):** 如果新記憶引入了一個**全新的、完全不相關的領域**。


# 「更新 (UPDATE)」的黃金法則與範例：
你必須主動尋找可以合併的機會。
*   **具體化 (Adding Specificity):**
    *   現有: \`{"id": "abc", "content": "用戶是個開發者。"}\`
    *   潛在: \`"用戶會寫Python。"\`
    *   **正確行動:** \`{"action": "UPDATE", "id": "abc", "content": "用戶是個會寫Python的開發者。"}\`
*   **概括化 (Generalizing):**
    *   現有: \`{"id": "def", "content": "用戶喜歡貓。"}\`
    *   潛在: \`"用戶也喜歡狗。"\`
    *   **正確行動:** \`{"action": "UPDATE", "id": "def", "content": "用戶喜歡動物 (例如貓和狗)。"}\`
*   **補充細節 (Adding Details):**
    *   現有: \`{"id": "ghi", "content": "用戶喜歡旅行。"}\`
    *   潛在: \`"用戶去過日本和泰國。"\`
    *   **正確行動:** \`{"action": "UPDATE", "id": "ghi", "content": "用戶喜歡旅行，曾去過日本和泰國。"}\`


# 輸出格式
你必須嚴格地以一個 JSON 陣列的形式回覆，每個物件代表一個行動。不要包含任何 JSON 以外的解釋或文字。


\`\`\`json
[
  {
    "action": "ADD",
    "content": "新的記憶內容"
  },
  {
    "action": "UPDATE",
    "id": "要更新的現有記憶的ID",
    "content": "更新後的完整記憶內容"
  },
  {
    "action": "IGNORE",
    "content": "要忽略的新記憶內容"
  }
]
\`\`\`


# 待處理的資料
【現有的記憶庫 (包含 ID)】:
${JSON.stringify(personalMemories, null, 2)}


【潛在的新記憶】:
${JSON.stringify(potentialMemories, null, 2)}
`;
            const responseSchema = {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        action: { type: "STRING", enum: ["ADD", "UPDATE", "IGNORE"] },
                        id: { type: "STRING" },
                        content: { type: "STRING" }
                    },
                    required: ["action", "content"]
                }
            };


            try {
                const actions = await callApiWithSchema(prompt, responseSchema);
                if (actions && Array.isArray(actions)) {
                    let memoriesChanged = false;
                    actions.forEach(act => {
                        switch (act.action) {
                            case 'ADD':
                                if (!personalMemories.some(m => m.content === act.content)) {
                                    personalMemories.push({ id: crypto.randomUUID(), content: act.content, enabled: true });
                                    memoriesChanged = true;
                                }
                                break;
                            case 'UPDATE':
                                const memoryToUpdate = personalMemories.find(m => m.id === act.id);
                                if (memoryToUpdate && memoryToUpdate.content !== act.content) {
                                    memoryToUpdate.content = act.content;
                                    memoriesChanged = true;
                                }
                                break;
                            case 'IGNORE':
                                break;
                        }
                    });


                    if (memoriesChanged) {
                        await saveAppData();
                        if (!ALL_ELEMENTS.settingsModal.classList.contains('hidden')) {
                           renderPersonalMemoryList();
                        }
                        showNotification('AI 已自動整理並更新您的個人記憶。', 'success');
                    }
                }
            } catch (error) {
                console.error("Error refining memories:", error);
            }
        };
        const extractPersonalMemory = async (userMessage, aiResponse) => {
            const prompt = `# 核心身份：首席用戶畫像分析師
你的唯一職責是從用戶的發言中，提煉出**永恆的、可獨立存在的用戶特質**。你不是對話記錄員，你是一位為建立長期、精準用戶畫像而服務的分析師。


# 最高指導原則：孤島測試 (The Island Test)
這是你判斷是否記錄一條資訊的**唯一標準**。在記錄前，你必須在心中回答：
> **"如果我只知道這一條資訊，而完全不知道它所在的對話上下文，這條資訊是否仍然是一個關於用戶的、有意義的、獨立完整的事實？"**


如果答案是「否」，則**必須拋棄**這條資訊。


*   **測試案例 (通過):**
    *   資訊："用戶是一名Python開發者。"
    *   孤島測試：知道這一點，我了解了用戶的一個關鍵技能。**通過。**
*   **測試案例 (失敗):**
    *   資訊："用戶想讓你幫他 debug。"
    *   孤島測試：只知道這個，我不知道他想 debug 什麼，也不知道這是一個長期需求還是一次性請求。這條資訊依賴於對話上下文。**失敗。**


# 記憶提煉的詳細規則
你必須嚴格遵守以下所有規則來過濾資訊。


### 1. 資訊來源：
*   **絕對只從【使用者訊息】中提取。** AI的回應內容完全不在你的分析範圍內。


### 2. 允許記錄的類型 (必須通過孤島測試)：
*   **職業/技能:** "用戶是醫生。","用戶會彈鋼琴。"
*   **核心興趣/愛好:** "用戶喜歡看科幻小說。","用戶熱衷於登山。"
*   **長期目標/願望:** "用戶的目標是開一家咖啡廳。"
*   **穩定的人際關係/所有物:** "用戶已婚。","用戶有一隻叫Mochi的貓。"
*   **堅定的個人偏好:** "用戶是素食主義者。","用戶偏愛深色模式的介面。"


### 3. 絕對禁止的類型 (會導致孤島測試失敗)：
*   **[禁令 A] 任何與AI的互動/指令/評價:**
    *   **例子:** "用戶覺得AI很聰明"、"用戶想讓AI扮演一個角色"、"用戶要你總結一下"、"用戶在測試你的記憶力"。
    *   **理由:** 這些描述的是對話行為，而非用戶本身。
*   **[禁令 B] 暫時性狀態、情緒或意圖:**
    *   **例子:** "用戶今天心情不好"、"用戶正準備出門"、"用戶想討論天氣"。
    *   **理由:** 這些資訊很快就會過時，不具備長期價值。
*   **[禁令 C] 一次性的問題或請求:**
    *   **例子:** "用戶在問法國的首都是哪裡"、"用戶要了一份食譜"。
    *   **理由:** 這是單次資訊交換，不是用戶特質。
*   **[禁令 D] 模糊或不確定的陳述:**
    *   **例子:** "用戶可能喜歡..."、"用戶好像在考慮..."。
    *   **理由:** 記憶必須是基於確定的事實。
*   **[禁令 E] 任何形式的程式碼、URL、或技術細節。**


# 輸出格式
*   如果找到任何**通過孤島測試**的記憶點，將它們精煉成以「用戶」開頭的陳述句，並放入一個JSON陣列中。
*   如果沒有任何資訊能通過測試，**必須**返回一個空的JSON陣列：\`[]\`。


# 待分析內容
【使用者訊息】：${userMessage}`;
            const responseSchema = {
                type: "ARRAY",
                items: { type: "STRING" }
            };
            const extracted = await callApiWithSchema(prompt, responseSchema);
            if (extracted && extracted.length > 0) {
                await refineAndStoreMemories(extracted);
            }
        };
        const updateApiKeyWarningBadge = () => {
            const conv = getActiveConversation();
            if (!conv) {
                ALL_ELEMENTS.apiKeyWarningBadge.classList.add('hidden');
                return;
            }
            const modelInfo = normalizeConversationModel(conv);
            let needsKey = false;
            if (isCouncilEnabled(conv)) {
                needsKey = getCouncilValidation(conv).reason === 'missingApiKey';
            } else if (modelInfo) {
                needsKey = !getApiKeyForProvider(modelInfo.provider);
            }
            ALL_ELEMENTS.apiKeyWarningBadge.classList.toggle('hidden', !needsKey);
        };
        const openDashboard = () => {
            renderDashboardStats();
            renderModelUsageChart();
            setupTimeAnalysis();
            toggleModal(ALL_ELEMENTS.dataDashboardModal, true);
        };
        const renderDashboardStats = () => {
            ALL_ELEMENTS.totalConvStat.textContent = conversations.filter(c => !c.deletedAt).length;
            ALL_ELEMENTS.totalFolderStat.textContent = folders.length;
            const modelCounts = conversations.reduce((acc, conv) => {
                const modelName = MODELS.find(m => m.id === conv.model)?.name || '未知模型';
                acc[modelName] = (acc[modelName] || 0) + 1;
                return acc;
            }, {});
            const mostUsedModel = Object.keys(modelCounts).reduce((a, b) => modelCounts[a] > modelCounts[b] ? a : b, 'N/A');
            ALL_ELEMENTS.mostUsedModelStat.textContent = mostUsedModel;
        };
        const renderModelUsageChart = () => {
