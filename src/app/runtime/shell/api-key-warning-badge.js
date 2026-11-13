// The badge in the header that says the model of the open conversation (or a member of its council) needs an API key.
// Keys also reach the page after it was drawn (the sync, the unlock of the vault that is remembered). A warning shown before the places they come from have answered would
// flash and go (security/keys-settled.js): it waits for that, and a key that is really missing is told as soon as they have.
export function createApiKeyWarningBadgeUpdater({
    elements,
    getActiveConversation,
    normalizeConversationModel = () => null,
    isCouncilEnabled = () => false,
    getCouncilValidation = () => ({ reason: '' }),
    getApiKeyForProvider = () => '',
    keysSettled = () => true
}) {
    return () => {
        const conv = getActiveConversation();
        if (!conv) {
            elements.apiKeyWarningBadge?.classList.add('hidden');
            return;
        }
        const modelInfo = normalizeConversationModel(conv);
        let needsKey = false;
        if (isCouncilEnabled(conv)) {
            needsKey = getCouncilValidation(conv).reason === 'missingApiKey';
        } else if (modelInfo) {
            needsKey = !getApiKeyForProvider(modelInfo.provider);
        }
        elements.apiKeyWarningBadge?.classList.toggle('hidden', !(needsKey && keysSettled()));
    };
}
