import { replySteering } from '../features/reply-steering.js';

export function runSubmitFinalCleanupLifecycle(
  stopSingleModelLifecycle,
  resetSubmitState,
  updateSubmitButtonState,
  updateInputState,
  renderCouncilControls,
  renderInputIndicators,
  getLastMessageElement
) {
  stopSingleModelLifecycle();
  resetSubmitState();
  updateSubmitButtonState(false);
  updateInputState();
  renderCouncilControls();
  renderInputIndicators();
  // A message that waited for the reply to end goes now.
  replySteering.onReplyEnded();
  return getLastMessageElement();
}
