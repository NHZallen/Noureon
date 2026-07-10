const resolveImageAspectRatio = (requestedRatio) => ({
    '1:1': '1 / 1', '16:9': '16 / 9', '9:16': '9 / 16', '4:3': '4 / 3', '3:4': '3 / 4',
    '3:2': '3 / 2', '2:3': '2 / 3', '4:5': '4 / 5', '5:4': '5 / 4',
    '1:2': '1 / 2', '2:1': '2 / 1', '1:4': '1 / 4', '4:1': '4 / 1',
    '1:8': '1 / 8', '8:1': '8 / 1', '9:21': '9 / 21', '21:9': '21 / 9'
}[requestedRatio] || '');

export function buildMessageRenderView({
    message,
    renderUserText,
    renderMarkdownWithFormulas,
    buildMediaAttachmentView,
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
    let generatedImageAssets = [];
    let generatedImageHTML = '';
    let userActionButtons = '';
    let quoteReferenceHTML = '';
    const isImageGenerationLoading = !isUser && message.parts.some(part => part.imageGenerationLoading);
    const isLoadingMessage = !isUser && message.parts.length === 1 && message.parts[0].text === '...';

    if (isImageGenerationLoading) {
        const requestedRatio = message.parts.find(part => part.imageGenerationLoading)?.imageAspectRatio;
        const imageAspectRatio = resolveImageAspectRatio(requestedRatio) || '1 / 1';
        generatedImageHTML = `
            <div class="generated-image-stage message-content" data-image-generation-stage>
                <div class="generated-image-skeleton generated-image-skeleton-sized" role="status" aria-live="polite" data-target-aspect-ratio="${requestedRatio || '1:1'}" style="aspect-ratio: ${imageAspectRatio}">
                    <span>正在建立圖像</span>
                    <div class="generated-image-skeleton-shimmer"></div>
                </div>
            </div>`;
    } else if (isLoadingMessage) {
        contentHTML = '<div class="typing-cursor">&nbsp;</div>';
    } else {
        const textParts = [];
        const mediaParts = [];
        message.parts.forEach(part => {
            if (part.text && !part.quoteContext) {
                textParts.push(isUser ? (part.displayText ?? part.text) : part.text);
            } else if (part.inlineData) {
                mediaParts.push(part.inlineData);
            } else if (part.generatedImage) {
                generatedImageAssets.push(part.generatedImage);
            }
        });

        if (textParts.length > 0) {
            const combinedText = textParts.join('\n');
            contentHTML = `<div>${isUser ? renderUserText(combinedText) : renderMarkdownWithFormulas(combinedText)}</div>`;
        }
        if (mediaParts.length > 0) {
            const mediaView = buildMediaAttachmentView(mediaParts);
            previewMediaParts = mediaView.previewMediaParts;
            mediaGridHTML = mediaView.html;
        }
        if (generatedImageAssets.length > 0) {
            generatedImageHTML = generatedImageAssets.map(asset => {
                const imageAspectRatio = resolveImageAspectRatio(asset.aspectRatio);
                return `
                <figure class="generated-image-card${imageAspectRatio ? ' has-known-aspect' : ''}" data-generated-image-card="${asset.id}"${imageAspectRatio ? ` style="aspect-ratio: ${imageAspectRatio}"` : ''}>
                    <button type="button" class="generated-image-preview-btn" data-generated-image-preview="${asset.id}" aria-label="預覽生成圖片">
                        <img data-generated-image-id="${asset.id}" alt="AI 生成圖片" loading="lazy">
                    </button>
                    <div class="generated-image-actions">
                        <button type="button" data-generated-image-edit="${asset.id}" class="generated-image-action-btn generated-image-edit-btn">
                            <span>編輯</span>
                        </button>
                        <a data-generated-image-download="${asset.id}" class="generated-image-action-btn generated-image-download-btn" title="下載原始圖片" aria-label="下載原始圖片">
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                        </a>
                    </div>
                </figure>`;
            }).join('');
        }
        if (!isUser && generatedImageAssets.length === 0) {
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
        const quoteReference = isUser
            ? message.parts.find(part => part.quoteReference)?.quoteReference
            : null;
        if (quoteReference?.text) {
            quoteReferenceHTML = `
                <button type="button" class="sent-message-quote" data-quote-reference>
                    <span class="sent-message-quote-text">${renderUserText(quoteReference.text)}</span>
                </button>`;
        }
        if (isUser) {
            userActionButtons = `
                <div class="user-message-actions" aria-label="訊息操作">
                    <button type="button" class="user-message-action" data-message-action="copy" title="複製訊息" aria-label="複製訊息">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><defs><mask id="user-message-copy-mask-${message.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="white"></rect><rect x="3" y="8" width="13" height="13" rx="2" fill="black"></rect></mask></defs><rect x="8" y="3" width="13" height="13" rx="2" mask="url(#user-message-copy-mask-${message.id})"></rect><rect x="3" y="8" width="13" height="13" rx="2"></rect></svg>
                    </button>
                    <button type="button" class="user-message-action" data-message-action="edit" title="編輯訊息" aria-label="編輯訊息">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                    </button>
                </div>`;
        }
    }

    const hasBubbleContent = isLoadingMessage || contentHTML.trim();
    const imageStackClass = generatedImageHTML ? ' image-message-stack' : '';
    const quoteStackClass = quoteReferenceHTML ? ' message-stack-has-quote' : '';
    const messageHTML = `
                <div class="message-stack ${isUser ? 'message-stack-user' : 'message-stack-model'}${imageStackClass}${quoteStackClass}">
                    ${mediaGridHTML}
                    ${generatedImageHTML}
                    ${quoteReferenceHTML}
                    ${hasBubbleContent ? `
                        <div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative" >
                            <div class="prose prose-sm max-w-none text-[var(--text-primary)] ${contentPaddingClass} message-content">${contentHTML}</div>
                            ${actionButtons}
                        </div>
                    ` : ''}
                    ${userActionButtons}
                </div>`;

    return {
        isUser,
        messageClassName,
        messageHTML,
        previewMediaParts,
        generatedImageAssets
    };
}
