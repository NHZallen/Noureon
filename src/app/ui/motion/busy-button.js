// A button that is doing something says so: a small ring turns on it until the work ends (the stylesheet is
// busy-feedback.css). Every long-running button uses this one switch, so they all look the same.

export function setButtonBusy(button, busy) {
  if (!button) return;
  if (busy) {
    if (button.dataset) button.dataset.busy = 'true';
    button.setAttribute?.('aria-busy', 'true');
  } else {
    if (button.dataset) delete button.dataset.busy;
    button.removeAttribute?.('aria-busy');
  }
}
