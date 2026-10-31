// Starts the memory of notes for the page (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §8 P3): makes the one memory of the page (notes-memory.js) and loads it
// when the page says who is signed in (and again for another person). It is loaded after the page; a reply never waits for it.

import { getAnnouncedUser, USER_READY_EVENT } from '../features/user-ready.js';
import { getSupabaseClient } from '../../auth/supabase-client.js';
import { createNotesMemory } from './notes-memory.js';
import { MODELS } from '../shell/model-registry.js';
import { getMemoryModelRunner, setNotesMemory, setPageHistory, setPageVectors, setRebuildController } from './memory-ref.js';
import { createRebuildController } from './page-rebuild.js';
import { createPageHistory } from './page-history.js';
import { startServerRebuild, stopServerRebuild } from './server-rebuild.js';
import { setHistoryTitle } from './memory-trace.js';
import { createPageVectors } from './page-vectors.js';
import { conversationScopeReader } from '../projects/project-instructions.js';

export function startNotesMemory({ document, configAccess, dataStore, getActiveConversation = () => null, getApiKeyForProvider = () => '', i18n = {}, storage = null, logger = console }) {
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
  const scopeOfConversationId = conversationScopeReader(getConversations);
  const history = createPageHistory({ getConversations, getScopeOf: scopeOfConversationId });
  // A conversation the model looked into keeps its name with the reply (memory-trace.js), for when it is deleted later.
  setHistoryTitle((id) => String((getConversations() || []).find((entry) => entry.id === id)?.title || ''));
  memory.setHistorySearch((question, options) => history.search(question, options));
  memory.setHistoryMeaning((question, options) => history.meaning(question, options));
  setPageHistory(history);
  // The search by meaning is off until the person turns it on and agrees (page-vectors.js); when it is on, the vectors of the past conversations are brought up to date a little after the page has loaded.
  let lastUser = getAnnouncedUser();
  const vectors = setPageVectors(createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getApiKeyForProvider, getCloud: () => { const supabase = lastUser?.supabaseUserId ? (() => { try { return getSupabaseClient(); } catch { return null; } })() : null; return supabase ? { supabase, userId: String(lastUser.supabaseUserId) } : null; }, indexedDB: globalThis.indexedDB || null, userKey: () => String(lastUser?.supabaseUserId || lastUser?.username || 'local'), logger }));
  history.setVectors(vectors);
  // Building the memory from the past conversations (the settings show it); the first time it starts by itself, a little after the page has loaded.
  const rebuild = setRebuildController(createRebuildController({ getStore: () => memory.getStore(), getConversations: () => history.conversations().filter((entry) => !scopeOfConversationId(entry.id)), getConfig, getModelRunner: getMemoryModelRunner, models: MODELS, getApiKeyForProvider,
    // The first build can be made by the server (an account in the cloud, and the person did not choose to keep replies on this device).
    serverRebuild: { canUse: () => Boolean(lastUser?.supabaseUserId) && getConfig()?.replyRunLocation !== 'local', start: startServerRebuild, stop: stopServerRebuild },
    logger }));
  const autoRebuild = (loading) => { void Promise.resolve(loading).then(() => memory.ready()).then(() => setTimeout(() => void rebuild.maybeAutoStart().catch(() => {}), 10000)); };
  const syncVectors = (loading) => { void Promise.resolve(loading).then(() => memory.ready()).then(() => setTimeout(() => void vectors.sync(), 5000)); };
  // The line under a reply about what the memory did draws itself from the page's events.
  void import('../../ui/memory-notes/memory-reply-line.js').then(({ startMemoryLines }) => startMemoryLines({ document, getConfig, getMemory: () => memory, getConversation, getText, logger })).catch((error) => logger.warn?.('The memory line under replies did not start.', error));
  // The page may have announced the person before this part was loaded.
  if (lastUser) { const loading = memory.attach(lastUser); syncVectors(loading); autoRebuild(loading); }
  document.addEventListener(USER_READY_EVENT, (event) => {
    lastUser = event.detail?.user || null;
    if (lastUser) { const loading = memory.attach(lastUser); syncVectors(loading); autoRebuild(loading); }
  });
  return {
    memory,
    /** The person switched the notes on in the settings: load them now, without waiting for the next sign-in. */
    switchedOn: () => (lastUser ? memory.attach(lastUser) : Promise.resolve(null))
  };
}
