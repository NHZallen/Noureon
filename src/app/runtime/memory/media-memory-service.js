const asArray = value => Array.isArray(value) ? value : [];

const withMediaDescription = (turn, summaries) => {
  const additions = summaries.map(summary => (
    `[Attached ${summary.kind} (${summary.name}): ${summary.summary}]`
  ));
  return additions.length ? { ...turn, text: [turn.text, ...additions].filter(Boolean).join('\n') } : turn;
};

export function createMediaMemoryService({
  mediaClient,
  hashString,
  createId = prefix => `${prefix}:${crypto.randomUUID()}`,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof mediaClient?.describe !== 'function') throw new TypeError('Media memory requires a media client.');
  if (typeof hashString !== 'function') throw new TypeError('Media memory requires hashString.');

  return {
    async enrichTurns({ conversationId, turns = [], memoryState = {}, signal } = {}) {
      const cached = new Map(asArray(memoryState.mediaMemories).map(item => [item?.sourceHash, item]));
      const created = [];
      const mediaForIndex = [];
      const enrichedTurns = [];
      for (const turn of turns) {
        const summaries = [];
        for (const attachment of asArray(turn.attachments)) {
          const sourceHash = await hashString(JSON.stringify({
            messageId: turn.id,
            partIndex: attachment.partIndex,
            name: attachment.name,
            mimeType: attachment.mimeType,
            data: attachment.data
          }));
          let summary = cached.get(sourceHash);
          if (!summary) {
            const description = await mediaClient.describe({ attachment, signal });
            summary = {
              id: createId('media-memory'),
              conversationId,
              messageId: turn.id,
              partIndex: attachment.partIndex,
              sourceHash,
              name: attachment.name || 'attachment',
              mimeType: attachment.mimeType,
              kind: description.kind,
              summary: description.summary,
              keyFacts: description.keyFacts,
              createdAt: now()
            };
            cached.set(sourceHash, summary);
            created.push(summary);
          }
          summaries.push(summary);
          mediaForIndex.push({ mediaMemory: summary, attachment });
        }
        enrichedTurns.push(withMediaDescription(turn, summaries));
      }
      return { turns: enrichedTurns, mediaMemories: created, mediaForIndex };
    }
  };
}
