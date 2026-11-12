// A select that was opened with a finger or a mouse shows no frame of focus. On a phone the picker closes but the field keeps the focus, and with it the blue frame of the browser, until something else
// is touched; the frame is for the keyboard (a select reached with Tab keeps it). A choice also takes the focus off the field. One delegated listener for every select of the page. Page only.

export function installSelectBlur(document) {
  const select = (event) => (event.target?.tagName === 'SELECT' ? event.target : null);
  const pointer = (event) => { const target = select(event); if (target) target.dataset.pointer = '1'; };
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('touchstart', pointer, { capture: true, passive: true });
  document.addEventListener('keydown', (event) => { const target = select(event); if (target) delete target.dataset.pointer; }, true);
  document.addEventListener('focusout', (event) => { const target = select(event); if (target) delete target.dataset.pointer; }, true);
  document.addEventListener('change', (event) => { select(event)?.blur(); });
}
