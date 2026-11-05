// An SVG that a picture model made is made safe before the app keeps or shows it (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md). An SVG is not only a picture: it can hold scripts, event handlers, links and
// pictures from other sites, and a blob address of the app that is opened in a tab runs it with the rights of the app. So nothing the model wrote is kept as it is: the text is read tag by tag, only the
// elements and the attributes that draw are written again (escaped), and anything else is left out; what cannot be read as clean markup is refused as a whole. A list of what is allowed, not a list of what is not.
//
// Shared by the page and the server (the pictures of the server are made safe in the same place): no window, no document, no browser storage, no DOM (a plain reader of the text).

const MAX_BYTES = 2_000_000;
const MAX_ELEMENTS = 20_000;
const MAX_DEPTH = 64;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// The elements that draw. Anything else is left out with what is inside it; `a` and `switch` only lose their own tag (their content stays).
const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'image',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker', 'filter', 'style',
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence'
]);
const UNWRAPPED_ELEMENTS = new Set(['a', 'switch']);

// The attributes with a colon that are kept (the namespace of links and the language); every other one with a colon is left out.
const COLON_ATTRIBUTES = new Set(['xmlns:xlink', 'xml:space', 'xml:lang', 'xlink:href']);
const ATTRIBUTE_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;
// A picture inside an SVG is only a picture sent as data in one of the plain formats (never an address, never another SVG).
const DATA_PICTURE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]*$/i;

const NAMED_ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });

/** The text of an attribute with its entities read (so a check sees what the browser would see); an entity that is not known makes it null. */
function decodeEntities(value) {
  let bad = false;
  const decoded = value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      if (!Number.isFinite(code) || code < 0x20 && code !== 9 && code !== 10 && code !== 13 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) { bad = true; return ''; }
      return String.fromCodePoint(code);
    }
    if (name in NAMED_ENTITIES) return NAMED_ENTITIES[name];
    bad = true;
    return '';
  });
  return bad ? null : decoded;
}

const escapeText = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;');

// What a value may not hold once it is read: a script, an address other than one of this picture (`url(#id)`), an import, a binding.
// The control and invisible characters are the point: they are what a script hides itself with (`java\u0000script:`).
// eslint-disable-next-line no-control-regex
const stripped = (value) => value.replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, '').toLowerCase();
function valueIsClean(value) {
  const plain = stripped(value);
  if (/javascript:|vbscript:|livescript:|expression\(|@import|behavior:|-moz-binding|\\/.test(plain)) return false;
  if (/data:/.test(plain) && !/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(plain)) return false;
  // Every `url(...)` must point inside the picture.
  for (const match of plain.matchAll(/url\(([^)]*)\)/g)) {
    const target = match[1].replace(/^['"]|['"]$/g, '');
    if (!target.startsWith('#') && !/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(target)) return false;
  }
  return true;
}

/** One attribute: the text to write again, or null to leave it out. */
function cleanAttribute(element, name, rawValue) {
  if (!ATTRIBUTE_NAME.test(name)) return null;
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) return null;
  if (name.includes(':') && !COLON_ATTRIBUTES.has(name)) return null;
  const value = decodeEntities(rawValue);
  if (value === null) return null;
  if (lower === 'xmlns') return null; // the namespace is written once, on the root
  if (lower === 'href' || lower === 'xlink:href') {
    const target = value.trim();
    // A link is a place inside the picture; only an image may hold a picture sent as data.
    if (target.startsWith('#')) return /^#[\w.:-]*$/.test(target) ? target : null;
    return element === 'image' && DATA_PICTURE.test(target) ? target : null;
  }
  if (lower === 'style') return valueIsClean(value) ? value : null;
  return valueIsClean(value) ? value : null;
}

/** The content of a `style` element: kept as it is when it holds nothing that reaches out, else the element is left out. */
function styleIsClean(text) {
  return !/[<\\]/.test(text) && valueIsClean(text);
}

/**
 * Reads the text of an SVG and writes the safe part of it again. Returns { ok: true, svg } or { ok: false, reason }.
 * Refused as a whole: not a text, too big, a document type or an entity declaration, a root that is not `svg`, markup that does not close as it opened.
 */
export function sanitizeSvg(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'not text' };
  let text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.length > MAX_BYTES) return { ok: false, reason: 'too big' };
  text = text.replace(/\r\n?/g, '\n');
  let index = 0;
  let elements = 0;
  let rootSeen = false;
  let rootClosed = false;
  const out = [];
  // The open elements: { name, kept } (a kept one is written, an unwrapped one is only counted, a skipped one hides everything inside it).
  const stack = [];
  let skipping = 0;

  const fail = (reason) => ({ ok: false, reason });

  while (index < text.length) {
    if (text[index] !== '<') {
      const next = text.indexOf('<', index);
      const end = next === -1 ? text.length : next;
      const chunk = text.slice(index, end);
      index = end;
      if (skipping === 0 && rootSeen && !rootClosed) {
        // Text: only the five entities and numbers; a lone `&` is written as one.
        out.push(chunk.replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/>/g, '&gt;'));
      } else if (skipping === 0 && chunk.trim() && !rootSeen) {
        return fail('text before the root');
      }
      continue;
    }
    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4);
      if (end === -1) return fail('a comment that does not end');
      index = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', index)) {
      const end = text.indexOf(']]>', index + 9);
      if (end === -1) return fail('a CDATA that does not end');
      const content = text.slice(index + 9, end);
      index = end + 3;
      if (skipping === 0 && rootSeen && !rootClosed) out.push(escapeText(content));
      continue;
    }
    if (text.startsWith('<?', index)) {
      const end = text.indexOf('?>', index + 2);
      if (end === -1) return fail('an instruction that does not end');
      index = end + 2;
      continue;
    }
    if (text.startsWith('<!', index)) return fail('a document type or a declaration');
    // A tag.
    const closing = text[index + 1] === '/';
    let position = index + (closing ? 2 : 1);
    const nameMatch = /^[^\s/>]+/.exec(text.slice(position, position + 200));
    if (!nameMatch) return fail('a tag with no name');
    const name = nameMatch[0];
    position += name.length;
    if (!ELEMENT_NAME.test(name)) {
      // A name with a prefix or odd characters (`html:script`, `x:y`): left out with what is inside it.
      const scan = scanTag(text, position, closing);
      if (!scan) return fail('a tag that does not end');
      index = scan.end;
      if (closing) { if (skipping > 0) skipping -= 1; else return fail('a closing tag that was not opened'); } else if (!scan.selfClosing) skipping += 1;
      continue;
    }
    if (closing) {
      const end = text.indexOf('>', position);
      if (end === -1) return fail('a tag that does not end');
      index = end + 1;
      if (skipping > 0) { skipping -= 1; continue; }
      const open = stack.pop();
      if (!open || open.name !== name) return fail('a closing tag that does not match');
      if (open.kept === 'write') out.push(`</${name}>`);
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    const scan = scanTag(text, position, false);
    if (!scan) return fail('a tag that does not end');
    index = scan.end;
    if (skipping > 0) {
      if (!scan.selfClosing) skipping += 1;
      continue;
    }
    elements += 1;
    if (elements > MAX_ELEMENTS) return fail('too many elements');
    if (!rootSeen) {
      if (name !== 'svg') return fail('the root is not svg');
      rootSeen = true;
    } else if (rootClosed) {
      return fail('more than one root');
    }
    if (stack.length >= MAX_DEPTH) return fail('too deep');
    if (UNWRAPPED_ELEMENTS.has(name)) {
      if (!scan.selfClosing) stack.push({ name, kept: 'unwrap' });
      continue;
    }
    if (!ALLOWED_ELEMENTS.has(name)) {
      if (!scan.selfClosing) skipping += 1;
      continue;
    }
    // A style element is read whole: its text is checked before anything of it is written.
    if (name === 'style') {
      if (scan.selfClosing) continue;
      const close = text.indexOf('</style>', index);
      if (close === -1) return fail('a style that does not end');
      const raw = text.slice(index, close).replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '');
      index = close + '</style>'.length;
      if (styleIsClean(raw)) out.push(`<style>${escapeText(raw)}</style>`);
      continue;
    }
    const attributes = [];
    for (const [attributeName, rawValue] of scan.attributes) {
      const value = cleanAttribute(name, attributeName, rawValue);
      if (value !== null) attributes.push(` ${attributeName}="${escapeAttribute(value)}"`);
    }
    const namespace = name === 'svg' && stack.length === 0 ? ` xmlns="${SVG_NAMESPACE}"` : '';
    out.push(`<${name}${namespace}${attributes.join('')}${scan.selfClosing ? '/>' : '>'}`);
    if (scan.selfClosing) {
      if (stack.length === 0) rootClosed = true;
    } else {
      stack.push({ name, kept: 'write' });
    }
  }
  if (!rootSeen) return fail('no svg');
  if (stack.length > 0 || skipping > 0) return fail('markup that does not close');
  return { ok: true, svg: out.join('') };
}

/** From just after the name of a tag: its attributes (name, raw text of the value), where it ends, whether it closes itself. Null when it does not end. */
function scanTag(text, start, closing) {
  let position = start;
  const attributes = [];
  while (position < text.length) {
    while (position < text.length && /\s/.test(text[position])) position += 1;
    if (position >= text.length) return null;
    if (text[position] === '>') return { attributes, end: position + 1, selfClosing: false };
    if (text[position] === '/') {
      if (text[position + 1] === '>') return { attributes, end: position + 2, selfClosing: !closing };
      position += 1;
      continue;
    }
    const nameMatch = /^[^\s=/>"'<]+/.exec(text.slice(position, position + 200));
    if (!nameMatch) return null;
    const name = nameMatch[0];
    position += name.length;
    while (position < text.length && /\s/.test(text[position])) position += 1;
    if (text[position] !== '=') {
      // An attribute with no value is not valid in XML: it is left out, the tag goes on.
      continue;
    }
    position += 1;
    while (position < text.length && /\s/.test(text[position])) position += 1;
    const quote = text[position];
    if (quote !== '"' && quote !== "'") return null;
    const end = text.indexOf(quote, position + 1);
    if (end === -1) return null;
    attributes.push([name, text.slice(position + 1, end)]);
    position = end + 1;
  }
  return null;
}

const decodeBase64 = (value) => {
  const binary = atob(String(value || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
};
const encodeBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

/**
 * The pictures a maker of pictures gives back, with every SVG made safe (a base64 text in `b64Json`). An SVG that cannot be made safe is left out; the other pictures stay.
 * Returns { images, refused } (how many SVGs were refused).
 */
export function sanitizeSvgImages(images = []) {
  const safe = [];
  let refused = 0;
  for (const image of images) {
    if (image?.mediaType !== 'image/svg+xml') {
      safe.push(image);
      continue;
    }
    let result;
    try { result = sanitizeSvg(decodeBase64(image.b64Json)); } catch { result = { ok: false }; }
    if (result.ok) safe.push({ ...image, b64Json: encodeBase64(result.svg) });
    else refused += 1;
  }
  return { images: safe, refused };
}

