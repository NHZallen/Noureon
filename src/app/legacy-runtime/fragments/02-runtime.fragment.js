        import {
            buildTavilySearchQuery,
            formatTavilySearchPacket,
            getSearchCurrentDate
        } from '/src/app/legacy-runtime/features/model-request-formatting.js';
        import { createStreamApiCall } from '/src/app/legacy-runtime/features/stream-api-call.js';
        import { createCouncilResponseLifecycle } from '/src/app/legacy-runtime/features/council-response-lifecycle.js';
        import { createProviderRequestSupport } from '/src/app/legacy-runtime/features/provider-request-support.js';
        import {
            SETTINGS_MOBILE_ICON_MAP,
            getSettingsMobileGroups as getSettingsMobileGroupsBase
        } from '/src/app/legacy-runtime/features/settings-mobile-metadata.js';
        import { getOutputModeSettingsText } from '/src/app/legacy-runtime/features/output-mode-settings-text.js';
        function calculateRelevanceScore(summary, keywords) {
            if (!summary || !keywords || keywords.length === 0) {
                return 0;
            }
            const summaryLower = summary.toLowerCase();
            let score = 0;
            keywords.forEach(keyword => {
                if (summaryLower.includes(keyword.toLowerCase())) {
                    score++;
                }
            });
            const coverageRatio = score / keywords.length;
            return score * (1 + coverageRatio);
        }
        const streamApiCall = createStreamApiCall({
            getActiveConversation,
            normalizeConversationModel,
            getModelApiId,
            getApiKeyForProvider,
            getDefaultGenConfig,
            getConfig: () => config,
            getAstras: () => astras,
            getPersonalMemories: () => personalMemories,
            modelSupportsUploadedFile,
            modelSupportsVision
        });
        const providerRequestSupport = createProviderRequestSupport({
            buildTavilySearchQuery,
            formatTavilySearchPacket,
            getErrorMessage,
            readErrorBody,
            getApiKeyForProvider,
            getConfig: () => config,
            getActiveConversation,
            streamApiCall,
            getSingleDocumentTranslatorModel,
            modelUsesTavilySearch,
            modelSupportsUploadedFile,
            councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
            councilRetryDelayMs: COUNCIL_RETRY_DELAY_MS
        });
        const {
            buildSingleModelTranslatedRequestParts,
            extractTextFromParts,
            fetchTavilySearchPacket,
            filterPartsForModelCapability,
            getSearchQueryFromParts,
            streamCouncilApiCallWithRetry,
            truncateCouncilText
        } = providerRequestSupport;
        const councilResponseLifecycle = createCouncilResponseLifecycle({
            buildTavilySearchQuery,
            getSearchCurrentDate,
            getConfig: () => config,
            getActiveConversation,
            getCouncilSelectedModels,
            getCouncilTexts,
            getCouncilRuntimeTexts,
            getCouncilAttachmentTranslationNeed,
            getCouncilTranslatorModel,
            getCouncilSharedSearchModel,
            models: MODELS,
            councilMaxModels: COUNCIL_MAX_MODELS,
            extractTextFromParts,
            truncateCouncilText,
            filterPartsForModelCapability,
            getSearchQueryFromParts,
            fetchTavilySearchPacket,
            streamCouncilApiCallWithRetry,
            modelUsesNativeWebSearch,
            modelSupportsVision,
            modelSupportsDocumentUpload
        });
        const runModelCouncil = (...args) => councilResponseLifecycle.runModelCouncil(...args);
        async function callApiWithSchema(prompt, responseSchema, signal) {
            const apiKey = getApiKeyForProvider('gemini');
            if (!apiKey) {
                console.error("Gemini API key is not set for generating structured response.");
                return null;
            }
            const payload = {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                }
            };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CHEAP_MODEL_ID}:generateContent?key=${apiKey}`;
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal
                });
                if (!response.ok) {
                    const errorData = await readErrorBody(response);
                    throw new Error(errorData.error?.message || 'API request failed');
                }
                const result = await response.json();
                const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (jsonString) {
                    let cleanedJsonString = jsonString.trim();
                    if (cleanedJsonString.startsWith("```json")) {
                        cleanedJsonString = cleanedJsonString.substring(7).trim();
                    }
                    if (cleanedJsonString.endsWith("```")) {
                        cleanedJsonString = cleanedJsonString.slice(0, -3).trim();
                    }
                    try {
                        return JSON.parse(cleanedJsonString);
                    } catch (e) {
                        console.error("清理後的 JSON 解析失敗:", e);
                        console.error("原始字串:", jsonString);
                        throw new Error("無法解析 API 回傳的 JSON 字串。");
                    }
                }
            } catch (error) {
                console.error('Error generating structured response:', error);
            }
            return null;
        }
        async function shouldPerformWebSearch(prompt) {
            const apiKey = getApiKeyForProvider('gemini');
            if (!apiKey) {
                console.warn("Gemini API key is not set. Cannot perform auto web search check.");
                return false;
            }
            const systemPrompt = "你是一個判斷器，根據使用者問題判斷是否需要連網搜尋。如果問題是關於即時、最新資訊、或特定事實，請回答'yes'。如果是常識性、創意寫作、程式碼等，請回答'no'。只輸出'yes'或'no'，不要有任何其他文字。";
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CHEAP_MODEL_ID}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: systemPrompt }] },
                        { role: 'model', parts: [{ text: "好的，我會只回答'yes'或'no'。" }] },
                        { role: 'user', parts: [{ text: prompt }] }
                    ],
                }),
                signal: AbortSignal.timeout(3000)
            });
            if (!response.ok) {
                console.error('Auto web search check failed:', await response.text());
                return false;
            }
            const result = await response.json();
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
            return text === 'yes';
        }
        const generateTitleAndSummary = async (conv) => {
            const conversationHistory = conv.messages.slice(0, 5).map(m => `${m.role}: ${m.parts.map(p => p.text).join(' ')}`).join('\n');
            const prompt = `為以下對話生成一個簡潔且能代表核心主題的標題。標題應直接反映使用者詢問的主要內容，而不是以你的視角描述AI的行為，（例如，好的標題是「法國首都」，而不是「回答地理問題」）。標題限制在10個字以內。請嚴格按照以下 JSON 格式輸出，不要有任何額外的文字或解釋:\n{"title": "你的標題", "summary": "你的一句話摘要"}\n\n對話內容:\n${conversationHistory}`;
            const responseSchema = {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                    summary: { type: "STRING" }
                },
                propertyOrdering: ["title", "summary"]
            };
            const data = await callApiWithSchema(prompt, responseSchema);
            if (data && data.title && data.summary) {
                conv.title = data.title;
                conv.summary = data.summary;
                conv.isNaming = false;
                await saveAppData();
                renderHistorySidebar();
                if (conv.id === activeConversationId) { ALL_ELEMENTS.headerTitle.textContent = conv.title; }
                showNotification(i18n[config.uiLanguage].autoNamed || '對話已自動命名', 'success');
            } else {
                conv.isNaming = false;
                await saveAppData();
                renderHistorySidebar();
                console.error("Auto-naming failed: No valid JSON found in the response.");
            }
        };
        const updateSubmitButtonState = (isGenerating) => {
            const { submitButton, submitButtonIcon } = ALL_ELEMENTS;
            if (isGenerating) {
                submitButton.disabled = false;
                submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
            } else {
                updateInputState();
            }
        };
        const updateInputState = () => {
            const hasContent = ALL_ELEMENTS.messageInput.value.trim() !== '' || uploadedFiles.length > 0;
            const { submitButton, submitButtonIcon } = ALL_ELEMENTS;
            const sendIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`;
            const disabledIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="m5.7 5.7 12.6 12.6"></path></svg>`;
            if (abortController) {
                submitButton.disabled = false;
                submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
                return;
            }
            const conv = getActiveConversation();
            if (!conv) {
                submitButton.disabled = true;
                submitButtonIcon.innerHTML = disabledIconHTML;
                return;
            }
            if (conv.archived) {
                ALL_ELEMENTS.messageInput.disabled = true;
                submitButton.disabled = true;
                ALL_ELEMENTS.messageInput.placeholder = i18n[config.uiLanguage].viewingArchived || '正在檢視封存的對話，無法傳送訊息。';
                return;
            }
            const modelInfo = normalizeConversationModel(conv);
            const provider = modelInfo?.provider;
            const councilValidation = getCouncilValidation(conv);
            const hasTavilyKey = !conversationNeedsTavilySearch(conv) || !!getApiKeyForProvider('tavily');
            const hasModelApiKey = isCouncilEnabled(conv)
                ? councilValidation.reason !== 'missingApiKey'
                : !!getApiKeyForProvider(provider);
            const canSubmitWithSearch = hasTavilyKey;
            const hasApiKey = hasModelApiKey && canSubmitWithSearch;
            ALL_ELEMENTS.messageInput.disabled = !hasModelApiKey;
            ALL_ELEMENTS.messageInput.placeholder = hasModelApiKey
                ? (isCouncilEnabled(conv) && !councilValidation.ok ? councilValidation.message : i18n[config.uiLanguage].enterMessagePlaceholder)
                : i18n[config.uiLanguage].enterApiKeyPlaceholder;
            if (!hasApiKey || !hasContent || (isCouncilEnabled(conv) && !councilValidation.ok)) {
                submitButton.disabled = true;
                submitButtonIcon.innerHTML = disabledIconHTML;
            } else {
                submitButton.disabled = false;
submitButtonIcon.innerHTML = sendIconHTML;
            }
        };
        const getTavilySearchDepth = () => config.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
        const ensureCouncilTranslatorSettingsControls = () => {
            if (!document.getElementById('nvidia-api-key-input')) {
                const openrouterInput = document.getElementById('openrouter-api-key-input-all');
                const openrouterBlock = openrouterInput?.closest('div');
                if (openrouterBlock) {
                    openrouterBlock.insertAdjacentHTML('afterend', `
                        <div>
                            <label for="step-plan-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="stepPlanApiKey">Step Plan API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="stepPlanApiDesc">Enable StepFun Step Plan reasoning models.</p>
                            <input type="password" id="step-plan-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="sk-..." data-lang-key-placeholder="stepPlanApiPlaceholder">
                        </div>
                        <div>
                            <label for="nvidia-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="nvidiaApiKey">NVIDIA API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="nvidiaApiDesc">Enable NVIDIA free models.</p>
                            <input type="password" id="nvidia-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="nvapi-..." data-lang-key-placeholder="nvidiaApiPlaceholder">
                        </div>
                        <div>
                            <label for="tavily-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="tavilyApiKey">Tavily API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilyApiDesc">Used for OpenRouter and NVIDIA web search.</p>
                            <input type="password" id="tavily-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="tvly-..." data-lang-key-placeholder="tavilyApiPlaceholder">
                        </div>
                        <div>
                            <label for="tavily-search-depth-select" class="block text-sm font-medium mb-1" data-lang-key="tavilySearchDepth">Tavily search depth</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilySearchDepthDesc">Choose basic for lower cost, or advanced for deeper searches.</p>
                            <select id="tavily-search-depth-select" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]">
                                <option value="basic" data-lang-key="tavilySearchBasic">Basic</option>
                                <option value="advanced" data-lang-key="tavilySearchAdvanced">Advanced</option>
                            </select>
                        </div>
                        <div>
                            <label for="council-translator-model-select" class="block text-sm font-medium mb-1" data-lang-key="councilTranslatorModel">Council document translation</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="councilTranslatorModelDesc">Only translates attachments or documents that council members cannot read directly.</p>
                            <input type="hidden" id="council-translator-model-select">
                            <div class="translator-model-picker" data-translator-picker="councilTranslatorModelId"></div>
                        </div>
                        <div>
                            <label for="single-document-translator-model-select" class="block text-sm font-medium mb-1" data-lang-key="singleDocumentTranslatorModel">單模型文件轉譯模型</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="singleDocumentTranslatorModelDesc">提供給不支援文件上傳的單一模型，只在該次請求轉成詳細文字包。</p>
                            <input type="hidden" id="single-document-translator-model-select">
                            <div class="translator-model-picker" data-translator-picker="singleDocumentTranslatorModelId"></div>
                        </div>
                        
                    `);
                }
            }
            if (!document.getElementById('tavily-api-key-input')) {
                const nvidiaInput = document.getElementById('nvidia-api-key-input');
                const nvidiaBlock = nvidiaInput?.closest('div');
                if (nvidiaBlock) {
                    nvidiaBlock.insertAdjacentHTML('afterend', `
                        <div>
                            <label for="tavily-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="tavilyApiKey">Tavily API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilyApiDesc">Used for OpenRouter and NVIDIA web search.</p>
                            <input type="password" id="tavily-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="tvly-..." data-lang-key-placeholder="tavilyApiPlaceholder">
                        </div>
                    `);
                }
            }
            if (!document.getElementById('tavily-search-depth-select')) {
                const tavilyInput = document.getElementById('tavily-api-key-input');
                const tavilyBlock = tavilyInput?.closest('div');
                if (tavilyBlock) {
                    tavilyBlock.insertAdjacentHTML('afterend', `
                        <div>
                            <label for="tavily-search-depth-select" class="block text-sm font-medium mb-1" data-lang-key="tavilySearchDepth">Tavily search depth</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilySearchDepthDesc">Choose basic for lower cost, or advanced for deeper searches.</p>
                            <select id="tavily-search-depth-select" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]">
                                <option value="basic" data-lang-key="tavilySearchBasic">Basic</option>
                                <option value="advanced" data-lang-key="tavilySearchAdvanced">Advanced</option>
                            </select>
                        </div>
                    `);
                }
            }
            if (!document.getElementById('step-plan-api-key-input')) {
                const openrouterInput = document.getElementById('openrouter-api-key-input-all');
                const openrouterBlock = openrouterInput?.closest('div');
                if (openrouterBlock) {
                    openrouterBlock.insertAdjacentHTML('afterend', `
                        <div>
                            <label for="step-plan-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="stepPlanApiKey">Step Plan API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="stepPlanApiDesc">Enable StepFun Step Plan reasoning models.</p>
                            <input type="password" id="step-plan-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="sk-..." data-lang-key-placeholder="stepPlanApiPlaceholder">
                        </div>
                    `);
                }
            }
            ALL_ELEMENTS.nvidiaApiKeyInput = document.getElementById('nvidia-api-key-input');
            ALL_ELEMENTS.stepPlanApiKeyInput = document.getElementById('step-plan-api-key-input');
            ALL_ELEMENTS.tavilyApiKeyInput = document.getElementById('tavily-api-key-input');
            ALL_ELEMENTS.tavilySearchDepthSelect = document.getElementById('tavily-search-depth-select');
            ALL_ELEMENTS.councilTranslatorModelSelect = document.getElementById('council-translator-model-select');
            ALL_ELEMENTS.singleDocumentTranslatorModelSelect = document.getElementById('single-document-translator-model-select');
        };
        const renderTranslatorModelPicker = ({ input, pickerKey, configKey, candidates, emptyText }) => {
            const picker = document.querySelector(`[data-translator-picker="${pickerKey}"]`);
            if (!input || !picker) return;
            const translations = i18n[config.uiLanguage] || i18n['zh-TW'];
            if (candidates.length === 0) {
                input.value = '';
                input.disabled = true;
                config[configKey] = null;
                picker.innerHTML = `
                    <button type="button" class="translator-picker-button" disabled>
                        <span>${escapeHTML(emptyText)}</span>
                    </button>
                `;
                return;
            }
            input.disabled = false;
            if (!candidates.some(model => model.id === config[configKey])) {
                config[configKey] = candidates[0].id;
            }
            input.value = config[configKey] || '';
            const selectedModel = candidates.find(model => model.id === config[configKey]) || candidates[0];
            const featureLabels = (model) => [
                modelSupportsVision(model) ? (translations.vision || '視覺') : '',
                modelSupportsDocumentUpload(model) ? (translations.document || '文件') : ''
            ].filter(Boolean);
            const optionHTML = candidates.map(model => {
                const selected = model.id === selectedModel.id;
                return `
                    <button type="button" class="translator-picker-option ${selected ? 'selected' : ''}" data-translator-option="${escapeHTML(model.id)}">
                        <span class="translator-picker-option-main">
                            <strong>${escapeHTML(model.name)}</strong>
                            <small>${escapeHTML(getProviderLabel(model.provider))} · ${escapeHTML(getModelPriceLabel(model))}</small>
                        </span>
                        <span class="translator-picker-option-chips">
                            ${featureLabels(model).map(label => `<span>${escapeHTML(label)}</span>`).join('')}
                        </span>
                    </button>
                `;
            }).join('');
            picker.innerHTML = `
                <button type="button" class="translator-picker-button" data-translator-picker-button="${pickerKey}" aria-expanded="false">
                    <span class="translator-picker-current">
                        <strong>${escapeHTML(selectedModel.name)}</strong>
                        <small>${escapeHTML(getProviderLabel(selectedModel.provider))} · ${escapeHTML(getModelPriceLabel(selectedModel))}</small>
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div class="translator-picker-menu" data-translator-picker-menu="${pickerKey}" hidden>
                    ${optionHTML}
                </div>
            `;
            picker.querySelector('[data-translator-picker-button]')?.addEventListener('click', (event) => {
                event.stopPropagation();
                const menu = picker.querySelector('[data-translator-picker-menu]');
                const isOpen = !menu.hasAttribute('hidden');
                document.querySelectorAll('.translator-picker-menu').forEach(item => item.setAttribute('hidden', ''));
                document.querySelectorAll('[data-translator-picker-button]').forEach(button => button.setAttribute('aria-expanded', 'false'));
                if (!isOpen) {
                    menu.removeAttribute('hidden');
                    picker.querySelector('[data-translator-picker-button]')?.setAttribute('aria-expanded', 'true');
                }
            });
            picker.querySelectorAll('[data-translator-option]').forEach(option => {
                option.addEventListener('click', () => {
                    config[configKey] = option.dataset.translatorOption;
                    input.value = config[configKey];
                    renderTranslatorModelPickers();
                });
            });
        };
        const renderTranslatorModelPickers = () => {
            const translations = i18n[config.uiLanguage] || i18n['zh-TW'];
            renderTranslatorModelPicker({
                input: ALL_ELEMENTS.councilTranslatorModelSelect,
                pickerKey: 'councilTranslatorModelId',
                configKey: 'councilTranslatorModelId',
                candidates: getCouncilTranslatorCandidates(),
                emptyText: translations.noCouncilTranslatorModels || '沒有可用的理事會轉譯模型'
            });
            renderTranslatorModelPicker({
                input: ALL_ELEMENTS.singleDocumentTranslatorModelSelect,
                pickerKey: 'singleDocumentTranslatorModelId',
                configKey: 'singleDocumentTranslatorModelId',
                candidates: getSingleTranslatorCandidates(),
                emptyText: translations.noSingleTranslatorModels || '沒有可用的單模型轉譯模型'
            });

            if (!document.__translatorPickerOutsideHandlerBound) {
                document.__translatorPickerOutsideHandlerBound = true;
                document.addEventListener('click', (event) => {
                    if (event.target.closest('.translator-model-picker')) return;
                    document.querySelectorAll('.translator-picker-menu').forEach(item => item.setAttribute('hidden', ''));
                    document.querySelectorAll('[data-translator-picker-button]').forEach(button => button.setAttribute('aria-expanded', 'false'));
                });
            }
        };
        const ensureOutputModeSettingsControls = () => {
            const section = document.getElementById('accessibility-section');
            if (!section) return;
            let row = document.getElementById('output-mode-setting-row');
            if (!row) {
                row = document.createElement('div');
                row.id = 'output-mode-setting-row';
                row.className = 'mt-4';
                const anchor = section.querySelector('#auto-web-search-toggle-switch')?.closest('.flex.items-center.justify-between');
                if (anchor) {
                    anchor.after(row);
                } else {
                    section.appendChild(row);
                }
            }
            if (!row.querySelector('.custom-output-mode-select')) {
                row.innerHTML = `
                    <div id="output-mode-label" class="block text-sm font-medium mb-1"></div>
                    <p class="text-xs text-[var(--text-secondary)] mb-2"></p>
                    <input type="hidden" id="output-mode-select" value="${escapeHTML(getOutputMode())}">
                    <div class="custom-output-mode-select" role="radiogroup" aria-labelledby="output-mode-label">
                        <button type="button" class="custom-output-mode-option" data-output-mode-option="typewriter" role="radio" aria-checked="false"></button>
                        <button type="button" class="custom-output-mode-option" data-output-mode-option="realtime" role="radio" aria-checked="false"></button>
                    </div>
                `;
            }
            const text = getOutputModeSettingsText(config.uiLanguage);
            row.querySelector('#output-mode-label').textContent = text.title;
            row.querySelector('p').textContent = text.desc;
            ALL_ELEMENTS.outputModeSelect = row.querySelector('#output-mode-select');
            const syncOutputModeButtons = () => {
                const value = ALL_ELEMENTS.outputModeSelect?.value === 'realtime' ? 'realtime' : 'typewriter';
                row.querySelectorAll('[data-output-mode-option]').forEach(button => {
                    const isActive = button.dataset.outputModeOption === value;
                    button.classList.toggle('active', isActive);
                    button.setAttribute('aria-checked', String(isActive));
                });
            };
            row.querySelector('[data-output-mode-option="typewriter"]').textContent = text.typewriter;
            row.querySelector('[data-output-mode-option="realtime"]').textContent = text.realtime;
            row.querySelectorAll('[data-output-mode-option]').forEach(button => {
                if (button.dataset.outputModeBound === 'true') return;
                button.dataset.outputModeBound = 'true';
                button.addEventListener('click', () => {
                    ALL_ELEMENTS.outputModeSelect.value = button.dataset.outputModeOption === 'realtime' ? 'realtime' : 'typewriter';
                    syncOutputModeButtons();
                    ALL_ELEMENTS.outputModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                });
            });
            syncOutputModeButtons();
        };
        const isMobileSettingsViewport = () => window.matchMedia('(max-width: 768px)').matches;
        const SETTINGS_MOBILE_VIEW_TRANSITION_MS = 280;
        let settingsMobileViewTransitionTimer = null;
        const getSettingsText = (key, fallback) => i18n[config.uiLanguage]?.[key] || fallback;
        const getSettingsMobileGroups = () => getSettingsMobileGroupsBase(getSettingsText);
        const renderSettingsMobileList = () => {
            const settingsMobileList = document.getElementById('settings-mobile-list');
            if (!settingsMobileList) return;
            settingsMobileList.innerHTML = getSettingsMobileGroups().map(group => `
                <section class="settings-mobile-group">
                    <h3 class="settings-mobile-group-title">${escapeHTML(group.title)}</h3>
                    <div class="settings-mobile-card">
                        ${group.items.map(item => `
                            <button type="button" class="settings-mobile-list-item settings-nav-item" data-section="${escapeHTML(item.section)}" data-mobile-title="${escapeHTML(item.label)}">
                                <span class="settings-mobile-row-icon">${SETTINGS_MOBILE_ICON_MAP[item.section] || SETTINGS_MOBILE_ICON_MAP.about}</span>
                                <span class="settings-mobile-row-label">${escapeHTML(item.label)}</span>
                                <span class="settings-mobile-chevron" aria-hidden="true">&rsaquo;</span>
                            </button>
                        `).join('')}
                    </div>
                </section>
            `).join('') + `
                <section class="settings-mobile-group settings-mobile-logout-group">
                    <div class="settings-mobile-card">
                        <button type="button" id="settings-mobile-logout-btn" class="settings-mobile-list-item settings-mobile-list-item-danger">
                            <span class="settings-mobile-row-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
                            </span>
                            <span class="settings-mobile-row-label">${escapeHTML(getSettingsText('logout', '登出'))}</span>
                        </button>
                    </div>
                </section>
            `;
            settingsMobileList.querySelector('#settings-mobile-logout-btn')?.addEventListener('click', handleLogout);
        };
        const ensureSettingsMobileShell = () => {
            const settingsBody = ALL_ELEMENTS.settingsModal?.querySelector('.flex.flex-1.overflow-hidden');
            if (!settingsBody || document.getElementById('settings-mobile-header')) return;
            const mobileHeader = document.createElement('div');
            mobileHeader.id = 'settings-mobile-header';
            mobileHeader.innerHTML = `
                <button type="button" id="settings-mobile-back-btn" aria-label="返回">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
                </button>
                <h2 id="settings-mobile-title">${escapeHTML(getSettingsText('settings', '設定'))}</h2>
            `;
            const mobileList = document.createElement('div');
            mobileList.id = 'settings-mobile-list';
            settingsBody.prepend(mobileList);
            settingsBody.prepend(mobileHeader);
            const settingsMobileBackBtn = document.getElementById('settings-mobile-back-btn');
            settingsMobileBackBtn.addEventListener('click', () => showSettingsMobileList());
            mobileList.addEventListener('click', (event) => {
                const item = event.target.closest('.settings-mobile-list-item');
                if (!item?.dataset.section) return;
                openSettingsMobileSection(item.dataset.section);
            });
        };
        const clearSettingsMobileViewTransition = () => {
            if (!settingsMobileViewTransitionTimer) return;
            clearTimeout(settingsMobileViewTransitionTimer);
            settingsMobileViewTransitionTimer = null;
        };
        const showSettingsMobileList = ({ animate = true } = {}) => {
            ensureSettingsMobileShell();
            renderSettingsMobileList();
            const settingsModal = ALL_ELEMENTS.settingsModal;
            const finishReturn = () => {
                settingsModal.classList.remove('settings-mobile-detail-open', 'settings-mobile-returning');
                document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '閮剖?');
                document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
                settingsMobileViewTransitionTimer = null;
            };
            clearSettingsMobileViewTransition();
            if (animate && isMobileSettingsViewport() && settingsModal.classList.contains('settings-mobile-detail-open')) {
                settingsModal.classList.add('settings-mobile-returning');
                document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '閮剖?');
                settingsMobileViewTransitionTimer = setTimeout(finishReturn, SETTINGS_MOBILE_VIEW_TRANSITION_MS);
                return;
            }
            finishReturn();
            document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '設定');
            document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
        };
        const openSettingsMobileSection = (sectionName) => {
            ensureSettingsMobileShell();
            clearSettingsMobileViewTransition();
            const targetSection = document.getElementById(`${sectionName}-section`);
            if (!targetSection) return;
            ALL_ELEMENTS.settingsModal.classList.remove('settings-mobile-returning');
            document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
            targetSection.classList.add('active');
            const listItem = Array.from(document.querySelectorAll('#settings-mobile-list [data-section]')).find(item => item.dataset.section === sectionName);
            document.getElementById('settings-mobile-title').textContent = listItem?.dataset.mobileTitle || sectionName;
            ALL_ELEMENTS.settingsModal.classList.add('settings-mobile-detail-open');
        };
        const setupSettingsModal = () => {
            ensureSettingsMobileShell();
            ensureCouncilTranslatorSettingsControls();
            ensureOutputModeSettingsControls();
            ALL_ELEMENTS.geminiApiKeyInput.value = getApiKeyForProvider('gemini');
            ALL_ELEMENTS.openrouterApiKeyInputAll.value = getApiKeyForProvider('openrouter');
            if (ALL_ELEMENTS.stepPlanApiKeyInput) ALL_ELEMENTS.stepPlanApiKeyInput.value = getApiKeyForProvider('stepfun');
            if (ALL_ELEMENTS.nvidiaApiKeyInput) ALL_ELEMENTS.nvidiaApiKeyInput.value = getApiKeyForProvider('nvidia');
            if (ALL_ELEMENTS.tavilyApiKeyInput) ALL_ELEMENTS.tavilyApiKeyInput.value = getApiKeyForProvider('tavily');
            if (ALL_ELEMENTS.tavilySearchDepthSelect) ALL_ELEMENTS.tavilySearchDepthSelect.value = getTavilySearchDepth();
            renderTranslatorModelPickers();
            applyLanguage(config.uiLanguage);
            ALL_ELEMENTS.autoNamingToggleSwitch.checked = config.autoNaming;
            ALL_ELEMENTS.autoWebSearchToggleSwitch.checked = config.enableAutoWebSearch;
            if (ALL_ELEMENTS.outputModeSelect) {
                ALL_ELEMENTS.outputModeSelect.value = getOutputMode();
                document.querySelectorAll('#output-mode-setting-row [data-output-mode-option]').forEach(button => {
                    const isActive = button.dataset.outputModeOption === ALL_ELEMENTS.outputModeSelect.value;
                    button.classList.toggle('active', isActive);
                    button.setAttribute('aria-checked', String(isActive));
                });
            }
            ALL_ELEMENTS.memoryToggle1.checked = config.memoryEnabled1;
            ALL_ELEMENTS.autoMemoryToggleSwitch.checked = config.enableAutoMemory;
            ALL_ELEMENTS.uiLanguageSelect.value = config.uiLanguage;
            ALL_ELEMENTS.aiLanguageSelect.value = config.aiDefaultLanguage;
            ALL_ELEMENTS.enableUpdateNotificationsToggle.checked = config.enableUpdateNotifications;
            renderPersonalMemoryList();
            updateThemeButtons();
            renderModelManagementUI();
            const aiBubbleColorTitle = document.querySelector('h3[data-lang-key="aiBubbleColor"]');
            const aiBubbleColorDropdown = ALL_ELEMENTS.aiBubbleColorDropdown;
            if (config.customWallpaper) {
                // 只有在自訂桌布模式下才顯示 AI 泡泡顏色選項
                aiBubbleColorTitle.style.display = 'block';
                aiBubbleColorDropdown.style.display = 'block';
                renderAiBubbleColorDropdown();
            } else {
                // 否則隱藏
                aiBubbleColorTitle.style.display = 'none';
                aiBubbleColorDropdown.style.display = 'none';
            }


            // 使用者泡泡顏色設定總是顯示並渲染
            renderUserBubbleColorDropdown();
            renderUiColorOptions();
            renderTrash();
            renderSettingsMobileList();
            const navItems = ALL_ELEMENTS.settingsNav.querySelectorAll('.settings-nav-item');
            navItems.forEach(item => {
                if (item.dataset.settingsDesktopBound === 'true') return;
                item.dataset.settingsDesktopBound = 'true';
                item.addEventListener('click', () => {
                    navItems.forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    const sectionId = item.dataset.section + '-section';
                    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                    document.getElementById(sectionId).classList.add('active');
                });
            });
            if (isMobileSettingsViewport()) {
                showSettingsMobileList({ animate: false });
            } else {
                clearSettingsMobileViewTransition();
                ALL_ELEMENTS.settingsModal.classList.remove('settings-mobile-detail-open', 'settings-mobile-returning');
                const activeNavItem = ALL_ELEMENTS.settingsNav.querySelector('.settings-nav-item.active') || ALL_ELEMENTS.settingsNav.querySelector('.settings-nav-item');
                if (activeNavItem) {
                    navItems.forEach(i => i.classList.toggle('active', i === activeNavItem));
                    document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
                    document.getElementById(`${activeNavItem.dataset.section}-section`)?.classList.add('active');
                }
            }
        };
        legacyRuntimeContext.registerLazyBinding('settings.setupSettingsModal', () => setupSettingsModal);
        legacyRuntimeContext.registerLazyBinding('input.updateInputState', () => updateInputState);
        const saveSettings = async ({ close = true, notify = true } = {}) => {
            config.apiKeys.gemini = ALL_ELEMENTS.geminiApiKeyInput.value.trim();
            config.apiKeys.openrouter = ALL_ELEMENTS.openrouterApiKeyInputAll.value.trim();
            config.apiKeys.stepPlan = ALL_ELEMENTS.stepPlanApiKeyInput?.value.trim() || '';
            config.apiKeys.nvidia = ALL_ELEMENTS.nvidiaApiKeyInput?.value.trim() || '';
            config.apiKeys.tavily = ALL_ELEMENTS.tavilyApiKeyInput?.value.trim() || '';
            config.tavilySearchDepth = ALL_ELEMENTS.tavilySearchDepthSelect?.value === 'advanced' ? 'advanced' : 'basic';
            config.councilTranslatorModelId = ALL_ELEMENTS.councilTranslatorModelSelect?.value || null;
            config.singleDocumentTranslatorModelId = ALL_ELEMENTS.singleDocumentTranslatorModelSelect?.value || null;
            config.enableAutoWebSearch = ALL_ELEMENTS.autoWebSearchToggleSwitch.checked;
            config.outputMode = ALL_ELEMENTS.outputModeSelect?.value === 'realtime' ? 'realtime' : 'typewriter';
            config.aiBubbleColor = ALL_ELEMENTS.aiBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default';
            config.userBubbleColor = ALL_ELEMENTS.userBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default';
            config.autoNaming = ALL_ELEMENTS.autoNamingToggleSwitch.checked;
            config.memoryEnabled1 = ALL_ELEMENTS.memoryToggle1.checked;
            config.enableAutoMemory = ALL_ELEMENTS.autoMemoryToggleSwitch.checked;
            config.uiLanguage = ALL_ELEMENTS.uiLanguageSelect.value;
            config.aiDefaultLanguage = ALL_ELEMENTS.aiLanguageSelect.value;
            config.enableUpdateNotifications = ALL_ELEMENTS.enableUpdateNotificationsToggle.checked;
            const selectedThemeMode = document.querySelector('input[name="color-theme"]:checked').value;
            const selectedCustomColor = ALL_ELEMENTS.customColorSwatches.querySelector('.selected')?.dataset.color || config.uiTheme.customColor;
            const selectedStyle = document.querySelector('input[name="color-style"]:checked')?.value || 'single';
            const selectedGradientSwatch = ALL_ELEMENTS.gradientSwatches.querySelector('.selected-gradient');
            const selectedGradient = selectedGradientSwatch ? selectedGradientSwatch.dataset.gradient : (config.uiTheme.adaptivePalette?.length > 1 ? `linear-gradient(to right, ${config.uiTheme.adaptivePalette[0]}, ${config.uiTheme.adaptivePalette[1]})` : '');
            config.uiTheme.mode = selectedThemeMode;
            config.uiTheme.customColor = selectedCustomColor;
            config.uiTheme.style = selectedStyle;
            config.uiTheme.adaptiveGradient = selectedGradient;
            setAiBubbleColor();
            setUserBubbleColor();
            applyUiTheme();
            await saveConfig();
            applyLanguage(config.uiLanguage);
            renderModelSwitcher();
            renderChat();
            renderStore();
            if (close) {
                toggleModal(ALL_ELEMENTS.settingsModal, false);
            }
            updateApiKeyWarningBadge();
            updateInputState();
            if (notify) {
                showNotification(i18n[config.uiLanguage].settingsSaved || '設定已儲存！');
            }
        };
        const setAiBubbleColor = () => {
            const root = document.documentElement;
            const isWallpaperActive = document.body.classList.contains('custom-wallpaper-active');
            const mode = config.theme;
            const colors = AI_BUBBLE_COLORS[config.aiBubbleColor] || AI_BUBBLE_COLORS.default;
            const hexColor = colors[mode];
            if (isWallpaperActive) {
                const rgbaColor = hexToRgba(hexColor, 0.75);
                root.style.setProperty('--ai-bubble-bg', rgbaColor);
            } else {
                root.style.setProperty('--ai-bubble-bg', 'transparent');
            }
        };
        const setUserBubbleColor = () => {
            const root = document.documentElement;
            const isWallpaperActive = document.body.classList.contains('custom-wallpaper-active');
            const mode = config.theme;
            const colors = USER_BUBBLE_COLORS[config.userBubbleColor] || USER_BUBBLE_COLORS.default;
            const hexColor = colors[mode];
            if (isWallpaperActive) {
                const rgbaColor = hexToRgba(hexColor, 0.7);
                root.style.setProperty('--user-bubble-bg', rgbaColor);
            } else {
                // 這是關鍵修正：在非桌布模式下，直接使用您選擇的實心顏色
                root.style.setProperty('--user-bubble-bg', hexColor);
            }
        };
        const renderAiBubbleColorDropdown = () => {
            const container = ALL_ELEMENTS.aiBubbleColorDropdown;
            container.innerHTML = '';
            const currentColor = config.aiBubbleColor;
            const currentName = currentColor.charAt(0).toUpperCase() + currentColor.slice(1);
            const currentHex = AI_BUBBLE_COLORS[currentColor][config.theme];
            const btn = document.createElement('button');
            btn.className = 'color-dropdown-btn';
            btn.dataset.color = currentColor;
            btn.innerHTML = `
                <div class="color-preview" style="background-color: ${currentHex};"></div>
                <span>${currentName}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            `;
            const menu = document.createElement('div');
            menu.className = 'color-dropdown-menu';
            Object.keys(AI_BUBBLE_COLORS).forEach(color => {
                const option = document.createElement('div');
                option.className = 'color-option';
                option.dataset.color = color;
                const preview = document.createElement('div');
                preview.className = 'color-preview';
                preview.style.backgroundColor = AI_BUBBLE_COLORS[color][config.theme];
                const name = color.charAt(0).toUpperCase() + color.slice(1);
                option.appendChild(preview);
                option.appendChild(document.createTextNode(name));
                option.addEventListener('click', () => {
                    config.aiBubbleColor = color;
                    renderAiBubbleColorDropdown();
                    setAiBubbleColor();
                    menu.classList.remove('show');
                });
                menu.appendChild(option);
            });
            btn.addEventListener('click', () => {
                menu.classList.toggle('show');
                const rect = btn.getBoundingClientRect();
                const menuRect = menu.getBoundingClientRect();
                if (rect.bottom + menuRect.height > window.innerHeight) {
                    menu.style.top = 'auto';
                    menu.style.bottom = '100%';
                } else {
                    menu.style.top = '100%';
                    menu.style.bottom = 'auto';
                }
            });
            container.appendChild(btn);
            container.appendChild(menu);
        };
        const renderUserBubbleColorDropdown = () => {
            const container = ALL_ELEMENTS.userBubbleColorDropdown;
            container.innerHTML = '';
            const currentColor = config.userBubbleColor;
            const currentName = currentColor.charAt(0).toUpperCase() + currentColor.slice(1);
            const currentHex = USER_BUBBLE_COLORS[currentColor][config.theme];
            const btn = document.createElement('button');
            btn.className = 'color-dropdown-btn';
            btn.dataset.color = currentColor;
            btn.innerHTML = `
                <div class="color-preview" style="background-color: ${currentHex};"></div>
                <span>${currentName}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            `;
            const menu = document.createElement('div');
            menu.className = 'color-dropdown-menu';
            Object.keys(USER_BUBBLE_COLORS).forEach(color => {
                const option = document.createElement('div');
                option.className = 'color-option';
                option.dataset.color = color;
                const preview = document.createElement('div');
                preview.className = 'color-preview';
                preview.style.backgroundColor = USER_BUBBLE_COLORS[color][config.theme];
                const name = color.charAt(0).toUpperCase() + color.slice(1);
                option.appendChild(preview);
                option.appendChild(document.createTextNode(name));
                option.addEventListener('click', () => {
                    config.userBubbleColor = color;
                    renderUserBubbleColorDropdown();
                    setUserBubbleColor();
                    menu.classList.remove('show');
                });
                menu.appendChild(option);
            });
            btn.addEventListener('click', () => {
                menu.classList.toggle('show');
                const rect = btn.getBoundingClientRect();
                const menuRect = menu.getBoundingClientRect();
                if (rect.bottom + menuRect.height > window.innerHeight) {
                    menu.style.top = 'auto';
                    menu.style.bottom = '100%';
                } else {
                    menu.style.top = '100%';
                    menu.style.bottom = 'auto';
                }
            });
            container.appendChild(btn);
            container.appendChild(menu);
        };
        const createHistoryMenu = (convId, targetButton) => {
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
            if (spaceBelow < 250) {
                popover.style.bottom = `${window.innerHeight - rect.top}px`;
                popover.style.transformOrigin = 'bottom';
            } else {
                popover.style.top = `${rect.bottom}px`;
                popover.style.transformOrigin = 'top';
            }
            popover.style.left = `${rect.left}px`;
            const conv = conversations.find(c => c.id === convId);
            const pinText = conv.pinned ? (i18n[config.uiLanguage].unpin || '取消釘選') : (i18n[config.uiLanguage].pin || '釘選');
            const moveOptionsHTML = conv.folderId
                ? `<button data-id="${convId}" class="move-out-of-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].moveOutOfFolder || '移出資料夾'}</button>`
                : `
                    <div class="relative group">
                        <button class="w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm flex justify-between items-center">
                            <span>${i18n[config.uiLanguage].moveToFolder || '移至資料夾'}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                        <div class="absolute left-full top-0 w-48 rounded-lg border border-[var(--border-color)] bg-[var(--modal-bg)] hidden group-hover:block">
                            ${folders.map(f => `<button data-folder-id="${f.id}" class="move-to-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${f.name}</button>`).join('')}
                                <div class="border-t my-1 border-[var(--border-color)]"></div>
                                <button class="new-folder-from-menu-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].createNewFolder || '建立新資料夾'}</button>
                            </div>
                        </div>
                    `;
            popover.innerHTML = `
                <button data-id="${convId}" class="rename-conv-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].rename || '重新命名'}</button>
                <button data-id="${convId}" class="pin-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${pinText}</button>
                ${moveOptionsHTML}
                <button data-id="${convId}" class="archive-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].archive || '封存'}</button>
                <div class="border-t my-1 border-[var(--border-color)]"></div>
                <button data-id="${convId}" class="delete-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${i18n[config.uiLanguage].delete || '刪除'}</button>
            `;
            document.body.appendChild(popover);
            requestAnimationFrame(() => popover.classList.add('visible'));
            popover.querySelector('.rename-conv-btn').addEventListener('click', (e) => { showRenameModal(convId, 'conversation', e); popover.remove(); });
            popover.querySelector('.pin-btn').addEventListener('click', (e) => { togglePinChat(convId, e); popover.remove(); });
            popover.querySelector('.archive-btn').addEventListener('click', (e) => { archiveChat(convId, e); popover.remove(); });
            popover.querySelector('.delete-btn').addEventListener('click', (e) => { deleteChat(convId, e); popover.remove(); });
            popover.querySelectorAll('.move-to-folder-btn').forEach(btn => btn.addEventListener('click', () => { moveConversationToFolder(convId, btn.dataset.folderId); popover.remove(); }));
            const newFolderBtn = popover.querySelector('.new-folder-from-menu-btn');
            if (newFolderBtn) {
                newFolderBtn.addEventListener('click', async () => {
                    popover.remove();
                    const folderName = await showCustomPrompt(i18n[config.uiLanguage].enterFolderName || '請輸入新資料夾的名稱：', i18n[config.uiLanguage].createNewFolder || '建立新資料夾');
                    if (folderName) {
                        const newFolderId = createNewFolder(folderName);
                        moveConversationToFolder(convId, newFolderId);
                    }
                });
            }
            const moveOutBtn = popover.querySelector('.move-out-of-folder-btn');
            if (moveOutBtn) {
                moveOutBtn.addEventListener('click', () => { moveConversationToFolder(convId, null); popover.remove(); });
            }
        };
        const setTheme = async (theme) => {
            if (document.body.classList.contains('custom-wallpaper-active')) {
                return;
            }
            document.documentElement.classList.toggle('dark', theme === 'dark');
            config.theme = theme;
            setAiBubbleColor();
            setUserBubbleColor();
            await saveConfig();
            updateThemeButtons();
            if (!ALL_ELEMENTS.settingsModal.classList.contains('hidden')) {
                renderAiBubbleColorDropdown();
                renderUserBubbleColorDropdown();
            }
        };
        const updateThemeButtons = () => {
            ALL_ELEMENTS.themeDarkBtn.classList.remove('active');
            ALL_ELEMENTS.themeLightBtn.classList.remove('active');
            if (config.theme === 'dark') {
                ALL_ELEMENTS.themeDarkBtn.classList.add('active');
            } else {
                ALL_ELEMENTS.themeLightBtn.classList.add('active');
            }
        };
        const handleLogin = async (e) => {
    e.preventDefault();
    const username = ALL_ELEMENTS.usernameInput.value.trim();
    const password = ALL_ELEMENTS.passwordInput.value;
    if (!username || !password) {
        showNotification(i18n[config.uiLanguage].usernamePasswordRequired || '使用者名稱和密碼皆為必填項目。', 'error');
        return;
    }
    const userKey = getUserKey(username);
    const savedUser = await getItem(userKey);
    if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        if (!(await verifyPasswordRecord(password, parsedUser))) {
            showNotification(i18n[config.uiLanguage].passwordIncorrect || '密碼錯誤。', 'error');
            return;
        }
        currentUser = await upgradeLegacyPasswordRecord(password, userKey, parsedUser);
    } else {
        currentUser = await createPasswordRecord(username, password);
        await setItem(userKey, JSON.stringify(currentUser));
    }
    await setItem('chat_lastUser', username);


    // --- ✨ 這是唯一的修改處 START ---
    // 在執行淡出前，先移除我們為了顯示登入畫面而加入的 'visible' class
    ALL_ELEMENTS.authContainer.classList.remove('visible'); 
    // --- ✨ 這是唯一的修改處 END ---


    ALL_ELEMENTS.authContainer.classList.add('fade-out');
    ALL_ELEMENTS.appContainer.classList.remove('hidden');
    requestAnimationFrame(() => {
        ALL_ELEMENTS.appContainer.classList.add('visible');
    });
    ALL_ELEMENTS.authContainer.addEventListener('transitionend', () => {
        ALL_ELEMENTS.authContainer.style.display = 'none';
    }, { once: true });
    initChatApp();
};
        const handleLogout = async () => {
            if (await showCustomConfirm(i18n[config.uiLanguage].confirmLogout || '您確定要登出嗎？', i18n[config.uiLanguage].logoutConfirmation || '登出確認')) {
                await removeItem('chat_lastUser');
                window.location.reload();
            }
        };
        const handleDeleteAllData = async () => {
            const confirmation = await showCustomDialog({
                title: i18n[config.uiLanguage].deleteAllDataTitle || '永久刪除所有資料',
                message: i18n[config.uiLanguage].deleteAllDataMessage || '此操作將會刪除您所有的對話紀錄、設定、Astras 及 API 金鑰。此動作無法復原。請輸入「DELETE」以確認刪除。',
                input: { type: 'text', placeholder: 'DELETE' },
                dialogClass: 'dialog-warning-border',
                buttons: [
                    { text: i18n[config.uiLanguage].cancel || '取消', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => null },
                    { text: i18n[config.uiLanguage].confirmDelete || '確認刪除', class: 'bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700', value: (val) => val }
                ]
            });
            if (confirmation === 'DELETE') {
                try {
                    const idb = await openDB();
                    const tx = idb.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    await new Promise((resolve, reject) => {
                        const req = store.clear();
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                    showNotification(i18n[config.uiLanguage].deleteAllDataSuccess || '所有資料已成功刪除。頁面即將重新整理。', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                } catch (error) {
                    console.error('刪除資料時發生錯誤:', error);
                    showNotification(i18n[config.uiLanguage].deleteAllDataError || '刪除資料失敗。', 'error');
                }
            } else if (confirmation !== null) {
                showNotification(i18n[config.uiLanguage].incorrectInput || '輸入錯誤，操作已取消。', 'warning');
            }
        };
        const createNewFolder = (name) => {
            const newFolder = { id: crypto.randomUUID(), name,conversationIds: [], ...getDefaultFolder() };
            folders.push(newFolder);
            void saveAppData().catch(error => console.error('Failed to save folder state:', error));
            renderFolders();
            return newFolder.id;
        };
        const moveConversationToFolder = async (convId, folderId) => {
            const conv = conversations.find(c => c.id === convId);
            if (!conv) return;
            if (conv.folderId) {
                const oldFolder = folders.find(f => f.id === conv.folderId);
                if (oldFolder) {
                    oldFolder.conversationIds = oldFolder.conversationIds.filter(id => id !== convId);
                }
            }
            conv.folderId = folderId;
            if (folderId) {
                const newFolder = folders.find(f => f.id === folderId);
                if (newFolder && !newFolder.conversationIds.includes(convId)) {
                    newFolder.conversationIds.push(convId);
                }
            }
            await saveAppData();
            renderAll();
        };
        const deleteFolder = async (id, event) => {
            event?.stopPropagation();
            const folder = folders.find(f => f.id === id);
            if (!folder) return;
            const confirmMsg = folder.conversationIds.length > 0
                ? i18n[config.uiLanguage].confirmDeleteFolderWithChats
                : i18n[config.uiLanguage].confirmDeleteEmptyFolder;
            if (!(await showCustomConfirm(confirmMsg, i18n[config.uiLanguage].deleteFolderTitle))) return;
            conversations.forEach(c => {
                if (c.folderId === id) {
                    c.folderId = null;
                }
            });
            folders = folders.filter(f => f.id !== id);
            await saveAppData();
            renderAll();
            showNotification(i18n[config.uiLanguage].folderDeleted, 'success');
        };
        const showFolderSettingsModal = (id, event) => {
            event?.stopPropagation();
            folderToCustomize = id;
            const folder = folders.find(f => f.id === id);
            if (!folder) return;


            // 1. 選擇圖示線條顏色
            ALL_ELEMENTS.colorSwatchesContainer.innerHTML = '';
            // 設定標題
            const colorTitle = ALL_ELEMENTS.colorSwatchesContainer.parentElement.querySelector('h3');
            if (colorTitle) colorTitle.textContent = "設定圖示線條顏色";
            
            Object.entries(FOLDER_COLORS).forEach(([name, hex]) => {
                const swatch = document.createElement('div');
                // 增加 flex-shrink-0 防止被壓縮
                swatch.className = `color-swatch w-8 h-8 rounded-full cursor-pointer border-2 border-transparent flex-shrink-0`;
                swatch.style.backgroundColor = hex;
                swatch.dataset.color = name;
                if (normalizeFolderColorSelection(folder.color, FOLDER_COLORS) === name) {
                    swatch.classList.add('selected');
                    swatch.style.borderColor = '#3b82f6'; 
                }
                swatch.addEventListener('click', () => {
                    ALL_ELEMENTS.colorSwatchesContainer.querySelectorAll('.selected').forEach(el => {
                        el.classList.remove('selected');
                        el.style.borderColor = 'transparent';
                    });
                    swatch.classList.add('selected');
                    swatch.style.borderColor = '#3b82f6';
                });
                ALL_ELEMENTS.colorSwatchesContainer.appendChild(swatch);
            });


            // 2. 選擇 SVG 圖示 (修正排版)
            // 強制重設容器的 class，改用 flex wrap 或較寬鬆的 grid
            ALL_ELEMENTS.iconOptionsContainer.className = 'grid grid-cols-5 sm:grid-cols-6 gap-3 mt-2'; 
            ALL_ELEMENTS.iconOptionsContainer.innerHTML = '';
            
            Object.entries(FOLDER_SVGS).forEach(([key, svgPath]) => {
                const iconOption = document.createElement('div');
                // 確保圖示容器大小適中且不會跑版
                iconOption.className = 'icon-option w-11 h-11 sm:w-12 sm:h-12 rounded-lg cursor-pointer flex items-center justify-center bg-[var(--sidebar-bg)] border border-transparent hover:bg-[var(--hover-bg)] transition-all';
                // 這裡顯示 SVG
                iconOption.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
                iconOption.dataset.icon = key;
                
                if (folder.icon === key || (!folder.icon && key === 'default')) {
                    iconOption.classList.add('selected');
                    iconOption.style.borderColor = '#3b82f6';
                    iconOption.style.color = '#3b82f6';
                    iconOption.style.backgroundColor = 'var(--active-bg)'; // 選中時加深背景
                } else {
                    iconOption.style.color = 'var(--text-secondary)';
                }


                iconOption.addEventListener('click', () => {
                    ALL_ELEMENTS.iconOptionsContainer.querySelectorAll('.selected').forEach(el => {
                        el.classList.remove('selected');
                        el.style.borderColor = 'transparent';
                        el.style.color = 'var(--text-secondary)';
                        el.style.backgroundColor = '';
                    });
                    iconOption.classList.add('selected');
                    iconOption.style.borderColor = '#3b82f6';
                    iconOption.style.color = '#3b82f6';
                    iconOption.style.backgroundColor = 'var(--active-bg)';
                });
                ALL_ELEMENTS.iconOptionsContainer.appendChild(iconOption);
            });


            // 3. 選擇文字顏色
            let textColorContainer = document.getElementById('text-color-container');
            if (!textColorContainer) {
                const containerDiv = document.createElement('div');
                containerDiv.id = 'text-color-container';
                containerDiv.className = 'mt-6 border-t border-[var(--border-color)] pt-4';
                containerDiv.innerHTML = `
                    <h3 class="text-sm font-medium mb-3">選擇文字顏色</h3>
                    <div id="text-color-options" class="flex gap-4"></div>
                `;
                ALL_ELEMENTS.iconOptionsContainer.parentElement.after(containerDiv);
                textColorContainer = containerDiv;
            }


            const textColorOptions = document.getElementById('text-color-options');
            textColorOptions.innerHTML = '';
            
            const textColorMap = {
                'gray': { label: '預設灰', bg: '#6b7280', border: 'transparent' },
                'black': { label: '深邃黑', bg: '#111827', border: 'transparent' },
                'white': { label: '純淨白', bg: '#ffffff', border: '#e5e7eb' } 
            };


            Object.entries(textColorMap).forEach(([key, info]) => {
                const btn = document.createElement('button');
                btn.className = 'w-9 h-9 rounded-full cursor-pointer border-2 relative shadow-sm transition-transform hover:scale-110';
                btn.style.backgroundColor = info.bg;
                btn.style.borderColor = info.border;
                btn.dataset.textColor = key;
                btn.title = info.label;


                if (folder.textColor === key || (!folder.textColor && key === 'gray')) {
                    btn.classList.add('selected-text');
                    btn.innerHTML = `<svg class="w-5 h-5 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${key === 'white' ? 'text-black' : 'text-white'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    if (key === 'white') btn.style.borderColor = '#3b82f6';
                    else btn.style.boxShadow = '0 0 0 2px #3b82f6';
                }


                btn.addEventListener('click', () => {
                    textColorOptions.querySelectorAll('.selected-text').forEach(el => {
                        el.classList.remove('selected-text');
                        el.innerHTML = '';
                        el.style.boxShadow = '';
                        if (el.dataset.textColor === 'white') el.style.borderColor = '#e5e7eb';
                    });
                    btn.classList.add('selected-text');
                    btn.innerHTML = `<svg class="w-5 h-5 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${key === 'white' ? 'text-black' : 'text-white'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    if (key === 'white') btn.style.borderColor = '#3b82f6';
                    else btn.style.boxShadow = '0 0 0 2px #3b82f6';
                });
                textColorOptions.appendChild(btn);
            });


            toggleModal(ALL_ELEMENTS.folderSettingsModal, true);
        };
        const handleSaveFolderSettings = async () => {
            const folder = folders.find(f => f.id === folderToCustomize);
            if (!folder) return;


            // 1. 取得選中的線條顏色
            const selectedColor = ALL_ELEMENTS.colorSwatchesContainer.querySelector('.selected')?.dataset.color;
            
            // 2. 取得選中的圖示 Key
            const selectedIcon = ALL_ELEMENTS.iconOptionsContainer.querySelector('.selected')?.dataset.icon;
            
            // 3. 取得選中的文字顏色 (新功能)
            const textColorContainer = document.getElementById('text-color-options');
            const selectedTextColor = textColorContainer?.querySelector('.selected-text')?.dataset.textColor;


            if (selectedColor) folder.color = normalizeFolderColorSelection(selectedColor, FOLDER_COLORS);
            if (selectedIcon) folder.icon = selectedIcon;
            if (selectedTextColor) folder.textColor = selectedTextColor;


            await saveAppData();
            renderAll();
            toggleModal(ALL_ELEMENTS.folderSettingsModal, false);
            folderToCustomize = null;
        };
        const createFolderMenu = (folderId, targetButton) => {
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
            popover.style.top = `${rect.bottom}px`;
            popover.style.left = `${rect.left}px`;
            popover.innerHTML = `
                <button data-id="${folderId}" class="rename-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].rename || '重新命名'}</button>
                <button data-id="${folderId}" class="customize-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].customize || '自訂'}</button>
                <div class="border-t my-1 border-[var(--border-color)]"></div>
                <button data-id="${folderId}" class="delete-folder-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${i18n[config.uiLanguage].deleteFolder || '刪除資料夾'}</button>
            `;
            document.body.appendChild(popover);
            requestAnimationFrame(() => popover.classList.add('visible'));
            popover.querySelector('.rename-folder-btn').addEventListener('click', (e) => { showRenameModal(folderId, 'folder', e); popover.remove(); });
            popover.querySelector('.customize-folder-btn').addEventListener('click', (e) => { showFolderSettingsModal(folderId, e); popover.remove(); });
            popover.querySelector('.delete-folder-btn').addEventListener('click', (e) => { deleteFolder(folderId, e); popover.remove(); });
        };
        const toggleSelectionMode = () => {
    isSelectionMode = !isSelectionMode;
    selectedConversationIds.clear();


    // ✨ 核心修改：不再改變文字，而是切換 'active' CSS 類別
    ALL_ELEMENTS.selectionModeBtn.classList.toggle('active', isSelectionMode);


    // ✨ 優化：同時更新滑鼠懸停時的提示文字
    if (isSelectionMode) {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[config.uiLanguage].cancelBatchSelect || '取消批次選取';
    } else {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[config.uiLanguage].batchSelect || '批次選取';
    }


    renderAll();
};
        const renderBatchActionBar = () => {
            const { batchActionBar, userControls, selectionCount, batchDeleteBtn, batchArchiveBtn, batchMoveBtn } = ALL_ELEMENTS;
            if (isSelectionMode) {
                batchActionBar.classList.remove('hidden');
