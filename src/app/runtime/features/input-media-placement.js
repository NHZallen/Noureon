export function arrangeInputMediaPreview({
  document,
  inputMediaPreview,
  settingsButton
}) {
  const wrapper = document.querySelector('.input-wrapper');
  if (wrapper && inputMediaPreview && inputMediaPreview.parentElement !== wrapper) {
    inputMediaPreview.className = 'input-media-preview empty:hidden';
    wrapper.insertBefore(inputMediaPreview, wrapper.firstChild);
  }

  const settingsIcon = settingsButton?.querySelector('svg');
  if (settingsIcon) {
    settingsIcon.setAttribute('viewBox', '0 0 24 24');
    settingsIcon.innerHTML = '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.658 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.329 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.329 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.658 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.329-4.033 2.34 2.34 0 0 0 0-3.831 2.34 2.34 0 0 1 2.329-4.033 2.34 2.34 0 0 0 3.32-1.915"></path><circle cx="12" cy="12" r="3"></circle>';
  }
}
