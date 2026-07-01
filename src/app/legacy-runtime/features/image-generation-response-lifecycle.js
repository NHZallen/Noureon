import { normalizeImageGenerationConfig } from './image-generation-config.js';

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
  getApiKey
}) {
  const run = async ({ targetElement, userParts, modelInfo, conversation, signal }) => {
    targetElement.innerHTML = `
      <div class="generated-image-skeleton" role="status" aria-live="polite">
        <span>正在建立圖像</span><div class="generated-image-skeleton-shimmer"></div>
      </div>`;

    const requestParts = await buildSingleModelTranslatedRequestParts(
      userParts,
      modelInfo,
      signal,
      (_stage, message) => {
        const label = targetElement.querySelector?.('.generated-image-skeleton span');
        if (label && message) label.textContent = message;
      }
    );
    const basePrompt = getTextPrompt(requestParts);
    if (!basePrompt) throw new Error('請輸入圖片描述');
    const hasTargetedEditReference = requestParts.some(part => part.inlineData?.targetedEdit);
    const prompt = hasTargetedEditReference
      ? `${basePrompt}\n\nThe colored hand-drawn marks indicate the exact target area to edit. Apply the requested change only where indicated, preserve the rest of the image, and remove all annotation marks from the final image.`
      : basePrompt;

    let inputReferences = getInlineReferences(requestParts);
    if (inputReferences.length === 0) {
      const latest = findLatestGeneratedImage(conversation);
      const dataUrl = latest ? await getStoredImageDataUrl(latest) : '';
      if (dataUrl) inputReferences = [dataUrl];
    }

    const normalizedConfig = normalizeImageGenerationConfig(conversation.imageConfig);
    const generationRequest = {
      apiKey: getApiKey(modelInfo.provider),
      model: modelInfo.id,
      prompt,
      config: {
        ...normalizedConfig,
        ...(conversation.imageAdvancedConfig || {})
      },
      inputReferences,
      signal
    };
    if (!generationRequest.apiKey) throw new Error('請先在設定中輸入 OpenRouter API 金鑰');
    // OpenRouter accepts image streaming for generation, but not for edit requests
    // that include input_references. Keep edits buffered to avoid provider rejection.
    if (modelInfo.supportsImageStreaming && inputReferences.length === 0) {
      generationRequest.onPartial = partial => {
        targetElement.innerHTML = `<img class="generated-image-partial" alt="圖片生成預覽" src="data:${partial.mediaType};base64,${partial.b64Json}">`;
      };
    }
    const result = await generateImage(generationRequest);
    if (!result.images?.length) throw new Error('圖片生成完成，但服務沒有回傳圖片');
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
