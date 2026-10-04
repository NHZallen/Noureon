// One Advanced mode reply: the model may call run_python; each call runs in
// the browser sandbox and its result goes back to the model, until the model
// answers without a call (at most MAX_RUNS_PER_REPLY runs). Returns the
// answer text and the run record kept above it. Loaded on demand.

import { MAX_RUNS_PER_REPLY, MAX_RUNS_WITH_CLI, RUN_COMMAND_TOOL, RUN_PYTHON_TOOL, RUN_PYTHON_TOOL_SERVER, REQUEST_CREDENTIALS_TOOL, getCliGuidance, getSandboxGuidance } from './sandbox-guidance.js';
import { sandboxText } from './sandbox-texts.js';
import { RUN_STATUS } from '../../ui/sandbox/sandbox-run-block.js';
import { partialJsonString } from '../../legacy-runtime/features/tool-call-formats.js';
import { RESEARCH_TOOLS, createNotes, createResearchCalls, researchGuidance } from '../../legacy-runtime/features/web-research-reply.js';

const MODEL_TEXT_CHARS = 10_000;
const MAX_CRASHES = 2;
// The thinking kept with the run (it is saved with the message), per round and in all.
const THOUGHT_CHARS_PER_ROUND = 6000;
const THOUGHT_CHARS_IN_ALL = 30_000;
// After the model has gone quiet this long in a round that may call a tool, the line says it is writing it: a long
// program arrives all at once, and the line would otherwise look stuck on what came before.
const WRITING_AFTER_MS = 600;

// Long output keeps its start and end for the model.
export function trimForModel(text = '', limit = MODEL_TEXT_CHARS) {
  const source = String(text || '');
  if (source.length <= limit) return source;
  const head = Math.floor(limit * 0.7);
  const tail = limit - head;
  return `${source.slice(0, head)}\n…[${source.length - limit} characters omitted]…\n${source.slice(-tail)}`;
}

const outputText = (value) => (typeof value === 'string' ? value : String(value?.text || ''));
/** The last line with something in it, short (what a failed install said last). */
const lastLine = (text) => String(text || '').split('\n').map((line) => line.trim()).filter(Boolean).at(-1)?.slice(0, 200) || '';

// The tool result the model reads.
export function toolResultFor(result = {}, { note = '' } = {}) {
  const payload = {
    ok: !result.error,
    stdout: trimForModel(outputText(result.stdout)),
    stderr: trimForModel(outputText(result.stderr)),
    ...(result.error ? { error: trimForModel(result.error, 4000) } : {}),
    files: (result.files || []).map((file) => ({ path: `/output/${file.name}`, size: file.size })),
    ...(result.skippedFiles?.length ? {
      skipped_files: result.skippedFiles.map((file) => ({ path: `/output/${file.name}`, reason: file.reason, ...(file.size ? { size_mb: Math.round(file.size / 1048576) } : {}), ...(file.limit ? { limit_mb: Math.round(file.limit / 1048576) } : {}) })),
      skipped_note: 'These files were NOT delivered to the user. If a file was too large, make a smaller one (a lower quality or resolution, a shorter clip, audio only) and tell the user why; do not claim the file was delivered.'
    } : {}),
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
  // Where the code runs: 'browser' (Pyodide in the page) or 'server' (a container; the server makes the reply).
  host = 'browser',
  // Files for /input: [{ name, type, size, bytes: () => Uint8Array }].
  inputFiles = [],
  // The Design menu's choices: a template means the design system.
  designs = {},
  // The model's own web searching and page opening next to Python: { searchWeb, openPage, onSources }, or null.
  research: researchTools = null,
  // The CLI tools the person chose with "@" (a reply on the server only): [{ id, name, version, usage, env, program?: { file, url, sha256, size },
  // install?: the command that installs a pip tool, missing?: the secure credentials it needs that are not set }]. The model gets run_command for them.
  cli: cliTools = [],
  // Asks the person for the login a tool needs, in a window of the app: ({ toolId }) => Promise<{ provided }>. Only the server has it.
  askCredentials = null,
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

  // Set per round: starts the wait for the model to go quiet (see WRITING_AFTER_MS), and ends it.
  let watchSilence = () => {};
  let stopWatching = () => {};
  // What the model says about a step is in the call's `note`, so any text it writes is the answer and shows as it comes.
  const emit = (chunk) => {
    if (!chunk) return;
    deliver(chunk);
  };
  const notes = createNotes(onEvent);
  const useCli = host === 'server' && cliTools.length > 0;
  const maxRuns = useCli ? MAX_RUNS_WITH_CLI : MAX_RUNS_PER_REPLY;
  // What the programs of the tools need in the environment of a command.
  const cliEnv = Object.assign({}, ...cliTools.map((tool) => tool.env || {}));
  // Set when the programs could not be put in the sandbox: a command then fails with this.
  let cliFailure = '';
  // A tool that could not be made ready (its install failed): the model is told, and the others work.
  const cliProblems = {};
  // The model's own tools that need a login the person has not given: it may ask for it (the tools the person chose with "@" were asked about already).
  const canAskCredentials = useCli && typeof askCredentials === 'function' && cliTools.some((tool) => tool.chosen === false && tool.missing?.length);
  const isCredentialRequest = (name) => canAskCredentials && name === REQUEST_CREDENTIALS_TOOL.name;
  const isRunTool = (name) => name === RUN_PYTHON_TOOL.name || (useCli && name === RUN_COMMAND_TOOL.name);
  let roundMayCall = false;
  const deliver = (chunk) => {
    if (!chunk) return;
    // Text written after a tool round starts on a new paragraph.
    const newRound = toolTurns.length && !deliver.continuing;
    const liveSeparator = newRound && streamed && !streamed.endsWith('\n') ? '\n\n' : '';
    const separator = newRound && text && !text.endsWith('\n') ? '\n\n' : '';
    if (!deliver.continuing) {
      // The answer has begun: the model is no longer thinking.
      thoughtEndedAt ??= Date.now();
      // `more`: the round could still call a tool, so the work may go on after these words (the step list does not say it is over yet).
      onEvent({ type: 'answering', more: roundMayCall });
    }
    deliver.continuing = true;
    stopWatching();
    text += separator + chunk;
    streamed = (streamed + liveSeparator + chunk).slice(-8);
    onChunk(liveSeparator + chunk);
    // Words that may be followed by a call: when the model then goes quiet (it is writing the call), the line says so.
    if (roundMayCall) watchSilence();
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
          // A program asks to reach a site (the person is asked), or the person has answered: the work window shows it as a card.
          if (message.stage === 'net') {
            onEvent({ type: 'net', event: message.event, id: String(message.id || ''), host: String(message.host || ''), port: Number(message.port) || 0, decision: String(message.decision || ''), waitMs: Number(message.waitMs) || 0 });
            if (message.event === 'ask') onStatus(sandboxText(language, 'sandboxNetWaiting', { host: String(message.host || '') }));
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
      if (useCli) {
        // The programs: fetched by the host the first time (this can take a while).
        const label = sandboxText(language, 'sandboxCliPreparing');
        onStatus(label);
        onEvent({ type: 'prepare', text: label });
        try {
          // Also with no program to bring (a pip tool only): the sandbox gets its network here.
          await sandbox.mountCli(cliTools.filter((tool) => tool.program).map((tool) => ({ id: tool.id, ...tool.program })));
        } catch (error) {
          if (signal?.aborted) throw error;
          cliFailure = String(error?.message || error).slice(0, 300);
        }
      }
      return sandbox;
    })();
    sandboxReady.catch(() => { sandboxReady = null; });
    return sandboxReady;
  };

  // A Python tool is installed the first time a command uses it (not for every reply that merely has it among its tools): the person is asked about
  // a site the install needs that has no rule, and the install is told in the step that needs it.
  const installed = new Set();
  const installFor = async (sandbox, commandLine) => {
    for (const tool of cliTools) {
      if (!tool.install || installed.has(tool.id) || cliProblems[tool.id]) continue;
      const names = Array.isArray(tool.pip?.commands) && tool.pip.commands.length ? tool.pip.commands : [tool.pip?.command].filter(Boolean);
      if (!names.some((name) => new RegExp(`(^|[\\s;&|(\\/])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s;&|)])`).test(commandLine))) continue;
      installed.add(tool.id);
      const installing = sandboxText(language, 'sandboxCliInstalling', { name: tool.name });
      onStatus(installing);
      onEvent({ type: 'prepare', text: installing });
      try {
        const done = await sandbox.command(tool.install, { signal, plain: true, timeoutMs: 120_000 });
        if (done?.stopped) throw Object.assign(new Error('stopped'), { code: 'stopped' });
        if (done?.error) cliProblems[tool.id] = lastLine(outputText(done.stderr)) || String(done.error).slice(0, 200);
      } catch (error) {
        if (signal?.aborted || error?.code === 'stopped') throw error;
        cliProblems[tool.id] = String(error?.message || error).slice(0, 200);
      }
    }
  };

  const guidance = [getSandboxGuidance({ inputFiles, designs, host }), useCli ? getCliGuidance(cliTools.map((tool) => ({ ...tool, file: tool.program?.file || tool.pip?.command })), { canAsk: typeof askCredentials === 'function' }) : '', researchTools ? researchGuidance() : ''].filter(Boolean).join('\n\n');
  const research = researchTools
    ? createResearchCalls({ ...researchTools, language, signal, onEvent })
    : null;

  for (;;) {
    const canRun = toolsAllowed && run.steps.length < maxRuns;
    const canResearch = Boolean(research && research.left > 0);
    const canCall = canRun || canResearch;
    let response = null;
    deliver.continuing = false;
    roundMayCall = canCall;
    notes.reset();
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
        if (!isRunTool(name) && !research?.handles(name)) return;
        // What the model says about the step is in its note: shown between the rows as soon as it is written.
        notes.fromArguments(raw);
        if (isRunTool(name)) {
          stopWatching();
          codeStarted = true;
          showWriting('sandboxWriting');
          onEvent({ type: 'code', text: partialJsonString(raw, name === RUN_COMMAND_TOOL.name ? 'command' : 'code') });
        }
      },
      tools: [...(canRun ? [host === 'server' ? RUN_PYTHON_TOOL_SERVER : RUN_PYTHON_TOOL, ...(useCli ? [RUN_COMMAND_TOOL] : []), ...(canAskCredentials ? [REQUEST_CREDENTIALS_TOOL] : [])] : []), ...(canResearch ? RESEARCH_TOOLS : [])],
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
    // The round wrote its words and no call follows: that was the answer, and the work is over.
    const answerEnded = () => { if (deliver.continuing && roundMayCall) onEvent({ type: 'answered' }); };
    if (signal?.aborted) {
      answerEnded();
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
    const calls = (response?.toolCalls || []).filter((call) => isRunTool(call.name) || isCredentialRequest(call.name) || research?.handles(call.name));
    // The thinking goes to the run it led to, or to the end of the reply.
    let roundThought = takeThought();
    if (!canCall || !calls.length) {
      answerEnded();
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
      if (isCredentialRequest(call.name)) {
        // The window that asks the person for a tool's login: the reply waits for the answer, and the model only learns whether it was given.
        const tool = cliTools.find((entry) => entry.id === String(call.args?.tool || '').trim());
        if (!tool || !tool.missing?.length) {
          reply({ provided: false, message: tool ? `${tool.name} has nothing missing.` : 'No such CLI tool in the instructions.' });
          continue;
        }
        onStatus(sandboxText(language, 'sandboxCredentialWaiting', { tool: tool.name }));
        let answered = { provided: false };
        try {
          answered = await askCredentials({ toolId: tool.id });
        } catch (error) {
          if (signal?.aborted) break;
          answered = { provided: false };
        }
        if (answered?.provided) tool.missing = [];
        reply(answered?.provided
          ? { provided: true, message: `The user provided the login for ${tool.name}. Go on and use the tool.` }
          : { provided: false, message: `The user did not provide the login for ${tool.name}. Say so and stop using it; do not ask for the value in the chat or look for another way to log in.` });
        continue;
      }
      if (!isRunTool(call.name)) {
        // A search or a page: what the model says about it is shown between the rows.
        notes.fromCall(call);
        try {
          reply(await research.run(call));
        } catch (error) {
          if (signal?.aborted) break;
          throw error;
        }
        continue;
      }
      const isCommand = call.name === RUN_COMMAND_TOOL.name;
      const argument = isCommand ? 'command' : 'code';
      const code = typeof call.args?.[argument] === 'string' ? call.args[argument] : '';
      if (!code.trim()) {
        reply(toolResultFor({ error: `The call had no "${argument}" argument (or its arguments were not valid JSON).` }));
        continue;
      }
      if (run.steps.length >= maxRuns || !toolsAllowed) {
        reply(toolResultFor({ error: `The limit of ${maxRuns} runs per reply is reached. Answer with the results you have.` }));
        continue;
      }
      const title = typeof call.args?.title === 'string' ? call.args.title.trim() : '';
      const step = { title, code, ...(isCommand ? { command: true } : {}), stdout: '', stderr: '', files: [], elapsedMs: 0, ...(roundThought ? { thought: roundThought } : {}) };
      roundThought = '';
      // "I'll check the environment first": the note of the call, shown between the steps as the run begins (when it was not
      // already shown while the code was written) and kept with the step.
      const said = String(call.args?.note || '').replace(/\s+/g, ' ').trim();
      if (said) {
        step.narration = said;
        notes.fromCall(call);
      }
      run.steps.push(step);
      currentStep = run.steps.length;
      onEvent({ type: 'step', n: currentStep, title, code, ...(isCommand ? { command: true } : {}) });
      onStatus(title
        ? sandboxText(language, 'sandboxRunning', { n: currentStep, title })
        : sandboxText(language, 'sandboxRunningUntitled', { n: currentStep }));

      let result;
      try {
        const sandbox = await ensureSandbox();
        onStatus(title
          ? sandboxText(language, 'sandboxRunning', { n: currentStep, title })
          : sandboxText(language, 'sandboxRunningUntitled', { n: currentStep }));
        result = isCommand
          ? (cliFailure
            ? { stdout: '', stderr: '', error: `The CLI tools could not be prepared (${cliFailure}). Do not call run_command again; answer without it.`, files: [], elapsedMs: 0 }
            : await (async () => {
              await installFor(sandbox, code);
              return sandbox.command(code, { signal, env: cliEnv, timeoutMs: Math.min(120, Math.max(5, Number(call.args?.timeout_seconds) || 60)) * 1000 });
            })())
          : await sandbox.run(code, { signal });
      } catch (error) {
        if (signal?.aborted || error?.code === 'stopped') {
          step.stopped = true;
          break;
        }
        // Python could not be loaded: the model finishes in Standard mode.
        run.fallback = 'sandbox-load-failed';
        toolsAllowed = false;
        step.error = String(error?.message || error);
        reply(toolResultFor({ error: host === 'server' ? 'Python could not be started.' : 'Python could not be loaded in this browser.' }, {
          note: `Do not call ${isCommand ? 'run_command' : 'run_python'} again. Answer without it; write any file the user asked for as a \`\`\`\`file block instead.`
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
      onEvent({ type: 'step-end', n: currentStep, ok: !result.error, error: result.error || '', files: result.files || [], skipped: result.skippedFiles || [], elapsedMs: result.elapsedMs || 0 });
      let note = '';
      if (result.crashed) {
        crashes += 1;
        if (crashes >= MAX_CRASHES) {
          run.fallback = 'sandbox-crashed';
          toolsAllowed = false;
          note = 'The Python environment keeps crashing. Do not call run_python again; answer without it.';
        }
      }
      // A tool whose install failed (known only now: the sandbox is made when the first step needs it): the model is told with the result.
      if (isCommand) {
        const failed = cliTools.filter((tool) => cliProblems[tool.id]).map((tool) => `${tool.name} could not be installed (${cliProblems[tool.id]})`);
        if (failed.length) note = `${note ? `${note} ` : ''}${failed.join('; ')}. Do not use ${failed.length === 1 ? 'it' : 'them'} or install ${failed.length === 1 ? 'it' : 'them'} another way: tell the person.`;
      }
      reply(toolResultFor(result, { note }));
    }
    toolTurns.push({ assistant: response, results });
    if (signal?.aborted || run.steps.some((step) => step.stopped)) break;
    const pythonCalls = calls.filter((entry) => isRunTool(entry.name)).length;
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
