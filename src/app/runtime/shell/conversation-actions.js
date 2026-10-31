// What the person does to a conversation from the sidebar and the header: start a new one, open one, move it to the trash, archive it
// and see an archived one, pin it, rename it (or a folder). Part of the application shell (shell.js); the later parts it calls
// (the drawing of the page, the memory) are handed in as functions, since they are made after it.

import { createMediaAttachmentRenderer as createArchivedMediaAttachmentRenderer } from '../messages/media-attachment-renderer.js';
import { createMediaPreviewLifecycle as createArchivedMediaPreviewLifecycle } from '../messages/media-preview-lifecycle.js';
import { createConversationViewRenderer as createArchivedConversationViewRenderer } from '../messages/conversation-view-renderer.js';
import { createDisabledCouncilConfig, disableConversationCouncil } from './conversation-council-state.js';
import { escapeHTML, renderUserText } from './shell-utilities.js';
import { confirmDeleteShared } from '../share/share-ref.js';
import { MODELS, getModelReasoningConfig, normalizeReasoningEffort } from './model-registry.js';
import { startingChoice } from './reasoning-memory.js';
import { getRuntimeTexts } from '../i18n/runtime-texts.js';

export const getDefaultGenConfig = () => ({ temperature: 0.7, topP: 0.95, maxTokens: null });
export const getDefaultFolder = () => ({ color: 'gray', icon: 'default', textColor: 'gray', isOpen: false});

export function createConversationActions({
    window, document, elements: ALL_ELEMENTS, i18n, uploads, disconnectMessageObserver, toggleSidebar, updateFunctionButtonsState,
    runtimeConfigAccess, liveConversationsBridge, conversationStateAccess, runtimeAppDataStore, runtimeDialogCoordinator,
    cloneCouncilConfig, getText, toggleModal, saveAppData, renderMarkdown, bindGeneratedImageAssets,
    getActiveConversation, renderAll, renderSidebar, adjustTextareaHeight, updateInputState, updateApiKeyWarningBadge,
    getQuoteInquiry
}) {
    let itemToRename = { id: null, type: null };
    const createBaseConversation = (title) => {
        const currentConfig = runtimeConfigAccess.getConfig();
        // A new conversation starts like the last real one (its model and how much it thinks); without one, with the model last chosen.
        const followed = startingChoice(liveConversationsBridge.getConversations(), { models: MODELS, getModelReasoningConfig, normalizeReasoningEffort });
        const defaultModelInfo = MODELS.find(m => m.id === followed?.model) || MODELS.find(m => m.id === currentConfig.lastUsedModel) || MODELS.find(m => m.id === currentConfig.defaultModel) || MODELS[0];
        const now = new Date().toISOString();
        return {
            // The levels are a copy (taken now): from here on this conversation has its own.
            ...(followed && followed.model === defaultModelInfo.id ? {
                ...(followed.reasoningEffort ? { reasoningEffort: followed.reasoningEffort } : {}),
                ...(Object.keys(followed.reasoningEfforts || {}).length ? { reasoningEfforts: { ...followed.reasoningEfforts } } : {})
            } : {}),
            id: crypto.randomUUID(),
            title: title,
            messages: [],
            model: defaultModelInfo.id,
            provider: defaultModelInfo.provider,
            archived: false,
            createdAt: now,
            lastUpdatedAt: now,
            genConfig: getDefaultGenConfig(),
            imageConfig: { aspectRatio: '1:1', resolution: '1K' },
            council: createDisabledCouncilConfig(currentConfig.lastCouncilConfig, cloneCouncilConfig),
            isRenamed: false,
            folderId: null,
            astrasId: null,
            isWebSearchEnabled: false,
            pinned: false,
            isTemporary: true,
            isNaming: false,
            deletedAt: null,
             unsentMessage: ''
        };
    };
    const startNewChat = async ({ keepSidebarOpen = false } = {}) => {
        const currentConversations = liveConversationsBridge.getConversations();
        const oldTempChatCount = currentConversations.length;
        const cleanedConversations = liveConversationsBridge.replaceConversations(
            currentConversations.filter(c => !c.isTemporary || c.messages.length > 0)
                .filter(c => c.retentionMode !== 'ephemeral')
        );
        if (cleanedConversations.length < oldTempChatCount) {
             await saveAppData();
        }
        uploads.clearUploadedFiles();
        getQuoteInquiry()?.clearQuote();
        const newConv = createBaseConversation(getText('newChat'));
        liveConversationsBridge.getConversations().unshift(newConv);
        conversationStateAccess.setCurrentConversationId(newConv.id);
        renderAll();
        ALL_ELEMENTS.messageInput.value = '';
        setTimeout(adjustTextareaHeight, 0);
        if (!keepSidebarOpen) {
            toggleSidebar(false);
        }
        updateInputState();
        updateApiKeyWarningBadge();
    };
    const loadChat = (id) => {
        disconnectMessageObserver();
        if (id !== conversationStateAccess.getCurrentConversationId()) {
            const previousConv = getActiveConversation();
            if (previousConv && (previousConv.isTemporary && previousConv.messages.length === 0 || previousConv.retentionMode === 'ephemeral')) {
                const currentConversations = liveConversationsBridge.getConversations();
                liveConversationsBridge.replaceConversations(
                    currentConversations.filter(c => c.id !== previousConv.id)
                );
            }
            conversationStateAccess.setCurrentConversationId(id);
            uploads.clearUploadedFiles();
            getQuoteInquiry()?.clearQuote();
            const conv = getActiveConversation();
            const councilWasEnabled = disableConversationCouncil(conv, cloneCouncilConfig);
            renderAll({reason:'chat-switch',scrollMode:'bottom'});
            window.dispatchEvent(new window.CustomEvent('astra:active-conversation-changed',{detail:{conversationId:id}}));
            ALL_ELEMENTS.messageInput.value = conv ? conv.unsentMessage || '' : '';
            setTimeout(adjustTextareaHeight, 0);
            if (councilWasEnabled) {
                saveAppData().catch(error => console.error('Failed to persist council reset after switching conversations:', error));
            }
        }
        updateInputState();
        updateApiKeyWarningBadge();
        updateFunctionButtonsState();
    };
    const deleteChat = async (id, event) => {
        event?.stopPropagation();
        if (!(await confirmDeleteShared([id]))) return;
        const currentConversations = liveConversationsBridge.getConversations();
        const conv = currentConversations.find(c => c.id === id);
        if (conv) {
            const deletedAt = new Date().toISOString();
            conv.deletedAt = deletedAt;
            conv.stateUpdatedAt = deletedAt;
            conv.trashStateUpdatedAt = deletedAt;
            conv.archived = false;
            if (conv.folderId) {
                const folder = runtimeAppDataStore.getFolders().find(f => f.id === conv.folderId);
                if (folder) {
                    folder.conversationIds = folder.conversationIds.filter(cid => cid !== id);
                }
                conv.folderId = null;
            }
            // The open conversation is left at once; saving and the cloud sync come after.
            if (conversationStateAccess.getCurrentConversationId() === id) {
                await startNewChat({ keepSidebarOpen: true });
            } else {
                renderSidebar();
            }
            await saveAppData({ immediateCloudSync: true });
            runtimeDialogCoordinator.showNotification(i18n[runtimeConfigAccess.getUiLanguage()].chatMovedToTrash || 'Chat moved to trash.', 'success');
        }
    };
    const archiveChat = async (id, event) => {
        event?.stopPropagation();
        const currentConversations = liveConversationsBridge.getConversations();
        const conv = currentConversations.find(c => c.id === id);
        if(conv) conv.archived = true;
        await saveAppData();
        if (conversationStateAccess.getCurrentConversationId() === id) {
            const latestConversations = liveConversationsBridge.getConversations();
            const nextConv = latestConversations.find(c => !c.archived && !c.deletedAt);
            conversationStateAccess.setCurrentConversationId(nextConv ? nextConv.id : null);
            if (!conversationStateAccess.getCurrentConversationId()) startNewChat();
            else loadChat(conversationStateAccess.getCurrentConversationId());
        } else {
            renderSidebar();
        }
    };
    const unarchiveChat = async (id, event) => {
        event?.stopPropagation();
        const currentConversations = liveConversationsBridge.getConversations();
        const conv = currentConversations.find(c => c.id === id);
        if(conv) conv.archived = false;
        await saveAppData();
        renderSidebar();
    };
    const {
        getInlineMediaSrc: getArchivedInlineMediaSrc,
        renderMediaAttachmentGrid: renderArchivedMediaAttachmentGrid
    } = createArchivedMediaAttachmentRenderer({ escapeHTML, getUiLanguage: () => runtimeConfigAccess.getUiLanguage() });
    const {
        bindMediaPreviewButtons: bindArchivedMediaPreviewButtons
    } = createArchivedMediaPreviewLifecycle({
        document,
        navigator,
        fetch,
        File,
        escapeHTML,
        getInlineMediaSrc: getArchivedInlineMediaSrc,
        getUiLanguage: () => runtimeConfigAccess.getUiLanguage()
    });
    const archivedConversationViewRenderer = createArchivedConversationViewRenderer({
        document,
        renderUserText,
        renderModelText: renderMarkdown,
        renderMediaAttachmentGrid: renderArchivedMediaAttachmentGrid,
        bindMediaPreviewButtons: bindArchivedMediaPreviewButtons,
        bindGeneratedImageAssets,
        getLabels: () => ({ imagePreview: getText('imagePreview'), imageAlt: getText('imageAlt'), imageDownload: getText('imageDownload') }),
        mediaMode: 'inlineData',
        wrapTextParts: true
    });
    const showArchivedChatPreview = (id, event) => {
        event?.stopPropagation();
        const currentConversations = liveConversationsBridge.getConversations();
        const conv = currentConversations.find(c => c.id === id);
        if (!conv) return;
        ALL_ELEMENTS.viewArchivedTitle.textContent = conv.title;
        const contentContainer = ALL_ELEMENTS.viewArchivedContent;
        archivedConversationViewRenderer.renderConversationMessages({conversation:conv,contentContainer,emptyHTML:'<p class="text-center text-[var(--text-secondary)]">No messages in this archived chat.</p>'});
        toggleModal(ALL_ELEMENTS.viewArchivedChatModal, true);
        archivedConversationViewRenderer.anchorToBottom(contentContainer);
    };
    const togglePinChat = async (id, event) => {
        event?.stopPropagation();
        const currentConversations = liveConversationsBridge.getConversations();
        const conv = currentConversations.find(c => c.id === id);
        if (conv) {
            conv.pinned = !conv.pinned;
            await saveAppData();
            renderSidebar();
        }
    };
    const showRenameModal = (id, type, event) => {
        event?.stopPropagation();
        itemToRename = { id, type };
        let currentTitle = '';
        if (type === 'conversation') {
            const currentConversations = liveConversationsBridge.getConversations();
            const conv = currentConversations.find(c => c.id === id);
            if (conv) currentTitle = conv.title;
        } else if (type === 'folder') {
            const folder = runtimeAppDataStore.getFolders().find(f => f.id === id);
            if (folder) currentTitle = folder.name;
        }
        const runtimeTexts = getRuntimeTexts(runtimeConfigAccess.getUiLanguage());
        ALL_ELEMENTS.renameModal.querySelector('h2').textContent = type === 'folder' ? runtimeTexts.renameFolder : runtimeTexts.renameChat;
        ALL_ELEMENTS.renameInput.value = currentTitle;
        toggleModal(ALL_ELEMENTS.renameModal, true);
        ALL_ELEMENTS.renameInput.focus();
    };
    const handleRename = async () => {
        const newTitle = ALL_ELEMENTS.renameInput.value.trim();
        if (!newTitle || !itemToRename.id) return;
        if (itemToRename.type === 'conversation') {
            const currentConversations = liveConversationsBridge.getConversations();
            const conv = currentConversations.find(c => c.id === itemToRename.id);
            if (conv) { conv.title = newTitle; conv.isRenamed = true; }
        } else if (itemToRename.type === 'folder') {
            const folder = runtimeAppDataStore.getFolders().find(f => f.id === itemToRename.id);
            if (folder) { folder.name = newTitle; }
        }
        await saveAppData();
        renderSidebar();
        toggleModal(ALL_ELEMENTS.renameModal, false);
        itemToRename = { id: null, type: null };
    };
    return {
        createBaseConversation,
        startNewChat,
        loadChat,
        deleteChat,
        archiveChat,
        unarchiveChat,
        showArchivedChatPreview,
        togglePinChat,
        showRenameModal,
        handleRename
    };
}
