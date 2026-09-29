// One Advanced mode reply: the model may call run_python; each call runs in
// the browser sandbox and its result goes back to the model, until the model
// answers without a call (at most MAX_RUNS_PER_REPLY runs). Returns the
// answer text and the run record kept above it. Loaded on demand.

import { MAX_RUNS_PER_REPLY, RUN_PYTHON_TOOL, getSandboxGuidance } from './sandbox-guidance.js';
import { sandboxText } from './sandbox-texts.js';
import { RUN_STATUS } from '../../ui/sandbox/sandbox-run-block.js';

const MODEL_TEXT_CHARS = 10_000;
const MAX_CRASHES = 2;

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
  onStatus = () => {}
}) {
  const run = { status: RUN_STATUS.running, steps: [], fallback: null };
  const toolTurns = [];
  let text = '';
  let toolsAllowed = true;
  let crashes = 0;
  let sandboxReady = null;
  let currentStep = 0;

  const emit = (chunk) => {
    if (!chunk) return;
    // Text written after a tool round starts on a new paragraph.
    const separator = text && toolTurns.length && !text.endsWith('\n') && !emit.continuing ? '\n\n' : '';
    emit.continuing = true;
    text += separator + chunk;
    onChunk(separator + chunk);
  };

  const ensureSandbox = () => {
    sandboxReady ||= (async () => {
      onStatus(sandboxText(language, 'sandboxPreparing'));
      const sandbox = getSandbox({
        onProgress: (message) => {
          const status = describeProgress(language, message);
          if (status && message.stage !== 'running') onStatus(status);
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

  const guidance = getSandboxGuidance({ inputFiles, designs });

  for (;;) {
    const canRun = toolsAllowed && run.steps.length < MAX_RUNS_PER_REPLY;
    let response = null;
    emit.continuing = false;
    const options = {
      ...requestOptions,
      tools: canRun ? [RUN_PYTHON_TOOL] : [],
      toolTurns,
      additionalSystemInstruction: [requestOptions.additionalSystemInstruction, guidance].filter(Boolean).join('\n\n'),
      onResponseComplete: (value) => { response = value; }
    };
    try {
      await streamApiCall(requestParts, emit, signal, false, options);
    } catch (error) {
      // Gemini may refuse its web search together with our tool; answer with
      // the search and without Python then.
      if (provider === 'gemini' && error?.status === 400 && canRun && !toolTurns.length && !text && (requestOptions.webSearchEnabled || requestOptions.conversation?.isWebSearchEnabled)) {
        toolsAllowed = false;
        run.fallback = 'search-conflict';
        continue;
      }
      throw error;
    }
    if (signal?.aborted) break;
    const calls = (response?.toolCalls || []).filter((call) => call.name === RUN_PYTHON_TOOL.name);
    if (!canRun || !calls.length) break;

    const results = [];
    for (const call of calls) {
      const reply = (content) => results.push({ id: call.id, geminiId: call.geminiId, name: call.name, content });
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
      const step = { title, code, stdout: '', stderr: '', files: [], elapsedMs: 0 };
      run.steps.push(step);
      currentStep = run.steps.length;
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
    onStatus(sandboxText(language, 'sandboxThinking'));
  }

  if (signal?.aborted || run.steps.some((step) => step.stopped)) run.status = RUN_STATUS.stopped;
  else run.status = RUN_STATUS.done;
  return { text, run: run.steps.length || run.fallback ? run : null };
}
