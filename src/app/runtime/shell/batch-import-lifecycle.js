import { createLazyFunctions } from '../kernel/lazy-functions.js';
import { compressImage } from '../utils/image-compression.js';
import { confirmDeleteShared } from '../share/share-ref.js';

const requiredDependencies = [
    'document',
    'window',
    'elements',
    'getConfig',
    'mutateConfig',
    'getSensitiveApiKeys',
    'mergeSensitiveApiKeys',
    'saveSensitiveConfig',
    'getCurrentUser',
    'setCurrentUser',
    'getConversations',
    'getFolders',
    'getAstras',
    'getPersonalMemories',
    'replaceAllAppData',
    'replaceFolders',
    'replacePersonalMemories',
    'getSelectedConversationIds',
    'conversationStateAccess',
    'runtimeDialogCoordinator',
    'saveAppData',
    'saveConfig',
    'toggleSelectionMode',
    'toggleModal',
    'showNotification',
    'showCustomConfirm',
    'showCustomPrompt',
    'moveConversationToFolder',
    'createNewFolder',
    'startNewChat',
    'processInChunks',
    'getBackupUsername',
    'createPasswordRecord',
    'getUserKey',
    'setItem',
    'i18n'
];

function assertRequiredDependencies(dependencies) {
    const missing = requiredDependencies.filter((key) => dependencies[key] == null);
    if (missing.length > 0) {
        throw new TypeError(`createBatchImportLifecycle missing dependencies: ${missing.join(', ')}`);
    }
}

export function createBatchImportLifecycle(dependencies = {}) {
    assertRequiredDependencies(dependencies);

    const {
        document,
        window,
        navigator,
        URL,
        File,
        loadArchiveVendor,
        JSZip,
        elements: ALL_ELEMENTS,
        // The memory functions (memory-runtime.js), or null while memory is not set up.
        setupSettingsModal,
        initChatApp,
        getConfig,
        mutateConfig,
        getSensitiveApiKeys,
        mergeSensitiveApiKeys,
        saveSensitiveConfig,
        getCurrentUser,
        setCurrentUser,
        getConversations,
        getFolders,
        getAstras,
        getPersonalMemories,
        replaceAllAppData,
        replaceFolders,
        replacePersonalMemories,
        getSelectedConversationIds,
        conversationStateAccess,
        runtimeDialogCoordinator,
        saveAppData,
        saveConfig,
        toggleSelectionMode,
        toggleModal,
        showNotification,
        showCustomConfirm,
        showCustomPrompt,
        moveConversationToFolder,
        createNewFolder,
        startNewChat,
        processInChunks,
        getBackupUsername,
        createPasswordRecord,
        getUserKey,
        setItem,
        hashString,
        constantTimeEqual,
        requestAnimationFrame,
        applyUiTheme,
        applyLanguage,
        loadChat,
        getOutputMode,
        i18n,
        randomUUID,
        getGeneratedImageBlob = async () => null,
        saveGeneratedImageBlob = async () => {},
        scheduleTimeout = (callback, ms) => setTimeout(callback, ms),
        delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        logger = console
    } = dependencies;

    const getTexts = () => i18n[getConfig().uiLanguage] || {};

    const handleBatchDelete = async () => {
        const selectedConversationIds = getSelectedConversationIds();
        const conversations = getConversations();
        const texts = getTexts();
        const count = selectedConversationIds.size;
        if (count === 0) return;
        if (!(await showCustomConfirm(`${texts.confirmBatchMoveToTrash || '您確定要將這'} ${count} ${texts.conversations || '個對話'} ${texts.moveToTrashConfirmText || '移至垃圾桶嗎？'}`))) return;
        if (!(await confirmDeleteShared([...selectedConversationIds]))) return;
        const deletedAt = new Date().toISOString();
        selectedConversationIds.forEach(id => {
            const conv = conversations.find(c => c.id === id);
            if (conv) {
                conv.deletedAt = deletedAt;
                conv.stateUpdatedAt = deletedAt;
                conv.trashStateUpdatedAt = deletedAt;
                conv.archived = false;
                if (conv.folderId) {
                    const folder = getFolders().find(item => item.id === conv.folderId);
                    if (folder) folder.conversationIds = folder.conversationIds.filter(conversationId => conversationId !== id);
                    conv.folderId = null;
                }
            }
        });
        // The open conversation is left at once, for a new chat; memory and saving come after.
        if (selectedConversationIds.has(conversationStateAccess.getCurrentConversationId())) {
            await startNewChat({ keepSidebarOpen: true });
        }
        await saveAppData({ immediateCloudSync: true });
        toggleSelectionMode();
        showNotification(`${texts.batchMoveToTrashSuccess || '已成功將'} ${count} ${texts.conversations || '個對話'} ${texts.movedToTrashText || '移至垃圾桶。'}`, 'success');
    };

    const handleBatchArchive = async () => {
        const selectedConversationIds = getSelectedConversationIds();
        const conversations = getConversations();
        const texts = getTexts();
        const count = selectedConversationIds.size;
        if (count === 0) return;
        conversations.forEach(c => {
            if (selectedConversationIds.has(c.id)) {
                c.archived = true;
            }
        });
        if (selectedConversationIds.has(conversationStateAccess.getCurrentConversationId())) {
            const nextConv = conversations.find(c => !c.archived && !c.deletedAt);
            conversationStateAccess.setCurrentConversationId(nextConv ? nextConv.id : null);
            if (!conversationStateAccess.getCurrentConversationId()) startNewChat();
        }
        await saveAppData();
        toggleSelectionMode();
        runtimeDialogCoordinator.showNotification(`${texts.batchArchiveSuccess || '已成功封存'} ${count} ${texts.conversations || '個對話。'}`, 'success');
    };

    const handleBatchMove = () => {
        if (getSelectedConversationIds().size === 0) return;
        renderBatchMoveModal();
        toggleModal(ALL_ELEMENTS.batchMoveModal, true);
    };

    const renderBatchMoveModal = (singleConvId = null) => {
        const texts = getTexts();
        const container = ALL_ELEMENTS.batchMoveFolderList;
        container.dataset.singleConvId = singleConvId || '';
        container.innerHTML = `
                <button class="w-full text-left p-2 rounded-md hover:bg-[var(--hover-bg)]" data-folder-id="none">
                    ${texts.moveOutOfFolder || '移出專案'}
                </button>
            `;
        getFolders().forEach(folder => {
            const btn = document.createElement('button');
            btn.className = 'w-full text-left p-2 rounded-md hover:bg-[var(--hover-bg)]';
            btn.dataset.folderId = folder.id;
            btn.textContent = folder.name;
            container.appendChild(btn);
        });
        const newFolderOption = document.createElement('button');
        newFolderOption.className = 'w-full text-left p-2 rounded-md hover:bg-[var(--hover-bg)] flex items-center gap-2 border-t border-[var(--border-color)] mt-2';
        newFolderOption.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path><line x1="12" y1="10" x2="12" y2="16"></line><line x1="9" y1="13" x2="15" y2="13"></line></svg>${texts.createNewFolder || '建立新專案'}`;
        newFolderOption.addEventListener('click', async () => {
            toggleModal(ALL_ELEMENTS.batchMoveModal, false);
            const name = await showCustomPrompt(texts.enterFolderName || '請輸入新專案名稱：', texts.createFolder || '建立專案');
            if (name) {
                const newId = createNewFolder(name);
                batchMoveToFolder(newId);
            }
        });
        container.appendChild(newFolderOption);
        container.querySelectorAll('button[data-folder-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const folderId = btn.dataset.folderId === 'none' ? null : btn.dataset.folderId;
                batchMoveToFolder(folderId);
            });
        });
    };

    const batchMoveToFolder = async (folderId) => {
        const singleConvId = ALL_ELEMENTS.batchMoveFolderList.dataset.singleConvId;
        const idsToMove = singleConvId ? new Set([singleConvId]) : getSelectedConversationIds();
        const count = idsToMove.size;
        idsToMove.forEach(convId => {
            moveConversationToFolder(convId, folderId);
        });
        toggleModal(ALL_ELEMENTS.batchMoveModal, false);
        if (!singleConvId) {
            toggleSelectionMode();
        }
        showNotification(`${getTexts().moved || '已移動'} ${count} ${getTexts().conversations || '個對話。'}`);
    };

    const resolveSearchSetupSettingsModal = (...args) => setupSettingsModal(...args);

    // Import and export (features/import-export-lifecycle.js) load the first time one is used.
    const importExportLifecycle = createLazyFunctions(() => import('../features/import-export-lifecycle.js').then(({ createImportExportLifecycle }) => createImportExportLifecycle({
        document,
        window,
        navigator,
        URL,
        File,
        loadArchiveVendor,
        JSZip,
        elements: ALL_ELEMENTS,
        getCurrentUser,
        getConfig,
        getSensitiveApiKeys,
        mutateConfig,
        mergeSensitiveApiKeys,
        getConversations,
        getFolders,
        getAstras,
        getPersonalMemories,
        replaceAllAppData,
        replaceFolders,
        replacePersonalMemories,
        saveAppData,
        saveConfig,
        saveSensitiveConfig,
        processInChunks,
        getBackupUsername,
        compressImage,
        applyUiTheme,
        applyLanguage,
        loadChat,
        startNewChat,
        showCustomConfirm,
        showCustomPrompt,
        showNotification,
        toggleModal,
        getOutputMode,
        resolveSearchSetupSettingsModal,
        i18n,
        randomUUID,
        getGeneratedImageBlob,
        saveGeneratedImageBlob,
        storage: dependencies.runtimeStorageAdapter,
        delay,
        logger,
    })), ['handleExport', 'performImport', 'handleImport', 'resolveImportedApiKeys']);

    // Importing a backup from the sign-in page (features/auth-import-lifecycle.js) loads the first time it is used.
    const authImportLifecycle = createLazyFunctions(() => import('../features/auth-import-lifecycle.js').then(({ createAuthImportLifecycle }) => createAuthImportLifecycle({
        elements: ALL_ELEMENTS,
        loadArchiveVendor,
        JSZip,
        getConfig,
        mutateConfig,
        mergeSensitiveApiKeys,
        setCurrentUser,
        createPasswordRecord,
        getUserKey,
        setItem,
        replaceAllAppData,
        replaceFolders,
        replacePersonalMemories,
        saveAppData,
        saveConfig,
        saveSensitiveConfig,
        processInChunks,
        getBackupUsername,
        hashString,
        constantTimeEqual,
        showNotification,
        toggleModal,
        requestAnimationFrame,
        scheduleTimeout,
        delay,
        initChatApp: () => initChatApp(),
        i18n,
        logger,
        resolveImportedApiKeys: importExportLifecycle.resolveImportedApiKeys,
    })), ['handleImportOnAuth', 'processAuthImport']);

    return {
        handleBatchDelete,
        handleBatchArchive,
        handleBatchMove,
        renderBatchMoveModal,
        batchMoveToFolder,
        handleExport: importExportLifecycle.handleExport,
        performImport: importExportLifecycle.performImport,
        handleImport: importExportLifecycle.handleImport,
        handleImportOnAuth: authImportLifecycle.handleImportOnAuth,
        processAuthImport: authImportLifecycle.processAuthImport
    };
}
