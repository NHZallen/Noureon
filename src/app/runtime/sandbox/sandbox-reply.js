// One Advanced mode reply: the model may call run_python; each call runs in
// the browser sandbox and its result goes back to the model, until the model
// answers without a call (at most MAX_RUNS_PER_REPLY runs). Returns the
// answer text and the run record kept above it. Loaded on demand.

import { MAX_RUNS_PER_REPLY, RUN_PYTHON_TOOL, getSandboxGuidance } from './sandbox-guidance.js';
import { sandboxText } from './sandbox-texts.js';
import { RUN_STATUS } from '../../ui/sandbox/sandbox-run-block.js';
import { partialJsonString } from '../../legacy-runtime/features/tool-call-formats.js';
import { RESEARCH_TOOLS, createResearchCalls, researchGuidance } from '../../legacy-runtime/features/web-research-reply.js';

const MODEL_TEXT_CHARS = 10_000;
const MAX_CRASHES = 2;
// A round's first words are held back this long: if a run follows, they were the model saying what it is about to
// do (shown between the steps); if the round goes on past this, it is the answer and streams as before.
const NARRATION_HOLD_CHARS = 400;
// The thinking kept with the run (it is saved with the message), per round and in all.
const THOUGHT_CHARS_PER_ROUND = 6000;
const THOUGHT_CHARS_IN_ALL = 30_000;
// After the model has gone quiet this long in a round that may call a tool, the line says it is writing it: a long
// program arrives all at once, and the line would otherwise look stuck on what came before.
const WRITING_AFTER_MS = 3000;

// Long output keeps its start and end for the model.
export function trimForModel(text = '', limit = MODEL_TEXT_CHARS) {
  const source = String(text || '');
  if (source.length <= limit) return source;
  const head = Math.floor(limit * 0.7);
  const tail = limit - head;
  return `${source.slice(0, head)}\n…[${source.length - limit} characters omitted]…\n${source.slice(-tail)}`;
}

const outputText = (value) => (typeof value === 'string' ? value : String(value?.text || ''));

// The tool result the model reads.
export function toolResultFor(result = {}, { note = '' } = {}) {
  const payload = {
    ok: !result.error,
    stdout: trimForModel(outputText(result.stdout)),
    stderr: trimForModel(outputText(result.stderr)),
    ...(result.error ? { error: trimForModel(result.error, 4000) } : {}),
    files: (result.files || []).map((file) => ({ path: `/output/${file.name}`, size: file.size })),
    ...(result.skippedFiles?.length ? { skipped_files: result.skippedFiles.map((file) => ({ path: `/output/${file.name}`, reason: file.reason })) } : {}),
    ...(result.restarted ? { restarted: true, note: 'The Python environment was restarted; variables from earlier calls are gone.' } : {}),
    ...(result.packageError ? { package_error: trimForModel(result.packageError, 2000) } : {}),
    elapsed_ms: Math.round(Number(result.elapsedMs) || 0)
  };
  if (note) payload.note = payload.note ? `${payload.note} ${note}` : note;
  return JSON.stringify(payload);
}

const describeProgress = (language, message) => {
  if (message.stage === 'download' && message.bytes > 256 * 1024) {
    return sandboxText(language, 'sandboxDownloading', { mb: (message.bytes / 1024 / 1024).toFixed(1) });
  }
  if (message.stage === 'packages') return sandboxText(language, 'sandboxPackages');
  if (message.stage === 'runtime') return sandboxText(language, 'sandboxPreparing');
  return '';
};

export async function runSandboxReply({
  streamApiCall,
  requestParts,
  onChunk = () => {},
  signal,
  requestOptions = {},
  getSandbox,
  language = 'zh-TW',
  provider = '',
  // Files for /input: [{ name, type, size, bytes: () => Uint8Array }].
  inputFiles = [],
  // The Design menu's choices: a template means the design system.
  designs = {},
  // The model's own web searching and page opening next to Python: { searchWeb, openPage, onSources }, or null.
  research: researchTools = null,
  onStatus = () => {},
  // What happens in each run, for the work window: { type: 'step', n, title, code },
  // { type: 'output', n, stream, text } and { type: 'step-end', n, ok, error, files, elapsedMs }.
  onEvent = () => {}
}) {
  // The model's name in the status lines, so the wait says who is working.
  const model = requestOptions.modelInfo?.name || requestOptions.modelInfo?.id || 'AI';
  const say = (key, values = {}) => onStatus(sandboxText(language, key, { model, ...values }));
  let roundLabel = '';
  // A new stretch of work with its own line in the step list.
  const round = (key, values = {}) => {
    const label = sandboxText(language, key, { model, ...values });
    roundLabel = label;
    onStatus(label);
    onEvent({ type: 'round', label, doneLabel: sandboxText(language, 'ledgerThought', { model }) });
  };
  // What the last round of runs came to: the next status says what happens next.
  let outcome = null;
  const run = { status: RUN_STATUS.running, steps: [], fallback: null };
  const startedAt = Date.now();
  const toolTurns = [];
  let text = '';
  // The end of what the live view has been sent (only its last characters matter).
  let streamed = '';
  let toolsAllowed = true;
  let crashes = 0;
  let sandboxReady = null;
  let currentStep = 0;
  let thoughtKept = 0;
  let thought = '';
  let thoughtKind = 'raw';
  // When this round's thinking began and when it ended (the answer, or the end of the round).
  let thoughtStartedAt = null;
  let thoughtEndedAt = null;
  const thoughtMs = () => (thoughtStartedAt === null ? 0 : Math.max(1, (thoughtEndedAt ?? Date.now()) - thoughtStartedAt));
  // The round's thinking as it is kept: its start, within what is left.
  const takeThought = () => {
    const kept = thought.slice(0, Math.max(0, Math.min(THOUGHT_CHARS_PER_ROUND, THOUGHT_CHARS_IN_ALL - thoughtKept)));
    thoughtKept += kept.length;
    thought = '';
    return kept;
  };

  // What a round has said so far while it may still turn out to be the model announcing a run.
  let held = '';
  let holding = false;
  // Set per round: starts the wait for the model to go quiet (see WRITING_AFTER_MS), and ends it.
  let watchSilence = () => {};
  let stopWatching = () => {};
  const emit = (chunk) => {
    if (!chunk) return;
    if (holding) {
      held += chunk;
      watchSilence();
      // The model has started to write: it is no longer thinking.
      thoughtEndedAt ??= Date.now();
      if (held.length > NARRATION_HOLD_CHARS) {
        holding = false;
        const flushed = held;
        held = '';
        deliver(flushed);
      }
      return;
    }
    deliver(chunk);
  };
  const deliver = (chunk) => {
    if (!chunk) return;
    // Text written after a tool round starts on a new paragraph (in the live view, which still shows what was
    // said before the runs; the kept text no longer has it).
    const newRound = toolTurns.length && !deliver.continuing;
    const liveSeparator = newRound && streamed && !streamed.endsWith('\n') ? '\n\n' : '';
    const separator = newRound && text && !text.endsWith('\n') ? '\n\n' : '';
    if (!deliver.continuing) {
      // The answer has begun: the model is no longer thinking.
      thoughtEndedAt ??= Date.now();
      onEvent({ type: 'answering' });
    }
    deliver.continuing = true;
    stopWatching();
    text += separator + chunk;
    streamed = (streamed + liveSeparator + chunk).slice(-8);
    onChunk(liveSeparator + chunk);
  };

  const ensureSandbox = () => {
    sandboxReady ||= (async () => {
      const preparing = sandboxText(language, 'sandboxPreparing');
      onStatus(preparing);
      onEvent({ type: 'prepare', text: preparing });
      const sandbox = getSandbox({
        onProgress: (message) => {
          if (message.stage === 'output') {
            onEvent({ type: 'output', n: currentStep, stream: message.stream, text: String(message.text || '') });
            return;
          }
          const status = describeProgress(language, message);
          if (status && message.stage !== 'running') {
            onStatus(status);
            onEvent({ type: 'prepare', text: status });
          }
        }
      });
      await sandbox.prepare();
      // A new reply starts clean; loaded packages stay loaded.
      await sandbox.clear();
      await sandbox.mount(inputFiles.map((file) => ({ name: file.name, type: file.type, bytes: file.bytes() })));
      return sandbox;
    })();
    sandboxReady.catch(() => { sandboxReady = null; });
    return sandboxReady;
  };

  const guidance = [getSandboxGuidance({ inputFiles, designs }), researchTools ? researchGuidance() : ''].filter(Boolean).join('\n\n');
  const research = researchTools
    ? createResearchCalls({ ...researchTools, language, signal, onEvent })
    : null;

  for (;;) {
    const canRun = toolsAllowed && run.steps.length < MAX_RUNS_PER_REPLY;
    const canResearch = Boolean(research && research.left > 0);
    // Either kind of call may follow, so what the round says first is held back.
    const canCall = canRun || canResearch;
    let response = null;
    // Where this round's own text starts: what the model says before its runs is kept with them (below), not in the answer.
    const roundTextStart = text.length;
    let narrationTaken = false;
    deliver.continuing = false;
    held = '';
    holding = canCall;
    let narrationShown = false;
    thought = '';
    thoughtStartedAt = null;
    thoughtEndedAt = null;
    if (!toolTurns.length) round('sandboxAsking');
    else if (outcome?.failed) round('sandboxFixing');
    else if (outcome?.files) round('sandboxContinuedFiles', { count: outcome.files });
    else round('sandboxThinking');
    let writingShown = false;
    let codeStarted = false;
    let writingTimer = null;
    const showWriting = (key) => {
      if (writingShown) return;
      writingShown = true;
      const label = sandboxText(language, key, { model });
      onStatus(label);
      onEvent({ type: 'writing', label });
    };
    stopWatching = () => { clearTimeout(writingTimer); writingTimer = null; };
    watchSilence = () => {
      stopWatching();
      if (canRun && !writingShown) writingTimer = setTimeout(() => showWriting(canResearch ? 'sandboxNextStep' : 'sandboxWriting'), WRITING_AFTER_MS);
    };
    const options = {
      ...requestOptions,
      // What the model is thinking and the code it is writing, as it streams.
      onReasoning: (chunk, kind) => {
        // It was only a pause in the thinking: the line goes back to what the round is.
        if (writingShown && !codeStarted) {
          writingShown = false;
          onStatus(roundLabel);
          onEvent({ type: 'writing', label: roundLabel });
        }
        watchSilence();
        thought += chunk;
        thoughtStartedAt ??= Date.now();
        if (kind) thoughtKind = kind;
        onEvent({ type: 'thinking', text: chunk, kind });
      },
      onToolArguments: ({ name, arguments: raw }) => {
        if (name !== RUN_PYTHON_TOOL.name && !research?.handles(name)) return;
        // A call is coming: what was held back was the model saying what it is about to do.
        if (!narrationShown && held.trim()) {
          narrationShown = true;
          onEvent({ type: 'narration', text: held.trim() });
        }
        if (name === RUN_PYTHON_TOOL.name) {
          stopWatching();
          codeStarted = true;
          showWriting('sandboxWriting');
          onEvent({ type: 'code', text: partialJsonString(raw, 'code') });
        }
      },
      tools: [...(canRun ? [RUN_PYTHON_TOOL] : []), ...(canResearch ? RESEARCH_TOOLS : [])],
      toolTurns,
      additionalSystemInstruction: [requestOptions.additionalSystemInstruction, guidance].filter(Boolean).join('\n\n'),
      onResponseComplete: (value) => { response = value; }
    };
    try {
      await streamApiCall(requestParts, emit, signal, false, options);
      stopWatching();
    } catch (error) {
      stopWatching();
      // Stopping ends the stream with an error: what was thought so far is kept below, not thrown away.
      if (!signal?.aborted) {
        // Gemini may refuse its web search together with our tool; answer with
        // the search and without Python then.
        if (provider === 'gemini' && error?.status === 400 && canRun && !toolTurns.length && !text && (requestOptions.webSearchEnabled || requestOptions.conversation?.isWebSearchEnabled)) {
          toolsAllowed = false;
          run.fallback = 'search-conflict';
          continue;
        }
        throw error;
      }
    }
    if (signal?.aborted) {
      // What the round had written so far is not lost either.
      holding = false;
      if (held) deliver(held);
      held = '';
      // Stopped while thinking: what was thought so far stays, marked as interrupted.
      const kept = takeThought();
      if (kept) {
        run.thought = kept;
        run.thoughtKind = thoughtKind;
        run.thoughtMs = thoughtMs();
        run.thoughtInterrupted = true;
      }
      break;
    }
    const calls = (response?.toolCalls || []).filter((call) => call.name === RUN_PYTHON_TOOL.name || research?.handles(call.name));
    // The thinking goes to the run it led to, or to the end of the reply.
    let roundThought = takeThought();
    // What the round held back: the answer (no run follows), or the model saying what it is about to do (below).
    const heldText = held;
    held = '';
    holding = false;
    if ((!canCall || !calls.length) && heldText) deliver(heldText);
    if (!canCall || !calls.length) {
      if (roundThought) {
        run.thought = roundThought;
        run.thoughtKind = thoughtKind;
        run.thoughtMs = thoughtMs();
      }
      break;
    }

    // The searches and pages of the round are fetched at once, while the code of the round runs; the answers are taken in order.
    research?.prefetch(calls);
    const results = [];
    for (const call of calls) {
      const reply = (content) => results.push({ id: call.id, geminiId: call.geminiId, name: call.name, content });
      if (call.name !== RUN_PYTHON_TOOL.name) {
        // A search or a page: the words before it are shown between the rows, and are not the answer.
        if (!narrationShown && heldText.trim()) {
          narrationShown = true;
          onEvent({ type: 'narration', text: heldText.trim() });
        }
        try {
          reply(await research.run(call));
        } catch (error) {
          if (signal?.aborted) break;
          throw error;
        }
        continue;
      }
      const code = typeof call.args?.code === 'string' ? call.args.code : '';
      if (!code.trim()) {
        reply(toolResultFor({ error: 'The call had no "code" argument (or its arguments were not valid JSON).' }));
        continue;
      }
      if (run.steps.length >= MAX_RUNS_PER_REPLY || !toolsAllowed) {
        reply(toolResultFor({ error: `The limit of ${MAX_RUNS_PER_REPLY} runs per reply is reached. Answer with the results you have.` }));
        continue;
      }
      const title = typeof call.args?.title === 'string' ? call.args.title.trim() : '';
      const step = { title, code, stdout: '', stderr: '', files: [], elapsedMs: 0, ...(roundThought ? { thought: roundThought } : {}) };
      roundThought = '';
      // "I'll check the environment first": said before the runs of this round, it goes with the first of them
      // and leaves the answer, so the answer is only the answer.
      if (!narrationTaken) {
        narrationTaken = true;
        const narration = `${text.slice(roundTextStart)}${heldText}`.trim();
        if (narration) {
          step.narration = narration;
          text = text.slice(0, roundTextStart);
          // Shown between the steps as the run begins, when it was not already shown while its code was written.
          if (!narrationShown) {
            narrationShown = true;
            onEvent({ type: 'narration', text: narration });
          }
        }
      }
      run.steps.push(step);
      currentStep = run.steps.length;
      onEvent({ type: 'step', n: currentStep, title, code });
      onStatus(title
        ? sandboxText(language, 'sandboxRunning', { n: currentStep, title })
        : sandboxText(language, 'sandboxRunningUntitled', { n: currentStep }));

      let result;
      try {
        const sandbox = await ensureSandbox();
        onStatus(title
          ? sandboxText(language, 'sandboxRunning', { n: currentStep, title })
          : sandboxText(language, 'sandboxRunningUntitled', { n: currentStep }));
        result = await sandbox.run(code, { signal });
      } catch (error) {
        if (signal?.aborted || error?.code === 'stopped') {
          step.stopped = true;
          break;
        }
        // Python could not be loaded: the model finishes in Standard mode.
        run.fallback = 'sandbox-load-failed';
        toolsAllowed = false;
        step.error = String(error?.message || error);
        reply(toolResultFor({ error: 'Python could not be loaded in this browser.' }, {
          note: 'Do not call run_python again. Answer without it; write any file the user asked for as a ````file block instead.'
        }));
        continue;
      }
      if (result?.stopped) {
        step.stopped = true;
        break;
      }
      Object.assign(step, {
        stdout: outputText(result.stdout),
        stderr: outputText(result.stderr),
        outputTrimmed: Boolean(result.stdout?.dropped || result.stderr?.dropped),
        error: result.error || '',
        files: (result.files || []).map((file) => ({ name: file.name, size: file.size })),
        skipped: result.skippedFiles || [],
        elapsedMs: result.elapsedMs || 0,
        timedOut: Boolean(result.timedOut),
        // Kept in memory for B3, which saves them with the message.
        outputs: result.files || []
      });
      onEvent({ type: 'step-end', n: currentStep, ok: !result.error, error: result.error || '', files: result.files || [], elapsedMs: result.elapsedMs || 0 });
      let note = '';
      if (result.crashed) {
        crashes += 1;
        if (crashes >= MAX_CRASHES) {
          run.fallback = 'sandbox-crashed';
          toolsAllowed = false;
          note = 'The Python environment keeps crashing. Do not call run_python again; answer without it.';
        }
      }
      reply(toolResultFor(result, { note }));
    }
    toolTurns.push({ assistant: response, results });
    if (signal?.aborted || run.steps.some((step) => step.stopped)) break;
    const pythonCalls = calls.filter((entry) => entry.name === RUN_PYTHON_TOOL.name).length;
    const latest = run.steps.slice(-pythonCalls);
    outcome = !pythonCalls ? null : { failed: latest.some((step) => step.error), files: latest.reduce((sum, step) => sum + step.files.length, 0) };
  }

  if (signal?.aborted || run.steps.some((step) => step.stopped)) run.status = RUN_STATUS.stopped;
  else {
    run.status = RUN_STATUS.done;
    // The files are still being embedded and saved after this returns.
    if (run.steps.length) {
      const label = sandboxText(language, 'sandboxFinishing', { model });
      onStatus(label);
      onEvent({ type: 'finishing', label });
    }
  }
  run.elapsedMs = Date.now() - startedAt;
  return { text, run: run.steps.length || run.fallback || run.thought ? run : null };
}
