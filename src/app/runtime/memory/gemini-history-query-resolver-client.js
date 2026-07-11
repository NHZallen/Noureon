import { GEMINI_MEMORY_SUMMARY_MODEL } from './gemini-memory-capture-client.js';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    resolvedQuery: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
    shouldRetrieve: { type: 'BOOLEAN' }
  },
  required: ['resolvedQuery', 'confidence', 'shouldRetrieve']
};

export function createGeminiHistoryQueryResolverClient({ getApiKey, fetchImpl = fetch } = {}) {
  if (typeof getApiKey !== 'function') throw new TypeError('History query resolver requires getApiKey.');

  return {
    async resolve({ queryText, conversationContext = {}, signal } = {}) {
      const apiKey = String(getApiKey() || '').trim();
      if (!apiKey) throw new Error('Gemini API key is required for history query resolution.');
      const prompt = [
        'Resolve a short, ambiguous user query into a standalone history-search query.',
        'Use only supplied current-conversation context. Do not invent facts or retrieve history yourself.',
        'If context is insufficient or the message is casual acknowledgement, set shouldRetrieve to false.',
        `User query: ${String(queryText || '')}`,
        `Current topic: ${String(conversationContext.currentTopic || '(none)')}`,
        'Recent current-conversation lines:',
        ...(conversationContext.recentMessages || []).map(message => `- ${message}`),
        'Numbered references:',
        ...(conversationContext.numberedReferences || []).map(item => `- ${item.number}. ${item.text}`)
      ].join('\n');
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MEMORY_SUMMARY_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
          }),
          signal
        }
      );
      if (!response.ok) throw new Error(`Gemini history query resolution failed: ${response.status || 'unknown status'}`);
      const text = String((await response.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '')
        .trim().replace(/^```json\s*/u, '').replace(/\s*```$/u, '');
      const result = JSON.parse(text);
      return {
        resolvedQuery: String(result?.resolvedQuery || '').trim(),
        confidence: Number(result?.confidence || 0),
        shouldRetrieve: result?.shouldRetrieve === true
      };
    }
  };
}
