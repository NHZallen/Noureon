// The buttons inside the list of messages, handled by one listener on the list: copying and editing a message of the person, copying the
// code of a step, opening a page a reply found, the citation labels and the "Sources" button, and copying a reply.

import { codeOfCard } from '../../ui/sandbox/run-code-card.js';
import { openSourceUrl } from '../../ui/sandbox/run-sources.js';
import { fillMemoryRow, openReplySources } from './reply-sources-actions.js';
import { copyableAnswerText, sourcesOfPill } from '../../ui/citations/citation-pills.js';
import { openSourceSheet } from '../../ui/citations/source-sheet.js';

export function bindMessageListActions({ window, document, elements: ALL_ELEMENTS, i18n, config, getConfig, getActiveConversation, copyTextToClipboard, showNotification, startMessageEditing, logger }) {
    ALL_ELEMENTS.messageList.addEventListener('click', (e) => {
        const userAction = e.target.closest('[data-message-action]');
        if (userAction) {
            const messageItem = userAction.closest('.message-item');
            const messageIndex = Number(messageItem?.dataset.messageIndex);
            const conv = getActiveConversation();
            const message = conv?.messages?.[messageIndex];
            if (!message || message.role !== 'user') return;
            if (userAction.dataset.messageAction === 'copy') {
                const textToCopy = message.parts
                .filter(part => part.text && !part.quoteContext)
                .map(part => part.displayText ?? part.text)
                .join('\n');
                copyTextToClipboard(textToCopy)
                .then(() => showNotification(i18n[config.uiLanguage].copySuccess || '已複製訊息。', 'success'))
                .catch(() => showNotification(i18n[config.uiLanguage].copyFailed || '無法複製訊息。', 'error'));
            } else if (userAction.dataset.messageAction === 'edit') {
                startMessageEditing(messageIndex);
            }
            return;
        }
        // The copy button on the code card of a process step (live or saved).
        const codeCopy = e.target.closest('.run-code-copy');
        if (codeCopy) {
            copyTextToClipboard(codeOfCard(codeCopy))
            .then(() => showNotification(i18n[config.uiLanguage].copySuccess || '已複製。', 'success'))
            .catch(() => showNotification(i18n[config.uiLanguage].copyFailed || '複製失敗。', 'error'));
            return;
        }
        // A page the reply's web search found: opened in a new tab, as it is.
        const sourceChip = e.target.closest('.run-source-chip');
        if (sourceChip) {
            openSourceUrl(sourceChip.dataset.url, (...args) => window.open(...args));
            return;
        }
        // A label that cites sources inside an answer: one source opens its page, several rise as a sheet.
        const citePill = e.target.closest('.cite-pill');
        if (citePill) {
            const cited = sourcesOfPill(citePill);
            if (cited.length === 1) openSourceUrl(cited[0].url, (...args) => window.open(...args));
            else if (cited.length) openSourceSheet({ document, sources: cited, language: getConfig().uiLanguage });
            return;
        }
        // The "Sources" button under a reply: its sources in the right-hand panel on a wide screen, as a sheet on a phone.
        const sourcesButton = e.target.closest('[data-sources-button]');
        if (sourcesButton) {
            const item = sourcesButton.closest('.message-item');
            const reply = getActiveConversation()?.messages?.[parseInt(item?.dataset.messageIndex, 10)];
            openReplySources({ window, document, message: reply, language: getConfig().uiLanguage, i18n });
            return;
        }
        // A memory step ("Recalled 2 notes") is filled with its notes or conversations when it is about to open; a conversation in it can be opened.
        const memoryRow = e.target.closest('summary')?.parentElement;
        if (memoryRow?.dataset?.memoryItems && !memoryRow.open) fillMemoryRow({ document, row: memoryRow, language: getConfig().uiLanguage });
        const openChat = e.target.closest('[data-open-chat]');
        if (openChat) {
            document.dispatchEvent(new window.CustomEvent('noureon:open-history-source', { detail: { id: openChat.dataset.openChat } }));
            return;
        }
        const copyBtn = e.target.closest('.copy-content-btn');
        if (copyBtn) {
            const messageItem = copyBtn.closest('.message-item');
            if (messageItem) {
                const messageIndex = parseInt(messageItem.dataset.messageIndex);
                const conv = getActiveConversation();
                const msg = conv?.messages[messageIndex];
                if (msg && msg.role === 'model') {
                    // What was said, without the record of what the model did and without the citation markers.
                    const textToCopy = copyableAnswerText(msg);
                    copyTextToClipboard(textToCopy)
                    .then(() => showNotification(i18n[config.uiLanguage].copySuccess || '內容已複製！', 'success'))
                    .catch(err => {
                        showNotification(i18n[config.uiLanguage].copyFailed || '複製失敗！瀏覽器可能限制了此功能。', 'error');
                        logger.error('Could not copy text with any method: ', err);
                    });
                }
            }
        }
    });
}
