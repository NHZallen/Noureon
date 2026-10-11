// The picture of a connector: the logo of its project (the picture of the project's owner on GitHub, as the CLI tools have theirs), and the first letter of its name in
// its place while the picture is not there or when it cannot be loaded (offline, blocked). Used by the list, the settings and the card that asks about a tool.

const letterOf = (connector) => String(connector?.name || '?').trim().slice(0, 1).toUpperCase();

/** A span `className` holding the logo (`size` px); the letter replaces it when the picture fails. */
export function connectorMark(document, connector, { size = 30, className = '' } = {}) {
  const node = document.createElement('span');
  node.className = `connector-mark ${className}`.trim();
  node.setAttribute('aria-hidden', 'true');
  const showLetter = () => {
    const letter = document.createElement('span');
    letter.className = 'connector-mark-letter';
    letter.textContent = letterOf(connector);
    node.replaceChildren(letter);
  };
  if (!connector?.icon) {
    showLetter();
    return node;
  }
  const image = document.createElement('img');
  image.className = 'connector-mark-img';
  image.src = connector.icon;
  image.width = size;
  image.height = size;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.draggable = false;
  image.addEventListener('error', showLetter, { once: true });
  node.append(image);
  return node;
}
