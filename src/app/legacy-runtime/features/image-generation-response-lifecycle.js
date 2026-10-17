import { normalizeImageGenerationConfig, resolveSupportedAspectRatio, resolveSupportedResolution } from './image-generation-config.js';
import { imageThumbsPlaceholder, imageWaitMarkup, loadImageWait } from '../../ui/image-wait/image-wait-markup.js';

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
    void loadImageWait();
    targetElement.innerHTML = `
      <div class="generated-image-skeleton generated-image-skeleton-preparing" role="status" aria-live="polite" data-target-aspect-ratio="${normalizedConfig.aspectRatio}">
        ${imageWaitMarkup({ label: getText('imageWaitStage1', '正在建立圖像'), startedAt: Date.now() })}
      </div>
      ${imageThumbsPlaceholder(Math.min(Number(conversation.imageAdvancedConfig?.n) || 1, Number(modelInfo.maxImageCount) || 10))}`;
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
          // What the page says about the request (its translation) stays in place of the stage words until the request is ready.
          if (label && message) {
            label.textContent = message;
            if (label.dataset) label.dataset.pinned = '1';
          }
        },
        { webSearchEnabled, conversation }
      );
    const waitingLabel = targetElement.querySelector?.('.generated-image-skeleton span');
    if (waitingLabel?.dataset?.pinned) {
      delete waitingLabel.dataset.pinned;
      targetElement.querySelector?.('noureon-image-wait')?.__imageWait?.refresh?.();
    }
    const basePrompt = getTextPrompt(requestParts);
    if (!basePrompt) throw new Error(getText('imagePromptRequired', 'Describe the image you want to make.'));
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
          if (label && labelText) {
            label.textContent = labelText;
            // This one is told for good: the stage words do not take its place.
            if (label.dataset) label.dataset.pinned = '1';
          }
        }
      }
    }

    // An editing model needs a picture to edit, and takes only so many.
    if (modelInfo.minImageReferences && inputReferences.length < modelInfo.minImageReferences) {
      throw new Error(getText('imageReferenceRequired', 'This model edits pictures: attach the picture to edit, or make one first.'));
    }
    if (modelInfo.maxImageReferences && inputReferences.length > modelInfo.maxImageReferences) {
      showNotification(getText('imageReferenceLimit', 'This model takes {n} reference pictures at most; the first {n} are used.').replaceAll('{n}', String(modelInfo.maxImageReferences)), 'warning');
      inputReferences = inputReferences.slice(0, modelInfo.maxImageReferences);
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
    // Quality, background and compression are sent only to a model that lists them (GPT Image); the others would be asked for what they do not take.
    for (const key of ['quality', 'background', 'outputCompression']) {
      if (!modelInfo.supportedImageOptions?.includes(key)) delete generationRequest.config[key];
    }
    // A count saved with another model must not ask a one-picture model for more.
    if (modelInfo.maxImageCount && Number(generationRequest.config.n) > modelInfo.maxImageCount) generationRequest.config.n = modelInfo.maxImageCount;
    const reasoningConfig = getModelReasoningConfig(modelInfo);
    const reasoningEffort = reasoningConfig
      ? normalizeReasoningEffort(modelInfo, conversation.reasoningEffort)
      : null;
    if (reasoningEffort) {
      generationRequest.config.reasoningEffort = reasoningEffort;
    }
    if (!generationRequest.apiKey) throw new Error(getText('imageKeyRequired', 'Enter your OpenRouter API key in Settings first.'));
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
    if (!result.images?.length) throw new Error(getText('imageNoResult', 'The image was made, but no picture came back to show.'));
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
