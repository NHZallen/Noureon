import {
  markApiKeyInputCleared,
  markApiKeyInputDirty,
  prepareApiKeyInput,
  readApiKeyInputIntent
} from '../security/api-key-input-intent.js';

const REQUIRED_DEPENDENCIES = [
  'document',
  'elements',
  'getApiKeyForProvider',
  'mergeSensitiveApiKeys',
  'clearSensitiveApiKeys',
  'saveSensitiveConfig'
];

function assertRequiredDependencies(dependencies) {
  const missing = REQUIRED_DEPENDENCIES.filter((key) => dependencies[key] == null);
  if (missing.length > 0) {
    throw new Error(`createSettingsApiKeyControls missing dependencies: ${missing.join(', ')}`);
  }
}

export function createSettingsApiKeyControls(dependencies = {}) {
  assertRequiredDependencies(dependencies);

  const {
    document,
    elements,
    getApiKeyForProvider,
    setApiKeyForProvider,
    mergeSensitiveApiKeys,
    clearSensitiveApiKeys,
    saveSensitiveConfig
  } = dependencies;

  const getApiKeyInputDescriptors = () => [
    { provider: 'gemini', input: elements.geminiApiKeyInput },
    { provider: 'openrouter', input: elements.openrouterApiKeyInputAll },
    { provider: 'stepPlan', input: elements.stepPlanApiKeyInput },
    { provider: 'nvidia', input: elements.nvidiaApiKeyInput },
    { provider: 'tavily', input: elements.tavilyApiKeyInput }
  ].filter(({ input }) => input);

  const createApiKeyClearButton = (provider, input) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'api-key-clear-btn';
    button.textContent = 'Clear';
    button.dataset.apiKeyClearProvider = provider;
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      markApiKeyInputCleared(input);
      if (typeof setApiKeyForProvider === 'function') {
        setApiKeyForProvider(provider, '');
      } else {
        mergeSensitiveApiKeys({ [provider]: '' });
      }
      await saveSensitiveConfig();
    });
    return button;
  };

  const ensureApiKeyInputSecurityControls = () => {
    getApiKeyInputDescriptors().forEach(({ provider, input }) => {
      if (input.dataset.apiKeyIntentBound !== 'true') {
        input.dataset.apiKeyIntentBound = 'true';
        input.addEventListener('input', () => markApiKeyInputDirty(input));
      }

      if (!input.id || document.getElementById(`${input.id}-clear-btn`)) return;
      const clearButton = createApiKeyClearButton(provider, input);
      clearButton.id = `${input.id}-clear-btn`;
      const wrapper = input.closest?.('div');
      if (wrapper?.classList?.add) wrapper.classList.add('api-key-input-group');
      if (wrapper?.appendChild) wrapper.appendChild(clearButton);
    });

    if (document.getElementById('clear-all-api-keys-btn')) return;
    const lastKeyInput = elements.tavilyApiKeyInput || elements.openrouterApiKeyInputAll || elements.geminiApiKeyInput;
    const lastKeyWrapper = lastKeyInput?.closest?.('div');
    if (!lastKeyWrapper?.insertAdjacentElement && !lastKeyWrapper?.appendChild) return;
    const clearAllButton = document.createElement('button');
    clearAllButton.type = 'button';
    clearAllButton.id = 'clear-all-api-keys-btn';
    clearAllButton.className = 'api-key-clear-all-btn';
    clearAllButton.textContent = 'Clear all API keys';
    clearAllButton.addEventListener('click', async (event) => {
      event.preventDefault();
      getApiKeyInputDescriptors().forEach(({ input }) => markApiKeyInputCleared(input));
      await clearSensitiveApiKeys();
      await saveSensitiveConfig();
    });
    if (lastKeyWrapper.insertAdjacentElement) {
      lastKeyWrapper.insertAdjacentElement('afterend', clearAllButton);
    } else {
      lastKeyWrapper.appendChild(clearAllButton);
    }
  };

  const prepareApiKeyInputsForSettings = () => {
    ensureApiKeyInputSecurityControls();
    getApiKeyInputDescriptors().forEach(({ provider, input }) => {
      const lookupProvider = provider === 'stepPlan' ? 'stepfun' : provider;
      prepareApiKeyInput(input, {
        provider,
        rawValue: getApiKeyForProvider(lookupProvider)
      });
    });
  };

  const persistApiKeyInputIntents = async () => {
    const changes = {};
    for (const { provider, input } of getApiKeyInputDescriptors()) {
      const intent = readApiKeyInputIntent(input);
      const targetProvider = intent.provider || provider;
      if (!targetProvider || intent.action === 'unchanged') continue;
      changes[targetProvider] = intent.action === 'clear' ? '' : intent.value;
    }

    if (Object.keys(changes).length === 0) return;

    if (typeof setApiKeyForProvider === 'function') {
      Object.entries(changes).forEach(([provider, value]) => setApiKeyForProvider(provider, value));
    } else {
      mergeSensitiveApiKeys(changes);
    }
    await saveSensitiveConfig();
  };

  return {
    getApiKeyInputDescriptors,
    createApiKeyClearButton,
    ensureApiKeyInputSecurityControls,
    prepareApiKeyInputsForSettings,
    persistApiKeyInputIntents
  };
}
