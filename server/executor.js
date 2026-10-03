// One reply, run to its end on the server: the same request building and tool loop the browser uses (the shared modules), given
// what the browser packed in the RunSpec instead of what the page knows. Returns the message as it should be saved, and calls
// `onUpdate` with the message so far (the caller writes it out, a few times a second at most).

import { normalizePageReads, normalizeTinyfishSearch } from '../src/app/legacy-runtime/features/model-request-formatting.js';
import { runWebResearchReply } from '../src/app/legacy-runtime/features/web-research-reply.js';
import { createWebResearchTools } from '../src/app/legacy-runtime/features/web-research-tools.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';
import { insertGroundingMarkers } from '../src/app/ui/citations/citation-model.js';
import { addNumberedSources } from '../src/app/ui/citations/source-numbering.js';
import { RUN_STATUS, formatSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { briefingPart, runSearchBriefing } from '../src/app/runtime/sandbox/search-briefing.js';
import { runSandboxReply } from '../src/app/runtime/sandbox/sandbox-reply.js';
import { sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';
import { collectInputFiles, createStepEvents, finishAdvancedReply } from './advanced-reply.js';
import { ERROR_CODES } from './protocol.js';
import { createModelAccess, DEFAULT_GENERATION } from './model-access.js';

export const CHECKPOINT_VERSION = 1;

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
 * { r: snapshot } (the start), { a: text of the answer }, { th: thinking text, k: kind }, { te: how long it thought, in ms, when the answer
 * starts }, { src: pages found }, { ev: what a step of Python does, for the page's step list }.
 * A reply that runs Python (`spec.tools.advanced`) is given `sandboxHost` (server/sandbox-client.js) and `files` (server/file-store.js)
 * and `userId`; it is made again from its start when it is taken up after a restart (the sandbox was lost with the process). When the
 * sandbox cannot be had before any answer was written and a page is watching (`watching()`), it ends with a ReplyError of code
 * `sandbox_unavailable`: the page then makes the reply itself, with its own Python.
 */
export async function executeReply({ spec, secrets, signal, resume: resumeFrom = null, userId = '', sandboxHost = null, files = null, watching = () => false, onUpdate = () => {}, onLive = () => {}, onCheckpoint = async () => {}, fetchImpl = fetch, now = Date.now }) {
  const resume = spec.tools.advanced ? null : resumeFrom;
  const mode = spec.tools.webSearch;
  const language = spec.request.language;
  const startedAt = now() - (Number(resume?.elapsedMs) || 0);
  const access = createModelAccess({ spec, secrets, fetchImpl, grounding: mode === 'grounding' });

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
  // The times every page shows come from here, so they agree: how long the reply has been going, and how long it thought.
  let thoughtClosed = false;
  onLive({ r: { answer, thought: { text: thought.text, kind: thought.kind, ms: 0, ended: false }, sources, elapsedMs: now() - startedAt } });

  const addSources = (found) => {
    sources = addNumberedSources(sources, found);
    onLive({ src: sources });
    update();
  };
  const onChunk = (chunk) => {
    if (!chunk) return;
    // The first words of the answer end the thinking: that is the moment the time it thought is taken.
    if (!thoughtClosed && thought.text && thought.first) {
      thoughtClosed = true;
      thought.last = now();
      onLive({ te: thought.last - thought.first });
    }
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

  const { streamApiCall, upstreamFetch, modelInfo, conversation, keyFor, config } = access;
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
  // A reply with Python: the run and what it made, set when the loop is over.
  let advanced = null;
  try {
    if (spec.tools.advanced) {
      if (!sandboxHost?.configured || !files) throw new ReplyError('Python is not available on the server.', 'provider_error');
      const tools = mode === 'research' ? createWebResearchTools({ getConfig: () => config, getApiKeyForProvider: keyFor, fetchImpl: upstreamFetch, getErrorMessage, readErrorBody, normalizePageReads, normalizeTinyfishSearch }) : null;
      // Each event says when it happened (ms since the reply began), so a page that joins late draws the same times as the others.
      const stepEvents = createStepEvents({ send: (event) => onLive({ ev: { ...event, t: Math.max(0, now() - startedAt) } }), now });
      let sandbox = null;
      // The reply is made with a signal of its own, so that it can be ended when the sandbox is lost and the page is to take over.
      const inner = new AbortController();
      const passStop = () => inner.abort();
      if (signal?.aborted) inner.abort();
      signal?.addEventListener?.('abort', passStop, { once: true });
      let handBack = false;
      let advancedParts = parts;
      let advancedOptions = requestOptions;
      if (mode === 'briefing') {
        // Gemini cannot search and call a tool in one request: it searches first, and Python gets the briefing as reference text.
        stepEvents.event({ type: 'searching', label: sandboxText(language, 'sandboxSearching') });
        try {
          const briefing = await runSearchBriefing({ streamApiCall, requestParts: parts, requestOptions: { ...requestOptions, webSearchEnabled: true }, signal });
          addSources(briefing.sources);
          const part = briefingPart(briefing, modelInfo?.name);
          if (part) advancedParts = [part, ...parts];
        } catch (error) {
          // Stopping stops the reply; a search that failed leaves the reply to go on without it.
          if (signal?.aborted) throw error;
        }
        stepEvents.event({ type: 'sources', sources });
        advancedOptions = { ...requestOptions, webSearchEnabled: false, ignoreConversationWebSearch: true };
      }
      try {
        const result = await runSandboxReply({
          streamApiCall,
          requestParts: advancedParts,
          onChunk,
          signal: inner.signal,
          requestOptions: advancedOptions,
          host: 'server',
          getSandbox: (options) => {
            const real = sandboxHost.getSandbox({ ...options, language, signal: inner.signal });
            sandbox = real;
            // Lost for good (the host does not come back) before there is an answer, with a page there to take over: the reply ends so the
            // page can make it with its own Python, and nothing of this one is shown. Otherwise the model finishes without Python.
            const guard = async (step) => {
              try {
                return await step();
              } catch (error) {
                if (!inner.signal.aborted && !answer.trim() && watching()) {
                  handBack = true;
                  inner.abort();
                }
                throw error;
              }
            };
            return {
              prepare: () => guard(() => real.prepare()),
              clear: () => guard(() => real.clear()),
              mount: (inputs) => guard(() => real.mount(inputs)),
              run: (code, options) => guard(() => real.run(code, options)),
              dispose: () => real.dispose()
            };
          },
          language,
          provider: modelInfo.provider,
          inputFiles: collectInputFiles({ history: spec.request.history, current: parts, sent: spec.tools.inputs || [], userId, files }),
          designs: spec.tools.designs || {},
          research: tools ? { searchWeb: tools.searchWeb, openPage: tools.fetchPageContents, onSources: addSources } : null,
          onEvent: stepEvents.event
        });
        stepEvents.flush();
        advanced = result;
      } finally {
        signal?.removeEventListener?.('abort', passStop);
        // The container goes with the reply, however it ended.
        await sandbox?.dispose().catch(() => {});
      }
      if (handBack && !signal?.aborted) throw new ReplyError('The Python sandbox is not available.', ERROR_CODES.sandboxUnavailable);
    } else if (mode === 'research') {
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
    if (error instanceof ReplyError && error.code === ERROR_CODES.sandboxUnavailable) throw error;
    if (!signal?.aborted) throw new ReplyError(scrubMessage(error?.message, secrets), 'provider_error');
  }

  if (advanced) {
    const stopped = Boolean(signal?.aborted) || advanced.run?.status === RUN_STATUS.stopped;
    const run = advanced.run || (sources.length ? { status: RUN_STATUS.done, steps: [] } : null);
    if (!run || (!advanced.text.trim() && !run.steps.length && !run.thought)) {
      if (!advanced.text.trim() && !sources.length) {
        if (stopped) return { parts: [{ text: '' }], status: 'stopped', run: record('stopped'), toolCalls };
        throw new ReplyError('The model gave no answer.', 'provider_error');
      }
      if (!run) return { parts: [{ text: advanced.text }], status: stopped ? 'stopped' : 'done', run: record(stopped ? 'stopped' : 'done'), toolCalls };
    }
    // The pages the reply searched and the time it took are kept with the steps, as the browser keeps them.
    if (sources.length) run.sources = sources;
    run.elapsedMs = now() - startedAt;
    if (stopped) run.status = RUN_STATUS.stopped;
    toolCalls = run.steps.length;
    const finished = await finishAdvancedReply({ result: advanced, run, userId, files });
    // The presentations Python made, as bytes, for the visual check that follows (by the id the file has in the message).
    const decks = new Map();
    for (const part of finished.parts) {
      const file = part.sandboxFile;
      if (!file || !/\.pptx$/i.test(file.name)) continue;
      const output = run.steps.flatMap((step) => step.outputs || []).filter((entry) => entry.name === file.name).at(-1);
      if (output?.bytes) decks.set(file.id, output.bytes);
    }
    return { parts: [{ text: finished.text }, ...finished.parts], status: stopped ? 'stopped' : 'done', run, toolCalls, artifacts: { decks } };
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
