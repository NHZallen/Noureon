// How much a model thinks is the choice of a conversation, and of each model in it: choosing the depth of A, going to B and coming back to A leaves A where it was.
// A new conversation starts where the last real one left off (its model and its depth). Pure functions: the model table and the rules of a model's levels are given.

/** The levels chosen in a conversation, by model: { [modelId]: level }. */
const levelsOf = (conversation) => (conversation?.reasoningEfforts && typeof conversation.reasoningEfforts === 'object' ? conversation.reasoningEfforts : {});

/** What this conversation has chosen for the model: the level it remembers for it (what it has now, when the model is the one it is on), or null. */
export function rememberedEffort(conversation, modelId) {
  const own = levelsOf(conversation)[modelId];
  if (own) return own;
  return conversation?.model === modelId && conversation?.reasoningEffort ? conversation.reasoningEffort : null;
}

/** The person chose a level for the model of the conversation: it is kept for that model, and is the one now. */
export function chooseEffort(conversation, modelId, effort) {
  if (!conversation || !modelId || !effort) return;
  conversation.reasoningEfforts = { ...levelsOf(conversation), [modelId]: effort };
  conversation.reasoningEffort = effort;
}

/**
 * The conversation goes to another model: the level of the one it leaves is kept, and the new one gets the level the conversation chose for it before
 * (the default of that model when it never did, or when the level is not one of its levels any more). Without levels for the model, there is none.
 */
export function switchEffort(conversation, nextModel, { getModelReasoningConfig, normalizeReasoningEffort }) {
  if (!conversation) return;
  const leaving = conversation.model;
  if (leaving && conversation.reasoningEffort) conversation.reasoningEfforts = { ...levelsOf(conversation), [leaving]: conversation.reasoningEffort };
  if (!getModelReasoningConfig(nextModel)) {
    delete conversation.reasoningEffort;
    return;
  }
  conversation.reasoningEffort = normalizeReasoningEffort(nextModel, levelsOf(conversation)[nextModel.id]);
}

/**
 * The conversation a new one starts like: the newest the person really had, as the sidebar lists them (pinning does not count): it has messages, is not in the trash,
 * not archived, not a temporary chat, and not a council's (a council has many models). Returns it, or null.
 */
export function latestSingleModelConversation(conversations, { models = [] } = {}) {
  const known = new Set(models.map((model) => model.id));
  const time = (conversation) => Date.parse(conversation.lastUpdatedAt || conversation.updatedAt || conversation.createdAt || '') || 0;
  return (Array.isArray(conversations) ? conversations : [])
    .filter((conversation) => conversation
      && Array.isArray(conversation.messages) && conversation.messages.length > 0
      && !conversation.deletedAt && !conversation.archived
      && conversation.retentionMode !== 'ephemeral'
      && !conversation.council?.enabled
      && (!known.size || known.has(conversation.model)))
    .sort((a, b) => time(b) - time(a))[0] || null;
}

/**
 * What a new conversation starts with, from the conversations there are: { model, provider, reasoningEffort, reasoningEfforts } or null (nothing to follow). It is a copy
 * of what the newest real conversation has chosen, taken once: the model it is on, its level, and the level chosen for each of the others (a level that is not one of
 * the model's any more is left out, so the model gets its default). After that the two do not follow each other.
 */
export function startingChoice(conversations, { models, getModelReasoningConfig, normalizeReasoningEffort }) {
  const source = latestSingleModelConversation(conversations, { models });
  const info = source ? models.find((model) => model.id === source.model) : null;
  if (!info) return null;
  const level = getModelReasoningConfig(info) ? normalizeReasoningEffort(info, rememberedEffort(source, info.id)) : null;
  const efforts = {};
  for (const [modelId, chosen] of Object.entries(levelsOf(source))) {
    const model = models.find((entry) => entry.id === modelId);
    const config = model ? getModelReasoningConfig(model) : null;
    if (config?.options.includes(chosen)) efforts[modelId] = chosen;
  }
  if (level) efforts[info.id] = level;
  return { model: info.id, provider: info.provider, reasoningEffort: level, reasoningEfforts: efforts };
}
