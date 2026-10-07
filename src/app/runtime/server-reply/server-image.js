// The parts of an image made by the server (docs/superpowers/specs/2026-10-06-server-image-generation-design.md) that only a page making an
// image needs: handing it over, and following it until it is over. Loaded when the first image is made (server-reply.js gives it what it uses).

/**
 * Hands the making of an image to the server (docs/superpowers/specs/2026-10-06-server-image-generation-design.md): the prompt, the shape and
 * size and the pictures to start from (data addresses), with the key of OpenRouter. Resolves like `begin`: { ok: true, run } or
 * { ok: false, reason, notify } (the image is then made here).
 */
export async function startImageRun({ getApiKeyForProvider, getModelApiId, flushSync, request, warn, clientVersion, createRun, reasons, protocol, maxChars }, { conversation, modelInfo, prompt, config = {}, references = [], assistantMessageId, sequence = 0, uiLanguage = 'en' }) {
  const providerKey = getApiKeyForProvider(modelInfo?.provider);
  if (!providerKey) return { ok: false, reason: 'no-key', notify: false };
  // Only what has a value goes (the server refuses an empty text); the pictures go as they are, and a request too large is made here.
  const imageConfig = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  const spec = {
    protocol,
    kind: 'image',
    clientVersion: String(clientVersion || '0'),
    conversationId: conversation.id,
    assistantMessageId,
    sequence,
    model: { provider: modelInfo.provider, id: getModelApiId(modelInfo), info: modelInfo },
    request: { language: uiLanguage },
    image: { prompt, config: imageConfig, references },
    secrets: { providerKey }
  };
  const body = JSON.stringify(spec);
  if (body.length > maxChars) return { ok: false, reason: reasons.tooLarge, notify: false };
  try {
    await flushSync();
  } catch (error) {
    warn('Saving the conversation before the server starts failed.', error);
  }
  const result = await request('POST', '/v1/runs', { body });
  if (!result.ok) {
    const busy = result.code === 'too_many_runs' || result.code === 'rate_limited';
    // A server that is not yet updated does not know images and calls the request malformed: the picture is made here, with no word of it.
    const quiet = ['unsupported_mode', 'runs_unavailable', 'protocol_unsupported', 'conversation_not_found', 'invalid_run_spec'].includes(result.code);
    if (!busy && !quiet && result.code !== 'unreachable' && result.status !== 401) warn(`The server did not take the image (${result.code || result.status}).`);
    return { ok: false, reason: result.code || `http-${result.status}`, notify: busy ? 'busy' : quiet ? false : 'unreachable' };
  }
  const runId = result.data?.runId;
  if (!runId) return { ok: false, reason: 'bad-answer', notify: 'unreachable' };
  return { ok: true, run: createRun({ runId, assistantMessageId, kind: 'image' }) };
}

/**
 * Follows an image the server is making until it is over: resolves { parts } (the message parts of the pictures, their files brought here;
 * none when it was stopped) or throws a ServerReplyError. A stop (`signal`) is told to the server, and the end is still waited for.
 */
export async function followImageRun({ stop, watchRun, readMessage, hydrateParts, wait, setTimer, clearTimer, warn, ServerReplyError, graceMs, runId, assistantMessageId }, { signal } = {}) {
    let stopSent = false;
    const watching = new AbortController();
    let graceTimer = null;
    const onStopAsked = () => {
      if (stopSent) return;
      stopSent = true;
      void stop().catch(() => {});
      // The server says it is over once the message is written; a little time is given for that, then the message is read as it is.
      graceTimer = setTimer(() => watching.abort(), graceMs);
    };
    if (signal?.aborted) onStopAsked();
    signal?.addEventListener?.('abort', onStopAsked, { once: true });
    try {
      await watchRun(runId, { signal: watching.signal });
    } finally {
      signal?.removeEventListener?.('abort', onStopAsked);
      if (graceTimer) clearTimer(graceTimer);
    }
    // The end of the message is written before the run says it is over; it is read a few times in case the cloud is a moment behind.
    let row = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        row = await readMessage(assistantMessageId);
      } catch (error) {
        warn('Reading the image failed; trying again.', error);
      }
      if (row && (row.status === 'complete' || row.status === 'error')) break;
      await wait(1000);
    }
    if (!row || (row.status !== 'complete' && row.status !== 'error')) throw new ServerReplyError('The image did not finish.', 'time_limit');
    if (row.status === 'error') {
      const failure = row.metadata?.serverError || {};
      throw new ServerReplyError(failure.message || 'The server could not finish this image.', failure.code || 'unknown');
    }
    const pictures = (Array.isArray(row.parts) ? row.parts : []).filter((part) => part?.generatedImage);
    if (!pictures.length) return { parts: [] };
    let parts = pictures;
    try {
      parts = await hydrateParts(pictures);
    } catch (error) {
      warn('Bringing the pictures here failed; the cloud sync brings them later.', error);
    }
    return { parts };
}
