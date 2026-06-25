import {
    getTextColorForBackground as getThemeTextColorForBackground,
} from '/src/utils/color-contrast.js';
import { createLegacyTrashLifecycle } from '/src/app/runtime/features/trash-lifecycle.js';
import { createLegacyRuntimeEntryDependencies } from '/src/app/runtime/runtime-entry-dependencies.js';

        const setupTimeAnalysis = () => {
            const { timeAnalysisYearSelect, timeAnalysisMonthSelect, timeAnalysisDaySelect } = ALL_ELEMENTS;
            const allMessages = conversations.flatMap(c => c.messages.map(m => new Date(m.createdAt)));
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
            const allMessages = conversations.flatMap(c => c.messages);
            const lang = runtimeConfigAccess.getUiLanguage();
            const { chartType, label, labels, data } = buildTimeDistributionChartData({ messages: allMessages, year, month, day, text: i18n[lang] });
            const ctx = document.getElementById('time-distribution-chart').getContext('2d');
            if (timeDistChart) {
                timeDistChart.destroy();
            }
            timeDistChart = new Chart(ctx, {
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
        const getDominantColorPalette = (imageDataUrl) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.src = imageDataUrl;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    const colorCount = {};
                    for (let i = 0; i < imageData.length; i += 4 * 5) {
                        const r = imageData[i];
                        const g = imageData[i + 1];
                        const b = imageData[i + 2];
                        const a = imageData[i + 3];
                        if (a < 125) continue;
                        const max = Math.max(r, g, b);
                        const min = Math.min(r, g, b);
                        if (max - min < 20) continue;
                        const r_round = Math.round(r / 10) * 10;
                        const g_round = Math.round(g / 10) * 10;
                        const b_round = Math.round(b / 10) * 10;
                        const rgb = `${r_round},${g_round},${b_round}`;
                        colorCount[rgb] = (colorCount[rgb] || 0) + 1;
                    }
                    const sortedColors = Object.keys(colorCount)
                        .sort((a, b) => colorCount[b] - colorCount[a])
                        .slice(0, 5)
                        .map(rgbStr => `#${rgbStr.split(',').map(c => parseInt(c).toString(16).padStart(2, '0')).join('')}`);
                    resolve(sortedColors.length > 0 ? sortedColors : ['#3b82f6']);
                };
                img.onerror = reject;
            });
        };
        const applyUiTheme = () => {
            const root = document.documentElement;
            let primaryBg;
            let primaryBgOverride = null;
            switch(config.uiTheme.mode) {
                case 'adaptive':
                    if (config.uiTheme.style === 'gradient') {
                        primaryBgOverride = config.uiTheme.adaptiveGradient || `linear-gradient(to right, ${config.uiTheme.adaptiveColor}, #3b82f6)`;
                        primaryBg = config.uiTheme.adaptivePalette[0] || config.uiTheme.adaptiveColor;
                    } else {
                        primaryBg = config.uiTheme.adaptiveColor;
                    }
                    break;
                case 'custom':
                    primaryBg = config.uiTheme.customColor;
                    break;
                case 'default':
                default:
                    primaryBg = '#3b82f6';
                    break;
            }
            const textColor = (config.uiTheme.style === 'gradient' && config.uiTheme.mode === 'adaptive')
                ? '#ffffff'
                : getThemeTextColorForBackground(primaryBg);
            root.style.setProperty('--button-primary-bg', primaryBg);
            root.style.setProperty('--button-primary-text', textColor);
            if (primaryBgOverride) {
                root.style.setProperty('--button-primary-bg-override', primaryBgOverride);
            } else {
                root.style.removeProperty('--button-primary-bg-override');
            }
            updateThemeButtons();
        };
        const renderUiColorOptions = () => {
            const { uiColorOptions, customColorPickerContainer, customColorSwatches, buttonStyleContainer, gradientPickerContainer, gradientSwatches } = ALL_ELEMENTS;
            const currentMode = config.uiTheme.mode;
            const currentStyle = config.uiTheme.style;
            uiColorOptions.querySelector(`input[value="${currentMode}"]`).checked = true;
            buttonStyleContainer.querySelector(`input[value="${currentStyle}"]`).checked = true;
            customColorSwatches.innerHTML = '';
            Object.entries(UI_THEME_COLORS).forEach(([name, hex]) => {
                const swatch = document.createElement('div');
                swatch.className = `color-swatch w-8 h-8 rounded-full cursor-pointer`;
                swatch.style.backgroundColor = hex;
                swatch.dataset.color = hex;
                if (config.uiTheme.customColor === hex) {
                    swatch.classList.add('selected');
                }
                swatch.addEventListener('click', () => {
                    customColorSwatches.querySelector('.selected')?.classList.remove('selected');
                    swatch.classList.add('selected');
                });
                customColorSwatches.appendChild(swatch);
            });
            gradientSwatches.innerHTML = '';
            if(config.uiTheme.adaptivePalette && config.uiTheme.adaptivePalette.length > 1) {
                const palette = config.uiTheme.adaptivePalette;
                const combinations = [
                    `linear-gradient(to right, ${palette[0]}, ${palette[1]})`,
                    `linear-gradient(to right, ${palette[0]}, ${palette[2]})`,
                    `linear-gradient(to right, ${palette[1]}, ${palette[2]})`,
                    `linear-gradient(135deg, ${palette[0]}, ${palette[1]}, ${palette[2]})`
                ];
                combinations.forEach(grad => {
                    const swatch = document.createElement('div');
                    swatch.className = 'w-full h-10 rounded-md cursor-pointer border-2 border-transparent';
                    swatch.style.background = grad;
                    swatch.dataset.gradient = grad;
                    if(config.uiTheme.adaptiveGradient === grad) {
                        swatch.classList.add('selected-gradient', 'border-blue-500');
                    }
                    swatch.addEventListener('click', () => {
                        gradientSwatches.querySelector('.selected-gradient')?.classList.remove('selected-gradient', 'border-blue-500');
                        swatch.classList.add('selected-gradient', 'border-blue-500');
                    });
                    gradientSwatches.appendChild(swatch);
                });
            } else {
                 gradientSwatches.innerHTML = `<p class="text-xs col-span-4 text-[var(--text-secondary)]">${i18n[config.uiLanguage].notEnoughColors || '沒有足夠的顏色來生成漸變。請上傳顏色豐富的桌布。'}</p>`
            }
            const updateVisibility = () => {
                const mode = document.querySelector('input[name="color-theme"]:checked').value;
                const style = document.querySelector('input[name="color-style"]:checked').value;
                buttonStyleContainer.classList.toggle('hidden', mode !== 'adaptive');
                customColorPickerContainer.classList.toggle('hidden', mode !== 'custom');
                gradientPickerContainer.classList.toggle('hidden', !(mode === 'adaptive' && style === 'gradient'));
            };
            uiColorOptions.querySelectorAll('input[name="color-theme"]').forEach(radio => {
                radio.addEventListener('change', updateVisibility);
            });
             buttonStyleContainer.querySelectorAll('input[name="color-style"]').forEach(radio => {
                radio.addEventListener('change', updateVisibility);
            });
            updateVisibility();
        };
        const analyzeImageBrightness = (imageDataUrl) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = imageDataUrl;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    let r, g, b, avg;
                    let colorSum = 0;
                    for(let x = 0, len = data.length; x < len; x+=4) {
                        r = data[x];
                        g = data[x+1];
                        b = data[x+2];
                        avg = Math.floor((r+g+b)/3);
                        colorSum += avg;
                    }
                    const brightness = Math.floor(colorSum / (canvas.width * canvas.height));
                    resolve(brightness < 128 ? 'dark' : 'light');
                };
                img.onerror = (err) => reject(err);
            });
        };
        const applyCustomWallpaper = () => {
            if (config.customWallpaper) {
                ALL_ELEMENTS.wallpaperContainer.style.backgroundImage = `url(${config.customWallpaper})`;
                document.body.classList.add('custom-wallpaper-active');
                document.body.classList.toggle('wallpaper-is-dark', config.wallpaperBrightness === 'dark');
                document.documentElement.classList.remove('dark');
            } else {
                ALL_ELEMENTS.wallpaperContainer.style.backgroundImage = 'none';
                document.body.classList.remove('custom-wallpaper-active', 'wallpaper-is-dark');
                setTheme(config.theme);
            }
            setAiBubbleColor();
            setUserBubbleColor();
        };
        const handleWallpaperUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageUrl = e.target.result;
                ALL_ELEMENTS.wallpaperCropImage.src = imageUrl;
                toggleModal(ALL_ELEMENTS.wallpaperCropModal, true);
                if (cropperInstance) {
                    cropperInstance.destroy();
                }
                cropperInstance = new Cropper(ALL_ELEMENTS.wallpaperCropImage, {
                    aspectRatio: window.innerWidth / window.innerHeight,
                    viewMode: 1,
                    background: false,
                    autoCropArea: 1,
                });
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        };
        const handleConfirmCrop = async () => {
            if (!cropperInstance) return;
            const canvas = cropperInstance.getCroppedCanvas({
                maxWidth: 1920,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
            });
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            try {
                const brightness = await analyzeImageBrightness(imageDataUrl);
                const palette = await getDominantColorPalette(imageDataUrl);
                config.customWallpaper = imageDataUrl;
                config.wallpaperBrightness = brightness;
                config.uiTheme.adaptivePalette = palette;
                config.uiTheme.adaptiveColor = palette[0] || '#3b82f6';
                await saveConfig();
                applyCustomWallpaper();
                applyUiTheme();
                toggleModal(ALL_ELEMENTS.wallpaperCropModal, false);
                showNotification(i18n[config.uiLanguage].wallpaperUpdated, 'success');
            } catch (error) {
                console.error("桌布處理失敗:", error);
                showNotification(i18n[config.uiLanguage].wallpaperError, 'error');
            }
        };
        const restoreDefaultWallpaper = async () => {
            config.customWallpaper = null;
            config.wallpaperBrightness = 'light';
            config.uiTheme.adaptiveColor = '#3b82f6';
            config.uiTheme.adaptivePalette = [];
            config.uiTheme.adaptiveGradient = '';
            await saveConfig();
            applyCustomWallpaper();
            applyUiTheme();
            showNotification(i18n[config.uiLanguage].defaultAppearanceRestored, 'success');
        };
        const openStore = () => {
            ALL_ELEMENTS.appContainer.classList.remove('visible');
            ALL_ELEMENTS.storeContainer.classList.remove('hidden');
            requestAnimationFrame(() => {
                ALL_ELEMENTS.storeContainer.classList.add('visible');
            });
            ALL_ELEMENTS.appContainer.addEventListener('transitionend', () => {
                ALL_ELEMENTS.appContainer.classList.add('hidden');
            }, { once: true });
            currentStoreCategory = '全部';
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
    const translations = i18n[config.uiLanguage] || i18n['zh-TW'];
    const translatedOfficialAstras = OFFICIAL_ASTRAS.map(ast => ({
        ...ast,
        name: translations['astras_' + ast.id.replace(/-/g, '_') + '_name'] || ast.name,
        description: translations['astras_' + ast.id.replace(/-/g, '_') + '_desc'] || ast.description
    }));
    const userCreatedAstras = astras.filter(a => !a.officialId);
    const allCategories = ['全部', ...new Set([
        ...translatedOfficialAstras.map(a => a.category),
        ...userCreatedAstras.map(a => a.category)
    ].filter(Boolean))];
    allCategories.forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'store-category-btn';
        btn.textContent = category;
        if (category === currentStoreCategory) {
            btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
            currentStoreCategory = category;
            renderStore();
        });
        categoryList.appendChild(btn);
    });
    const allStoreAstras = [...translatedOfficialAstras, ...userCreatedAstras];
    const filteredAstras = currentStoreCategory === '全部'
        ? allStoreAstras
        : allStoreAstras.filter(a => a.category === currentStoreCategory);
    filteredAstras.forEach(ast => {
        const card = document.createElement('div');
        card.className = 'astras-store-card';
        const originalId = ast.officialId || ast.id;
        const isSubscribed = astras.some(userAstra => userAstra.officialId === originalId);
        const isUserCreated = !ast.officialId && astras.some(userAstra => userAstra.id === originalId);
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
            const isSubscribed = astras.some(a => a.officialId === officialId);
            if (isSubscribed) {
                astras = runtimeAppDataStore.replaceAstras(
                    astras.filter(a => a.officialId !== officialId)
                );
                showNotification(i18n[config.uiLanguage].unsubscribed || '已取消訂閱', 'success');
            } else {
                const officialAstra = OFFICIAL_ASTRAS.find(a => a.id === officialId);
                if (officialAstra) {
                    const newAstra = {
                        ...officialAstra,
                        id: crypto.randomUUID(),
                        officialId: officialAstra.id,
                    };
                    astras.unshift(newAstra);
                    showNotification(i18n[config.uiLanguage].subscribed || '訂閱成功！', 'success');
                }
            }
            await saveAppData();
            renderStore();
            renderAstras();
        };
        const openAvatarEditor = (astrasId) => {
            editingAstraForAvatarId = astrasId;
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
                if (cropperInstance) {
                    cropperInstance.destroy();
                }
                cropperInstance = new Cropper(ALL_ELEMENTS.avatarCropImage, {
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
            if (!cropperInstance || !editingAstraForAvatarId) return;
            const canvas = cropperInstance.getCroppedCanvas({
                width: 128,
                height: 128,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
            });
            const imageDataUrl = canvas.toDataURL('image/png');
            const astra = astras.find(a => a.id === editingAstraForAvatarId);
            if (astra) {
                astra.avatarUrl = imageDataUrl;
                await saveAppData();
                renderAstras();
                showNotification(i18n[config.uiLanguage].avatarUpdated || '頭像已更新', 'success');
            }
            toggleModal(ALL_ELEMENTS.astrasAvatarModal, false);
            editingAstraForAvatarId = null;
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
            if(ALL_ELEMENTS.loginLangLabel) {
                ALL_ELEMENTS.loginLangLabel.textContent = translations.currentLanguageName || '繁體中文';
            }
            legacyRuntimeContext.resolveBinding('input.updateInputState')();
            document.documentElement.lang = lang;
        };
        const showMobileContextMenu = (convId) => {
            const oldMenu = document.getElementById('mobile-context-menu-wrapper');
            if (oldMenu) oldMenu.remove();
            const conv = conversations.find(c => c.id === convId);
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
                text: i18n[config.uiLanguage]
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
            const folder = folders.find(f => f.id === folderId);
            if (!folder) return;
            const menuWrapper = document.createElement('div');
            menuWrapper.id = 'mobile-context-menu-wrapper';
            const overlay = document.createElement('div');
            overlay.id = 'mobile-context-menu-overlay';
            const menu = document.createElement('div');
            menu.id = 'mobile-context-menu';
            menu.innerHTML = buildFolderMobileContextMenuMarkup({
                name: folder.name,
                text: i18n[config.uiLanguage]
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
            const astra = astras.find(a => a.id === astrasId);
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
                text: i18n[config.uiLanguage]
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
                            editingAstrasId = astrasId;
                            ALL_ELEMENTS.astrasNameInput.value = astra.name;
                            ALL_ELEMENTS.astrasDescInput.value = astra.description;
                            ALL_ELEMENTS.astrasInstructionsInput.value = astra.instructions;
                            ALL_ELEMENTS.astrasCreateModal.querySelector('h2').textContent = i18n[config.uiLanguage].editAstras || '編輯 Astras';
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
        if (isAutoScrolling || scrollButtonFrame !== null) return;
        scrollButtonFrame = requestAnimationFrame(() => {
            scrollButtonFrame = null;
            updateScrollButtonVisibility();
        });
    };
    scrollToBottomBtn.addEventListener('click', () => {
        isAutoScrolling = true;
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
            isAutoScrolling = false;
            updateScrollButtonVisibility();
        }, 1000);
        const interruptHandler = () => {
            clearTimeout(scrollEndTimer);
            isAutoScrolling = false;
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
                container.innerHTML = `<p>${i18n[config.uiLanguage].noUpdateHistory || '目前沒有更新紀錄。'}</p>`;
            }
            toggleModal(ALL_ELEMENTS.updateInfoModal, true);
        };
        const checkAndShowLatestUpdate = async () => {
    if (!config.enableUpdateNotifications || typeof updateLogs === 'undefined' || updateLogs.length === 0) {
        return;
    }
    const lastSeenVersion = config.lastSeenVersion || '0.0.0'; // 如果從未見過，則設為 '0.0.0'
    const newUpdates = updateLogs.filter(log => compareVersions(log.version, lastSeenVersion) > 0);
    if (newUpdates.length > 0) {
        newUpdates.sort((a, b) => compareVersions(b.version, a.version));
        const contentContainer = ALL_ELEMENTS.latestUpdateContent;
        const modalTitle = document.querySelector('#latest-update-modal h2');
        if (modalTitle) {
            modalTitle.textContent = i18n[config.uiLanguage].newVersionsFound.replace('{count}', newUpdates.length);
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
        config.lastSeenVersion = latestVersionInLog;
        await saveConfig();
    }
};
        /**
 * @description 設定 Intersection Observer 來監聽聊天視窗中的訊息，並高亮右側對應的目錄項目
 */
function setupMessageIntersectionObserver() {
    // 如果之前有觀察者，先斷開連接，避免重複觀察
    if (messageObserver) {
        messageObserver.disconnect();
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
    messageObserver = new IntersectionObserver(observerCallback, {
        root: ALL_ELEMENTS.chatContainer, // 觀察的根元素是聊天容器
        rootMargin: '0px',
        threshold: [0.0, 0.25, 0.5, 0.75, 1.0] // 在不同可見比例時都觸發回呼
    });
    
    // 開始觀察每一則訊息
    messageItems.forEach(item => {
        messageObserver.observe(item);
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
            getConversations: () => conversations,
            replaceConversations: (nextConversations) => {
                conversations = runtimeAppDataStore.replaceConversations(nextConversations);
                return conversations;
            },
            saveAppData,
            getI18n: () => i18n,
            getUiLanguage: () => config.uiLanguage,
            showCustomConfirm,
            showNotification,
            showCoordinatedNotification: (...args) => runtimeDialogCoordinator.showNotification(...args),
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
                getCurrentUser: () => currentUser,
                getConfig: () => config,
                getConversations: () => conversations,
                getFolders: () => folders,
                getAstras: () => astras,
                getPersonalMemories: () => personalMemories,
                setSidebarOpen: (next) => {
                    sidebarOpen = next;
                    return sidebarOpen;
                },
                setSendConfirmed: (next) => {
                    sendConfirmed = next;
                    return sendConfirmed;
                },
                getAbortController: () => abortController,
                getCropperInstance: () => cropperInstance,
                setCropperInstance: (next) => {
                    cropperInstance = next;
                    return cropperInstance;
                },
                setEditingAstraForAvatarId: (next) => {
                    editingAstraForAvatarId = next;
                    return editingAstraForAvatarId;
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
                random: () => Math.random(),
                scheduleTimeout: setTimeout,
                clearScheduledTimeout: clearTimeout,
                scheduleAnimationFrame: requestAnimationFrame,
                logger: console
            },
            startup: {
                window,
                document,
                globalObject: globalThis,
                elements: ALL_ELEMENTS,
                getConfig: () => config,
                setCurrentUser: (nextUser) => {
                    currentUser = nextUser;
                    return currentUser;
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
        legacyRuntimeContext.registerLazyBinding(
            'runtime.entryDependencies',
            () => runtimeEntryDependencies
        );
