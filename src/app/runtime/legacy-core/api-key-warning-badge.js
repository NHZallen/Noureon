// The badge in the header that says the model of the open conversation (or a member of its council) needs an API key.
export function createApiKeyWarningBadgeUpdater({
    elements,
    getActiveConversation,
    normalizeConversationModel = () => null,
    isCouncilEnabled = () => false,
    getCouncilValidation = () => ({ reason: '' }),
    getApiKeyForProvider = () => ''
}) {
    return () => {
        const conv = getActiveConversation();
        if (!conv) {
            elements.apiKeyWarningBadge.classList.add('hidden');
            return;
        }
        const modelInfo = normalizeConversationModel(conv);
        let needsKey = false;
        if (isCouncilEnabled(conv)) {
            needsKey = getCouncilValidation(conv).reason === 'missingApiKey';
        } else if (modelInfo) {
            needsKey = !getApiKeyForProvider(modelInfo.provider);
        }
        elements.apiKeyWarningBadge.classList.toggle('hidden', !needsKey);
    };
}
