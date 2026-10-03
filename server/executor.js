// One reply, run to its end on the server: the same request building and tool loop the browser uses (the shared modules), given
// what the browser packed in the RunSpec instead of what the page knows. Returns the message as it should be saved, and calls
// `onUpdate` with the message so far (the caller writes it out, a few times a second at most).

import { createStreamApiCall } from '../src/app/legacy-runtime/features/stream-api-call.js';
import { normalizePageReads, normalizeTinyfishSearch } from '../src/app/legacy-runtime/features/model-request-formatting.js';
import { runWebResearchReply } from '../src/app/legacy-runtime/features/web-research-reply.js';
import { createWebResearchTools } from '../src/app/legacy-runtime/features/web-research-tools.js';
import { getModelReasoningConfig, modelSupportsUploadedFile, modelSupportsVision, normalizeReasoningEffort } from '../src/app/runtime/legacy-core/model-registry.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';
import { insertGroundingMarkers } from '../src/app/ui/citations/citation-model.js';
import { addNumberedSources } from '../src/app/ui/citations/source-numbering.js';
import { formatSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { createUpstreamFetch } from './upstream-fetch.js';

export const CHECKPOINT_VERSION = 1;
const DEFAULT_GENERATION = Object.freeze({ temperature: 0.7, topP: 0.95, maxTokens: null });

const readErrorBody = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text || response.statusText } };
  }
};
const getErrorMessage = (errorBody, fallback = 'API request failed') => errorBody?.error?.message || errorBody?.message || fallback;

/** An error message with every key the reply was given taken out, and short enough to keep. */
export function scrubMessage(message, secrets) {
  let text = String(message ?? 'The reply failed.');
  for (const value of Object.values(secrets || {})) {
    if (typeof value === 'string' && value.length >= 6) text = text.split(value).join('[hidden]');
  }
  return text.slice(0, 300);
}

export class ReplyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ReplyError';
    this.code = code;
  }
}

/**
 * Runs the reply. `resume`: what `onCheckpoint` last gave, to carry on from there. Resolves { parts, status, run, toolCalls }
 * (status 'done' or 'stopped'); throws a ReplyError (code provider_error, with a message free of keys) when the reply cannot be
 * made. A stop keeps what was written. `onLive(event)` gets every small piece as it comes, for the ones watching the reply live:
 * { r: snapshot } (the start), { a: text of the answer }, { th: thinking text, k: kind }, { src: pages found }.
 */
export async function executeReply({ spec, secrets, signal, resume = null, onUpdate = () => {}, onLive = () => {}, onCheckpoint = async () => {}, fetchImpl = fetch, now = Date.now }) {
  const mode = spec.tools.webSearch;
  const language = spec.request.language;
  const startedAt = now() - (Number(resume?.elapsedMs) || 0);
  const upstreamFetch = createUpstreamFetch({ fetchImpl });

  let answer = typeof resume?.text === 'string' ? resume.text : '';
  let sources = Array.isArray(resume?.sources) ? resume.sources : [];
  const thought = { text: typeof resume?.thought?.text === 'string' ? resume.thought.text : '', kind: resume?.thought?.kind === 'summary' ? 'summary' : 'model', first: null, last: null };
  let supports = [];

  const record = (status) => ({
    status,
    steps: [],
    elapsedMs: now() - startedAt,
    ...(sources.length ? { sources } : {}),
    ...(thought.text ? { thought: thought.text, thoughtKind: thought.kind, ...(thought.first && thought.last > thought.first ? { thoughtMs: thought.last - thought.first } : {}) } : {})
  });
  const messageText = (status) => `${sources.length || thought.text ? formatSandboxRunBlock(record(status)) : ''}${answer}`;
  const update = () => onUpdate([{ text: messageText('running') }]);
  onLive({ r: { answer, thought: { text: thought.text, kind: thought.kind }, sources } });

  const addSources = (found) => {
    sources = addNumberedSources(sources, found);
    onLive({ src: sources });
    update();
  };
  const onChunk = (chunk) => {
    if (!chunk) return;
    answer += chunk;
    onLive({ a: chunk });
    update();
  };
  const onReasoning = (chunk, kind) => {
    if (!chunk) return;
    thought.text += chunk;
    if (kind === 'summary') thought.kind = 'summary';
    thought.first ??= now();
    thought.last = now();
    onLive({ th: chunk, k: thought.kind });
    update();
  };

  const modelInfo = spec.model.info;
  const conversation = { messages: [], astrasId: null, isWebSearchEnabled: mode === 'grounding', genConfig: null, reasoningEffort: spec.request.reasoningEffort ?? null };
  const keyFor = (name) => {
    if (name === modelInfo.provider) return secrets.providerKey || '';
    if (name === spec.tools.searchProvider) return secrets.searchKey || '';
    return '';
  };
  const config = { searchProvider: spec.tools.searchProvider, tavilySearchDepth: 'basic', aiDefaultLanguage: language, uiLanguage: language, memorySystemVersion: 1, memoryEnabled1: false, isLearningMode: false };

  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => modelInfo,
    getModelApiId: () => spec.model.id,
    getApiKeyForProvider: keyFor,
    getDefaultGenConfig: () => ({ ...DEFAULT_GENERATION }),
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
  const requestOptions = {
    conversation,
    modelInfo,
    historyForApi: spec.request.history,
    genConfig: spec.request.generation || { ...DEFAULT_GENERATION },
    reasoningEffort: spec.request.reasoningEffort,
    systemInstructionText: spec.request.systemInstruction,
    webSearchEnabled: mode === 'grounding',
    requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER,
    onReasoning,
    onSources: addSources,
    onSupports: (found) => { supports = found; }
  };
  const parts = spec.request.currentMessage.parts;

  let toolCalls = 0;
  try {
    if (mode === 'research') {
      const tools = createWebResearchTools({ getConfig: () => config, getApiKeyForProvider: keyFor, fetchImpl: upstreamFetch, getErrorMessage, readErrorBody, normalizePageReads, normalizeTinyfishSearch });
      const result = await runWebResearchReply({
        streamApiCall,
        requestParts: parts,
        onChunk,
        signal,
        requestOptions,
        searchWeb: tools.searchWeb,
        openPage: tools.fetchPageContents,
        language,
        onSources: addSources,
        resume: resume && Array.isArray(resume.toolTurns) ? { toolTurns: resume.toolTurns, text: resume.text, research: resume.research } : null,
        onRound: (round) => onCheckpoint({ version: CHECKPOINT_VERSION, ...round, sources, thought: { text: thought.text, kind: thought.kind }, elapsedMs: now() - startedAt })
      });
      toolCalls = result.calls || 0;
    } else {
      await streamApiCall(parts, onChunk, signal, false, requestOptions);
    }
  } catch (error) {
    // A stop keeps what was written; anything else is the reply's failure.
    if (!signal?.aborted) throw new ReplyError(scrubMessage(error?.message, secrets), 'provider_error');
  }

  // Where Gemini's answer cites its pages is known only when it is whole: the markers go into the text now.
  if (supports.length && answer) {
    const numberOf = (url) => Number(sources.find((source) => source.url === url)?.n) || 0;
    answer = insertGroundingMarkers(answer, supports, numberOf);
  }
  if (!answer.trim() && !sources.length && !thought.text) {
    if (signal?.aborted) return { parts: [{ text: '' }], status: 'stopped', run: record('stopped'), toolCalls };
    throw new ReplyError('The model gave no answer.', 'provider_error');
  }
  const status = signal?.aborted ? 'stopped' : 'done';
  return { parts: [{ text: messageText(status) }], status, run: record(status), toolCalls };
}
