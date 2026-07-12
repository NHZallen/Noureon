import { GEMINI_MEMORY_SUMMARY_MODEL } from './gemini-memory-capture-client.js';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    summary: { type: 'STRING' }
  },
  required: ['topic', 'summary']
};

export function createGeminiTopicSummaryClient({ getApiKey, fetchImpl = fetch } = {}) {
  if (typeof getApiKey !== 'function') throw new TypeError('Topic summaries require getApiKey.');
  if (typeof fetchImpl !== 'function') throw new TypeError('Topic summaries require fetchImpl.');

  return {
    async summarize({ capsules = [], existingSummary = '', signal } = {}) {
      const apiKey = String(getApiKey() || '').trim();
      if (!apiKey) throw new Error('Gemini API key is required for topic summaries.');
      const sourceText = capsules.map((capsule, index) => [
        `Capsule ${index + 1} (${capsule.id}):`,
        `Topic: ${capsule.topic}`,
        `Summary: ${capsule.summary}`,
        ...(capsule.confirmedDecisions || []).map(value => `Decision: ${value}`),
        ...(capsule.openQuestions || []).map(value => `Open question: ${value}`)
      ].join('\n')).join('\n\n');
      const prompt = [
        'Create a concise long-term topic summary from related conversation capsules.',
        'Use only supplied capsule facts. Do not create user preferences or confirmed decisions.',
        'Do not mention stored names unless the current task explicitly requires it.',
        'Existing topic summary:', existingSummary || '(none)',
        'Source capsules:', sourceText
      ].join('\n\n');
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
      if (!response.ok) throw new Error(`Gemini topic summary failed: ${response.status || 'unknown status'}`);
      const text = String((await response.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '')
        .trim().replace(/^```json\s*/u, '').replace(/\s*```$/u, '');
      const result = JSON.parse(text);
      if (!result?.topic || !result?.summary) throw new TypeError('Gemini topic summary response is incomplete.');
      return { topic: String(result.topic), summary: String(result.summary) };
    }
  };
}
