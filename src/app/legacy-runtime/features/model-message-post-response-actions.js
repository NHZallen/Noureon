export function applyModelMessagePostResponseActions({
    lastMessageElement,
    conversation,
    i18n,
    uiLanguage,
    formatTimestamp
}) {
    if (!lastMessageElement || !lastMessageElement.classList.contains('model-message')) {
        return false;
    }

    const bubble = lastMessageElement.querySelector('.message-bubble');
    const content = lastMessageElement.querySelector('.message-content');
    const aiMessageObject = conversation?.messages?.[conversation.messages.length - 1];
    if (!bubble || !content || !aiMessageObject || bubble.querySelector('.absolute')) {
        return false;
    }

    content.classList.add('pb-8');
    const timeString = formatTimestamp(aiMessageObject.createdAt);
    const copyTitle = i18n?.[uiLanguage]?.copyContent || '複製內容';
    const actionButtonsHTML = `
                            <div class="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                                <button class="copy-content-btn p-1 rounded-md hover:bg-gray-500/20 text-[var(--text-secondary)] opacity-50 hover:opacity-100 transition-opacity" title="${copyTitle}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                                <span class="text-xs text-gray-400">${timeString}</span>
                            </div>
                        `;
    bubble.insertAdjacentHTML('beforeend', actionButtonsHTML);
    return true;
}
