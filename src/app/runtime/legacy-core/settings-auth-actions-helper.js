import {
    STORAGE_OWNER_KEY,
    reconcileStoredWorkspaceOwner
} from '../kernel/user-data-retention.js';

export function createSettingsAuthActionsHelper({
    window,
    requestAnimationFrame,
    setTimeout,
    console,
    elements,
    state,
    getConfig,
    legacyRuntimeContext,
    runtimeStorageAdapter,
    i18n,
    showNotification,
    showCustomConfirm,
    showCustomDialog,
    getUserKey,
    getItem,
    setItem,
    removeItem,
    verifyPasswordRecord,
    upgradeLegacyPasswordRecord,
    createPasswordRecord,
    loadConfig = async () => {},
    loadAppData = async () => {},
    applyCustomWallpaper = () => {},
    applyUiTheme = () => {}
}) {
    const getText = (key, fallback) => {
        const config = getConfig();
        return i18n[config.uiLanguage]?.[key] || fallback;
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        const username = elements.usernameInput.value.trim();
        const password = elements.passwordInput.value;
        if (!username || !password) {
            showNotification(getText('usernamePasswordRequired', '使用者名稱和密碼皆為必填項目。'), 'error');
            return;
        }
        const userKey = getUserKey(username);
        const savedUser = await getItem(userKey);
        if (savedUser) {
            const parsedUser = JSON.parse(savedUser);
            if (!(await verifyPasswordRecord(password, parsedUser))) {
                showNotification(getText('passwordIncorrect', '密碼錯誤。'), 'error');
                return;
            }
            state.currentUser = await upgradeLegacyPasswordRecord(password, userKey, parsedUser);
        } else {
            state.currentUser = await createPasswordRecord(username, password);
            await setItem(userKey, JSON.stringify(state.currentUser));
        }
        await reconcileStoredWorkspaceOwner({
            nextUsername: username,
            getItem,
            setItem,
            removeItem,
            storageAdapter: runtimeStorageAdapter
        });
        await setItem('chat_lastUser', username);
        await loadConfig();
        await loadAppData();
        applyCustomWallpaper();
        applyUiTheme();


        // --- ✨ 這是唯一的修改處 START ---
        // 在執行淡出前，先移除我們為了顯示登入畫面而加入的 'visible' class
        elements.authContainer.classList.remove('visible');
        // --- ✨ 這是唯一的修改處 END ---


        elements.authContainer.classList.add('fade-out');
        elements.appContainer.classList.remove('hidden');
        requestAnimationFrame(() => {
            elements.appContainer.classList.add('visible');
        });
        elements.authContainer.addEventListener('transitionend', () => {
            elements.authContainer.style.display = 'none';
        }, { once: true });
        legacyRuntimeContext.resolveBinding('app.initChatApp')();
    };

    const handleLogout = async () => {
        if (await showCustomConfirm(getText('confirmLogout', '您確定要登出嗎？'), getText('logoutConfirmation', '登出確認'))) {
            if (state.currentUser?.username) {
                await setItem(STORAGE_OWNER_KEY, state.currentUser.username);
            }
            await removeItem('chat_lastUser');
            window.location.reload();
        }
    };

    const handleDeleteAllData = async () => {
        const confirmation = await showCustomDialog({
            title: getText('deleteAllDataTitle', '永久刪除所有資料'),
            message: getText('deleteAllDataMessage', '此操作將會刪除您所有的對話紀錄、設定、Astras 及 API 金鑰。此動作無法復原。請輸入「DELETE」以確認刪除。'),
            input: { type: 'text', placeholder: 'DELETE' },
            dialogClass: 'dialog-warning-border',
            buttons: [
                { text: getText('cancel', '取消'), class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => null },
                { text: getText('confirmDelete', '確認刪除'), class: 'bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700', value: (val) => val }
            ]
        });
        if (confirmation === 'DELETE') {
            try {
                await runtimeStorageAdapter.clear();
                showNotification(getText('deleteAllDataSuccess', '所有資料已成功刪除。頁面即將重新整理。'), 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } catch (error) {
                console.error('刪除資料時發生錯誤:', error);
                showNotification(getText('deleteAllDataError', '刪除資料失敗。'), 'error');
            }
        } else if (confirmation !== null) {
            showNotification(getText('incorrectInput', '輸入錯誤，操作已取消。'), 'warning');
        }
    };

    return {
        handleLogin,
        handleLogout,
        handleDeleteAllData
    };
}
