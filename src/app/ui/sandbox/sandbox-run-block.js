// What Advanced mode keeps in a reply's text: a single-line JSON block at the
// very start with the Python runs (title, code, output, files) or the reason
// the reply switched to Standard mode.
//
//   ```noureon-run
//   {"v":1,"status":"done","steps":[…]}
//   ```
//
// Being part of the text, it is saved, synced, exported and shared with the
// message. It is lifted out before Markdown rendering and drawn as the
// collapsible "Ran code N times" row; the model only ever sees a one-line
// summary of it.

const FENCE = '```noureon-run';
const BLOCK_PATTERN = /^```noureon-run\n([^\n]*)\n```[ \t]*(?:\n+|$)/;

// Display limits for what is stored per step.
export const STORED_TEXT_CHARS = 50_000;
const STORED_CODE_CHARS = 100_000;
const MAX_STEPS = 20;
const STORED_THOUGHT_CHARS = 6000;
// What the model said before a run ("I'll check the environment first"), shown between the steps.
const STORED_NARRATION_CHARS = 2000;
const MAX_SOURCES = 12;

export const RUN_STATUS = Object.freeze({ running: 'running', done: 'done', failed: 'failed', stopped: 'stopped' });

const clip = (value, limit) => {
  const text = String(value ?? '');
  return text.length > limit ? { text: text.slice(0, limit), trimmed: true } : { text, trimmed: false };
};

const cleanStep = (step = {}) => {
  const stdout = clip(step.stdout, STORED_TEXT_CHARS);
  const stderr = clip(step.stderr, STORED_TEXT_CHARS);
  return {
    title: String(step.title || '').slice(0, 200),
    ...(step.thought ? { thought: clip(step.thought, STORED_THOUGHT_CHARS).text } : {}),
    ...(String(step.narration || '').trim() ? { narration: clip(String(step.narration).trim(), STORED_NARRATION_CHARS).text } : {}),
    code: clip(step.code, STORED_CODE_CHARS).text,
    stdout: stdout.text,
    stderr: stderr.text,
    ...(stdout.trimmed || stderr.trimmed || step.outputTrimmed ? { outputTrimmed: true } : {}),
    ...(step.error ? { error: clip(step.error, 8000).text } : {}),
    // `id` names the message part holding the file (sandbox-files.js).
    files: (Array.isArray(step.files) ? step.files : []).slice(0, 20).map((file) => ({
      name: String(file.name || ''),
      size: Number(file.size) || 0,
      ...(typeof file.id === 'string' && /^[\w-]{1,64}$/.test(file.id) ? { id: file.id } : {})
    })),
    ...(Array.isArray(step.skipped) && step.skipped.length ? { skipped: step.skipped.slice(0, 20).map((file) => ({ name: String(file.name || ''), reason: String(file.reason || '') })) } : {}),
    elapsedMs: Math.max(0, Math.round(Number(step.elapsedMs) || 0)),
    ...(step.timedOut ? { timedOut: true } : {}),
    ...(step.stopped ? { stopped: true } : {})
  };
};

// The pages a web search found, for the "Searched N sites" row: only web addresses are kept.
export function normalizeSources(sources) {
  const seen = new Set();
  const kept = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const url = String(source?.url || '').trim().slice(0, 600);
    if (!/^https?:\/\/[^\s]+$/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    kept.push({ title: String(source?.title || '').slice(0, 160), url });
    if (kept.length >= MAX_SOURCES) break;
  }
  return kept;
}

export function normalizeSandboxRun(run = {}) {
  const steps = (Array.isArray(run.steps) ? run.steps : []).slice(0, MAX_STEPS).map(cleanStep);
  const status = Object.values(RUN_STATUS).includes(run.status) ? run.status : RUN_STATUS.done;
  return {
    v: 1,
    status,
    steps,
    // How long the reply took in all (thinking, runs and files), for the "Processed for 1m 5s" line.
    ...(Number(run.elapsedMs) > 0 ? { elapsedMs: Math.round(Number(run.elapsedMs)) } : {}),
    ...(normalizeSources(run.sources).length ? { sources: normalizeSources(run.sources) } : {}),
    ...(run.thought ? { thought: clip(run.thought, STORED_THOUGHT_CHARS).text } : {}),
    ...(run.thought && run.thoughtKind === 'summary' ? { thoughtKind: 'summary' } : {}),
    ...(run.thought && run.thoughtInterrupted ? { thoughtInterrupted: true } : {}),
    ...(run.thought && Number(run.thoughtMs) > 0 ? { thoughtMs: Math.round(Number(run.thoughtMs)) } : {}),
    ...(run.fallback ? { fallback: String(run.fallback) } : {})
  };
}

export function formatSandboxRunBlock(run) {
  // JSON.stringify escapes newlines, so the payload is one line and cannot
  // close the fence.
  return `${FENCE}\n${JSON.stringify(normalizeSandboxRun(run))}\n\`\`\`\n\n`;
}

// Splits a reply into its run (or null) and the rest of the text.
export function liftSandboxRunBlock(text = '') {
  const source = String(text || '');
  if (!source.startsWith(FENCE)) return { run: null, text: source };
  const match = BLOCK_PATTERN.exec(source);
  if (!match) return { run: null, text: source };
  try {
    return { run: normalizeSandboxRun(JSON.parse(match[1])), text: source.slice(match[0].length) };
  } catch {
    return { run: null, text: source.slice(match[0].length) };
  }
}

export const hasSandboxRunBlock = (text = '') => String(text || '').startsWith(FENCE);

// One line for the model (and for memory, search and titles): what ran and
// what it produced, never the code or its output.
export function summarizeSandboxRun(run) {
  if (!run) return '';
  if (!run.steps.length) return run.fallback ? '[Answered in Standard mode.]\n' : '';
  const files = [...new Set(run.steps.flatMap((step) => step.files.map((file) => file.name)))];
  const produced = files.length ? `; it created ${files.map((name) => `/output/${name}`).join(', ')}` : '';
  return `[Earlier in this reply Python ran ${run.steps.length} time${run.steps.length === 1 ? '' : 's'} in the sandbox${produced}. That environment is gone.]\n`;
}

export function summarizeSandboxRunText(text = '') {
  const { run, text: rest } = liftSandboxRunBlock(text);
  return run ? `${summarizeSandboxRun(run)}${rest}` : String(text || '');
}

// History sent to the model: each model message's run block becomes its
// one-line summary. Stored messages are never changed.
export function compactSandboxRunsForApi(history = []) {
  if (!Array.isArray(history)) return history;
  return history.map((message) => {
    if (message?.role !== 'model' && message?.role !== 'assistant') return message;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    let changed = false;
    const next = parts.map((part) => {
      if (typeof part?.text !== 'string' || !hasSandboxRunBlock(part.text)) return part;
      changed = true;
      return { ...part, text: summarizeSandboxRunText(part.text) };
    });
    return changed ? { ...message, parts: next } : message;
  });
}
