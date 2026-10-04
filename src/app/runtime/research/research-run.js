// Starting a deep research and following it (loaded when the first one is started or found: the chat itself does not carry it). The research
// is a message of the conversation like any other, whose card the cards module draws from the store; the server does the work and may
// go on for hours with the page closed.

import { NOURAS_REQUEST_PURPOSE } from '../nouras/nouras-policy.js';
import { researchText } from './research-texts.js';
import { createResearchFollow } from './research-follow.js';
import { adoptMessage, updateResearch } from './research-store.js';

const failureKey = (reason) => (reason === 'busy' ? 'busy' : reason === 'unreachable' || reason === 'runs_unavailable' || reason === 'unsupported_mode' ? 'needServer' : 'startFailed');

export function createResearchRuntime({
  serverReply,
  addMessageToUI,
  saveAppData,
  showNotification,
  getSync,
  getLanguage,
  getConfig,
  releaseBusy,
  warn = () => {}
}) {
  const follow = createResearchFollow({ serverReply, getSync, saveAppData, warn });

  /**
   * Starts the research of `topic` (the person's message is shown and kept already: `prepared` is what the chat's preparation gave). The research
   * is a card in place of the reply; when the server cannot take it, the card says so.
   */
  const start = async ({ prepared, topic, modelInfo }) => {
    const { conversation, loadingMessageDiv } = prepared;
    const language = getLanguage();
    const assistantMessageId = crypto.randomUUID();
    const sequence = conversation.messages.length;
    const begun = Date.now();
    const message = {
      id: assistantMessageId,
      role: 'model',
      parts: [{ text: '' }, { researchPlan: { title: '', topic, items: [], phase: 'planning', stats: { searches: 0, sources: 0, activeMs: 0 }, clock: begun, countdownMs: 60000 } }],
      createdAt: new Date(begun).toISOString()
    };
    // The reply of the chat is replaced by the card: the busy state of the chat is let go, as the research goes on without the page.
    loadingMessageDiv?.remove?.();
    delete conversation.__astraPendingResponse;
    releaseBusy();
    adoptMessage(message);
    addMessageToUI(message, sequence, true, true, { conversation });
    const started = await serverReply.startResearch({
      conversation: { ...conversation, messages: conversation.messages.slice(0, sequence) },
      modelInfo,
      research: { topic },
      requestParts: [{ text: topic }],
      assistantMessageId,
      sequence,
      uiLanguage: language,
      config: getConfig(),
      requestOptions: { requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER }
    });
    if (!started.ok) {
      const failed = { ...message.parts[1].researchPlan, phase: 'failed', error: { code: started.reason || 'unreachable', message: researchText(language, failureKey(started.reason)) }, clock: Date.now() };
      message.parts[1] = { researchPlan: failed };
      updateResearch(assistantMessageId, { plan: failed });
      showNotification(researchText(language, failureKey(started.reason)), 'warning');
      void saveAppData().catch(warn);
      return { ok: false };
    }
    updateResearch(assistantMessageId, { runId: started.run.runId });
    void follow.attach({ runId: started.run.runId, messageId: assistantMessageId, getConversation: () => conversation });
    return { ok: true, runId: started.run.runId, messageId: assistantMessageId };
  };

  /** A research that the server is running when the page is opened again (or another page started it): followed from here. */
  const followRun = ({ run, conversation }) => {
    const message = conversation.messages.find((entry) => entry.id === run.assistantMessageId);
    if (message) adoptMessage(message);
    updateResearch(run.assistantMessageId, { runId: run.runId });
    return follow.attach({ runId: run.runId, messageId: run.assistantMessageId, getConversation: () => conversation });
  };

  return { start, followRun, control: follow.control, settle: follow.settle };
}
