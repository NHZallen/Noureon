export function buildMessageRenderView({
    message,
    renderUserText,
    renderMarkdownWithFormulas,
    renderMediaAttachmentGrid,
    formatTimestamp,
    copyTitle
}) {
    const isUser = message.role === 'user';
    const messageClassName = `message-item flex items-start gap-2 md:gap-4 ${isUser ? 'justify-end user-message' : 'model-message'}`;
    let contentHTML = '';
    let mediaGridHTML = '';
    let actionButtons = '';
    let contentPaddingClass = '';
    let previewMediaParts = [];
    const isLoadingMessage = !isUser && message.parts.length === 1 && message.parts[0].text === '...';

    if (isLoadingMessage) {
        contentHTML = '<div class="typing-cursor">&nbsp;</div>';
    } else {
        const textParts = [];
        const mediaParts = [];
        message.parts.forEach(part => {
            if (part.text) {
                textParts.push(part.text);
            } else if (part.inlineData) {
                mediaParts.push(part.inlineData);
            }
        });

        if (textParts.length > 0) {
            const combinedText = textParts.join('\n');
            contentHTML = `<div>${isUser ? renderUserText(combinedText) : renderMarkdownWithFormulas(combinedText)}</div>`;
        }
        if (mediaParts.length > 0) {
            previewMediaParts = [...mediaParts];
            mediaGridHTML = renderMediaAttachmentGrid(previewMediaParts);
        }
        if (!isUser) {
            const timeString = formatTimestamp(message.createdAt);
            actionButtons = `
                        <div class="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                            <button class="copy-content-btn p-1 rounded-md hover:bg-gray-500/20 text-[var(--text-secondary)] opacity-50 hover:opacity-100 transition-opacity" title="${copyTitle}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                            <span class="text-xs text-gray-400">${timeString}</span></div>
                    `;
            contentPaddingClass = 'pb-8';
        }
    }

    const hasBubbleContent = isLoadingMessage || contentHTML.trim();
    const messageHTML = `
                <div class="message-stack ${isUser ? 'message-stack-user' : 'message-stack-model'}">
                    ${mediaGridHTML}
                    ${hasBubbleContent ? `
                        <div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative" >
                            <div class="prose prose-sm max-w-none text-[var(--text-primary)] ${contentPaddingClass} message-content">${contentHTML}</div>
                            ${actionButtons}
                        </div>
                    ` : ''}
                </div>`;

    return {
        isUser,
        messageClassName,
        messageHTML,
        previewMediaParts
    };
}
