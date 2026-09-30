export function createSettingsUpdateInputStateHelper({
    elements,
    state,
    getConfig,
    getUploadedFiles,
    i18n,
    getActiveConversation,
    normalizeConversationModel,
    getApiKeyForProvider,
    conversationNeedsTavilySearch,
    getCouncilValidation,
    isCouncilEnabled
}) {
    const updateInputState = () => {
        const config = getConfig();
        const uploadedFiles = getUploadedFiles();
        const hasQuoteInquiry = String(state.quoteReference?.text || '').trim() !== '';
        const hasContent = elements.messageInput.value.trim() !== '' || uploadedFiles.length > 0 || hasQuoteInquiry;
        const { submitButton, submitButtonIcon } = elements;
        const sendIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`;
        const disabledIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="m5.7 5.7 12.6 12.6"></path></svg>`;
        if (state.abortController) {
            submitButton.disabled = false;
            submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
            return;
        }
        const conv = getActiveConversation();
        if (!conv) {
            submitButton.disabled = true;
            submitButtonIcon.innerHTML = disabledIconHTML;
            return;
        }
        if (conv.archived) {
            elements.messageInput.disabled = true;
            submitButton.disabled = true;
            elements.messageInput.placeholder = i18n[config.uiLanguage].viewingArchived || '正在檢視封存的對話，無法傳送訊息。';
            return;
        }
        const modelInfo = normalizeConversationModel(conv);
        const provider = modelInfo?.provider;
        const councilValidation = getCouncilValidation(conv);
        const hasTavilyKey = !conversationNeedsTavilySearch(conv) || !!getApiKeyForProvider('tavily');
        const hasModelApiKey = isCouncilEnabled(conv)
            ? councilValidation.reason !== 'missingApiKey'
            : !!getApiKeyForProvider(provider);
        const canSubmitWithSearch = hasTavilyKey;
        const hasApiKey = hasModelApiKey && canSubmitWithSearch;
        elements.messageInput.disabled = !hasModelApiKey;
        elements.messageInput.placeholder = hasModelApiKey
            ? (isCouncilEnabled(conv) && !councilValidation.ok ? councilValidation.message : i18n[config.uiLanguage].enterMessagePlaceholder)
            : i18n[config.uiLanguage].enterApiKeyPlaceholder;
        if (!hasApiKey || !hasContent || (isCouncilEnabled(conv) && !councilValidation.ok)) {
            submitButton.disabled = true;
            submitButtonIcon.innerHTML = disabledIconHTML;
        } else {
            submitButton.disabled = false;
            submitButtonIcon.innerHTML = sendIconHTML;
        }
    };

    return {
        updateInputState
    };
}
