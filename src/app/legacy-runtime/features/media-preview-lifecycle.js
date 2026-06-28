export function createMediaPreviewLifecycle({
    document,
    navigator,
    fetch,
    File,
    escapeHTML,
    getInlineMediaSrc,
    getUiLanguage,
    getText = (_key, fallback) => fallback,
    logWarn = (...args) => console.warn(...args)
}) {
    const openMediaPreview = (media) => {
        if (!media) return;
        document.querySelector('.media-lightbox')?.remove();
        const mimeType = media.mimeType || 'application/octet-stream';
        const src = getInlineMediaSrc(media);
        const name = media.name || mimeType || 'attachment';
        const overlay = document.createElement('div');
        overlay.className = 'media-lightbox';
        const mediaHTML = mimeType.startsWith('video/')
            ? `<video src="${escapeHTML(src)}" controls autoplay playsinline></video>`
            : `<img src="${escapeHTML(src)}" alt="${escapeHTML(name)}">`;
        getUiLanguage();
        const closePreviewLabel = getText('closePreview', 'Close preview');
        const downloadLabel = getText('download', 'Download');
        const saveLabel = getText('save', 'Save');
        const shareLabel = getText('share', 'Share');
        overlay.innerHTML = `
            <button type="button" class="media-lightbox-close" aria-label="${escapeHTML(closePreviewLabel)}">&times;</button>
            <div class="media-lightbox-toolbar">
                <a class="media-lightbox-action media-lightbox-download" href="${escapeHTML(src)}" download="${escapeHTML(name)}" aria-label="${escapeHTML(downloadLabel)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    <span>${escapeHTML(saveLabel)}</span>
                </a>
                <button type="button" class="media-lightbox-action media-lightbox-share" aria-label="${escapeHTML(shareLabel)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
                    <span>${escapeHTML(shareLabel)}</span>
                </button>
            </div>
            <div class="media-lightbox-stage">
                ${mediaHTML}
            </div>
        `;
        const close = () => {
            if (document.fullscreenElement === overlay) {
                document.exitFullscreen?.().catch(() => {});
            }
            overlay.remove();
            document.removeEventListener('keydown', onKeyDown);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') close();
        };
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('.media-lightbox-close')) close();
        });
        overlay.querySelector('.media-lightbox-share')?.addEventListener('click', async () => {
            if (!navigator.share) return;
            try {
                const blob = await (await fetch(src)).blob();
                const file = new File([blob], name, { type: mimeType });
                if (navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], title: name });
                }
            } catch (error) {
                logWarn('Media share failed:', error);
            }
        });
        document.addEventListener('keydown', onKeyDown);
        document.body.appendChild(overlay);
        overlay.querySelector('video')?.play?.().catch(() => {});
    };

    const bindMediaPreviewButtons = (root, mediaParts = []) => {
        root.querySelectorAll('.message-media-thumb').forEach(button => {
            button.addEventListener('click', () => {
                const mediaIndex = Number(button.dataset.mediaIndex);
                openMediaPreview(mediaParts[mediaIndex]);
            });
        });
    };

    return {
        openMediaPreview,
        bindMediaPreviewButtons
    };
}
