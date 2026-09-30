// Thinking text as it is shown. Thought summaries come with **bold**
// headings, which are drawn as bold; everything else is plain text, set with
// text nodes, never as markup.
//
// The thinking is redrawn for every piece that streams in, so only what changed
// is touched (usually the end of the last text node): nothing under a reader's
// finger is replaced, which on iPhone would stop their scroll.

const pieces = (text) => String(text || '').split(/\*\*([^*\n]+)\*\*/g)
  .map((value, index) => ({ strong: index % 2 === 1, value }));

/** Puts `text` into `node`, with **headings** in bold. */
export function fillThinkingText(document, node, text) {
  const wanted = pieces(text);
  const nodes = [...node.childNodes];
  wanted.forEach((piece, index) => {
    const current = nodes[index];
    const isStrong = current?.nodeType === 1 && current.tagName === 'STRONG';
    const isText = current?.nodeType === 3;
    if (piece.strong ? isStrong : isText) {
      if (piece.strong) {
        if (current.textContent !== piece.value) current.textContent = piece.value;
      } else if (current.data !== piece.value) {
        current.data = piece.value;
      }
      return;
    }
    let replacement;
    if (piece.strong) {
      replacement = document.createElement('strong');
      replacement.textContent = piece.value;
    } else {
      replacement = document.createTextNode(piece.value);
    }
    if (current) node.replaceChild(replacement, current);
    else node.appendChild(replacement);
  });
  for (let index = nodes.length - 1; index >= wanted.length; index -= 1) nodes[index].remove();
}
