// A council the server holds (docs/superpowers/specs/2026-10-08-server-council-design.md), as the page asks for it: the same call as the page's own
// council (`runModelCouncil(parts, signal, onProgress, onFinalChunk, options) -> { text, metadata }`), so the progress panel, the synthesis as it
// is written and everything after stay as they are. The server is asked first; when it does not take the council (no cloud account, the setting
// says this device, the server cannot be reached ...) the page's own council is held, with no word of it.
//
// This module is loaded when a council is first held: most pages never hold one.

import { NOURAS_REQUEST_PURPOSE } from '../nouras/nouras-policy.js';
import { getAvailableSkills, resolveInvokedSkills } from '../skill/skill-bridge.js';
import { invokedSkillsInstruction, skillNamesOfParts } from '../../../data/skill-prompt.js';
import { cliIdsForReply } from '../cli/cli-state.js';
import { netPolicyForRun } from '../cli/net-state.js';
import { decisionsFor, verdictOf } from '../decisions/decision-store.js';
import { modelSupportsToolCalling, modelSupportsVision } from '../shell/model-registry.js';
import { resolveReplyMode } from '../sandbox/file-mode.js';
import { mayNeedFileGuidance } from '../../ui/files/file-intent.js';

/**
 * What the synthesizer of a council may use besides its words (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.2), by the rules of a
 * reply: Python when the person's mode is Advanced and the request is about files (or the conversation has some), the CLI tools chosen with "@"
 * (and those the model may use by itself) with the sites they may reach; then the Design menu's choices and the files of the message. And the visual
 * check of a presentation it writes, as for a reply: when the setting is on and the synthesizer can see images. Null for a model that calls no tools.
 */
export function councilSynthesisTools({ conversation, config = {}, synthesizer, userParts = [] }) {
  if (!modelSupportsToolCalling(synthesizer)) return null;
  const text = userParts.map((part) => part?.text || '').join('\n');
  const cli = cliIdsForReply(config, userParts, { ownAllowed: verdictOf(decisionsFor(text), 'tool') !== false });
  const mode = resolveReplyMode({ conversation, config, modelInfo: synthesizer, supportsToolCalling: modelSupportsToolCalling });
  const hasFiles = (conversation?.messages || []).some((message) => (message?.parts || []).some((part) => part?.inlineData || part?.sandboxFile));
  const fileTask = userParts.some((part) => part?.inlineData) || (verdictOf(decisionsFor(text), 'file') ?? mayNeedFileGuidance(text)) || hasFiles;
  const visionCheck = config.visionCheckEnabled !== false && synthesizer?.outputModality !== 'image' && modelSupportsVision(synthesizer)
    ? { visionCheck: { deckDesign: conversation?.deckDesign || 'auto', advanced: mode.advanced } }
    : {};
  if (!cli.ids.length && !(mode.advanced && fileTask)) return { advanced: false, ...visionCheck };
  const inputs = userParts.filter((part) => part?.inlineData?.data).map((part) => ({
    name: part.inlineData.name || `attachment.${String(part.inlineData.mimeType || '').split('/')[1] || 'bin'}`,
    mimeType: part.inlineData.mimeType || '',
    data: part.inlineData.data
  }));
  return {
    advanced: true,
    ...visionCheck,
    designs: { deck: conversation?.deckDesign || 'auto', document: conversation?.documentDesign || 'auto' },
    ...(inputs.length ? { inputs } : {}),
    ...(cli.ids.length ? { cli: cli.ids.map((id) => ({ id, chosen: cli.chosen.includes(id) })), net: netPolicyForRun(config) } : {})
  };
}

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
  // Each member searches by itself (docs/superpowers/specs/2026-10-19-council-tools-design.md): Gemini with Google, the others with Tavily or TinyFish
  // (without a key of them, they answer without searching, as they would here).
  const search = webSearch === 'on' ? searchKeyFor(config) : null;
  let instructions;
  try {
    // What the app adds to every call (language, Noura, learning mode, memory, guidance), as the council's calls would get it here. The members
    // and the deliberation are told the same; the synthesis is the one that may write files, and it reports the memory the answer drew on.
    // The skills asked for with "/" in this message are in every one of them.
    const skillText = invokedSkillsInstruction(await resolveInvokedSkills(skillNamesOfParts(userParts)));
    const describe = async (extra) => (await describeRequest(userParts, { conversation, modelInfo: synthesizer, ...(skillText ? { additionalSystemInstruction: skillText } : {}), ...extra })).systemInstructionText || '';
    const member = await describe({ requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_PARTICIPANT });
    instructions = { participant: member, deliberation: member, synthesis: await describe({ requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS, historyForApi: [], onMemoryContextResolved }) };
  } catch (error) {
    warn('Putting the request for the server together failed; the council is held here.', error);
    return { ok: false, reason: 'prepare-failed', notify: false };
  }
  // The skills the members may load by themselves (those asked for with "/" are given whole), and the person's connectors (only what may be read without asking).
  const skills = await getAvailableSkills(skillNamesOfParts(userParts)).catch(() => []);
  const synthesis = councilSynthesisTools({ conversation, config, synthesizer, userParts });
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
    tools: { webSearch, ...(search ? { searchProvider: search.searchProvider, searchDepth: search.searchDepth } : {}), ...(skills.length ? { skills } : {}), connectors: true, ...(synthesis ? { synthesis } : {}) },
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
  return { ok: true, run: createRun({ runId, assistantMessageId, kind: 'council', vision: result.data?.vision === true }) };
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
    // What the page adds (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.2): `synthesize` makes the synthesis of a council held here as a
    // reply; `followSynthesis(run)` follows the synthesis of one the server holds as a reply (from the moment it begins), and resolves { text, ... }.
    const [parts, signal, onProgress, onFinalChunk, { synthesize = null, followSynthesis = null } = {}] = args;
    let run = resumeRun;
    let madeHere = false;
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
      // Not taken because it could not be reached or was busy: the council is held here, and its line says so (no notice over the page).
      else if (started.notify === 'unreachable' || started.notify === 'busy') madeHere = true;
      else if (started.notify) notify(started.notify, getUiLanguage());
    }
    if (!run) {
      const held = await local(parts, signal, onProgress, onFinalChunk, { webSearchEnabled, conversation, onMemoryContextResolved, synthesize });
      return madeHere && held && typeof held === 'object' ? { ...held, madeHere: true } : held;
    }

    let tick = 0;
    const outcome = await run.follow({
      signal,
      onText: (delta) => onFinalChunk?.(delta),
      // The panel as the server has it; the seconds are the server's (the time here is only counted on from them).
      // A model leaves when the server is asked to let it (it tells every page how the council stands then).
      onCouncil: (state) => onProgress?.({ ...state, tick: (tick += 1), startedAt: now() - (Number(state.elapsedMs) || 0), exit: (modelId) => run.exitMember(modelId) }),
      handOver: typeof followSynthesis === 'function' ? (state) => state?.stage === 'synthesis' : null
    });
    const council = conversation?.council || {};
    // The synthesis is followed as a reply (its steps, its questions, its files): what it gives is the council's answer, as the server wrote it.
    const handed = outcome.handedOver ? await followSynthesis(run) : null;
    return {
      ...(handed ? { synthesis: handed } : {}),
      text: handed ? handed.text : outcome.text,
      ...(outcome.extraParts?.length ? { extraParts: outcome.extraParts } : {}),
      // The pages the members met (the head of the server's message, as a reply's sources are): the council gives them apart from its text.
      sources: outcome.run?.sources || [],
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
