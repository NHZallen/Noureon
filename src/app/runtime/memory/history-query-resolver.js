const normalizeText = value => String(value || '').trim();

const isAmbiguousFragment = queryText => (
  queryText.length <= 8
  || /^(這|那|它|他|她|哪個|這個|那個)/u.test(queryText)
);

export function resolveHistoryQuery({
  queryText,
  conversationContext = {},
  allowModelResolution = false
} = {}) {
  const originalQuery = normalizeText(queryText);
  const numberedReference = originalQuery.match(/\b(\d+)\b/u);
  const references = conversationContext.numberedReferences || [];

  if (numberedReference) {
    const number = Number(numberedReference[1]);
    const reference = references.find(item => Number(item.number) === number);
    if (reference?.text) {
      const currentTopic = normalizeText(conversationContext.currentTopic) || '目前問題';
      return {
        originalQuery,
        resolvedQuery: `比較「目前問題」與「${normalizeText(reference.text)}」的差異：${currentTopic}`,
        resolutionMethod: 'deterministic-numbered-reference',
        confidence: 1,
        shouldRetrieve: true
      };
    }
  }

  if (!originalQuery || isAmbiguousFragment(originalQuery)) {
    return {
      originalQuery,
      resolvedQuery: '',
      resolutionMethod: allowModelResolution ? 'model-resolution-needed' : 'unresolved',
      confidence: 0,
      shouldRetrieve: false
    };
  }

  return {
    originalQuery,
    resolvedQuery: originalQuery,
    resolutionMethod: 'direct',
    confidence: 1,
    shouldRetrieve: true
  };
}
