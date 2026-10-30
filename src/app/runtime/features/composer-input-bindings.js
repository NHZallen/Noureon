// What the message box does as the person types: the send button's state, its height, Enter to send, the unsent text kept with the
// conversation, the box kept above a phone's keyboard, and the button that sends or stops.

import { removeLastComposerIndicatorOnDelete } from './composer-indicator-keyboard.js';
import { replySteering } from './reply-steering.js';
import { watchComposerGrowth } from './composer-growth-watch.js';

export function bindComposerInput({
    window, document, elements: ALL_ELEMENTS, setSendConfirmed, updateInputState: resolveEventsUpdateInputState, adjustTextareaHeight,
    submitChatForm, getActiveConversation, getAbortController, scheduleAnimationFrame, scheduleTimeout,
    // What a message does while a reply is running (reply-steering.js): the settings, whether the reply can be steered, and drawing the line that says a message waits.
    getConfig = () => ({}), isSteerable = () => true, renderInputIndicators = () => {}
}) {
    replySteering.configure({
        getConfig, getAbortController, submitChatForm, isSteerable,
        onChange: () => { renderInputIndicators(); resolveEventsUpdateInputState(); },
        // The message went into the reply: the box is empty again (unless the person has typed on since).
        clearDraft: (text) => {
            if (ALL_ELEMENTS.messageInput.value.trim() !== text) return;
            ALL_ELEMENTS.messageInput.value = '';
            adjustTextareaHeight();
            resolveEventsUpdateInputState();
        },
        // Messages put into the reply that it never took come back to the box (in front of what is there).
        fillDraft: (text) => {
            const current = ALL_ELEMENTS.messageInput.value;
            ALL_ELEMENTS.messageInput.value = current.trim() ? `${text}\n\n${current}` : text;
            adjustTextareaHeight();
            resolveEventsUpdateInputState();
        }
    });
    ALL_ELEMENTS.messageInput.addEventListener('input', (e) => {
        setSendConfirmed(false);
        resolveEventsUpdateInputState();
        const wrapper = e.target.closest('.input-wrapper');
        if (wrapper) {
            wrapper.classList.remove('pulse-glow');
            void wrapper.offsetWidth;
            wrapper.classList.add('pulse-glow');
        }
    });
    ALL_ELEMENTS.messageInput.addEventListener('input', adjustTextareaHeight);
    ALL_ELEMENTS.messageInput.addEventListener('composerplaceholderchange', adjustTextareaHeight);
    watchComposerGrowth({ textarea: ALL_ELEMENTS.messageInput, adjust: adjustTextareaHeight });
    ALL_ELEMENTS.expandInputButton?.addEventListener('click', () => {
        const wrapper = ALL_ELEMENTS.messageInput.closest('.input-wrapper');
        if (!wrapper) return;
        wrapper.classList.toggle('is-composer-expanded');
        adjustTextareaHeight();
        ALL_ELEMENTS.messageInput.focus();
    });
    ALL_ELEMENTS.messageInput.addEventListener('keydown', (e) => {
        const removedIndicator = removeLastComposerIndicatorOnDelete({
            event: e,
            messageInput: ALL_ELEMENTS.messageInput,
            inputIndicatorContainer: ALL_ELEMENTS.inputIndicatorContainer
        });
        if (removedIndicator) return;
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            if (getAbortController()) replySteering.press();
            else if (!ALL_ELEMENTS.submitButton.disabled) {
                submitChatForm();
            }
        }
    });
    const handleInputFocus = () => {
        if (window.visualViewport) {
            const smoothScrollToTarget = () => {
                const inputBarContainer = document.getElementById('input-bar-container');
                if (!inputBarContainer) return;

                scheduleAnimationFrame(() => {
                    const PADDING_BOTTOM = 10;
                    const inputBarRect = inputBarContainer.getBoundingClientRect();
                    // The bottom of what is seen is the top of the visual viewport plus its height (not 0 when the phone has scrolled the page for the
                    // keyboard), and the move is at once: a smooth one fights the phone's own and the box jumps.
                    const seenBottom = (Number(window.visualViewport.offsetTop) || 0) + window.visualViewport.height;
                    const offset = inputBarRect.bottom - seenBottom + PADDING_BOTTOM;

                    // Only when the box really is hidden (the app ends where the seen area ends, so it normally is not).
                    if (inputBarRect.bottom - seenBottom > 1) {
                        const newScrollPosition = window.scrollY + offset;
                        window.scrollTo({
                            top: newScrollPosition,
                            behavior: 'auto'
                        });
                    }
                });
            };

            window.visualViewport.addEventListener('resize', smoothScrollToTarget, { once: true });
        } else {
            scheduleTimeout(() => {
                const inputBarContainer = document.getElementById('input-bar-container');
                if (inputBarContainer) {
                    inputBarContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }, 300);
        }
    };

    ALL_ELEMENTS.messageInput.addEventListener('focus', handleInputFocus);

    ALL_ELEMENTS.messageInput.addEventListener('input', () => {
        const conv = getActiveConversation();
        if (conv) {
            conv.unsentMessage = ALL_ELEMENTS.messageInput.value;
        }
    });
    ALL_ELEMENTS.submitButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (getAbortController()) {
            // With something in the box the press goes to what the person chose (steer, queue, send now); with nothing it stops the reply.
            if (replySteering.press()) return;
            replySteering.cancelQueue();
            try { getAbortController().abort(); } catch {}
        } else if (!ALL_ELEMENTS.submitButton.disabled) {
            submitChatForm();
        }
    });
}
