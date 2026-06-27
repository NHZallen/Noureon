import {
    getTextColorForBackground as getThemeTextColorForBackground,
} from '../../../utils/color-contrast.js';

export function createThemeAppearanceLifecycle(dependencies = {}) {
    const {
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
        logger = console
    } = dependencies;

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
        switch(state.config.uiTheme.mode) {
            case 'adaptive':
                if (state.config.uiTheme.style === 'gradient') {
                    primaryBgOverride = state.config.uiTheme.adaptiveGradient || `linear-gradient(to right, ${state.config.uiTheme.adaptiveColor}, #3b82f6)`;
                    primaryBg = state.config.uiTheme.adaptivePalette[0] || state.config.uiTheme.adaptiveColor;
                } else {
                    primaryBg = state.config.uiTheme.adaptiveColor;
                }
                break;
            case 'custom':
                primaryBg = state.config.uiTheme.customColor;
                break;
            case 'default':
            default:
                primaryBg = '#3b82f6';
                break;
        }
        const textColor = (state.config.uiTheme.style === 'gradient' && state.config.uiTheme.mode === 'adaptive')
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
        const currentMode = state.config.uiTheme.mode;
        const currentStyle = state.config.uiTheme.style;
        uiColorOptions.querySelector(`input[value="${currentMode}"]`).checked = true;
        buttonStyleContainer.querySelector(`input[value="${currentStyle}"]`).checked = true;
        customColorSwatches.innerHTML = '';
        Object.entries(UI_THEME_COLORS).forEach(([name, hex]) => {
            const swatch = document.createElement('div');
            swatch.className = `color-swatch w-8 h-8 rounded-full cursor-pointer`;
            swatch.style.backgroundColor = hex;
            swatch.dataset.color = hex;
            if (state.config.uiTheme.customColor === hex) {
                swatch.classList.add('selected');
            }
            swatch.addEventListener('click', () => {
                customColorSwatches.querySelector('.selected')?.classList.remove('selected');
                swatch.classList.add('selected');
            });
            customColorSwatches.appendChild(swatch);
        });
        gradientSwatches.innerHTML = '';
        if(state.config.uiTheme.adaptivePalette && state.config.uiTheme.adaptivePalette.length > 1) {
            const palette = state.config.uiTheme.adaptivePalette;
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
                if(state.config.uiTheme.adaptiveGradient === grad) {
                    swatch.classList.add('selected-gradient', 'border-blue-500');
                }
                swatch.addEventListener('click', () => {
                    gradientSwatches.querySelector('.selected-gradient')?.classList.remove('selected-gradient', 'border-blue-500');
                    swatch.classList.add('selected-gradient', 'border-blue-500');
                });
                gradientSwatches.appendChild(swatch);
            });
        } else {
             gradientSwatches.innerHTML = `<p class="text-xs col-span-4 text-[var(--text-secondary)]">${i18n[state.config.uiLanguage].notEnoughColors || '沒有足夠的顏色來生成漸變。請上傳顏色豐富的桌布。'}</p>`
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
        if (state.config.customWallpaper) {
            ALL_ELEMENTS.wallpaperContainer.style.backgroundImage = `url(${state.config.customWallpaper})`;
            document.body.classList.add('custom-wallpaper-active');
            document.body.classList.toggle('wallpaper-is-dark', state.config.wallpaperBrightness === 'dark');
            document.documentElement.classList.remove('dark');
        } else {
            ALL_ELEMENTS.wallpaperContainer.style.backgroundImage = 'none';
            document.body.classList.remove('custom-wallpaper-active', 'wallpaper-is-dark');
            setTheme(state.config.theme);
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
            if (state.cropperInstance) {
                state.cropperInstance.destroy();
            }
            state.cropperInstance = new Cropper(ALL_ELEMENTS.wallpaperCropImage, {
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
        if (!state.cropperInstance) return;
        const canvas = state.cropperInstance.getCroppedCanvas({
            maxWidth: 1920,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        try {
            const brightness = await analyzeImageBrightness(imageDataUrl);
            const palette = await getDominantColorPalette(imageDataUrl);
            state.config.customWallpaper = imageDataUrl;
            state.config.wallpaperBrightness = brightness;
            state.config.uiTheme.adaptivePalette = palette;
            state.config.uiTheme.adaptiveColor = palette[0] || '#3b82f6';
            await saveConfig();
            applyCustomWallpaper();
            applyUiTheme();
            toggleModal(ALL_ELEMENTS.wallpaperCropModal, false);
            showNotification(i18n[state.config.uiLanguage].wallpaperUpdated, 'success');
        } catch (error) {
            logger.error("獢???憭望?:", error);
            showNotification(i18n[state.config.uiLanguage].wallpaperError, 'error');
        }
    };

    const restoreDefaultWallpaper = async () => {
        state.config.customWallpaper = null;
        state.config.wallpaperBrightness = 'light';
        state.config.uiTheme.adaptiveColor = '#3b82f6';
        state.config.uiTheme.adaptivePalette = [];
        state.config.uiTheme.adaptiveGradient = '';
        await saveConfig();
        applyCustomWallpaper();
        applyUiTheme();
        showNotification(i18n[state.config.uiLanguage].defaultAppearanceRestored, 'success');
    };

    return {
        getDominantColorPalette,
        applyUiTheme,
        renderUiColorOptions,
        analyzeImageBrightness,
        applyCustomWallpaper,
        handleWallpaperUpload,
        handleConfirmCrop,
        restoreDefaultWallpaper
    };
}
