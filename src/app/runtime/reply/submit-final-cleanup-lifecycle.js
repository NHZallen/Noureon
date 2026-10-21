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
  return getLastMessageElement();
}
