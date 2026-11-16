// Whether a conversation has the browser agent switched on (the "＋" menu, ui/browser-agent/browser-agent-menu.js; docs/superpowers/specs/2026-11-16-browser-agent-design.md, §2.3). The choice is one
// per conversation, off by default, and kept in this browser only (a list of conversation ids): a field of the conversation itself would be dropped or reset when the conversation comes back from the
// cloud, and the reply is made for the device that sends it anyway. It only asks: the server decides (the list of who may use it, the settings).
import { modelSupportsVision } from '../shell/model-registry.js';

const KEY = 'noureon.browserAgentConversations';
const MAX_KEPT = 200;

const read = (win) => {
  try {
    const list = JSON.parse(win.localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

/** Whether the browser agent is switched on for this conversation. */
export const isBrowserOn = (conversationId, win = globalThis) => Boolean(conversationId) && read(win).includes(String(conversationId));

/** Switches it on or off for a conversation; resolves the new state (false when this browser cannot keep it). */
export function setBrowserOn(conversationId, on, win = globalThis) {
  if (!conversationId) return false;
  try {
    const id = String(conversationId);
    const rest = read(win).filter((entry) => entry !== id);
    win.localStorage.setItem(KEY, JSON.stringify(on ? [...rest, id].slice(-MAX_KEPT) : rest));
    return on === true;
  } catch {
    return false;
  }
}

/** Whether the request of this reply asks for the browser: the switch of the conversation is on, and the model can see pictures (the page of a site is looked at through a picture). */
export const browserAsked = (modelInfo, conversationId, win = globalThis) => isBrowserOn(conversationId, win) && Boolean(modelSupportsVision(modelInfo));
