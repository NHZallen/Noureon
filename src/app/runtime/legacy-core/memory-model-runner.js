/** Runs structured background-memory requests through the normal provider transport. */
export function createMemoryModelRunner({ streamApiCall, models = [] } = {}) {
  if (typeof streamApiCall !== 'function') throw new TypeError('Memory model runner requires streamApiCall.');

  return async function runMemoryModel({ modelId, prompt, parts = [{ text: prompt }], signal } = {}) {
    const modelInfo = models.find(model => model.id === modelId);
    if (!modelInfo || modelInfo.category === 'image_generation' || modelInfo.outputModality === 'image') {
      throw new Error(`The selected memory model (${modelId || 'unknown'}) is unavailable.`);
    }
    let fullText = '';
    await streamApiCall(parts, chunk => { fullText += chunk; }, signal, false, {
      modelInfo,
      conversation: {
        messages: [],
        astrasId: null,
        isWebSearchEnabled: false,
        genConfig: { temperature: 0, topP: null, maxTokens: 1800 }
      },
      historyForApi: [],
      currentMessageForApi: { role: 'user', parts },
      genConfig: { temperature: 0, topP: null, maxTokens: 1800 },
      disableReasoning: true,
      ignoreConversationWebSearch: true,
      skipMemoryContext: true,
      skipConversationSystemContext: true
    });
    if (!fullText.trim()) throw new Error(`The selected memory model (${modelInfo.name}) returned no text.`);
    return fullText;
  };
}
