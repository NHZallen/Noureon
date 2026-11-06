// What the sources panel of a reply (the side panel, and the sheet on a phone) needs to look at, or to have, a file of the project that the model looked into: a name goes in, the source of the
// open chat's project comes out. The projects part says how (start-projects.js); the panel only asks. Without it the rows of the files are only names.

let access = null;

/** `{ preview(name, trigger), download(name) }`, or null. */
export const setProjectSourceAccess = (next) => { access = next || null; };
export const getProjectSourceAccess = () => access;
