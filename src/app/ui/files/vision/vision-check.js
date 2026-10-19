import { createConversationImageResolver } from '../conversation-images.js';
import { parseDocumentSpec } from '../design/document-spec.js';
import { serializeDeckSpec } from '../design/spec-serializer.js';
import { layoutDeck } from '../generators/pptx-layout.js';
import { createContactSheets } from './slide-rasterizer.js';
import { applyVisionEdits } from './vision-edits.js';
import { buildVisionPrompt } from './vision-prompt.js';
import { askVision } from './vision-ask.js';
import { INVALID_VISION_RESPONSE } from './vision-prompt.js';
import { VISION_TEXTS, visionText } from './vision-texts.js';
import { eligibleVisionFiles } from './vision-eligibility.js';
import { buildVisionResult, buildVisionMetadata } from './vision-result.js';
import { createVisionProgress } from './vision-progress.js';

const checkAbort = signal => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); };

/**
 * Background V1 pass. The caller owns cancellation and keeps this promise observed. `fileIds`: only those files (a check asked for again from
 * the note of one that failed or was stopped). A check that fails or is stopped (not cancelled by the caller: `abort('cancelled')`) leaves a
 * note in the conversation, as the server's check does (server/vision-check.js), with the button to check those files again.
 */
export async function runVisionCheck({ conversation, message, model, config, controller, responseUsesCouncil = false, fileIds = null,
  modelSupportsVision, streamApiCall, document, window, notificationContainer, host = null, getActiveConversation,
  addMessageToUI, saveAppData, showNotification, imageSources = null, crypto = globalThis.crypto }) {
  const language = config?.uiLanguage || 'zh-TW';
  const files = eligibleVisionFiles({ conversation, message, model, config, signal: controller.signal, responseUsesCouncil, modelSupportsVision })
    .filter(file => !fileIds || fileIds.includes(file.id));
  if (!files.length) return { checked: 0 };
  let checked = 0;
  const leaveNote = async (text, outcome, ids) => {
    const note = { id: crypto.randomUUID(), role: 'model', parts: [{ text }], createdAt: new Date().toISOString(),
      metadata: { visionCheck: { note: outcome, sourceMessageId: message.id, fileIds: ids } } };
    conversation.messages.push(note);
    conversation.lastUpdatedAt = note.createdAt;
    addMessageToUI(note, conversation.messages.length - 1, false, true, { conversation });
    await saveAppData();
  };
  for (const [index, file] of files.entries()) {
    checkAbort(controller.signal);
    const progress = createVisionProgress({ document, language, controller, host });
    let timedOut = false;
    let timer = null;
    const arm = ms => {
      clearTimeout(timer);
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
    };
    arm(480_000);
    try {
      if (file.free) {
        // A deck Python drew: reviewed as images, redone by the model when needed.
        const { checkFreeDeck } = await import('./vision-free-check.js');
        if (await checkFreeDeck({ file, conversation, message, model, config, controller, language, progress, arm, streamApiCall,
          document, window, getActiveConversation, addMessageToUI, saveAppData, showNotification, crypto })) checked++;
        else progress.remove();
        continue;
      }
      const parsed = parseDocumentSpec(file.content, { uiLanguage: language });
      const spec = parsed.spec;
      const context = { language, document, window,
        loadChartImageRenderer: () => import('../generators/chart-image-export.js'),
        resolveImage: createConversationImageResolver({ document, window, sources: imageSources }) };
      const presentation = await layoutDeck(spec, context);
      checkAbort(controller.signal);
      progress.set('rendering');
      const sheets = await createContactSheets(presentation, { document, window, language, signal: controller.signal, onSlide: progress.slideRendered, onSheet: progress.sheetReady });
      checkAbort(controller.signal);
      progress.set('reviewing', { model: model.name || model.id });
      const prompt = buildVisionPrompt(spec, presentation.layout, { uiLanguage: language, deckDesign: conversation.deckDesign || 'auto', checkedSlides: sheets.checkedSlides });
      const images = sheets.images.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } }));
      const result = await askVision({ streamApiCall, prompt, images, model, conversation, signal: controller.signal, progress, arm });
      if (!result.issues.length) {
        progress.remove();
        if (getActiveConversation()?.id === conversation.id) showNotification(visionText(language, 'clean'), 'success');
        message.metadata = { ...(message.metadata || {}), visionChecked: [...(message.metadata?.visionChecked || []), file.id] };
        conversation.lastUpdatedAt = new Date().toISOString();
        await saveAppData();
        checked++;
        continue;
      }
      progress.showIssues(result.issues);
      progress.set('applying');
      const edits = applyVisionEdits(spec, result.edits);
      if (!edits.applied.length) throw new Error(labelsForFailure(language));
      // Verify the corrected file can be generated before presenting its card.
      const { generateFileBlob } = await import('../file-generators.js');
      await generateFileBlob({ ...file, content: serializeDeckSpec(edits.spec) }, context);
      checkAbort(controller.signal);
      const content = buildVisionResult({ result, edits, renderedSlides: presentation.layout.slides, file, language,
        checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides });
      const revised = { id: crypto.randomUUID(), role: 'model', parts: [{ text: content }], createdAt: new Date().toISOString(),
        metadata: { visionCheck: { ...buildVisionMetadata({ file, model, result, edits,
          checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides }), sourceMessageId: message.id } } };
      message.metadata = { ...(message.metadata || {}), visionChecked: [...(message.metadata?.visionChecked || []), file.id] };
      conversation.messages.push(revised);
      conversation.lastUpdatedAt = new Date().toISOString();
      progress.remove();
      addMessageToUI(revised, conversation.messages.length - 1, false, true, { conversation });
      await saveAppData();
      checked++;
    } catch (error) {
      progress.remove();
      const stopped = controller.signal.aborted && !timedOut;
      if (!stopped) {
        const reason = timedOut ? visionText(language, 'timedOut')
          : error?.code === INVALID_VISION_RESPONSE ? visionText(language, 'invalidResponse')
          : String(error?.message || error?.name || 'unknown error');
        await leaveNote(visionText(language, 'failed', { reason }), 'failed', [file.id]);
      } else if (controller.signal.reason !== 'cancelled') {
        // Stopped by the person: this file and those after it can be checked again from the note.
        await leaveNote(visionText(language, 'stopped'), 'stopped', files.slice(index).map(entry => entry.id));
      }
      if (controller.signal.aborted) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return { checked };
}

const labelsForFailure = language => VISION_TEXTS[language]?.notFixed || VISION_TEXTS.en.notFixed;
