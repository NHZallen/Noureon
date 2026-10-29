// A council made by the server (a run of `kind: 'council'`, docs/superpowers/specs/2026-10-08-server-council-design.md): the page's own
// council (council-response-lifecycle.js, which has no DOM and takes everything it needs from outside) run here, so it goes on when the page is
// closed. 2 to 5 models answer the message, a deliberation lets them answer again after reading each other, and a synthesizer writes the answer
// that is written into the message as it comes.
//
// What the page's version gets from the page, this gets from here: a call of one model with the key of its provider and the instructions of its
// purpose (the page put them together), the search (the same packet the page makes), a time limit for every call, and a memory of every call
// that finished, kept with the run's checkpoint so a council taken up after a restart does not ask those models again (the synthesis, which is
// written as it streams, is made again).
//
// A stop keeps what the synthesis had written. The council's detail (what each model answered) is not kept: the message is the text, with the
// "原始回答" block the council writes into it when the person asked for it.

import { createHash } from 'node:crypto';

import { createCouncilAttachmentNeed } from '../src/app/runtime/council/council-attachments.js';
import { createCouncilMembers } from '../src/app/runtime/council/council-member-reply.js';
import { createCouncilResponseLifecycle } from '../src/app/runtime/council/council-response-lifecycle.js';
import { buildTavilySearchQuery, formatTavilySearchPacket, getSearchCurrentDate, normalizePageReads, normalizeTinyfishSearch, withSearchContext } from '../src/app/runtime/reply/model-request-formatting.js';
import { createProviderRequestSupport } from '../src/app/runtime/reply/provider-request-support.js';
import { createStreamApiCall } from '../src/app/runtime/reply/stream-api-call.js';
import { getOpenAiSafetyIdentifier } from '../src/app/runtime/reply/openai-request.js';
import { formatSandboxRunBlock, hasSandboxRunBlock, liftSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { withCouncilRecord } from '../src/app/ui/council/council-record.js';
import { createSkillLoader } from '../src/data/skill-tool.js';
import { createServerOfficeReader } from './office-deps.js';
import { getCouncilRuntimeTexts } from '../src/app/runtime/shell/council-runtime-texts.js';
import {
  COUNCIL_MAX_MODELS,
  COUNCIL_RESPONSE_CHAR_LIMIT,
  COUNCIL_RETRY_DELAY_MS,
  COUNCIL_TEXT,
  getModelReasoningConfig,
  modelSupportsDocumentUpload,
  modelSupportsToolCalling,
  modelSupportsUploadedFile,
  modelSupportsVision,
  modelUsesNativeWebSearch,
  modelUsesTavilySearch,
  normalizeReasoningEffort
} from '../src/app/runtime/shell/model-registry.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';
import { executeReply, getErrorMessage, readErrorBody, ReplyError, scrubMessage, scrubText } from './executor.js';
import { ERROR_CODES, LIMITS } from './protocol.js';
import { combineLoaders, createConnectorLoader } from './mcp/tool-loader.js';
import { createUpstreamFetch } from './upstream-fetch.js';

export const COUNCIL_CHECKPOINT_VERSION = 2;
// What the memory of finished calls may hold in the checkpoint (the checkpoint is limited to 6 MB): a call after that is not remembered.
const MEMO_MAX_CHARS = 3_000_000;
const SEARCH_SOURCES = ['tavily', 'tinyfish'];

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener?.('abort', onAbort);
    resolve();
  }, ms);
  function onAbort() {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }
  signal?.addEventListener?.('abort', onAbort, { once: true });
});

/** The model as the page's code knows it: what the page said about it, with the id and provider the request names. */
const modelOf = (entry) => (entry ? { ...entry.info, id: entry.id, provider: entry.provider } : null);

/**
 * Makes the council. Resolves { parts, status, run, toolCalls } (status 'done' or 'stopped'); throws a ReplyError.
 * `resume` is the checkpoint of an earlier try (the memory of the calls that finished).
 */
export async function executeCouncil({
  spec,
  secrets,
  signal,
  resume = null,
  onUpdate = () => {},
  onLive = () => {},
  onCheckpoint = async () => {},
  onProblem = () => {},
  fetchImpl = fetch,
  now = Date.now,
  callTimeoutMs = LIMITS.councilCallMs,
  retryDelayMs = COUNCIL_RETRY_DELAY_MS,
  // Where the council hands out what a person's request to let a model leave goes to (`control.exit(modelId)`).
  control = {},
  // The person, their skills (server/skills.js) and connectors (server/mcp/connections.js): what the members may read by themselves.
  userId = '',
  skills = null,
  connectors = null,
  // What the synthesis, made as a reply (executor.js), may use besides: Python and its files, the CLI tools with their credentials, and the answers
  // of the person to the questions of a reply (the run manager's controls). `onPaused` gives back the time it waited for the person.
  sandboxHost = null,
  files = null,
  credentials = null,
  netControl = null,
  credentialControl = null,
  connectorControl = null,
  onPaused = () => {}
}) {
  const language = spec.request.language;
  const startedAt = now() - (Number(resume?.elapsedMs) || 0);
  const elapsed = () => now() - startedAt;
  const participants = spec.council.participants.map(modelOf);
  const synthesizer = modelOf(spec.council.synthesizer);
  const translator = modelOf(spec.council.translator);
  const allModels = [...participants, synthesizer, ...(translator ? [translator] : [])];
  const searchOn = spec.tools.webSearch === 'on';

  // The key of a provider (a model's) or of a search source (the chosen one and the other).
  const keyFor = (name) => {
    if (secrets.keys?.[name]) return secrets.keys[name];
    if (name === spec.tools.searchProvider) return secrets.searchKey || '';
    if (SEARCH_SOURCES.includes(name)) return secrets.searchKeyAlt || '';
    return '';
  };
  const config = {
    searchProvider: spec.tools.searchProvider,
    tavilySearchDepth: spec.tools.searchDepth === 'advanced' ? 'advanced' : 'basic',
    aiDefaultLanguage: language,
    uiLanguage: language,
    councilTranslatorModelId: translator?.id || null,
    memorySystemVersion: 1,
    memoryEnabled1: false,
    isLearningMode: false,
    // OpenAI's two settings (the page's): where its models search the web, and whether an identifier of the account goes with a request.
    openaiWebSearch: spec.tools.openaiWebSearch === 'provider' ? 'provider' : 'official',
    openaiSafetyIdentifier: spec.tools.openaiSafetyId !== false
  };
  const councilConfig = {
    enabled: true,
    mode: spec.council.mode,
    participantModelIds: participants.map((model) => model.id),
    synthesizerModelId: synthesizer.id,
    showRawResponses: spec.council.showRawResponses,
    showComparisonTable: spec.council.showComparisonTable
  };
  // Every model sees the conversation as the page has it: the history, then this message.
  const conversation = {
    id: spec.conversationId,
    messages: [...spec.request.history, { role: 'user', parts: spec.request.currentMessage.parts }],
    isWebSearchEnabled: searchOn,
    astrasId: null,
    genConfig: null,
    council: councilConfig
  };

  const upstreamFetch = createUpstreamFetch({ fetchImpl });
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => synthesizer,
    getModelApiId: (model) => model?.apiId || model?.id,
    getApiKeyForProvider: keyFor,
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => config,
    getAstras: () => [],
    getPersonalMemories: () => [],
    getMemoryContext: () => null,
    modelSupportsUploadedFile,
    modelSupportsVision,
    officeReader: createServerOfficeReader(),
    getModelReasoningConfig,
    normalizeReasoningEffort,
    getSafetyIdentifier: () => getOpenAiSafetyIdentifier(config, userId),
    fetchImpl: upstreamFetch,
    warn: () => {}
  });

  // The page puts together what each kind of call is told (memory, the persona, the learning mode, the guidance for files), once for each purpose.
  const instructions = spec.request.systemInstructions;
  const instructionFor = {
    [NOURAS_REQUEST_PURPOSE.COUNCIL_PARTICIPANT]: instructions.participant,
    [NOURAS_REQUEST_PURPOSE.COUNCIL_DELIBERATION]: instructions.deliberation,
    [NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS]: instructions.synthesis
  };
  const callModel = (parts, onChunk, callSignal, forceWebSearch, options = {}) => streamApiCall(parts, onChunk, callSignal, forceWebSearch, {
    ...options,
    ...(options.requestPurpose in instructionFor ? { systemInstructionText: instructionFor[options.requestPurpose] } : {})
  });

  // ----- the memory of the calls that finished (kept with the checkpoint)
  // A checkpoint of another version (the members answered another way then) is not taken up.
  const resumed = resume?.version === COUNCIL_CHECKPOINT_VERSION ? resume : null;
  const memo = new Map(Object.entries(resumed?.memo && typeof resumed.memo === 'object' ? resumed.memo : {}));
  let memoChars = [...memo.values()].reduce((sum, value) => sum + String(value).length, 0);
  let saving = Promise.resolve();
  // The models that left the council (kept with the checkpoint, so a council taken up again does not ask them).
  const exited = new Set(Array.isArray(resumed?.exited) ? resumed.exited : []);
  const save = () => {
    // One save after another, so an older one never lands after a newer one.
    saving = saving
      .then(() => onCheckpoint({ version: COUNCIL_CHECKPOINT_VERSION, kind: 'council', elapsedMs: elapsed(), memo: Object.fromEntries(memo), exited: [...exited], sources: members?.sources() || [] }))
      .catch((error) => onProblem('council_checkpoint_failed', error));
  };
  const remember = (key, value) => {
    const text = String(value ?? '');
    if (memoChars + text.length > MEMO_MAX_CHARS) return;
    memo.set(key, text);
    memoChars += text.length;
    save();
  };

  // ----- a call of a model: with a time limit, one more try, and the memory
  const isSynthesis = (options) => options.requestPurpose === NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS;
  const timedCall = async (parts, onChunk, callSignal, forceWebSearch, options) => {
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(), callTimeoutMs);
    const timeout = limit.signal;
    const combined = AbortSignal.any([...(signal ? [signal] : []), ...(callSignal ? [callSignal] : []), timeout]);
    try {
      return await callModel(parts, onChunk, combined, forceWebSearch, options);
    } catch (error) {
      if (timeout.aborted && !signal?.aborted) {
        const timedOut = new Error(`The model did not answer within ${Math.round(callTimeoutMs / 60000)} minutes.`);
        timedOut.timedOut = true;
        throw timedOut;
      }
      // What a provider says about a failure may repeat the key it was given: the council writes these messages into the answer.
      if (error?.message) error.message = scrubText(error.message, secrets);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  const streamCouncilApiCallWithRetry = async (parts, onChunk, callSignal, forceWebSearch = false, requestOptions = {}) => {
    const { onRetry, ...options } = requestOptions;
    const key = isSynthesis(options) ? null : `call:${hash([options.requestPurpose, options.modelInfo?.id, Boolean(forceWebSearch), parts])}`;
    if (key && memo.has(key)) {
      const cached = memo.get(key);
      onChunk?.(cached);
      return cached;
    }
    let emitted = 0;
    const counting = (chunk) => {
      emitted += String(chunk ?? '').length;
      onChunk?.(chunk);
    };
    let result;
    try {
      result = await timedCall(parts, counting, callSignal, forceWebSearch, options);
    } catch (firstError) {
      if (firstError?.name === 'AbortError' || callSignal?.aborted || signal?.aborted || firstError?.timedOut) throw firstError;
      // What the synthesis has written is already on its way to the pages: a second try would write it twice.
      if (isSynthesis(options) && emitted > 0) throw firstError;
      if (typeof onRetry === 'function') onRetry(firstError);
      await wait(retryDelayMs, callSignal || signal);
      try {
        result = await timedCall(parts, onChunk, callSignal, forceWebSearch, options);
      } catch (secondError) {
        if (secondError?.name === 'AbortError' || callSignal?.aborted || signal?.aborted || secondError?.timedOut) throw secondError;
        const error = new Error(`${secondError?.message || 'API request failed'} (retried once; first attempt: ${firstError?.message || 'unknown error'})`);
        error.name = secondError?.name || 'Error';
        throw error;
      }
    }
    if (key) remember(key, result);
    return result;
  };

  // ----- the search and the pages: the page's own steps, with the memory
  const support = createProviderRequestSupport({
    buildTavilySearchQuery,
    formatTavilySearchPacket,
    normalizeTinyfishSearch,
    normalizePageReads,
    withSearchContext,
    getErrorMessage,
    readErrorBody,
    getApiKeyForProvider: keyFor,
    getConfig: () => config,
    streamApiCall: timedCall,
    fetchImpl: upstreamFetch,
    getSingleDocumentTranslatorModel: () => null,
    modelUsesTavilySearch: (model) => modelUsesTavilySearch(model, config),
    modelSupportsUploadedFile,
    councilResponseCharLimit: COUNCIL_RESPONSE_CHAR_LIMIT,
    councilRetryDelayMs: retryDelayMs
  });
  const remembered = (kind, run) => async (...args) => {
    const key = `${kind}:${hash(args.filter((arg) => typeof arg !== 'function' && !(arg instanceof AbortSignal)).map((arg) => (arg && typeof arg === 'object' && !Array.isArray(arg) ? { ...arg, onSources: undefined, onProgress: undefined, conversation: undefined, modelInfo: arg.modelInfo?.id } : arg)))}`;
    if (memo.has(key)) return memo.get(key);
    const value = await run(...args);
    remember(key, value);
    return value;
  };

  // ----- the members: each searches, opens pages, loads skills and reads the connectors by itself (only what may be read without asking)
  let connectorList = null;
  const connectorClients = new Map();
  const readableConnectors = async () => {
    if (connectorList) return connectorList;
    connectorList = [];
    if (!connectors || spec.tools.connectors !== true || !userId) return connectorList;
    try {
      connectorList = (await connectors.forRun(userId))
        .map((connector) => ({ ...connector, tools: connector.tools.filter((tool) => tool.kind === 'read' && tool.state === 'allow') }))
        .filter((connector) => connector.tools.length);
    } catch (error) {
      onProblem('connectors_failed', error);
    }
    return connectorList;
  };
  const loadersFor = async () => {
    const listed = skills ? spec.tools.skills || [] : [];
    const skillLoader = listed.length ? createSkillLoader({ available: listed, lookup: (name) => skills.body(userId, name), readFile: skills.readFile ? (name, path) => skills.readFile(userId, name, path) : null }) : null;
    const readable = await readableConnectors();
    const connectorLoader = readable.length ? createConnectorLoader({
      connectors: readable,
      language,
      signal,
      callTool: (id, name, args, options) => {
        if (!connectorClients.has(id)) connectorClients.set(id, connectors.clientFor(userId, id));
        return connectorClients.get(id).callTool(name, args, options);
      }
    }) : null;
    return combineLoaders(skillLoader, connectorLoader);
  };
  const members = createCouncilMembers({
    streamApiCall: timedCall,
    research: support.hasSearchKey() ? { searchWeb: support.searchWeb, openPage: support.fetchPageContents } : null,
    canCallTools: modelSupportsToolCalling,
    usesNativeSearch: (model) => modelUsesNativeWebSearch(model, config),
    loadersFor,
    fetchPacket: remembered('search', (query, packetSignal) => support.fetchTavilySearchPacket(query, packetSignal, { label: 'Council member web search packet', maxResults: 6 })),
    buildQuery: (parts, modelInfo, querySignal) => support.buildSearchQuery(spec.request.currentMessage.parts, { conversation, modelInfo, signal: querySignal }),
    language,
    retryDelayMs,
    sources: Array.isArray(resumed?.sources) ? resumed.sources : []
  });
  // A member's whole answer (its searches and rounds) is kept once it is done: a council taken up again does not ask it again.
  const rememberedMembers = {
    ...members,
    async answer(options) {
      const key = `member:${hash([options.requestOptions?.requestPurpose, options.modelInfo?.id, Boolean(options.searchOn), options.parts])}`;
      if (memo.has(key)) {
        try {
          const cached = JSON.parse(memo.get(key));
          for (const step of cached.steps || []) options.onStep?.(step);
          options.onChunk?.(cached.text);
          return cached.text;
        } catch {
          memo.delete(key);
        }
      }
      const steps = [];
      const text = await members.answer({ ...options, onStep: (step) => { steps.push(step); options.onStep?.(step); } });
      remember(key, JSON.stringify({ text, steps: steps.slice(-30) }));
      return text;
    }
  };

  // ----- what the page sees: the progress of the council, and the words of the synthesis as they are written
  let answer = '';
  // What makes a model leave is handed out by the council with every report of how it stands; a request before the first one has nobody to go to.
  let leave = null;
  control.exit = (modelId) => Boolean(leave?.(modelId));
  const onProgress = (progress) => {
    leave = progress.exit;
    onLive({
      cs: {
        stage: progress.stage,
        message: progress.message,
        mode: progress.mode,
        elapsedMs: elapsed(),
        searchEnabled: progress.searchEnabled,
        totalParticipants: progress.totalParticipants,
        activeParticipants: progress.activeParticipants,
        modelStates: progress.modelStates,
        search: progress.search,
        stages: progress.stages
      }
    });
  };
  const onFinalChunk = (chunk) => {
    if (!chunk) return;
    answer += chunk;
    onLive({ a: chunk });
    onUpdate([{ text: answer }]);
  };
  onLive({ r: { answer: '', thought: { text: '', kind: 'model', ended: false, ms: 0 }, sources: [], elapsedMs: elapsed() } });

  const lifecycle = createCouncilResponseLifecycle({
    getSearchCurrentDate,
    getConfig: () => config,
    getActiveConversation: () => conversation,
    // The models are the ones the request names (as the page knows them), not the server's own list.
    getCouncilSelectedModels: () => ({ council: councilConfig, participants, synthesizer }),
    getCouncilTexts: () => COUNCIL_TEXT[language] || COUNCIL_TEXT['zh-TW'],
    getCouncilRuntimeTexts: () => getCouncilRuntimeTexts(language),
    getCouncilAttachmentTranslationNeed: createCouncilAttachmentNeed({ modelSupportsVision, modelSupportsDocumentUpload }),
    getCouncilTranslatorModel: () => translator,
    models: allModels,
    councilMaxModels: COUNCIL_MAX_MODELS,
    extractTextFromParts: support.extractTextFromParts,
    truncateCouncilText: support.truncateCouncilText,
    filterPartsForModelCapability: support.filterPartsForModelCapability,
    readLinkedPages: remembered('pages', support.readLinkedPages),
    readsLinkedPages: support.readsLinkedPages,
    streamCouncilApiCallWithRetry,
    createMembers: () => rememberedMembers,
    modelSupportsVision,
    modelSupportsDocumentUpload
  });

  // The message: the pages the members met (as a reply keeps its sources, so the answer's [n] are links), then the text. A synthesis made as a
  // reply has its own record at the head already (its steps, with the members' pages).
  const withSources = (text) => {
    const sources = members.sources();
    return sources.length && !hasSandboxRunBlock(text) ? `${formatSandboxRunBlock({ status: 'done', steps: [], elapsedMs: elapsed(), sources })}${text}` : text;
  };

  // ----- the synthesis, made as a reply (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.2): it searches nothing (the members did), and
  // may use everything else a reply has: files and Python, CLI tools, connectors that change things (each asked as the person set it), skills.
  // Its words, steps and questions reach the pages as a reply's do; the message is written as it goes.
  const synthesisEntry = spec.council.synthesizer;
  let synthesisParts = null;
  let synthesisMade = null;
  // What the synthesis was made from (the reply's own request and keys): the visual check that may follow is made with it.
  let synthesisReply = null;
  const synthesisTools = spec.tools.synthesis || {};
  const withPython = Boolean(synthesisTools.advanced && sandboxHost?.configured && files);
  const synthesize = async ({ parts: requestParts, instruction, sources }) => {
    synthesisReply = {
      spec: {
        protocol: spec.protocol,
        clientVersion: spec.clientVersion,
        conversationId: spec.conversationId,
        assistantMessageId: spec.assistantMessageId,
        sequence: spec.sequence,
        model: { provider: synthesisEntry.provider, id: synthesizer.apiId || synthesizer.id, info: synthesizer },
        request: { history: [], currentMessage: { parts: requestParts }, systemInstruction: [instructions.synthesis, instruction].filter(Boolean).join('\n\n'), language },
        tools: {
          webSearch: 'off',
          searchProvider: spec.tools.searchProvider,
          searchDepth: spec.tools.searchDepth,
          ...(spec.tools.openaiWebSearch ? { openaiWebSearch: spec.tools.openaiWebSearch } : {}),
          ...(spec.tools.openaiSafetyId === false ? { openaiSafetyId: false } : {}),
          advanced: false,
          // Python (and the CLI tools, which run in its sandbox) only where the server has a sandbox; the visual check in any case.
          ...(withPython ? synthesisTools : synthesisTools.visionCheck ? { visionCheck: { ...synthesisTools.visionCheck, advanced: false } } : {}),
          ...(spec.tools.skills ? { skills: spec.tools.skills } : {}),
          ...(spec.tools.connectors ? { connectors: true } : {})
        }
      },
      secrets: { providerKey: keyFor(synthesisEntry.provider), ...(secrets.searchKey ? { searchKey: secrets.searchKey } : {}), ...(secrets.searchKeyAlt ? { searchKeyAlt: secrets.searchKeyAlt } : {}) }
    };
    const result = await executeReply({
      ...synthesisReply,
      signal,
      userId,
      sandboxHost,
      files,
      credentials,
      skills,
      connectors,
      netControl,
      credentialControl,
      connectorControl,
      knownSources: sources,
      onPaused,
      // No page takes a council's synthesis over when the server's Python is lost: it goes on without Python.
      watching: () => false,
      onUpdate: (parts) => {
        synthesisParts = parts;
        onUpdate(parts);
      },
      onLive,
      onProblem,
      fetchImpl,
      now
    });
    synthesisMade = result;
    return { text: String(result.parts[0]?.text ?? ''), extraParts: result.parts.slice(1) };
  };
  const closeConnectors = () => Promise.all([...connectorClients.values()].map((client) => client.close().catch(() => {})));

  let outcome;
  try {
    outcome = await lifecycle.runModelCouncil(spec.request.currentMessage.parts, signal, onProgress, onFinalChunk, {
      webSearchEnabled: searchOn,
      conversation,
      exitedModelIds: [...exited],
      onMemberExit: (modelId) => {
        exited.add(modelId);
        save();
      },
      synthesize
    });
  } catch (error) {
    await saving;
    await closeConnectors();
    // A stop keeps what the synthesis had written.
    if (signal?.aborted) return { parts: synthesisParts || [{ text: withSources(answer) }], status: 'stopped', run: { elapsedMs: elapsed() }, toolCalls: 0 };
    throw new ReplyError(scrubMessage(error?.message, secrets), ERROR_CODES.providerError);
  }
  await saving;
  await closeConnectors();
  const text = String(outcome?.text ?? '');
  // A stop that came while the synthesis was being written: the council gives its members' answers instead of it, but the person stopped it.
  const extraParts = outcome?.synthesis?.extraParts || [];
  const toolCalls = synthesisMade?.toolCalls || 0;
  // The message keeps the council's line and timeline (its members, its stages) at its head.
  const recorded = (value) => withCouncilRecord(value, outcome?.record, { elapsedMs: elapsed() });
  if (signal?.aborted) return { parts: synthesisParts ? [{ text: recorded(withSources(String(synthesisParts[0]?.text ?? ''))) }, ...extraParts] : [{ text: recorded(withSources(answer)) }], status: 'stopped', run: { elapsedMs: elapsed() }, toolCalls };
  const written = scrubText(text, secrets);
  // What the council adds after the synthesis (the blocks of the first answers) reaches the pages that are watching (the words of a synthesis
  // made as a reply went to them without its record).
  const shown = synthesisMade ? liftSandboxRunBlock(String(synthesisMade.parts[0]?.text ?? '')).text : answer;
  const writtenText = liftSandboxRunBlock(written).text;
  if (writtenText.startsWith(shown) && writtenText.length > shown.length) onLive({ a: writtenText.slice(shown.length) });
  return {
    parts: [{ text: recorded(withSources(written)) }, ...extraParts],
    status: 'done',
    run: { ...(synthesisMade?.run || {}), elapsedMs: elapsed() },
    toolCalls,
    ...(synthesisMade?.artifacts ? { artifacts: synthesisMade.artifacts } : {}),
    // The synthesis as a reply (its request and keys), for the visual check of the presentations it wrote (server/runs.js).
    ...(synthesisMade && synthesisReply?.spec.tools.visionCheck ? { visionSource: synthesisReply } : {})
  };
}
