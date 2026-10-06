import {
    getTextColorForBackground as getThemeTextColorForBackground,
} from '../../../utils/color-contrast.js';

export function createThemeAppearanceLifecycle(dependencies = {}) {
    const {
        document,
        elements: ALL_ELEMENTS,
        state,
        UI_THEME_COLORS,
        setUserBubbleColor
    } = dependencies;

    const applyUiTheme = () => {
        const root = document.documentElement;
        const primaryBg = state.config.uiTheme.mode === 'custom'
            ? state.config.uiTheme.customColor
            : '#3b82f6';
        root.style.setProperty('--button-primary-bg', primaryBg);
        root.style.setProperty('--button-primary-text', getThemeTextColorForBackground(primaryBg));
        root.style.removeProperty('--button-primary-bg-override');
    };

    const renderUiColorOptions = () => {
        const { uiColorOptions, customColorPickerContainer, customColorSwatches } = ALL_ELEMENTS;
        uiColorOptions.querySelector(`input[value="${state.config.uiTheme.mode}"]`).checked = true;
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
        const updateVisibility = () => {
            const mode = document.querySelector('input[name="color-theme"]:checked').value;
            customColorPickerContainer.classList.toggle('hidden', mode !== 'custom');
        };
        uiColorOptions.querySelectorAll('input[name="color-theme"]').forEach(radio => {
            radio.addEventListener('change', updateVisibility);
        });
        updateVisibility();
    };

    const applyBubbleColors = () => {
        setUserBubbleColor();
    };

    return {
        applyUiTheme,
        renderUiColorOptions,
        applyBubbleColors
    };
}
