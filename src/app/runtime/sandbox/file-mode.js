// Standard or Advanced mode for a conversation, and whether a reply can
// actually use Advanced mode. Small and eager: the composer and every send
// ask it.

export const FILE_MODES = Object.freeze({ standard: 'standard', advanced: 'advanced' });

// Advanced when the model and the device can run it, Standard when they cannot (resolveReplyMode, which also falls back for a
// single reply). The person does not choose: a `fileMode` kept on an older conversation, and the old setting "Mode for new
// chats" (`fileModeDefault`), are ignored, so a Standard picked once does not hold a chat back for good.

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

// What the composer's picker shows: the mode the reply will use, and why Advanced cannot run here if it cannot.
export function describeFileModeState({ window = globalThis.window, ...context } = {}) {
  const check = resolveReplyMode(context);
  return {
    value: check.advanced ? FILE_MODES.advanced : FILE_MODES.standard,
    unavailableReason: check.advanced ? null : check.reason,
    ready: pythonReady(window)
  };
}

// Whether this reply runs in Advanced mode. `reason` explains why it runs in
// Standard (see sandbox-texts.js "reason.*").
export function resolveReplyMode({
  config = {},
  modelInfo,
  supportsToolCalling = () => false,
  isCouncil = false,
  browserSupported = true
} = {}) {
  if (isCouncil) return { advanced: false, reason: 'council' };
  if (config.isLearningMode) return { advanced: false, reason: 'learning' };
  if (!supportsToolCalling(modelInfo)) return { advanced: false, reason: 'model-unsupported' };
  if (!browserSupported) return { advanced: false, reason: 'browser-unsupported' };
  return { advanced: true, reason: null };
}
