import { replySteering } from '../features/reply-steering.js';
import { emitReplyEnded } from '../features/reply-events.js';

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
  // The parts that look at the end of a reply (the suggested reply) are told.
  emitReplyEnded();
  return getLastMessageElement();
}
