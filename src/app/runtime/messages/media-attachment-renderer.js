import { attachedPictureNumbers } from '../../../data/conversation-pictures.js';
import { pictureNumberHTML } from '../../ui/files/picture-number.js';
import { pictureSizeOfBase64 } from '../../ui/files/picture-size.js';
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
        const visualCount = previewMediaParts.filter(isVisual).length;
        const singleVisual = visualCount === 1;
        const visualItems = previewMediaParts.map((media, mediaIndex) => {
            const mimeType = media.mimeType || 'application/octet-stream';
            const src = getInlineMediaSrc(media);
            const name = media.name || mimeType || 'attachment';
            if (mimeType.startsWith('image/')) {
                // The picture's own size, so that its place is the right size before it is decoded (a picture the browser has not drawn yet is nothing, and the message
                // grows by it when it is, moving what is read).
                const size = pictureSizeOfBase64(media.data);
                const sizeAttributes = size ? ` width="${size.width}" height="${size.height}"` : '';
                // A lone picture takes the size it will have: its own, no wider than the box may be and no taller (the same limits the style gives the drawn picture).
                const reserved = size && singleVisual
                    ? ` style="aspect-ratio: ${size.width} / ${size.height}; width: min(${size.width}px, 32rem, 82vw, calc(min(30rem, 58vh) * ${size.width / size.height}))"`
                    : '';
                return `
                    <button type="button" class="message-media-thumb"${reserved} data-media-index="${mediaIndex}" aria-label="${escapeHTML(name)}">
                        <img src="${escapeHTML(src)}" alt="${escapeHTML(name)}"${sizeAttributes} loading="lazy">${pictureNumberHTML(pictureNumbers[mediaIndex])}
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
