export const highlightText = (text, query) => {
  if (!query || !text) return text;
  try {
    const safeQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${safeQuery})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-300 dark:bg-yellow-500 rounded px-1">$1</mark>');
  } catch (e) {
    console.error("Highlight regex error:", e);
    return text;
  }
};
