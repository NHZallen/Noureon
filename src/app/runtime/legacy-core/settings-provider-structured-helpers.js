export function createSettingsProviderStructuredHelpers({
  fetchImpl = globalThis.fetch,
  getApiKeyForProvider = () => '',
  readErrorBody = async (response) => ({ error: { message: response?.statusText || 'API request failed' } }),
  cheapModelId,
  logger = console
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createSettingsProviderStructuredHelpers missing dependency: fetchImpl');
  }
  if (typeof getApiKeyForProvider !== 'function') {
    throw new Error('createSettingsProviderStructuredHelpers missing dependency: getApiKeyForProvider');
  }
  if (typeof readErrorBody !== 'function') {
    throw new Error('createSettingsProviderStructuredHelpers missing dependency: readErrorBody');
  }
  if (!cheapModelId) {
    throw new Error('createSettingsProviderStructuredHelpers missing dependency: cheapModelId');
  }

  const generateContentUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cheapModelId}:generateContent`;

  function parseStructuredJsonText(jsonString) {
    if (!jsonString) return null;
    let cleanedJsonString = jsonString.trim();
    if (cleanedJsonString.startsWith('```json')) {
      cleanedJsonString = cleanedJsonString.substring(7).trim();
    }
    if (cleanedJsonString.endsWith('```')) {
      cleanedJsonString = cleanedJsonString.slice(0, -3).trim();
    }
    try {
      return JSON.parse(cleanedJsonString);
    } catch (error) {
      logger.error('Failed to parse structured API JSON:', error);
      logger.error('Raw response:', jsonString);
      throw new Error('The API returned invalid JSON.');
    }
  }

  async function callApiWithSchema(prompt, responseSchema, signal) {
    const apiKey = getApiKeyForProvider('gemini');
    if (!apiKey) {
      logger.error('Gemini API key is not set for generating structured response.');
      return null;
    }
    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema
      }
    };
    try {
      const response = await fetchImpl(generateContentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal
      });
      if (!response.ok) {
        const errorData = await readErrorBody(response);
        throw new Error(errorData.error?.message || 'API request failed');
      }
      const result = await response.json();
      const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      return parseStructuredJsonText(jsonString);
    } catch (error) {
      logger.error('Error generating structured response:', error);
    }
    return null;
  }

  return { callApiWithSchema };
}
