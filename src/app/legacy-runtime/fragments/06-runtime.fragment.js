    function updateP2PProgress(percent, text) {
        document.getElementById('p2p-progress-bar').style.width = `${percent}%`;
        document.getElementById('p2p-percentage').textContent = `${Math.round(percent)}%`;
        if (text) document.getElementById('p2p-status-text').textContent = text;
    }

    // 啟動 QR Code 掃描器
    function startQRScanner() {
        const readerElem = document.getElementById('p2p-reader');
        readerElem.classList.remove('hidden');
        
        html5QrcodeScanner = new Html5Qrcode("p2p-reader");
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        html5QrcodeScanner.start({ facingMode: "environment" }, config, (decodedText) => {
            // 掃描成功
            // 假設 QR code 內容就是 5 碼代碼
            // 簡單過濾：只取最後 5 碼 (如果使用者不小心加入前綴)
            let code = decodedText.trim();
            if (code.length > 5) code = code.slice(-5);
            
            document.getElementById('p2p-code-input').value = code;
            html5QrcodeScanner.stop().then(() => {
                readerElem.classList.add('hidden');
                connectToSender(code);
            });
        }).catch(err => {
            console.error(err);
            showNotification("無法啟動相機", "error");
        });
    }
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
            initChatApp();
            return;
        }
    }


    // 如果沒有找到上次登入的使用者，則正常顯示登入頁面
    if (lastUsername) {
        ALL_ELEMENTS.usernameInput.value = lastUsername;
    }
    document.getElementById('auth-container').classList.add('visible');
})();
            const FOLDER_SVGS = {
    'default': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />',
    'open': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />',
    'archive': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />',
    'user': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />',
    'star': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />',
    'cloud': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />',
    'work': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />',
    'tag': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />',
    'heart': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />',
    'lightning': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />'
};


// 定義文字顏色選項
const FOLDER_TEXT_COLORS = {
    'gray': '#6b7280', // 預設灰色
    'black': '#111827',
    'white': '#ffffff'
};
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
