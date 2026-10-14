import { prepareVideoThumbnail } from './video-thumbnail-lifecycle.js';

import { createAttachmentCard } from '../../ui/files/attachment-card.js';
import { describeAttachment } from '../../ui/files/file-visual.js';

export function createUploadedFilePreviewLifecycle({
    document,
    getFiles,
    setFiles,
    getContainer,
    getInputWrapper,
    openMediaPreview,
    updateInputState,
    getLanguage = () => 'zh-TW'
}) {
    // What was drawn for each file (a picture of its first page): kept while the row is drawn again.
    const thumbnails = new Map();
    const window = document.defaultView;

    const openFile = async (file, trigger) => {
        const { family } = describeAttachment({ name: file.name, mimeType: file.type });
        if (family === 'image' || family === 'video') {
            openMediaPreview({ mimeType: file.type, data: file.base64.split(',')[1], name: file.name }, trigger);
            return;
        }
        const { openUploadedFilePreview } = await import('../../ui/files/uploaded-file-preview.js');
        await openUploadedFilePreview({ document, window, file, language: getLanguage(), returnFocusTo: trigger });
    };

    // The cards already drawn, by file: taking one away or adding one leaves the others as they are (no flash).
    const cards = new Map();
    let fadeListening = false;

    // The edges of the row fade out where more cards are hidden (the sizes are read by src/styles/file-visual.css).
    const updateEdgeFade = () => {
        const container = getContainer();
        if (!container?.style?.setProperty) return;
        const hidden = Math.max(0, (container.scrollWidth || 0) - (container.clientWidth || 0));
        const left = hidden > 1 && (container.scrollLeft || 0) > 1;
        const right = hidden > 1 && (container.scrollLeft || 0) < hidden - 1;
        container.style.setProperty('--ac-fade-start', left ? '1.75rem' : '0px');
        container.style.setProperty('--ac-fade-end', right ? '1.75rem' : '0px');
    };

    const renderFilePreviews = () => {
        const files = getFiles();
        const container = getContainer();
        getInputWrapper()?.classList.toggle('has-file-previews', files.length > 0);
        container.classList.toggle('has-files', files.length > 0);
        // A file that is gone takes its card and its picture with it.
        for (const [id, entry] of thumbnails) {
            if (!files.some((file) => file.id === id)) {
                entry.dispose?.();
                thumbnails.delete(id);
            }
        }
        for (const [id, card] of cards) {
            if (!files.some((file) => file.id === id)) {
                card.element.remove?.();
                cards.delete(id);
            }
        }

        // Pictures and videos first, the other files after them (the same order as in a sent message).
        const isVisual = (file) => ['image', 'video'].includes(describeAttachment({ name: file.name, mimeType: file.type }).family);
        const language = getLanguage();
        const wanted = [...files.filter(isVisual), ...files.filter(file => !isVisual(file))].map((file) => {
            let card = cards.get(file.id);
            if (!card || card.language !== language) {
                card?.element.remove?.();
                const made = createAttachmentCard(document, file, {
                    window,
                    language,
                    cache: thumbnails,
                    onOpen: openFile,
                    onRemove: (removed) => removeFile(removed.id)
                });
                card = { ...made, language, fresh: true };
                cards.set(file.id, card);
            }
            return card;
        });
        const keep = new Set(wanted.map((card) => card.element));
        [...(container.children || [])].forEach((child) => { if (!keep.has(child)) child.remove?.(); });
        wanted.forEach((card, index) => {
            if (container.children[index] !== card.element) {
                if (container.insertBefore) container.insertBefore(card.element, container.children[index] || null);
                else container.appendChild(card.element);
            }
            if (card.fresh) {
                card.fresh = false;
                if (card.video) prepareVideoThumbnail(card.video, { document });
            }
        });
        if (!fadeListening && container.addEventListener) {
            fadeListening = true;
            container.addEventListener('scroll', updateEdgeFade, { passive: true });
            window?.addEventListener?.('resize', updateEdgeFade);
        }
        updateEdgeFade();
        updateInputState();
    };

    const removeFile = (fileId) => {
        setFiles(getFiles().filter(file => file.id !== fileId));
        renderFilePreviews();
    };

    return {
        renderFilePreviews,
        removeFile
    };
}
