import { getRuntimeText } from '../i18n/runtime-texts.js';
import { normalizeHistorySourceConversationIds } from '../memory-notes/history-sources.js';
import { isStaleChunkError, offerReloadForNewVersion, staleChunkMessage } from '../../../pwa/stale-chunk-recovery.js';
import { placePictures } from '../../../data/picture-interleave.js';
import { revealArrival } from '../../ui/motion/arrival-reveal.js';
import { takeTrace } from '../memory-store/memory-trace.js';
import { announceMemoryUpdated } from '../../ui/memory-notes/memory-events.js';

const getEmptyResponseMessage = (uiLanguage) => getRuntimeText(uiLanguage, 'emptyResponse');

// Only replies with a presentation or a Word or PDF document, in a
// conversation with a template for it, load the enforcer (and the design
// modules behind it).
const PPTX_FILE_BLOCK = /(?:^|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*file[ \t]+[^\n]*\.pptx[ \t]*(?:\n|$)/i;
const DOCX_FILE_BLOCK = /(?:^|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*file[ \t]+[^\n]*\.(?:docx|pdf)[ \t]*(?:\n|$)/i;
const TEMPLATE_ID = /^[a-z]+$/;
const chosen = (value) => Boolean(value) && value !== 'auto' && TEMPLATE_ID.test(value);
async function enforceChosenTemplates(text, { deckDesign, documentDesign } = {}) {
  const source = String(text || '');
  const deck = chosen(deckDesign) && PPTX_FILE_BLOCK.test(source);
  const document = chosen(documentDesign) && DOCX_FILE_BLOCK.test(source);
  if (!deck && !document) return text;
  try {
    const [enforcer, { DESIGN_PRESET_IDS }, { DOCUMENT_PRESET_IDS }] = await Promise.all([
      import('../../ui/files/design/deck-template-enforcer.js'),
      import('../../ui/files/design/design-presets.js'),
      import('../../ui/files/design/document-presets.js')
    ]);
    let output = text;
    if (deck && DESIGN_PRESET_IDS.includes(deckDesign)) output = enforcer.enforceDeckTemplate(output, deckDesign);
    if (document && DOCUMENT_PRESET_IDS.includes(documentDesign)) output = enforcer.enforceDocumentTemplate(output, documentDesign);
    return output;
  } catch (error) {
    console.error('Applying the chosen template failed:', error);
    return text;
  }
}

const rememberRenderedMessage = (targetElement, message) => {
  const messageElement = targetElement?.closest?.('[data-message-index]');
  if (messageElement) messageElement.__astraRenderedMessage = message;
};

// The text, then the files; the pictures a text model drew stand among the words where it drew them.
const partsWithPictures = (text, extraParts, offsets) => {
  const pictures = extraParts.filter((part) => part?.generatedImage);
  if (!pictures.length) return [{ text }, ...extraParts];
  return [...placePictures(text, pictures, offsets), ...extraParts.filter((part) => !part?.generatedImage)];
};

export async function finalizeAssistantResponse({
  fullResponse,
  finalParts = null,
  // Files made in Advanced mode, kept after the text.
  extraParts = [],
  // Where in the answer the pictures among `extraParts` that a text model drew stood: the message reads words, picture, words.
  pictureOffsets = [],
  // Pictures drawn into the page as they were made: what the first bubble shows (the rest is in the bubbles after the pictures), and that nothing is drawn again.
  viewResponse = null,
  picturesShown = false,
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
  learnEnabled,
  historySourceConversationIds = [],
  persistAppData,
  completeSingleModelView,
  restoreRealtimeCouncilDetails,
  renderRealtimeCouncilFinal,
  playbackCouncilResponse,
  learnFromTurn,
  completeImageView = null,
  // A text reply that has pictures in it (a text model drew them itself): the message is drawn again whole, so the pictures are there at once.
  showMessageWithPictures = null,
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

  // A template chosen in the composer is applied exactly: decks and Word
  // documents in the reply keep only the template and their accent colours,
  // whatever else the model wrote. The streamed view is redrawn so the cards
  // carry the saved content.
  if (!hasFinalParts) {
    const enforced = await enforceChosenTemplates(fullResponse, { deckDesign: conversation?.deckDesign, documentDesign: conversation?.documentDesign });
    if (enforced !== fullResponse) {
      fullResponse = enforced;
      if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
    }
  }

  finalAiMessage.parts = hasFinalParts ? finalParts : partsWithPictures(fullResponse, extraParts, pictureOffsets);
  const normalizedHistorySourceConversationIds = normalizeHistorySourceConversationIds(historySourceConversationIds);
  if (normalizedHistorySourceConversationIds.length > 0) {
    finalAiMessage.metadata = {
      ...(finalAiMessage.metadata || {}),
      historySourceConversationIds: normalizedHistorySourceConversationIds
    };
  }
  // What the memory did for this reply (notes given to the model, changes it made): shown under the reply, kept with the message.
  const memoryTrace = takeTrace(conversation?.id);
  let memoryLineAfterDraw = false;
  if (memoryTrace.used.length || memoryTrace.events.length) {
    memoryLineAfterDraw = true;
    finalAiMessage.metadata = {
      ...(finalAiMessage.metadata || {}),
      ...(memoryTrace.used.length ? { memoryUsed: memoryTrace.used } : {}),
      ...(memoryTrace.events.length ? { memoryUpdated: memoryTrace.events } : {})
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
      fullResponse: viewResponse ?? fullResponse,
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
  // The line under the reply about what the memory did (it was not there when the message was drawn).
  if (memoryLineAfterDraw) announceMemoryUpdated(globalThis.document, { conversationId: conversation?.id });
  targetElement?.querySelectorAll?.('.file-skeleton').forEach((placeholder) => placeholder.remove());
  // The files the reply made come in one after the other instead of appearing at once when the reply ends.
  if (finalAiMessage.parts.some((part) => part?.sandboxFile)) revealArrival(targetElement?.closest?.('[data-message-index]'), 'is-arriving-files');
  if (!hasFinalParts && !responseUsesCouncil && !picturesShown && showMessageWithPictures && finalAiMessage.parts.some((part) => part?.generatedImage)) {
    showMessageWithPictures({ finalAiMessage });
  }

  // A council's reply too: its synthesizer may have written a presentation (the check is made with the synthesizer).
  if (!hasFinalParts && !signal.aborted) {
    scheduleVisionCheck({ conversation, message: finalAiMessage, targetElement });
  }

  // The memory of notes learns from the turn (memory-store/page-curator.js), once the reply is written.
  if (!hasFinalParts && !signal.aborted && learnEnabled) {
    queueBackgroundTask(() => learnFromTurn(conversation));
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
  // The id of the message the server already wrote for this reply, when it was the server's.
  messageId = null,
  nowIso = () => new Date().toISOString()
}) {
  if (signal?.aborted) {
    return { persisted: false };
  }

  stopSingleModelLifecycle();
  // A page left open across a deployment cannot load the new build's files: say so, and offer a reload.
  const stale = isStaleChunkError(error);
  const errorMessage = stale
    ? staleChunkMessage()
    : `${errorPrefix || '抱歉，發生錯誤：'}${error.message || error.name || 'Unknown error'}`;
  if (stale) void offerReloadForNewVersion();
  const currentProgress = getLatestProgress() || {
    modelName: fallbackModelName,
    elapsedMs: 0
  };
  targetElement.innerHTML = renderError(currentProgress, errorMessage);
  const finalAiMessage = {
    ...(messageId ? { id: messageId } : {}),
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
