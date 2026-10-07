// A reply the server is still making when the page is opened again (or returned to, or another chat is shown): it is shown being
// written, as if it had been started here. The half-written copy of the message that the cloud gave this page is taken out first.
// The reply itself is then followed and kept like any other (completeReply is the part of the submit that comes after the preparation).

const MIN_SECONDS_BETWEEN_LOOKS = 2;

export function createServerReplyReattach({
  getActiveConversation,
  getAbortController,
  setAbortController,
  serverReply,
  messageList,
  setSubmitBusy,
  addMessageToUI,
  completeReply,
  // A deep research the server is running: followed as a card (research/), not as a reply being written.
  followResearch = null,
  document,
  window,
  scheduleTimeout,
  logger = console,
  AbortController = globalThis.AbortController,
  now = () => Date.now()
}) {
  let reattaching = false;

  const reattachServerReply = async () => {
    const conv = getActiveConversation();
    if (!conv || reattaching || getAbortController() || conv.__astraPendingResponse) return false;
    reattaching = true;
    try {
      let run = null;
      try {
        run = await serverReply.find(conv.id);
      } catch (error) {
        logger?.warn?.('Looking for a reply of the server failed.', error);
        return false;
      }
      // Asked a moment ago: the reply may be over, a new one may have started here, another chat may have been opened.
      if (getAbortController() || conv.__astraPendingResponse || getActiveConversation()?.id !== conv.id) return false;
      // No reply under way, but the server may have failed one that never reached the chat (while the page was closed): it is told then.
      if (!run) {
        const failed = await serverReply.failedReply?.(conv).catch(() => null);
        if (!failed || getAbortController() || conv.__astraPendingResponse || getActiveConversation()?.id !== conv.id) return false;
        addMessageToUI(failed, conv.messages.length, true, true, { conversation: conv });
        return true;
      }
      // The visual check of a presentation that the server is making: its progress is shown under the last message, and the chat is locked.
      if (run.kind === 'vision') {
        void serverReply.followVision({ runId: run.runId, conversation: conv });
        return true;
      }
      if (run.kind === 'research' && followResearch) {
        void followResearch({ run, conversation: conv });
        return true;
      }
      const others = conv.messages.filter((message) => message.id !== run.assistantMessageId);
      const userMessageObject = others.at(-1);
      if (userMessageObject?.role !== 'user') return false;
      conv.messages.splice(0, conv.messages.length, ...others);
      [...messageList().children].find((element) => element.__astraRenderedMessage?.id === run.assistantMessageId)?.remove();
      const abortController = new AbortController();
      setAbortController(abortController);
      setSubmitBusy(true);
      // A picture the server is making is waited for under the same place-holder the page draws when it makes one itself.
      const loadingParts = run.kind === 'image' ? [{ imageGenerationLoading: true, imageAspectRatio: conv.imageConfig?.aspectRatio || '1:1' }] : [{ text: '...' }];
      const loadingMessageDiv = addMessageToUI({ role: 'model', parts: loadingParts, createdAt: new Date().toISOString() }, conv.messages.length, false, true, { conversation: conv });
      Object.defineProperty(conv, '__astraPendingResponse', { configurable: true, value: { loadingMessageDiv } });
      loadingMessageDiv.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
      await completeReply({
        abortController,
        contentDiv: loadingMessageDiv.querySelector('.message-content') || loadingMessageDiv,
        conversation: conv,
        loadingMessageDiv,
        // A council the server is holding is followed as the page's own would be (the panel, then the answer as it is written).
        responseUsesCouncil: run.kind === 'council',
        webSearchEnabled: false,
        userMessage: (userMessageObject.parts || []).map((part) => part.text || '').join(''),
        userMessageObject,
        userParts: []
      }, { resumeRun: run });
      return true;
    } finally {
      reattaching = false;
    }
  };

  // Looked for when the page opens, when it is returned to, and when another chat is shown: not more than once in a few seconds, and a
  // look asked for sooner waits until they are over.
  let timer = null;
  let lastLook = 0;
  const scheduleLook = (delay = 800) => {
    if (timer) return;
    timer = scheduleTimeout(() => {
      timer = null;
      lastLook = now();
      reattachServerReply().catch((error) => logger?.warn?.('Following the reply of the server failed.', error));
    }, Math.max(delay, MIN_SECONDS_BETWEEN_LOOKS * 1000 - (now() - lastLook)));
  };
  document?.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleLook(0); });
  window?.addEventListener?.('focus', () => scheduleLook(0));
  if (window?.MutationObserver && messageList()?.nodeType === 1) new window.MutationObserver(() => scheduleLook(250)).observe(messageList(), { childList: true });
  // The cloud sync may take a while to be ready after the page opens: look again a few times.
  for (const delay of [1000, 2500, 5000, 9000, 15000, 25000, 40000, 60000]) scheduleTimeout(() => scheduleLook(0), delay);

  return { reattachServerReply };
}
