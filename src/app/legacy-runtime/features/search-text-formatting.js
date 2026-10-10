const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/**
 * Text that is safe to put in `innerHTML`, with every place the query is found in a `<mark>`. The text of a conversation (its title, what was said in it)
 * is never trusted: it is escaped piece by piece, so that a match cannot cut an entity in two and a tag in the text is shown as text.
 */
export const highlightText = (text, query) => {
  if (!text) return text;
  if (!query) return escapeHtml(text);
  try {
    const safeQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(safeQuery, 'gi');
    const source = String(text);
    let html = '';
    let last = 0;
    for (const match of source.matchAll(regex)) {
      if (!match[0]) continue;
      html += `${escapeHtml(source.slice(last, match.index))}<mark class="conversation-search-match">${escapeHtml(match[0])}</mark>`;
      last = match.index + match[0].length;
    }
    return html + escapeHtml(source.slice(last));
  } catch (e) {
    console.error("Highlight regex error:", e);
    return escapeHtml(text);
  }
};
