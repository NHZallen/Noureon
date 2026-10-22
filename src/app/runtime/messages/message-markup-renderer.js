import { skillMark, toolIconMarkup } from '../../ui/cli/cli-icons.js';
import { getCliTool } from '../../../data/cli-catalog.js';
import { renderComposerToolIcon } from '../../composer-tool-icons.js';
import { renderLinkChipHTML, splitAtAddresses } from '../../ui/links/link-chip.js';
import { registerSandboxFileParts } from '../../ui/sandbox/sandbox-files.js';
import { withRunFilesListed } from '../../ui/sandbox/sandbox-run-block.js';
import { replySourcesButtonHTML } from '../../ui/citations/citation-pills.js';
import { imageThumbsPlaceholder } from '../../ui/image-wait/image-wait-markup.js';
import { renderGeneratedImageSet } from '../images/generated-image-set.js';

const resolveImageAspectRatio = (requestedRatio) => ({
    '1:1': '1 / 1', '16:9': '16 / 9', '9:16': '9 / 16', '4:3': '4 / 3', '3:4': '3 / 4',
    '3:2': '3 / 2', '2:3': '2 / 3', '4:5': '4 / 5', '5:4': '5 / 4', '7:5': '7 / 5', '5:7': '5 / 7',
    '1:2': '1 / 2', '2:1': '2 / 1', '1:4': '1 / 4', '4:1': '4 / 1',
    '1:8': '1 / 8', '8:1': '8 / 1', '9:21': '9 / 21', '21:9': '21 / 9'
}[requestedRatio] || '');

const escapeHTML = (value = '') => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const historySourceLabel = (template, count) => String(template || '')
    .replace('{count}', String(count));

const COMPOSER_MODE_ICONS = {
    'search-indicator': renderComposerToolIcon('webSearch', 'sent-composer-mode-icon'),
    'learning-mode-indicator': renderComposerToolIcon('learning', 'sent-composer-mode-icon'),
    'deep-research-indicator': renderComposerToolIcon('deepResearch', 'sent-composer-mode-icon'),
    'research-plan-indicator': renderComposerToolIcon('deepResearch', 'sent-composer-mode-icon'),
    'astras-input-indicator': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z"></path></svg>'
};

// A web address in the user's text is shown as the site's icon and a short link.
const renderUserTextWithLinks = (text, renderUserText) => splitAtAddresses(text)
    .map((piece) => (piece.url ? renderLinkChipHTML(piece.url) : renderUserText(piece.text)))
    .join('');

const renderUserComposerPart = (part, renderUserText) => {
    if (!Array.isArray(part.displaySegments)) {
        return renderUserTextWithLinks(part.displayText ?? part.text, renderUserText);
    }
    return part.displaySegments.map((segment) => {
        if (segment?.type === 'link') return segment.url ? renderLinkChipHTML(segment.url) : '';
        if (segment?.type !== 'mode') return renderUserTextWithLinks(segment?.text || '', renderUserText);
        const icon = COMPOSER_MODE_ICONS[segment.indicatorId] || (String(segment.indicatorId || '').startsWith('cli-indicator-') ? toolIconMarkup(getCliTool(String(segment.indicatorId).slice('cli-indicator-'.length)), 16, 'sent-composer-mode-icon') : (String(segment.indicatorId || '').startsWith('skill-indicator-') ? skillMark(String(segment.indicatorId).slice('skill-indicator-'.length), segment.label, 16, 'sent-composer-mode-icon') : ''));
        if (!icon) return '';
        return `<span class="sent-composer-mode" data-composer-mode="${escapeHTML(segment.indicatorId)}">${icon}<span>${escapeHTML(segment.label)}</span></span>`;
    }).join('');
};

export function buildMessageRenderView({
    message,
    renderUserText,
    renderMarkdownWithFormulas,
    buildMediaAttachmentView,
    formatTimestamp,
    copyTitle,
    uiLanguage = 'zh-TW',
    // The words of the buttons and notes the message carries (from the interface texts of the language in use).
    labels = {},
    historySources = [],
    historySourceTexts = {},
    // The note of a visual check that failed or was stopped offers to check its files again (vision-retry-state.js decides).
    visionRetry = false
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
    let historySourcesHTML = '';
    // A reply the automatic visual check asked for is marked, so it does not read as an answer to the user.
    let autoNoteHTML = '';
    let researchCard = false;
    const isImageGenerationLoading = !isUser && message.parts.some(part => part.imageGenerationLoading);
    const isLoadingMessage = !isUser && message.parts.length === 1 && message.parts[0].text === '...';

    if (isImageGenerationLoading) {
        const loadingPart = message.parts.find(part => part.imageGenerationLoading);
        const requestedRatio = loadingPart?.imageAspectRatio;
        const imageAspectRatio = resolveImageAspectRatio(requestedRatio) || '1 / 1';
        // The dots and the words of the stages are drawn by ui/image-wait/image-wait.js, which the message list loads when it shows this place-holder.
        generatedImageHTML = `
            <div class="generated-image-stage message-content" data-image-generation-stage>
                <div class="generated-image-skeleton generated-image-skeleton-sized" role="status" aria-live="polite" data-target-aspect-ratio="${requestedRatio || '1:1'}" style="aspect-ratio: ${imageAspectRatio}">
                    <span class="generated-image-wait-label"></span><noureon-image-wait${Number(loadingPart?.imageStartedAt) > 0 ? ` data-started="${Math.round(Number(loadingPart.imageStartedAt))}"` : ''} aria-hidden="true"></noureon-image-wait>
                </div>
                ${imageThumbsPlaceholder(loadingPart?.imageCount)}
            </div>`;
    } else if (isLoadingMessage) {
        contentHTML = '<div class="typing-cursor">&nbsp;</div>';
    } else {
        const textParts = [];
        const mediaParts = [];
        message.parts.forEach(part => {
            if (part.text && !part.quoteContext) {
                textParts.push(isUser ? part : part.text);
            } else if (part.inlineData) {
                mediaParts.push(part.inlineData);
            } else if (part.generatedImage) {
                generatedImageAssets.push(part.generatedImage);
            }
        });

        if (textParts.length > 0) {
            if (isUser) {
                const hasComposerModes = textParts.some(part => Array.isArray(part.displaySegments));
                const renderedUserText = hasComposerModes
                    ? textParts.map(part => renderUserComposerPart(part, renderUserText)).join('<br>')
                    : renderUserTextWithLinks(textParts.map(part => part.displayText ?? part.text).join('\n'), renderUserText);
                contentHTML = `<div>${renderedUserText}</div>`;
            } else {
                // Files made in Advanced mode are parts; their cards come from the text.
                registerSandboxFileParts(message.parts);
                contentHTML = `<div>${renderMarkdownWithFormulas(withRunFilesListed(textParts.join('\n'), message.parts))}</div>`;
            }
        }
        // A deep research is a card (ui/research/), drawn into this place once the message is on the page.
        if (!isUser && message.parts.some(part => part.researchPlan || part.researchReport)) {
            researchCard = true;
            contentHTML = '<div class="research-card-host" data-research-card></div>';
        }
        if (mediaParts.length > 0) {
            const mediaView = buildMediaAttachmentView(mediaParts);
            previewMediaParts = mediaView.previewMediaParts;
            mediaGridHTML = mediaView.html;
        }
        if (generatedImageAssets.length > 0) {
            const generatedImageCards = generatedImageAssets.map(asset => {
                const imageAspectRatio = resolveImageAspectRatio(asset.aspectRatio);
                return `
                <figure class="generated-image-card${imageAspectRatio ? ' has-known-aspect' : ''}" data-generated-image-card="${asset.id}"${imageAspectRatio ? ` style="aspect-ratio: ${imageAspectRatio}"` : ''}>
                    <button type="button" class="generated-image-preview-btn" data-generated-image-preview="${asset.id}" aria-label="${escapeHTML(labels.imagePreview || '')}">
                        <img data-generated-image-id="${asset.id}" alt="${escapeHTML(labels.imageAlt || '')}" loading="lazy">
                    </button>
                    <div class="generated-image-actions">
                        <button type="button" data-generated-image-edit="${asset.id}" class="generated-image-action-btn generated-image-edit-btn">
                            <span>${escapeHTML(labels.edit || '')}</span>
                        </button>
                        <a data-generated-image-download="${asset.id}" class="generated-image-action-btn generated-image-download-btn" title="${escapeHTML(labels.imageDownloadOriginal || '')}" aria-label="${escapeHTML(labels.imageDownloadOriginal || '')}">
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                        </a>
                    </div>
                </figure>`;
            });
            generatedImageHTML = renderGeneratedImageSet({ cards: generatedImageCards, assets: generatedImageAssets, label: labels.imageSetItem });
        }
        // A message of pictures only has no footer; one with words (a text model drew the pictures itself) does.
        if (!isUser && (generatedImageAssets.length === 0 || textParts.length > 0)) {
            const timeString = formatTimestamp(message.createdAt);
            actionButtons = `
                        <div class="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                            <div class="message-footer-left">
                            <button class="copy-content-btn p-1 rounded-md hover:bg-gray-500/20 text-[var(--text-secondary)] opacity-50 hover:opacity-100 transition-opacity" title="${copyTitle}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                            ${replySourcesButtonHTML(message, uiLanguage)}
                            </div>
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
                    <span class="sent-message-quote-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v4.5A4.5 4.5 0 0 0 10.5 13H18"/><path d="m15 10 3 3-3 3"/></svg></span>
                    <span class="sent-message-quote-text">${renderUserText(quoteReference.text)}</span>
                </button>`;
        }
        if (isUser) {
            userActionButtons = `
                <div class="user-message-actions" aria-label="${escapeHTML(labels.messageActions || '')}">
                    <button type="button" class="user-message-action" data-message-action="copy" title="${escapeHTML(labels.copyMessage || '')}" aria-label="${escapeHTML(labels.copyMessage || '')}">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><defs><mask id="user-message-copy-mask-${message.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="white"></rect><rect x="3" y="8" width="13" height="13" rx="2" fill="black"></rect></mask></defs><rect x="8" y="3" width="13" height="13" rx="2" mask="url(#user-message-copy-mask-${message.id})"></rect><rect x="3" y="8" width="13" height="13" rx="2"></rect></svg>
                    </button>
                    <button type="button" class="user-message-action" data-message-action="edit" title="${escapeHTML(labels.editMessage || '')}" aria-label="${escapeHTML(labels.editMessage || '')}">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                    </button>
                </div>`;
        }
        if (!isUser && message.metadata?.visionCheck && !message.metadata.visionCheck.note && historySourceTexts.autoCheckLabel) {
            autoNoteHTML = `<div class="auto-check-note">${escapeHTML(historySourceTexts.autoCheckLabel)}</div>`;
        }
        if (!isUser && historySources.length > 0) {
            const referenceLabel = historySourceLabel(
                historySourceTexts.referenceLabel || 'Referenced {count} prior conversations',
                historySources.length
            );
            const updatedLabel = historySourceTexts.updatedLabel || 'Updated';
            const unavailableLabel = historySourceTexts.unavailableLabel || 'Conversation unavailable';
            const sourceItems = historySources.map((source, index) => {
                if (!source?.available) {
                    return `<li class="history-source-item is-unavailable"><span>${escapeHTML(unavailableLabel)}</span></li>`;
                }
                const timestamp = source.updatedAtLabel
                    ? `<span class="history-source-updated">${escapeHTML(updatedLabel)} · ${escapeHTML(source.updatedAtLabel)}</span>`
                    : '';
                return `
                    <li class="history-source-item">
                        <button type="button" class="history-source-link" data-history-source-index="${index}">
                            <span class="history-source-title">${escapeHTML(source.title || '')}</span>
                            ${timestamp}
                        </button>
                    </li>`;
            }).join('');
            historySourcesHTML = `
                <details class="history-source-references">
                    <summary>${escapeHTML(referenceLabel)}</summary>
                    <ul class="history-source-list">${sourceItems}</ul>
                </details>`;
        }
    }

    const hasBubbleContent = isLoadingMessage || contentHTML.trim();
    const imageStackClass = generatedImageHTML ? ' image-message-stack' : '';
    const quoteStackClass = quoteReferenceHTML ? ' message-stack-has-quote' : '';
    const messageHTML = `
                <div class="message-stack ${isUser ? 'message-stack-user' : 'message-stack-model'}${imageStackClass}${quoteStackClass}">
                    ${autoNoteHTML}
                    ${mediaGridHTML}
                    ${generatedImageHTML}
                    ${quoteReferenceHTML}
                    ${hasBubbleContent ? `
                        <div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative${researchCard ? ' research-bubble' : ''}" >
                            <div class="prose prose-sm max-w-none text-[var(--text-primary)] ${contentPaddingClass} message-content">${contentHTML}${visionRetry && historySourceTexts.retryLabel ? `<div class="vision-retry-row"><button type="button" class="vision-retry" data-vision-retry="${escapeHTML(message.id)}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>${escapeHTML(historySourceTexts.retryLabel)}</button></div>` : ''}</div>
                            ${actionButtons}
                        </div>
                    ` : ''}
                    ${historySourcesHTML}
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
