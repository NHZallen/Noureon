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
    getHistorySourceViews = () => [],
    getHistorySourceTexts = () => ({}),
    openHistorySourceConversation = () => {},
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

    // This intentionally reflects only what can change a message view. Cloud sync assigns
    // storage ids/status fields after a local response, but those fields do not alter the DOM.
    // Keeping the signature here lets a later cloud echo preserve an already-finalized stream.
    const canonicalizeForView = (value) => {
        if (Array.isArray(value)) return value.map(canonicalizeForView);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalizeForView(value[key])]));
    };

    const summarizeAssetPayload = (value) => {
        if (typeof value === 'string') {
            return {
                length: value.length,
                prefix: value.slice(0, 48),
                suffix: value.slice(-48)
            };
        }
        if (!value || typeof value !== 'object') return value;
        return {
            cloudPath: value.__astraCloudAsset?.path || value.path || null,
            type: value.__astraCloudAsset?.encoding || value.type || null
        };
    };

    const getMessagePartViewState = (part = {}) => {
        const state = {};
        if (part.text && !part.quoteContext) state.text = part.text;
        if (part.displayText !== undefined) state.displayText = part.displayText;
        if (part.imageGenerationLoading) {
            state.imageGenerationLoading = true;
            state.imageAspectRatio = part.imageAspectRatio || null;
        }
        if (part.inlineData) {
            const { data, ...inlineData } = part.inlineData;
            state.inlineData = { ...inlineData, data: summarizeAssetPayload(data) };
        }
        if (part.generatedImage) {
            const { cloudAsset, _zipRef: _ignoredZipRef, ...generatedImage } = part.generatedImage;
            state.generatedImage = { ...generatedImage, cloudAsset: summarizeAssetPayload(cloudAsset) };
        }
        if (part.quoteReference?.text) state.quoteReference = { text: part.quoteReference.text };
        return state;
    };

    const messageViewSignature = (message = {}) => {
        const serialized = JSON.stringify(canonicalizeForView({
            role: message.role || 'model',
            parts: (message.parts || []).map(getMessagePartViewState),
            historySourceConversationIds: message.metadata?.historySourceConversationIds || []
        }));
        let hash = 2166136261;
        for (let index = 0; index < serialized.length; index += 1) {
            hash ^= serialized.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `${serialized.length}:${(hash >>> 0).toString(36)}`;
    };

    const markMessageElementAsCurrent = (message, index, messageElement) => {
        if (!messageElement?.dataset) return messageElement || null;
        messageElement.dataset.messageIndex = String(index);
        messageElement.dataset.messageSignature = messageViewSignature(message);
        messageElement.__astraRenderedMessage = message;
        return messageElement;
    };

    const bindHistorySourceButtons = (messageElement, historySourceViews) => {
        messageElement?.querySelectorAll?.('[data-history-source-index]').forEach((button) => {
            button.addEventListener('click', () => {
                const source = historySourceViews[Number(button.dataset.historySourceIndex)];
                if (source?.available && source.id) openHistorySourceConversation(source.id);
            });
        });
    };

    const isActiveConversationViewCurrent = () => {
        const conversation = getActiveConversation();
        const messageList = elements.messageList;
        if (!conversation) return messageList.childElementCount === 0;
        if ((conversation.messages || []).length === 0) {
            return Boolean(messageList.querySelector('.chat-greeting-message'));
        }
        const renderedMessages = [...messageList.children]
            .filter(element => element.dataset?.messageIndex !== undefined);
        if (renderedMessages.length !== conversation.messages.length) return false;
        return conversation.messages.every((message, index) => {
            const element = renderedMessages[index];
            return element?.dataset?.messageIndex === String(index)
                && messageViewSignature(element.__astraRenderedMessage) === messageViewSignature(message);
        });
    };

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
        const historySourceViews = getHistorySourceViews(message);
        const messageView = buildMessageRenderView({
            message,
            renderUserText,
            renderMarkdownWithFormulas,
            buildMediaAttachmentView,
            formatTimestamp,
            copyTitle: getText('copyContent'),
            historySources: historySourceViews,
            historySourceTexts: getHistorySourceTexts()
        });
        messageElement.className = messageView.messageClassName;
        messageElement.innerHTML = messageView.messageHTML;
        bindHistorySourceButtons(messageElement, historySourceViews);
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
        return markMessageElementAsCurrent(message, index, messageElement);
    };

    // History sources are known before the answer starts, but a streamed
    // answer already owns this DOM node by the time it completes. Replacing
    // it made the final answer visibly blink, so only add the small disclosure
    // fragment to the existing message.
    const refreshMessageHistorySources = (messageElement, message) => {
        if (!messageElement || !message) return null;
        const historySourceViews = getHistorySourceViews(message);
        const messageView = buildMessageRenderView({
            message,
            renderUserText,
            renderMarkdownWithFormulas,
            buildMediaAttachmentView,
            formatTimestamp,
            copyTitle: getText('copyContent'),
            historySources: historySourceViews,
            historySourceTexts: getHistorySourceTexts()
        });
        const stagingElement = document.createElement('div');
        stagingElement.innerHTML = messageView.messageHTML;
        const nextReferences = stagingElement.querySelector('.history-source-references');
        const messageStack = messageElement.querySelector('.message-stack');
        messageStack?.querySelector('.history-source-references')?.remove();
        if (nextReferences && messageStack) {
            messageStack.append(nextReferences);
            bindHistorySourceButtons(nextReferences, historySourceViews);
        }
        const messageIndex = Number(messageElement.dataset?.messageIndex);
        return markMessageElementAsCurrent(
            message,
            Number.isInteger(messageIndex) ? messageIndex : 0,
            messageElement
        );
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
        isActiveConversationViewCurrent,
        markMessageElementAsCurrent,
        refreshMessageHistorySources,
        renderChat
    };
}
