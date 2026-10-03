// A reply the server is still making when the page is opened again (or returned to, or another chat is shown): it is shown being
// written, as if it had been started here. The half-written copy of the message that the cloud gave this page is taken out first.
// The reply itself is then followed and kept like any other (completeReply is the part of the submit that comes after the preparation).

const MIN_SECONDS_BETWEEN_LOOKS = 5;

export function createServerReplyReattach({
  getActiveConversation,
  getAbortController,
  setAbortController,
  serverReply,
  messageList,
  setSubmitBusy,
  addMessageToUI,
  completeReply,
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
    if (!conv || reattaching || getAbortController() || conv.__astraPendingResponse || !serverReply.hasAccount()) return false;
    reattaching = true;
    try {
      let run = null;
      try {
        run = await serverReply.find(conv.id);
      } catch {
        return false;
      }
      // Asked a moment ago: the reply may be over, a new one may have started here, another chat may have been opened.
      if (!run || getAbortController() || conv.__astraPendingResponse || getActiveConversation()?.id !== conv.id) return false;
      const others = conv.messages.filter((message) => message.id !== run.assistantMessageId);
      const userMessageObject = others.at(-1);
      if (userMessageObject?.role !== 'user') return false;
      conv.messages.splice(0, conv.messages.length, ...others);
      [...messageList().children].find((element) => element.__astraRenderedMessage?.id === run.assistantMessageId)?.remove();
      const abortController = new AbortController();
      setAbortController(abortController);
      setSubmitBusy(true);
      const loadingMessageDiv = addMessageToUI({ role: 'model', parts: [{ text: '...' }], createdAt: new Date().toISOString() }, conv.messages.length, false, true, { conversation: conv });
      Object.defineProperty(conv, '__astraPendingResponse', { configurable: true, value: { loadingMessageDiv } });
      loadingMessageDiv.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
      await completeReply({
        abortController,
        contentDiv: loadingMessageDiv.querySelector('.message-content') || loadingMessageDiv,
        conversation: conv,
        loadingMessageDiv,
        responseUsesCouncil: false,
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
  document?.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleLook(300); });
  window?.addEventListener?.('focus', () => scheduleLook(300));
  if (window?.MutationObserver && messageList()?.nodeType === 1) new window.MutationObserver(() => scheduleLook(1000)).observe(messageList(), { childList: true });
  for (const delay of [3000, 9000, 20000]) scheduleTimeout(() => scheduleLook(0), delay);

  return { reattachServerReply };
}
