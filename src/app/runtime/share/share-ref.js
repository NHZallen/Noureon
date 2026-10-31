// How the parts of the page that cannot import the sharing code (it is loaded after the page) reach it: the sidebar draws the tags, the delete of a conversation asks the person first. Nothing set up
// (a test, a page that has not loaded it yet): no tags and nothing to ask.

let shares = null;

export const setShares = (value) => { shares = value || null; return shares; };
export const getShares = () => shares;

const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The small tags beside a title: "Shared" (the conversation has a share that works) and "From a share" (it was copied from one, for good). `text(key)` gives the words of the language. */
export function shareTagsHtml(conversation, text) {
  let html = '';
  if (conversation?.sharedFrom) html += `<span class="cs-tag" data-share-tag="from">${escapeText(text('csTagFrom'))}</span>`;
  if (shares?.state.activeFor(conversation?.id).length) html += `<span class="cs-tag" data-share-tag="shared">${escapeText(text('csTagShared'))}</span>`;
  return html;
}

/** Before conversations are moved to the trash: false when the person was warned that their links stop working and said no. */
export const confirmDeleteShared = (ids) => (shares ? shares.confirmDelete(ids) : Promise.resolve(true));

/** The card "Shared items" of the Data tab, once the code is loaded. */
export const ensureSharedItemsCardLater = (args) => shares?.ensureCard?.(args);
