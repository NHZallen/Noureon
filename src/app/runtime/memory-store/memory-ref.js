// The one memory of notes of the page, as a reference (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §8 P3): made by start-notes-memory.js after the page has loaded, asked for by the
// code that makes a request. A tiny module on its own so that asking for it does not load the memory itself. No `window`, no `document`.

let shared = null;
let history = null;

export const getNotesMemory = () => shared;
export const setNotesMemory = (memory) => { shared = memory; return shared; };

/** The search over the past conversations of this page (page-history.js), or null until the page has started it. */
export const getPageHistory = () => history;
export const setPageHistory = (value) => { history = value; return history; };

/** The search by meaning (page-vectors.js), or null until the page has started it. */
let vectors = null;
export const getPageVectors = () => vectors;
export const setPageVectors = (value) => { vectors = value; return vectors; };

/** The passages of the files of the projects for the vectors (projects/project-pieces.js), or null until the projects have started. */
let projectPieces = null;
export const getProjectPieces = () => projectPieces;
export const setProjectPieces = (value) => { projectPieces = value; return projectPieces; };

/** The controller that builds the memory from the past conversations (page-rebuild.js), made by the page when it starts; the settings use the same one. */
let rebuildController = null;
export const getRebuildController = () => rebuildController;
export const setRebuildController = (value) => { rebuildController = value; return rebuildController; };

/** The function that runs a small background request with a chosen model (`runMemoryModel`), given once the page has it; the rebuild and the settings use it. */
let modelRunner = null;
export const getMemoryModelRunner = () => modelRunner;
export const setMemoryModelRunner = (fn) => { modelRunner = typeof fn === 'function' ? fn : null; return modelRunner; };
