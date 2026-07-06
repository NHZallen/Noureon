import { buildTimeDistributionChartData } from '../../legacy-runtime/features/time-distribution-chart-data.js';
import { buildConversationMobileContextMenuMarkup, buildFolderMobileContextMenuMarkup, buildAstraMobileContextMenuMarkup } from '../../legacy-runtime/features/mobile-context-menu-markup.js';
import { compareVersions } from '../../legacy-runtime/features/version-compare.js';
import { createLegacyTrashLifecycle } from '../features/trash-lifecycle.js';
import { createThemeAppearanceLifecycle } from '../features/theme-appearance-lifecycle.js';
import { createLegacyRuntimeEntryDependencies } from '../runtime-entry-dependencies.js';

const REQUIRED_DEPENDENCIES = [
    'window',
    'document',
    'elements',
    'state',
    'runtimeConfigAccess',
    'runtimeAppDataStore',
    'runtimeDialogCoordinator',
    'legacyRuntimeContext',
    'getCurrentConversationId',
    'setCurrentConversationId',
    'i18n'
];

const validateDependencies = (dependencies) => {
    if (!dependencies || typeof dependencies !== 'object') {
        throw new TypeError('Legacy core tail lifecycle dependencies must be an object.');
    }
    const missing = REQUIRED_DEPENDENCIES.filter((name) => dependencies[name] == null);
    if (missing.length > 0) {
        throw new TypeError(`Legacy core tail lifecycle is missing dependencies: ${missing.join(', ')}.`);
    }
};

export function createLegacyCoreTailLifecycle(dependencies = {}) {
    validateDependencies(dependencies);
    const {
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
        globalObject,
        getComputedStyle,
        random,
        elements: ALL_ELEMENTS,
        state,
        runtimeConfigAccess,
        runtimeAppDataStore,
        runtimeDialogCoordinator,
        legacyRuntimeContext,
        getCurrentConversationId,
        setCurrentConversationId,
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
        deleteConversationsFromCloud,
        deleteAstrasFromCloud = async () => {},
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
    } = dependencies;

        const setupTimeAnalysis = () => {
            const { timeAnalysisYearSelect, timeAnalysisMonthSelect, timeAnalysisDaySelect } = ALL_ELEMENTS;
            const allMessages = state.conversations.flatMap(c => c.messages.map(m => new Date(m.createdAt)));
            const years = [...new Set(allMessages.map(d => d.getFullYear()))].sort((a,b) => b-a);
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            timeAnalysisYearSelect.innerHTML = `<option value="">${i18n[uiLanguage].all || '全部'}</option>`;
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                timeAnalysisYearSelect.appendChild(option);
            });
            timeAnalysisYearSelect.addEventListener('change', () => {
                const year = timeAnalysisYearSelect.value;
                if (year) {
                    const uiLanguage = runtimeConfigAccess.getUiLanguage();
                    timeAnalysisMonthSelect.disabled = false;
                    timeAnalysisMonthSelect.innerHTML = `<option value="">${i18n[uiLanguage].wholeYear || '全年'}</option>`;
                     for(let i=1; i<=12; i++) {
                        const option = document.createElement('option');
                        option.value = i;
                        option.textContent = `${i}${i18n[uiLanguage].monthSuffix || '月'}`;
                        timeAnalysisMonthSelect.appendChild(option);
                    }
                } else {
                    timeAnalysisMonthSelect.disabled = true;
                    timeAnalysisMonthSelect.innerHTML = '';
                }
                timeAnalysisDaySelect.disabled = true;
                timeAnalysisDaySelect.innerHTML = '';
                updateTimeDistributionChart();
            });
            timeAnalysisMonthSelect.addEventListener('change', () => {
                const year = parseInt(timeAnalysisYearSelect.value);
                const month = parseInt(timeAnalysisMonthSelect.value);
                 if (year && month) {
                    const uiLanguage = runtimeConfigAccess.getUiLanguage();
                    timeAnalysisDaySelect.disabled = false;
                    const daysInMonth = new Date(year, month, 0).getDate();
                    timeAnalysisDaySelect.innerHTML = `<option value="">${i18n[uiLanguage].wholeMonth || '全月'}</option>`;
                    for (let i = 1; i <= daysInMonth; i++) {
                        const option = document.createElement('option');
                        option.value = i;
                        option.textContent = `${i}${i18n[uiLanguage].daySuffix || '日'}`;
                        timeAnalysisDaySelect.appendChild(option);
                    }
                } else {
                    timeAnalysisDaySelect.disabled = true;
                    timeAnalysisDaySelect.innerHTML = '';
                }
                updateTimeDistributionChart();
            });
            timeAnalysisDaySelect.addEventListener('change', updateTimeDistributionChart);
            updateTimeDistributionChart();
        };
        const updateTimeDistributionChart = () => {
            const year = ALL_ELEMENTS.timeAnalysisYearSelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisYearSelect.value) : null;
            const month = ALL_ELEMENTS.timeAnalysisMonthSelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisMonthSelect.value) : null;
            const day = ALL_ELEMENTS.timeAnalysisDaySelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisDaySelect.value) : null;
            const allMessages = state.conversations.flatMap(c => c.messages);
            const lang = runtimeConfigAccess.getUiLanguage();
            const { chartType, label, labels, data } = buildTimeDistributionChartData({ messages: allMessages, year, month, day, text: i18n[lang] });
            const ctx = document.getElementById('time-distribution-chart').getContext('2d');
            if (state.timeDistChart) {
                state.timeDistChart.destroy();
            }
            state.timeDistChart = new Chart(ctx, {
                type: chartType,
                data: {
                    labels: labels,
                    datasets: [{
                        label: label,
                        data: data,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        };
        const themeAppearanceLifecycle = createThemeAppearanceLifecycle({
            window,
            document,
            Image,
            FileReader,
            Cropper,
            elements: ALL_ELEMENTS,
            state,
            i18n,
            UI_THEME_COLORS,
            setTheme,
            updateThemeButtons,
            setAiBubbleColor,
            setUserBubbleColor,
            saveConfig,
            showNotification,
            toggleModal,
            logger: console
        });
        const getDominantColorPalette = (...args) => themeAppearanceLifecycle.getDominantColorPalette(...args);
        const applyUiTheme = (...args) => themeAppearanceLifecycle.applyUiTheme(...args);
        const renderUiColorOptions = (...args) => themeAppearanceLifecycle.renderUiColorOptions(...args);
        const analyzeImageBrightness = (...args) => themeAppearanceLifecycle.analyzeImageBrightness(...args);
        const applyCustomWallpaper = (...args) => themeAppearanceLifecycle.applyCustomWallpaper(...args);
        const handleWallpaperUpload = (...args) => themeAppearanceLifecycle.handleWallpaperUpload(...args);
        const handleConfirmCrop = (...args) => themeAppearanceLifecycle.handleConfirmCrop(...args);
        const restoreDefaultWallpaper = (...args) => themeAppearanceLifecycle.restoreDefaultWallpaper(...args);
        const openStore = () => {
            ALL_ELEMENTS.appContainer.classList.remove('visible');
            ALL_ELEMENTS.storeContainer.classList.remove('hidden');
            requestAnimationFrame(() => {
                ALL_ELEMENTS.storeContainer.classList.add('visible');
            });
            ALL_ELEMENTS.appContainer.addEventListener('transitionend', () => {
                ALL_ELEMENTS.appContainer.classList.add('hidden');
            }, { once: true });
            state.currentStoreCategory = 'all';
    const mainContent = document.querySelector('#store-main-content');
    if (mainContent) {
        mainContent.scrollTop = 0;
    }
            renderStore();
        };
        const closeStore = () => {
            ALL_ELEMENTS.storeContainer.classList.remove('visible');
            ALL_ELEMENTS.appContainer.classList.remove('hidden');
            requestAnimationFrame(() => {
                ALL_ELEMENTS.appContainer.classList.add('visible');
            });
            ALL_ELEMENTS.storeContainer.addEventListener('transitionend', () => {
                ALL_ELEMENTS.storeContainer.classList.add('hidden');
            }, { once: true });
        };
        const renderStore = () => {
            const mainContent = document.querySelector('#store-main-content');
    if (mainContent) {
        mainContent.scrollTop = 0;
    }
    const grid = ALL_ELEMENTS.storeGrid;
    const categoryList = document.getElementById('store-category-list');
    grid.innerHTML = '';
    categoryList.innerHTML = '';
    const translations = i18n[state.config.uiLanguage] || i18n['zh-TW'];
    const translatedOfficialAstras = OFFICIAL_ASTRAS.map(ast => ({
        ...ast,
        name: translations['astras_' + ast.id.replace(/-/g, '_') + '_name'] || ast.name,
        description: translations['astras_' + ast.id.replace(/-/g, '_') + '_desc'] || ast.description
    }));
    const userCreatedAstras = state.astras.filter(a => !a.officialId);
    const categoryTranslationKeys = {
        '生產力': 'astrasCategoryProductivity',
        '規劃': 'astrasCategoryPlanning',
        '語言學習': 'astrasCategoryLanguageLearning',
        '心理健康': 'astrasCategoryMentalHealth',
        '遊戲': 'astrasCategoryGames'
    };
    const getCategoryLabel = (category) => {
        if (category === 'all') return translations.all || 'All';
        const translationKey = categoryTranslationKeys[category];
        return translationKey ? (translations[translationKey] || category) : category;
    };
    const allCategories = ['all', ...new Set([
        ...translatedOfficialAstras.map(a => a.category),
        ...userCreatedAstras.map(a => a.category)
    ].filter(Boolean))];
    allCategories.forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'store-category-btn';
        btn.textContent = getCategoryLabel(category);
        if (category === state.currentStoreCategory) {
            btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
            state.currentStoreCategory = category;
            renderStore();
        });
        categoryList.appendChild(btn);
    });
    const allStoreAstras = [...translatedOfficialAstras, ...userCreatedAstras];
    const filteredAstras = state.currentStoreCategory === 'all'
        ? allStoreAstras
        : allStoreAstras.filter(a => a.category === state.currentStoreCategory);
    filteredAstras.forEach(ast => {
        const card = document.createElement('div');
        card.className = 'astras-store-card';
        const originalId = ast.officialId || ast.id;
        const isSubscribed = state.astras.some(userAstra => userAstra.officialId === originalId);
        const isUserCreated = !ast.officialId && state.astras.some(userAstra => userAstra.id === originalId);
        const avatarUrl = ast.avatarUrl;
        const initials = escapeHTML(ast.name.charAt(0));
        const avatarElement = `<div class="astras-card-avatar">${avatarUrl ? `<img src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(ast.name)}">` : initials}</div>`;
        card.innerHTML = `
            ${avatarElement}
            <h3 class="astras-card-name">${escapeHTML(ast.name)}</h3>
            <p class="astras-card-desc">${escapeHTML(ast.description)}</p>
            <button class="subscribe-btn btn-primary" data-id="${escapeHTML(originalId)}"></button>
        `;
        const btn = card.querySelector('.subscribe-btn');
        if (isSubscribed) {
            btn.textContent = translations.unsubscribe || '取消訂閱';
            btn.classList.add('subscribed');
        } else if (isUserCreated) {
            btn.textContent = translations.manage || '管理';
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            btn.textContent = translations.subscribe || '訂閱';
        }
        btn.addEventListener('click', async () => {
            await handleSubscription(originalId);
        });
        grid.appendChild(card);
    });
};
        const handleSubscription = async (officialId) => {
            const isSubscribed = state.astras.some(a => a.officialId === officialId);
            if (isSubscribed) {
                const subscribedAstras = state.astras.filter(a => a.officialId === officialId);
                try {
                    await deleteAstrasFromCloud(
                        subscribedAstras.map(astra => astra.id),
                        { astras: subscribedAstras }
                    );
                } catch (error) {
                    try { console.warn('AstraChat cloud Astra unsubscribe failed; keeping the local Astra.', error); } catch {}
                    showNotification(i18n[state.config.uiLanguage].cloudDeleteFailed || '雲端刪除失敗，請稍後再試。', 'error');
                    return;
                }
                state.astras = runtimeAppDataStore.replaceAstras(
                    state.astras.filter(a => a.officialId !== officialId)
                );
                showNotification(i18n[state.config.uiLanguage].unsubscribed || '已取消訂閱', 'success');
            } else {
                const officialAstra = OFFICIAL_ASTRAS.find(a => a.id === officialId);
                if (officialAstra) {
                    const newAstra = {
                        ...officialAstra,
                        id: crypto.randomUUID(),
                        officialId: officialAstra.id,
                    };
                    state.astras.unshift(newAstra);
                    showNotification(i18n[state.config.uiLanguage].subscribed || '訂閱成功！', 'success');
                }
            }
            await saveAppData();
            renderStore();
            renderAstras();
        };
        const openAvatarEditor = (astrasId) => {
            state.editingAstraForAvatarId = astrasId;
            ALL_ELEMENTS.astrasAvatarInput.click();
        };
        const handleAvatarUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageUrl = e.target.result;
                ALL_ELEMENTS.avatarCropImage.src = imageUrl;
                toggleModal(ALL_ELEMENTS.astrasAvatarModal, true);
                if (state.cropperInstance) {
                    state.cropperInstance.destroy();
                }
                state.cropperInstance = new Cropper(ALL_ELEMENTS.avatarCropImage, {
                    aspectRatio: 1,
                    viewMode: 1,
                    background: false,
                    autoCropArea: 1,
                });
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        };
        const handleConfirmAvatarCrop = async () => {
            if (!state.cropperInstance || !state.editingAstraForAvatarId) return;
            const canvas = state.cropperInstance.getCroppedCanvas({
                width: 128,
                height: 128,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
            });
            const imageDataUrl = canvas.toDataURL('image/png');
            const astra = state.astras.find(a => a.id === state.editingAstraForAvatarId);
            if (astra) {
                astra.avatarUrl = imageDataUrl;
                await saveAppData();
                renderAstras();
                showNotification(i18n[state.config.uiLanguage].avatarUpdated || '頭像已更新', 'success');
            }
            toggleModal(ALL_ELEMENTS.astrasAvatarModal, false);
            state.editingAstraForAvatarId = null;
        };
        const applyLanguage = (lang) => {
            const translations = i18n[lang] || i18n['zh-TW'];
            document.querySelectorAll('[data-lang-key]').forEach(el => {
                const key = el.dataset.langKey;
                if (translations[key]) {
                    el.textContent = translations[key];
                }
            });
            document.querySelectorAll('[data-lang-key-placeholder]').forEach(el => {
                const key = el.dataset.langKeyPlaceholder;
                if (translations[key]) {
                    el.placeholder = translations[key];
                }
            });
            document.querySelectorAll('[data-lang-key-title]').forEach(el => {
                const key = el.dataset.langKeyTitle;
                if (translations[key]) {
                    el.title = translations[key];
                }
            });
            const replyLanguageLabels = {
                'zh-TW': translations.languageNameZhTW || 'Traditional Chinese',
                en: translations.languageNameEn || 'English',
                fr: translations.languageNameFr || 'French'
            };
            ALL_ELEMENTS.aiLanguageSelect?.querySelectorAll('option').forEach(option => {
                if (replyLanguageLabels[option.value]) {
                    option.textContent = replyLanguageLabels[option.value];
                }
            });
            document.querySelectorAll('#settings-nav .settings-nav-item[data-section]').forEach(item => {
                const section = document.getElementById(`${item.dataset.section}-section`);
                const sectionTitleKey = item.dataset.langKey;
                if (section && translations[sectionTitleKey]) {
                    section.dataset.sectionTitle = translations[sectionTitleKey];
                }
            });
            const mobileSettingsTitle = document.getElementById('settings-mobile-title');
            const activeSettingsItem = document.querySelector('#settings-nav .settings-nav-item.active');
            if (mobileSettingsTitle && activeSettingsItem) {
                const activeTitleKey = activeSettingsItem.dataset.langKey;
                mobileSettingsTitle.textContent = translations[activeTitleKey] || translations.settings || 'Settings';
            }
            if(ALL_ELEMENTS.loginLangLabel) {
                ALL_ELEMENTS.loginLangLabel.textContent = translations.currentLanguageName || '繁體中文';
            }
            legacyRuntimeContext.resolveBinding('input.updateInputState')();
            document.documentElement.lang = lang;
        };
        const showMobileContextMenu = (convId) => {
            const oldMenu = document.getElementById('mobile-context-menu-wrapper');
            if (oldMenu) oldMenu.remove();
            const conv = state.conversations.find(c => c.id === convId);
            if (!conv) return;
            const menuWrapper = document.createElement('div');
            menuWrapper.id = 'mobile-context-menu-wrapper';
            const overlay = document.createElement('div');
            overlay.id = 'mobile-context-menu-overlay';
            const menu = document.createElement('div');
            menu.id = 'mobile-context-menu';
            menu.innerHTML = buildConversationMobileContextMenuMarkup({
                title: conv.title,
                folderId: conv.folderId,
                pinned: conv.pinned,
                text: i18n[state.config.uiLanguage]
            });
            menuWrapper.appendChild(overlay);
            menuWrapper.appendChild(menu);
            document.body.appendChild(menuWrapper);
            requestAnimationFrame(() => {
                overlay.classList.add('visible');
                menu.classList.add('visible');
            });
            const closeMenu = () => {
                overlay.classList.remove('visible');
                menu.classList.remove('visible');
                menu.addEventListener('transitionend', () => menuWrapper.remove(), { once: true });
            };
            overlay.addEventListener('click', closeMenu);
            let touchStartY = 0;
            let touchMoveY = 0;
            menu.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            }, { passive: true });
            menu.addEventListener('touchmove', (e) => {
                touchMoveY = e.touches[0].clientY;
                const deltaY = touchMoveY - touchStartY;
                if (deltaY > 0) {
                    menu.style.transform = `translateY(${deltaY}px)`;
                }
            }, { passive: true });
            menu.addEventListener('touchend', () => {
                const deltaY = touchMoveY - touchStartY;
                if (deltaY > 100) {
                    closeMenu();
                } else {
                    menu.style.transform = '';
                }
                touchStartY = 0;
                touchMoveY = 0;
            });
            menu.addEventListener('click', (e) => {
                const actionTarget = e.target.closest('.menu-item');
                if (!actionTarget) return;
                const action = actionTarget.dataset.action;
                closeMenu();
                setTimeout(() => {
                    switch(action) {
                        case 'rename':
                            showRenameModal(convId, 'conversation', e);
                            break;
                        case 'pin':
                            togglePinChat(convId, e);
                            break;
                        case 'archive':
                            archiveChat(convId, e);
                            break;
                        case 'delete':
                            deleteChat(convId, e);
                            break;
                        case 'move-out':
                            moveConversationToFolder(convId, null);
                            break;
                        case 'move-to':
                            renderBatchMoveModal(convId);
                            toggleModal(ALL_ELEMENTS.batchMoveModal, true);
                            break;
                    }
                }, 300);
            });
        };
        const showMobileContextMenuForFolder = (folderId) => {
            const oldMenu = document.getElementById('mobile-context-menu-wrapper');
            if (oldMenu) oldMenu.remove();
            const folder = state.folders.find(f => f.id === folderId);
            if (!folder) return;
            const menuWrapper = document.createElement('div');
            menuWrapper.id = 'mobile-context-menu-wrapper';
            const overlay = document.createElement('div');
            overlay.id = 'mobile-context-menu-overlay';
            const menu = document.createElement('div');
            menu.id = 'mobile-context-menu';
            menu.innerHTML = buildFolderMobileContextMenuMarkup({
                name: folder.name,
                text: i18n[state.config.uiLanguage]
            });
            menuWrapper.appendChild(overlay);
            menuWrapper.appendChild(menu);
            document.body.appendChild(menuWrapper);
            requestAnimationFrame(() => {
                overlay.classList.add('visible');
                menu.classList.add('visible');
            });
            const closeMenu = () => {
                overlay.classList.remove('visible');
                menu.classList.remove('visible');
                menu.addEventListener('transitionend', () => menuWrapper.remove(), { once: true });
            };
            overlay.addEventListener('click', closeMenu);
            let touchStartY = 0;
            let touchMoveY = 0;
            menu.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            }, { passive: true });
            menu.addEventListener('touchmove', (e) => {
                touchMoveY = e.touches[0].clientY;
                const deltaY = touchMoveY - touchStartY;
                if (deltaY > 0) {
                    menu.style.transform = `translateY(${deltaY}px)`;
                }
            }, { passive: true });
            menu.addEventListener('touchend', () => {
                const deltaY = touchMoveY - touchStartY;
                if (deltaY > 100) {
                    closeMenu();
                } else {
                    menu.style.transform = '';
                }
                touchStartY = 0;
                touchMoveY = 0;
            });
            menu.addEventListener('click', (e) => {
                const actionTarget = e.target.closest('.menu-item');
                if (!actionTarget) return;
                const action = actionTarget.dataset.action;
                closeMenu();
                setTimeout(() => {
                    switch(action) {
                        case 'rename-folder':
                            showRenameModal(folderId, 'folder', e);
                            break;
                        case 'customize-folder':
                            showFolderSettingsModal(folderId, e);
                            break;
                        case 'delete-folder':
                            deleteFolder(folderId, e);
                            break;
                    }
                }, 300);
            });
        };
        const showMobileContextMenuForAstras = (astrasId) => {
            const oldMenu = document.getElementById('mobile-context-menu-wrapper');
            if (oldMenu) oldMenu.remove();
            const astra = state.astras.find(a => a.id === astrasId);
            if (!astra) return;
            const menuWrapper = document.createElement('div');
            menuWrapper.id = 'mobile-context-menu-wrapper';
            const overlay = document.createElement('div');
            overlay.id = 'mobile-context-menu-overlay';
            const menu = document.createElement('div');
            menu.id = 'mobile-context-menu';
            menu.innerHTML = buildAstraMobileContextMenuMarkup({
                name: astra.name,
                officialId: astra.officialId,
                text: i18n[state.config.uiLanguage]
            });
            menuWrapper.appendChild(overlay);
            menuWrapper.appendChild(menu);
            document.body.appendChild(menuWrapper);
            requestAnimationFrame(() => {
                overlay.classList.add('visible');
                menu.classList.add('visible');
            });
            const closeMenu = () => {
                overlay.classList.remove('visible');
                menu.classList.remove('visible');
                menu.addEventListener('transitionend', () => menuWrapper.remove(), { once: true });
            };
            overlay.addEventListener('click', closeMenu);
            let touchStartY = 0;
            let touchMoveY = 0;
            menu.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
            menu.addEventListener('touchmove', (e) => {
                touchMoveY = e.touches[0].clientY;
                const deltaY = touchMoveY - touchStartY;
                if (deltaY > 0) { menu.style.transform = `translateY(${deltaY}px)`; }
            }, { passive: true });
            menu.addEventListener('touchend', () => {
                const deltaY = touchMoveY - touchStartY;
                if (deltaY > 100) { closeMenu(); }
                else { menu.style.transform = ''; }
                touchStartY = 0; touchMoveY = 0;
            });
            menu.addEventListener('click', (e) => {
                const actionTarget = e.target.closest('.menu-item');
                if (!actionTarget) return;
                const action = actionTarget.dataset.action;
                closeMenu();
                setTimeout(() => {
                    switch(action) {
                        case 'edit-astras':
                            state.editingAstrasId = astrasId;
                            ALL_ELEMENTS.astrasNameInput.value = astra.name;
                            ALL_ELEMENTS.astrasDescInput.value = astra.description;
                            ALL_ELEMENTS.astrasInstructionsInput.value = astra.instructions;
                            ALL_ELEMENTS.astrasCreateModal.querySelector('h2').textContent = i18n[state.config.uiLanguage].editAstras || '編輯 Astras';
                            toggleModal(ALL_ELEMENTS.astrasCreateModal, true);
                            break;
                        case 'edit-avatar':
                            openAvatarEditor(astrasId);
                            break;
                        case 'delete-astras':
                            deleteAstras(astrasId);
                            break;
                    }
                }, 300);
            });
        };
        const setupScrollToBottomButton = () => {
    const { scrollToBottomBtn, chatContainer } = ALL_ELEMENTS;
    const updateScrollButtonVisibility = () => {
        const bottomDistance = Math.max(0, chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight);
        scrollToBottomBtn.classList.toggle('visible', bottomDistance > 8);
    };
    let scrollButtonFrame = null;
    const scheduleScrollButtonUpdate = () => {
        if (state.isAutoScrolling || scrollButtonFrame !== null) return;
        scrollButtonFrame = requestAnimationFrame(() => {
            scrollButtonFrame = null;
            updateScrollButtonVisibility();
        });
    };
    scrollToBottomBtn.addEventListener('click', () => {
        state.isAutoScrolling = true;
        scrollToBottomBtn.classList.remove('visible');
        scrollToBottomBtn.classList.add('jelly-animate');
        scrollToBottomBtn.addEventListener('animationend', () => {
            scrollToBottomBtn.classList.remove('jelly-animate');
        }, { once: true });
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
        const scrollEndTimer = setTimeout(() => {
            state.isAutoScrolling = false;
            updateScrollButtonVisibility();
        }, 1000);
        const interruptHandler = () => {
            clearTimeout(scrollEndTimer);
            state.isAutoScrolling = false;
            scheduleScrollButtonUpdate();
            chatContainer.removeEventListener('wheel', interruptHandler);
            chatContainer.removeEventListener('touchstart', interruptHandler);
        };
        chatContainer.addEventListener('wheel', interruptHandler, { once: true });
        chatContainer.addEventListener('touchstart', interruptHandler, { once: true });
    });
    chatContainer.addEventListener('scroll', scheduleScrollButtonUpdate, { passive: true });
    chatContainer.addEventListener('wheel', scheduleScrollButtonUpdate, { passive: true });
    chatContainer.addEventListener('touchend', scheduleScrollButtonUpdate, { passive: true });
    updateScrollButtonVisibility();


    // ✨ 這是核心修正 ✨
    const updateButtonPosition = () => {
        const { inputBarContainer, scrollToBottomBtn } = ALL_ELEMENTS;
        const inputBarHeight = inputBarContainer.offsetHeight;
        const totalBottomOffset = inputBarHeight + 16; // 簡化計算
        scrollToBottomBtn.style.bottom = `${totalBottomOffset}px`;
    };


    const resizeObserver = new ResizeObserver(updateButtonPosition);
    resizeObserver.observe(ALL_ELEMENTS.inputBarContainer);
    updateButtonPosition();
};
        const showUpdateHistory = () => {
            const container = ALL_ELEMENTS.updateInfoContent;
            container.innerHTML = '';
            if (typeof updateLogs !== 'undefined' && updateLogs.length > 0) {
                updateLogs.forEach(log => {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'prose prose-sm max-w-none';
                    logEntry.innerHTML = `
                        <h3 class="font-bold text-lg">${escapeHTML(log.version)} <span class="text-sm font-normal text-[var(--text-secondary)]">- ${escapeHTML(log.date)}</span></h3>
                        <ul>
                            ${log.content.map(item => `<li>${sanitizeTrustedHTML(item)}</li>`).join('')}
                        </ul>
                    `;
                    container.appendChild(logEntry);
                });
            } else {
                container.innerHTML = `<p>${i18n[state.config.uiLanguage].noUpdateHistory || '目前沒有更新紀錄。'}</p>`;
            }
            toggleModal(ALL_ELEMENTS.updateInfoModal, true);
        };
        const checkAndShowLatestUpdate = async () => {
    if (!state.config.enableUpdateNotifications || typeof updateLogs === 'undefined' || updateLogs.length === 0) {
        return;
    }
    const lastSeenVersion = state.config.lastSeenVersion || '0.0.0'; // 如果從未見過，則設為 '0.0.0'
    const newUpdates = updateLogs.filter(log => compareVersions(log.version, lastSeenVersion) > 0);
    if (newUpdates.length > 0) {
        newUpdates.sort((a, b) => compareVersions(b.version, a.version));
        const contentContainer = ALL_ELEMENTS.latestUpdateContent;
        const modalTitle = document.querySelector('#latest-update-modal h2');
        if (modalTitle) {
            modalTitle.textContent = i18n[state.config.uiLanguage].newVersionsFound.replace('{count}', newUpdates.length);
        }
        contentContainer.innerHTML = newUpdates.map(log => `
            <div class="prose prose-sm max-w-none mb-6 pb-4 border-b border-[var(--border-color)] last:border-b-0 last:mb-0 last:pb-0">
                <h4 class="font-bold text-lg">${escapeHTML(log.version)} <span class="text-sm font-normal text-[var(--text-secondary)]">- ${escapeHTML(log.date)}</span></h4>
                <ul>
                    ${log.content.map(item => `<li>${sanitizeTrustedHTML(item)}</li>`).join('')}
                </ul>
            </div>
        `).join('');
        contentContainer.style.maxHeight = '60vh';
        contentContainer.style.overflowY = 'auto';
        toggleModal(ALL_ELEMENTS.latestUpdateModal, true);
        const latestVersionInLog = newUpdates[0].version; // 因為我們已經排序了，所以 newUpdates[0] 現在是最新版
        state.config.lastSeenVersion = latestVersionInLog;
        await saveConfig();
    }
};
        /**
 * @description 設定 Intersection Observer 來監聽聊天視窗中的訊息，並高亮右側對應的目錄項目
 */
function setupMessageIntersectionObserver() {
    // 如果之前有觀察者，先斷開連接，避免重複觀察
    if (state.messageObserver) {
        state.messageObserver.disconnect();
    }


    const messageItems = ALL_ELEMENTS.messageList.querySelectorAll('.message-item');
    const historyItems = ALL_ELEMENTS.historySidebarList.querySelectorAll('.history-sidebar-item');


    // 如果沒有訊息，就不用觀察了
    if (messageItems.length === 0) {
        return;
    }
    
    // 觀察者的回呼函式，當有元素進入或離開視窗時會被觸發
    const observerCallback = (entries) => {
        let mostVisibleEntry = null;


        // 找出所有可見的 entry 中，可見比例最高的那個
        for (const entry of entries) {
            if (entry.isIntersecting) {
                if (!mostVisibleEntry || entry.intersectionRatio > mostVisibleEntry.intersectionRatio) {
                    mostVisibleEntry = entry;
                }
            }
        }


        // 如果找到了最可見的訊息
        if (mostVisibleEntry) {
            const visibleMessageIndex = mostVisibleEntry.target.dataset.messageIndex;


            // 移除所有歷史項目上的 'active' class
            historyItems.forEach(item => {
                item.classList.remove('active');
            });
            
            // 找到對應的歷史項目並加上 'active' class
            const activeHistoryItem = ALL_ELEMENTS.historySidebarList.querySelector(`.history-sidebar-item[data-message-index="${visibleMessageIndex}"]`);
            if (activeHistoryItem) {
                activeHistoryItem.classList.add('active');
            }
        }
    };


    // 建立觀察者實例
    state.messageObserver = new IntersectionObserver(observerCallback, {
        root: ALL_ELEMENTS.chatContainer, // 觀察的根元素是聊天容器
        rootMargin: '0px',
        threshold: [0.0, 0.25, 0.5, 0.75, 1.0] // 在不同可見比例時都觸發回呼
    });
    
    // 開始觀察每一則訊息
    messageItems.forEach(item => {
        state.messageObserver.observe(item);
    });
}
        const {
            renderTrash,
            handleRestoreTrashItem,
            handleDeleteTrashItemPermanently,
            showTrashItemInViewModal,
            toggleTrashSelectionMode,
            renderTrashBatchActionBar,
            handleBatchRestoreFromTrash,
            handleBatchDeleteFromTrash,
            handleEmptyTrash
        } = createLegacyTrashLifecycle({
            document,
            navigator,
            fetch,
            File,
            elements: ALL_ELEMENTS,
            getConversations: () => state.conversations,
            replaceConversations: (nextConversations) => {
                state.conversations = nextConversations;
                return state.conversations;
            },
            saveAppData,
            renderAll,
            getI18n: () => i18n,
            getUiLanguage: () => state.config.uiLanguage,
            showCustomConfirm,
            showNotification,
            showCoordinatedNotification: (...args) => runtimeDialogCoordinator.showNotification(...args),
            deleteConversationsFromCloud,
            toggleModal,
            formatFullTimestamp,
            renderUserText,
            renderModelText: renderMarkdownWithFormulas,
            escapeHTML,
            scheduleTimeout: setTimeout,
            clearScheduledTimeout: clearTimeout,
            createChangeEvent: () => new Event('change')
        });
        const updateDisplayedVersion = () => {
    const versionDisplayElement = document.getElementById('version-number-display');
    if (versionDisplayElement && typeof updateLogs !== 'undefined' && updateLogs.length > 0) {
        const latestVersionInLog = updateLogs.reduce((max, log) => 
            compareVersions(log.version, max) > 0 ? log.version : max, '0.0.0');
        versionDisplayElement.textContent = latestVersionInLog;
    }
};
        const runtimeEntryDependencies = createLegacyRuntimeEntryDependencies({
            appBootstrap: {
                window,
                document,
                elements: ALL_ELEMENTS,
                Peer,
                QRCode,
                Html5Qrcode,
                JSZip,
                BlobCtor: Blob,
                getCurrentUser: () => state.currentUser,
                getConfig: () => state.config,
                getConversations: () => state.conversations,
                getFolders: () => state.folders,
                getAstras: () => state.astras,
                getPersonalMemories: () => state.personalMemories,
                getCurrentConversationId,
                setCurrentConversationId,
                setSidebarOpen: (next) => {
                    state.sidebarOpen = next;
                    return state.sidebarOpen;
                },
                setSendConfirmed: (next) => {
                    state.sendConfirmed = next;
                    return state.sendConfirmed;
                },
                getAbortController: () => state.abortController,
                getCropperInstance: () => state.cropperInstance,
                setCropperInstance: (next) => {
                    state.cropperInstance = next;
                    return state.cropperInstance;
                },
                setEditingAstraForAvatarId: (next) => {
                    state.editingAstraForAvatarId = next;
                    return state.editingAstraForAvatarId;
                },
                startNewChat,
                renderAll,
                setTheme,
                setupVoiceInput,
                setupScrollToBottomButton,
                updateDisplayedVersion,
                checkAndShowLatestUpdate,
                updateFunctionButtonsState,
                updateInputState: (...args) =>
                    legacyRuntimeContext.resolveBinding('input.updateInputState')(...args),
                setupSettingsModal: (...args) =>
                    legacyRuntimeContext.resolveBinding('settings.setupSettingsModal')(...args),
                toggleSidebar,
                toggleModal,
                saveSettings,
                saveAppData,
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
                showNotification,
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
                adjustTextareaHeight: (...args) =>
                    legacyRuntimeContext.resolveBinding('submit.adjustTextareaHeight')(...args),
                submitChatForm,
                closeAllPopovers,
                showCustomPrompt,
                createNewFolder,
                createAstras,
                handleSaveAstras,
                renderPersonalMemoryList,
                handleWallpaperUpload,
                restoreDefaultWallpaper,
                handleConfirmCrop,
                handleDeleteAllData,
                applyLanguage,
                openStore,
                closeStore,
                handleAvatarUpload,
                handleConfirmAvatarCrop,
                showUpdateHistory,
                toggleTrashSelectionMode,
                handleBatchRestoreFromTrash,
                handleBatchDeleteFromTrash,
                handleEmptyTrash,
                updateFileInputUI,
                postJsonWithReadableError,
                openCouncilPopoverFromAttachmentMenu,
                setupHistorySidebarInteractions,
                setupHistorySidebarTriggers,
                escapeHTML,
                getDefaultFolder,
                isMobileSettingsViewport,
                openSettingsMobileSection,
                i18n,
                randomUUID: () => crypto.randomUUID(),
                random,
                scheduleTimeout: setTimeout,
                clearScheduledTimeout: clearTimeout,
                scheduleAnimationFrame: requestAnimationFrame,
                logger: console
            },
            startup: {
                window,
                document,
                globalObject,
                elements: ALL_ELEMENTS,
                getConfig: () => state.config,
                setCurrentUser: (nextUser) => {
                    state.currentUser = nextUser;
                    return state.currentUser;
                },
                getItem,
                getUserKey,
                loadConfig,
                loadAppData,
                applyLanguage,
                applyCustomWallpaper,
                applyUiTheme,
                handleLogin,
                handleImportOnAuth,
                processAuthImport,
                toggleModal,
                installTouchGuards,
                registerServiceWorker,
                showCustomDialog,
                getComputedStyle
            }
        });
        const registerRuntimeEntryDependencies = () => {
            legacyRuntimeContext.registerLazyBinding(
                'runtime.entryDependencies',
                () => runtimeEntryDependencies
            );
            return runtimeEntryDependencies;
        };

        return Object.freeze({
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
            updateDisplayedVersion,
            runtimeEntryDependencies,
            registerRuntimeEntryDependencies
        });
    }
