// The last stage of a reply of one model (single-model-response-lifecycle.js): its run record (the steps, the pages searched, what was thought,
// that it was made on this device) put above the answer, the citation markers of the provider's own search put into the text, and the
// documents handed to the design system put after it.

import { insertGroundingMarkers } from '../../ui/citations/citation-model.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';
import { formatSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';

/**
 * The run record of the reply as it ends (called whether it ended well or not). `thought` is the live view's; `aborted`: the person
 * stopped it. Sets reply.sandboxRun.
 */
export function recordReplyRun({ reply, thought, answered, advanced, serverRun, madeHere, aborted, elapsedMs }) {
  if (reply.searchSources.length) reply.sandboxRun = { status: 'done', steps: [], elapsedMs, ...(reply.sandboxRun || {}), sources: reply.searchSources };
  // (For a reply the server made, the time it thought is the server's, kept in its run record.)
  if (thought.text && !advanced && !serverRun) {
    reply.sandboxRun = { status: 'done', steps: [], ...(reply.sandboxRun || {}), thought: thought.text, thoughtKind: thought.kind, thoughtMs: thought.endedAt - thought.startedAt, ...(aborted && !answered ? { thoughtInterrupted: true } : {}) };
  }
  if (madeHere) reply.sandboxRun = { status: 'done', steps: [], ...(reply.sandboxRun || {}), madeHere: true };
}

/**
 * The text of the reply as it is saved: the citation markers in (Gemini says where its answer cites its pages only once it is whole), the run
 * record above, the documents after. Throws when there is nothing to show (stopped while thinking: an AbortError). Sets
 * `targetElement.dataset.streamRendered` to 'false' when the final view has to be drawn again.
 */
export function composeReplyText({ reply, fullResponse, targetElement, aborted, uiLanguage }) {
  let text = fullResponse;
  if (reply.groundingSupports.length && text) {
    const numberOf = (url) => Number(reply.searchSources.find((source) => source.url === url)?.n) || 0;
    const marked = insertGroundingMarkers(text, reply.groundingSupports, numberOf);
    if (marked !== text) {
      text = marked;
      if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
    }
  }
  // Stopped while thinking, with nothing else to show: the reply is the interrupted thinking.
  if (!String(text || '').trim() && !reply.sandboxRun?.steps?.length && !reply.sandboxRun?.thought) {
    if (aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error(getRuntimeText(uiLanguage, 'emptyResponse'));
  }
  if (reply.sandboxRun) {
    text = `${formatSandboxRunBlock(reply.sandboxRun)}${text || ''}${reply.sandboxDocuments ? `\n\n${reply.sandboxDocuments}` : ''}`;
    // The final view is drawn again so the run row appears above the answer.
    if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
  }
  return text;
}
