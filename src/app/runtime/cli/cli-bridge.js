// The one place the composer side of the CLI tools (cli-mode.js) and the rest of the chat meet: what was chosen with "@" for the message
// being sent, and the clearing of it once the message is sent. Nothing is registered (a test, a page without the composer): nothing is chosen.

let mode = null;

export const registerCliMode = (value) => { mode = value; };
export const getCliMode = () => mode;
/** What was chosen with "@" for the next message: [{ id, indicatorId, label }]. */
export const getCliSelection = () => mode?.selection?.() || [];
export const clearCliSelection = () => mode?.clear?.();
