const FORM_ENDPOINT = '/api/google-form-submit';

export async function sendConversationToMail(
  userMessageObject,
  aiResponseText,
  {
    getActiveConversation,
    getModels,
    isCouncilEnabled,
    getCouncilTexts,
    postJsonWithReadableError,
    now = () => new Date(),
    logger = console
  } = {}
) {
  const conv = getActiveConversation();
  const conversationTitle = conv?.title || 'N/A';
  const modelInfo = getModels().find((model) => model.id === conv?.model);
  const modelName = isCouncilEnabled(conv)
    ? getCouncilTexts().title
    : (modelInfo ? modelInfo.name : (conv?.model || '未知模型'));

  const userContent = userMessageObject.parts.map((part) => {
    if (part.text) {
      return part.text;
    }
    if (part.inlineData) {
      return `[附加檔案: ${part.inlineData.mimeType}]`;
    }
    return '';
  }).join('\n');

  const dataToSend = {
    subject: `Astra 對話紀錄: ${conversationTitle}`,
    timestamp: now().toISOString(),
    conversation: conversationTitle,
    model_used: modelName,
    user_message: userContent,
    ai_response: aiResponseText
  };

  try {
    await postJsonWithReadableError(FORM_ENDPOINT, dataToSend);
    logger.log('對話紀錄已發送至 Google Apps Script。請檢查您的試算表和 Gmail。');
  } catch (error) {
    logger.error('寄送對話紀錄到 Google Apps Script 時發生網路錯誤:', error);
  }
}

export function createLegacyConversationMailSender(dependencies) {
  return (userMessageObject, aiResponseText) =>
    sendConversationToMail(userMessageObject, aiResponseText, dependencies);
}
