const asArray = value => Array.isArray(value) ? value : [];

const isActiveConfirmedEntry = entry => (
  entry?.status === 'active' && entry.confirmedByUser === true
);

const isNameSuppressed = rules => asArray(rules).some(rule => (
  rule?.type === 'do-not-mention'
  && rule.target === 'profile-name'
  && (!rule.scope || rule.scope === 'generic-chat')
));

const isHistoryResultSuppressed = (result, rules) => {
  const sourceIds = new Set(asArray(result?.sourceIds));
  return asArray(rules).some(rule => (
    rule?.type === 'exclude-history-source' && sourceIds.has(rule.target)
  ));
};

export function buildMemoryContext({
  currentChatSummary = '',
  profileEntries = [],
  historyResults = [],
  suppressionRules = [],
  requestedProfileEntryIds = [],
  historyLimit = 3
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

  return {
    currentChatSummary: String(currentChatSummary || ''),
    instructions: suppressName
      ? ['Do not use stored names as unsolicited forms of address.']
      : [],
    profileEntries: includedProfiles,
    historyResults: asArray(historyResults)
      .filter(result => !isHistoryResultSuppressed(result, suppressionRules))
      .slice(0, historyLimit)
      .map(({ recordId, summary, sourceIds }) => ({ recordId, summary, sourceIds }))
  };
}

export function formatMemoryContextForModel(context = {}) {
  const lines = ['# Permitted memory context'];
  if (context.currentChatSummary) {
    lines.push('', 'Current conversation state:', context.currentChatSummary);
  }
  if (asArray(context.instructions).length > 0) {
    lines.push('', 'Memory handling instruction:', ...context.instructions);
  }
  if (asArray(context.profileEntries).length > 0) {
    lines.push('', 'Confirmed user preferences:', ...context.profileEntries.map(entry => `- ${entry.content}`));
  }
  if (asArray(context.historyResults).length > 0) {
    lines.push('', 'Potentially relevant prior discussion:', ...context.historyResults.map(result => `- ${result.summary}`));
  }
  return lines.join('\n');
}
