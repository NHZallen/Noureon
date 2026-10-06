import {
    getTextColorForBackground as getThemeTextColorForBackground,
} from '../../../utils/color-contrast.js';

export function createThemeAppearanceLifecycle(dependencies = {}) {
    const {
        window,
        document,
        elements: ALL_ELEMENTS,
        state,
        i18n,
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

    const COLOR_LABEL_KEYS = {
        default: ['colorDefault', 'Default'],
        blue: ['colorBlue', 'Blue'],
        green: ['colorGreen', 'Green'],
        yellow: ['colorYellow', 'Yellow'],
        pink: ['colorPink', 'Pink'],
        orange: ['colorOrange', 'Orange'],
        purple: ['colorPurple', 'Purple']
    };
    const CUSTOM_CHOICE = 'custom';
    let closeMenuOnOutsideClickBound = false;

    // The choice shown in the menu: the default, one of the named colours, or a colour of the person's own.
    const getColorChoice = (theme) => {
        if (theme.mode !== 'custom') return 'default';
        const named = Object.entries(UI_THEME_COLORS).find(([, hex]) => hex.toLowerCase() === String(theme.customColor).toLowerCase());
        return named ? named[0] : CUSTOM_CHOICE;
    };

    const renderUiColorOptions = () => {
        const { uiColorOptions, customColorPickerContainer, customColorInput } = ALL_ELEMENTS;
        const theme = state.config.uiTheme;
        const text = (key, fallback) => i18n?.[state.config.uiLanguage]?.[key] || fallback;
        const labelFor = (choice) => (choice === CUSTOM_CHOICE
            ? text('colorCustom', 'Custom')
            : text(...COLOR_LABEL_KEYS[choice]));
        const hexFor = (choice) => (choice === CUSTOM_CHOICE ? customColorInput.value : UI_THEME_COLORS[choice]);

        let choice = getColorChoice(theme);
        customColorInput.value = theme.customColor;
        uiColorOptions.dataset.mode = theme.mode === 'custom' ? 'custom' : 'default';
        uiColorOptions.dataset.color = theme.customColor;

        const dot = (hex) => {
            const element = document.createElement('span');
            element.className = 'color-dot';
            element.style.backgroundColor = hex;
            return element;
        };
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'color-dropdown-btn';
        button.setAttribute('aria-haspopup', 'listbox');
        const menu = document.createElement('div');
        menu.className = 'color-dropdown-menu';
        menu.setAttribute('role', 'listbox');

        const renderButton = () => {
            button.replaceChildren(dot(hexFor(choice)), document.createTextNode(labelFor(choice)));
            button.insertAdjacentHTML('beforeend', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>');
            menu.querySelectorAll('.color-option').forEach((option) => {
                const selected = option.dataset.choice === choice;
                option.classList.toggle('selected', selected);
                option.setAttribute('aria-selected', String(selected));
            });
            customColorPickerContainer.classList.toggle('hidden', choice !== CUSTOM_CHOICE);
        };

        [...Object.keys(UI_THEME_COLORS), CUSTOM_CHOICE].forEach((id) => {
            const option = document.createElement('div');
            option.className = 'color-option';
            option.dataset.choice = id;
            option.setAttribute('role', 'option');
            if (id !== CUSTOM_CHOICE) option.appendChild(dot(UI_THEME_COLORS[id]));
            const label = document.createElement('span');
            label.className = 'color-option-label';
            label.textContent = labelFor(id);
            option.appendChild(label);
            option.insertAdjacentHTML('beforeend', '<svg class="color-option-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>');
            option.addEventListener('click', () => {
                choice = id;
                if (id === 'default') {
                    uiColorOptions.dataset.mode = 'default';
                } else {
                    uiColorOptions.dataset.mode = 'custom';
                    if (id !== CUSTOM_CHOICE) customColorInput.value = UI_THEME_COLORS[id];
                    uiColorOptions.dataset.color = customColorInput.value;
                }
                renderButton();
                menu.classList.remove('show');
            });
            menu.appendChild(option);
        });

        button.addEventListener('click', () => {
            menu.classList.toggle('show');
            const rect = button.getBoundingClientRect();
            const menuRect = menu.getBoundingClientRect();
            // The room is what the settings page shows, not the whole window: the page scrolls inside the dialog.
            const area = button.closest('.scroll-area')?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
            const roomBelow = area.bottom - rect.bottom;
            // Open upward only when it does not fit below and there is more room above.
            if (menuRect.height > roomBelow && rect.top - area.top > roomBelow) {
                menu.style.top = 'auto';
                menu.style.bottom = 'calc(100% + 0.45rem)';
            } else {
                menu.style.top = 'calc(100% + 0.45rem)';
                menu.style.bottom = 'auto';
            }
        });
        customColorInput.oninput = () => {
            uiColorOptions.dataset.mode = 'custom';
            uiColorOptions.dataset.color = customColorInput.value;
            renderButton();
        };

        uiColorOptions.replaceChildren(button, menu);
        renderButton();

        if (!closeMenuOnOutsideClickBound) {
            closeMenuOnOutsideClickBound = true;
            document.addEventListener('click', (event) => {
                if (!uiColorOptions.contains(event.target)) uiColorOptions.querySelector('.color-dropdown-menu')?.classList.remove('show');
            });
        }
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
