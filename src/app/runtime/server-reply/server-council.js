// A council the server holds (docs/superpowers/specs/2026-10-08-server-council-design.md), as the page asks for it: the same call as the page's own
// council (`runModelCouncil(parts, signal, onProgress, onFinalChunk, options) -> { text, metadata }`), so the progress panel, the synthesis as it
// is written and everything after stay as they are. The server is asked first; when it does not take the council (no cloud account, the setting
// says this device, the server cannot be reached ...) the page's own council is held, with no word of it.
//
// This module is loaded when a council is first held: most pages never hold one.

import { NOURAS_REQUEST_PURPOSE } from '../nouras/nouras-policy.js';

/**
 * Hands a council to the server: the models (as the page knows them), the message as the person sent it (attachments included: the server
 * translates them for the models that cannot read them, reads the pages in it and searches), the history, what each kind of call is told (put
 * together here, once for each purpose), and the key of every provider the models use. `deps` is what server-reply.js has for it. Resolves like
 * a reply's hand-over: { ok: true, run } or { ok: false, reason, notify } (the council is then held here).
 */
export async function startCouncilRun({ getApiKeyForProvider, describeRequest, searchKeyFor, withCloudFiles, request, flushSync, warn, clientVersion, createRun, reasons, protocol, maxChars }, { conversation, council, participants, synthesizer, translator = null, userParts, webSearch = 'off', config = {}, assistantMessageId, sequence = 0, uiLanguage = 'en', onMemoryContextResolved = () => {}, getHistorySourceIds = () => [] }) {
  const entry = (model) => ({ provider: model.provider, id: model.id, info: model });
  const keys = {};
  for (const model of [...participants, synthesizer, ...(translator ? [translator] : [])]) {
    keys[model.provider] ||= getApiKeyForProvider(model.provider);
    if (!keys[model.provider]) return { ok: false, reason: 'no-key', notify: false };
  }
  // The search is a packet (Tavily or TinyFish) unless the synthesizer is Gemini, which searches by itself.
  const search = webSearch === 'on' && synthesizer.provider !== 'gemini' ? searchKeyFor(config) : null;
  if (webSearch === 'on' && synthesizer.provider !== 'gemini' && !search) return { ok: false, reason: reasons.packetSearch, notify: false };
  let instructions;
  try {
    // What the app adds to every call (language, Noura, learning mode, memory, guidance), as the council's calls would get it here. The members
    // and the deliberation are told the same; the synthesis is the one that may write files, and it reports the memory the answer drew on.
    const describe = async (extra) => (await describeRequest(userParts, { conversation, modelInfo: synthesizer, ...extra })).systemInstructionText || '';
    const member = await describe({ requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_PARTICIPANT });
    instructions = { participant: member, deliberation: member, synthesis: await describe({ requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS, historyForApi: [], onMemoryContextResolved }) };
  } catch (error) {
    warn('Putting the request for the server together failed; the council is held here.', error);
    return { ok: false, reason: 'prepare-failed', notify: false };
  }
  const historySourceIds = getHistorySourceIds();
  const history = await withCloudFiles((conversation.messages || []).slice(0, -1).map((message) => ({ role: message.role, parts: message.parts })));
  const spec = {
    protocol: protocol,
    kind: 'council',
    clientVersion: String(clientVersion || '0'),
    conversationId: conversation.id,
    assistantMessageId,
    sequence,
    council: {
      mode: council.mode === 'deliberation' ? 'deliberation' : 'consensus',
      showRawResponses: council.showRawResponses !== false,
      showComparisonTable: council.showComparisonTable !== false,
      participants: participants.map(entry),
      synthesizer: entry(synthesizer),
      translator: translator ? entry(translator) : null
    },
    request: {
      history,
      currentMessage: { parts: userParts },
      systemInstructions: instructions,
      language: uiLanguage,
      ...(historySourceIds.length ? { messageMetadata: { historySourceConversationIds: historySourceIds } } : {})
    },
    tools: { webSearch, ...(search ? { searchProvider: search.searchProvider, searchDepth: search.searchDepth } : {}) },
    secrets: { keys, ...(search ? { searchKey: search.searchKey, ...(search.searchKeyAlt ? { searchKeyAlt: search.searchKeyAlt } : {}) } : {}) }
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
    // A server that is not yet updated does not know councils and calls the request malformed: the council is held here, with no word of it.
    const quiet = ['unsupported_mode', 'runs_unavailable', 'protocol_unsupported', 'conversation_not_found', 'invalid_run_spec'].includes(result.code);
    if (!busy && !quiet && result.code !== 'unreachable' && result.status !== 401) warn(`The server did not take the council (${result.code || result.status}).`);
    return { ok: false, reason: result.code || `http-${result.status}`, notify: busy ? 'busy' : quiet ? false : 'unreachable' };
  }
  const runId = result.data?.runId;
  if (!runId) return { ok: false, reason: 'bad-answer', notify: 'unreachable' };
  return { ok: true, run: createRun({ runId, assistantMessageId, kind: 'council' }) };
}

export function createServerCouncil({
  plan,
  start,
  notify,
  getCouncilSelectedModels,
  getCouncilTranslatorModel = () => null,
  getConfig = () => ({}),
  getUiLanguage = () => 'zh-TW',
  now = () => Date.now()
}) {
  /**
   * `args` are what the page gives its council: [parts, signal, onProgress, onFinalChunk]. `local` is the page's own council, `resumeRun` a
   * council the server is still holding (found again after the page was closed): it is only followed.
   */
  return async function holdCouncil({ args, local, webSearchEnabled = false, conversation, onMemoryContextResolved = () => {}, getHistorySourceIds = () => [], assistantMessageId = null, sequence = 0, resumeRun = null }) {
    const [parts, signal, onProgress, onFinalChunk] = args;
    let run = resumeRun;
    if (!run && assistantMessageId && plan({ conversation }).ok) {
      const { council, participants, synthesizer } = getCouncilSelectedModels(conversation);
      const attachments = (parts || []).some((part) => part?.inlineData);
      const started = await start({
        conversation,
        council,
        participants,
        synthesizer,
        // The model that writes the attachments down for the models that cannot read them (when there are any attachments).
        translator: attachments ? getCouncilTranslatorModel() : null,
        userParts: parts,
        webSearch: webSearchEnabled || conversation?.isWebSearchEnabled ? 'on' : 'off',
        config: getConfig(),
        assistantMessageId,
        sequence,
        uiLanguage: getUiLanguage(),
        onMemoryContextResolved,
        getHistorySourceIds
      });
      if (started.ok) run = started.run;
      else if (started.notify) notify(started.notify, getUiLanguage());
    }
    if (!run) return local(...args, { webSearchEnabled, conversation, onMemoryContextResolved });

    let tick = 0;
    const outcome = await run.follow({
      signal,
      onText: (delta) => onFinalChunk?.(delta),
      // The panel as the server has it; the seconds are the server's (the time here is only counted on from them).
      // A model leaves when the server is asked to let it (it tells every page how the council stands then).
      onCouncil: (state) => onProgress?.({ ...state, tick: (tick += 1), startedAt: now() - (Number(state.elapsedMs) || 0), exit: (modelId) => run.exitMember(modelId) })
    });
    const council = conversation?.council || {};
    return {
      text: outcome.text,
      // What the page keeps of a council it did not hold itself: the page only needs to know that this was one (the answer holds the rest).
      metadata: {
        mode: council.mode,
        participantModelIds: council.participantModelIds || [],
        activeParticipantModelIds: council.participantModelIds || [],
        skippedParticipantModelIds: [],
        synthesizerModelId: council.synthesizerModelId || null,
        sharedSearchPacket: null,
        secondSearchPacket: null,
        attachmentTranslation: null,
        showComparisonTable: council.showComparisonTable !== false,
        firstRoundResults: [],
        finalRoundResults: [],
        failures: [],
        synthesisError: null,
        serverRun: true
      }
    };
  };
}
