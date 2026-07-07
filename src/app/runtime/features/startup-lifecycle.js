export function createLegacyStartupLifecycle({
    window,
    document,
    globalObject = globalThis,
    elements,
    getConfig,
    setCurrentUser,
    getItem,
    getUserKey,
    loadConfig,
    loadAppData,
    applyLanguage,
    applyCustomWallpaper,
    applyUiTheme,
    initChatApp,
    handleLogin,
    handleImportOnAuth,
    processAuthImport,
    toggleModal,
    installTouchGuards,
    registerServiceWorker,
    showCustomDialog,
    getComputedStyle
} = {}) {
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
        button.textContent = '選擇檔案';
        button.addEventListener('click', () => input.click());

        const fileName = document.createElement('span');
        fileName.className = 'localized-file-input-name text-sm text-[var(--text-secondary)] truncate';
        fileName.dataset.langKey = 'noFileSelected';
        fileName.textContent = '尚未選擇檔案';

        input.addEventListener('change', () => {
            const selectedFile = input.files?.[0];
            if (selectedFile) {
                delete fileName.dataset.langKey;
                fileName.textContent = selectedFile.name;
            } else {
                fileName.dataset.langKey = 'noFileSelected';
                fileName.textContent = '尚未選擇檔案';
                applyLanguage(getConfig().uiLanguage);
            }
        });

        wrapper.appendChild(button);
        wrapper.appendChild(fileName);
        input.insertAdjacentElement('afterend', wrapper);
    };

    function bindAuthStartupListeners() {
        elements.authForm.addEventListener('submit', handleLogin);
        enhanceLocalizedFileInput(elements.importFileInputAuth);

        const toggleAuthImportButton = () => {
            const username = elements.usernameInput.value.trim();
            const password = elements.passwordInput.value;
            elements.importBtnAuth.disabled = !(username && password);
        };

        elements.usernameInput.addEventListener('input', toggleAuthImportButton);
        elements.passwordInput.addEventListener('input', toggleAuthImportButton);
        elements.importBtnAuth.addEventListener('click', handleImportOnAuth);
        elements.confirmImportBtnAuth.addEventListener('click', processAuthImport);
        elements.cancelImportBtnAuth.addEventListener('click', () => toggleModal(elements.importDataModalAuth, false));
    }

    async function initializeApp() {
        applyLanguage('zh-TW');

        const lastUsername = await getItem('chat_lastUser');
        if (lastUsername) {
            const userKey = getUserKey(lastUsername);
            const savedUser = await getItem(userKey);

            if (savedUser) {
                setCurrentUser(JSON.parse(savedUser));
                await loadConfig();
                await loadAppData();
                applyCustomWallpaper();
                applyUiTheme();
                elements.authContainer.style.display = 'none';
                elements.appContainer.classList.remove('hidden');
                elements.appContainer.classList.add('visible');
                initChatApp();
                return;
            }
        }

        if (lastUsername) {
            elements.usernameInput.value = lastUsername;
        }
        document.getElementById('auth-container').classList.add('visible');
    }

    function adjustTextareaHeight() {
        const textarea = elements.messageInput;
        const expandBtn = document.getElementById('expand-input-btn');
        if (!textarea || !expandBtn) return;

        textarea.style.height = 'auto';

        const computedStyle = getComputedStyle(textarea);
        const fontSize = parseFloat(computedStyle.fontSize) || 16;
        const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.5;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
        const wrapper = textarea.closest('.input-wrapper');
        const singleLineHeight = lineHeight + paddingTop + paddingBottom;
        const maxHeight = (lineHeight * 8) + paddingTop + paddingBottom;
        const initialScrollHeight = textarea.scrollHeight;
        const hasInputText = textarea.value.length > 0;
        const wasMultilineLayout = wrapper?.classList.contains('has-multiline-input') || false;
        const isDesktopInput = window.matchMedia('(min-width: 769px)').matches;
        const firstLineWouldWrap = hasInputText && isDesktopInput && !wasMultilineLayout && (() => {
            const contentWidth = textarea.clientWidth - paddingLeft - paddingRight;
            if (contentWidth <= 0) return false;

            const measurementCanvas = adjustTextareaHeight.measurementCanvas
                || (adjustTextareaHeight.measurementCanvas = document.createElement('canvas'));
            const measurementContext = measurementCanvas.getContext('2d');
            measurementContext.font = [
                computedStyle.fontStyle,
                computedStyle.fontVariant,
                computedStyle.fontWeight,
                computedStyle.fontSize,
                computedStyle.fontFamily
            ].join(' ');
            const letterSpacing = parseFloat(computedStyle.letterSpacing) || 0;

            return textarea.value.split('\n').some(line => {
                if (!line) return false;
                const spacingWidth = Math.max(0, line.length - 1) * letterSpacing;
                return measurementContext.measureText(line).width + spacingWidth >= contentWidth - 1;
            });
        })();
        const useMultilineLayout = isDesktopInput && hasInputText && (
            wasMultilineLayout
            || textarea.value.includes('\n')
            || initialScrollHeight > singleLineHeight + 2
            || firstLineWouldWrap
        );
        if (wrapper && isDesktopInput) {
            wrapper.classList.toggle('has-multiline-input', useMultilineLayout);
        } else if (wrapper) {
            wrapper.classList.remove('has-multiline-input');
        }

        const scrollHeight = textarea.scrollHeight;
        if (scrollHeight > maxHeight + 2) {
            expandBtn.classList.remove('hidden');
            expandBtn.classList.add('flex');
        } else {
            expandBtn.classList.add('hidden');
            expandBtn.classList.remove('flex');
            if (textarea.classList.contains('expanded')) {
                textarea.classList.remove('expanded');
                expandBtn.classList.remove('rotated');
            }
        }

        if (textarea.classList.contains('expanded')) {
            textarea.style.height = `${scrollHeight}px`;
        } else {
            textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
        }
    }

    function bindLoginLanguageSwitcher() {
        elements.loginLangBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            elements.loginLangMenu.classList.toggle('visible');
        });
        document.addEventListener('click', (event) => {
            if (!elements.loginLanguageSwitcher.contains(event.target)) {
                elements.loginLangMenu.classList.remove('visible');
            }
        });
        elements.loginLangMenu.addEventListener('click', (event) => {
            event.preventDefault();
            const lang = event.target.dataset.lang;
            if (lang) {
                const config = getConfig();
                config.uiLanguage = lang;
                config.aiDefaultLanguage = lang;
                applyLanguage(lang);
                elements.loginLangMenu.classList.remove('visible');
            }
        });
    }

    function runStartupPostlude() {
        globalObject.__astraShowUpdateDialog = typeof showCustomDialog === 'function'
            ? showCustomDialog
            : null;
        installTouchGuards();
        registerServiceWorker();
    }

    return {
        bindAuthStartupListeners,
        initializeApp,
        bindLoginLanguageSwitcher,
        adjustTextareaHeight,
        runStartupPostlude
    };
}
