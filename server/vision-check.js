// The automatic visual check of a presentation, made on the server after the reply that wrote it (the page's own check, in
// src/app/ui/files/vision/vision-check.js and vision-free-check.js, does the same in the page): the slides are drawn as pictures
// (server/slides/), the model looks at them, and when it finds problems the deck is corrected (the design system's spec by edits, a deck
// Python drew by asking the model to redo it in the sandbox) and the result is written into the conversation as a new reply.
//
// What happens is told as it happens, as the calls the page's progress line has (`progress.set`, `slideRendered`, …), so every page
// shows the same line (src/app/ui/files/vision/vision-progress.js); see `remoteProgress`.

import { modelSupportsVision } from '../src/app/runtime/legacy-core/model-registry.js';
import { parseDocumentSpec } from '../src/app/ui/files/design/document-spec.js';
import { askVision } from '../src/app/ui/files/vision/vision-ask.js';
import { eligibleVisionFiles } from '../src/app/ui/files/vision/vision-eligibility.js';
import { buildFixRequest, buildFreeVisionMetadata, buildFreeVisionPrompt, buildFreeVisionResult } from '../src/app/ui/files/vision/vision-free.js';
import { buildVisionPrompt, INVALID_VISION_RESPONSE } from '../src/app/ui/files/vision/vision-prompt.js';
import { buildVisionMetadata, buildVisionResult } from '../src/app/ui/files/vision/vision-result.js';
import { applyVisionEdits } from '../src/app/ui/files/vision/vision-edits.js';
import { VISION_TEXTS, visionText } from '../src/app/ui/files/vision/vision-texts.js';
import { formatSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { runSandboxReply } from '../src/app/runtime/sandbox/sandbox-reply.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';
import { collectInputFiles, createStepEvents, finishAdvancedReply } from './advanced-reply.js';
import { createModelAccess } from './model-access.js';
import { scrubMessage } from './executor.js';

const REVIEW_TIMEOUT_MS = 120_000;
const FIX_TIMEOUT_MS = 300_000;

export class VisionRefused extends Error {}

/**
 * The files of a reply the check is for: designed decks (complete .pptx blocks of the text) and decks Python drew (parts holding a .pptx),
 * as the page's check finds them. `config.visionCheckEnabled` is true: the page asked. Returns [] when nothing is to be checked.
 */
export function visionFiles({ spec, text, parts }) {
  const model = spec.model.info;
  if (!spec.tools.visionCheck || !model || model.outputModality === 'image' || !modelSupportsVision(model)) return [];
  const message = { id: spec.assistantMessageId, role: 'model', parts: [{ text }, ...parts.filter((part) => part.sandboxFile)], metadata: {} };
  return eligibleVisionFiles({
    conversation: { id: spec.conversationId },
    message,
    model,
    config: { visionCheckEnabled: true, uiLanguage: spec.request.language },
    signal: null,
    responseUsesCouncil: false,
    modelSupportsVision
  });
}

/** The page's progress calls, told to those watching as events { m: method, a: arguments }. */
export function remoteProgress(emit, { language }) {
  const send = (m, ...a) => emit({ m, a });
  return {
    set: (key, values) => send('set', key, values),
    slideRendered: (event) => send('slide', event),
    sheetReady: (event) => send('sheet', event),
    thinking: (chunk) => { if (chunk) send('think', chunk); },
    showIssues: (issues) => send('issues', issues),
    setText: (line) => send('text', line),
    python: () => {
      const steps = createStepEvents({ send: (event) => send('py', event) });
      return { event: (event) => steps.event(event), remove: () => { steps.flush(); send('pyEnd'); } };
    },
    remove: () => send('remove'),
    language
  };
}

const failureReason = ({ error, timedOut, language }) => {
  if (timedOut) return { code: 'timed_out', text: visionText(language, 'timedOut') };
  if (error?.code === INVALID_VISION_RESPONSE) return { code: 'invalid_response', text: visionText(language, 'invalidResponse') };
  return { code: 'failed', text: String(error?.message || error?.name || 'unknown error') };
};

/**
 * Runs the check of the files of one reply. `spec` is the run's request (the reply's, with `source`: { text, parts } the reply as written).
 * `onLive({ vc: event })` tells what happens; `writeMessage({ id, parts, metadata })` writes a corrected reply into the conversation;
 * `decks` maps the ids of the files Python made to their bytes (those not there are read from the person's storage).
 * Resolves { checked, written: [message ids] }.
 */
export async function executeVisionCheck({
  spec, secrets, signal, userId, files, sandboxHost = null, decks = new Map(), onLive = () => {}, writeMessage, getKit, fetchImpl = fetch,
  now = Date.now, createId = () => crypto.randomUUID()
}) {
  const language = spec.request.language;
  const model = spec.model.info;
  const config = { visionCheckEnabled: true, uiLanguage: language, aiDefaultLanguage: language };
  const access = createModelAccess({ spec, secrets, fetchImpl });
  const source = spec.source;
  const targets = visionFiles({ spec, text: source.text, parts: source.parts });
  const emit = (event) => onLive({ vc: event });
  const written = [];
  let checked = 0;

  for (const file of targets) {
    if (signal?.aborted) break;
    emit({ m: 'begin', a: [{ name: file.name, free: Boolean(file.free) }] });
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener?.('abort', abort, { once: true });
    let timedOut = false;
    let timer = null;
    const arm = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
    };
    arm(REVIEW_TIMEOUT_MS);
    const progress = remoteProgress(emit, { language });
    try {
      const outcome = file.free
        ? await checkFreeDeck({ file, spec, source, access, model, config, controller, language, progress, arm, userId, files, sandboxHost, decks, getKit, secrets })
        : await checkDesignedDeck({ file, spec, access, model, language, controller, progress, arm, getKit, source });
      if (outcome.revised) {
        const id = written.length ? createId() : spec.assistantMessageId;
        await writeMessage({ id, parts: outcome.revised.parts, metadata: outcome.revised.metadata });
        written.push(id);
        emit({ m: 'file-end', a: [{ outcome: 'fixed', messageId: id }] });
        checked += 1;
      } else if (outcome.clean) {
        emit({ m: 'file-end', a: [{ outcome: 'clean' }] });
        checked += 1;
      } else {
        // Left alone (the deck cannot be redone here).
        progress.remove();
        emit({ m: 'file-end', a: [{ outcome: 'left' }] });
      }
    } catch (error) {
      progress.remove();
      if (controller.signal.aborted && !timedOut) {
        // A stop: nothing is said.
        emit({ m: 'file-end', a: [{ outcome: 'stopped' }] });
        break;
      }
      const reason = failureReason({ error, timedOut, language });
      emit({ m: 'file-end', a: [{ outcome: 'failed', code: reason.code, reason: scrubMessage(reason.text, secrets) }] });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', abort);
    }
  }
  return { checked, written };
}

// ------------------------------------------------------------ a deck from the design system

const imageResolver = (history, current) => {
  // "upload:N" is the Nth image attached to the conversation, from the first message.
  const images = [...history.flatMap((message) => (message.role === 'user' ? message.parts || [] : [])), ...current]
    .filter((part) => /^image\/(?:png|jpe?g)$/i.test(part?.inlineData?.mimeType || '') && typeof part.inlineData.data === 'string');
  return async (reference) => {
    if (reference?.kind !== 'upload' || !Number.isInteger(reference.index) || reference.index < 1) return null;
    const image = images[reference.index - 1]?.inlineData;
    if (!image) return null;
    try {
      const { loadImage } = await import('@napi-rs/canvas');
      const picture = await loadImage(Buffer.from(image.data, 'base64'));
      return { data: `data:${image.mimeType};base64,${image.data}`, pixels: { width: picture.width, height: picture.height } };
    } catch {
      return null;
    }
  };
};

async function checkDesignedDeck({ file, spec, access, model, language, controller, progress, arm, getKit, source }) {
  const [{ layoutDesignedDeck }, { renderContactSheets }, kit] = await Promise.all([import('./slides/designed-deck.js'), import('./slides/render.js'), getKit()]);
  const parsed = parseDocumentSpec(file.content, { uiLanguage: language });
  if (!parsed.ok) return { left: true };
  const resolveImage = imageResolver(spec.request.history, spec.request.currentMessage.parts);
  const presentation = await layoutDesignedDeck(parsed.spec, { kit, language, resolveImage });
  controller.signal.throwIfAborted();
  progress.set('rendering');
  const sheets = await renderContactSheets(presentation, { kit, language, signal: controller.signal, onSlide: progress.slideRendered, onSheet: progress.sheetReady });
  progress.set('reviewing', { model: model.name || model.id });
  const prompt = buildVisionPrompt(parsed.spec, presentation.layout, { uiLanguage: language, deckDesign: spec.tools.visionCheck.deckDesign || 'auto', checkedSlides: sheets.checkedSlides });
  const images = sheets.images.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } }));
  const result = await askVision({ streamApiCall: access.streamApiCall, prompt, images, model, conversation: access.conversation, signal: controller.signal, progress, arm });
  if (!result.issues.length) {
    progress.remove();
    return { clean: true };
  }
  progress.showIssues(result.issues);
  progress.set('applying');
  const edits = applyVisionEdits(parsed.spec, result.edits);
  if (!edits.applied.length) throw new Error((VISION_TEXTS[language] || VISION_TEXTS.en).notFixed);
  // The corrected deck has to lay out before it is offered.
  await layoutDesignedDeck(edits.spec, { kit, language, resolveImage });
  controller.signal.throwIfAborted();
  const content = buildVisionResult({ result, edits, renderedSlides: presentation.layout.slides, file, language, checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides });
  progress.remove();
  return { revised: { parts: [{ text: content }], metadata: { ...(spec.request.messageMetadata || {}), visionCheck: buildVisionMetadata({ file, model, result, edits, checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides }) } } };
}

// ------------------------------------------------------------ a deck Python drew

async function checkFreeDeck({ file, spec, source, access, model, config, controller, language, progress, arm, userId, files, sandboxHost, decks, getKit, secrets }) {
  const [{ buildFreePresentation }, { renderContactSheets }, kit] = await Promise.all([import('./slides/free-deck.js'), import('./slides/render.js'), getKit()]);
  let bytes = decks.get(file.id);
  if (!bytes) {
    const part = source.parts.find((entry) => entry.sandboxFile?.id === file.id)?.sandboxFile;
    if (!part) return { left: true };
    bytes = typeof part.data === 'string' ? new Uint8Array(Buffer.from(part.data, 'base64')) : await files.load({ userId, marker: part.data });
  }
  const presentation = await buildFreePresentation(bytes, { kit });
  controller.signal.throwIfAborted();
  progress.set('rendering');
  const sheets = await renderContactSheets(presentation, { kit, language, signal: controller.signal, onSlide: progress.slideRendered, onSheet: progress.sheetReady });
  progress.set('reviewing', { model: model.name || model.id });
  const prompt = buildFreeVisionPrompt({ file, layout: presentation.layout, uiLanguage: language, checkedSlides: sheets.checkedSlides });
  const images = sheets.images.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } }));
  const result = await askVision({ streamApiCall: access.streamApiCall, prompt, images, model, conversation: access.conversation, signal: controller.signal, progress, arm, requireEdits: false });
  if (!result.issues.length) {
    progress.remove();
    return { clean: true };
  }
  progress.showIssues(result.issues);
  progress.set('fixing', { model: model.name || model.id });
  // Redoing the deck needs Python, which the person's conversation may not have (the page says: advanced) or the host may not answer: the deck stays as it is.
  if (!spec.tools.visionCheck.advanced || !sandboxHost?.configured) return { left: true };
  arm(FIX_TIMEOUT_MS);
  const steps = progress.python(language);
  let fix;
  try {
    fix = await redoDeck({ file, spec, source, access, model, config, controller, language, images, issues: result.issues, steps, userId, files, sandboxHost });
  } finally {
    steps.remove();
  }
  controller.signal.throwIfAborted();
  if (!fix.parts.some((part) => part.sandboxFile && part.sandboxFile.name === file.name)) throw new Error(visionText(language, 'freeNoFile'));
  const text = `${formatSandboxRunBlock(fix.run)}${buildFreeVisionResult({ result, language, checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides, answer: fix.answer })}${fix.documents ? `\n\n${fix.documents}` : ''}`;
  progress.remove();
  return {
    revised: {
      parts: [{ text }, ...fix.parts],
      metadata: { ...(spec.request.messageMetadata || {}), visionCheck: buildFreeVisionMetadata({ file, model, result, checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides }) }
    }
  };
}

/** Asks the model to redo the deck with Python (the sandbox of the server), as the page's `runSandboxFix` does. */
async function redoDeck({ file, spec, source, access, model, config, controller, language, images, issues, steps, userId, files, sandboxHost }) {
  const history = [
    ...spec.request.history,
    { role: 'user', parts: spec.request.currentMessage.parts },
    { role: 'model', parts: [{ text: source.text }, ...source.parts.filter((part) => part.sandboxFile)] }
  ];
  let sandbox = null;
  const stepEvents = createStepEvents({ send: (event) => steps.event(event) });
  try {
    const result = await runSandboxReply({
      streamApiCall: access.streamApiCall,
      requestParts: [{ text: buildFixRequest({ issues, file, uiLanguage: language }) }, ...images],
      signal: controller.signal,
      requestOptions: {
        modelInfo: model,
        conversation: access.conversation,
        historyForApi: history,
        systemInstructionText: spec.request.systemInstruction,
        genConfig: spec.request.generation || undefined,
        reasoningEffort: spec.request.reasoningEffort,
        requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER
      },
      host: 'server',
      getSandbox: (options) => {
        sandbox = sandboxHost.getSandbox({ ...options, language, signal: controller.signal });
        return sandbox;
      },
      language,
      provider: model.provider,
      inputFiles: collectInputFiles({ history, current: [], sent: [], userId, files }),
      designs: spec.tools.designs || {},
      onEvent: stepEvents.event
    });
    stepEvents.flush();
    const finished = await finishAdvancedReply({ result, run: result.run || { status: 'done', steps: [] }, userId, files });
    return { run: result.run || { status: 'done', steps: [] }, parts: finished.parts, answer: finished.answer, documents: finished.documents };
  } finally {
    await sandbox?.dispose().catch(() => {});
  }
}
