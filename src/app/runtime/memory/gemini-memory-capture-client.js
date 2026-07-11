export const GEMINI_MEMORY_SUMMARY_MODEL = 'gemini-3.1-flash-lite';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recentTurnSummary: { type: 'STRING' },
    capsule: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'STRING' },
        summary: { type: 'STRING' },
        confirmedDecisions: { type: 'ARRAY', items: { type: 'STRING' } },
        openQuestions: { type: 'ARRAY', items: { type: 'STRING' } }
      },
      required: ['topic', 'summary', 'confirmedDecisions', 'openQuestions']
    },
    profileCandidates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING' },
          content: { type: 'STRING' },
          extractionConfidence: { type: 'NUMBER' },
          sourceTurnIndexes: { type: 'ARRAY', items: { type: 'INTEGER' } }
        },
        required: ['kind', 'content', 'extractionConfidence', 'sourceTurnIndexes']
      }
    }
  },
  required: ['recentTurnSummary', 'capsule', 'profileCandidates']
};

const toTranscript = (turns = []) => turns
  .map((turn, index) => `${index}. ${turn?.role === 'user' ? 'User' : 'Assistant'}: ${String(turn?.text || '').trim()}`)
  .filter(line => !line.endsWith(':'))
  .join('\n');

const parseJson = value => {
  const text = String(value || '').trim().replace(/^```json\s*/u, '').replace(/\s*```$/u, '');
  return JSON.parse(text);
};

const validateCapture = capture => {
  if (!capture || typeof capture.recentTurnSummary !== 'string') {
    throw new TypeError('Gemini memory capture response is missing recentTurnSummary.');
  }
  if (!capture.capsule || typeof capture.capsule.topic !== 'string' || typeof capture.capsule.summary !== 'string') {
    throw new TypeError('Gemini memory capture response is missing capsule details.');
  }
  if (!Array.isArray(capture.capsule.confirmedDecisions) || !Array.isArray(capture.capsule.openQuestions)) {
    throw new TypeError('Gemini memory capture response has invalid capsule lists.');
  }
  if (!Array.isArray(capture.profileCandidates)) {
    throw new TypeError('Gemini memory capture response has invalid profile candidates.');
  }
  return capture;
};

export function createGeminiMemoryCaptureClient({
  getApiKey,
  fetchImpl = fetch
} = {}) {
  if (typeof getApiKey !== 'function') throw new TypeError('Gemini memory capture requires getApiKey.');
  if (typeof fetchImpl !== 'function') throw new TypeError('Gemini memory capture requires fetchImpl.');

  return {
    async capture({ recentTurnSummary = '', turns = [], signal } = {}) {
      const apiKey = String(getApiKey() || '').trim();
      if (!apiKey) throw new Error('Gemini API key is required for memory capture.');
      const transcript = toTranscript(turns);
      if (!transcript) throw new TypeError('Memory capture requires at least one text turn.');
      const prompt = [
        'Summarize only the supplied conversation turns for a private memory system.',
        'Treat user statements as facts only when explicitly stated by the user. Assistant statements are proposals, not user facts.',
        'Do not make profile candidates active. Keep candidates concise and only include durable preferences or identity facts.',
        'Do not turn a stored name into an instruction to address the user by name.',
        'Existing recent summary:',
        recentTurnSummary || '(none)',
        'New turns:',
        transcript
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
      if (!response.ok) throw new Error(`Gemini memory capture failed: ${response.status || 'unknown status'}`);
      const data = await response.json();
      return validateCapture(parseJson(data?.candidates?.[0]?.content?.parts?.[0]?.text));
    }
  };
}
