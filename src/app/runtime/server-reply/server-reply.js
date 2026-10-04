// Replies run by the server (docs/superpowers/specs/2026-10-03-server-runtime-design.md). The browser is the brain: it puts the whole
// request together (history, system instruction, model, tools, keys) and hands it to the server, which makes the reply and writes it
// into the same message the app already syncs. This file is that hand-over and the following of the reply until it is done.

import { liftSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { serverReplyText } from './server-reply-texts.js';
import { readRunStream } from './server-stream.js';
import { netPolicyForRun } from '../cli/net-state.js';

export const SERVER_PROTOCOL_VERSION = 1;
export const DEFAULT_SERVER_API_URL = 'https://api.noureon.com';
// The server's limit on a request is 25 MB; a request is kept well under it, and a larger one is made in the browser instead.
const MAX_REQUEST_CHARS = 20 * 1024 * 1024;
const START_TIMEOUT_MS = 20_000;
const POLL_MS = 350;
const RUN_CHECK_EVERY = 5;
// Longer than the server's own limit of 2 hours, so the server's reason arrives first.
const FOLLOW_LIMIT_MS = (2 * 60 + 20) * 60 * 1000;
const STOP_GRACE_MS = 20_000;
// The live channel sends a line at least every 15 seconds; this long without anything and it is taken to be broken.
const LIVE_IDLE_MS = 40_000;
// The live channel is joined again at most this many times, this long apart, while the reply goes on.
const MAX_LIVE_JOINS = 60;
const LIVE_REJOIN_MS = 1500;

// Why a reply is made in the browser, for the ones that are not a failure (nothing is said about these).
export const LOCAL_REASONS = Object.freeze({
  setting: 'setting',
  advanced: 'advanced',
  packetSearch: 'packet-search',
  noAccount: 'no-account',
  notSynced: 'not-synced',
  tooLarge: 'too-large'
});

/** Whether a reply can be made by the server, and with which kind of web search. */
export function planServerReply({ config = {}, conversation = null, advanced = false, webSearchEnabled = false, researchByModel = false, provider = '', hasAccount = true } = {}) {
  if (config.replyRunLocation === 'local') return { ok: false, reason: LOCAL_REASONS.setting };
  if (!hasAccount) return { ok: false, reason: LOCAL_REASONS.noAccount };
  // A temporary chat is never in the cloud, so the server has nowhere to write the reply.
  if (conversation?.isTemporary || conversation?.retentionMode === 'ephemeral') return { ok: false, reason: LOCAL_REASONS.notSynced };
  // A reply with Python: the server runs it in its sandbox, with the model's own web search next to it (or Gemini's briefing). A search
  // made as a packet in front of the request cannot go with Python (those models do not call tools, so there is no Python for them).
  if (advanced) {
    if (!webSearchEnabled) return { ok: true, webSearch: 'off', advanced: true };
    if (researchByModel) return { ok: true, webSearch: 'research', advanced: true };
    // Gemini cannot search and call a tool at once: it searches first, then Python gets the briefing.
    return provider === 'gemini' ? { ok: true, webSearch: 'briefing', advanced: true } : { ok: false, reason: LOCAL_REASONS.packetSearch };
  }
  if (!webSearchEnabled) return { ok: true, webSearch: 'off' };
  if (researchByModel) return { ok: true, webSearch: 'research' };
  // Gemini searches by itself; for the others a search is a packet put in front of the request, made in the browser.
  if (provider === 'gemini') return { ok: true, webSearch: 'grounding' };
  return { ok: false, reason: LOCAL_REASONS.packetSearch };
}

const textOf = (parts) => (Array.isArray(parts) ? parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('') : '');

export class ServerReplyError extends Error {
  constructor(message, code = 'server_error') {
    super(message);
    this.name = 'ServerReplyError';
    this.code = code;
    // The reply was the server's: the message of the error has the same id as the one the server wrote.
    this.serverRun = true;
  }
}

/** The error of a reply the server could not finish, in the language of the page (the provider's own words stay as they are). */
export function localizeServerError(error, language) {
  const key = { time_limit: 'timeLimit', server_restarted: 'serverRestarted', sandbox_unavailable: 'sandboxUnavailable', unknown: 'unknownError', internal_error: 'unknownError' }[error?.code];
  if (!key) return error;
  return new ServerReplyError(serverReplyText(language, key), error.code);
}

// A picture in the event of a finished step comes as base64 (small ones, to be shown while the step runs): the step list takes bytes.
export const withFileBytes = (event) => {
  if (event?.type !== 'step-end' || !Array.isArray(event.files)) return event;
  return {
    ...event,
    files: event.files.map(({ data, ...file }) => {
      if (typeof data !== 'string') return file;
      try {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return { ...file, bytes };
      } catch {
        return file;
      }
    })
  };
};

const isTerminalRun = (status) => status === 'done' || status === 'failed' || status === 'stopped';

export function createServerReply({
  getBaseUrl = () => DEFAULT_SERVER_API_URL,
  // () => the access token of the signed-in cloud account, or '' when there is none
  getAccessToken,
  getApiKeyForProvider,
  getModelApiId,
  getDefaultGenConfig = () => ({}),
  // (parts, options) => { systemInstructionText }: stream-api-call with describeOnly
  describeRequest,
  // Writes what was changed locally to the cloud, so the conversation is there when the server starts.
  flushSync = async () => {},
  // (messageId) => { parts, status, metadata } | null: the message as the server has written it so far
  readMessage,
  // (parts) => parts: the files the server kept in the person's cloud storage, brought here (a file part holds a marker until then)
  hydrateParts = async (parts) => parts,
  // (parts) => parts: keeps the files of these parts in the person's cloud storage and gives markers in place of their bytes
  externalizeParts = async (parts) => parts,
  // (conversationId) => { id, message_id } | null: the reply of this conversation the server is still making
  findLiveRun = async () => null,
  fetchImpl = (...args) => fetch(...args),
  clientVersion = '',
  now = () => Date.now(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  // What the server wrote since the last look is handed over in small pieces over the time until the next look (0: all at once), so
  // the words come out smoothly and not once in a while.
  paceMs = 0,
  setTimer = (...args) => setTimeout(...args),
  setRepeating = (...args) => setInterval(...args),
  clearRepeating = (...args) => clearInterval(...args),
  warn = () => {}
} = {}) {
  const request = async (method, path, { body, signal, timeoutMs = START_TIMEOUT_MS } = {}) => {
    const token = await getAccessToken();
    if (!token) return { ok: false, status: 401, code: 'unauthorized' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    try {
      const response = await fetchImpl(`${getBaseUrl()}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body,
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, code: data?.error?.code || null, data };
    } catch {
      return { ok: false, status: 0, code: 'unreachable' };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    }
  };

  const searchKeyFor = (config) => {
    const chosen = config?.searchProvider === 'tinyfish' ? 'tinyfish' : 'tavily';
    const other = chosen === 'tinyfish' ? 'tavily' : 'tinyfish';
    for (const name of [chosen, other]) {
      const key = getApiKeyForProvider(name);
      if (key) return { searchProvider: name, searchKey: key };
    }
    return null;
  };

  // The files earlier replies made are kept in the cloud (first, if they are not there yet); the request names where they are instead
  // of carrying them, so a long conversation of files does not outgrow it. A file that cannot be kept there stays in the request.
  const withCloudFiles = async (history) => {
    const result = [];
    for (const message of history) {
      if (!message.parts?.some((part) => typeof part?.sandboxFile?.data === 'string')) {
        result.push(message);
        continue;
      }
      const parts = [];
      for (const part of message.parts) {
        if (typeof part?.sandboxFile?.data !== 'string') {
          parts.push(part);
          continue;
        }
        try {
          const [kept] = await externalizeParts([part]);
          parts.push(kept || part);
        } catch (error) {
          warn('Keeping a file in the cloud before the request failed; it goes with the request.', error);
          parts.push(part);
        }
      }
      result.push({ ...message, parts });
    }
    return result;
  };

  /**
   * Hands a reply to the server. Resolves { ok: true, run } when it was accepted (the server has it now) or { ok: false, reason,
   * notify } when it was not and the reply is to be made here ('notify' is true when the person should be told).
   */
  const begin = async (path, { conversation, modelInfo, requestParts, webSearch = 'off', advanced = false, designs = null, inputs = [], cli = [], cliChosen = [], visionCheck = null, research = null, assistantMessageId, sequence, uiLanguage, config = {}, requestOptions = {}, getHistorySourceIds = () => [] }) => {
    const providerKey = getApiKeyForProvider(modelInfo?.provider);
    if (!providerKey) return { ok: false, reason: 'no-key', notify: false };
    let search = null;
    if (webSearch === 'research') {
      search = searchKeyFor(config);
      if (!search) return { ok: false, reason: LOCAL_REASONS.packetSearch, notify: false };
    }
    let described;
    try {
      described = await describeRequest(requestParts, { ...requestOptions, conversation, modelInfo });
    } catch (error) {
      warn('Putting the request for the server together failed; the reply is made here.', error);
      return { ok: false, reason: 'prepare-failed', notify: false };
    }
    // The conversations the memory drew on are known once the request was put together.
    const historySourceIds = getHistorySourceIds();
    const history = await withCloudFiles((conversation.messages || []).slice(0, -1).map((message) => ({ role: message.role, parts: message.parts })));
    const metadata = historySourceIds.length ? { historySourceConversationIds: historySourceIds } : null;
    const spec = {
      protocol: SERVER_PROTOCOL_VERSION,
      // A deep research: its topic is what the person typed (the server plans, searches and writes from it).
      ...(research ? { kind: 'research', research: { topic: research.topic } } : {}),
      clientVersion: String(clientVersion || '0'),
      conversationId: conversation.id,
      assistantMessageId,
      sequence,
      model: { provider: modelInfo.provider, id: getModelApiId(modelInfo), info: modelInfo },
      request: {
        history,
        currentMessage: { parts: requestParts },
        systemInstruction: described.systemInstructionText || '',
        generation: conversation.genConfig || getDefaultGenConfig(),
        ...(conversation.reasoningEffort ? { reasoningEffort: conversation.reasoningEffort } : {}),
        ...(metadata ? { messageMetadata: metadata } : {}),
        language: uiLanguage
      },
      tools: {
        webSearch,
        ...(search ? { searchProvider: search.searchProvider } : {}),
        advanced: Boolean(advanced),
        // What Python is given: the Design menu's choices, and the files attached to this message.
        ...(advanced && designs ? { designs } : {}),
        ...(advanced && inputs.length ? { inputs } : {}),
        // The CLI tools (命令工具) chosen for this reply: ids of tools in the store (they run in the same sandbox).
        ...(advanced && cli.length ? { cli: cli.map((id) => ({ id, chosen: cliChosen.includes(id) })), net: netPolicyForRun(config) } : {}),
        // The check of a presentation the reply writes (the page's setting is on and the model can see images): the server makes it too.
        ...(visionCheck ? { visionCheck } : {})
      },
      secrets: { providerKey, ...(search ? { searchKey: search.searchKey } : {}) }
    };
    const body = JSON.stringify(spec);
    if (body.length > MAX_REQUEST_CHARS) return { ok: false, reason: LOCAL_REASONS.tooLarge, notify: false };

    // The conversation has to be in the cloud before the server writes into it.
    try {
      await flushSync();
    } catch (error) {
      warn('Saving the conversation before the server starts failed.', error);
    }
    const result = await request('POST', path, { body });
    if (!result.ok) {
      const busy = result.code === 'too_many_runs' || result.code === 'rate_limited';
      const quiet = ['unsupported_mode', 'runs_unavailable', 'protocol_unsupported', 'conversation_not_found'].includes(result.code);
      if (!busy && !quiet && result.code !== 'unreachable' && result.status !== 401) warn(`The server did not take the reply (${result.code || result.status}).`);
      return { ok: false, reason: result.code || `http-${result.status}`, notify: busy ? 'busy' : quiet ? false : 'unreachable' };
    }
    const runId = result.data?.runId;
    if (!runId) return { ok: false, reason: 'bad-answer', notify: 'unreachable' };
    return { ok: true, run: createRun({ runId, assistantMessageId, kind: research ? 'research' : 'reply', vision: result.data?.vision === true }) };
  };
  const start = (args) => begin('/v1/runs', args);
  // A deep research: the server makes the plan, waits for the person, researches and writes the report (server/research.js).
  const startResearch = (args) => begin('/v1/research', { ...args, webSearch: 'research', advanced: false, visionCheck: null });

  const createRun = ({ runId, assistantMessageId, kind = 'reply', vision = false }) => ({
    runId,
    assistantMessageId,
    // 'vision': the check of a presentation (not a reply); `vision`: the server makes the check of this reply's presentations.
    kind,
    vision,
    stop: () => request('POST', `/v1/runs/${runId}/stop`),
    // The person's answer ('once', 'always' or 'deny') to the question a tool's command put about a site.
    answerNet: (askId, decision) => request('POST', `/v1/runs/${runId}/net`, { body: JSON.stringify({ askId, decision }) }),
    // The person's answer ('saved' or 'cancel') to the window that asked for the login a tool needs (the values were saved apart, through /v1/credentials).
    answerCredential: (askId, decision) => request('POST', `/v1/runs/${runId}/credential`, { body: JSON.stringify({ askId, decision }) }),
    /**
     * Follows the reply until the server has finished it, the way a live broadcast is followed: the server pushes every small piece as
     * it is made, to every page watching, and a page that comes in late is given what there is so far (when the channel cannot be
     * had, the message is read instead, a few times a second). `onText(delta)` gets the answer as it grows, `onThought(text, kind, msSoFar)` the thinking, `onThoughtEnd(ms)` how long it thought, `onTiming(ms)` how long the reply has gone on. `onRun(run)` gets the run record when it has more pages. Resolves { text, run, rewritten }
     * ('rewritten': the finished text is not just the streamed one with more at the end; `extraParts`: the files the reply made), or throws a ServerReplyError. `onEvent(event)` gets what the steps of a reply with Python do, for the step list.
     */
    async follow({ onText = () => {}, onRun = () => {}, onThought = () => {}, onThoughtEnd = () => {}, onTiming = () => {}, onEvent = () => {}, signal } = {}) {
      const startedAt = now();
      let answerSoFar = '';
      let stopSent = false;
      let stopAt = 0;
      let polls = 0;
      let terminalRunSeen = 0;
      let lastRow = null;
      let sourceCount = 0;
      let visionRunId = null;
      // How many times the live channel was joined, and whether the reply began again after it was lost (the server was replaced).
      let connections = 0;
      let everJoined = false;
      let restarted = false;
      let queue = '';
      const emit = (delta) => {
        if (paceMs) queue += delta;
        else onText(delta);
      };
      const flush = () => {
        if (!queue) return;
        onText(queue);
        queue = '';
      };
      const idle = async (ms) => {
        if (!paceMs || !queue) {
          await wait(ms);
          return;
        }
        const ticks = Math.max(1, Math.round(ms / paceMs));
        for (let tick = 0; tick < ticks; tick += 1) {
          const piece = Math.ceil(queue.length / (ticks - tick));
          if (piece > 0) {
            onText(queue.slice(0, piece));
            queue = queue.slice(piece);
          }
          await wait(paceMs);
        }
      };
      // The live channel: nothing waits for a database or a poll, so every page watching has the same words at the same time.
      const handleLive = (event) => {
        if (event.r) {
          const text = String(event.r.answer || '');
          // Joined again after the channel was lost: the steps are told again from their start, so the list is drawn afresh; and a reply that
          // began again (its words are not those already shown) goes on in the step list only, the finished text replaces what was shown.
          if (connections > 1) {
            if (Array.isArray(event.r.events)) onEvent({ type: 'reset' });
            if (!text.startsWith(answerSoFar)) restarted = true;
          }
          if (text.startsWith(answerSoFar) && text.length > answerSoFar.length) {
            onText(text.slice(answerSoFar.length));
            answerSoFar = text;
          }
          // The times are the server's: how long the reply has gone on, and how long it thought, so every page shows the same.
          if (Number.isFinite(event.r.elapsedMs)) onTiming(event.r.elapsedMs);
          if (event.r.thought?.text) onThought(event.r.thought.text, event.r.thought.kind, event.r.thought.ms);
          if (event.r.thought?.ended) onThoughtEnd(event.r.thought.ms);
          if (event.r.sources?.length > sourceCount) {
            sourceCount = event.r.sources.length;
            onRun({ sources: event.r.sources });
          }
          // A page that joins late is given the steps so far, to draw the same list.
          if (Array.isArray(event.r.events)) for (const step of event.r.events) onEvent(withFileBytes(step));
        } else if (Number.isFinite(event.tm)) onTiming(event.tm);
        else if (event.ev) onEvent(withFileBytes(event.ev));
        else if (typeof event.a === 'string') {
          answerSoFar += event.a;
          if (!restarted) onText(event.a);
        } else if (typeof event.th === 'string') onThought(event.th, event.k);
        else if (typeof event.te === 'number') onThoughtEnd(event.te);
        else if (Array.isArray(event.src) && event.src.length > sourceCount) {
          sourceCount = event.src.length;
          onRun({ sources: event.src });
        }
        if (event.vision) visionRunId = event.vision;
        return event.done ? 'done' : null;
      };
      let liveAbort = null;
      const readLive = async () => {
        const token = await getAccessToken();
        if (!token) return null;
        liveAbort = new AbortController();
        let lastData = now();
        const watchdog = setRepeating(() => { if (now() - lastData > LIVE_IDLE_MS) liveAbort.abort(); }, 5000);
        try {
          const response = await fetchImpl(`${getBaseUrl()}/v1/runs/${runId}/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: liveAbort.signal });
          if (!response.ok || !response.body) return null;
          everJoined = everJoined || /event-stream/i.test(response.headers?.get?.('content-type') || '');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return null;
            lastData = now();
            buffer += decoder.decode(value, { stream: true });
            for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
              const line = buffer.slice(0, end).split('\n').find((text) => text.startsWith('data: '));
              buffer = buffer.slice(end + 2);
              if (!line) continue;
              let event = null;
              try {
                event = JSON.parse(line.slice(6));
              } catch {
                continue;
              }
              if (handleLive(event) === 'done') return 'done';
            }
          }
        } catch {
          // The reply is read from the message instead.
        } finally {
          clearRepeating(watchdog);
          liveAbort.abort();
        }
        return null;
      };
      // A stop: the server is told at once; the channel is given a little time to say it is over, then the message is read.
      const onStopAsked = () => {
        if (!stopSent) {
          stopSent = true;
          stopAt = now();
          void this.stop().catch(() => {});
        }
        setTimer(() => liveAbort?.abort(), STOP_GRACE_MS);
      };
      if (signal?.aborted) onStopAsked();
      signal?.addEventListener?.('abort', onStopAsked, { once: true });
      // The channel is joined again when it breaks while the reply goes on (the server was replaced, the network dropped): the reply is
      // then followed live again, not only read from the message when it is over.
      for (let attempt = 0; attempt < MAX_LIVE_JOINS; attempt += 1) {
        connections += 1;
        if (await readLive() === 'done' || signal?.aborted || stopSent) break;
        // A server that has no live channel is read from the message, as before: only a channel that worked and broke is joined again.
        if (!everJoined) break;
        let over = false;
        try {
          const status = await request('GET', `/v1/runs/${runId}`, { timeoutMs: 8000 });
          over = Boolean(status.ok && isTerminalRun(status.data?.run?.status));
        } catch {
          over = false;
        }
        if (over) break;
        await idle(LIVE_REJOIN_MS);
      }
      signal?.removeEventListener?.('abort', onStopAsked);
      for (;;) {
        if (signal?.aborted && !stopSent) {
          stopSent = true;
          stopAt = now();
          await this.stop().catch(() => {});
        }
        if (now() - startedAt > FOLLOW_LIMIT_MS || (stopSent && now() - stopAt > STOP_GRACE_MS)) {
          if (lastRow) return await finish(lastRow, true);
          throw new ServerReplyError('The reply did not finish.', 'time_limit');
        }
        let row = null;
        try {
          row = await readMessage(assistantMessageId);
        } catch (error) {
          warn('Reading the reply failed; trying again.', error);
        }
        if (row) {
          lastRow = row;
          const lifted = liftSandboxRunBlock(textOf(row.parts));
          // The pages the search found, as they come: the [n] of the answer needs them.
          if (lifted.run?.sources?.length > sourceCount) {
            sourceCount = lifted.run.sources.length;
            onRun(lifted.run);
          }
          if (lifted.text.startsWith(answerSoFar) && lifted.text.length > answerSoFar.length) {
            emit(lifted.text.slice(answerSoFar.length));
            answerSoFar = lifted.text;
          }
          if (row.status === 'complete' || row.status === 'error') return await finish(row, false);
        }
        polls += 1;
        if (polls % RUN_CHECK_EVERY === 0) {
          // The server could not write the end of the reply (the database was down): the run itself says it is over.
          const status = await request('GET', `/v1/runs/${runId}`, { timeoutMs: 8000 });
          if (status.ok && isTerminalRun(status.data?.run?.status)) {
            terminalRunSeen += 1;
            if (terminalRunSeen >= 3) {
              if (lastRow) return await finish({ ...lastRow, status: 'complete' }, true);
              throw new ServerReplyError('The server could not finish this reply.', status.data.run.error_code || 'unknown');
            }
          }
        }
        await idle(POLL_MS);
      }

      async function finish(row, partial) {
        if (row.status === 'error' && !partial) {
          const failure = row.metadata?.serverError || {};
          throw new ServerReplyError(failure.message || 'The server could not finish this reply.', failure.code || 'unknown');
        }
        const lifted = liftSandboxRunBlock(textOf(row.parts));
        if (lifted.text.startsWith(answerSoFar) && lifted.text.length > answerSoFar.length) emit(lifted.text.slice(answerSoFar.length));
        flush();
        // The files of the reply: kept in the person's storage by the server, brought here.
        const fileParts = (Array.isArray(row.parts) ? row.parts : []).filter((part) => part?.sandboxFile);
        let extraParts = [];
        if (fileParts.length) {
          try {
            extraParts = await hydrateParts(fileParts);
          } catch (error) {
            warn('Bringing the files of the reply here failed.', error);
            extraParts = fileParts;
          }
        }
        return { text: lifted.text, run: lifted.run, rewritten: !lifted.text.startsWith(answerSoFar), extraParts, visionRunId };
      }
    }
  });

  /** A reply of this conversation the server is still making (the page was closed or left meanwhile), to follow from here, or null. */
  const find = async (conversationId) => {
    const row = await findLiveRun(conversationId);
    return row?.id && row?.message_id ? createRun({ runId: row.id, assistantMessageId: row.message_id, kind: row.kind === 'vision' || row.kind === 'research' ? row.kind : 'reply', vision: row.vision === true || row.vision === 'true' }) : null;
  };

  /**
   * Watches a run that makes no message of its own to follow (the visual check): `onEvent(event)` gets what the server tells, the run as it is
   * now first. Resolves when the server says it is over (or the run is seen to be over, when the channel cannot be had).
   */
  const watchRun = async (runId, { onEvent = () => {}, signal } = {}) => {
    for (let attempt = 0; attempt < MAX_LIVE_JOINS && !signal?.aborted; attempt += 1) {
      const token = await getAccessToken();
      if (!token) return false;
      const outcome = await readRunStream({ url: `${getBaseUrl()}/v1/runs/${runId}/stream`, token, fetchImpl, signal, onEvent: (event) => (onEvent(event) === 'done' || event.done ? 'done' : null), now, setRepeating, clearRepeating });
      if (outcome.done) return true;
      // The channel broke or never opened: the run may be over, or may go on and be joined again.
      const status = await request('GET', `/v1/runs/${runId}`, { timeoutMs: 8000 });
      if (status.ok && isTerminalRun(status.data?.run?.status)) return true;
      // A run that is not there (or not this person's) is not waited for.
      if (status.status === 404 || status.status === 403) return true;
      await wait(LIVE_REJOIN_MS);
    }
    return false;
  };

  return { start, startResearch, find, request, watchRun, readMessage };
}
