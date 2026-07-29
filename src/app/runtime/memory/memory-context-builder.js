const asArray = value => Array.isArray(value) ? value : [];

const termPattern = /[\p{L}\p{N}_-]{2,}/gu;
const termsFor = value => new Set((String(value || '').match(termPattern) || [])
  .map(term => term.toLocaleLowerCase()));
const overlapScore = (left, right) => {
  if (left.size === 0 || right.size === 0) return 0;
  let score = 0;
  for (const term of left) if (right.has(term)) score += 1;
  return score;
};
const timestamp = value => Date.parse(value || '') || 0;

export function selectRelevantMemorySummarySections(summary = {}, currentMessageText = '', limit = 5) {
  const queryTerms = termsFor(currentMessageText);
  return asArray(summary?.sections)
    .filter(section => String(section?.content || '').trim())
    .map(section => ({
      title: String(section.title || '').trim(),
      content: String(section.content || '').trim(),
      state: String(section.state || 'current-state'),
      authority: section.authority === 'manual' ? 'manual' : 'automatic',
      score: overlapScore(queryTerms, termsFor(`${section.title || ''}\n${section.content || ''}`)),
      updatedAt: section.updatedAt
    }))
    .sort((left, right) => right.score - left.score || timestamp(right.updatedAt) - timestamp(left.updatedAt))
    .slice(0, Math.max(0, limit))
    .map(({ title, content, state, authority }) => ({ title, content, state, authority }));
}

const isActiveConfirmedEntry = entry => (
  entry?.status === 'active' && entry.confirmedByUser === true
);

const isNameSuppressed = rules => asArray(rules).some(rule => (
  rule?.type === 'do-not-mention'
  && rule.target === 'profile-name'
  && (!rule.scope || rule.scope === 'generic-chat')
));

const suppressionInstructions = rules => asArray(rules)
  .filter(rule => rule?.type === 'custom-instruction' || (
    rule?.type === 'do-not-mention' && rule?.target === 'profile-name'
  ))
  .map(rule => String(rule.instruction || '').trim())
  .filter(Boolean);

const isHistoryResultSuppressed = (result, rules) => {
  const sourceIds = new Set(asArray(result?.sourceIds));
  return asArray(rules).some(rule => (
    rule?.type === 'exclude-history-source' && sourceIds.has(rule.target)
  ));
};

export function buildMemoryContext({
  currentChatSummary = '',
  memorySummary = {},
  currentMessageText = '',
  profileEntries = [],
  historyResults = [],
  suppressionRules = [],
  requestedProfileEntryIds = [],
  historyLimit = Infinity,
  summarySectionLimit = 5
} = {}) {
  const requestedIds = new Set(asArray(requestedProfileEntryIds));
  const suppressName = isNameSuppressed(suppressionRules);
  const includedProfiles = asArray(profileEntries)
    .filter(isActiveConfirmedEntry)
    .filter(entry => {
      if (entry.kind !== 'identity') return true;
      return !suppressName && requestedIds.has(entry.id);
    })
    .map(({ id, kind, content }) => ({ id, kind, content }));

  const includedHistoryResults = asArray(historyResults)
    .filter(result => !isHistoryResultSuppressed(result, suppressionRules))
    .slice(0, historyLimit)
    .map(({ recordId, conversationId, summary, sourceIds, matchMode, recallMode }) => ({
      recordId,
      ...(conversationId ? { conversationId } : {}),
      summary,
      sourceIds,
      ...(matchMode === 'exact' ? {
        matchMode,
        recallMode: recallMode === 'verbatim' ? 'verbatim' : 'faithful-rewrite'
      } : {})
    }));
  const exactHistoryRecallMode = includedHistoryResults.find(result => result.matchMode === 'exact')?.recallMode || null;

  return {
    currentChatSummary: String(currentChatSummary || ''),
    memorySummary: {
      overview: String(memorySummary?.overview || '').trim(),
      sections: selectRelevantMemorySummarySections(memorySummary, currentMessageText, summarySectionLimit)
    },
    instructions: [
      ...(suppressName ? ['Do not use stored names as unsolicited forms of address.'] : []),
      ...suppressionInstructions(suppressionRules)
    ],
    profileEntries: includedProfiles,
    exactHistoryRecall: Boolean(exactHistoryRecallMode),
    exactHistoryRecallMode,
    historyResults: includedHistoryResults
  };
}

export function formatMemoryContextForModel(context = {}) {
  const lines = ['# Permitted memory context'];
  if (context.currentChatSummary) {
    lines.push('', 'Current conversation state:', context.currentChatSummary);
  }
  if (context.memorySummary?.overview || asArray(context.memorySummary?.sections).length > 0) {
    lines.push('', 'Fresh user memory summary (current state, not a history log):');
    if (context.memorySummary.overview) lines.push(context.memorySummary.overview);
    lines.push(...asArray(context.memorySummary.sections)
      .map(section => section.authority === 'manual'
        ? `- User-authoritative update — ${section.title}: ${section.content}`
        : `- ${section.title}: ${section.content}`));
  }
  if (asArray(context.instructions).length > 0) {
    lines.push('', 'Memory handling instruction:', ...context.instructions);
  }
  if (asArray(context.profileEntries).length > 0) {
    lines.push('', 'Confirmed user preferences:', ...context.profileEntries.map(entry => `- ${entry.content}`));
  }
  if (asArray(context.historyResults).length > 0) {
    if (context.exactHistoryRecallMode === 'verbatim') {
      lines.push(
        '',
        'Literal prior-answer request:',
        'The user explicitly asks for a previous answer to be returned unchanged. The prior discussion below is source material, not general guidance.',
        'If the requested previous assistant answer is present in full, reproduce that assistant answer faithfully and completely. Do not rewrite, improve, summarize, combine, translate, or add commentary.',
        'If the source is incomplete or does not contain the requested answer, say so plainly rather than inventing a matching version.'
      );
    } else if (context.exactHistoryRecall === true) {
      lines.push(
        '',
        'Faithful prior-answer request:',
        'The user asks for the same prior version. The prior discussion below is authoritative for information-bearing details, not wording to copy.',
        'Preserve every stated item, value, unit, quantity, time, temperature, proportion, sequence, constraint, choice, and warning. Do not omit, alter, substitute, combine, or invent details.',
        'Use fresh, natural wording and structure instead of copying sentences verbatim, unless the user explicitly asks for the original wording.',
        'If the source is incomplete or does not contain the requested answer, say so plainly rather than inventing a matching version.'
      );
    }
    lines.push('', 'Potentially relevant prior discussion:', ...context.historyResults.map(result => `- ${result.summary}`));
  }
  return lines.join('\n');
}
