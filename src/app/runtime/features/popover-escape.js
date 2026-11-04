// The popovers of the page (the attachment menu, the menus of the model and the thinking, the menus of the chats) close with a tap outside; they also close with Escape, and the buttons that
// opened them stop saying they are expanded (the attachment button used to say so for good after one was closed by a tap elsewhere).

// ([id=…] and not #add…: the scripts may not write what reads as a colour, and "#add" is one.)
const EXPANDED_TRIGGERS = '#model-council-control .mp-trigger[aria-expanded="true"], [id="add-file-btn"][aria-expanded="true"]';

/** The buttons that opened a popover read as folded again. */
export function collapseTriggers(document) {
  document.querySelectorAll(EXPANDED_TRIGGERS).forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
}

/** Escape closes the popovers that are open. `closeAll()` is the page's own (it also folds the triggers). Returns the function that takes it away. */
export function installPopoverEscape({ document, closeAll }) {
  const onKey = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!document.querySelector('.popover.visible')) return;
    closeAll();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
