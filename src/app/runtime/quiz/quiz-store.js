// Where what a person has answered in a quiz card is kept (docs/superpowers/specs/2026-10-09-quiz-card-design.md, §5): on the message the quiz is in
// (`message.metadata.quiz`, one entry for each quiz block of the message), so it goes with the conversation: it is saved with it, and the cloud keeps it
// (cloud-sync-v2-codecs.js), so a conversation opened again, or on another device, shows the answers and the score and goes on from there.
// A temporary chat, and a card that is not in a message of the open conversation, keep it only while the page is open.

const SAVE_DELAY_MS = 400;
// The cloud keeps a message's metadata only up to 20,000 characters (cloud-sync-v2-codecs.js); what does not fit stays in memory.
const MAX_ENTRY_CHARS = 8_000;
const MAX_TOTAL_CHARS = 16_000;

/**
 * `memory` is the store that holds it while the page is open (quiz-card.js: memoryStore). Returns `storeFor(element)`:
 * a store ({ get(key), set(key, state) }) for the card in `element`, `memory` when this card is not kept with a conversation,
 * or null when its message is not on the page yet (try again a little later).
 */
export function createQuizStores({ memory, getActiveConversation = () => null, saveAppData = async () => {}, logger = console, schedule = (task, delay) => setTimeout(task, delay) }) {
  let timer = null;
  const queueSave = () => {
    if (timer) return;
    timer = schedule(() => {
      timer = null;
      void Promise.resolve(saveAppData()).catch((error) => logger?.warn?.('Saving a quiz answer failed.', error));
    }, SAVE_DELAY_MS);
  };

  return function storeFor(element) {
    const holder = element?.closest?.('[data-message-index]');
    if (!holder) return memory;
    const rendered = holder.__astraRenderedMessage;
    if (!rendered) return null;
    const conversation = getActiveConversation();
    const temporary = Boolean(conversation?.isTemporary || conversation?.retentionMode === 'ephemeral');
    if (!conversation || temporary || !Array.isArray(conversation.messages)) return memory;
    // The message of the conversation itself (the page may hold an older copy of it after a sync): found by the object, or by its id.
    const message = conversation.messages.includes(rendered) ? rendered : (rendered.id ? conversation.messages.find((item) => item?.id === rendered.id) : null);
    if (!message) return memory;
    return {
      get: (key) => message.metadata?.quiz?.[key] || memory.get(key),
      set(key, state) {
        memory.set(key, state);
        const others = Object.fromEntries(Object.entries(message.metadata?.quiz || {}).filter(([name]) => name !== key));
        const size = JSON.stringify(state).length;
        const total = size + JSON.stringify(others).length;
        if (size > MAX_ENTRY_CHARS || total > MAX_TOTAL_CHARS) return;
        message.metadata = { ...(message.metadata || {}), quiz: { ...others, [key]: state } };
        conversation.lastUpdatedAt = new Date().toISOString();
        queueSave();
      }
    };
  };
}
