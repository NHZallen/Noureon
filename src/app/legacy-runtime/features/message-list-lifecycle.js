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

    const renderChat = ({ animate = true, preserveScroll = false, renderMessages = true } = {}) => {
        const conversation = getActiveConversation();
        const messageList = elements.messageList;
        const chatContainer = elements.chatContainer;
        const shouldPreserveScroll = renderMessages && preserveScroll;
        const previousScrollTop = shouldPreserveScroll ? chatContainer.scrollTop : 0;
        const wasNearBottom = shouldPreserveScroll && (
            chatContainer.scrollHeight - chatContainer.clientHeight - previousScrollTop <= 16
        );
        const restoreChatPosition = () => {
            if (!shouldPreserveScroll) return;
            if (wasNearBottom) {
                if (typeof chatContainer.scrollTo === 'function') {
                    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
                } else {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
                return;
            }
            chatContainer.scrollTop = previousScrollTop;
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
            messageList.classList.remove('chat-view-transition');
            messageList.innerHTML = '';
            restoreChatPosition();
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
            setupMessageIntersectionObserver();
            restoreChatPosition();
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
