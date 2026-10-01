// Where web search comes from for the models that have none of their own (OpenRouter and NVIDIA ones). Tavily has always
// been it; TinyFish is the one that is free. A person uses whichever they have a key for.

export const SEARCH_PROVIDERS = Object.freeze(['tavily', 'tinyfish']);
export const DEFAULT_SEARCH_PROVIDER = 'tavily';

export const normalizeSearchProvider = (value) => (SEARCH_PROVIDERS.includes(value) ? value : DEFAULT_SEARCH_PROVIDER);

/** The search source in use, as a key name of apiKeys. */
export const getSearchProvider = (config) => normalizeSearchProvider(config?.searchProvider);

export const searchProviderLabel = (provider) => (normalizeSearchProvider(provider) === 'tinyfish' ? 'TinyFish' : 'Tavily');

/** The search source as the entry that the missing-key check of the council lists, with the key it needs. */
export const searchSourceModel = (config) => {
  const provider = getSearchProvider(config);
  return { id: `${provider}-search`, name: `${searchProviderLabel(provider)} Search`, provider };
};
