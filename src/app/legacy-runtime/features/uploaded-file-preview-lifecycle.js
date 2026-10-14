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

    // The edges of the row fade out where more cards are hidden, as much as there is hidden (so the fade grows and goes little by little;
    // the sizes are read by src/styles/file-visual.css).
    const updateEdgeFade = () => {
        const container = getContainer();
        if (!container?.style?.setProperty) return;
        const hidden = Math.max(0, (container.scrollWidth || 0) - (container.clientWidth || 0));
        const scrolled = Math.min(hidden, Math.max(0, container.scrollLeft || 0));
        const ease = (distance) => Math.min(1, Math.max(0, distance / 48));
        container.style.setProperty('--ac-fade-start', `${(ease(scrolled) * 2.25).toFixed(3)}rem`);
        container.style.setProperty('--ac-fade-end', `${(ease(hidden - scrolled) * 2.25).toFixed(3)}rem`);
    };

    const motionAllowed = () => !window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    // A card that goes shrinks to nothing while it fades; the layout does the sliding of the cards beside it.
    const leave = (element) => {
        if (typeof element.animate !== 'function' || !motionAllowed()) {
            element.remove?.();
            return;
        }
        const box = element.getBoundingClientRect();
        element.dataset.leaving = 'true';
        element.style.pointerEvents = 'none';
        const from = { flexBasis: `${box.width}px`, width: `${box.width}px`, height: `${box.height}px`, opacity: 1, marginRight: '0rem' };
        const to = { flexBasis: '0px', width: '0px', height: `${box.height}px`, opacity: 0, marginRight: '-0.5rem' };
        const animation = element.animate([from, to], { duration: 240, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' });
        animation.onfinish = () => {
            element.remove();
            updateEdgeFade();
        };
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
        const hadCards = cards.size > 0;
        for (const [id, card] of cards) {
            if (!files.some((file) => file.id === id)) {
                // The last one goes at once; the others close up slowly, so the cards beside it slide into its place.
                if (files.length > 0) leave(card.element);
                else card.element.remove?.();
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
        const isLeaving = (child) => child.dataset?.leaving === 'true';
        [...(container.children || [])].forEach((child) => { if (!keep.has(child) && !isLeaving(child)) child.remove?.(); });
        wanted.forEach((card, index) => {
            const present = [...(container.children || [])].filter((child) => !isLeaving(child));
            if (present[index] !== card.element) {
                const before = present[index] || null;
                if (container.insertBefore) container.insertBefore(card.element, before);
                else container.appendChild(card.element);
            }
            if (card.fresh) {
                card.fresh = false;
                if (card.video) prepareVideoThumbnail(card.video, { document });
                // A card added to the others comes in softly.
                if (hadCards && typeof card.element.animate === 'function' && motionAllowed()) {
                    card.element.animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
                }
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
