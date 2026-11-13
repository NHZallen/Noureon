// The "+" of the composer on a phone opens a sheet from the bottom (ui/plus-sheet) instead of the small menu above it. All that
// loads with the page is this listener; the sheet (code and styles) loads at the first press. A wider screen, and a press made by
// a script (editing a sent message uses the old menu), go on to the menu as before; so does a press when the sheet cannot load:
// the button is pressed again by the script, which the listener lets through.

export function installPlusSheet(deps) {
  deps.document.getElementById('file-input-container')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[id="add-file-btn"]');
    if (!event.isTrusted || !button || !deps.window.matchMedia('(max-width: 768px)').matches) return;
    event.preventDefault();
    event.stopPropagation();
    import('../../ui/plus-sheet/plus-sheet-open.js').then(({ openPlusSheet }) => openPlusSheet(deps), () => button.click());
  }, true);
}
