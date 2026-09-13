const INDICATOR_DELETE_KEYS = new Set(['Backspace', 'Delete']);

export function removeLastComposerIndicatorOnDelete({
    event,
    messageInput,
    inputIndicatorContainer
}) {
    if (!event || !INDICATOR_DELETE_KEYS.has(event.key)) return false;
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false;
    if (!messageInput || messageInput.value.length > 0 || !inputIndicatorContainer) return false;

    const activeIndicators = Array.from(inputIndicatorContainer.children)
        .filter((element) => element.matches('.input-indicator-item:not(.exit)'));
    const lastIndicator = activeIndicators.at(-1);
    const closeButton = lastIndicator?.querySelector('button[id^="close-"]');
    if (!closeButton) return false;

    event.preventDefault();
    closeButton.click();
    return true;
}
