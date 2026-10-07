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

import { createCouncilAttachmentNeed } from '../src/app/legacy-runtime/features/council-attachments.js';
import { createCouncilResponseLifecycle } from '../src/app/legacy-runtime/features/council-response-lifecycle.js';
import { buildTavilySearchQuery, formatTavilySearchPacket, getSearchCurrentDate, normalizePageReads, normalizeTinyfishSearch, withSearchContext } from '../src/app/legacy-runtime/features/model-request-formatting.js';
import { createProviderRequestSupport } from '../src/app/legacy-runtime/features/provider-request-support.js';
import { createStreamApiCall } from '../src/app/legacy-runtime/features/stream-api-call.js';
import { getCouncilRuntimeTexts } from '../src/app/runtime/legacy-core/council-runtime-texts.js';
import {
  COUNCIL_MAX_MODELS,
  COUNCIL_RESPONSE_CHAR_LIMIT,
  COUNCIL_RETRY_DELAY_MS,
  COUNCIL_TEXT,
  getModelReasoningConfig,
  modelSupportsDocumentUpload,
  modelSupportsUploadedFile,
  modelSupportsVision,
  modelSupportsWebSearch,
  modelUsesNativeWebSearch,
  modelUsesTavilySearch,
  normalizeReasoningEffort
} from '../src/app/runtime/legacy-core/model-registry.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';
import { getErrorMessage, readErrorBody, ReplyError, scrubMessage, scrubText } from './executor.js';
import { ERROR_CODES, LIMITS } from './protocol.js';
import { createUpstreamFetch } from './upstream-fetch.js';

export const COUNCIL_CHECKPOINT_VERSION = 1;
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
  retryDelayMs = COUNCIL_RETRY_DELAY_MS
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
    isLearningMode: false
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
    getModelReasoningConfig,
    normalizeReasoningEffort,
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
  const memo = new Map(Object.entries(resume?.memo && typeof resume.memo === 'object' ? resume.memo : {}));
  let memoChars = [...memo.values()].reduce((sum, value) => sum + String(value).length, 0);
  let saving = Promise.resolve();
  const remember = (key, value) => {
    const text = String(value ?? '');
    if (memoChars + text.length > MEMO_MAX_CHARS) return;
    memo.set(key, text);
    memoChars += text.length;
    // One save after another, so an older one never lands after a newer one.
    saving = saving
      .then(() => onCheckpoint({ version: COUNCIL_CHECKPOINT_VERSION, kind: 'council', elapsedMs: elapsed(), memo: Object.fromEntries(memo) }))
      .catch((error) => onProblem('council_checkpoint_failed', error));
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
    modelUsesTavilySearch,
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

  // ----- what the page sees: the progress of the council, and the words of the synthesis as they are written
  let answer = '';
  const onProgress = (progress) => onLive({
    cs: {
      stage: progress.stage,
      message: progress.message,
      mode: progress.mode,
      elapsedMs: elapsed(),
      searchEnabled: progress.searchEnabled,
      totalParticipants: progress.totalParticipants,
      activeParticipants: progress.activeParticipants,
      modelStates: progress.modelStates,
      search: progress.search
    }
  });
  const onFinalChunk = (chunk) => {
    if (!chunk) return;
    answer += chunk;
    onLive({ a: chunk });
    onUpdate([{ text: answer }]);
  };
  onLive({ r: { answer: '', thought: { text: '', kind: 'model', ended: false, ms: 0 }, sources: [], elapsedMs: elapsed() } });

  const lifecycle = createCouncilResponseLifecycle({
    buildTavilySearchQuery,
    getSearchCurrentDate,
    getConfig: () => config,
    getActiveConversation: () => conversation,
    // The models are the ones the request names (as the page knows them), not the server's own list.
    getCouncilSelectedModels: () => ({ council: councilConfig, participants, synthesizer }),
    getCouncilTexts: () => COUNCIL_TEXT[language] || COUNCIL_TEXT['zh-TW'],
    getCouncilRuntimeTexts: () => getCouncilRuntimeTexts(language),
    getCouncilAttachmentTranslationNeed: createCouncilAttachmentNeed({ modelSupportsVision, modelSupportsDocumentUpload }),
    getCouncilTranslatorModel: () => translator,
    getCouncilSharedSearchModel: (model) => (modelSupportsWebSearch(model) ? model : null),
    models: allModels,
    councilMaxModels: COUNCIL_MAX_MODELS,
    extractTextFromParts: support.extractTextFromParts,
    truncateCouncilText: support.truncateCouncilText,
    filterPartsForModelCapability: support.filterPartsForModelCapability,
    getSearchQueryFromParts: support.getSearchQueryFromParts,
    buildSearchQuery: support.buildSearchQuery,
    fetchTavilySearchPacket: remembered('search', support.fetchTavilySearchPacket),
    readLinkedPages: remembered('pages', support.readLinkedPages),
    readsLinkedPages: support.readsLinkedPages,
    streamCouncilApiCallWithRetry,
    modelUsesNativeWebSearch,
    modelSupportsVision,
    modelSupportsDocumentUpload
  });

  let outcome;
  try {
    outcome = await lifecycle.runModelCouncil(spec.request.currentMessage.parts, signal, onProgress, onFinalChunk, { webSearchEnabled: searchOn, conversation });
  } catch (error) {
    await saving;
    // A stop keeps what the synthesis had written.
    if (signal?.aborted) return { parts: [{ text: answer }], status: 'stopped', run: { elapsedMs: elapsed() }, toolCalls: 0 };
    throw new ReplyError(scrubMessage(error?.message, secrets), ERROR_CODES.providerError);
  }
  await saving;
  const text = String(outcome?.text ?? '');
  // A stop that came while the synthesis was being written: the council gives its members' answers instead of it, but the person stopped it.
  if (signal?.aborted) return { parts: [{ text: answer }], status: 'stopped', run: { elapsedMs: elapsed() }, toolCalls: 0 };
  const written = scrubText(text, secrets);
  // What the council adds after the synthesis (the blocks of the first answers) reaches the pages that are watching.
  if (written.startsWith(answer) && written.length > answer.length) onLive({ a: written.slice(answer.length) });
  return { parts: [{ text: written }], status: 'done', run: { elapsedMs: elapsed() }, toolCalls: 0 };
}
