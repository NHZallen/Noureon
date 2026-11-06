// What the page of the projects shows of a shared project before the server has answered (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §18.12): the last chats and the last list of
// the files that the page read, kept in the browser for the person who read them, so that the project opens at once with its chats, its files and its numbers, as a project of the person's own does.
// It is only what is drawn: a chat is a line (title, who wrote it, the last words), a file is a card without its text; the page reads the project again at once and draws what changed. Nothing here is
// used to answer a reply (the replies use the folders in ./shared-folders.js, which are read again).

const KEY = 'noureon:shared-project-snapshots';
const CHATS_MAX = 100;
const SAID_MAX = 400;
const SOURCE_TEXT_MAX = 200;

const said = (message) => (message?.parts || []).map((part) => part?.text || '').join('\n');

/** A chat as a line of the list: the title, who wrote it and the last two things said (only their first words). */
export const lightChat = (chat = {}) => ({
  id: String(chat.id || ''), title: String(chat.title || '').slice(0, 200), authorId: chat.authorId || '', authorName: chat.authorName || '',
  createdAt: chat.createdAt || '', updatedAt: chat.updatedAt || chat.lastUpdatedAt || '', light: true,
  ...(chat.branchedFrom && typeof chat.branchedFrom === 'object' ? { branchedFrom: chat.branchedFrom } : {}),
  messages: (chat.messages || []).filter((message) => said(message).trim()).slice(-2).map((message) => ({ id: message.id, role: message.role, parts: [{ text: said(message).slice(0, SAID_MAX) }] }))
});

/** A file of the project as a card: everything but its text (the first words stay for a note). */
export const lightSource = (source = {}) => {
  const { text, transcript, ...rest } = source || {};
  void transcript;
  return { ...rest, text: String(text || '').slice(0, SOURCE_TEXT_MAX) };
};

export function createProjectSnapshots({ storage = null, user = () => '' } = {}) {
  let root = { user: '', projects: {} };
  const signs = new Map();
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object' && saved.projects && typeof saved.projects === 'object') root = { user: String(saved.user || ''), projects: saved.projects };
  } catch { /* nothing kept */ }
  const save = () => {
    try { storage?.setItem(KEY, JSON.stringify(root)); } catch {
      // A full storage: the oldest project is let go and the write is tried once more.
      const oldest = Object.entries(root.projects).sort((left, right) => String(left[1].at).localeCompare(String(right[1].at)))[0];
      if (oldest) { delete root.projects[oldest[0]]; try { storage?.setItem(KEY, JSON.stringify(root)); } catch { /* the next reading puts it back */ } }
    }
  };
  const mine = () => !root.user || !user() || root.user === user();
  return {
    /** What was kept of the project for this person: { chats, sources } or null. */
    get(id) { const entry = mine() ? root.projects[id] : null; return entry ? { chats: entry.chats || [], sources: entry.sources || [] } : null; },
    /** Keeps what the page read ({ chats, sources } as read): written only when it is not what is kept. */
    set(id, { chats = [], sources = [] } = {}) {
      const who = user();
      if (!id || !who) return;
      if (root.user !== who) { root = { user: who, projects: {} }; signs.clear(); }
      const entry = { chats: chats.slice(0, CHATS_MAX).map(lightChat), sources: sources.map(lightSource) };
      const sign = JSON.stringify(entry);
      if (signs.get(id) === sign) return;
      signs.set(id, sign);
      root.projects[id] = { ...entry, at: new Date().toISOString() };
      save();
    },
    forget(id) { if (root.projects[id]) { delete root.projects[id]; signs.delete(id); save(); } }
  };
}
