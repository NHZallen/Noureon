import { highlightText } from '../../legacy-runtime/features/search-text-formatting.js';
import { createMediaAttachmentRenderer } from '../../legacy-runtime/features/media-attachment-renderer.js';
import { createMediaPreviewLifecycle } from '../../legacy-runtime/features/media-preview-lifecycle.js';
import { createConversationViewRenderer } from '../../legacy-runtime/features/conversation-view-renderer.js';
import { createUploadedFilePreviewLifecycle } from '../../legacy-runtime/features/uploaded-file-preview-lifecycle.js';
import { MODELS, modelGeneratesImages } from './model-registry.js';

const CHAT_IMAGE_MAX_SIZE = 1600;
const CHAT_IMAGE_QUALITY = 0.78;

const requiredDependencies = [
    'document',
    'elements',
    'getConfig',
    'getConversations',
    'getUploadedFiles',
    'setUploadedFiles',
    'getSidebarOpen',
    'setSidebarOpen',
    'escapeHTML',
    'renderUserText',
    'renderMarkdownWithFormulas',
    'loadChat',
    'toggleModal',
    'callApiWithSchema',
    'resolveUploadUpdateInputState',
    'i18n'
];

function assertRequiredDependencies(dependencies) {
    for (const key of requiredDependencies) {
        if (dependencies[key] == null) {
            throw new TypeError(`createLegacySearchUploadSidebarLifecycle missing dependency: ${key}`);
        }
    }
}

export function createLegacySearchUploadSidebarLifecycle(dependencies = {}) {
    assertRequiredDependencies(dependencies);

    const {
        window,
        document,
        navigator,
        fetch,
        File,
        FileReaderCtor = globalThis.FileReader,
        ImageCtor = globalThis.Image,
        randomUUID = () => globalThis.crypto?.randomUUID?.(),
        scheduleTimeout = (...args) => setTimeout(...args),
        clearScheduledTimeout = (...args) => clearTimeout(...args),
        elements: ALL_ELEMENTS,
        getConfig,
        getConversations,
        getUploadedFiles,
        setUploadedFiles,
        getSidebarOpen,
        setSidebarOpen,
        escapeHTML,
        renderUserText,
        renderMarkdownWithFormulas,
        loadChat,
        toggleModal,
        callApiWithSchema,
        resolveUploadUpdateInputState,
        i18n,
        logger = console
    } = dependencies;

    const {
        getInlineMediaSrc: getSearchInlineMediaSrc,
        renderMediaAttachmentGrid: renderSearchMediaAttachmentGrid
    } = createMediaAttachmentRenderer({ escapeHTML });

    const {
        openMediaPreview: openSearchMediaPreview,
        bindMediaPreviewButtons: bindSearchMediaPreviewButtons
    } = createMediaPreviewLifecycle({
        document,
        navigator,
        fetch,
        File,
        escapeHTML,
        getInlineMediaSrc: getSearchInlineMediaSrc,
        getUiLanguage: () => getConfig().uiLanguage,
        getText: (key, fallback) => i18n[getConfig().uiLanguage]?.[key] || fallback
    });

    const searchConversationViewRenderer = createConversationViewRenderer({
        document,
        renderUserText,
        renderModelText: renderMarkdownWithFormulas,
        renderMediaAttachmentGrid: renderSearchMediaAttachmentGrid,
        bindMediaPreviewButtons: bindSearchMediaPreviewButtons
    });

    const getText = (key, fallback = '') => i18n[getConfig().uiLanguage]?.[key] || fallback;

    const generateSearchKeywords = async (naturalQuery) => {
        const prompt = `分析以下自然語言查詢，提取 5-10 個最相關的核心關鍵字。對於每個關鍵字，根據其在查詢中的重要性，給予一個 1 到 10 的權重分數（10為最重要）。請嚴格按照以下 JSON 格式輸出，不要有任何額外的文字或解釋。
範例:
查詢: "去年夏天在巴黎鐵塔附近吃的最好吃的法國可麗餅是什麼？"
輸出: [{"keyword": "可麗餅", "weight": 10}, {"keyword": "巴黎鐵塔", "weight": 9}, {"keyword": "法國", "weight": 7}, {"keyword": "吃", "weight": 5}, {"keyword": "去年夏天", "weight": 4}]
查詢內容：${naturalQuery}`;
        const responseSchema = {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    keyword: { type: 'STRING' },
                    weight: { type: 'INTEGER', minimum: 1, maximum: 10 }
                },
                required: ['keyword', 'weight']
            },
            minItems: 3,
            maxItems: 10
        };
        return await callApiWithSchema(prompt, responseSchema);
    };

    const calculateRelevanceScores = (weightedKeywords) => {
        const conversations = getConversations();
        const results = [];
        const processedConvIds = new Set();
        const totalWeightSum = weightedKeywords.reduce((sum, kw) => sum + kw.weight, 0);

        conversations
            .filter(c => !c.deletedAt)
            .forEach(conv => {
                if (processedConvIds.has(conv.id)) return;
                let totalScore = 0;
                let maxPossibleScore = 0;
                const foundKeywords = new Set();
                let bestSnippet = '';
                const totalMessages = conv.messages.length;
                weightedKeywords.forEach(kw => {
                    const keywordLower = kw.keyword.toLowerCase();
                    maxPossibleScore += kw.weight * 10;
                    if (conv.title.toLowerCase().includes(keywordLower)) {
                        totalScore += kw.weight * 10;
                        foundKeywords.add(keywordLower);
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
                    results.push({
                        conv,
                        titleHTML: highlightText(conv.title, allKeywordsQuery),
                        snippetHTML: highlightText(bestSnippet, allKeywordsQuery),
                        score: finalScore
                    });
                    processedConvIds.add(conv.id);
                }
            });
        return results;
    };

    const showConversationInViewModal = (convId) => {
        const conv = getConversations().find(c => c.id === convId);
        if (!conv) return;
        ALL_ELEMENTS.searchViewTitle.textContent = conv.title;
        const contentContainer = ALL_ELEMENTS.searchViewContent;
        searchConversationViewRenderer.renderConversationMessages({
            conversation: conv,
            contentContainer,
            emptyHTML: `<p class="text-center text-[var(--text-secondary)]">${getText('noMessages', 'No messages')}</p>`
        });
        ALL_ELEMENTS.searchViewConfirmBtn.dataset.id = convId;
        toggleModal(ALL_ELEMENTS.searchViewModal, true);
    };

    const performSearchAndRenderResults = async () => {
        const config = getConfig();
        const conversations = getConversations();
        const query = ALL_ELEMENTS.modalSearchInput.value.trim();
        const scope = ALL_ELEMENTS.modalSearchScopeSelect.value;
        const container = ALL_ELEMENTS.searchResultsContainer;
        container.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${getText('searching', 'Searching...')}</p>`;
        if (!query) {
            container.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${getText('searchPrompt')}</p>`;
            return;
        }

        let results = [];
        if (scope === 'natural') {
            try {
                const weightedKeywords = await generateSearchKeywords(query);
                if (!weightedKeywords || weightedKeywords.length === 0) {
                    throw new Error(getText('keywordGenerationFailed', 'Keyword generation failed.'));
                }
                results = calculateRelevanceScores(weightedKeywords);
            } catch (error) {
                container.innerHTML = `<p class="text-center text-red-500">${error.message}</p>`;
                return;
            }
        } else {
            const lowerCaseQuery = query.toLowerCase();
            const searchIn = scope === 'keyword-title' ? ['title'] : ['title', 'content'];
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
            container.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${getText('noResultsFound', 'No results found')}</p>`;
            return;
        }

        results.forEach(({ conv, titleHTML, snippetHTML, score }) => {
            const item = document.createElement('div');
            item.className = 'p-3 rounded-md hover:bg-[var(--hover-bg)] border border-transparent hover:border-[var(--border-color)]';
            item.dataset.id = conv.id;
            const scoreHTML = scope === 'natural' ? `
                    <div class="flex items-center gap-2 mt-2">
                        <div class="w-full bg-gray-200 rounded-full h-2.5">
                            <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${score}%"></div>
                        </div>
                        <span class="text-sm font-medium text-gray-500">${score}</span>
                    </div>
                ` : '';
            item.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex-1 min-w-0">
                            <div class="font-medium truncate">${titleHTML || highlightText(conv.title, query)}</div>
                            ${snippetHTML ? `<p class="text-xs text-[var(--text-secondary)] mt-1 truncate">${snippetHTML}</p>` : ''}
                        </div>
                        <button data-id="${conv.id}" class="search-view-btn ml-2 flex-shrink-0 text-xs bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full hover:bg-blue-200">${getText('view', 'View')}</button>
                    </div>
                    ${scoreHTML}
                `;
            const titleArea = item.querySelector('.flex-1');
            titleArea.addEventListener('click', () => {
                loadChat(conv.id);
                toggleSidebar(false);
                toggleModal(ALL_ELEMENTS.searchModal, false);
                ALL_ELEMENTS.openSearchBtn.classList.remove('active');
            });
            const viewBtn = item.querySelector('.search-view-btn');
            viewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConversationInViewModal(conv.id);
            });
            let pressTimer = null;
            item.addEventListener('touchstart', (e) => {
                if (e.target.closest('button')) return;
                pressTimer = scheduleTimeout(() => {
                    e.preventDefault();
                    showConversationInViewModal(conv.id);
                }, 500);
            }, { passive: false });
            item.addEventListener('touchend', () => clearScheduledTimeout(pressTimer));
            item.addEventListener('touchmove', () => clearScheduledTimeout(pressTimer));
            container.appendChild(item);
        });
    };

    const normalizeImageForChatUpload = (dataUrl, mimeType, fileName = 'image') => new Promise((resolve) => {
        mimeType = mimeType || '';
        if (!mimeType.startsWith('image/') || mimeType === 'image/gif' || typeof ImageCtor !== 'function') {
            resolve({ base64: dataUrl, type: mimeType });
            return;
        }
        const img = new ImageCtor();
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
            logger.warn?.(`Could not normalize uploaded image for chat: ${fileName}`);
            resolve({ base64: dataUrl, type: mimeType });
        };
        img.src = dataUrl;
    });

    const {
        renderFilePreviews,
        removeFile
    } = createUploadedFilePreviewLifecycle({
        document,
        getFiles: getUploadedFiles,
        setFiles: setUploadedFiles,
        getContainer: () => ALL_ELEMENTS.filePreviewContainer,
        getInputWrapper: () => document.querySelector('.input-wrapper'),
        openMediaPreview: openSearchMediaPreview,
        updateInputState: resolveUploadUpdateInputState
    });

    const handleFileSelection = (event) => {
        const files = event.target.files;
        if (!files || typeof FileReaderCtor !== 'function') return;
        Array.from(files).forEach(file => {
            const reader = new FileReaderCtor();
            reader.onload = async (e) => {
                const modelInfo = MODELS.find((model) => model.id === getConfig().lastUsedModel);
                const isStepImageEdit = modelInfo?.provider === 'stepfun' && modelGeneratesImages(modelInfo);
                if (isStepImageEdit && !file.type.startsWith('image/')) {
                    logger.warn?.('Step Image Edit 2 only accepts image uploads.');
                    return;
                }
                if (isStepImageEdit && getUploadedFiles().length > 0) {
                    logger.warn?.('Step Image Edit 2 only accepts one image attachment.');
                    return;
                }
                const normalized = await normalizeImageForChatUpload(e.target.result, file.type, file.name);
                setUploadedFiles([
                    ...getUploadedFiles(),
                    {
                        id: randomUUID(),
                        name: file.name,
                        type: normalized.type,
                        originalType: file.type,
                        size: file.size,
                        base64: normalized.base64,
                    }
                ]);
                renderFilePreviews();
            };
            reader.readAsDataURL(file);
        });
        event.target.value = '';
    };

    function toggleSidebar(show) {
        const { sidebar, sidebarOverlay, appContainer } = ALL_ELEMENTS;
        const nextSidebarOpen = typeof show === 'boolean' ? show : !getSidebarOpen();
        const sidebarOpen = setSidebarOpen(nextSidebarOpen);
        sidebar.classList.toggle('open', sidebarOpen);

        if (window.innerWidth >= 1024) {
            appContainer.classList.toggle('sidebar-open', sidebarOpen);
        } else if (sidebarOpen) {
            sidebar.style.transform = 'translateX(0)';
            sidebarOverlay.classList.add('visible');
        } else {
            sidebar.style.transform = 'translateX(-100%)';
            sidebarOverlay.classList.remove('visible');
        }
    }

    return {
        performSearchAndRenderResults,
        showConversationInViewModal,
        generateSearchKeywords,
        calculateRelevanceScores,
        renderFilePreviews,
        removeFile,
        handleFileSelection,
        toggleSidebar
    };
}
