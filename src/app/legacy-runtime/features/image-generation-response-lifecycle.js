import { normalizeImageGenerationConfig, resolveSupportedAspectRatio, resolveSupportedResolution } from './image-generation-config.js';

const resolveImageAspectRatio = (requestedRatio) => ({
  '1:1': '1 / 1', '16:9': '16 / 9', '9:16': '9 / 16', '4:3': '4 / 3', '3:4': '3 / 4',
  '3:2': '3 / 2', '2:3': '2 / 3', '4:5': '4 / 5', '5:4': '5 / 4', '7:5': '7 / 5', '5:7': '5 / 7',
  '1:2': '1 / 2', '2:1': '2 / 1', '1:4': '1 / 4', '4:1': '4 / 1',
  '1:8': '1 / 8', '8:1': '8 / 1', '9:21': '9 / 21', '21:9': '21 / 9'
}[requestedRatio] || '1 / 1');

const scheduleFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
};

const findLatestGeneratedImage = (conversation) => {
  const messages = conversation?.messages || [];
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const parts = messages[messageIndex]?.parts || [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      if (parts[partIndex]?.generatedImage) return parts[partIndex].generatedImage;
    }
  }
  return null;
};

const getTextPrompt = (parts) => parts
  .map(part => part.text || '')
  .filter(Boolean)
  .join('\n\n')
  .trim();

const getInlineReferences = (parts) => parts
  .filter(part => part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data)
  .map(part => `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);

export function createImageGenerationResponseLifecycle({
  buildSingleModelTranslatedRequestParts,
  generateImage,
  saveImageAsset,
  getStoredImageDataUrl,
  getApiKey,
  getModelReasoningConfig = () => null,
  normalizeReasoningEffort = () => null,
  getText = (_key, fallback) => fallback,
  showNotification = () => {}
}) {
  // A picture the server makes: followed until it is over, then given back as one made here ({ parts, descriptors }). A stop (the page's
  // `signal`) is told to the server; a picture that came to nothing because of it ends like any stopped reply.
  const followServerImage = async (serverRun, { signal, serverReply, uiLanguage }) => {
    let outcome;
    try {
      outcome = await serverRun.followImage({ signal });
    } catch (error) {
      throw serverReply?.localizeError ? serverReply.localizeError(error, uiLanguage) : error;
    }
    if (signal?.aborted || !outcome.parts.length) throw Object.assign(new Error('The image was stopped.'), { name: 'AbortError' });
    return { parts: outcome.parts, descriptors: outcome.parts.map(part => part.generatedImage) };
  };

  const run = async ({
    targetElement,
    userParts,
    modelInfo,
    conversation,
    webSearchEnabled = false,
    signal,
    uiLanguage,
    // For a picture the server may make: where replies are made is the person's choice (settings), the server writes the message under
    // `assistantMessageId` at the place the reply takes in the chat (after the person's message), and `resumeRun` is a picture it was
    // already making when the page was opened again (it is only followed).
    serverReply = null,
    assistantMessageId = null,
    sequence = conversation?.messages?.length ?? 0,
    resumeRun = null
  }) => {
    if (resumeRun) return followServerImage(resumeRun, { signal, serverReply, uiLanguage });
    const savedConfig = normalizeImageGenerationConfig(conversation.imageConfig);
    // A ratio or resolution saved under another model may not exist on this one: use the nearest it has.
    const normalizedConfig = {
      ...savedConfig,
      aspectRatio: resolveSupportedAspectRatio(savedConfig.aspectRatio, modelInfo.supportedImageAspectRatios),
      // '' (the model sets its own size) is dropped from the request.
      resolution: resolveSupportedResolution(savedConfig.resolution, modelInfo.supportedImageResolutions)
    };
    const imageAspectRatio = resolveImageAspectRatio(normalizedConfig.aspectRatio);
    targetElement.innerHTML = `
      <div class="generated-image-skeleton generated-image-skeleton-preparing" role="status" aria-live="polite" data-target-aspect-ratio="${normalizedConfig.aspectRatio}">
        <span>正在建立圖像</span><div class="generated-image-skeleton-shimmer"></div>
      </div>`;
    const skeleton = targetElement.querySelector?.('.generated-image-skeleton');
    if (skeleton) {
      scheduleFrame(() => {
        if (!skeleton.isConnected) return;
        skeleton.style.aspectRatio = imageAspectRatio;
        skeleton.classList.add('generated-image-skeleton-sized');
      });
    }

    const requestParts = await buildSingleModelTranslatedRequestParts(
        userParts,
        modelInfo,
        signal,
        (_stage, message) => {
          const label = targetElement.querySelector?.('.generated-image-skeleton span');
          if (label && message) label.textContent = message;
        },
        { webSearchEnabled, conversation }
      );
    const basePrompt = getTextPrompt(requestParts);
    if (!basePrompt) throw new Error('請輸入要生成的圖像描述');
    const hasTargetedEditReference = requestParts.some(part => part.inlineData?.targetedEdit);
    const prompt = hasTargetedEditReference
      ? `${basePrompt}\n\nThe colored hand-drawn marks indicate the exact target area to edit. Apply the requested change only where indicated, preserve the rest of the image, and remove all annotation marks from the final image.`
      : basePrompt;

    let inputReferences = getInlineReferences(requestParts);
    if (inputReferences.length === 0) {
      const latest = findLatestGeneratedImage(conversation);
      if (latest) {
        const dataUrl = await getStoredImageDataUrl(latest);
        if (dataUrl) {
          inputReferences = [dataUrl];
        } else {
          // The conversation has a generated image to carry over but its local asset is gone.
          // Say so instead of silently falling back to a fresh text-only generation.
          showNotification(getText(
            'imageReferenceUnavailable',
            'The previous image is no longer available, so a new image will be generated.'
          ), 'warning');
          const label = targetElement.querySelector?.('.generated-image-skeleton span');
          const labelText = getText('imageReferenceUnavailableLabel', 'Reference image unavailable, generating a new image');
          if (label && labelText) label.textContent = labelText;
        }
      }
    }

    const generationRequest = {
      apiKey: getApiKey(modelInfo.provider),
      model: modelInfo.apiId || modelInfo.id,
      provider: modelInfo.provider,
      prompt,
      config: {
        ...normalizedConfig,
        ...(conversation.imageAdvancedConfig || {})
      },
      inputReferences,
      signal
    };
    const reasoningConfig = getModelReasoningConfig(modelInfo);
    const reasoningEffort = reasoningConfig
      ? normalizeReasoningEffort(modelInfo, conversation.reasoningEffort)
      : null;
    if (reasoningEffort) {
      generationRequest.config.reasoningEffort = reasoningEffort;
    }
    if (!generationRequest.apiKey) throw new Error('請先在設定中輸入 OpenRouter API 金鑰');
    // The server makes the picture when it can (the setting, the account and the kind of chat allow it, and it takes it): the page then only
    // follows it, and a page that is closed meanwhile finds it done. Otherwise it is made here, as always.
    if (serverReply && assistantMessageId && serverReply.planImage({ conversation }).ok) {
      const started = await serverReply.startImage({
        conversation,
        modelInfo,
        prompt,
        config: generationRequest.config,
        references: inputReferences,
        assistantMessageId,
        sequence,
        uiLanguage
      });
      if (started.ok) return followServerImage(started.run, { signal, serverReply, uiLanguage });
      if (started.notify) serverReply.notify(started.notify, uiLanguage);
    }
    const result = await generateImage(generationRequest);
    if (!result.images?.length) throw new Error('圖像生成完成，但沒有收到可顯示的圖片');
    const descriptors = await Promise.all(result.images.map(image => saveImageAsset({
      ...image,
      aspectRatio: normalizedConfig.aspectRatio
    })));
    return {
      parts: descriptors.map(generatedImage => ({ generatedImage })),
      descriptors
    };
  };

  return { findLatestGeneratedImage, run };
}
