// The words in the empty box of a chat that belongs to a project ("Message Translation"): the box of the chat asks here (settings-update-input-state-helper.js), the projects part answers.
let provider = null;

export const setProjectPlaceholder = (next) => { provider = typeof next === 'function' ? next : null; };

/** The placeholder for the chat, or null when it is not in a project (or nothing is set). */
export function projectPlaceholder(conversation) {
  try {
    return provider?.(conversation) || null;
  } catch {
    return null;
  }
}
