// Thinking text as it is shown. Thought summaries come with **bold**
// headings, which are drawn as bold; everything else is plain text, set with
// text nodes, never as markup.

/** Puts `text` into `node`, with **headings** in bold. */
export function fillThinkingText(document, node, text) {
  const pieces = String(text || '').split(/\*\*([^*\n]+)\*\*/g);
  const nodes = pieces.map((piece, index) => {
    if (index % 2 === 0) return document.createTextNode(piece);
    const strong = document.createElement('strong');
    strong.textContent = piece;
    return strong;
  });
  node.replaceChildren(...nodes);
}
