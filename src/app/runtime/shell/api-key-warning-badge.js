// The badge in the header that says the model of the open conversation (or a member of its council) needs an API key.
// Keys also reach the page after it was drawn (the sync, the unlock of the vault that is remembered). A warning shown before they had their time would flash and go,
// so with `settleMs` it is held back until the first keys arrive or that wait is over: a key that is really missing is told a moment later.
export function createApiKeyWarningBadgeUpdater({
    elements,
    getActiveConversation,
    normalizeConversationModel = () => null,
    isCouncilEnabled = () => false,
    getCouncilValidation = () => ({ reason: '' }),
    getApiKeyForProvider = () => '',
    settleMs = 0,
    setTimer = globalThis.setTimeout,
    eventTarget = globalThis.window
}) {
    let settled = !(settleMs > 0);
    const update = () => {
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
        elements.apiKeyWarningBadge?.classList.toggle('hidden', !(needsKey && settled));
    };
    if (!settled) {
        const settle = () => {
            if (settled) return;
            settled = true;
            update();
        };
        eventTarget?.addEventListener?.('astra:cloud-sensitive-config', settle);
        setTimer(settle, settleMs)?.unref?.();
    }
    return update;
}
