export function createMessageListLifecycle({
    document,
    elements,
    getActiveConversation,
    getAutoNaming,
    getCurrentUserName,
    getText,
    buildMessageRenderView,
    buildMediaAttachmentView,
    renderUserText,
    renderMarkdownWithFormulas,
    formatTimestamp,
    bindMediaPreviewButtons,
    bindGeneratedImageAssets = async () => {},
    saveAppData,
    renderModelSwitcher,
    renderInputIndicators,
    renderCouncilControls,
    setupMessageIntersectionObserver,
    updateInputState,
    scheduleFrame,
    isAutoScrolling,
    logError = (...args) => console.error(...args)
}) {
    let renderSequence = 0;
    let clearPendingBottomAnchor = () => {};

    const scrollChatToBottom = () => {
        elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    };

    const keepBottomAnchoredWhileMediaLoads = ({ messageList, renderToken }) => {
        const pendingMedia = new Set(Array.from(messageList.querySelectorAll('img, video')).filter(media => (
            media.tagName === 'IMG'
                ? (!media.complete || (media.hasAttribute('data-generated-image-id') && !media.hasAttribute('src')))
                : media.readyState < 1
        )));
        if (pendingMedia.size === 0) return;

        const chatContainer = elements.chatContainer;
        const eventNames = ['load', 'loadedmetadata', 'error'];
        const controller = new AbortController();
        const cancel = () => {
            pendingMedia.clear();
            controller.abort();
        };
        const handleReaderScroll = () => {
            if (chatContainer.scrollHeight - chatContainer.clientHeight - chatContainer.scrollTop > 48) cancel();
        };
        const settleMedia = ({ target }) => {
            if (!pendingMedia.delete(target)) return;
            if (renderToken === renderSequence) scrollChatToBottom();
            if (pendingMedia.size === 0) cancel();
        };
        eventNames.forEach(eventName => messageList.addEventListener(eventName, settleMedia, {
            capture: true,
            signal: controller.signal
        }));
        chatContainer.addEventListener('scroll', handleReaderScroll, { signal: controller.signal });
        clearPendingBottomAnchor = cancel;
    };

    const addMessageToUI = (message, index, shouldSave = true, shouldScroll = true) => {
        const conversation = getActiveConversation();
        if (shouldSave) {
            conversation.messages.push(message);
            if (
                conversation.messages.length === 1
                && message.role === 'user'
                && conversation.isTemporary
                && !conversation.isRenamed
                && getAutoNaming()
            ) {
                const textPart = message.parts.find(part => part.text);
                if (textPart) {
                    conversation.title = textPart.text.substring(0, 30) || getText('newChat') || '新對話';
                    elements.headerTitle.textContent = conversation.title;
                }
            }
            void saveAppData().catch(error => logError('Failed to save message state:', error));
        }

        const messageElement = document.createElement('div');
        messageElement.dataset.messageIndex = index;
        const messageView = buildMessageRenderView({
            message,
            renderUserText,
            renderMarkdownWithFormulas,
            buildMediaAttachmentView,
            formatTimestamp,
            copyTitle: getText('copyContent')
        });
        messageElement.className = messageView.messageClassName;
        messageElement.innerHTML = messageView.messageHTML;
        bindMediaPreviewButtons(messageElement, messageView.previewMediaParts);
        void bindGeneratedImageAssets(messageElement, messageView.generatedImageAssets || [])
            .catch(error => logError('Failed to bind generated image assets:', error));
        if (elements.messageList.querySelector('.text-center')) {
            elements.messageList.innerHTML = '';
        }
        elements.messageList.appendChild(messageElement);
        if (shouldScroll && isAutoScrolling()) {
            elements.chatContainer.scrollTo({
                top: elements.chatContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
        return messageElement;
    };

    const renderChat = ({ animate = true, scrollMode = 'none', renderMessages = true } = {}) => {
        const conversation = getActiveConversation();
        const messageList = elements.messageList;
        const chatContainer = elements.chatContainer;
        const shouldPreserveScroll = scrollMode === 'preserve';
        const previousScrollTop = shouldPreserveScroll ? chatContainer.scrollTop : 0;
        const wasNearBottom = shouldPreserveScroll && (
            chatContainer.scrollHeight - chatContainer.clientHeight - previousScrollTop <= 16
        );
        const applyChatPosition = () => {
            if (scrollMode === 'bottom' || wasNearBottom) {
                scrollChatToBottom();
                return;
            }
            if (shouldPreserveScroll) chatContainer.scrollTop = previousScrollTop;
        };
        if (!conversation) {
            elements.headerTitle.textContent = getText('newChat');
            elements.modelSwitcherContainer.innerHTML = '';
            renderInputIndicators();
            renderCouncilControls();
            if (!renderMessages) {
                updateInputState();
                return;
            }
            renderSequence += 1;
            clearPendingBottomAnchor();
            messageList.classList.remove('chat-view-transition');
            messageList.innerHTML = '';
            return;
        }

        elements.headerTitle.textContent = conversation.archived
            ? `(${getText('archived')}) ${conversation.title}`
            : conversation.title;
        renderModelSwitcher();
        renderInputIndicators();
        renderCouncilControls();
        if (!renderMessages) {
            updateInputState();
            return;
        }
        const renderToken = ++renderSequence;
        clearPendingBottomAnchor();
        messageList.classList.remove('chat-view-transition');
        messageList.innerHTML = '';
        if (conversation.messages.length === 0) {
            const greeting = `${getCurrentUserName()}, ${getText('howCanIHelp')}`;
            messageList.innerHTML = `<div class="text-center text-[var(--text-primary)] mt-16 chat-greeting-message"><p class="text-2xl font-semibold">${greeting}</p></div>`;
        } else {
            conversation.messages.forEach((message, index) => {
                addMessageToUI(message, index, false, false);
            });
        }
        scheduleFrame(() => {
            if (renderToken !== renderSequence) return;
            setupMessageIntersectionObserver();
            applyChatPosition();
            if (scrollMode === 'bottom' || wasNearBottom) {
                keepBottomAnchoredWhileMediaLoads({ messageList, renderToken });
            }
        });
        if (animate) {
            void messageList.offsetWidth;
            messageList.classList.add('chat-view-transition');
        }
        updateInputState();
    };

    return {
        addMessageToUI,
        renderChat
    };
}
