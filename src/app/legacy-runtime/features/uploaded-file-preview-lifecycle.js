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

    const renderFilePreviews = () => {
        const files = getFiles();
        const container = getContainer();
        container.innerHTML = '';
        getInputWrapper()?.classList.toggle('has-file-previews', files.length > 0);
        container.classList.toggle('has-files', files.length > 0);
        // A file that is gone takes its picture with it.
        for (const [id, entry] of thumbnails) {
            if (!files.some((file) => file.id === id)) {
                entry.dispose?.();
                thumbnails.delete(id);
            }
        }

        // Pictures and videos first, the other files after them (the same order as in a sent message).
        const isVisual = (file) => ['image', 'video'].includes(describeAttachment({ name: file.name, mimeType: file.type }).family);
        [...files.filter(isVisual), ...files.filter(file => !isVisual(file))].forEach(file => {
            const { element, video } = createAttachmentCard(document, file, {
                window,
                language: getLanguage(),
                cache: thumbnails,
                onOpen: openFile,
                onRemove: (removed) => removeFile(removed.id)
            });
            container.appendChild(element);
            if (video) prepareVideoThumbnail(video, { document });
        });
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
