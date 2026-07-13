import { normalizeImageGenerationConfig } from './image-generation-config.js';

const resolveImageAspectRatio = (requestedRatio) => ({
  '1:1': '1 / 1', '16:9': '16 / 9', '9:16': '9 / 16', '4:3': '4 / 3', '3:4': '3 / 4',
  '3:2': '3 / 2', '2:3': '2 / 3', '4:5': '4 / 5', '5:4': '5 / 4',
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
  normalizeReasoningEffort = () => null
}) {
  const run = async ({ targetElement, userParts, modelInfo, conversation, signal }) => {
    const normalizedConfig = normalizeImageGenerationConfig(conversation.imageConfig);
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
      }
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
      const dataUrl = latest ? await getStoredImageDataUrl(latest) : '';
      if (dataUrl) inputReferences = [dataUrl];
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
    // OpenRouter accepts image streaming for generation, but not for edit requests
    // that include input_references. Keep edits buffered to avoid provider rejection.
    if (modelInfo.supportsImageStreaming && inputReferences.length === 0) {
      generationRequest.onPartial = partial => {
        targetElement.innerHTML = `<img class="generated-image-partial" alt="圖像生成預覽" src="data:${partial.mediaType};base64,${partial.b64Json}">`;
      };
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
