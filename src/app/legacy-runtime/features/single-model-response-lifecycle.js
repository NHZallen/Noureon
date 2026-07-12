import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';

export function createSingleModelResponseLifecycle({
  now = () => Date.now(),
  getOutputMode,
  renderSingleModelProgress,
  startProgressTicker,
  stopProgressTicker,
  buildSingleModelTranslatedRequestParts,
  streamApiCall,
  streamMarkdownResponse,
  playbackStreamingMarkdownResponse,
  renderIncrementalResponse,
  getOpenCouncilDetailKeys,
  restoreOpenCouncilDetails
}) {
  let progressTimer = null;
  let latestProgress = null;

  const stop = () => {
    if (!progressTimer) return;
    stopProgressTicker(progressTimer);
    progressTimer = null;
  };

  const renderProgress = (targetElement, startedAt, stage, message, extra = {}) => {
    latestProgress = {
      ...latestProgress,
      stage,
      message,
      elapsedMs: now() - startedAt,
      ...extra
    };
    targetElement.innerHTML = renderSingleModelProgress(latestProgress);
    return latestProgress;
  };

  const startTicker = (targetElement, startedAt) => {
    progressTimer = startProgressTicker(() => {
      latestProgress = {
        ...latestProgress,
        elapsedMs: now() - startedAt
      };
      targetElement.innerHTML = renderSingleModelProgress(latestProgress);
    });
  };

  const run = async ({
    targetElement,
    userParts,
    modelInfo,
    conversation,
    signal,
    uiLanguage
  }) => {
    stop();
    const startedAt = now();
    latestProgress = {
      stage: 'preparing',
      message: getRuntimeText(uiLanguage, 'preparingRequest'),
      modelName: modelInfo?.name || conversation.model,
      startedAt,
      elapsedMs: 0,
      receivedChars: 0
    };

    const hasTranslationInputs = userParts.some((part) => part.inlineData) ||
      Boolean(conversation.isWebSearchEnabled);
    let requestParts = userParts;
    if (hasTranslationInputs) {
      renderProgress(
        targetElement,
        startedAt,
        'preparing',
        'Checking model capabilities'
      );
      startTicker(targetElement, startedAt);
      requestParts = await buildSingleModelTranslatedRequestParts(
        userParts,
        modelInfo,
        signal,
        (stage, message) => renderProgress(targetElement, startedAt, stage, message)
      );
    }

    let receivedChars = 0;
    let lastProgressAt = 0;
    const updateStreamingProgress = (chunk) => {
      receivedChars += String(chunk || '').length;
      const currentTime = now();
      if (currentTime - lastProgressAt > 700) {
        lastProgressAt = currentTime;
        renderProgress(
          targetElement,
          startedAt,
          'streaming',
          'Model is answering',
          { receivedChars }
        );
      }
    };
    const runApiStream = (onChunk) => streamApiCall(
      requestParts,
      onChunk,
      signal,
      false,
      { modelInfo }
    );

    let fullResponse;
    let responseRenderedInRealtime = false;
    try {
      if (getOutputMode() === 'realtime') {
        stop();
        const realtimeProgress = {
          ...latestProgress,
          stage: 'streaming',
          message: 'Model is answering',
          elapsedMs: now() - startedAt
        };
        latestProgress = realtimeProgress;
        targetElement.innerHTML = renderSingleModelProgress(realtimeProgress);
        startTicker(targetElement, startedAt);
        fullResponse = await streamMarkdownResponse(
          targetElement,
          runApiStream,
          signal,
          {
            placeholderHTML: renderSingleModelProgress(realtimeProgress),
            onFirstChunk: stop
          }
        );
        responseRenderedInRealtime = true;
      } else {
        if (!progressTimer) {
          renderProgress(
            targetElement,
            startedAt,
            'streaming',
            'Model is answering'
          );
          startTicker(targetElement, startedAt);
        }
        fullResponse = await runApiStream(updateStreamingProgress);
      }
    } finally {
      stop();
    }

    if (!String(fullResponse || '').trim()) {
      throw new Error(getRuntimeText(uiLanguage, 'emptyResponse'));
    }

    return {
      fullResponse,
      responseRenderedInRealtime
    };
  };

  const completeView = async ({
    targetElement,
    fullResponse,
    signal,
    responseRenderedInRealtime
  }) => {
    if (responseRenderedInRealtime && targetElement.dataset.streamRendered === 'true') {
      restoreOpenCouncilDetails(targetElement, getOpenCouncilDetailKeys(targetElement));
      return;
    }
    if (responseRenderedInRealtime) {
      renderIncrementalResponse(targetElement, fullResponse, {
        final: true,
        preserveCouncilDetails: false
      });
      return;
    }
    await playbackStreamingMarkdownResponse(
      targetElement,
      fullResponse,
      signal,
      false
    );
  };

  return {
    completeView,
    getLatestProgress() {
      return latestProgress;
    },
    run,
    stop
  };
}
