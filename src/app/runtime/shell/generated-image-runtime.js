// The parts of the picture-making that are loaded the first time a picture is made or shown (the asset store of the pictures, the request to OpenRouter,
// the reply lifecycle, the buttons on a picture): one promise, made on the first call. Moved out of shell.js, which is at the limit of its size;
// everything it needs from the shell is given to it here.
import { createImageFileName } from '../../ui/files/file-name-policy.js';
import { dataUrlToBlob } from '../images/picture-blob.js';
export function createGeneratedImageRuntimeLoader({
    document,
    fetch,
    navigator,
    File,
    getItem,
    setItem,
    getUserName,
    getActiveConversation,
    buildSingleModelTranslatedRequestParts,
    getApiKeyForProvider,
    getModelReasoningConfig,
    normalizeReasoningEffort,
    getText,
    showNotification,
    getUiLanguage,
    getImageReadyText,
    escapeHTML,
    setUploadedFiles,
    renderFilePreviews,
    focusMessageInput
}) {
    let generatedImageRuntimePromise;
    return () => {
        if (!generatedImageRuntimePromise) {
            generatedImageRuntimePromise = Promise.all([
                import('../images/generated-image-assets.js'),
                import('../images/image-generators.js'),
                import('../images/image-generation-response-lifecycle.js'),
                import('../images/generated-image-interactions.js')
            ]).then(([assetsModule, generatorsModule, lifecycleModule, interactionsModule]) => {
                const assetStore = assetsModule.createGeneratedImageAssetStore({
                    getItem,
                    setItem,
                    getUserName,
                    shouldPersist: () => getActiveConversation()?.retentionMode !== 'ephemeral'
                });
                const generateImage = generatorsModule.createImageGenerator({ fetchImpl: fetch });
                const responseLifecycle = lifecycleModule.createImageGenerationResponseLifecycle({
                    buildSingleModelTranslatedRequestParts: (...args) => buildSingleModelTranslatedRequestParts(...args),
                    generateImage,
                    saveImageAsset: image => assetStore.save(image),
                    getStoredImageDataUrl: descriptor => assetStore.getDataUrl(descriptor),
                    getApiKey: provider => getApiKeyForProvider(provider),
                    getModelReasoningConfig,
                    normalizeReasoningEffort,
                    getText,
                    showNotification
                });
                const interactions = interactionsModule.createGeneratedImageInteractions({
                    document,
                    getImageDataUrl: descriptor => assetStore.getDataUrl(descriptor),
                    attachAnnotatedImage: async ({ dataUrl, descriptor, frames }) => {
                        // A picture, or the frames of a GIF that were marked (in their order, each told which of how many it is).
                        setUploadedFiles((frames?.length ? frames : [{ dataUrl }]).map((entry) => ({
                            name: createImageFileName({ description: descriptor.title || descriptor.prompt, number: entry.count ? entry.index + 1 : 1, mediaType: 'image/png' }),
                            type: 'image/png',
                            size: dataUrlToBlob(entry.dataUrl)?.size || 0,
                            base64: entry.dataUrl,
                            // true for a picture; for a frame of a GIF, which frame of how many, and which GIF it came from
                            targetedEdit: entry.count ? { index: entry.index, count: entry.count, source: entry.source, ...(entry.all ? { all: true } : {}), ...(entry.sheet ? { sheet: true } : {}), ...(entry.speed ? { speed: entry.speed } : {}) } : true
                        })));
                        renderFilePreviews();
                        focusMessageInput();
                        showNotification(getImageReadyText(), 'success');
                    },
                    getUiLanguage,
                    navigator,
                    fetchImpl: fetch,
                    FileCtor: File,
                    escapeHTML,
                    getText,
                    logWarn: (...args) => console.warn(...args)
                });
                return { assetStore, interactions, responseLifecycle };
            });
        }
        return generatedImageRuntimePromise;
    };
}
