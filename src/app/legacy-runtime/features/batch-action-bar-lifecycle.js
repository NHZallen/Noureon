export function createBatchActionBarLifecycle({
    elements = {},
    getI18n = () => ({}),
    getIsSelectionMode = () => false,
    getSelectedConversationIds = () => new Set(),
    getUiLanguage = () => 'zh-TW'
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
        if (getIsSelectionMode()) {
            batchActionBar.classList.remove('hidden');
            userControls.classList.add('hidden');
            const count = getSelectedConversationIds().size;
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

    return { renderBatchActionBar };
}
