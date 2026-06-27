import { installTouchGuards } from '/src/pwa/touch-guards.js';
import { registerServiceWorker } from '/src/pwa/register-service-worker.js';
import { normalizeFolderColorSelection, resolveFolderColor } from '/src/utils/folder-colors.js';
import { getTextColorForBackground } from '/src/utils/color-contrast.js';
import { getMessageTypeIcon } from '/src/app/legacy-runtime/features/message-type-icon.js';
import { formatFullTimestamp } from '/src/app/legacy-runtime/features/date-formatting.js';
import { buildTimeDistributionChartData } from '/src/app/legacy-runtime/features/time-distribution-chart-data.js';
import { buildConversationMobileContextMenuMarkup, buildFolderMobileContextMenuMarkup, buildAstraMobileContextMenuMarkup } from '/src/app/legacy-runtime/features/mobile-context-menu-markup.js';
import { getOpenCouncilDetailKeys, restoreOpenCouncilDetails, isCouncilComparisonSummary, normalizeCouncilComparisonDetails, hasUnclosedCouncilDetails } from '/src/app/legacy-runtime/features/streaming-council-details.js';
import { createStreamingTextFrameQueue } from '/src/app/legacy-runtime/features/streaming-text-frame-queue.js';
import { createTypewriterPlaybackController } from '/src/app/legacy-runtime/features/typewriter-playback-controller.js';
import { appendRendererTextGradually } from '/src/app/legacy-runtime/features/renderer-gradual-append-controller.js';
import { createStreamingMarkdownFeature } from '/src/app/legacy-runtime/features/streaming-markdown-renderer.js';
import { createSingleModelResponseLifecycle } from '/src/app/legacy-runtime/features/single-model-response-lifecycle.js';
import { runCouncilResponseRenderLifecycle } from '/src/app/legacy-runtime/features/council-response-render-lifecycle.js';
import { finalizeAssistantResponse, persistAssistantResponseError } from '/src/app/legacy-runtime/features/assistant-response-finalization.js';
import { runSubmitFinalCleanupLifecycle } from '/src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js';
import { applyModelMessagePostResponseActions } from '/src/app/legacy-runtime/features/model-message-post-response-actions.js';
import { buildMessageRenderView } from '/src/app/legacy-runtime/features/message-markup-renderer.js';
import { createMediaAttachmentRenderer as createArchivedMediaAttachmentRenderer } from '/src/app/legacy-runtime/features/media-attachment-renderer.js';
import { createMediaPreviewLifecycle as createArchivedMediaPreviewLifecycle } from '/src/app/legacy-runtime/features/media-preview-lifecycle.js';
import { createConversationViewRenderer as createArchivedConversationViewRenderer } from '/src/app/legacy-runtime/features/conversation-view-renderer.js';
import { createSidebarAstrasLifecycle } from '/src/app/legacy-runtime/features/sidebar-astras-lifecycle.js';
import { createModelUsageChartLifecycle } from '/src/app/legacy-runtime/features/model-usage-chart-lifecycle.js';
import { createLegacyRuntimeContext } from '/src/app/legacy-runtime/runtime/legacy-runtime-context.js';
import { createConversationStateAccess } from '/src/app/legacy-runtime/runtime/conversation-state-access.js';
import { createRuntimeRenderCoordinator } from '/src/app/legacy-runtime/runtime/runtime-render-coordinator.js';
import { createRuntimeDialogCoordinator } from '/src/app/legacy-runtime/runtime/runtime-dialog-coordinator.js';
import { createRuntimeConfigAccess } from '/src/app/legacy-runtime/runtime/runtime-config-access.js';
import { createRuntimeDomAccess } from '/src/app/legacy-runtime/runtime/runtime-dom-access.js';
import { createActiveConversationStore } from '/src/app/runtime/kernel/active-conversation-store.js';
import { createLegacyRuntimeDomRegistry } from '/src/app/runtime/kernel/dom-registry.js';
import { createRuntimeAppKernel } from '/src/app/runtime-app.js';
import { createLegacyRuntimeStorageAdapter } from '/src/app/runtime/kernel/storage-adapter.js';
import { createLegacyRuntimeConfigPersistence } from '/src/app/runtime/kernel/config-persistence.js';
import {
    normalizeApiKeyValue,
    normalizeLoadedLegacyConfig
} from '/src/app/runtime/kernel/config-normalization.js';
import { normalizeLoadedLegacyAppData } from '/src/app/runtime/kernel/app-data-normalization.js';
import { createLegacyRuntimeAppDataPersistence } from '/src/app/runtime/kernel/app-data-persistence.js';
import {
    createSensitiveConfigPersistence,
    createSensitiveConfigStore
} from '/src/app/runtime/security/sensitive-config-store.js';
import { removeSensitiveConfig } from '/src/app/runtime/security/sensitive-config-redaction.js';
import {
    CHEAP_MODEL_ID,
    COUNCIL_MAX_MODELS,
    COUNCIL_MIN_MODELS,
    COUNCIL_RESPONSE_CHAR_LIMIT,
    COUNCIL_RETRY_DELAY_MS,
    COUNCIL_TEXT,
    MODELS,
    OPENROUTER_VISION_MODELS,
    createLegacyModelRegistry
} from '/src/app/runtime/legacy-core/model-registry.js';

const legacyRuntimeContext = createLegacyRuntimeContext();
const resolveFoundationUpdateInputState = (...args) => legacyRuntimeContext.resolveBinding('input.updateInputState')(...args);
const { marked, DOMPurify, Chart, JSZip, Cropper, katex, Peer, QRCode, Html5Qrcode } = globalThis;
const i18n = globalThis.i18n;
const demoConversations = globalThis.demoConversations;
const OFFICIAL_ASTRAS = globalThis.OFFICIAL_ASTRAS;
const updateLogs = globalThis.updateLogs;

const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[char]));

const renderUserText = (value = '') => escapeHTML(value).replace(/\n/g, '<br>');

const sanitizeTrustedHTML = (value = '') => {
    if (DOMPurify?.sanitize) {
        return DOMPurify.sanitize(String(value));
    }
    return escapeHTML(value);
};

const readErrorBody = async (response) => {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { error: { message: text || response.statusText } };
    }
};

const getErrorMessage = (errorBody, fallback = 'API 請求失敗') => (
    errorBody?.error?.message ||
    errorBody?.message ||
    fallback
);

const postJsonWithReadableError = async (url, data, options = {}) => {
    const request = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', ...(options.headers || {}) },
        body: JSON.stringify(data),
        signal: options.signal
    };
    let response;
    try {
        response = await fetch(url, request);
    } catch (error) {
        if (options.allowOpaqueFallback !== false) {
            await fetch(url, { ...request, mode: 'no-cors' });
            return { ok: true, opaque: true };
        }
        throw error;
    }

    if (!response.ok) {
        const errorBody = await readErrorBody(response);
        throw new Error(getErrorMessage(errorBody, `HTTP ${response.status}`));
    }

    return response;
};

const getBackupUsername = (rawData) => rawData?.backup_identity?.username || rawData?.user_credentials?.username || '';

async function processInChunks(items, processFn, chunkSize = 50, onProgress) {
    const total = items.length;
    let index = 0;

    while (index < total) {
        const chunk = items.slice(index, index + chunkSize);
        await Promise.all(chunk.map((item) => processFn(item)));
        index += chunk.length;

        if (onProgress) {
            onProgress(index, total);
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
    document.addEventListener('DOMContentLoaded', () => {
        // 直接讓登入/註冊畫面顯示出來
        document.getElementById('auth-container').classList.add('visible');
        
            const demoModels = [
  { id: 'proMax', name: 'Astra-Pro Max', title: 'Astra-Pro Max 對話範例', desc: '深度決策，商業研究最佳拍檔' },
  { id: 'proPV', name: 'Astra-Pro PV', title: 'Astra-Pro PV 對話範例', desc: '預覽新技術，多模態高速體驗' },
  { id: 'pro', name: 'Astra-Pro', title: 'Astra-Pro 對話範例', desc: '高效多模態，文檔圖像兼擅' },
  { id: 'plusPV', name: 'Astra-Plus PV', title: 'Astra-Plus PV 對話範例', desc: '輕量快速，日常應用即刻啟動' },
  { id: 'mini', name: 'Astra-Mini', title: 'Astra-Mini 對話範例', desc: '強大推理，長文與數理皆能' },
  { id: 'mill', name: 'Astra-Mill', title: 'Astra-Mill 對話範例', desc: '開源高效，短文生成與結構化' },
  { id: 'nano', name: 'Astra-Nano', title: 'Astra-Nano 對話範例', desc: '程式專精，技術代碼好幫手' },
];
            const selectorContainer = document.querySelector('.demo-model-selector');
            const chatWindow = document.getElementById('demo-chat-window');
            const chatTitle = document.getElementById('demo-chat-title');
            if (selectorContainer && chatWindow && chatTitle) {
                demoModels.forEach((model, index) => {
                    const button = document.createElement('button');
                    button.className = `selector-btn text-center p-3 rounded-lg border-2 border-gray-200 bg-white ${index === 0 ? 'active' : ''}`;
                    button.dataset.modelId = model.id;
                    button.innerHTML = `
                        <div class="font-semibold text-sm text-gray-800">${model.name}</div>
                        <div class="text-xs text-gray-500">${model.desc}</div>
                    `;
                    selectorContainer.appendChild(button);
                    const contentDiv = document.createElement('div');
                    contentDiv.id = `demo-chat-${model.id}`;
                    contentDiv.className = `demo-chat-content space-y-6 ${index === 0 ? 'active' : ''}`;
                    contentDiv.innerHTML = demoConversations[model.id];
                    chatWindow.appendChild(contentDiv);
                });
                selectorContainer.addEventListener('click', (e) => {
                    const button = e.target.closest('.selector-btn');
                    if (!button) return;
                    const modelId = button.dataset.modelId;
                    selectorContainer.querySelector('.active').classList.remove('active');
                    button.classList.add('active');
                    chatWindow.querySelector('.active').classList.remove('active');
                    document.getElementById(`demo-chat-${modelId}`).classList.add('active');
                    const modelInfo = demoModels.find(m => m.id === modelId);
                    chatTitle.textContent = modelInfo.title;
                });
            }
        });
        const ALL_ELEMENTS = createLegacyRuntimeDomRegistry();
        const runtimeDomAccess = createRuntimeDomAccess({
            getElements: () => ALL_ELEMENTS,
            logger: console
        });
        const arrangeInputMediaPreview = () => {
            const wrapper = document.querySelector('.input-wrapper');
            const preview = runtimeDomAccess.getOptionalElement('filePreviewContainer');
            if (!wrapper || !preview || preview.parentElement === wrapper) return;
            preview.className = 'input-media-preview empty:hidden';
            wrapper.insertBefore(preview, wrapper.firstChild);
        };
        arrangeInputMediaPreview();
        const settingsIcon = runtimeDomAccess.getOptionalElement('settingsBtn')?.querySelector('svg');
        if (settingsIcon) {
            settingsIcon.setAttribute('viewBox', '0 0 24 24');
            settingsIcon.innerHTML = '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.658 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.329 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.329 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.658 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.329-4.033 2.34 2.34 0 0 0 0-3.831 2.34 2.34 0 0 1 2.329-4.033 2.34 2.34 0 0 0 3.32-1.915"></path><circle cx="12" cy="12" r="3"></circle>';
        }
        function toggleHistorySidebar(show) {
    const { historySidebar, historySidebarOverlay } = ALL_ELEMENTS;
    if (show) {
        requestAnimationFrame(() => {
            setupMessageIntersectionObserver();
        });
        historySidebarOverlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            historySidebar.classList.add('visible');
            historySidebarOverlay.classList.add('visible');
        });
    } else {
        historySidebar.classList.remove('visible');
        historySidebarOverlay.classList.remove('visible');
        // 等待動畫結束後再徹底隱藏遮罩層
        historySidebarOverlay.addEventListener('transitionend', () => {
            if (!historySidebarOverlay.classList.contains('visible')) {
                historySidebarOverlay.classList.add('hidden');
            }
        }, { once: true });
    }
}

    // 渲染歷史訊息側邊欄的內容
    function renderHistorySidebarContent() {
    const historySidebarList = runtimeDomAccess.getRequiredElement('historySidebarList');
    const conv = getActiveConversation();
    
    historySidebarList.innerHTML = ''; // 先清空舊的列表


    if (!conv || conv.messages.length === 0) {
        historySidebarList.innerHTML = `<p class="p-4 text-sm text-center text-[var(--text-secondary)]">沒有歷史訊息</p>`;
        return;
    }


    conv.messages.forEach((msg, index) => {
        const textPart = msg.parts.find(p => p.text);
        let snippet = textPart ? textPart.text : (msg.role === 'user' ? '用戶訊息' : 'AI 回覆');
        
        const icon = getMessageTypeIcon(msg);
        
        const listItem = document.createElement('div');
        listItem.className = 'history-sidebar-item';
        listItem.dataset.messageIndex = index;
        
        // ✨ --- 以下是新增的核心邏輯 --- ✨
        
        // 1. 判斷訊息角色並獲取對應顏色設定
        const isUser = msg.role === 'user';
        const colorConfig = isUser ? USER_BUBBLE_COLORS : AI_BUBBLE_COLORS;
        const colorName = isUser ? config.userBubbleColor : config.aiBubbleColor;
        
        // 2. 根據當前主題（淺色/深色）取得正確的顏色碼
        const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        const bgColor = (colorConfig[colorName] || colorConfig['default'])[theme];


        // 3. 應用背景色，並稍微降低飽和度/增加透明度，讓它不那麼刺眼
        // 我們使用 RGBA 來添加透明度
        const rgbaColor = hexToRgba(bgColor, 0.4); // 40% 的透明度
        listItem.style.backgroundColor = rgbaColor;


        // 4. 根據背景色，自動決定文字顏色（黑或白）以確保可讀性
        listItem.style.color = getTextColorForBackground(bgColor);
        
        // ✨ --- 新增邏輯結束 --- ✨


        listItem.textContent = icon + snippet;
        historySidebarList.appendChild(listItem);
    });
}


    // 處理歷史訊息側邊欄的點擊事件
    function setupHistorySidebarInteractions() {
        const { historySidebarList, messageList } = ALL_ELEMENTS;


        historySidebarList.addEventListener('click', (e) => {
            const item = e.target.closest('.history-sidebar-item');
            if (!item) return;


            const messageIndex = item.dataset.messageIndex;
            if (messageIndex === undefined) return;


            // 根據索引找到主聊天視窗中對應的那則訊息
            const targetMessageElement = messageList.querySelector(`[data-message-index="${messageIndex}"]`);


            if (targetMessageElement) {
                // 讓訊息滾動到畫面中央
                targetMessageElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });


                // 添加高亮效果
                const bubble = targetMessageElement.querySelector('.message-bubble');
                if (bubble) {
                    bubble.classList.add('message-highlight');
                    // 1.5秒後移除高亮效果
                    setTimeout(() => {
                        bubble.classList.remove('message-highlight');
                    }, 1500);
                }


                // 點擊後自動關閉側邊欄
                toggleHistorySidebar(false);
            }
        });
    }


    // 設定觸發歷史訊息側邊欄的各種機制
    function setupHistorySidebarTriggers() {
    const { chatContainer, historySidebar, historySidebarTriggerZone, historySidebarOverlay } = ALL_ELEMENTS;


    // --- 點擊遮罩層來關閉 ---
    // 這是解決手機版關不掉問題最可靠的方法！
    historySidebarOverlay.addEventListener('click', () => {
        historySidebarOverlay.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });


    historySidebarOverlay.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;


        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        
        // 如果是向右滑動超過 50 像素，且不是垂直滑動
        if (deltaX > 50 && Math.abs(deltaY) < Math.abs(deltaX) / 2) {
            toggleHistorySidebar(false); // 執行關閉
        }
    }, { passive: true });
        toggleHistorySidebar(false);
    });


    // --- 電腦版：滑鼠懸停 ---
    historySidebarTriggerZone.addEventListener('mouseenter', () => {
        renderHistorySidebarContent(); 
        toggleHistorySidebar(true);
    });


    // 當滑鼠從側邊欄或遮罩層移開時，才關閉
    document.body.addEventListener('mousemove', (e) => {
        if (historySidebar.classList.contains('visible')) {
            const isOverSidebar = historySidebar.contains(e.target);
            const isOverTrigger = historySidebarTriggerZone.contains(e.target);
            if (!isOverSidebar && !isOverTrigger) {
                toggleHistorySidebar(false);
            }
        }
    });


    // --- 手機版：右往左滑動打開 ---
    let touchStartX = 0;
    let touchStartY = 0;


    chatContainer.addEventListener('touchstart', (e) => {
        // ✨ 修改：如果使用者按在表格滾動容器內，就不紀錄滑動起點（等於停用側邊欄手勢）
        if (e.target.closest('.table-scroll-container')) {
            touchStartX = null; // 設為 null 標記為無效
            return;
        }
        
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });


    chatContainer.addEventListener('touchend', (e) => {
        // ✨ 修改：如果起點是無效的 (null)，表示剛才按在表格上，直接結束不處理
        if (touchStartX === null) return;


        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;


        if (deltaX < -50 && Math.abs(deltaY) < Math.abs(deltaX) / 2) {
            renderHistorySidebarContent();
            toggleHistorySidebar(true);
        }
    }, { passive: true });


    // --- 手機版：在側邊欄上左往右滑動來關閉 (保留此快捷操作) ---
    historySidebar.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });


    historySidebar.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;


        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        
        if (deltaX > 50 && Math.abs(deltaY) < Math.abs(deltaX) / 2) {
            toggleHistorySidebar(false);
        }
    }, { passive: true });
}
        import { compareVersions } from '/src/app/legacy-runtime/features/version-compare.js';
        const FOLDER_COLORS = {
            black: '#000000',gray: '#808080', red: '#f87171', yellow: '#facc15', green: '#4ade80',
            blue: '#60a5fa', indigo: '#818cf8', purple: '#a78bfa', pink: '#f472b6',
        };
        const AI_BUBBLE_COLORS = {
            default: {light: '#f7f7f8', dark: '#1f2937'},
            gray: {light: '#f3f4f6', dark: '#374151'},
            blue: {light: '#eef6ff', dark: '#1e3a5f'},
            green: {light: '#eef8f1', dark: '#1f4d35'},
            yellow: {light: '#fff9db', dark: '#5f4b12'},
            orange: {light: '#fff3e8', dark: '#613a1f'},
            red: {light: '#fff1f2', dark: '#5f2a2f'},
            purple: {light: '#f6f0ff', dark: '#44315f'},
            pink: {light: '#fff0f6', dark: '#5f2a44'},
            teal: {light: '#ecfdf7', dark: '#1f4f4a'},
        };
        const USER_BUBBLE_COLORS = {
            default: {light: '#e8f3ff', dark: '#223958'},
            gray: {light: '#eef0f3', dark: '#374151'},
            blue: {light: '#e8f3ff', dark: '#223958'},
            green: {light: '#eaf7ef', dark: '#254936'},
            yellow: {light: '#fff7d6', dark: '#59491b'},
            orange: {light: '#fff0e3', dark: '#5b3825'},
            red: {light: '#ffedf0', dark: '#5c2b32'},
            purple: {light: '#f2ecff', dark: '#3f315a'},
            pink: {light: '#ffedf5', dark: '#5a2b43'},
            teal: {light: '#e7f8f5', dark: '#234a48'},
        };
        const UI_THEME_COLORS = {
            Red: '#ef4444', Orange: '#f97316', Amber: '#f59e0b',
            Yellow: '#eab308', Lime: '#84cc16', Green: '#22c55e',
            Emerald: '#10b981', Teal: '#14b8a6', Cyan: '#06b6d4',
            Sky: '#0ea5e9', Blue: '#3b82f6', Indigo: '#6366f1',
            Violet: '#8b5cf6', Purple: '#a855f7', Fuchsia: '#d946ef',
            Pink: '#ec4899', Rose: '#f43f5e', Slate: '#64748b'
        };
        const runtimeAppKernel = createRuntimeAppKernel({
            elements: ALL_ELEMENTS,
            defaultModelId: MODELS[0].id
        });
        const runtimeAppDataStore = runtimeAppKernel.appDataStore;
        let conversations = runtimeAppDataStore.getConversations();
        let folders = runtimeAppDataStore.getFolders();
        let astras = runtimeAppDataStore.getAstras();
        const activeConversationStore = createActiveConversationStore(null);
        const conversationStateAccess = createConversationStateAccess({
            getConversations: () => conversations,
            getCurrentConversationId: () => activeConversationStore.getActiveConversationId(),
            setCurrentConversationId: (id) => activeConversationStore.setActiveConversationId(id)
        });
        const runtimeConfigStore = runtimeAppKernel.configStore;
        let config = runtimeConfigStore.getConfig();
        const runtimeConfigAccess = createRuntimeConfigAccess({
            getConfig: () => runtimeConfigStore.getConfig(),
            replaceConfig: (nextConfig) => runtimeConfigStore.replaceConfig(nextConfig),
            syncConfig: (nextConfig) => { config = nextConfig; }
        });
        const getCouncilTexts = () => {
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            return COUNCIL_TEXT[uiLanguage] || COUNCIL_TEXT['zh-TW'];
        };
        const legacyModelRegistry = createLegacyModelRegistry({
            getConfig: () => runtimeConfigAccess.getConfig(),
            normalizeConversationModel: (conv) => normalizeConversationModel(conv)
        });
        const {
            getDefaultCouncilConfig,
            getCanonicalModelId,
            normalizeCouncilConfig,
            cloneCouncilConfig,
            isCouncilEnabled,
            getVisibleCouncilModels,
            getModelsByIds,
            getCouncilSelectedModels,
            getModelApiId,
            getProviderLabel,
            getModelFamilyKey,
            getModelFamilyName,
            modelSupportsUploadedFile,
            modelSupportsVision,
            modelSupportsDocumentUpload,
            modelSupportsCouncilTranslation,
            getCouncilTranslatorCandidates,
            modelSupportsSingleTranslation,
            getSingleTranslatorCandidates,
            getCouncilTranslatorModel,
            getSingleDocumentTranslatorModel,
            modelUsesNativeWebSearch,
            modelUsesTavilySearch,
            modelSupportsWebSearch,
            hasSingleDocumentAccess,
            hasSingleWebSearchAccess,
            getCouncilSharedSearchModel,
            hasCouncilWebSearchAccess,
            conversationNeedsTavilySearch,
            getModelTiers
        } = legacyModelRegistry;
        const getOutputMode = () => config.outputMode === 'realtime' ? 'realtime' : 'typewriter';
        const getModelRetirementLabel = (model) => {
            const retirementDate = model?.retirementDate || model?.deprecationDate || model?.sunsetDate;
            if (!retirementDate) return '';
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            const label = uiLanguage === 'en'
                ? 'Retires'
                : (uiLanguage === 'fr' ? 'Retrait' : '下架');
            return `${label} ${retirementDate}`;
        };
        const getModelPriceLabel = (model) => {
            if (!model) return '';
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            if (getModelTiers(model).includes('free')) return uiLanguage === 'en' ? 'Free' : '免費';
            const priceKey = model.descriptionKey ? `${model.descriptionKey}_tier_paid` : '';
            const localizedPrice = priceKey ? i18n[uiLanguage]?.[priceKey] : '';
            if (localizedPrice) return localizedPrice;
            if (model.provider === 'gemini') return uiLanguage === 'en' ? 'Google API pricing' : 'Google API 計費';
            if (model.provider === 'openrouter') return uiLanguage === 'en' ? 'OpenRouter pricing' : 'OpenRouter 計費';
            if (model.provider === 'stepfun') return 'Step Plan credits';
            return uiLanguage === 'en' ? 'Provider pricing' : '供應商計費';
        };
        const getCouncilRuntimeTexts = () => {
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            if (uiLanguage === 'en') {
                return {
                    visualOnly: 'visual participants',
                    skipped: 'skipped',
                    noVisionParticipants: 'At least one participant model must support images for this council request',
                    skippedVisualReason: 'Skipped because this model does not support the attached image/video',
                    sharedSearch: 'Shared search packet',
                    searchRunning: 'Searching once for shared council context',
                    searchDone: 'Shared search packet ready',
                    searchFailed: 'Shared search failed; continuing without it',
                    firstRound: 'Council members are thinking',
                    deliberation: 'Council members are revising',
                    synthesis: 'Synthesizer is combining the council',
                    completed: 'Council completed',
                    pending: 'Waiting',
                    running: 'Thinking',
                    done: 'Done',
                    failed: 'Failed',
                    skippedStatus: 'Skipped',
                    activeVisionNote: 'Only image-capable members will answer this image request.',
                    comparisonToggle: 'Summarize agreements and differences',
                    retrying: 'Retrying once',
                    councilLocked: 'Council is running; settings are locked until this reply finishes.',
                    searchManualNotice: 'Council mode does not enable Search automatically. Turn on Search before sending if this question needs current web information.',
                    searchEnabledNote: 'Search is on: the council will use one shared search packet.'
                };
            }
            if (uiLanguage === 'fr') {
                return {
                    visualOnly: 'participants visuels',
                    skipped: 'ignoré',
                    noVisionParticipants: 'Au moins un modèle participant doit prendre en charge les images pour cette demande',
                    skippedVisualReason: 'Ignoré car ce modèle ne prend pas en charge l’image/vidéo jointe',
                    sharedSearch: 'Dossier de recherche partagé',
                    searchRunning: 'Recherche unique du contexte partagé du conseil',
                    searchDone: 'Dossier de recherche partagé prêt',
                    searchFailed: 'La recherche partagée a échoué; poursuite sans elle',
                    firstRound: 'Les membres du conseil réfléchissent',
                    deliberation: 'Les membres du conseil révisent',
                    synthesis: 'Le synthétiseur combine le conseil',
                    completed: 'Conseil terminé',
                    pending: 'En attente',
                    running: 'Réflexion',
                    done: 'Terminé',
                    failed: 'Échec',
                    skippedStatus: 'Ignoré',
                    activeVisionNote: 'Seuls les membres capables de traiter les images répondront à cette demande.',
                    comparisonToggle: 'Résumer les accords et différences',
                    retrying: 'Nouvelle tentative',
                    councilLocked: 'Le conseil est en cours; les réglages sont verrouillés jusqu’à la fin de la réponse.',
                    searchManualNotice: 'Le mode conseil n’active pas la recherche automatiquement. Activez Recherche avant l’envoi si la question demande des informations actuelles.',
                    searchEnabledNote: 'Recherche activée : le conseil utilisera un seul dossier de recherche partagé.'
                };
            }
            return {
                visualOnly: '可看圖理事',
                skipped: '略過',
                noVisionParticipants: '這次含圖片，至少要有一個支援圖片的理事模型',
                skippedVisualReason: '此模型不支援圖片/影片附件，因此本輪略過',
                sharedSearch: '共同搜尋資料包',
                searchRunning: '正在先搜尋一次，建立理事會共同資料包',
                searchDone: '共同搜尋資料包已完成',
                searchFailed: '共同搜尋失敗，將不帶搜尋資料繼續',
                firstRound: '理事正在各自思考',
                deliberation: '理事正在第二輪修正',
                synthesis: '統整模型正在整理結論',
                completed: '理事會完成',
                pending: '等待',
                running: '思考中',
                done: '完成',
                failed: '失敗',
                skippedStatus: '略過',
                activeVisionNote: '這次含圖片，只有支援圖片的理事會回答。',
                comparisonToggle: '整理共識與差異',
                retrying: '重試一次中',
                councilLocked: '理事會運作中，回覆完成前不能變更設定。',
                searchManualNotice: '模型理事會不會自動開啟搜尋；如果問題需要最新資訊，請送出前手動開啟搜尋。',
                searchEnabledNote: '搜尋已開啟：理事會會共用同一份搜尋資料包。'
            };
        };
        const isVisualUploadedFile = (file) => {
            const mimeType = file?.type || file?.mimeType || file?.inlineData?.mimeType || '';
            return mimeType.startsWith('image/') || mimeType.startsWith('video/');
        };
        const getUploadedFileKind = (file) => isVisualUploadedFile(file) ? 'visual' : 'document';
        const isUploadedAttachmentLike = (file) => Boolean(file?.inlineData || file?.base64 || file?.type || file?.mimeType);
        const getCouncilVisualFiles = (files = uploadedFiles) => (files || []).filter(file => isUploadedAttachmentLike(file) && isVisualUploadedFile(file));
        const getCouncilDocumentFiles = (files = uploadedFiles) => (files || []).filter(file => isUploadedAttachmentLike(file) && !isVisualUploadedFile(file));
        const getCouncilAttachmentTranslationNeed = (models = [], files = uploadedFiles) => {
            const selectedModels = (models || []).filter(Boolean);
            const visualFiles = getCouncilVisualFiles(files);
            const documentFiles = getCouncilDocumentFiles(files);
            const needsVisualPacket = visualFiles.length > 0 && selectedModels.some(model => !modelSupportsVision(model));
            const needsDocumentPacket = documentFiles.length > 0 && selectedModels.some(model => !modelSupportsDocumentUpload(model));
            return {
                needsVisualPacket,
                needsDocumentPacket,
                needsAnyPacket: needsVisualPacket || needsDocumentPacket,
                visualFiles,
                documentFiles
            };
        };
        const getCouncilRunnableParticipants = (participants = [], files = uploadedFiles) => {
            const visualFiles = getCouncilVisualFiles(files);
            if (visualFiles.length === 0) {
                return { activeParticipants: participants, skippedParticipants: [] };
            }
            const activeParticipants = participants.filter(model => visualFiles.every(file => modelSupportsUploadedFile(model, file)));
            const skippedParticipants = participants.filter(model => !activeParticipants.some(active => active.id === model.id));
            return { activeParticipants, skippedParticipants };
        };
        const formatCouncilModelSummary = (models = [], limit = 3) => {
            const names = models.map(model => model?.name).filter(Boolean);
            if (names.length === 0) return '';
            if (names.length <= limit) return names.join(' / ');
            return `${names.slice(0, limit).join(' / ')} +${names.length - limit}`;
        };
        const getCouncilValidation = (conv, files = uploadedFiles) => {
            const texts = getCouncilTexts();
            const runtimeTexts = getCouncilRuntimeTexts();
            if (!isCouncilEnabled(conv)) {
                return { ok: true, message: '' };
            }
            conv.council = normalizeCouncilConfig(conv.council);
            const { council, participants, synthesizer } = getCouncilSelectedModels(conv);
            if (participants.length < COUNCIL_MIN_MODELS) {
                return { ok: false, reason: 'tooFew', message: texts.tooFew };
            }
            if (participants.length > COUNCIL_MAX_MODELS) {
                return { ok: false, reason: 'tooMany', message: texts.tooMany };
            }
            if (!council.synthesizerModelId || !synthesizer) {
                return { ok: false, reason: 'missingSynthesizer', message: texts.missingSynthesizer };
            }
            const selectedCouncilModels = [...participants, synthesizer].filter(Boolean);
            const translationNeed = getCouncilAttachmentTranslationNeed(selectedCouncilModels, files);
            const translatorModel = translationNeed.needsAnyPacket ? getCouncilTranslatorModel() : null;
            const tavilySearchModel = conv?.isWebSearchEnabled && modelUsesTavilySearch(synthesizer)
                ? { id: 'tavily-search', name: 'Tavily Search', provider: 'tavily' }
                : null;
            const missingKeyModels = [...selectedCouncilModels, ...(translatorModel ? [translatorModel] : []), ...(tavilySearchModel ? [tavilySearchModel] : [])]
                .filter((model, index, arr) => arr.findIndex(item => item.id === model.id) === index)
                .filter(model => !getApiKeyForProvider(model.provider));
            if (missingKeyModels.length > 0) {
                return {
                    ok: false,
                    reason: 'missingApiKey',
                    message: `${texts.missingApiKey}: ${missingKeyModels.map(model => model.name).join(', ')}`
                };
            }
            if (translationNeed.needsAnyPacket && !translatorModel) {
                return {
                    ok: false,
                    reason: 'missingCouncilTranslator',
                    message: config.uiLanguage === 'en'
                        ? 'Council attachments need a translator model that supports both vision and file upload. Choose one in Settings.'
                        : '理事會附件需要同時支援視覺與文件上傳的轉譯模型，請先到設定中選擇。'
                };
            }

            if (translationNeed.needsAnyPacket) {
                return {
                    ok: true,
                    reason: 'readyWithAttachmentTranslation',
                    message: `${texts.ready} · ${config.uiLanguage === 'en' ? 'attachment translator' : '附件轉譯模型'}: ${translatorModel.name}`
                };
            }
            return { ok: true, reason: 'ready', message: texts.ready };
        };
        let itemToRename = { id: null, type: null };
        let currentUser = null;
        let abortController = null;
        let isCouncilRunning = false;
        let isSelectionMode = false;
        let selectedConversationIds = new Set();
        let uploadedFiles = [];
        let sendConfirmed = false;
        let sidebarOpen = false;
        let isFollowUpExpanded = true;
        let editingAstrasId = null;
        let currentSpeechRecognition = null;
        let currentVoiceTarget = null;
        let modelPieChart = null;
        let timeDistChart = null;
        let cropperInstance = null;
        let messageObserver = null;
        let currentStoreCategory = '全部';
        let editingAstraForAvatarId = null;
        let isAutoScrolling = false;
        const runtimeStorageAdapter = createLegacyRuntimeStorageAdapter({
            indexedDBFactory: indexedDB,
            dbName: 'ChatAppDB',
            storeName: 'keyValue',
            version: 1
        });
        const { getItem, setItem, removeItem } = runtimeStorageAdapter;
        const sensitiveConfigStore = createSensitiveConfigStore({
            initialApiKeys: config.apiKeys,
            normalizeApiKeyValue
        });
        const runtimeSensitiveConfigPersistence = createSensitiveConfigPersistence({
            getCurrentUser: () => currentUser,
            getItem,
            setItem,
            removeItem,
            getApiKeys: () => sensitiveConfigStore.getApiKeys(),
            replaceApiKeys: (apiKeys) => sensitiveConfigStore.replaceApiKeys(apiKeys)
        });
        const getSensitiveApiKeys = () => sensitiveConfigStore.getApiKeys();
        const setApiKeyForProvider = (provider, value) => sensitiveConfigStore.setApiKey(provider, value);
        const mergeSensitiveApiKeys = (apiKeys) => sensitiveConfigStore.mergeApiKeys(apiKeys);
        const clearSensitiveApiKeys = () => sensitiveConfigStore.clearApiKeys();
        const saveSensitiveConfig = async () => { await runtimeSensitiveConfigPersistence.saveSensitiveConfig(); };
        function getApiKeyForProvider(provider) {
            return sensitiveConfigStore.getApiKey(provider);
        }
        function normalizeConversationModel(conv) {
            if (!conv) return null;
            const canonicalModelId = getCanonicalModelId(conv.model);
            let modelInfo = MODELS.find(m => m.id === canonicalModelId);
            if (!modelInfo) {
                modelInfo = MODELS.find(m => m.id === config.defaultModel) || MODELS[0];
            }
            conv.model = modelInfo.id;
            conv.provider = modelInfo.provider;
            return modelInfo;
        }

        function submitChatForm() {
            const form = ALL_ELEMENTS?.chatForm;
            if (!form) return;
            if (typeof SubmitEvent === 'function') {
                form.dispatchEvent(new SubmitEvent('submit', {
                    bubbles: true,
                    cancelable: true,
                    submitter: ALL_ELEMENTS?.submitButton || null
                }));
            } else {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }
        const hashString = async (str) => {
            const data = new TextEncoder().encode(str);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };
        const bytesToHex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const hexToBytes = (hex) => new Uint8Array((hex.match(/.{1,2}/g) || []).map(byte => parseInt(byte, 16)));
        const constantTimeEqual = (a, b) => {
            if (a.length !== b.length) return false;
            let diff = 0;
            for (let i = 0; i < a.length; i += 1) {
                diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
            }
            return diff === 0;
        };
        const derivePasswordHash = async (password, saltHex, iterations = 210000) => {
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                'PBKDF2',
                false,
                ['deriveBits']
            );
            const bits = await window.crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    hash: 'SHA-256',
                    salt: hexToBytes(saltHex),
                    iterations
                },
                keyMaterial,
                256
            );
            return bytesToHex(new Uint8Array(bits));
        };
        const createPasswordRecord = async (username, password) => {
            const saltBytes = new Uint8Array(16);
            window.crypto.getRandomValues(saltBytes);
            const passwordSalt = bytesToHex(saltBytes);
            const passwordIterations = 210000;
            const passwordHash = await derivePasswordHash(password, passwordSalt, passwordIterations);
            return {
                username,
                passwordHash,
                passwordSalt,
                passwordIterations,
                passwordKdf: 'PBKDF2-SHA-256'
            };
        };
        const verifyPasswordRecord = async (password, userRecord) => {
            if (userRecord?.passwordKdf === 'PBKDF2-SHA-256' && userRecord.passwordSalt) {
                const derivedHash = await derivePasswordHash(password, userRecord.passwordSalt, userRecord.passwordIterations || 210000);
                return constantTimeEqual(derivedHash, userRecord.passwordHash || '');
            }

            const legacyHash = await hashString(password);
            return constantTimeEqual(legacyHash, userRecord?.passwordHash || '');
        };
        const upgradeLegacyPasswordRecord = async (password, userKey, userRecord) => {
            if (userRecord?.passwordKdf === 'PBKDF2-SHA-256') return userRecord;
            const upgradedRecord = await createPasswordRecord(userRecord.username, password);
            await setItem(userKey, JSON.stringify(upgradedRecord));
            return upgradedRecord;
        };
        const hexToRgba = (hex, alpha = 1) => {
            if (!hex) return `rgba(255, 255, 255, ${alpha})`;
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (!result) return `rgba(255, 255, 255, ${alpha})`;
            const r = parseInt(result[1], 16);
            const g = parseInt(result[2], 16);
            const b = parseInt(result[3], 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        const getConfigKey = () => `chatConfig_v_v8.6_${currentUser.username}`;
        const getAppDataKey = () => `chatAppData_v8.6_${currentUser.username}`;
        const getUserKey = (username) => `chatUser_${username}`;
        const runtimeAppDataPersistence = createLegacyRuntimeAppDataPersistence({
            getCurrentUser: () => currentUser,
            getAppData: () => runtimeAppDataStore.getSnapshot(),
            getAppDataKey,
            setItem
        });
        const runtimeConfigPersistence = createLegacyRuntimeConfigPersistence({
            getCurrentUser: () => currentUser,
            getConfig: () => runtimeConfigStore.getConfig(),
            getConfigKey,
            setItem
        });
        const showNotification = (message, type = 'success') => {
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.textContent = message;
            ALL_ELEMENTS.notificationContainer.appendChild(notification);
            setTimeout(() => { notification.remove(); }, 3000);
        };
        const runtimeDialogCoordinator = createRuntimeDialogCoordinator({
            showNotification: (...args) => showNotification(...args),
            logger: console
        });
        const toggleModal = (modalElement, show) => {
            if (!modalElement) return;
            const closeTimers = toggleModal.closeTimers || (toggleModal.closeTimers = new WeakMap());
            if (show) {
                const existingTimer = closeTimers.get(modalElement);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                    closeTimers.delete(modalElement);
                }
                document.body.classList.add('modal-open');
                modalElement.classList.remove('hidden');
                requestAnimationFrame(() => {
                    modalElement.classList.add('visible');
                });
            } else {
                document.body.classList.remove('modal-open');
                modalElement.classList.remove('visible');
                const onTransitionEnd = () => {
                    modalElement.classList.add('hidden');
                    modalElement.removeEventListener('transitionend', onTransitionEnd);
                    const timer = closeTimers.get(modalElement);
                    if (timer) {
                        clearTimeout(timer);
                        closeTimers.delete(modalElement);
                    }
                };
                modalElement.addEventListener('transitionend', onTransitionEnd);
                const fallbackTimer = setTimeout(onTransitionEnd, 350);
                closeTimers.set(modalElement, fallbackTimer);
            }
        };
         document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal').forEach(m => {
    if (!m.classList.contains('visible')) {
      m.classList.add('hidden');   // display:none
      m.classList.remove('visible');
    }
  });
});
        const showCustomDialog = (options) => {
            return new Promise((resolve) => {
                const { title, message, input = null, buttons, dialogClass = '' } = options;
                const dialogBox = ALL_ELEMENTS.customDialogModal.querySelector('.bg-\\[var\\(--modal-bg\\)\\]');
                if (dialogClass) {
                    dialogBox.classList.add(dialogClass);
                }
                ALL_ELEMENTS.customDialogTitle.textContent = title;
                ALL_ELEMENTS.customDialogMessage.textContent = message;
                if (input) {
                    ALL_ELEMENTS.customDialogInput.type = input.type || 'text';
                    ALL_ELEMENTS.customDialogInput.value = '';
                    ALL_ELEMENTS.customDialogInput.placeholder = input.placeholder || '';
                    ALL_ELEMENTS.customDialogInputContainer.classList.remove('hidden');
                } else {
                    ALL_ELEMENTS.customDialogInputContainer.classList.add('hidden');
                }
                ALL_ELEMENTS.customDialogButtons.innerHTML = '';
                buttons.forEach(btnInfo => {
                    const button = document.createElement('button');
                    button.textContent = btnInfo.text;
                    button.className = btnInfo.class;
                    button.onclick = () => {
                        toggleModal(ALL_ELEMENTS.customDialogModal, false);
                        if (dialogClass) {
                            dialogBox.classList.remove(dialogClass);
                        }
                        const inputValue = input ? ALL_ELEMENTS.customDialogInput.value : null;
                        resolve(btnInfo.value(inputValue));
                    };
                    ALL_ELEMENTS.customDialogButtons.appendChild(button);
                });
                toggleModal(ALL_ELEMENTS.customDialogModal, true);
                if (input) { ALL_ELEMENTS.customDialogInput.focus(); }
            });
        };
        const showCustomConfirm = (message, title = '請確認') => showCustomDialog({ title, message, buttons: [{ text: '取消', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false }, { text: '確定', class: 'px-4 py-2 rounded-md btn-primary', value: () => true }] });
        const showCustomPrompt = (message, title = '請輸入', inputType = 'text') => showCustomDialog({ title, message, input: { type: inputType, placeholder: '請在此輸入...' }, buttons: [{ text: '取消', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => null }, { text: '確定', class: 'px-4 py-2 rounded-md btn-primary', value: (val) => val }] });
        const throttle = (func, limit) => {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        };
        const renderMarkdown = (text) => {
            const thinkingLabel = config.uiLanguage === 'en' ? 'Model thinking process' : '模型思考過程';
            const normalizedText = String(text || '').replace(/<think>([\s\S]*?)<\/think>/gi, (_, content) => {
                return `\n\n<details class="thinking-collapse"><summary>${thinkingLabel}</summary>\n\n${content.trim()}\n\n</details>\n\n`;
            });
            const dirty = marked.parse(normalizedText);
            const clean = DOMPurify.sanitize(dirty);
            const documentFragment = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html');
            documentFragment.body.querySelectorAll('table').forEach((table) => {
                if (table.parentElement?.classList.contains('table-scroll-container')) return;
                const wrapper = documentFragment.createElement('div');
                wrapper.className = 'table-scroll-container';
                table.replaceWith(wrapper);
                wrapper.appendChild(table);
            });

            return documentFragment.body.innerHTML;
        };
        /**
 * 渲染含有數學/化學公式的 Markdown 文本。
 * @param {string} text - 包含 Markdown 和 KaTeX 公式的原始文本。
 * @returns {string} - 渲染後的 HTML 字串。
 */
function renderMarkdownWithFormulas(text) {
    // 首先，使用您現有的函式處理基礎 Markdown 和安全性過濾
    let html = renderMarkdown(text);


    // 使用規則運算式來尋找並替換區塊級公式 ($$ ... $$)
    // marked.js 通常會把它們包在 <p>...</p> 裡面，所以我們匹配這種模式
    html = html.replace(/<p>\$\$(.*)\$\$<\/p>/g, (match, formula) => {
        try {
            // 將公式文字解碼 (例如 &lt; 會變回 <)
            const decodedFormula = new DOMParser().parseFromString(formula, "text/html").documentElement.textContent;
            // 使用 KaTeX 渲染成 HTML 字串 (displayMode: true 代表是區塊)
            return katex.renderToString(decodedFormula, {
                displayMode: true,
                throwOnError: false // 如果公式語法錯誤，不要拋出異常中斷程式
            });
        } catch (e) {
            console.error("KaTeX block rendering error:", e);
            return `<p style="color: red;">[數學公式渲染錯誤: ${formula}]</p>`; // 出錯時顯示錯誤訊息
        }
    });


    // 使用規則運算式尋找並替換行內公式 ($ ... $)
    html = html.replace(/\$(.*?)\$/g, (match, formula) => {
        // 避免匹配到已經被處理過的 HTML 標籤
        if (match.includes('<') || match.includes('>')) return match;
        try {
            const decodedFormula = new DOMParser().parseFromString(formula, "text/html").documentElement.textContent;
            // 使用 KaTeX 渲染 (displayMode: false 代表是行內)
            return katex.renderToString(decodedFormula, {
                displayMode: false,
                throwOnError: false
            });
        } catch (e) {
            console.error("KaTeX inline rendering error:", e);
            return `<span style="color: red;">[公式錯誤: ${formula}]</span>`;
        }
    });


    return html;
}
        const saveConfig = async () => { await runtimeConfigPersistence.saveConfig(); };
        const loadConfig = async () => {
            if (!currentUser) return;
            await runtimeSensitiveConfigPersistence.loadSensitiveConfig();
            const saved = await getItem(getConfigKey());
            if (saved) {
                const savedConfig = JSON.parse(saved);
                if (savedConfig.apiKeys) {
                    mergeSensitiveApiKeys(savedConfig.apiKeys);
                    await saveSensitiveConfig();
                }
                const normalSavedConfig = removeSensitiveConfig(savedConfig);
                const normalizedConfig = normalizeLoadedLegacyConfig({
                    currentConfig: config,
                    savedConfig: normalSavedConfig,
                    models: MODELS,
                    maxCouncilModels: COUNCIL_MAX_MODELS,
                    councilTranslatorCandidates: getCouncilTranslatorCandidates(),
                    singleTranslatorCandidates: getSingleTranslatorCandidates()
                });
                runtimeConfigAccess.replaceConfig(normalizedConfig);
            } else {
                const normalizedConfig = normalizeLoadedLegacyConfig({
                    currentConfig: config,
                    savedConfig: null,
                    models: MODELS,
                    maxCouncilModels: COUNCIL_MAX_MODELS,
                    councilTranslatorCandidates: getCouncilTranslatorCandidates(),
                    singleTranslatorCandidates: getSingleTranslatorCandidates()
                });
                runtimeConfigAccess.mutateConfig(normalizedConfig);
            }
        };
        const saveAppData = async () => { await runtimeAppDataPersistence.saveAppData(); };
        const loadAppData = async () => {
            if (!currentUser) return;
            const saved = await getItem(getAppDataKey());
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    const normalizedData = normalizeLoadedLegacyAppData({
                        rawData: data,
                        defaultFolder: getDefaultFolder(),
                        defaultGenConfig: getDefaultGenConfig(),
                        lastCouncilConfig: config.lastCouncilConfig,
                        normalizeCouncilConfig,
                        normalizeConversationModel
                    });
                    const latestAppData = runtimeAppDataStore.replaceAll(normalizedData);
                    conversations = latestAppData.conversations;
                    folders = latestAppData.folders;
                    astras = latestAppData.astras;
                } catch (e) {
                    console.error("Failed to parse app data:", e);
                    showNotification("讀取對話紀錄失敗，資料可能已損毀。", "error");
                    const latestAppData = runtimeAppDataStore.replaceAll({
                        conversations: [],
                        folders: [],
                        astras: [],
                        personalMemories: []
                    });
                    conversations = latestAppData.conversations;
                    folders = latestAppData.folders;
                    astras = latestAppData.astras;
                    await removeItem(getAppDataKey());
                }
            } else {
                const latestAppData = runtimeAppDataStore.replaceAll({
                    conversations: [],
                    folders: [],
                    astras: [],
                    personalMemories: []
                });
                conversations = latestAppData.conversations;
                folders = latestAppData.folders;
                astras = latestAppData.astras;
            }
        };
        const getDefaultGenConfig = () => ({ temperature: 0.7, topP: 0.95, maxTokens: null });
        const getDefaultFolder = () => ({ color: 'gray', icon: 'default', textColor: 'gray', isOpen: false});
        const createBaseConversation = (title) => {
            const defaultModelInfo = MODELS.find(m => m.id === config.lastUsedModel) || MODELS.find(m => m.id === config.defaultModel) || MODELS[0];
            const now = new Date().toISOString();
            return {
                id: crypto.randomUUID(),
                title: title,
                summary: '',
                messages: [],
                model: defaultModelInfo.id,
                provider: defaultModelInfo.provider,
                archived: false,
                createdAt: now,
                lastUpdatedAt: now,
                genConfig: getDefaultGenConfig(),
                council: cloneCouncilConfig(config.lastCouncilConfig),
                isRenamed: false,
                folderId: null,
                astrasId: null,
                isWebSearchEnabled: false,
                pinned: false,
                isTemporary: true,
                isNaming: false,
                deletedAt: null,
                 unsentMessage: ''
            };
        };
        const startNewChat = async () => {
            const oldTempChatCount = conversations.length;
            conversations = runtimeAppDataStore.replaceConversations(
                conversations.filter(c => !c.isTemporary || c.messages.length > 0)
            );
            if (conversations.length < oldTempChatCount) {
                 await saveAppData();
            }
            uploadedFiles = [];
            const newConv = createBaseConversation('新對話');
            conversations.unshift(newConv);
            conversationStateAccess.setCurrentConversationId(newConv.id);
            renderAll();
            ALL_ELEMENTS.messageInput.value = '';
            setTimeout(adjustTextareaHeightAlias, 0);
            legacyRuntimeContext.resolveBinding('sidebar.toggleSidebar')(false);
            resolveFoundationUpdateInputState();
            updateApiKeyWarningBadge();
        };
        const loadChat = (id) => {
            if (messageObserver) {
        messageObserver.disconnect();
            }
            if (id !== conversationStateAccess.getCurrentConversationId()) {
                const previousConv = getActiveConversation();
                if (previousConv && previousConv.isTemporary && previousConv.messages.length === 0) {
                    conversations = runtimeAppDataStore.replaceConversations(
                        conversations.filter(c => c.id !== previousConv.id)
                    );
                }
                conversationStateAccess.setCurrentConversationId(id);
                uploadedFiles = [];
                renderAll();
                const conv = getActiveConversation();
                ALL_ELEMENTS.messageInput.value = conv ? conv.unsentMessage || '' : '';
                setTimeout(adjustTextareaHeightAlias, 0);
            }
            resolveFoundationUpdateInputState();
            updateApiKeyWarningBadge();
            legacyRuntimeContext.resolveBinding('input.updateFunctionButtonsState')();
        };
        const deleteChat = async (id, event) => {
    event?.stopPropagation();
    const conv = conversations.find(c => c.id === id);
    if (conv) {
        conv.deletedAt = new Date().toISOString();
        if (conv.folderId) {
            const folder = folders.find(f => f.id === conv.folderId);
            if (folder) {
                folder.conversationIds = folder.conversationIds.filter(cid => cid !== id);
            }
            conv.folderId = null;
        }
        await saveAppData();




        // ↓↓↓↓↓↓ 就是這裡被修改了 ↓↓↓↓↓↓
        if (conversationStateAccess.getCurrentConversationId() === id) {
            startNewChat();
        } 
        // ↑↑↑↑↑↑ 就是這裡被修改了 ↑↑↑↑↑↑
        
        else {
            runtimeRenderCoordinator.renderAll();
        }
        runtimeDialogCoordinator.showNotification(i18n[config.uiLanguage].chatMovedToTrash || '對話已移至垃圾桶。', 'success');
    }
};
        const archiveChat = async (id, event) => {
            event?.stopPropagation();
            const conv = conversations.find(c => c.id === id);
            if(conv) conv.archived = true;
            await saveAppData();
            if (conversationStateAccess.getCurrentConversationId() === id) {
                const nextConv = conversations.find(c => !c.archived && !c.deletedAt);
                conversationStateAccess.setCurrentConversationId(nextConv ? nextConv.id : null);
                if (!conversationStateAccess.getCurrentConversationId()) startNewChat();
                else loadChat(conversationStateAccess.getCurrentConversationId());
            } else {
                runtimeRenderCoordinator.renderAll();
            }
        };
        const unarchiveChat = async (id, event) => {
            event?.stopPropagation();
            const conv = conversations.find(c => c.id === id);
            if(conv) conv.archived = false;
            await saveAppData();
            runtimeRenderCoordinator.renderAll();
        };
        const {
            getInlineMediaSrc: getArchivedInlineMediaSrc,
            renderMediaAttachmentGrid: renderArchivedMediaAttachmentGrid
        } = createArchivedMediaAttachmentRenderer({ escapeHTML });
        const {
            bindMediaPreviewButtons: bindArchivedMediaPreviewButtons
        } = createArchivedMediaPreviewLifecycle({
            document,
            navigator,
            fetch,
            File,
            escapeHTML,
            getInlineMediaSrc: getArchivedInlineMediaSrc,
            getUiLanguage: () => runtimeConfigAccess.getUiLanguage()
        });
        const archivedConversationViewRenderer = createArchivedConversationViewRenderer({
            document,
            renderUserText,
            renderModelText: renderMarkdown,
            renderMediaAttachmentGrid: renderArchivedMediaAttachmentGrid,
            bindMediaPreviewButtons: bindArchivedMediaPreviewButtons,
            mediaMode: 'inlineData',
            wrapTextParts: true
        });
        const showArchivedChatPreview = (id, event) => {
            event?.stopPropagation();
            const conv = conversations.find(c => c.id === id);
            if (!conv) return;
            ALL_ELEMENTS.viewArchivedTitle.textContent = conv.title;
            const contentContainer = ALL_ELEMENTS.viewArchivedContent;
            archivedConversationViewRenderer.renderConversationMessages({
                conversation: conv,
                contentContainer,
                emptyHTML: '<p class="text-center text-[var(--text-secondary)]">此對話沒有訊息。</p>'
            });
            toggleModal(ALL_ELEMENTS.viewArchivedChatModal, true);
        };
        const togglePinChat = async (id, event) => {
            event?.stopPropagation();
            const conv = conversations.find(c => c.id === id);
            if (conv) {
                conv.pinned = !conv.pinned;
                await saveAppData();
                runtimeRenderCoordinator.renderAll();
            }
        };
        const showRenameModal = (id, type, event) => {
            event?.stopPropagation();
            itemToRename = { id, type };
            let currentTitle = '';
            if (type === 'conversation') {
                const conv = conversations.find(c => c.id === id);
                if (conv) currentTitle = conv.title;
            } else if (type === 'folder') {
                const folder = folders.find(f => f.id === id);
                if (folder) currentTitle = folder.name;
            }
            ALL_ELEMENTS.renameModal.querySelector('h2').textContent = `重新命名${type === 'folder' ? '資料夾' : '對話'}`;
            ALL_ELEMENTS.renameInput.value = currentTitle;
            toggleModal(ALL_ELEMENTS.renameModal, true);
            ALL_ELEMENTS.renameInput.focus();
        };
        const handleRename = async () => {
            const newTitle = ALL_ELEMENTS.renameInput.value.trim();
            if (!newTitle || !itemToRename.id) return;
            if (itemToRename.type === 'conversation') {
                const conv = conversations.find(c => c.id === itemToRename.id);
                if (conv) { conv.title = newTitle; conv.isRenamed = true; }
            } else if (itemToRename.type === 'folder') {
                const folder = folders.find(f => f.id === itemToRename.id);
                if (folder) { folder.name = newTitle; }
            }
            await saveAppData();
            runtimeRenderCoordinator.renderAll();
            toggleModal(ALL_ELEMENTS.renameModal, false);
            itemToRename = { id: null, type: null };
        };
        const getActiveConversation = () => {
            const conv = conversationStateAccess.getCurrentConversation();
            if (conv) normalizeConversationModel(conv);
            return conv;
        };
        const runtimeRenderCoordinator = createRuntimeRenderCoordinator({
            renderHistorySidebar: () => renderHistorySidebar(),
            renderFolders: () => renderFolders(),
            renderAstras: () => renderAstras(),
            renderChat: () => renderChat(),
            renderArchivedChats: () => renderArchivedChats(),
            renderBatchActionBar: () => renderBatchActionBar(),
            renderFilePreviews: () => renderFilePreviews(),
            applyLanguage: () => applyLanguage(runtimeConfigAccess.getUiLanguage()),
            logger: console
        });
        const renderAll = (...args) => runtimeRenderCoordinator.renderAll(...args);
        const renderHistorySidebar = () => {
            const historyList = runtimeDomAccess.getRequiredElement('historyList');
            historyList.innerHTML = '';
            const sortedConversations = conversations
                .filter(c => !c.archived && !c.folderId && !c.deletedAt)
                .sort((a, b) => {
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    const dateB = b.lastUpdatedAt || b.createdAt;
                    const dateA = a.lastUpdatedAt || a.createdAt;
                    return new Date(dateB) - new Date(dateA);
                });
            sortedConversations.forEach(conv => {
                if (conv.isTemporary) {
                    return;
                }
                if (conv.isNaming) {
                    const thinkingPlaceholder = document.createElement('div');
                    thinkingPlaceholder.className = 'sidebar-item p-3 rounded-lg flex items-center gap-3 text-[var(--text-secondary)] italic';
                    thinkingPlaceholder.innerHTML = `
                        <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span data-lang-key="naming">${i18n[config.uiLanguage].naming || 'AI思考中...'}</span>
                    `;
                    historyList.appendChild(thinkingPlaceholder);
                    return;
                }
                historyList.appendChild(createConversationElement(conv));
            });
        };
        const sidebarAstrasLifecycle = createSidebarAstrasLifecycle({
            elements: ALL_ELEMENTS,
            getAstras: () => astras,
            getActiveAstrasId: () => getActiveAstrasId(),
            getIsSelectionMode: () => isSelectionMode,
            setAstrasForConversation: (...args) => setAstrasForConversation(...args),
            toggleSidebar: (...args) => legacyRuntimeContext.resolveBinding('sidebar.toggleSidebar')(...args),
            createAstrasMenu: (...args) => createAstrasMenu(...args),
            showMobileContextMenuForAstras: (...args) => showMobileContextMenuForAstras(...args),
            setTimeoutFn: (...args) => setTimeout(...args),
            clearTimeoutFn: (...args) => clearTimeout(...args),
            window
        });
        const renderAstras = (...args) => sidebarAstrasLifecycle.renderAstras(...args);


        import { createLegacySidebarChatAstraRenderLifecycle } from '/src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js';
        import { createLegacyConversationMailSender } from '/src/app/runtime/features/conversation-mail.js';
        import { createLegacySubmitInputCouncilLifecycle } from '/src/app/runtime/legacy-core/submit-input-council-lifecycle.js';
        import { createLegacySettingsAuthProviderLifecycle } from '/src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js';

        const sendConversationToMail = createLegacyConversationMailSender({
            getActiveConversation,
            getModels: () => MODELS,
            isCouncilEnabled,
            getCouncilTexts,
            postJsonWithReadableError,
            logger: console,
        });

        let renderFolders;
        let createConversationElement;
        let renderArchivedChats;
        let addMessageToUI;
        let renderChat;
        let getActiveAstrasId;
        let setAstrasForConversation;
        let deactivateAstras;
        let createAstras;
        let handleSaveAstras;
        let deleteAstras;
        let createAstrasMenu;
        const submitInputCouncilState = {
            get config() { return runtimeConfigAccess.getConfig(); },
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
            getConfig: () => runtimeConfigAccess.getConfig(),
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
        const resolveRuntimeEntryAdjustTextareaHeight = () => legacyRuntimeContext.resolveOptionalBinding(
            'runtimeEntry.submit.adjustTextareaHeight'
        );
        const adjustTextareaHeightAlias = (...args) => {
            const runtimeEntryAdjustTextareaHeight = resolveRuntimeEntryAdjustTextareaHeight();
            if (runtimeEntryAdjustTextareaHeight) {
                return runtimeEntryAdjustTextareaHeight(...args);
            }
            return undefined;
        };
        legacyRuntimeContext.registerLazyBinding('submit.adjustTextareaHeight', () => {
            const runtimeEntryAdjustTextareaHeight = resolveRuntimeEntryAdjustTextareaHeight();
            if (runtimeEntryAdjustTextareaHeight) return runtimeEntryAdjustTextareaHeight;
            return adjustTextareaHeightAlias;
        });
        legacyRuntimeContext.registerLazyBinding('submit.renderFilePreviews', () => renderFilePreviews);
        const settingsAuthProviderState = {
            get config() { return runtimeConfigAccess.getConfig(); },
            set config(next) { runtimeConfigAccess.replaceConfig(next); },
            get conversations() { return conversations; },
            set conversations(next) { conversations = next; },
            get folders() { return folders; },
            set folders(next) { folders = next; },
            get astras() { return astras; },
            set astras(next) { astras = next; },
            get personalMemories() { return runtimeAppDataStore.getPersonalMemories(); },
            set personalMemories(next) { runtimeAppDataStore.replacePersonalMemories(next); },
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
            getOutputMode,
            renderHistorySidebar,
            conversationStateAccess,
            getProviderLabel,
            getModelPriceLabel,
            setApiKeyForProvider,
            mergeSensitiveApiKeys,
            clearSensitiveApiKeys,
            saveSensitiveConfig,
            getCouncilTranslatorCandidates,
            getSingleTranslatorCandidates,
            escapeHTML,
            hexToRgba,
            renderPersonalMemoryList: (...args) => renderPersonalMemoryList(...args),
            renderModelManagementUI: (...args) => renderModelManagementUI(...args),
            renderUiColorOptions: (...args) => renderUiColorOptions(...args),
            renderTrash: (...args) => renderTrash(...args),
            renderModelSwitcher,
            renderChat: (...args) => renderChat(...args),
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
            getSensitiveApiKeys,
            mergeSensitiveApiKeys,
            saveSensitiveConfig,
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
        const sidebarChatAstraRenderState = {
            get config() { return runtimeConfigAccess.getConfig(); },
            get conversations() { return conversations; },
            get folders() { return folders; },
            get astras() { return astras; },
            set astras(next) { astras = next; },
            get currentUser() { return currentUser; },
            get editingAstrasId() { return editingAstrasId; },
            set editingAstrasId(next) { editingAstrasId = next; },
            get selectedConversationIds() { return selectedConversationIds; },
            get isSelectionMode() { return isSelectionMode; },
            get isAutoScrolling() { return isAutoScrolling; }
        };
        const sidebarChatAstraRenderLifecycle = createLegacySidebarChatAstraRenderLifecycle({
            window,
            document,
            navigator,
            fetch,
            File,
            crypto,
            requestAnimationFrame,
            elements: ALL_ELEMENTS,
            legacyRuntimeContext,
            state: sidebarChatAstraRenderState,
            runtimeDomAccess,
            runtimeConfigAccess,
            conversationStateAccess,
            runtimeRenderCoordinator,
            runtimeDialogCoordinator,
            i18n,
            getActiveConversation,
            normalizeConversationModel,
            isCouncilEnabled,
            getCouncilTexts,
            resolveFolderColor,
            folderColors: FOLDER_COLORS,
            saveAppData,
            renderAstras,
            renderAll,
            renderBatchActionBar: (...args) => renderBatchActionBar(...args),
            loadChat,
            createHistoryMenu,
            createFolderMenu: (...args) => createFolderMenu(...args),
            deleteChat,
            showArchivedChatPreview,
            unarchiveChat,
            showMobileContextMenu: (...args) => showMobileContextMenu(...args),
            showMobileContextMenuForFolder: (...args) => showMobileContextMenuForFolder(...args),
            openAvatarEditor: (...args) => openAvatarEditor(...args),
            toggleModal,
            showNotification,
            showCustomConfirm,
            buildMessageRenderView,
            escapeHTML,
            renderUserText,
            renderMarkdownWithFormulas,
            formatFullTimestamp,
            renderModelSwitcher,
            renderInputIndicators,
            renderCouncilControls,
            setupMessageIntersectionObserver: (...args) => setupMessageIntersectionObserver(...args),
            replaceAstras: (nextAstras) => {
                astras = runtimeAppDataStore.replaceAstras(nextAstras);
                return astras;
            }
        });
        ({
            renderFolders,
            createConversationElement,
            renderArchivedChats,
            addMessageToUI,
            renderChat,
            getActiveAstrasId,
            setAstrasForConversation,
            deactivateAstras,
            createAstras,
            handleSaveAstras,
            deleteAstras,
            createAstrasMenu
        } = sidebarChatAstraRenderLifecycle);
        import { createBatchActionBarLifecycle } from '/src/app/legacy-runtime/features/batch-action-bar-lifecycle.js';
        import { createLegacyFolderLifecycle } from '/src/app/runtime/features/folder-lifecycle.js';
        import { createLegacyTransitionBusLifecycle } from '/src/app/runtime/legacy-core/transition-bus-lifecycle.js';
        import {
            FOLDER_SVGS as FOLDER_ICON_OPTIONS,
        } from '/src/app/legacy-runtime/data/folder-metadata.js';
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
            getUiLanguage: () => runtimeConfigAccess.getUiLanguage(),
            randomUUID: () => crypto.randomUUID(),
            scheduleAnimationFrame: requestAnimationFrame,
            logger: console
        });
        const toggleSelectionMode = () => {
    isSelectionMode = !isSelectionMode;
    selectedConversationIds.clear();


    // ???�??�格?��?�???��??��???�???��???? 'active' CSS ?�??    ALL_ELEMENTS.selectionModeBtn.classList.toggle('active', isSelectionMode);


    // ??????�??�?????��???�?????�箸???
    if (isSelectionMode) {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[config.uiLanguage].cancelBatchSelect || '?�??寞活?�?';
    } else {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[config.uiLanguage].batchSelect || '?寞活?�?';
    }


    renderAll();
};
        const batchActionBarLifecycle = createBatchActionBarLifecycle({
            elements: ALL_ELEMENTS,
            getI18n: () => i18n,
            getIsSelectionMode: () => isSelectionMode,
            getSelectedConversationIds: () => selectedConversationIds,
            getUiLanguage: () => runtimeConfigAccess.getUiLanguage()
        });
        const renderBatchActionBar = (...args) => batchActionBarLifecycle.renderBatchActionBar(...args);
        const transitionBusState = {
            get config() { return runtimeConfigAccess.getConfig(); },
            set config(next) { runtimeConfigAccess.replaceConfig(next); },
            get conversations() { return conversations; },
            set conversations(next) { conversations = next; },
            get folders() { return folders; },
            set folders(next) { folders = next; },
            get astras() { return astras; },
            set astras(next) { astras = next; },
            get personalMemories() { return runtimeAppDataStore.getPersonalMemories(); },
            set personalMemories(next) { runtimeAppDataStore.replacePersonalMemories(next); },
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

export { legacyRuntimeContext };
