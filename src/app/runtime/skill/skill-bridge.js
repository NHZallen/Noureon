// The one place the composer side of the skills (skill-mode.js) and the rest of the chat meet: what was chosen with "/" for the message being sent, the
// clearing of it once the message is sent, and the full text of the skills a message asks for. Nothing is registered (a test, a page without the
// composer): nothing is chosen.

let mode = null;

export const registerSkillMode = (value) => { mode = value; };
export const getSkillMode = () => mode;
/** What was chosen with "/" for the next message: [{ name, indicatorId, label }]. */
export const getSkillSelection = () => mode?.selection?.() || [];
export const clearSkillSelection = () => mode?.clear?.();
/** The skills the model may load by itself: [{ name, description }] (not the ones in `exclude`). Never rejects. */
export async function getAvailableSkills(exclude = []) {
  if (!mode?.available) return [];
  try {
    return await mode.available(exclude);
  } catch {
    return [];
  }
}
/** The text of one skill the person has: { name, body, files? } or null. Never rejects. */
export async function lookupSkill(name) {
  if (!mode?.lookup) return null;
  try {
    return await mode.lookup(name);
  } catch {
    return null;
  }
}
/** The text of one text file of a skill that came as a zip: { ok: true, text, cut } or { ok: false, reason }. Never rejects. */
export async function readSkillFile(name, path) {
  if (!mode?.readFile) return { ok: false, reason: 'failed' };
  try {
    return await mode.readFile(name, path);
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
/** The skills a message asks for, with their text: [{ name, body }] (those the person still has). Never rejects. */
export async function resolveInvokedSkills(names) {
  if (!mode?.resolve || !Array.isArray(names) || !names.length) return [];
  try {
    return await mode.resolve(names);
  } catch {
    return [];
  }
}
