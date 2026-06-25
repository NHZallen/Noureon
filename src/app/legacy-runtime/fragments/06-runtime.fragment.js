        const handleDeleteMessagePair = async () => {
            return;
        };
        /*
        const handleDeleteMessagePairLegacy = async (index) => {
            const confirmed = await showCustomDialog({
                title: i18n[config.uiLanguage].deleteConfirmationTitle || '刪除確認',
                message: i18n[config.uiLanguage].deleteConfirmationMessage || '確定刪除此條對話？',
                dialogClass: 'dialog-warning-border',
                buttons: [
                    { text: i18n[config.uiLanguage].cancel || '取消', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false },
                    { text: i18n[config.uiLanguage].confirmDelete || '確定', class: 'bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600', value: () => true }
                ]
            });
            if (confirmed) {
                    const conv = getActiveConversation();
                    if (conv && conv.messages[index] && conv.messages[index + 1]) {
                        conv.messages.splice(index, 2);
                        await saveAppData();
                        renderChat();
                        showNotification(i18n[config.uiLanguage].messageDeleted || '對話已刪除。', 'success');
                    }
                }
            };
        */
            ALL_ELEMENTS.authForm.addEventListener('submit', handleLogin);
            const toggleAuthImportButton = () => {
                const username = ALL_ELEMENTS.usernameInput.value.trim();
                const password = ALL_ELEMENTS.passwordInput.value;
                ALL_ELEMENTS.importBtnAuth.disabled = !(username && password);
            };
            ALL_ELEMENTS.usernameInput.addEventListener('input', toggleAuthImportButton);
            ALL_ELEMENTS.passwordInput.addEventListener('input', toggleAuthImportButton);
            ALL_ELEMENTS.importBtnAuth.addEventListener('click', handleImportOnAuth);
            ALL_ELEMENTS.confirmImportBtnAuth.addEventListener('click', processAuthImport);
            ALL_ELEMENTS.cancelImportBtnAuth.addEventListener('click', () => toggleModal(ALL_ELEMENTS.importDataModalAuth, false));
            (async function initializeApp() {
    // 先設定預設語言，確保登入頁面顯示正確
    applyLanguage('zh-TW');


    // 嘗試從資料庫中獲取上次登入的使用者名稱
    const lastUsername = await getItem('chat_lastUser');


    if (lastUsername) {
        // 如果找到了上次登入的使用者，就嘗試自動登入
        const userKey = getUserKey(lastUsername);
        const savedUser = await getItem(userKey);


        if (savedUser) {
            // 成功獲取到使用者資料
            currentUser = JSON.parse(savedUser);


            // --- 核心修正 START ---
            // 1. **首先**，等待所有設定和資料載入完成
            await loadConfig();
            await loadAppData();


            // 2. **然後**，應用主題和桌布設定 (這會修正按鈕顏色問題)
            applyCustomWallpaper();
            applyUiTheme();
            // --- 核心修正 END ---


            // 3. 顯示主應用介面
            ALL_ELEMENTS.authContainer.style.display = 'none';
            ALL_ELEMENTS.appContainer.classList.remove('hidden');
            ALL_ELEMENTS.appContainer.classList.add('visible');


            // 4. 最後，呼叫 initChatApp，此時它知道所有資料都已準備就緒
            legacyRuntimeContext.resolveBinding('app.initChatApp')();
            return;
        }
    }


    // 如果沒有找到上次登入的使用者，則正常顯示登入頁面
    if (lastUsername) {
        ALL_ELEMENTS.usernameInput.value = lastUsername;
    }
    document.getElementById('auth-container').classList.add('visible');
})();
            const adjustTextareaHeight = () => {
    const textarea = ALL_ELEMENTS.messageInput;
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

        const measurementCanvas = adjustTextareaHeight.measurementCanvas || (adjustTextareaHeight.measurementCanvas = document.createElement('canvas'));
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
        wasMultilineLayout ||
        textarea.value.includes('\n') ||
        initialScrollHeight > singleLineHeight + 2 ||
        firstLineWouldWrap
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
};
            ALL_ELEMENTS.loginLangBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ALL_ELEMENTS.loginLangMenu.classList.toggle('visible');
            });
            document.addEventListener('click', (e) => {
                if (!ALL_ELEMENTS.loginLanguageSwitcher.contains(e.target)) {
                    ALL_ELEMENTS.loginLangMenu.classList.remove('visible');
                }
            });
            ALL_ELEMENTS.loginLangMenu.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = e.target.dataset.lang;
                if (lang) {
                    config.uiLanguage = lang;
                    config.aiDefaultLanguage = lang;
                    applyLanguage(lang);
                    ALL_ELEMENTS.loginLangMenu.classList.remove('visible');
                }
            });

globalThis.__astraShowUpdateDialog = typeof showCustomDialog === 'function' ? showCustomDialog : null;
installTouchGuards();
registerServiceWorker();
