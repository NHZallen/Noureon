import {
  buildHistoryIndexTurns,
  serializeHistoryIndexSource
} from './history-index-source.js';

const asArray = value => Array.isArray(value) ? value : [];

export function createHistoryIndexRebuildService({
  getConversations,
  getMemoryState,
  captureCompletedTurn,
  hashString,
  hasIndexedSource = () => true,
  migrateSourceFingerprint = null,
  repairIndexedSource = null
} = {}) {
  if (typeof getConversations !== 'function') throw new TypeError('History index rebuild requires getConversations.');
  if (typeof getMemoryState !== 'function') throw new TypeError('History index rebuild requires getMemoryState.');
  if (typeof captureCompletedTurn !== 'function') throw new TypeError('History index rebuild requires captureCompletedTurn.');
  if (typeof hashString !== 'function') throw new TypeError('History index rebuild requires hashString.');

  return {
    async rebuild({ signal, onProgress = () => {}, forceCapture = false } = {}) {
      const conversations = asArray(getConversations())
        .filter(conversation => conversation?.id && !conversation.deletedAt && !conversation.isTemporary)
        .map(conversation => ({ conversation, turns: buildHistoryIndexTurns(conversation) }))
        .filter(item => item.turns.length > 0);
      let completed = 0;
      let indexed = 0;
      let skipped = 0;
      let failed = 0;
      onProgress({ state: 'running', completed, total: conversations.length, indexed, skipped, failed });

      for (const { conversation, turns } of conversations) {
        if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
        try {
          const sourceHash = await hashString(serializeHistoryIndexSource(turns));
          const recentState = asArray(getMemoryState()?.recentConversationStates)
            .find(state => state?.conversationId === conversation.id);
          const sourceMatches = !forceCapture && recentState?.sourceHash === sourceHash;
          const indexMatches = sourceMatches && hasIndexedSource({
            conversationId: conversation.id,
            sourceHash,
            turns
          });
          if (sourceMatches && indexMatches) {
            skipped += 1;
          } else if (sourceMatches) {
            const repairResult = typeof repairIndexedSource === 'function'
              ? await repairIndexedSource({
                conversationId: conversation.id,
                sourceHash,
                turns,
                signal
              })
              : null;
            const repaired = repairResult === true
              || repairResult?.indexed === true
              || repairResult?.repaired === true;
            if (repaired) {
              indexed += 1;
            } else {
              // Derived memory being current must not suppress reconstruction
              // of a missing local search index.
              const result = await captureCompletedTurn({
                conversationId: conversation.id,
                sourceHash,
                turns,
                signal,
                collectProfileCandidates: false,
                allowTopicSummary: false,
                forceCapture: true
              });
              if (result?.captured) indexed += 1;
              else skipped += 1;
            }
          } else {
            const legacySourceHash = !forceCapture && recentState?.sourceHash
              ? await hashString(JSON.stringify(turns))
              : null;
            const canMigrateLegacySource = legacySourceHash
              && recentState.sourceHash === legacySourceHash
              && hasIndexedSource({
                conversationId: conversation.id,
                sourceHash: legacySourceHash,
                turns
              });
            if (canMigrateLegacySource && typeof migrateSourceFingerprint === 'function') {
              const migrated = await migrateSourceFingerprint({
                conversationId: conversation.id,
                previousSourceHash: legacySourceHash,
                nextSourceHash: sourceHash
              });
              if (migrated !== false) {
                skipped += 1;
              } else {
                const result = await captureCompletedTurn({
                  conversationId: conversation.id,
                  sourceHash,
                  turns,
                  signal,
                  collectProfileCandidates: false,
                  allowTopicSummary: false,
                  forceCapture
                });
                if (result?.captured) indexed += 1;
                else skipped += 1;
              }
            } else {
              const result = await captureCompletedTurn({
                conversationId: conversation.id,
                sourceHash,
                turns,
                signal,
                collectProfileCandidates: false,
                allowTopicSummary: false,
                forceCapture
              });
              if (result?.captured) indexed += 1;
              else skipped += 1;
            }
          }
        } catch (error) {
          if (signal?.aborted || error?.name === 'AbortError') throw error;
          failed += 1;
        }
        completed += 1;
        onProgress({ state: 'running', completed, total: conversations.length, indexed, skipped, failed });
      }
      const result = { state: 'complete', completed, total: conversations.length, indexed, skipped, failed };
      onProgress(result);
      return result;
    }
  };
}
