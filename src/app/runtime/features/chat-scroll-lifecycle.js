// The scrolling of a conversation: the button that goes down to the latest message, and the outline beside the messages that marks the
// one being read.

export function createChatScrollLifecycle({ elements: ALL_ELEMENTS, requestAnimationFrame, setTimeout, clearTimeout, ResizeObserver, IntersectionObserver }) {
    // Whether the button is taking the conversation down to its latest message, and the watcher of the messages in view.
    let autoScrolling = false;
    let messageObserver = null;
    const disconnectMessageObserver = () => {
        messageObserver?.disconnect();
        messageObserver = null;
    };
    const setupScrollToBottomButton = () => {
        const { scrollToBottomBtn, chatContainer } = ALL_ELEMENTS;
        const updateScrollButtonVisibility = () => {
            const bottomDistance = Math.max(0, chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight);
            scrollToBottomBtn.classList.toggle('visible', bottomDistance > 8);
        };
        let scrollButtonFrame = null;
        const scheduleScrollButtonUpdate = () => {
            if (autoScrolling || scrollButtonFrame !== null) return;
            scrollButtonFrame = requestAnimationFrame(() => {
                scrollButtonFrame = null;
                updateScrollButtonVisibility();
            });
        };
        scrollToBottomBtn.addEventListener('click', () => {
            autoScrolling = true;
            scrollToBottomBtn.classList.remove('visible');
            scrollToBottomBtn.classList.add('jelly-animate');
            scrollToBottomBtn.addEventListener('animationend', () => {
                scrollToBottomBtn.classList.remove('jelly-animate');
            }, { once: true });
            chatContainer.scrollTo({
                top: chatContainer.scrollHeight,
                behavior: 'smooth'
            });
            const scrollEndTimer = setTimeout(() => {
                autoScrolling = false;
                updateScrollButtonVisibility();
            }, 1000);
            const interruptHandler = () => {
                clearTimeout(scrollEndTimer);
                autoScrolling = false;
                scheduleScrollButtonUpdate();
                chatContainer.removeEventListener('wheel', interruptHandler);
                chatContainer.removeEventListener('touchstart', interruptHandler);
            };
            chatContainer.addEventListener('wheel', interruptHandler, { once: true });
            chatContainer.addEventListener('touchstart', interruptHandler, { once: true });
        });
        chatContainer.addEventListener('scroll', scheduleScrollButtonUpdate, { passive: true });
        chatContainer.addEventListener('wheel', scheduleScrollButtonUpdate, { passive: true });
        chatContainer.addEventListener('touchend', scheduleScrollButtonUpdate, { passive: true });
        updateScrollButtonVisibility();
        // Opening another chat or a new one swaps the messages without a scroll event when the old scroll position
        // no longer exists, so the button would stay up over a chat that has nothing below it. Watch the content
        // and the scroller's size as well.
        if (typeof ResizeObserver === 'function') {
            const contentSizeObserver = new ResizeObserver(scheduleScrollButtonUpdate);
            contentSizeObserver.observe(chatContainer);
            if (ALL_ELEMENTS.messageList) contentSizeObserver.observe(ALL_ELEMENTS.messageList);
        }
        if (typeof MutationObserver === 'function' && ALL_ELEMENTS.messageList) {
            new MutationObserver(scheduleScrollButtonUpdate).observe(ALL_ELEMENTS.messageList, { childList: true });
        }

        // ✨ 這是核心修正 ✨
        const updateButtonPosition = () => {
            const { inputBarContainer, scrollToBottomBtn } = ALL_ELEMENTS;
            const inputBarHeight = inputBarContainer.offsetHeight;
            const totalBottomOffset = inputBarHeight + 16; // 簡化計算
            scrollToBottomBtn.style.bottom = `${totalBottomOffset}px`;
        };

        const resizeObserver = new ResizeObserver(updateButtonPosition);
        resizeObserver.observe(ALL_ELEMENTS.inputBarContainer);
        updateButtonPosition();
    };
    // Watches the messages of the conversation and marks the item of the outline beside them that belongs to the one most in view.
    function setupMessageIntersectionObserver() {
        // 如果之前有觀察者，先斷開連接，避免重複觀察
        disconnectMessageObserver();

        const messageItems = ALL_ELEMENTS.messageList.querySelectorAll('.message-item');
        const historyItems = ALL_ELEMENTS.historySidebarList.querySelectorAll('.history-sidebar-item');

        // 如果沒有訊息，就不用觀察了
        if (messageItems.length === 0) {
            return;
        }

        // 觀察者的回呼函式，當有元素進入或離開視窗時會被觸發
        const observerCallback = (entries) => {
            let mostVisibleEntry = null;

            // 找出所有可見的 entry 中，可見比例最高的那個
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    if (!mostVisibleEntry || entry.intersectionRatio > mostVisibleEntry.intersectionRatio) {
                        mostVisibleEntry = entry;
                    }
                }
            }

            // 如果找到了最可見的訊息
            if (mostVisibleEntry) {
                const visibleMessageIndex = mostVisibleEntry.target.dataset.messageIndex;

                // 移除所有歷史項目上的 'active' class
                historyItems.forEach(item => {
                    item.classList.remove('active');
                });

                // 找到對應的歷史項目並加上 'active' class
                const activeHistoryItem = ALL_ELEMENTS.historySidebarList.querySelector(`.history-sidebar-item[data-message-index="${visibleMessageIndex}"]`);
                if (activeHistoryItem) {
                    activeHistoryItem.classList.add('active');
                }
            }
        };

        // 建立觀察者實例
        messageObserver = new IntersectionObserver(observerCallback, {
            root: ALL_ELEMENTS.chatContainer, // 觀察的根元素是聊天容器
            rootMargin: '0px',
            threshold: [0.0, 0.25, 0.5, 0.75, 1.0] // 在不同可見比例時都觸發回呼
        });

        // 開始觀察每一則訊息
        messageItems.forEach(item => {
            messageObserver.observe(item);
        });
    }
    return {
        setupScrollToBottomButton,
        setupMessageIntersectionObserver,
        disconnectMessageObserver,
        isAutoScrolling: () => autoScrolling
    };
}
