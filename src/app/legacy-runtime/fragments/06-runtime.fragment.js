        import { createLegacyStartupLifecycle } from '/src/app/runtime/features/startup-lifecycle.js';

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
        const startupLifecycle = createLegacyStartupLifecycle({
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
            initChatApp: () => legacyRuntimeContext.resolveBinding('app.initChatApp')(),
            handleLogin,
            handleImportOnAuth,
            processAuthImport,
            toggleModal,
            installTouchGuards,
            registerServiceWorker,
            showCustomDialog,
            getComputedStyle
        });
        const {
            bindAuthStartupListeners,
            initializeApp,
            bindLoginLanguageSwitcher,
            adjustTextareaHeight,
            runStartupPostlude
        } = startupLifecycle;

        bindAuthStartupListeners();
        void initializeApp();
        bindLoginLanguageSwitcher();
        runStartupPostlude();
