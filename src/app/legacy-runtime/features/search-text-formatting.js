export const highlightText = (text, query) => {
  if (!query || !text) return text;
  try {
    const safeQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${safeQuery})`, 'gi');
    return text.replace(regex, '<mark class="conversation-search-match">$1</mark>');
  } catch (e) {
    console.error("Highlight regex error:", e);
    return text;
  }
};
