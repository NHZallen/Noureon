const getEmptyResponseMessage = (uiLanguage) => uiLanguage === 'en'
  ? 'The request ended without any response text. The provider may have timed out or rejected the payload.'
  : '請求已結束，但模型沒有回傳任何文字。服務可能逾時，或拒絕了這次的 payload。';

export async function finalizeAssistantResponse({
  fullResponse,
  finalParts = null,
  finalAiMessage,
  councilMetadata,
  includeCouncilMetadata = false,
  conversation,
  userMessageObject,
  userMessageText,
  signal,
  responseUsesCouncil,
  responseRenderedInRealtime,
  targetElement,
  uiLanguage,
  memoryEnabled,
  autoMemoryEnabled,
  sendConversationToMail,
  persistAppData,
  completeSingleModelView,
  restoreRealtimeCouncilDetails,
  renderRealtimeCouncilFinal,
  playbackCouncilResponse,
  extractPersonalMemory,
  completeImageView = null,
  nowIso = () => new Date().toISOString()
}) {
  const hasFinalParts = Array.isArray(finalParts) && finalParts.length > 0;
  if (!hasFinalParts && !String(fullResponse || '').trim()) {
    throw new Error(getEmptyResponseMessage(uiLanguage));
  }

  if (!hasFinalParts) sendConversationToMail(userMessageObject, fullResponse);

  finalAiMessage.parts = hasFinalParts ? finalParts : [{ text: fullResponse }];
  if (includeCouncilMetadata) {
    finalAiMessage.council = councilMetadata;
  }
  conversation.messages.push(finalAiMessage);
  conversation.lastUpdatedAt = nowIso();
  await persistAppData();

  if (hasFinalParts && completeImageView) {
    await completeImageView({ targetElement, finalAiMessage });
  } else if (!responseUsesCouncil) {
    await completeSingleModelView({
      targetElement,
      fullResponse,
      signal,
      responseRenderedInRealtime
    });
  } else if (responseRenderedInRealtime && targetElement.dataset.streamRendered === 'true') {
    restoreRealtimeCouncilDetails({ targetElement });
  } else if (responseRenderedInRealtime) {
    renderRealtimeCouncilFinal({ targetElement, fullResponse });
  } else {
    await playbackCouncilResponse({ targetElement, fullResponse, signal });
  }

  if (!hasFinalParts && !signal.aborted && memoryEnabled && autoMemoryEnabled) {
    await extractPersonalMemory(userMessageText, fullResponse);
  }

  return {
    finalAiMessage,
    fullResponse
  };
}

export async function persistAssistantResponseError({
  error,
  signal,
  conversation,
  targetElement,
  errorPrefix,
  fallbackModelName,
  getLatestProgress,
  stopSingleModelLifecycle,
  renderError,
  persistAppData,
  nowIso = () => new Date().toISOString()
}) {
  if (error.name === 'AbortError' && signal?.aborted) {
    return { persisted: false };
  }

  stopSingleModelLifecycle();
  const errorMessage = `${errorPrefix || '抱歉，發生錯誤：'}${error.message || error.name || 'Unknown error'}`;
  const currentProgress = getLatestProgress() || {
    modelName: fallbackModelName,
    elapsedMs: 0
  };
  targetElement.innerHTML = renderError(currentProgress, errorMessage);
  const finalAiMessage = {
    role: 'model',
    parts: [{ text: errorMessage }],
    createdAt: nowIso()
  };
  conversation.messages.push(finalAiMessage);
  await persistAppData();

  return {
    errorMessage,
    finalAiMessage,
    persisted: true
  };
}
