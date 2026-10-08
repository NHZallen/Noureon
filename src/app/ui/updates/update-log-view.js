// The update notes (src/data/update-logs/entries.js) drawn for the "new version" window (the newest version first, as a headline, a few
// numbered changes and the rest). The whole history is the page noureon.com/updates (scripts/build-public-pages.mjs), which uses
// parseLogBlocks too. A note is a list of strings of trusted HTML, written over the years in a few shapes: a bold line alone is a heading, a
// string that is a <ul> is a list, anything else is a sentence or a point. parseLogBlocks tells them apart so that old notes need no change.

const HEADING = /^<strong>([^<]*)<\/strong>$/;
const LABELLED = /^\s*<strong>([^<]+)<\/strong>\s*([\s\S]*)$/;
const trimColon = (text) => text.replace(/[：:]\s*$/, '').trim();

export function parseLogBlocks(items = []) {
  const blocks = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    // One sentence on its own is a paragraph; several lines (or one with a bold lead-in) are points of a list.
    if (group.length === 1 && !LABELLED.test(group[0])) blocks.push({ type: 'paragraph', html: group[0] });
    else blocks.push({ type: 'list', items: group, labelled: group.every((item) => LABELLED.test(item)) });
    group = [];
  };
  for (const raw of items) {
    const item = String(raw);
    const heading = HEADING.exec(item.trim());
    if (heading) {
      flush();
      blocks.push({ type: 'heading', html: trimColon(heading[1]) });
      continue;
    }
    if (/^\s*<ul[\s>]/i.test(item)) {
      flush();
      const points = [...item.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((match) => match[1]);
      if (points.length) blocks.push({ type: 'list', items: points, labelled: points.every((point) => LABELLED.test(point)) });
      else blocks.push({ type: 'paragraph', html: item });
      continue;
    }
    group.push(item);
  }
  flush();
  return blocks;
}

const make = (document, tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
};

// numbered: a list whose points all start with a bold word becomes numbered rows (title, then what it is); other lists stay bullets.
function appendBlocks({ document, parent, blocks, sanitize, numbered }) {
  for (const block of blocks) {
    if (block.type === 'heading') {
      parent.appendChild(make(document, 'h4', 'ul-sec', sanitize(block.html)));
    } else if (block.type === 'paragraph') {
      parent.appendChild(make(document, 'p', 'ul-p', sanitize(block.html)));
    } else if (numbered && block.labelled) {
      const rows = make(document, 'div', 'ul-items');
      block.items.forEach((item, index) => {
        const [, title, rest] = LABELLED.exec(item);
        const row = make(document, 'div', 'ul-it');
        const text = make(document, 'div', 'ul-it-text');
        text.appendChild(make(document, 'b', 'ul-it-title', sanitize(trimColon(title))));
        if (rest.trim()) text.appendChild(make(document, 'p', 'ul-it-desc', sanitize(rest.trim())));
        row.append(make(document, 'span', 'ul-n', String(index + 1).padStart(2, '0')), text);
        rows.appendChild(row);
      });
      parent.appendChild(rows);
    } else {
      const list = make(document, 'ul', 'ul-ul');
      for (const item of block.items) list.appendChild(make(document, 'li', '', sanitize(item)));
      parent.appendChild(list);
    }
  }
}

/** The new versions, newest first: the version and date, a headline (the first sentence of the note), then the rest. */
export function renderLatestUpdates({ document, container, logs, sanitize }) {
  container.replaceChildren();
  for (const log of logs) {
    const item = make(document, 'section', 'ul-new');
    const meta = make(document, 'div', 'ul-meta', '');
    const version = make(document, 'span', 'ul-v', '');
    version.textContent = log.version;
    const date = make(document, 'span', 'ul-d', '');
    date.textContent = log.date;
    meta.append(version, date);
    item.appendChild(meta);
    let blocks = parseLogBlocks(log.content);
    // A first line that only says which release this is ("Noureon 17.7.0 release notes") repeats the version above it.
    if (blocks[0]?.type === 'heading' && blocks[0].html.includes(log.version)) blocks = blocks.slice(1);
    if (blocks[0]?.type === 'paragraph') {
      item.appendChild(make(document, 'div', 'ul-hl', sanitize(blocks[0].html)));
      blocks = blocks.slice(1);
    }
    appendBlocks({ document, parent: item, blocks, sanitize, numbered: true });
    container.appendChild(item);
  }
}
