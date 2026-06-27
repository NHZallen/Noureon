const TITLE_SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' }
  },
  propertyOrdering: ['title', 'summary']
};

export function buildTitleSummaryPrompt(conversation) {
  const conversationHistory = (conversation?.messages || [])
    .slice(0, 5)
    .map((message) => `${message.role}: ${(message.parts || []).map((part) => part.text).join(' ')}`)
    .join('\n');

  return `為以下對話生成一個簡潔且能代表核心主題的標題。標題應直接反映使用者詢問的主要內容，而不是以你的視角描述AI的行為，（例如，好的標題是「法國首都」，而不是「回答地理問題」）。標題限制在10個字以內。請嚴格按照以下 JSON 格式輸出，不要有任何額外的文字或解釋:\n{"title": "你的標題", "summary": "你的一句話摘要"}\n\n對話內容:\n${conversationHistory}`;
}

export function normalizeTitleSummaryResponse(data) {
  if (!data || typeof data.title !== 'string' || typeof data.summary !== 'string') {
    return null;
  }
  return {
    title: data.title,
    summary: data.summary
  };
}

export function createSettingsTitleSummaryHelpers({
  callApiWithSchema
} = {}) {
  if (typeof callApiWithSchema !== 'function') {
    throw new Error('createSettingsTitleSummaryHelpers missing dependency: callApiWithSchema');
  }

  async function requestTitleSummary(conversation, signal) {
    const prompt = buildTitleSummaryPrompt(conversation);
    const data = await callApiWithSchema(prompt, TITLE_SUMMARY_RESPONSE_SCHEMA, signal);
    return normalizeTitleSummaryResponse(data);
  }

  return {
    buildTitleSummaryPrompt,
    normalizeTitleSummaryResponse,
    requestTitleSummary
  };
}
