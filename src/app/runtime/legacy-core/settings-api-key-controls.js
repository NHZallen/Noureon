import {
  markApiKeyInputCleared,
  markApiKeyInputDirty,
  prepareApiKeyInput,
  readApiKeyInputIntent
} from '../security/api-key-input-intent.js';
import { getRuntimeTexts } from '../i18n/runtime-texts.js';

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
    saveSensitiveConfig,
    getUiLanguage = () => 'zh-TW'
  } = dependencies;
  const text = () => getRuntimeTexts(getUiLanguage());

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
    button.textContent = text().clear;
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

  const getStoredApiKeyForInput = (provider) => {
    const lookupProvider = provider === 'stepPlan' ? 'stepfun' : provider;
    return getApiKeyForProvider(lookupProvider) || '';
  };

  const getEyeIconSvg = (isVisible = false) => isVisible
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

  const setApiKeyVisibilityButtonState = (button, isVisible) => {
    button.dataset.apiKeyVisible = isVisible ? 'true' : 'false';
    button.setAttribute?.('aria-pressed', isVisible ? 'true' : 'false');
    button.innerHTML = getEyeIconSvg(isVisible);
  };

  const createApiKeyVisibilityButton = (provider, input) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'api-key-visibility-btn';
    button.dataset.apiKeyVisibilityProvider = provider;
    button.setAttribute('aria-label', text().showApiKey);
    button.title = text().showApiKey;
    setApiKeyVisibilityButtonState(button, false);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const isVisible = button.dataset.apiKeyVisible === 'true';
      const isDirty = input.dataset?.apiKeyDirty === 'true';
      if (isVisible) {
        if (!isDirty) {
          prepareApiKeyInput(input, {
            provider,
            rawValue: getStoredApiKeyForInput(provider)
          });
        }
        input.type = 'password';
        button.setAttribute('aria-label', text().showApiKey);
        button.title = text().showApiKey;
        setApiKeyVisibilityButtonState(button, false);
        return;
      }

      if (!isDirty) {
        const rawValue = getStoredApiKeyForInput(provider);
        if (rawValue) input.value = rawValue;
      }
      input.type = 'text';
      button.setAttribute('aria-label', text().hideApiKey);
      button.title = text().hideApiKey;
      setApiKeyVisibilityButtonState(button, true);
    });
    return button;
  };

  const resetApiKeyInputVisibility = (input) => {
    if (!input) return;
    input.type = 'password';
    const button = input.id ? document.getElementById(`${input.id}-visibility-btn`) : null;
    if (!button) return;
    button.setAttribute?.('aria-label', text().showApiKey);
    button.title = text().showApiKey;
    setApiKeyVisibilityButtonState(button, false);
  };

  const ensureApiKeyInputSecurityControls = () => {
    getApiKeyInputDescriptors().forEach(({ provider, input }) => {
      if (input.dataset.apiKeyIntentBound !== 'true') {
        input.dataset.apiKeyIntentBound = 'true';
        input.addEventListener('input', () => markApiKeyInputDirty(input));
      }

      const wrapper = input.closest?.('div');
      if (wrapper?.classList?.add) wrapper.classList.add('api-key-input-group');
      if (!input.id || !wrapper?.appendChild) return;
      if (!document.getElementById(`${input.id}-visibility-btn`)) {
        const visibilityButton = createApiKeyVisibilityButton(provider, input);
        visibilityButton.id = `${input.id}-visibility-btn`;
        wrapper.appendChild(visibilityButton);
      }
      if (!document.getElementById(`${input.id}-clear-btn`)) {
        const clearButton = createApiKeyClearButton(provider, input);
        clearButton.id = `${input.id}-clear-btn`;
        wrapper.appendChild(clearButton);
      }
    });

    if (document.getElementById('clear-all-api-keys-btn')) return;
    const lastKeyInput = elements.tavilyApiKeyInput || elements.openrouterApiKeyInputAll || elements.geminiApiKeyInput;
    const lastKeyWrapper = lastKeyInput?.closest?.('div');
    if (!lastKeyWrapper?.insertAdjacentElement && !lastKeyWrapper?.appendChild) return;
    const clearAllButton = document.createElement('button');
    clearAllButton.type = 'button';
    clearAllButton.id = 'clear-all-api-keys-btn';
    clearAllButton.className = 'api-key-clear-all-btn';
    clearAllButton.textContent = text().clearAllApiKeys;
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
      resetApiKeyInputVisibility(input);
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
    createApiKeyVisibilityButton,
    ensureApiKeyInputSecurityControls,
    prepareApiKeyInputsForSettings,
    persistApiKeyInputIntents
  };
}
