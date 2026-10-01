// The visual check of a .pptx Python drew freely: the deck is read and drawn
// as images, the model reviews them, and when it finds problems it is asked
// to redo the deck in a new Advanced mode run. The result is a new reply with
// the run, the problems and the redone file. Loaded with the visual check.

import { formatSandboxRunBlock } from '../../sandbox/sandbox-run-block.js';
import { createContactSheets } from './slide-rasterizer.js';
import { askVision } from './vision-ask.js';
import { buildFixRequest, buildFreeVisionMetadata, buildFreeVisionPrompt, buildFreeVisionResult } from './vision-free.js';
import { visionText } from './vision-texts.js';

const FIX_TIMEOUT_MS = 300_000;
const checkAbort = (signal) => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); };

/**
 * Checks one saved deck. `arm(ms)` restarts the caller's timeout. Returns
 * true when the file was checked (clean or redone), false when it was left
 * alone.
 */
export async function checkFreeDeck({
  file, conversation, message, model, config, controller, language, progress, arm,
  streamApiCall, document, window, getActiveConversation, addMessageToUI, saveAppData, showNotification, crypto
}) {
  const [{ loadSandboxFileBlob }, { buildFreePresentation }, { loadArchiveVendor }, { runSandboxFix }] = await Promise.all([
    import('../../sandbox/sandbox-files.js'),
    import('../../sandbox/free-presentation.js'),
    import('../../../vendors/archive-vendor.js'),
    import('../../sandbox/sandbox-fix.js')
  ]);
  const blob = await loadSandboxFileBlob(file.id);
  const presentation = await buildFreePresentation(blob, { JSZip: await loadArchiveVendor(), window, document });
  checkAbort(controller.signal);
  progress.set('rendering');
  const sheets = await createContactSheets(presentation, { document, window, language, signal: controller.signal, onSlide: progress.slideRendered, onSheet: progress.sheetReady });
  checkAbort(controller.signal);
  progress.set('reviewing', { model: model.name || model.id });
  const prompt = buildFreeVisionPrompt({ file, layout: presentation.layout, uiLanguage: language, checkedSlides: sheets.checkedSlides });
  const images = sheets.images.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } }));
  const result = await askVision({ streamApiCall, prompt, images, model, conversation, signal: controller.signal, progress, arm, requireEdits: false });
  const markChecked = () => {
    message.metadata = { ...(message.metadata || {}), visionChecked: [...(message.metadata?.visionChecked || []), file.id] };
  };
  if (!result.issues.length) {
    progress.remove();
    if (getActiveConversation()?.id === conversation.id) showNotification(visionText(language, 'clean'), 'success');
    markChecked();
    conversation.lastUpdatedAt = new Date().toISOString();
    await saveAppData();
    return true;
  }

  progress.showIssues(result.issues);
  progress.set('fixing', { model: model.name || model.id });
  arm(FIX_TIMEOUT_MS);
  const request = [{ text: buildFixRequest({ issues: result.issues, file, uiLanguage: language }) }, ...images];
  const steps = progress.python(language);
  let fix;
  try {
    fix = await runSandboxFix({
      conversation, model, config, streamApiCall, requestParts: request, signal: controller.signal, language, window,
      onEvent: (event) => steps.event(event)
    });
  } finally {
    steps.remove();
  }
  checkAbort(controller.signal);
  // Advanced mode is off for this conversation now: the deck stays as it is.
  if (!fix) return false;
  const redone = fix.parts.some((part) => part.sandboxFile && part.sandboxFile.name === file.name);
  if (!redone) throw new Error(visionText(language, 'freeNoFile'));
  const text = `${formatSandboxRunBlock(fix.run)}${buildFreeVisionResult({
    result, language, checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides, answer: fix.text
  })}${fix.documents ? `\n\n${fix.documents}` : ''}`;
  const revised = {
    id: crypto.randomUUID(), role: 'model', parts: [{ text }, ...fix.parts], createdAt: new Date().toISOString(),
    metadata: { visionCheck: buildFreeVisionMetadata({ file, model, result, checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides }) }
  };
  markChecked();
  conversation.messages.push(revised);
  conversation.lastUpdatedAt = new Date().toISOString();
  progress.remove();
  addMessageToUI(revised, conversation.messages.length - 1, false, true, { conversation });
  await saveAppData();
  return true;
}
