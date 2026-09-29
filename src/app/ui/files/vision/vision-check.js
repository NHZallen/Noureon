import { NOURAS_REQUEST_PURPOSE } from '../../../runtime/nouras/nouras-policy.js';
import { createConversationImageResolver } from '../conversation-images.js';
import { parseDocumentSpec } from '../design/document-spec.js';
import { serializeDeckSpec } from '../design/spec-serializer.js';
import { layoutDeck } from '../generators/pptx-layout.js';
import { createContactSheets } from './slide-rasterizer.js';
import { applyVisionEdits } from './vision-edits.js';
import { buildVisionPrompt, parseVisionResponse } from './vision-prompt.js';
import { VISION_TEXTS, visionText } from './vision-texts.js';
import { eligibleVisionFiles } from './vision-eligibility.js';
import { buildVisionResult, buildVisionMetadata } from './vision-result.js';
import { createVisionProgress } from './vision-progress.js';

const checkAbort = signal => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); };

/** Background V1 pass. The caller owns cancellation and keeps this promise observed. */
export async function runVisionCheck({ conversation, message, model, config, controller, responseUsesCouncil = false,
  modelSupportsVision, streamApiCall, document, window, notificationContainer, getActiveConversation,
  addMessageToUI, saveAppData, showNotification, imageSources = null, crypto = globalThis.crypto }) {
  const language = config?.uiLanguage || 'zh-TW';
  const files = eligibleVisionFiles({ conversation, message, model, config, signal: controller.signal, responseUsesCouncil, modelSupportsVision });
  if (!files.length) return { checked: 0 };
  let checked = 0;
  for (const file of files) {
    checkAbort(controller.signal);
    const progress = createVisionProgress({ document, language, controller });
    let timedOut = false;
    let timer = null;
    const arm = ms => {
      clearTimeout(timer);
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
    };
    arm(120_000);
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
      const parts = [{ text: prompt }, ...sheets.images.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } }))];
      let answer = '';
      await streamApiCall(parts, chunk => { answer += chunk; }, controller.signal, false, {
        modelInfo: model, conversation, historyForApi: [], currentMessageForApi: { role: 'user', parts },
        disableReasoning: false, ignoreConversationWebSearch: true, skipMemoryContext: true,
        skipConversationSystemContext: true, requestPurpose: NOURAS_REQUEST_PURPOSE.VISION_CHECK,
        genConfig: { temperature: 0.2, topP: null, maxTokens: 4000 }
      });
      checkAbort(controller.signal);
      const result = parseVisionResponse(answer);
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
        metadata: { visionCheck: buildVisionMetadata({ file, model, result, edits,
          checkedSlides: sheets.checkedSlides, totalSlides: sheets.totalSlides }) } };
      message.metadata = { ...(message.metadata || {}), visionChecked: [...(message.metadata?.visionChecked || []), file.id] };
      conversation.messages.push(revised);
      conversation.lastUpdatedAt = new Date().toISOString();
      progress.remove();
      addMessageToUI(revised, conversation.messages.length - 1, false, true, { conversation });
      await saveAppData();
      checked++;
    } catch (error) {
      progress.remove();
      if (!controller.signal.aborted || timedOut) {
        const reason = timedOut ? 'timeout' : String(error?.message || error?.name || 'unknown error');
        if (getActiveConversation()?.id === conversation.id) showNotification(visionText(language, 'failed', { reason }), 'warning');
      }
      if (controller.signal.aborted) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return { checked };
}

const labelsForFailure = language => VISION_TEXTS[language]?.notFixed || VISION_TEXTS.en.notFixed;
