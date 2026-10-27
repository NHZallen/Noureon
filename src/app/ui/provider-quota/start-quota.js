// Starts the usage rings of the providers above the Extensions entry of the left menu: OpenCode Go (three rings) and OpenRouter (one ring, only for a key with a
// spending limit), side by side. Each shows only when its key is there and the service says something.

import { startQuotaRings } from '../opencode-quota/quota-rings.js';
import { startOpenrouterRing } from './openrouter-ring.js';

export function startProviderQuota({ document, getApiKeyForProvider, getLanguage }) {
  return {
    opencode: startQuotaRings({ document, getApiKey: () => getApiKeyForProvider('opencode-go'), getLanguage }),
    openrouter: startOpenrouterRing({ document, getApiKey: () => getApiKeyForProvider('openrouter'), getLanguage })
  };
}
