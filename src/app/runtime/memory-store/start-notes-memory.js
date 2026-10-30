// Starts the memory of notes for the page (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §8 P3): makes the one memory of the page (notes-memory.js) and loads it
// when the page says who is signed in (and again for another person). It is loaded after the page and does nothing for a person who has not chosen the notes
// (`memorySystem: 'notes'`), so the old memory stays as it is until the switch of P8.

import { getAnnouncedUser, USER_READY_EVENT } from '../features/user-ready.js';
import { getSupabaseClient } from '../../auth/supabase-client.js';
import { createNotesMemory } from './notes-memory.js';
import { setNotesMemory, setPageHistory } from './memory-ref.js';
import { createPageHistory } from './page-history.js';

export function startNotesMemory({ document, configAccess, dataStore, getActiveConversation = () => null, i18n = {}, storage = null, logger = console }) {
  const getConfig = () => configAccess.getConfig();
  const getConversation = () => getActiveConversation();
  const getConversations = () => dataStore.getConversations();
  const getText = (key) => i18n[configAccess.getUiLanguage()]?.[key] || '';
  const memory = setNotesMemory(createNotesMemory({
    getSupabase: () => { try { return getSupabaseClient(); } catch { return null; } },
    storage: storage || (() => { try { return globalThis.localStorage || null; } catch { return null; } })(),
    logger
  }));
  // The past conversations are searched with an index made from what the page holds (no model, nothing leaves the device).
  const history = createPageHistory({ getConversations });
  memory.setHistorySearch((question, options) => (getConfig()?.memorySystem === 'notes' ? history.search(question, options) : []));
  setPageHistory(history);
  // The line under a reply about what the memory did draws itself from the page's events.
  void import('../../ui/memory-notes/memory-reply-line.js').then(({ startMemoryLines }) => startMemoryLines({ document, getConfig, getMemory: () => memory, getConversation, getText, logger })).catch((error) => logger.warn?.('The memory line under replies did not start.', error));
  // The page may have announced the person before this part was loaded.
  let lastUser = getAnnouncedUser();
  if (lastUser && getConfig()?.memorySystem === 'notes') void memory.attach(lastUser);
  const wanted = () => getConfig()?.memorySystem === 'notes';
  document.addEventListener(USER_READY_EVENT, (event) => {
    lastUser = event.detail?.user || null;
    if (lastUser && wanted()) void memory.attach(lastUser);
  });
  return {
    memory,
    /** The person switched the notes on in the settings: load them now, without waiting for the next sign-in. */
    switchedOn: () => (lastUser ? memory.attach(lastUser) : Promise.resolve(null))
  };
}
