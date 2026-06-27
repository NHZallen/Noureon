export function createSettingsProviderStructuredHelpers({
  fetchImpl = globalThis.fetch,
  AbortSignal: AbortSignalCtor = globalThis.AbortSignal,
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
      logger.error('清理後的 JSON 解析失敗:', error);
      logger.error('原始字串:', jsonString);
      throw new Error('無法解析 API 回傳的 JSON 字串。');
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

  async function shouldPerformWebSearch(prompt) {
    const apiKey = getApiKeyForProvider('gemini');
    if (!apiKey) {
      logger.warn('Gemini API key is not set. Cannot perform auto web search check.');
      return false;
    }
    const systemPrompt = "你是一個判斷器，根據使用者問題判斷是否需要連網搜尋。如果問題是關於即時、最新資訊、或特定事實，請回答'yes'。如果是常識性、創意寫作、程式碼等，請回答'no'。只輸出'yes'或'no'，不要有任何其他文字。";
    const response = await fetchImpl(generateContentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: "好的，我會只回答'yes'或'no'。" }] },
          { role: 'user', parts: [{ text: prompt }] }
        ]
      }),
      signal: AbortSignalCtor.timeout(3000)
    });
    if (!response.ok) {
      logger.error('Auto web search check failed:', await response.text());
      return false;
    }
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
    return text === 'yes';
  }

  return {
    callApiWithSchema,
    shouldPerformWebSearch
  };
}
