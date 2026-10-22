import { attachedPictureNumbers } from '../../../data/conversation-pictures.js';
import { pictureNumberHTML } from '../../ui/files/picture-number.js';
import { describeAttachment, fileFamilyLabel, fileKindIconHTML } from '../../ui/files/file-visual.js';

export function createMediaAttachmentRenderer({ escapeHTML, getUiLanguage = () => 'zh-TW' }) {
    const getInlineMediaSrc = (media) => (
        `data:${media.mimeType || 'application/octet-stream'};base64,${media.data}`
    );

    const buildMediaAttachmentView = (mediaParts = []) => {
        const previewMediaParts = [...mediaParts];
        if (!previewMediaParts.length) {
            return { html: '', previewMediaParts };
        }
        const pictureNumbers = attachedPictureNumbers(previewMediaParts);
        const isVisual = (media) => /^(image|video)\//.test(media.mimeType || '');
        const visualItems = previewMediaParts.map((media, mediaIndex) => {
            const mimeType = media.mimeType || 'application/octet-stream';
            const src = getInlineMediaSrc(media);
            const name = media.name || mimeType || 'attachment';
            if (mimeType.startsWith('image/')) {
                return `
                    <button type="button" class="message-media-thumb" data-media-index="${mediaIndex}" aria-label="${escapeHTML(name)}">
                        <img src="${escapeHTML(src)}" alt="${escapeHTML(name)}" loading="lazy">${pictureNumberHTML(pictureNumbers[mediaIndex])}
                    </button>
                `;
            }
            if (mimeType.startsWith('video/')) {
                return `
                    <button type="button" class="message-media-thumb message-media-video" data-media-index="${mediaIndex}" aria-label="${escapeHTML(name)}">
                        <video src="${escapeHTML(src)}" preload="auto" muted playsinline data-video-thumbnail></video>
                        <span class="message-media-play" aria-hidden="true">
                            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M8 5v14l11-7z"></path></svg>
                        </span>
                    </button>
                `;
            }
            return '';
        }).join('');
        // A file is a row: the icon of its kind, its name and the name of its kind. A program's source has no preview, so its row is not a button.
        const language = getUiLanguage();
        const fileItems = previewMediaParts.map((media, mediaIndex) => {
            if (isVisual(media)) return '';
            const mimeType = media.mimeType || 'application/octet-stream';
            const name = media.name || mimeType || 'attachment';
            const { family } = describeAttachment({ name, mimeType });
            const content = `${fileKindIconHTML(family)}<span class="message-file-copy"><span class="message-file-name">${escapeHTML(name)}</span><span class="message-file-kind">${escapeHTML(fileFamilyLabel(language, family))}</span></span>`;
            const openable = ['pdf', 'word', 'powerpoint', 'excel', 'text', 'markdown', 'csv'].includes(family);
            return openable
                ? `<button type="button" class="message-file-row" data-media-index="${mediaIndex}" data-file-family="${family}" title="${escapeHTML(name)}">${content}</button>`
                : `<div class="message-file-row" data-file-family="${family}" title="${escapeHTML(name)}">${content}</div>`;
        }).join('');
        const visualCount = previewMediaParts.filter(isVisual).length;
        const singleVisual = visualCount === 1
            && previewMediaParts.filter(isVisual).every((media) => (media.mimeType || '').match(/^(image|video)\//));
        return {
            html: `${visualCount ? `<div class="message-media-grid ${singleVisual ? 'message-media-grid-single' : ''}">${visualItems}</div>` : ''}${fileItems ? `<div class="message-file-list">${fileItems}</div>` : ''}`,
            previewMediaParts
        };
    };

    const renderMediaAttachmentGrid = (mediaParts = []) => buildMediaAttachmentView(mediaParts).html;

    return {
        getInlineMediaSrc,
        buildMediaAttachmentView,
        renderMediaAttachmentGrid
    };
}
