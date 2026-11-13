// The sheet that rises from the bottom with a list of sources: from a label that cites several ("2 sources", with a close button) and
// from the "Sources" button under a reply on a phone (all of them, headed "Sources", which can be pulled up to nearly the whole screen).
// It closes with its button, a tap outside it, the Escape key or by pulling it down. What draws it (source-sheet-view.js, with the
// engine of every sheet from the bottom) loads when the first one is asked for, so the page does not carry it.

let view;
let current = null;

/** Closes the sheet that is open, if any. */
export function closeSourceSheet() {
  current?.close();
}

/**
 * Opens a sheet (see openSourceSheetView for the options). Returns { close, element, ready } at once: the sheet is on the page when `ready`
 * has settled (the first time, its code is fetched).
 */
export function openSourceSheet(options) {
  closeSourceSheet();
  let real = null;
  let closed = false;
  const api = {
    close: () => { closed = true; real?.close(); },
    get element() { return real?.element || null; }
  };
  api.ready = (view ||= import('./source-sheet-view.js')).then(({ openSourceSheetView }) => {
    if (!closed) real = openSourceSheetView(options);
    return api;
  });
  current = api;
  return api;
}
