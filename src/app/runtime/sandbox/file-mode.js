// Standard or Advanced mode for a conversation, and whether a reply can
// actually use Advanced mode. Small and eager: the composer and every send
// ask it.

export const FILE_MODES = Object.freeze({ standard: 'standard', advanced: 'advanced' });
export const DEFAULT_FILE_MODE = FILE_MODES.advanced;

// Until files made in the sandbox can be kept and downloaded (B3), Advanced
// mode only runs in development or where it was switched on by hand:
// localStorage['noureon:advanced-mode'] = 'on'.
export const ADVANCED_MODE_PREVIEW_KEY = 'noureon:advanced-mode';

export const normalizeFileMode = (value) => (value === FILE_MODES.standard || value === FILE_MODES.advanced ? value : null);

// Opening the app with ?advanced-mode=on (or =off) switches the preview on
// this device, without the developer console.
export function isAdvancedModeReleased({ window = globalThis.window, isDevelopment = Boolean(import.meta.env?.DEV) } = {}) {
  if (isDevelopment) return true;
  try {
    const request = new URLSearchParams(window?.location?.search || '').get('advanced-mode');
    if (request === 'on') window.localStorage.setItem(ADVANCED_MODE_PREVIEW_KEY, 'on');
    if (request === 'off') window.localStorage.removeItem(ADVANCED_MODE_PREVIEW_KEY);
    return window?.localStorage?.getItem(ADVANCED_MODE_PREVIEW_KEY) === 'on';
  } catch {
    return false;
  }
}

// The mode the user chose for this conversation (or the default for new ones).
export function chosenFileMode(conversation, config = {}) {
  return normalizeFileMode(conversation?.fileMode) || normalizeFileMode(config.fileModeDefault) || DEFAULT_FILE_MODE;
}

// Set once Python has loaded on this device, so the picker can say it is
// already downloaded.
export const PYTHON_READY_KEY = 'noureon:python-ready';

const pythonReady = (window) => {
  try {
    return Boolean(window?.localStorage?.getItem(PYTHON_READY_KEY));
  } catch {
    return false;
  }
};

// What the composer's picker shows: the chosen mode, and why Advanced cannot
// run here if it cannot.
export function describeFileModeState({ window = globalThis.window, released = isAdvancedModeReleased({ window }), ...context } = {}) {
  const check = resolveReplyMode({ ...context, conversation: { ...(context.conversation || {}), fileMode: FILE_MODES.advanced }, released: true });
  return {
    released,
    value: chosenFileMode(context.conversation, context.config),
    unavailableReason: check.advanced ? null : check.reason,
    ready: pythonReady(window)
  };
}

// Whether this reply runs in Advanced mode. `reason` explains a switch to
// Standard when Advanced was chosen (see sandbox-texts.js "reason.*").
export function resolveReplyMode({
  conversation,
  config = {},
  modelInfo,
  supportsToolCalling = () => false,
  isCouncil = false,
  browserSupported = true,
  released = isAdvancedModeReleased()
} = {}) {
  if (!released || chosenFileMode(conversation, config) !== FILE_MODES.advanced) return { advanced: false, reason: null };
  if (isCouncil) return { advanced: false, reason: 'council' };
  if (config.isLearningMode) return { advanced: false, reason: 'learning' };
  if (!supportsToolCalling(modelInfo)) return { advanced: false, reason: 'model-unsupported' };
  if (!browserSupported) return { advanced: false, reason: 'browser-unsupported' };
  return { advanced: true, reason: null };
}
