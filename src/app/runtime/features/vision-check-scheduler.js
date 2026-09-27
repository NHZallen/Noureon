// Keeps V1's heavy renderer and font pipeline outside the chat startup chunk.
import { conversationImageSources } from '../../ui/files/conversation-images.js';

export function createVisionCheckScheduler({ getConfig, getActiveConversation, normalizeConversationModel,
  isCouncilEnabled, modelSupportsVision, streamApiCall, document, window, notificationContainer,
  addMessageToUI, saveAppData, showNotification, crypto, logger = console,
  AbortController = globalThis.AbortController }) {
  const jobs = new Map();
  const cancel = conversationId => {
    jobs.get(conversationId)?.abort();
  };
  const schedule = ({ conversation, message }) => {
    const model = normalizeConversationModel(conversation);
    if (getConfig().visionCheckEnabled === false || isCouncilEnabled(conversation)
      || !modelSupportsVision(model) || model?.outputModality === 'image'
      || !/(?:`{3,}|~{3,})\s*file\s+[^\n]*\.pptx/i.test(message.parts?.[0]?.text || '')) return;
    const controller = new AbortController();
    const imageSources = conversationImageSources(document);
    jobs.set(conversation.id, controller);
    void import('../../ui/files/vision/vision-check.js').then(({ runVisionCheck }) => runVisionCheck({
      conversation, message, model, config: getConfig(), controller,
      modelSupportsVision, streamApiCall, document, window, notificationContainer,
      getActiveConversation, addMessageToUI, saveAppData, showNotification, crypto, imageSources
    })).catch(error => logger.error?.('Visual check failed:', error)).finally(() => {
      if (jobs.get(conversation.id) === controller) jobs.delete(conversation.id);
    });
  };
  return { schedule, cancel };
}
