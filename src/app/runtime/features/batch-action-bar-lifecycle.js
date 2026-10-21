export function createBatchActionBarLifecycle({
    elements = {},
    getI18n = () => ({}),
    // The batch selection of conversations (shell/shell-state.js).
    selection,
    getUiLanguage = () => 'zh-TW',
    renderSidebar = () => {}
} = {}) {
    const hasRequiredElements = () => (
        elements.batchActionBar &&
        elements.userControls &&
        elements.selectionCount &&
        elements.batchDeleteBtn &&
        elements.batchArchiveBtn &&
        elements.batchMoveBtn
    );

    const renderBatchActionBar = () => {
        if (!hasRequiredElements()) return false;
        const { batchActionBar, userControls, selectionCount, batchDeleteBtn, batchArchiveBtn, batchMoveBtn } = elements;
        if (selection.isSelectionMode()) {
            batchActionBar.classList.remove('hidden');
            userControls.classList.add('hidden');
            const count = selection.getSelectedConversationIds().size;
            const i18n = getI18n() || {};
            const uiLanguage = getUiLanguage();
            selectionCount.textContent = `${i18n[uiLanguage]?.selected || '已選取'} ${count} ${i18n[uiLanguage]?.items || '個項目'}`;
            const hasSelection = count > 0;
            batchDeleteBtn.disabled = !hasSelection;
            batchArchiveBtn.disabled = !hasSelection;
            batchMoveBtn.disabled = !hasSelection;
        } else {
            batchActionBar.classList.add('hidden');
            userControls.classList.remove('hidden');
        }
        return true;
    };

    // Turns the batch selection of conversations on or off: nothing stays selected, and the sidebar is drawn again.
    const toggleSelectionMode = () => {
        const isSelectionMode = !selection.isSelectionMode();
        selection.setSelectionMode(isSelectionMode);
        selection.clearSelectedConversations();
        const texts = (getI18n() || {})[getUiLanguage()] || {};
        if (elements.selectionModeBtn) {
            elements.selectionModeBtn.title = isSelectionMode
                ? texts.cancelBatchSelect || 'Cancel batch select'
                : texts.batchSelect || 'Batch select';
        }
        renderSidebar();
    };

    return { renderBatchActionBar, toggleSelectionMode };
}
