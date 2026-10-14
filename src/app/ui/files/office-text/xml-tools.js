// The small tools the readers of Word, PowerPoint and Excel files share (src/app/ui/files/office-text/). Shared by the page and the server: no window,
// no document; the XML parser and the zip reader come from the caller.

export const IMAGE_TYPES = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' });

export function parseXml(DOMParser, text) {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (!document || document.getElementsByTagName('parsererror').length) throw new Error('the file could not be read');
  return document.documentElement;
}

/** The element children of a node. */
export const kids = (node) => [...(node?.childNodes || [])].filter((item) => item.nodeType === 1);
export const find = (node, name) => kids(node).find((item) => item.localName === name) || null;
export const findAll = (node, name) => kids(node).filter((item) => item.localName === name);
export const descendants = (node, name) => (node ? [...node.getElementsByTagName('*')].filter((item) => item.localName === name) : []);
/** An attribute by its local name (`embed` for `r:embed`, `val` for `w:val`). */
export const attribute = (node, name) => [...(node?.attributes || [])].find((item) => item.localName === name)?.value ?? '';

/** The relationship id of a node (`r:id`, not a plain `id`): the one written with a prefix. */
export const relationshipId = (node) => [...(node?.attributes || [])].find((item) => item.localName === 'id' && item.name !== 'id')?.value ?? '';

/** The path a relationship target points to, from the part that holds it (`ppt/slides/slide1.xml` + `../media/a.png` = `ppt/media/a.png`). */
export function resolvePath(from, target) {
  if (String(target).startsWith('/')) return String(target).slice(1);
  const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const out = [];
  for (const part of `${base}${target}`.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

/** The relationships of a part: Map(id → { path, type }). A part with none gives an empty map. */
export async function readRelationships(zip, partPath, DOMParser) {
  const slash = partPath.lastIndexOf('/');
  const file = zip.file(`${partPath.slice(0, slash + 1)}_rels/${partPath.slice(slash + 1)}.rels`);
  const map = new Map();
  if (!file) return map;
  const root = parseXml(DOMParser, await file.async('string'));
  for (const relation of descendants(root, 'Relationship')) {
    if (relation.getAttribute('TargetMode') === 'External') continue;
    map.set(relation.getAttribute('Id'), { path: resolvePath(partPath, relation.getAttribute('Target') || ''), type: String(relation.getAttribute('Type') || '').split('/').pop() });
  }
  return map;
}

/** The text of a table written as Markdown: the first row is the header. */
export function markdownTable(rows) {
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (!width || !rows.length) return '';
  const cell = (value) => String(value ?? '').replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim();
  const line = (row) => `| ${Array.from({ length: width }, (_, index) => cell(row[index])).join(' | ')} |`;
  return [line(rows[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}

/** The bytes of a picture of the file, or null for a kind that is not a picture a model takes (a drawing, a metafile). */
export async function readPicture(zip, path) {
  const type = IMAGE_TYPES[String(path).split('.').pop().toLowerCase()];
  const file = type ? zip.file(path) : null;
  return file ? { mimeType: type, bytes: await file.async('uint8array') } : null;
}
