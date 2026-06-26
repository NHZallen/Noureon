import {
  isMaskedApiKeyDisplayValue,
  maskApiKeyForDisplay
} from './sensitive-config-redaction.js';

const STATE_EMPTY = 'empty';
const STATE_MASKED = 'masked';
const STATE_DIRTY = 'dirty';
const STATE_CLEARED = 'cleared';

function setApiKeyDataset(input, updates) {
  if (!input?.dataset) return;
  Object.entries(updates).forEach(([key, value]) => {
    input.dataset[key] = value;
  });
}

export function prepareApiKeyInput(input, { provider, rawValue } = {}) {
  if (!input) return;
  const maskedValue = maskApiKeyForDisplay(rawValue);
  input.value = maskedValue;
  setApiKeyDataset(input, {
    apiKeyProvider: provider || '',
    apiKeyState: maskedValue ? STATE_MASKED : STATE_EMPTY,
    apiKeyDirty: 'false',
    apiKeyCleared: 'false'
  });
}

export function markApiKeyInputDirty(input) {
  if (!input) return;
  const nextState = input.value?.trim() ? STATE_DIRTY : STATE_CLEARED;
  setApiKeyDataset(input, {
    apiKeyState: nextState,
    apiKeyDirty: 'true',
    apiKeyCleared: nextState === STATE_CLEARED ? 'true' : 'false'
  });
}

export function markApiKeyInputCleared(input) {
  if (!input) return;
  input.value = '';
  setApiKeyDataset(input, {
    apiKeyState: STATE_CLEARED,
    apiKeyDirty: 'true',
    apiKeyCleared: 'true'
  });
}

export function readApiKeyInputIntent(input) {
  if (!input) return { action: 'unchanged', provider: '' };
  const provider = input.dataset?.apiKeyProvider || '';
  const value = input.value?.trim() || '';
  const hasState = Boolean(input.dataset?.apiKeyState);
  const isDirty = input.dataset?.apiKeyDirty === 'true';
  const isCleared = input.dataset?.apiKeyState === STATE_CLEARED || input.dataset?.apiKeyCleared === 'true';

  if (isCleared || (isDirty && value === '')) {
    return { action: 'clear', provider };
  }

  if (!hasState && value && !isMaskedApiKeyDisplayValue(value)) {
    return { action: 'set', provider, value };
  }

  if (!isDirty || isMaskedApiKeyDisplayValue(value)) {
    return { action: 'unchanged', provider };
  }

  return { action: 'set', provider, value };
}
