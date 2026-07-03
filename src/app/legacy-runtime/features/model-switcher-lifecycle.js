export function prepareModelSwitcherModels({
    currentModelId,
    getModelApiId,
    getModelTiers,
    modelSettings = [],
    models = []
}) {
    const processedModels = models.map(model => {
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
    const betaModels = processedModels.filter(model => model.isBeta);
    const standardModels = processedModels.filter(model => !model.isBeta);
    const visibleModels = modelSettings
        .filter(setting => !setting.hidden)
        .sort((a, b) => a.order - b.order)
        .map(setting => processedModels.find(model => model.id === setting.id))
        .filter(Boolean);
    const currentModel = processedModels.find(model => model.id === currentModelId) || processedModels[0];

    return { betaModels, currentModel, processedModels, standardModels, visibleModels };
}

export function createModelSwitcherLifecycle({
    closeAllPopovers,
    document,
    escapeHTML,
    getActiveConversation,
    getConfig,
    getCouncilModeLabel,
    getCouncilSelectedModels,
    getCouncilTexts,
    getI18n,
    getModelApiId,
    getModelSwitcherContainer = () => undefined,
    getModelRetirementLabel,
    getModelTiers,
    getSingleDocumentTranslatorModel,
    isCouncilEnabled,
    modelSupportsDocumentUpload,
    modelSupportsVision,
    modelSupportsWebSearch,
    models,
    renderAll,
    renderCouncilControls,
    requestFrame,
    saveAppData,
    saveConfig,
    window
}) {
    const MODELS = models;
    const requestAnimationFrame = requestFrame;
    const renderModelSwitcher = () => {
    const modelSwitcherContainer = getModelSwitcherContainer();
    const conv = getActiveConversation();
    const config = getConfig();
    const i18n = getI18n();
    modelSwitcherContainer.innerHTML = '';
    if (!conv) return;


    const {
        betaModels,
        currentModel,
        processedModels,
        standardModels,
        visibleModels
    } = prepareModelSwitcherModels({
        currentModelId: conv.model,
        getModelApiId,
        getModelTiers,
        modelSettings: config.modelSettings,
        models: MODELS
    });
    const isArchived = conv.archived;
    const translations = i18n[config.uiLanguage] || i18n['zh-TW'];

    if (isCouncilEnabled(conv)) {
        const { council } = getCouncilSelectedModels(conv);
        const texts = getCouncilTexts();
        const councilModeLabel = getCouncilModeLabel(council);
        modelSwitcherContainer.innerHTML = `
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
            <div class="model-switcher-search">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                <input id="model-search-input" type="search" autocomplete="off" placeholder="${escapeHTML(translations.searchModels || (config.uiLanguage === 'zh-TW' ? '搜尋模型' : 'Search models'))}">
                <button id="model-search-clear-btn" class="model-search-clear-btn hidden" type="button" aria-label="${escapeHTML(translations.clearSearch || 'Clear search')}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                </button>
            </div>
            <div id="model-views-container" style="width: 500%; display: flex; transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1); align-items: flex-start;">
                <div id="provider-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
                <div id="tier-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
                <div id="company-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
                <div id="category-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
                <div id="model-list-view" class="model-view" style="width: 20%; flex-shrink: 0; padding-top: 0.5rem; padding-bottom: 0.5rem;"></div>
            </div>
        </div>
    `;
    modelSwitcherContainer.innerHTML = popoverHTML;


    const popover = document.getElementById('model-options-popover');
    const viewsContainer = document.getElementById('model-views-container');
    const providerView = document.getElementById('provider-view');
    const tierView = document.getElementById('tier-view');
    const companyView = document.getElementById('company-view');
    const categoryView = document.getElementById('category-view');
    const modelListView = document.getElementById('model-list-view');
    const modelSearchInput = document.getElementById('model-search-input');
    const modelSearchClearBtn = document.getElementById('model-search-clear-btn');


    // ✨✨✨ 核心修正 1：修改 adjustPopoverHeight 函式 ✨✨✨
    const adjustPopoverHeight = (targetView) => {
        requestAnimationFrame(() => {
            // 從 CSS 中讀取我們設定的最大高度，例如 "calc(100vh - 150px)"
            const maxHeightStyle = window.getComputedStyle(popover).maxHeight;
            
            // 將 CSS 值轉換成數字（像素）
            // 這裡做一個簡化處理，直接用 vh 計算，在大多數情況下是準確的
            const maxHeightInPixels = window.innerHeight - 150; 
            
            // 取得當前內容實際需要的高度
            const searchHeight = popover.querySelector('.model-switcher-search')?.offsetHeight || 0;
            const contentHeight = targetView.scrollHeight + searchHeight;
            
            // 比較「需要的高度」和「允許的最大高度」，取較小者
            const newHeight = Math.min(contentHeight, maxHeightInPixels);


            // 只設定最外層彈窗的高度，內部容器會自動適應
            popover.style.height = `${newHeight}px`;
            viewsContainer.style.height = `${Math.max(0, newHeight - searchHeight)}px`;
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

    const searchableModels = [...visibleModels, ...betaModels.filter(model => !visibleModels.some(visibleModel => visibleModel.id === model.id))];
    const renderSearchResults = (query) => {
        const normalizedQuery = query.trim().toLowerCase();
        modelSearchClearBtn?.classList.toggle('hidden', normalizedQuery.length === 0);
        if (!normalizedQuery) {
            navigateToView(0);
            return;
        }

        const matchedModels = searchableModels.filter(model => {
            const descriptionText = translations[model.descriptionKey] || '';
            return [
                model.name,
                model.provider,
                model.company,
                ...(model.tier || []),
                model.category || '',
                descriptionText
            ].join(' ').toLowerCase().includes(normalizedQuery);
        });

        modelListView.innerHTML = `<div class="model-search-results-title">${escapeHTML(translations.searchResults || (config.uiLanguage === 'zh-TW' ? '搜尋結果' : 'Search results'))}</div>`;
        modelListView.innerHTML += matchedModels.length
            ? matchedModels.map(model => {
                const descriptionText = translations[model.descriptionKey] || '';
                return createModelOptionHTML(model, descriptionText);
            }).join('')
            : `<p class="model-search-empty">${escapeHTML(translations.noModelsFound || (config.uiLanguage === 'zh-TW' ? '找不到符合的模型' : 'No matching models'))}</p>`;
        modelListView.classList.remove('model-search-results-enter');
        void modelListView.offsetWidth;
        modelListView.classList.add('model-search-results-enter');
        navigateToView(4);
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
                                        const categorySuffix = cat
                                            .split('_')
                                            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                                            .join('');
                                        const categoryNameKey = `category${categorySuffix}`;
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
            if (newModelInfo.outputModality === 'image' && conv.council) {
                conv.council.enabled = false;
            }
            config.lastUsedModel = newModelId;
            await saveAppData();
            await saveConfig();
            renderAll();
        }
        popover.classList.remove('visible');
    });

    modelSearchInput?.addEventListener('input', () => {
        renderSearchResults(modelSearchInput.value);
    });

    modelSearchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modelSearchInput.value) {
            modelSearchInput.value = '';
            renderSearchResults('');
            event.stopPropagation();
        }
    });

    modelSearchClearBtn?.addEventListener('click', () => {
        modelSearchInput.value = '';
        renderSearchResults('');
        modelSearchInput.focus();
    });


    document.getElementById('current-model-btn').addEventListener('click', () => {
        const isVisible = popover.classList.toggle('visible');
        if (isVisible) {
            if (modelSearchInput) modelSearchInput.value = '';
            modelSearchClearBtn?.classList.add('hidden');
            navigateToView(0);
        } else {
            // ✨✨✨ 核心修正 2：關閉時，同時重置內外兩個容器的高度 ✨✨✨
            popover.style.height = ''; 
            viewsContainer.style.height = '';
        }
    });
};

    return { renderModelSwitcher };
}
