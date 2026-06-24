export function createUploadedFilePreviewLifecycle({
    document,
    getFiles,
    setFiles,
    getContainer,
    getInputWrapper,
    openMediaPreview,
    updateInputState
}) {
    const renderFilePreviews = () => {
        const files = getFiles();
        const container = getContainer();
        container.innerHTML = '';
        getInputWrapper()?.classList.toggle('has-file-previews', files.length > 0);
        container.classList.toggle('has-files', files.length > 0);

        files.forEach(file => {
            const previewElement = document.createElement('div');
            previewElement.className = 'relative w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden file-preview-item';
            if (file.type.startsWith('image/')) {
                previewElement.innerHTML = `<img src="${file.base64}" class="w-full h-full object-cover">`;
                previewElement.onclick = () => openMediaPreview({
                    mimeType: file.type,
                    data: file.base64.split(',')[1],
                    name: file.name
                });
            } else if (file.type.startsWith('video/')) {
                previewElement.innerHTML = `
                    <video src="${file.base64}" class="w-full h-full object-cover" preload="metadata" muted playsinline></video>
                    <span class="message-media-play file-preview-play" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                    </span>
                `;
                previewElement.onclick = () => openMediaPreview({
                    mimeType: file.type,
                    data: file.base64.split(',')[1],
                    name: file.name
                });
            } else {
                previewElement.innerHTML = `<div class="w-full h-full flex items-center justify-center">
                   <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                </div>`;
            }
            const removeButton = document.createElement('button');
            removeButton.className = 'absolute top-0 right-0 m-1 w-5 h-5 bg-black bg-opacity-50 text-white rounded-full flex items-center justify-center text-xs';
            removeButton.innerHTML = '&times;';
            removeButton.onclick = (event) => {
                event.stopPropagation();
                removeFile(file.id);
            };
            previewElement.appendChild(removeButton);
            container.appendChild(previewElement);
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
