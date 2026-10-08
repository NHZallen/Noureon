import {
    accentForDarkTheme,
    getTextColorForBackground as getThemeTextColorForBackground,
} from '../../../utils/color-contrast.js';
import { createColorScheme } from './color-scheme.js';

// The accent when the person has not chosen a colour of their own: the blue of the theme in use.
const DEFAULT_ACCENT = Object.freeze({ light: '#3b82f6', dark: '#5b9bff' });

export function createThemeAppearanceLifecycle(dependencies = {}) {
    const {
        window,
        document,
        elements: ALL_ELEMENTS,
        state,
        i18n,
        UI_THEME_COLORS
    } = dependencies;

    const colorScheme = createColorScheme({ window, document });

    const applyUiTheme = () => {
        const root = document.documentElement;
        // The light or the dark theme first (the accent below follows it).
        const theme = colorScheme.apply(state.config.colorScheme);
        const chosen = state.config.uiTheme.mode === 'custom' ? state.config.uiTheme.customColor : null;
        const primaryBg = chosen ? (theme === 'dark' ? accentForDarkTheme(chosen) : chosen) : DEFAULT_ACCENT[theme];
        root.style.setProperty('--button-primary-bg', primaryBg);
        root.style.setProperty('--button-primary-text', getThemeTextColorForBackground(primaryBg));
        root.style.removeProperty('--button-primary-bg-override');
    };

    const COLOR_LABEL_KEYS = {
        default: ['colorBlue', 'Blue'],
        cyan: ['colorCyan', 'Cyan'],
        green: ['colorGreen', 'Green'],
        lime: ['colorLime', 'Lime'],
        yellow: ['colorYellow', 'Yellow'],
        orange: ['colorOrange', 'Orange'],
        pink: ['colorPink', 'Pink'],
        magenta: ['colorMagenta', 'Magenta'],
        purple: ['colorPurple', 'Purple'],
        black: ['colorBlack', 'Black']
    };
    const CUSTOM_CHOICE = 'custom';
    // #RGB or #RRGGBB, with or without the #, in any case; the colour input wants #rrggbb.
    const normalizeHex = (value) => {
        const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
        if (!match) return null;
        const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
        return `#${digits.toLowerCase()}`;
    };
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
        const hexText = customColorPickerContainer.querySelector('.pz-hex-text');
        const showHex = () => {
            customColorPickerContainer.querySelector('.color-dot').style.backgroundColor = customColorInput.value;
            hexText.value = customColorInput.value.toUpperCase();
        };

        let choice = getColorChoice(theme);
        customColorInput.value = theme.customColor;
        showHex();
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
        // A wide field does not sink and spring back under the press like a small button (press-feedback.js).
        button.setAttribute('data-no-press', '');
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
                    showHex();
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
            showHex();
            renderButton();
        };

        // The colour code can be typed; the palette opens from the dot. A code that is not a colour goes back to the one in use.
        hexText.onchange = () => {
            const hex = normalizeHex(hexText.value);
            if (hex) {
                customColorInput.value = hex;
                customColorInput.oninput();
            } else {
                showHex();
            }
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

    return {
        applyUiTheme,
        renderUiColorOptions
    };
}
