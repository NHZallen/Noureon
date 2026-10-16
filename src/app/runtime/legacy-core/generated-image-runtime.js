// The parts of the picture-making that are loaded the first time a picture is made or shown (the asset store of the pictures, the request to OpenRouter,
// the reply lifecycle, the buttons on a picture): one promise, made on the first call. Moved out of legacy-core.js, which is at the limit of its size;
// everything it needs from the shell is given to it here.
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
                import('../../legacy-runtime/features/generated-image-assets.js'),
                import('../../legacy-runtime/features/openrouter-image-generation.js'),
                import('../../legacy-runtime/features/image-generation-response-lifecycle.js'),
                import('../../legacy-runtime/features/generated-image-interactions.js')
            ]).then(([assetsModule, openRouterModule, lifecycleModule, interactionsModule]) => {
                const assetStore = assetsModule.createGeneratedImageAssetStore({
                    getItem,
                    setItem,
                    getUserName,
                    shouldPersist: () => getActiveConversation()?.retentionMode !== 'ephemeral'
                });
                const generateOpenRouterImage = openRouterModule.createOpenRouterImageGenerator({ fetchImpl: fetch });
                const responseLifecycle = lifecycleModule.createImageGenerationResponseLifecycle({
                    buildSingleModelTranslatedRequestParts: (...args) => buildSingleModelTranslatedRequestParts(...args),
                    generateImage: generateOpenRouterImage,
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
                    attachAnnotatedImage: async ({ dataUrl, descriptor }) => {
                        const blob = await (await fetch(dataUrl)).blob();
                        setUploadedFiles([{
                            name: `astra-targeted-edit-${descriptor.id}.png`,
                            type: 'image/png',
                            size: blob.size,
                            base64: dataUrl,
                            targetedEdit: true
                        }]);
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
