// Small changes the application shell makes to its own markup when it starts: a file input with words in the language in use, and the
// sign-out buttons of the settings (the one in the account part and the one under the menu on a wide screen).

import { getRuntimeText } from '../i18n/runtime-texts.js';

export function createAppShellEnhancements({ document, elements: ALL_ELEMENTS, i18n, getConfig }) {
    const enhanceLocalizedFileInput = (input) => {
        if (!input || input.dataset?.localizedFileInput === 'true') return;
        if (
            typeof document?.createElement !== 'function' ||
            typeof input.insertAdjacentElement !== 'function' ||
            !input.classList
        ) return;
        input.dataset.localizedFileInput = 'true';
        input.classList.add('sr-only');

        const wrapper = document.createElement('div');
        wrapper.className = 'localized-file-input flex flex-wrap items-center gap-3';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'px-4 py-2 rounded-full border-0 text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100';
        button.dataset.langKey = 'selectFile';
        button.textContent = getRuntimeText(getConfig().uiLanguage, 'chooseFile');
        button.addEventListener('click', () => input.click());

        const fileName = document.createElement('span');
        fileName.className = 'localized-file-input-name text-sm text-[var(--text-secondary)] truncate';
        fileName.dataset.langKey = 'noFileSelected';
        fileName.textContent = getRuntimeText(getConfig().uiLanguage, 'noFileSelected');

        const syncFileName = () => {
            const selectedFile = input.files?.[0];
            if (selectedFile) {
                delete fileName.dataset.langKey;
                fileName.textContent = selectedFile.name;
            } else {
                fileName.dataset.langKey = 'noFileSelected';
                fileName.textContent = i18n?.[getConfig?.().uiLanguage || 'zh-TW']?.noFileSelected || getRuntimeText(getConfig().uiLanguage, 'noFileSelected');
            }
        };

        input.addEventListener('change', syncFileName);
        wrapper.appendChild(button);
        wrapper.appendChild(fileName);
        input.insertAdjacentElement('afterend', wrapper);
    };
    const ensureSettingsDesktopLogoutButton = () => {
        const nav = ALL_ELEMENTS.settingsNav;
        if (!nav) return null;
        const existing = document.getElementById('settings-desktop-logout-btn');
        if (existing) return existing;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'settings-desktop-logout-btn';
        button.className = 'settings-nav-item settings-desktop-logout-btn w-full p-3 rounded-md text-left text-red-600 flex items-center gap-2';
        const logoutLabel = i18n[getConfig().uiLanguage]?.logout || '登出';
        button.innerHTML = `
            <svg aria-hidden="true" class="settings-desktop-logout-icon flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span data-lang-key="logout">${logoutLabel}</span>
        `;
        nav.closest('nav')?.appendChild(button);
        return button;
    };
    const enhanceSettingsLogoutButton = () => {
        const button = ALL_ELEMENTS.logoutBtn;
        if (!button || button.querySelector('.settings-logout-label')) return;
        button.classList.add('flex', 'items-center', 'gap-2', 'px-3');
        button.title = i18n[getConfig().uiLanguage]?.logout || '登出';
        button.dataset.langKeyTitle = 'logout';
        const label = document.createElement('span');
        label.className = 'settings-logout-label text-sm font-medium';
        label.dataset.langKey = 'logout';
        label.textContent = i18n[getConfig().uiLanguage]?.logout || '登出';
        button.appendChild(label);
    };
    return { enhanceLocalizedFileInput, ensureSettingsDesktopLogoutButton, enhanceSettingsLogoutButton };
}
