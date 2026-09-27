import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';
import { normalizeHistorySourceConversationIds } from '../../runtime/memory/history-source-references.js';

const getEmptyResponseMessage = (uiLanguage) => getRuntimeText(uiLanguage, 'emptyResponse');

// Only replies with a presentation, in a conversation with a template, load
// the enforcer (and the design modules behind it).
const PPTX_FILE_BLOCK = /(?:^|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*file[ \t]+[^\n]*\.pptx[ \t]*(?:\n|$)/i;
const TEMPLATE_ID = /^[a-z]+$/;
async function enforceChosenDeckTemplate(text, deckDesign) {
  if (!deckDesign || deckDesign === 'auto' || !TEMPLATE_ID.test(deckDesign) || !PPTX_FILE_BLOCK.test(String(text || ''))) return text;
  try {
    const [{ enforceDeckTemplate }, { DESIGN_PRESET_IDS }] = await Promise.all([
      import('../../ui/files/design/deck-template-enforcer.js'),
      import('../../ui/files/design/design-presets.js')
    ]);
    return DESIGN_PRESET_IDS.includes(deckDesign) ? enforceDeckTemplate(text, deckDesign) : text;
  } catch (error) {
    console.error('Applying the chosen presentation template failed:', error);
    return text;
  }
}

const rememberRenderedMessage = (targetElement, message) => {
  const messageElement = targetElement?.closest?.('[data-message-index]');
  if (messageElement) messageElement.__astraRenderedMessage = message;
};

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
  historySourceConversationIds = [],
  persistAppData,
  completeSingleModelView,
  restoreRealtimeCouncilDetails,
  renderRealtimeCouncilFinal,
  playbackCouncilResponse,
  extractPersonalMemory,
  completeImageView = null,
  scheduleVisionCheck = () => {},
  queueBackgroundTask = (task) => {
    void Promise.resolve()
      .then(task)
      .catch((error) => console.error('Assistant response background task failed:', error));
  },
  nowIso = () => new Date().toISOString()
}) {
  const hasFinalParts = Array.isArray(finalParts) && finalParts.length > 0;
  if (!hasFinalParts && !String(fullResponse || '').trim()) {
    throw new Error(getEmptyResponseMessage(uiLanguage));
  }

  // A template chosen in the composer is applied exactly: decks in the reply
  // keep only the preset and their accent colours, whatever else the model
  // wrote. The streamed view is redrawn so the cards carry the saved spec.
  if (!hasFinalParts) {
    const enforced = await enforceChosenDeckTemplate(fullResponse, conversation?.deckDesign);
    if (enforced !== fullResponse) {
      fullResponse = enforced;
      if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
    }
  }

  finalAiMessage.parts = hasFinalParts ? finalParts : [{ text: fullResponse }];
  const normalizedHistorySourceConversationIds = normalizeHistorySourceConversationIds(historySourceConversationIds);
  if (normalizedHistorySourceConversationIds.length > 0) {
    finalAiMessage.metadata = {
      ...(finalAiMessage.metadata || {}),
      historySourceConversationIds: normalizedHistorySourceConversationIds
    };
  }
  if (includeCouncilMetadata) {
    finalAiMessage.council = councilMetadata;
  }
  conversation.messages.push(finalAiMessage);
  conversation.lastUpdatedAt = nowIso();
  queueBackgroundTask(() => persistAppData());

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
  rememberRenderedMessage(targetElement, finalAiMessage);

  if (!hasFinalParts && !signal.aborted && !responseUsesCouncil) {
    scheduleVisionCheck({ conversation, message: finalAiMessage, targetElement });
  }

  if (!hasFinalParts && !signal.aborted && memoryEnabled && autoMemoryEnabled) {
    queueBackgroundTask(() => extractPersonalMemory(userMessageText, fullResponse));
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
  if (signal?.aborted) {
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
  rememberRenderedMessage(targetElement, finalAiMessage);

  return {
    errorMessage,
    finalAiMessage,
    persisted: true
  };
}
