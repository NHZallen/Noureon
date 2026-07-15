export function createConversationViewRenderer({
    document,
    renderUserText,
    renderModelText,
    renderMediaAttachmentGrid,
    bindMediaPreviewButtons,
    bindGeneratedImageAssets = async () => {},
    mediaMode = 'wrapped',
    wrapTextParts = false,
    scheduleFrame = callback => requestAnimationFrame(callback),
    logError = (...args) => console.error(...args)
}) {
    let clearBottomAnchor = () => {};

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

    const resolveImageAspectRatio = (requestedRatio) => ({
        '1:1': '1 / 1', '16:9': '16 / 9', '9:16': '9 / 16', '4:3': '4 / 3', '3:4': '3 / 4',
        '3:2': '3 / 2', '2:3': '2 / 3', '4:5': '4 / 5', '5:4': '5 / 4',
        '1:2': '1 / 2', '2:1': '2 / 1', '1:4': '1 / 4', '4:1': '4 / 1',
        '1:8': '1 / 8', '8:1': '8 / 1', '9:21': '9 / 21', '21:9': '21 / 9'
    }[requestedRatio] || '');

    const renderGeneratedImages = (assets) => assets.map(asset => {
        const imageAspectRatio = resolveImageAspectRatio(asset.aspectRatio);
        return `
            <figure class="generated-image-card${imageAspectRatio ? ' has-known-aspect' : ''}" data-generated-image-card="${asset.id}"${imageAspectRatio ? ` style="aspect-ratio: ${imageAspectRatio}"` : ''}>
                <button type="button" class="generated-image-preview-btn" data-generated-image-preview="${asset.id}" aria-label="預覽 AI 生成圖片">
                    <img data-generated-image-id="${asset.id}" alt="AI 生成圖片" loading="lazy">
                </button>
                <div class="generated-image-actions">
                    <a data-generated-image-download="${asset.id}" class="generated-image-action-btn generated-image-download-btn" title="下載 AI 生成圖片" aria-label="下載 AI 生成圖片">
                        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                    </a>
                </div>
            </figure>`;
    }).join('');

    const renderConversationMessages = ({ conversation, contentContainer, emptyHTML }) => {
        if (!conversation) return false;
        clearBottomAnchor();
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
            const generatedImageAssets = message.parts
                .map(part => part.generatedImage)
                .filter(Boolean);
            const contentHTML = renderTextParts(message, isUser);
            const mediaGridHTML = renderMediaAttachmentGrid(mediaParts);
            const generatedImageHTML = renderGeneratedImages(generatedImageAssets);
            const messageBubble = contentHTML.trim()
                ? `<div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble"><div class="prose prose-sm max-w-none message-content text-[var(--text-primary)]">${contentHTML}</div></div>`
                : '';
            messageElement.innerHTML = `<div class="message-stack ${isUser ? 'message-stack-user' : 'message-stack-model'}${generatedImageHTML ? ' image-message-stack' : ''}">${mediaGridHTML}${generatedImageHTML}${messageBubble}</div>`;
            bindMediaPreviewButtons(messageElement, mediaParts);
            void Promise.resolve(bindGeneratedImageAssets(messageElement, generatedImageAssets))
                .catch(error => logError('Failed to bind generated image assets in conversation preview:', error));
            contentContainer.appendChild(messageElement);
        });
        return true;
    };

    const anchorToBottom = (contentContainer) => {
        clearBottomAnchor();
        const controller = new AbortController();
        const pendingMedia = new Set(Array.from(contentContainer.querySelectorAll('img, video')).filter(media => (
            media.tagName === 'IMG'
                ? (!media.complete || (media.hasAttribute('data-generated-image-id') && !media.hasAttribute('src')))
                : media.readyState < 1
        )));
        const scrollToBottom = () => {
            if (!controller.signal.aborted) contentContainer.scrollTop = contentContainer.scrollHeight;
        };
        const cancel = () => {
            pendingMedia.clear();
            controller.abort();
        };
        const handleReaderScroll = () => {
            if (contentContainer.scrollHeight - contentContainer.clientHeight - contentContainer.scrollTop > 48) cancel();
        };
        const settleMedia = ({ target }) => {
            if (!pendingMedia.delete(target)) return;
            scrollToBottom();
            if (pendingMedia.size === 0) cancel();
        };
        if (pendingMedia.size > 0) {
            ['load', 'loadedmetadata', 'error'].forEach(eventName => contentContainer.addEventListener(
                eventName,
                settleMedia,
                { capture: true, signal: controller.signal }
            ));
        }
        scheduleFrame(() => {
            scrollToBottom();
            if (pendingMedia.size === 0) {
                cancel();
                return;
            }
            contentContainer.addEventListener('scroll', handleReaderScroll, { signal: controller.signal });
        });
        clearBottomAnchor = cancel;
    };

    return {
        renderConversationMessages,
        anchorToBottom
    };
}
