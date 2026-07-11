const TITLE_SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' }
  },
  propertyOrdering: ['title']
};

const TITLE_SUMMARY_PROMPTS = {
  'zh-TW': {
    languageName: '繁體中文',
    instruction: '為以下對話生成一個簡潔且能代表核心主題的標題。標題應直接反映使用者詢問的主要內容，而不是以你的視角描述AI的行為，（例如，好的標題是「法國首都」，而不是「回答地理問題」）。標題限制在10個字以內。請嚴格按照以下 JSON 格式輸出，不要有任何額外的文字或解釋:',
    exampleTitle: '你的標題',
    contentLabel: '對話內容'
  },
  en: {
    languageName: 'English',
    instruction: 'Generate a concise title that represents the core topic of the following conversation. The title must directly reflect the user\'s main request, not describe the AI behavior from your perspective. For example, a good title is "Capital of France", not "Answered a geography question". Keep the title within 8 words. Output strictly in the following JSON format with no extra text or explanation:',
    exampleTitle: 'Your title',
    contentLabel: 'Conversation content'
  },
  fr: {
    languageName: 'français',
    instruction: 'Génère un titre concis qui représente le sujet principal de la conversation suivante. Le titre doit refléter directement la demande principale de l\'utilisateur, et non décrire le comportement de l\'IA. Par exemple, un bon titre est "Capitale de la France", pas "Réponse à une question de géographie". Limite le titre à 8 mots. Réponds strictement au format JSON suivant, sans texte ni explication supplémentaire:',
    exampleTitle: 'Votre titre',
    contentLabel: 'Contenu de la conversation'
  }
};

function normalizeTitleLanguage(language) {
  return TITLE_SUMMARY_PROMPTS[language] ? language : 'zh-TW';
}

export function buildTitleSummaryPrompt(conversation, { language = 'zh-TW' } = {}) {
  const promptText = TITLE_SUMMARY_PROMPTS[normalizeTitleLanguage(language)];
  const conversationHistory = (conversation?.messages || [])
    .slice(0, 5)
    .map((message) => `${message.role}: ${(message.parts || []).map((part) => part.text).join(' ')}`)
    .join('\n');

  return `${promptText.instruction}\n{"title": "${promptText.exampleTitle}"}\n\nRespond in ${promptText.languageName}.\n\n${promptText.contentLabel}:\n${conversationHistory}`;
}

export function normalizeTitleSummaryResponse(data) {
  if (!data || typeof data.title !== 'string') {
    return null;
  }
  return {
    title: data.title
  };
}

export function createSettingsTitleSummaryHelpers({
  callApiWithSchema
} = {}) {
  if (typeof callApiWithSchema !== 'function') {
    throw new Error('createSettingsTitleSummaryHelpers missing dependency: callApiWithSchema');
  }

  async function requestTitleSummary(conversation, signal, options = {}) {
    const prompt = buildTitleSummaryPrompt(conversation, options);
    const data = await callApiWithSchema(prompt, TITLE_SUMMARY_RESPONSE_SCHEMA, signal);
    return normalizeTitleSummaryResponse(data);
  }

  return {
    buildTitleSummaryPrompt,
    normalizeTitleSummaryResponse,
    requestTitleSummary
  };
}
