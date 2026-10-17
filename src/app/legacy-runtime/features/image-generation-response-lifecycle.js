import { normalizeImageGenerationConfig, resolveSupportedAspectRatio, resolveSupportedResolution } from './image-generation-config.js';
import { imageThumbsPlaceholder, imageWaitMarkup, loadImageWait } from '../../ui/image-wait/image-wait-markup.js';
import { COLLAGE_INSTRUCTION, SEVERAL_INSTRUCTION, SHAPE_INSTRUCTION, limitsOf, readSpokenRequest, spokenProblemText } from './image-spoken-request.js';

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

// The pictures of the last reply that has any, in their order (the set the person has just been shown).
const findLatestGeneratedSet = (conversation) => {
  const messages = conversation?.messages || [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const pictures = (messages[index]?.parts || []).map(part => part.generatedImage).filter(Boolean);
    if (pictures.length > 0) return pictures;
  }
  return [];
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
    resumeRun = null,
    // The Decisions model's reading of what was said about the pictures ({ message, limits, attached } -> answers or null); without it the settings alone decide.
    requestImageDecisions = null
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

    // Asked while the request is being prepared (it adds no waiting of its own): how many pictures, which shape, a collage, more than the model does.
    const spokenAttached = userParts.filter(part => part.inlineData).length;
    const spokenMessage = getTextPrompt(userParts);
    const decisionPromise = Promise.resolve(requestImageDecisions?.({ message: spokenMessage, limits: limitsOf(modelInfo), attached: spokenAttached }, { signal })).catch(() => null);

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
    const spoken = readSpokenRequest({ decision: await decisionPromise, message: spokenMessage, modelInfo, attached: spokenAttached });
    // More than the model can do: nothing is sent (and nothing is paid for).
    if (spoken.problem) throw new Error(spokenProblemText(spoken.problem, getText));
    if (spoken.aspectRatio) {
      normalizedConfig.aspectRatio = spoken.aspectRatio;
      const waiting = targetElement.querySelector?.('.generated-image-skeleton');
      if (waiting) waiting.style.aspectRatio = resolveImageAspectRatio(spoken.aspectRatio);
    }
    if (spoken.count) {
      // The place-holders under the waiting picture follow the count that was said.
      targetElement.querySelector?.('.generated-image-thumbs-wait')?.remove();
      targetElement.querySelector?.('.generated-image-skeleton')?.insertAdjacentHTML?.('afterend', imageThumbsPlaceholder(spoken.count));
    }
    const hasTargetedEditReference = requestParts.some(part => part.inlineData?.targetedEdit);
    const editedPrompt = hasTargetedEditReference
      ? `${basePrompt}\n\nThe colored hand-drawn marks indicate the exact target area to edit. Apply the requested change only where indicated, preserve the rest of the image, and remove all annotation marks from the final image.`
      : basePrompt;
    // The count and the shape are sent as parameters; the picture model must not take the words that ask for them for something to draw (two pictures as two panels of one).
    const spokenInstruction = spoken.collage ? COLLAGE_INSTRUCTION : spoken.count > 1 ? SEVERAL_INSTRUCTION : spoken.aspectRatio ? SHAPE_INSTRUCTION : '';
    const prompt = spokenInstruction ? `${editedPrompt}\n\n${spokenInstruction}` : editedPrompt;

    let inputReferences = getInlineReferences(requestParts);
    const attachedByPerson = inputReferences.length > 0;
    // The earlier picture that goes along as the one to build on, when none is attached.
    let carriedImage = null;
    if (inputReferences.length === 0) {
      const latest = findLatestGeneratedImage(conversation);
      if (latest) {
        const dataUrl = await getStoredImageDataUrl(latest);
        if (dataUrl) {
          inputReferences = [dataUrl];
          carriedImage = latest;
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

    // A picture built on an earlier one keeps its shape, unless a shape was said (the earlier picture may have been made with a shape that was said, not saved in the settings).
    const supportedRatios = Array.isArray(modelInfo.supportedImageAspectRatios) ? modelInfo.supportedImageAspectRatios : [];
    if (carriedImage?.aspectRatio && !spoken.aspectRatio && carriedImage.aspectRatio !== normalizedConfig.aspectRatio
      && (supportedRatios.length === 0 || supportedRatios.includes(carriedImage.aspectRatio))) {
      normalizedConfig.aspectRatio = carriedImage.aspectRatio;
      const waiting = targetElement.querySelector?.('.generated-image-skeleton');
      if (waiting) waiting.style.aspectRatio = resolveImageAspectRatio(carriedImage.aspectRatio);
    }

    // Pictures built on a set of earlier pictures (nothing attached, as many pictures wanted as the last reply held): the picture at each place is built on
    // by the picture at the same place, in its own shape, one request for each. Anything else builds on the last picture alone, as before.
    let groups = null;
    const previousSet = carriedImage && !attachedByPerson ? findLatestGeneratedSet(conversation) : [];
    const wantedCount = Math.min(spoken.count || Number(conversation.imageAdvancedConfig?.n) || 1, Number(modelInfo.maxImageCount) || 10);
    if (!spoken.collage && previousSet.length >= 2 && wantedCount === previousSet.length) {
      const addresses = await Promise.all(previousSet.map(picture => getStoredImageDataUrl(picture)));
      if (addresses.every(Boolean)) {
        groups = previousSet.map((picture, index) => ({
          inputReferences: [addresses[index]],
          aspectRatio: spoken.aspectRatio || (picture.aspectRatio && (supportedRatios.length === 0 || supportedRatios.includes(picture.aspectRatio)) ? picture.aspectRatio : normalizedConfig.aspectRatio)
        }));
      }
    }

    // An editing model needs a picture to edit, and takes only so many.
    if (modelInfo.minImageReferences && inputReferences.length < modelInfo.minImageReferences) {
      throw new Error(getText('imageReferenceRequired', 'This model edits pictures: attach the picture to edit, or make one first.'));
    }
    if (modelInfo.maxImageReferences && inputReferences.length > modelInfo.maxImageReferences) {
      throw new Error(getText('imageReferenceOverLimit', 'This model takes {max} reference pictures at most and you attached {n}, so nothing was sent.')
        .replaceAll('{max}', String(modelInfo.maxImageReferences)).replaceAll('{n}', String(inputReferences.length)));
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
      ...(groups ? { groups } : {}),
      signal
    };
    // Quality, background and compression are sent only to a model that lists them (GPT Image); the others would be asked for what they do not take.
    for (const key of ['quality', 'background', 'outputCompression']) {
      if (!modelInfo.supportedImageOptions?.includes(key)) delete generationRequest.config[key];
    }
    // What was said about the count wins for this message; a count saved with another model must not ask a one-picture model for more.
    if (spoken.count) generationRequest.config.n = spoken.count;
    if (groups) generationRequest.config.n = groups.length;
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
        groups: groups ? groups.map(group => ({ references: group.inputReferences, aspectRatio: group.aspectRatio })) : null,
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
      aspectRatio: image.aspectRatio || normalizedConfig.aspectRatio
    })));
    return {
      parts: descriptors.map(generatedImage => ({ generatedImage })),
      descriptors
    };
  };

  return { findLatestGeneratedImage, run };
}
