import { createModelUsageChartLifecycle } from '../../legacy-runtime/features/model-usage-chart-lifecycle.js';
import {
    addConfirmedProfileEntry,
    approveProfileCandidate,
    removeProfileEntry
} from '../memory/memory-profile-management.js';
import {
    addCustomSuppressionRule,
    removeSuppressionRule,
    updateSuppressionRule
} from '../memory/memory-suppression-management.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';

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
        getMemoryState = null,
        replaceMemoryState = () => {},
        captureCompletedTurn = null,
        enqueueMemoryCapture = null,
        hashString = null,
        getModelPieChart = () => null,
        setModelPieChart = () => {},
        models: MODELS,
        i18n,
        saveAppData,
        runtimeDialogCoordinator,
        showNotification = runtimeDialogCoordinator.showNotification,
        showCustomConfirm = async () => false,
        showCustomPrompt = async () => null,
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
    let memoryState;
    const syncState = () => {
        config = getConfig();
        conversations = getConversations();
        folders = getFolders();
        personalMemories = getPersonalMemories();
        memoryState = typeof getMemoryState === 'function' ? getMemoryState() : null;
    };
    syncState();
    const getText = (key, fallback) => i18n[config.uiLanguage]?.[key] || fallback;

        const renderPersonalMemoryList = () => {
            syncState();
            const container = ALL_ELEMENTS.personalMemoryList;
            const addMemoryButton = document.getElementById('add-personal-memory-btn');
            if (addMemoryButton && addMemoryButton.nextElementSibling !== container) {
                addMemoryButton.classList.remove('mt-4');
                addMemoryButton.classList.add('mb-3');
                container.before(addMemoryButton);
            }
            container.innerHTML = '';
            const usingV2Memory = Boolean(memoryState);
            const profileEntries = usingV2Memory ? (memoryState.profileEntries || []) : personalMemories;
            const profileCandidates = usingV2Memory ? (memoryState.profileCandidates || []) : [];
            const legacyInbox = usingV2Memory ? (memoryState.legacyInbox || []) : [];
            const suppressionRules = usingV2Memory ? (memoryState.suppressionRules || []) : [];
            const topicSummaries = usingV2Memory ? (memoryState.longTermTopicSummaries || []) : [];
            const activeProfileEntries = profileEntries.filter(memory => memory.status === 'active');
            profileEntries.forEach(memory => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-color)]';
                item.innerHTML = `
    <div class="flex items-center gap-2 flex-1 min-w-0">
        <input type="checkbox" class="memory-enabled-checkbox w-4 h-4" data-id="${memory.id}" ${(usingV2Memory ? memory.status === 'active' : memory.enabled) ? 'checked' : ''} ${usingV2Memory && memory.status === 'superseded' ? 'disabled' : ''}>
        <span class="text-sm word-break: break-word;"></span>
    </div>
    <div class="memory-entry-actions flex items-center gap-3 ml-4 shrink-0">
        ${usingV2Memory && memory.status === 'active' ? `<button class="replace-memory-btn memory-action-button px-3 py-1.5 rounded-md text-sm" data-id="${memory.id}" data-lang-key="memoryReplaceAction">${getText('memoryReplaceAction', '取代')}</button>` : ''}
        <button class="delete-memory-btn memory-action-button inline-flex items-center justify-center w-8 h-8 rounded-md" data-id="${memory.id}" title="${getText('delete', '刪除')}" aria-label="${getText('delete', '刪除')}">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
    </div>
                `;
                const contentElement = item.querySelector('span');
                if (contentElement) contentElement.textContent = memory.status === 'superseded'
                    ? `已被新記憶取代：${memory.content}`
                    : memory.content;
                container.appendChild(item);
            });
            profileCandidates.forEach(candidate => {
                const item = document.createElement('div');
                item.className = 'flex flex-col gap-3 p-3 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-color)]';
                item.innerHTML = `
    <div class="flex flex-col gap-1 min-w-0 w-full">
        <span class="text-xs text-[var(--text-secondary)]">候選記憶 · 請確認</span>
        <span class="text-sm word-break: break-word;"></span>
    </div>
    <div class="candidate-replacement-list flex flex-wrap gap-2 w-full"></div>
    <div class="flex flex-wrap items-center justify-end gap-2 w-full">
        <button class="dismiss-memory-candidate-btn memory-action-button px-3 py-1.5 rounded-md text-sm" data-id="${candidate.id}">忽略</button>
        ${candidate.suggestedSupersedes?.length ? `<button class="approve-superseding-candidate-btn memory-action-button px-3 py-1.5 rounded-md text-sm" data-id="${candidate.id}">取代舊記憶並保留</button>` : ''}
        <button class="approve-memory-candidate-btn memory-action-button px-3 py-1.5 rounded-md text-sm" data-id="${candidate.id}">保留</button>
    </div>`;
                item.querySelectorAll('span')[1].textContent = candidate.content;
                const replacementList = item.querySelector('.candidate-replacement-list');
                const suggestedEntries = activeProfileEntries.filter(memory => candidate.suggestedSupersedes?.includes(memory.id));
                if (replacementList && suggestedEntries.length > 0) {
                    const suggestion = document.createElement('span');
                    suggestion.className = 'text-xs text-[var(--text-secondary)] basis-full';
                    suggestion.textContent = getRuntimeText(config.uiLanguage, 'memoryReplacementSuggestion', { items: suggestedEntries.map(memory => `「${memory.content}」`).join('、') });
                    replacementList.appendChild(suggestion);
                }
                if (replacementList && activeProfileEntries.length > 0) {
                    const label = document.createElement('span');
                    label.className = 'text-xs text-[var(--text-secondary)] basis-full';
                    label.textContent = getRuntimeText(config.uiLanguage, 'memoryChooseReplacement');
                    replacementList.appendChild(label);
                    activeProfileEntries.forEach(memory => {
                        const button = document.createElement('button');
                        button.className = 'replace-candidate-memory-btn text-xs px-2 py-1 rounded border border-[var(--border-color)] hover:bg-[var(--active-bg)]';
                        button.dataset.candidateId = candidate.id;
                        button.dataset.supersedeId = memory.id;
                        button.textContent = getRuntimeText(config.uiLanguage, 'memoryReplace', { item: `${memory.content.slice(0, 36)}${memory.content.length > 36 ? '…' : ''}` });
                        replacementList.appendChild(button);
                    });
                }
                container.appendChild(item);
            });
            legacyInbox.forEach(memory => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-color)]';
                item.innerHTML = `
    <div class="flex flex-col gap-1 flex-1 min-w-0">
        <span class="text-xs text-[var(--text-secondary)]">待審核的舊記憶</span>
        <span class="text-sm word-break: break-word;"></span>
    </div>
    <button class="review-memory-btn text-[var(--button-primary-bg)] text-sm" data-id="${memory.id}">保留</button>
    <button class="delete-legacy-memory-btn text-red-600 hover:text-red-800" data-id="${memory.id}">刪除</button>`;
                item.querySelectorAll('span')[1].textContent = memory.content;
                container.appendChild(item);
            });
            if (usingV2Memory) {
                const derivedSection = document.createElement('div');
                derivedSection.className = 'mt-5 pt-4 border-t border-[var(--border-color)] space-y-2';
                if (topicSummaries.length > 0) {
                    const heading = document.createElement('p');
                    heading.className = 'text-xs font-medium text-[var(--text-secondary)]';
                    heading.textContent = getRuntimeText(config.uiLanguage, 'memoryTopics');
                    derivedSection.appendChild(heading);
                    topicSummaries.forEach(topic => {
                        const item = document.createElement('div');
                        item.className = 'flex items-start justify-between gap-2 p-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-color)]';
                        item.innerHTML = `<div class="flex flex-col gap-1 min-w-0"><span class="text-sm font-medium"></span><span class="text-xs text-[var(--text-secondary)] word-break: break-word;"></span></div><button class="delete-topic-summary-btn text-red-600 hover:text-red-800 text-sm" data-id="${topic.id}">刪除</button>`;
                        const spans = item.querySelectorAll('span');
                        spans[0].textContent = topic.topic || getRuntimeText(config.uiLanguage, 'unnamedTopic');
                        spans[1].textContent = topic.summary || '';
                        derivedSection.appendChild(item);
                    });
                }
                if (suppressionRules.length > 0) {
                    const heading = document.createElement('p');
                    heading.className = 'text-xs font-medium text-[var(--text-secondary)] mt-3';
                    heading.textContent = getRuntimeText(config.uiLanguage, 'memorySuppressionRules');
                    derivedSection.appendChild(heading);
                    suppressionRules.forEach((rule, index) => {
                        const item = document.createElement('div');
                        item.className = 'flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-color)]';
                        item.innerHTML = `<span class="text-sm flex-1 min-w-0"></span><div class="flex items-center justify-end gap-2 ml-auto shrink-0">${rule.id ? `<button class="edit-suppression-rule-btn memory-action-button inline-flex items-center justify-center w-8 h-8 rounded-md" data-id="${rule.id}" title="${getText('edit', '編輯')}" aria-label="${getText('edit', '編輯')}"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>` : ''}<button class="delete-suppression-rule-btn memory-action-button inline-flex items-center justify-center w-8 h-8 rounded-md" data-id="${rule.id || ''}" data-index="${index}" title="${getText('delete', '刪除')}" aria-label="${getText('delete', '刪除')}"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg></button></div>`;
                        item.querySelector('span').textContent = rule.instruction || (rule.type === 'do-not-mention' && rule.target === 'profile-name'
                            ? '不主動使用已儲存的姓名稱呼'
                            : `${rule.type || 'suppression'}: ${rule.target || ''}`);
                        derivedSection.appendChild(item);
                    });
                }
                const addRuleButton = document.createElement('button');
                addRuleButton.className = 'add-suppression-rule-btn text-sm px-3 py-1.5 rounded-md btn-outline-white';
                addRuleButton.dataset.langKey = 'memoryAddSuppressionRule';
                addRuleButton.textContent = getText('memoryAddSuppressionRule', '新增不主動使用規則');
                derivedSection.appendChild(addRuleButton);
                container.appendChild(derivedSection);
            }
            container.querySelectorAll('.memory-enabled-checkbox').forEach(cb => {
                cb.addEventListener('change', async (e) => {
                    const id = e.target.dataset.id;
                    const memory = profileEntries.find(m => m.id === id);
                    if (memory) {
                        if (usingV2Memory) {
                            replaceMemoryState({
                                ...memoryState,
                                profileEntries: profileEntries.map(entry => entry.id === id
                                    ? { ...entry, status: e.target.checked ? 'active' : 'inactive' }
                                    : entry)
                            });
                        } else {
                            memory.enabled = e.target.checked;
                        }
                        await saveAppData();
                    }
                });
            });
            container.querySelectorAll('.delete-memory-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    if (await showCustomConfirm(i18n[config.uiLanguage].confirmDeleteMemory || '確定刪除此記憶？')) {
                        if (usingV2Memory) {
                            replaceMemoryState(removeProfileEntry(memoryState, { entryId: id }));
                        } else {
                            personalMemories = replacePersonalMemories(
                                personalMemories.filter(m => m.id !== id)
                            );
                        }
                        await saveAppData();
                        renderPersonalMemoryList();
                    }
                });
            });
            container.querySelectorAll('.replace-memory-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const memory = profileEntries.find(entry => entry.id === id);
                    if (!memory) return;
                    const content = await showCustomPrompt(`目前記憶：${memory.content}\n輸入新的內容後，舊記憶會保留為「已被取代」，不會再影響回覆。`, '取代記憶');
                    if (!content) return;
                    replaceMemoryState(addConfirmedProfileEntry(memoryState, {
                        id: crypto.randomUUID(),
                        content,
                        supersededEntryIds: [id]
                    }));
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.review-memory-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const legacy = legacyInbox.find(memory => memory.id === id);
                    if (!legacy) return;
                    replaceMemoryState({
                        ...addConfirmedProfileEntry(memoryState, { id: crypto.randomUUID(), content: legacy.content }),
                        legacyInbox: legacyInbox.filter(memory => memory.id !== id)
                    });
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.approve-memory-candidate-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    replaceMemoryState(approveProfileCandidate(memoryState, {
                        candidateId: id,
                        profileEntryId: crypto.randomUUID()
                    }));
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.replace-candidate-memory-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const { candidateId, supersedeId } = e.currentTarget.dataset;
                    replaceMemoryState(approveProfileCandidate(memoryState, {
                        candidateId,
                        profileEntryId: crypto.randomUUID(),
                        supersededEntryIds: [supersedeId]
                    }));
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.approve-superseding-candidate-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const candidateId = e.currentTarget.dataset.id;
                    const candidate = profileCandidates.find(item => item.id === candidateId);
                    const supersededEntryIds = (candidate?.suggestedSupersedes || [])
                        .filter(id => activeProfileEntries.some(entry => entry.id === id));
                    if (!candidate || supersededEntryIds.length === 0) return;
                    replaceMemoryState(approveProfileCandidate(memoryState, {
                        candidateId,
                        profileEntryId: crypto.randomUUID(),
                        supersededEntryIds
                    }));
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.dismiss-memory-candidate-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    replaceMemoryState({
                        ...memoryState,
                        profileCandidates: profileCandidates.filter(candidate => candidate.id !== id),
                        resolvedProfileCandidateIds: [
                            ...new Set([...(memoryState.resolvedProfileCandidateIds || []), String(id)])
                        ]
                    });
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.delete-legacy-memory-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    if (await showCustomConfirm(i18n[config.uiLanguage].confirmDeleteMemory || '確定刪除此記憶？')) {
                        replaceMemoryState({
                            ...memoryState,
                            legacyInbox: legacyInbox.filter(memory => memory.id !== id)
                        });
                        await saveAppData();
                        renderPersonalMemoryList();
                    }
                });
            });
            container.querySelectorAll('.delete-topic-summary-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    replaceMemoryState({
                        ...memoryState,
                        longTermTopicSummaries: topicSummaries.filter(topic => topic.id !== id),
                        resolvedTopicSummaryIds: [
                            ...new Set([...(memoryState.resolvedTopicSummaryIds || []), String(id)])
                        ]
                    });
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.delete-suppression-rule-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const ruleId = e.currentTarget.dataset.id;
                    const index = Number(e.currentTarget.dataset.index);
                    replaceMemoryState(ruleId
                        ? removeSuppressionRule(memoryState, { ruleId })
                        : {
                            ...memoryState,
                            suppressionRules: suppressionRules.filter((_rule, ruleIndex) => ruleIndex !== index)
                        });
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.add-suppression-rule-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const instruction = await showCustomPrompt(
                        getText('memorySuppressionRulePrompt', '例如：不要主動提起我的姓名、健康資訊或其他私人資料。這條規則只會作為必要的回覆限制。'),
                        getText('memoryAddSuppressionRule', '新增不主動使用規則')
                    );
                    if (!instruction) return;
                    replaceMemoryState(addCustomSuppressionRule(memoryState, {
                        id: crypto.randomUUID(),
                        instruction
                    }));
                    await saveAppData();
                    renderPersonalMemoryList();
                });
            });
            container.querySelectorAll('.edit-suppression-rule-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const ruleId = e.currentTarget.dataset.id;
                    const rule = suppressionRules.find(item => item.id === ruleId);
                    if (!rule) return;
                    const currentText = rule.instruction || '不主動使用已儲存的姓名稱呼';
                    const instruction = await showCustomPrompt(`目前規則：${currentText}\n輸入新的規則內容。`, '編輯不主動使用規則');
                    if (!instruction) return;
                    replaceMemoryState(updateSuppressionRule(memoryState, { ruleId, instruction }));
                    await saveAppData();
                    renderPersonalMemoryList();
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
                showNotification(getRuntimeText(config.uiLanguage, 'memoryAutoAdded'), 'success');
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
                        showNotification(getRuntimeText(config.uiLanguage, 'memoryAutoUpdated'), 'success');
                    }
                }
            } catch (error) {
                console.error("Error refining memories:", error);
            }
        };
        const extractPersonalMemory = async (userMessage, aiResponse) => {
            syncState();
            if (config.memorySystemVersion === 2 && typeof captureCompletedTurn === 'function' && typeof hashString === 'function') {
                const conversation = getActiveConversation();
                const allTurns = (conversation?.messages || []).map((message, index) => ({
                    id: message.id || `${conversation.id}:${index}`,
                    role: message.role,
                    text: (message.parts || []).map(part => part.text || '').join('\n').trim(),
                    attachments: (message.parts || []).flatMap((part, partIndex) => part?.inlineData?.data ? [{
                        partIndex,
                        name: part.inlineData.name || 'attachment',
                        mimeType: part.inlineData.mimeType || 'application/octet-stream',
                        data: part.inlineData.data,
                        size: part.inlineData.size || 0
                    }] : [])
                })).filter(turn => turn.text || turn.attachments.length > 0);
                const previousState = (memoryState?.recentConversationStates || [])
                    .find(state => state.conversationId === conversation?.id);
                const coveredIndex = previousState?.coveredThroughMessageId
                    ? allTurns.findIndex(turn => turn.id === previousState.coveredThroughMessageId)
                    : -1;
                const turns = allTurns.slice(coveredIndex + 1);
                if (turns.length === 0) return;
                const sourceHash = await hashString(JSON.stringify(turns));
                const captureOptions = {
                    conversationId: conversation.id,
                    sourceHash,
                    turns
                };
                if (typeof enqueueMemoryCapture === 'function') enqueueMemoryCapture(captureOptions);
                else await captureCompletedTurn(captureOptions);
                return;
            }
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
            renderPersonalMemoryList,
            refineAndStoreMemories,
            extractPersonalMemory,
            updateApiKeyWarningBadge,
            openDashboard,
            renderDashboardStats,
            renderModelUsageChart
        };
}
