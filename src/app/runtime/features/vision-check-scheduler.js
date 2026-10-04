// Keeps V1's heavy renderer and font pipeline outside the chat startup chunk.
import { conversationImageSources } from '../../ui/files/conversation-images.js';
import { freeDecks } from '../../ui/files/vision/free-decks.js';

export function createVisionCheckScheduler({ getConfig, getActiveConversation, normalizeConversationModel,
  isCouncilEnabled, modelSupportsVision, streamApiCall, document, window, notificationContainer,
  addMessageToUI, saveAppData, showNotification, crypto, logger = console, onChange = () => {},
  AbortController = globalThis.AbortController }) {
  const jobs = new Map();
  // A chat with a check under way is locked for sending until the check is done or stopped: the check is looking at
  // the message above it, and a new message would start another answer over it.
  const isRunning = conversationId => jobs.has(conversationId);
  const changed = () => { try { onChange([...jobs.keys()]); } catch (error) { logger.error?.(error); } };
  const cancel = conversationId => {
    jobs.get(conversationId)?.abort();
  };
  const schedule = ({ conversation, message, targetElement = null }) => {
    const model = normalizeConversationModel(conversation);
    if (getConfig().visionCheckEnabled === false || isCouncilEnabled(conversation)
      || !modelSupportsVision(model) || model?.outputModality === 'image'
      || !(/(?:`{3,}|~{3,})\s*file\s+[^\n]*\.pptx/i.test(message.parts?.[0]?.text || '') || freeDecks(message).length)) return;
    const controller = new AbortController();
    const release = () => {
      if (jobs.get(conversation.id) !== controller) return;
      jobs.delete(conversation.id);
      changed();
    };
    const imageSources = conversationImageSources(document);
    jobs.set(conversation.id, controller);
    changed();
    // Stopping frees the chat at once, without waiting for the check to wind down.
    controller.signal.addEventListener('abort', () => release(), { once: true });
    void import('../../ui/files/vision/vision-check.js').then(({ runVisionCheck }) => runVisionCheck({
      conversation, message, model, config: getConfig(), controller,
      modelSupportsVision, streamApiCall, document, window, notificationContainer,
      getActiveConversation, addMessageToUI, saveAppData, showNotification, crypto, imageSources,
      // The check's step list goes under the message it checks.
      host: targetElement?.closest?.('.message-stack') || null
    })).catch(error => logger.error?.('Visual check failed:', error)).finally(() => {
      release();
    });
  };
  return { schedule, cancel, isRunning };
}
