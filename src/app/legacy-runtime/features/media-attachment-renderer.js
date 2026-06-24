export function createMediaAttachmentRenderer({ escapeHTML }) {
    const getInlineMediaSrc = (media) => (
        `data:${media.mimeType || 'application/octet-stream'};base64,${media.data}`
    );

    const buildMediaAttachmentView = (mediaParts = []) => {
        const previewMediaParts = [...mediaParts];
        if (!previewMediaParts.length) {
            return { html: '', previewMediaParts };
        }
        const mediaItems = previewMediaParts.map((media, mediaIndex) => {
            const mimeType = media.mimeType || 'application/octet-stream';
            const src = getInlineMediaSrc(media);
            const name = media.name || mimeType || 'attachment';
            if (mimeType.startsWith('image/')) {
                return `
                    <button type="button" class="message-media-thumb" data-media-index="${mediaIndex}" aria-label="${escapeHTML(name)}">
                        <img src="${escapeHTML(src)}" alt="${escapeHTML(name)}" loading="lazy">
                    </button>
                `;
            }
            if (mimeType.startsWith('video/')) {
                return `
                    <button type="button" class="message-media-thumb message-media-video" data-media-index="${mediaIndex}" aria-label="${escapeHTML(name)}">
                        <video src="${escapeHTML(src)}" preload="metadata" muted playsinline></video>
                        <span class="message-media-play" aria-hidden="true">
                            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                        </span>
                    </button>
                `;
            }
            return `
                <div class="message-file-chip" title="${escapeHTML(name)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span>${escapeHTML(name)}</span>
                </div>
            `;
        }).join('');
        const singleVisual = previewMediaParts.length === 1
            && (previewMediaParts[0].mimeType || '').match(/^(image|video)\//);
        return {
            html: `<div class="message-media-grid ${singleVisual ? 'message-media-grid-single' : ''}">${mediaItems}</div>`,
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
