// The back arrow at the top of a settings page on a phone leaves the page (to the list of settings). A page that has pages of its own (the
// Permissions tab: its tools, sites and credentials) asks to be gone back through first: it registers a function here that goes one page back
// and says whether it did, and the arrow only leaves the page when there was nothing to go back through.

const handlers = new Map();

/** `goBack()` returns true when it went back one page of the section (the arrow is then used up), false when it is on its first page. */
export const onSettingsSectionBack = (sectionId, goBack) => {
  if (typeof goBack === 'function') handlers.set(sectionId, goBack);
  else handlers.delete(sectionId);
};

/** Whether the section took the back arrow (it went back one of its own pages). */
export function tryHandleSettingsBack(sectionId) {
  try {
    return handlers.get(sectionId)?.() === true;
  } catch {
    return false;
  }
}
