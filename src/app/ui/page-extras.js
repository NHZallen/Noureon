// What the page starts after it has loaded, each loaded when it is needed and each only doing something when it has something to show: the round picture of the account
// (user-avatar/), the usage rings of the providers above the Extensions entry (provider-quota/), and the suggested reply in the message box (reply-suggestion/).

export async function startPageExtras({ document, getApiKeyForProvider, i18n = {}, getConfig, getConversation, showNotification, runModel }) {
  const getLanguage = () => getConfig().uiLanguage;
  // A conversation with a model that draws pictures has nothing to suggest a reply for.
  const registry = await import('../runtime/shell/model-registry.js');
  const isImageConversation = (conversation) => registry.modelGeneratesImages(registry.MODELS.find((model) => model.id === registry.getCanonicalModelId(conversation?.model)));
  // The words an error message of a reply starts with (the language of the page now), so that an error is not answered to.
  const getErrorPrefixes = () => [i18n[getLanguage()]?.errorPrefix];
  const started = await Promise.allSettled([
    import('./user-avatar/user-avatar.js').then(({ startUserAvatar }) => startUserAvatar({ document, getLanguage, showNotification })),
    import('./provider-quota/start-quota.js').then(({ startProviderQuota }) => startProviderQuota({ document, getApiKeyForProvider, getLanguage })),
    import('./reply-suggestion/start-suggestion.js').then(({ startReplySuggestion }) => startReplySuggestion({ document, getConfig, getConversation, runModel, isImageConversation, getErrorPrefixes, getLanguage }))
  ]);
  for (const result of started) if (result.status === 'rejected') globalThis.console?.warn?.('A part of the page did not start.', result.reason);
  return started;
}
