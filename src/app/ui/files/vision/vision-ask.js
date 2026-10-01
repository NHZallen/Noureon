// Asks the model to look at the slides and reads its answer. The answer is a JSON object; a model sometimes answers in prose,
// stops before the end, or says nothing, and then it is asked once more, with a reminder that only the JSON is wanted. The
// person's choice of thinking is not touched, and no limit is put on the length of the answer: a limit that the thinking
// could use up left the JSON unwritten.

import { NOURAS_REQUEST_PURPOSE } from '../../../runtime/nouras/nouras-policy.js';
import { INVALID_VISION_RESPONSE, parseVisionResponse } from './vision-prompt.js';

export const RETRY_NOTE = '\n\nYour previous reply could not be read. Reply with the JSON object only, with no other text, and write all of it.';

export async function askVision({ streamApiCall, prompt, images, model, conversation, signal, progress, arm = () => {}, requireEdits = true }) {
  for (let attempt = 0; ; attempt += 1) {
    const parts = [{ text: attempt ? `${prompt}${RETRY_NOTE}` : prompt }, ...images];
    let answer = '';
    await streamApiCall(parts, (chunk) => { answer += chunk; }, signal, false, {
      modelInfo: model, conversation, historyForApi: [], currentMessageForApi: { role: 'user', parts },
      onReasoning: (chunk) => progress?.thinking(chunk),
      disableReasoning: false, ignoreConversationWebSearch: true, skipMemoryContext: true,
      skipConversationSystemContext: true, requestPurpose: NOURAS_REQUEST_PURPOSE.VISION_CHECK,
      genConfig: { temperature: 0.2, topP: null, maxTokens: null }
    });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return parseVisionResponse(answer, { requireEdits });
    } catch (error) {
      if (error?.code !== INVALID_VISION_RESPONSE || attempt >= 1) throw error;
      // Another go has its own time.
      arm(120_000);
    }
  }
}
