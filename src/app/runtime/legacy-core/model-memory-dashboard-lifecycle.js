import { createModelUsageChartLifecycle } from '../../legacy-runtime/features/model-usage-chart-lifecycle.js';

const REQUIRED_DEPENDENCIES = [
    'document',
    'elements',
    'getConfig',
    'getConversations',
    'getFolders',
    'getPersonalMemories',
    'replacePersonalMemories',
    'models',
    'i18n',
    'saveConfig',
    'saveAppData',
    'runtimeDialogCoordinator'
];

const validateDependencies = (dependencies) => {
    if (!dependencies || typeof dependencies !== 'object') {
        throw new TypeError('Legacy model memory dashboard lifecycle dependencies must be an object.');
    }
    const missing = REQUIRED_DEPENDENCIES.filter((name) => dependencies[name] == null);
    if (missing.length > 0) {
        throw new TypeError(`Legacy model memory dashboard lifecycle is missing dependencies: ${missing.join(', ')}.`);
    }
};

export function createLegacyModelMemoryDashboardLifecycle(dependencies = {}) {
    validateDependencies(dependencies);
    const {
        Chart,
        document,
        requestAnimationFrame = (callback) => callback(),
        crypto = globalThis.crypto,
        elements: ALL_ELEMENTS,
        getConfig,
        getConversations,
        getFolders,
        getPersonalMemories,
        replacePersonalMemories,
        getModelPieChart = () => null,
        setModelPieChart = () => {},
        models: MODELS,
        i18n,
        getModelTiers = () => [],
        getModelApiId = (model) => model?.apiId || model?.id || '',
        saveConfig,
        saveAppData,
        runtimeDialogCoordinator,
        showNotification = runtimeDialogCoordinator.showNotification,
        showCustomConfirm = async () => false,
        toggleModal = () => {},
        callApiWithSchema = async () => [],
        getActiveConversation = () => null,
        normalizeConversationModel = () => null,
        isCouncilEnabled = () => false,
        getCouncilValidation = () => ({ reason: '' }),
        getApiKeyForProvider = () => '',
        setupTimeAnalysis = () => {},
        console: injectedConsole = globalThis.console
    } = dependencies;
    const console = injectedConsole;
    let config;
    let conversations;
    let folders;
    let personalMemories;
    const syncState = () => {
        config = getConfig();
        conversations = getConversations();
        folders = getFolders();
        personalMemories = getPersonalMemories();
    };
    syncState();

        const renderModelManagementUI = () => {
            syncState();
    const container = ALL_ELEMENTS.modelManagementList;
    const settingsContent = container.closest('.flex-1.p-6.overflow-y-auto') || container.closest('.scroll-area');
    const previousScrollTop = settingsContent ? settingsContent.scrollTop : 0;
    const openSectionKeys = new Set(
        Array.from(container.querySelectorAll('details[open]'))
            .map(details => details.querySelector('summary')?.textContent?.trim())
            .filter(Boolean)
    );
    container.innerHTML = '';


    // --- 步驟 1: 準備並分類所有模型 ---
    const processedModels = MODELS.map(model => {
        const provider = model.provider;
        let tier = [];
        let company = null;
        if (provider === 'gemini') {
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
            
            if (provider === 'openrouter' || provider === 'nvidia' || provider === 'stepfun') {
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
    const modelEyeIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M2.06 12.35a1 1 0 0 1 0-.7C3.46 8.18 7.36 5.5 12 5.5s8.54 2.68 9.94 6.15a1 1 0 0 1 0 .7C20.54 15.82 16.64 18.5 12 18.5s-8.54-2.68-9.94-6.15Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const modelEyeOffIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58"/><path d="M9.88 5.72A10.77 10.77 0 0 1 12 5.5c4.64 0 8.54 2.68 9.94 6.15a1 1 0 0 1 0 .7 10.05 10.05 0 0 1-3.17 4.12"/><path d="M6.23 6.75a10.07 10.07 0 0 0-4.17 4.9 1 1 0 0 0 0 .7C3.46 15.82 7.36 18.5 12 18.5c.74 0 1.45-.07 2.13-.2"/></svg>';
    const modelMoveUpIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
    const modelMoveDownIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

    const createModelItemHTML = (item, index, total) => {
        const { setting, info } = item;
        return `
            <div class="model-management-item" data-model-id="${info.id}">
                <span class="model-management-name">${info.name}</span>
                <input type="radio" name="default-model-radio" class="model-default-radio" ${config.defaultModel === info.id ? 'checked' : ''} aria-label="設為預設模型">
                <button class="toggle-visibility-btn model-row-action" title="${setting.hidden ? '顯示' : '隱藏'}" aria-label="${setting.hidden ? '顯示模型' : '隱藏模型'}">
                    ${setting.hidden ? modelEyeOffIcon : modelEyeIcon}
                </button>
                <div class="model-order-controls">
                    <button class="move-up-btn model-row-action" title="上移" aria-label="上移模型" ${index === 0 ? 'disabled' : ''}>${modelMoveUpIcon}</button>
                    <button class="move-down-btn model-row-action" title="下移" aria-label="下移模型" ${index === total - 1 ? 'disabled' : ''}>${modelMoveDownIcon}</button>
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


            if (provider === 'openrouter' || provider === 'nvidia' || provider === 'stepfun') {
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

    if (openSectionKeys.size > 0) {
        container.querySelectorAll('details').forEach(details => {
            const key = details.querySelector('summary')?.textContent?.trim();
            if (key && openSectionKeys.has(key)) {
                details.open = true;
            }
        });
    }
    if (settingsContent) {
        requestAnimationFrame(() => {
            settingsContent.scrollTop = previousScrollTop;
        });
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
            runtimeDialogCoordinator.showNotification(i18n[config.uiLanguage].defaultModelUpdated || '預設模型已更新');
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
            syncState();
    // 獲取模型及其詳細分類資訊
    const allModelsInfo = MODELS.map(model => {
        let tier = [];
        let company = null;
        if (model.provider === 'gemini') {
            tier = getModelTiers(model);
            company = 'google';
        } else if (model.provider === 'openrouter') {
            tier = getModelTiers(model);
            company = model.id.split('/')[0];
        } else if (model.provider === 'stepfun') {
            tier = getModelTiers(model);
            company = 'stepfun';
        } else if (model.provider === 'nvidia') {
            tier = getModelTiers(model);
            company = getModelApiId(model).split('/')[0];
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
    runtimeDialogCoordinator.showNotification(i18n[config.uiLanguage].modelOrderUpdated || '模型順序已更新');
};
        const renderPersonalMemoryList = () => {
            syncState();
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
                        personalMemories = replacePersonalMemories(
                            personalMemories.filter(m => m.id !== id)
                        );
                        await saveAppData();
                        renderPersonalMemoryList();
                    }
                });
            });
        };
        const refineAndStoreMemories = async (potentialMemories) => {
            syncState();
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
            syncState();
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
            syncState();
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
            syncState();
            renderDashboardStats();
            renderModelUsageChart();
            setupTimeAnalysis();
            toggleModal(ALL_ELEMENTS.dataDashboardModal, true);
        };
        const renderDashboardStats = () => {
            syncState();
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
        const modelUsageChartLifecycle = createModelUsageChartLifecycle({
            Chart,
            document,
            getConversations: () => conversations,
            getI18n: () => i18n,
            getModelPieChart,
            getModels: () => MODELS,
            getUiLanguage: () => config.uiLanguage,
            setModelPieChart
        });
        const renderModelUsageChart = (...args) => {
            syncState();
            return modelUsageChartLifecycle.renderModelUsageChart(...args);
        };



        return {
            renderModelManagementUI,
            moveModelOrder,
            renderPersonalMemoryList,
            refineAndStoreMemories,
            extractPersonalMemory,
            updateApiKeyWarningBadge,
            openDashboard,
            renderDashboardStats,
            renderModelUsageChart
        };
}
