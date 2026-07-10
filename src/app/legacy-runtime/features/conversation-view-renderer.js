export function createConversationViewRenderer({
    document,
    renderUserText,
    renderModelText,
    renderMediaAttachmentGrid,
    bindMediaPreviewButtons,
    mediaMode = 'wrapped',
    wrapTextParts = false
}) {
    const selectMediaParts = (message) => {
        if (mediaMode === 'inlineData') {
            return message.parts
                .filter(part => !part.text && part.inlineData)
                .map(part => part.inlineData);
        }
        return message.parts.filter(part => (
            part.inlineData || part.fileData || part.video_url || part.image_url || part.file
        ));
    };

    const renderTextParts = (message, isUser) => message.parts
        .filter(part => part.text && !part.quoteContext)
        .map(part => {
            const text = isUser ? (part.displayText ?? part.text) : part.text;
            const rendered = isUser ? renderUserText(text) : renderModelText(text);
            return wrapTextParts ? `<div>${rendered}</div>` : rendered;
        })
        .join('');

    const renderConversationMessages = ({ conversation, contentContainer, emptyHTML }) => {
        if (!conversation) return false;
        contentContainer.innerHTML = '';
        if (conversation.messages.length === 0) {
            contentContainer.innerHTML = emptyHTML;
            return true;
        }

        conversation.messages.forEach(message => {
            const isUser = message.role === 'user';
            const messageElement = document.createElement('div');
            messageElement.className = `flex items-start gap-2 md:gap-4 ${isUser ? 'justify-end user-message' : 'model-message'}`;
            const mediaParts = selectMediaParts(message);
            const contentHTML = renderTextParts(message, isUser);
            const mediaGridHTML = renderMediaAttachmentGrid(mediaParts);
            const messageBubble = contentHTML.trim()
                ? `<div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble"><div class="prose prose-sm max-w-none message-content text-[var(--text-primary)]">${contentHTML}</div></div>`
                : '';
            messageElement.innerHTML = `<div class="message-stack ${isUser ? 'message-stack-user' : 'message-stack-model'}">${mediaGridHTML}${messageBubble}</div>`;
            bindMediaPreviewButtons(messageElement, mediaParts);
            contentContainer.appendChild(messageElement);
        });
        return true;
    };

    return {
        renderConversationMessages
    };
}
