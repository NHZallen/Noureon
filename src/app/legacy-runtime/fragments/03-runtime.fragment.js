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
        import { highlightText } from '/src/app/legacy-runtime/features/search-text-formatting.js';
        import { createMediaAttachmentRenderer as createSearchMediaAttachmentRenderer } from '/src/app/legacy-runtime/features/media-attachment-renderer.js';
        import { createMediaPreviewLifecycle as createSearchMediaPreviewLifecycle } from '/src/app/legacy-runtime/features/media-preview-lifecycle.js';
        import { createConversationViewRenderer as createSearchConversationViewRenderer } from '/src/app/legacy-runtime/features/conversation-view-renderer.js';
        import { createUploadedFilePreviewLifecycle } from '/src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js';
        import { createLegacyImportExportLifecycle } from '/src/app/runtime/features/import-export-lifecycle.js';
        import { createLegacyAuthImportLifecycle } from '/src/app/runtime/features/auth-import-lifecycle.js';
        import { createLegacyModelMemoryDashboardLifecycle } from '/src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js';
        const {
            getInlineMediaSrc: getSearchInlineMediaSrc,
            renderMediaAttachmentGrid: renderSearchMediaAttachmentGrid
        } = createSearchMediaAttachmentRenderer({ escapeHTML });
        const {
            openMediaPreview: openSearchMediaPreview,
            bindMediaPreviewButtons: bindSearchMediaPreviewButtons
        } = createSearchMediaPreviewLifecycle({
            document,
            navigator,
            fetch,
            File,
            escapeHTML,
            getInlineMediaSrc: getSearchInlineMediaSrc,
            getUiLanguage: () => config.uiLanguage
        });
        const searchConversationViewRenderer = createSearchConversationViewRenderer({
            document,
            renderUserText,
            renderModelText: renderMarkdownWithFormulas,
            renderMediaAttachmentGrid: renderSearchMediaAttachmentGrid,
            bindMediaPreviewButtons: bindSearchMediaPreviewButtons
        });
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
            searchConversationViewRenderer.renderConversationMessages({
                conversation: conv,
                contentContainer,
                emptyHTML: `<p class="text-center text-[var(--text-secondary)]">${i18n[config.uiLanguage].noMessages || '此對話沒有訊息。'}</p>`
            });
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
        const CHAT_IMAGE_MAX_SIZE = 1600;
        const CHAT_IMAGE_QUALITY = 0.78;
        const normalizeImageForChatUpload = (dataUrl, mimeType, fileName = 'image') => new Promise((resolve) => {
            mimeType = mimeType || '';
            if (!mimeType.startsWith('image/') || mimeType === 'image/gif') {
                resolve({ base64: dataUrl, type: mimeType });
                return;
            }
            const img = new Image();
            img.onload = () => {
                const maxEdge = Math.max(img.width, img.height);
                const scale = maxEdge > CHAT_IMAGE_MAX_SIZE ? CHAT_IMAGE_MAX_SIZE / maxEdge : 1;
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve({ base64: dataUrl, type: mimeType });
                    return;
                }
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve({
                    base64: canvas.toDataURL('image/jpeg', CHAT_IMAGE_QUALITY),
                    type: 'image/jpeg'
                });
            };
            img.onerror = () => {
                console.warn(`Could not normalize uploaded image for chat: ${fileName}`);
                resolve({ base64: dataUrl, type: mimeType });
            };
            img.src = dataUrl;
        });
        const resolveUploadUpdateInputState = (...args) => legacyRuntimeContext.resolveBinding('input.updateInputState')(...args);
        const resolveSearchSetupSettingsModal = (...args) => legacyRuntimeContext.resolveBinding('settings.setupSettingsModal')(...args);
        const {
            renderFilePreviews,
            removeFile
        } = createUploadedFilePreviewLifecycle({
            document,
            getFiles: () => uploadedFiles,
            setFiles: (files) => {
                uploadedFiles = files;
            },
            getContainer: () => ALL_ELEMENTS.filePreviewContainer,
            getInputWrapper: () => document.querySelector('.input-wrapper'),
            openMediaPreview: openSearchMediaPreview,
            updateInputState: resolveUploadUpdateInputState
        });
        const handleFileSelection = (event) => {
            const files = event.target.files;
            if (!files) return;
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const normalized = await normalizeImageForChatUpload(e.target.result, file.type, file.name);
                    uploadedFiles.push({
                        id: crypto.randomUUID(),
                        name: file.name,
                        type: normalized.type,
                        originalType: file.type,
                        size: file.size,
                        base64: normalized.base64,
                    });
                    renderFilePreviews();
                };
                reader.readAsDataURL(file);
            });
            event.target.value = '';
        };
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
        legacyRuntimeContext.registerLazyBinding('sidebar.toggleSidebar', () => toggleSidebar);

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
