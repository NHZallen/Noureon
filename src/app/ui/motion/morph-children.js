// Makes the children of `target` the children of `source` while touching only what differs, so a text that grows (the reply of a check as the model
// writes it) changes the one line that grew: the lines before it, and what the reader has selected in them, stay as they are. A list is looked into,
// so a new item does not redraw the others.

const LISTS = new Set(['UL', 'OL']);

/** Moves what is new from `source` into `target`; `source` is left empty or part-empty. */
export function morphChildren(target, source) {
  const old = [...target.childNodes];
  const next = [...source.childNodes];
  next.forEach((node, index) => {
    const before = old[index];
    if (!before) {
      target.append(node);
    } else if (before.nodeType === 3 && node.nodeType === 3) {
      if (before.data !== node.data) before.data = node.data;
    } else if (before.nodeType === 1 && node.nodeType === 1 && before.tagName === node.tagName) {
      if (LISTS.has(before.tagName)) morphChildren(before, node);
      else if (before.innerHTML !== node.innerHTML) before.innerHTML = node.innerHTML;
    } else {
      target.replaceChild(node, before);
    }
  });
  old.slice(next.length).forEach((node) => node.remove());
}
