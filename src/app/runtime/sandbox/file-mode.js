// Standard or Advanced mode for a conversation, and whether a reply can
// actually use Advanced mode. Small and eager: the composer and every send
// ask it.

import { isEphemeralConversation } from '../features/temporary-chat-state.js';

export const FILE_MODES = Object.freeze({ standard: 'standard', advanced: 'advanced' });
export const DEFAULT_FILE_MODE = FILE_MODES.advanced;

export const normalizeFileMode = (value) => (value === FILE_MODES.standard || value === FILE_MODES.advanced ? value : null);

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
export function describeFileModeState({ window = globalThis.window, ...context } = {}) {
  const check = resolveReplyMode({ ...context, conversation: { ...(context.conversation || {}), fileMode: FILE_MODES.advanced } });
  return {
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
  browserSupported = true
} = {}) {
  if (chosenFileMode(conversation, config) !== FILE_MODES.advanced) return { advanced: false, reason: null };
  // A temporary chat makes no files: nothing to explain, the picker is not shown there.
  if (isEphemeralConversation(conversation)) return { advanced: false, reason: null };
  if (isCouncil) return { advanced: false, reason: 'council' };
  if (config.isLearningMode) return { advanced: false, reason: 'learning' };
  if (!supportsToolCalling(modelInfo)) return { advanced: false, reason: 'model-unsupported' };
  if (!browserSupported) return { advanced: false, reason: 'browser-unsupported' };
  return { advanced: true, reason: null };
}
