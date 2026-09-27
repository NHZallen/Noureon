// A forgiving JSON reader for model-written specs. Models add comments and
// trailing commas, use single or typographic quotes, leave keys unquoted,
// put raw line breaks inside strings and get cut off by the token limit.
// Each of those is accepted and noted in `repairs`; the result is plain data.

const SMART_OPEN = { '\u201C': '\u201D', '\u2018': '\u2019', '\u300C': '\u300D', '\u00AB': '\u00BB' };
const IDENTIFIER_START = /[A-Za-z_$\u00C0-\uFFFF]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$\-\u00C0-\uFFFF]/;
const MAX_DEPTH = 64;

export class RelaxedJsonError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'RelaxedJsonError';
    this.position = position;
  }
}

export function parseRelaxedJson(source) {
  const text = String(source ?? '').replace(/^\uFEFF/, '');
  const repairs = new Set();
  let index = 0;

  const peek = () => text[index];
  const atEnd = () => index >= text.length;

  function skipSpaceAndComments() {
    for (;;) {
      while (!atEnd() && /\s/.test(peek())) index += 1;
      if (text.startsWith('//', index)) {
        repairs.add('comments');
        while (!atEnd() && peek() !== '\n') index += 1;
        continue;
      }
      if (text.startsWith('/*', index)) {
        repairs.add('comments');
        const end = text.indexOf('*/', index + 2);
        index = end === -1 ? text.length : end + 2;
        continue;
      }
      return;
    }
  }

  function parseString() {
    const open = peek();
    const close = SMART_OPEN[open] || open;
    if (open !== '"') repairs.add(open === "'" ? 'single-quotes' : 'smart-quotes');
    index += 1;
    let value = '';
    while (!atEnd()) {
      const char = peek();
      if (char === close) {
        index += 1;
        return value;
      }
      if (char === '\\') {
        const next = text[index + 1];
        index += 2;
        const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', "'": "'", '\\': '\\', '/': '/' }[next];
        if (simple !== undefined) value += simple;
        else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(index, index + 4))) {
          value += String.fromCharCode(Number.parseInt(text.slice(index, index + 4), 16));
          index += 4;
        } else if (next !== undefined) {
          repairs.add('invalid-escape');
          value += next;
        }
        continue;
      }
      if (char === '\n' || char === '\r') repairs.add('raw-newline');
      value += char;
      index += 1;
    }
    repairs.add('truncated');
    return value;
  }

  function parseBareWord() {
    const start = index;
    while (!atEnd() && IDENTIFIER_PART.test(peek())) index += 1;
    return text.slice(start, index);
  }

  function parseNumber() {
    const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!match) return undefined;
    index += match[0].length;
    if (match[0].startsWith('+') || match[0].startsWith('.') || match[0].endsWith('.')) repairs.add('number-format');
    return Number(match[0]);
  }

  function parseValue(depth) {
    if (depth > MAX_DEPTH) throw new RelaxedJsonError('nesting too deep', index);
    skipSpaceAndComments();
    if (atEnd()) {
      repairs.add('truncated');
      return null;
    }
    const char = peek();
    if (char === '{') return parseObject(depth + 1);
    if (char === '[') return parseArray(depth + 1);
    if (char === '"' || char === "'" || SMART_OPEN[char]) return parseString();
    const number = /[\d+\-.]/.test(char) ? parseNumber() : undefined;
    if (number !== undefined) return number;
    // An unquoted colour, e.g. {accent: #1F4E9A}.
    const color = char === '#' ? /^#[0-9a-fA-F]{3,8}\b/.exec(text.slice(index)) : null;
    if (color) {
      repairs.add('unquoted-value');
      index += color[0].length;
      return color[0];
    }
    const word = parseBareWord();
    if (!word) throw new RelaxedJsonError(`unexpected character ${JSON.stringify(char)}`, index);
    const literal = { true: true, false: false, null: null, True: true, False: false, None: null, undefined: null, NaN: null }[word];
    if (literal !== undefined || word in { true: 1, false: 1, null: 1 }) {
      if (!['true', 'false', 'null'].includes(word)) repairs.add('literals');
      return literal;
    }
    // An unquoted string value, e.g. {"layout": cover}.
    repairs.add('unquoted-value');
    return word;
  }

  function parseKey() {
    skipSpaceAndComments();
    const char = peek();
    if (char === '"' || char === "'" || SMART_OPEN[char]) return parseString();
    if (IDENTIFIER_START.test(char) || /\d/.test(char)) {
      repairs.add('unquoted-keys');
      return parseBareWord();
    }
    throw new RelaxedJsonError(`expected a key, found ${JSON.stringify(char)}`, index);
  }

  function parseObject(depth) {
    index += 1;
    const result = {};
    for (;;) {
      skipSpaceAndComments();
      if (atEnd()) {
        repairs.add('truncated');
        return result;
      }
      if (peek() === '}') {
        index += 1;
        return result;
      }
      if (peek() === ']') {
        // A closing bracket of the wrong kind ends the object.
        repairs.add('mismatched-brackets');
        return result;
      }
      if (peek() === ',') {
        repairs.add('extra-commas');
        index += 1;
        continue;
      }
      const key = parseKey();
      skipSpaceAndComments();
      if (peek() === ':' || peek() === '=') index += 1;
      else if (atEnd()) {
        repairs.add('truncated');
        return result;
      } else repairs.add('missing-colon');
      const value = parseValue(depth);
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') result[key] = value;
      skipSpaceAndComments();
      if (peek() === ',') {
        index += 1;
        skipSpaceAndComments();
        if (peek() === '}') repairs.add('trailing-commas');
      } else if (!atEnd() && peek() !== '}' && peek() !== ']') {
        repairs.add('missing-commas');
      }
    }
  }

  function parseArray(depth) {
    index += 1;
    const result = [];
    for (;;) {
      skipSpaceAndComments();
      if (atEnd()) {
        repairs.add('truncated');
        return result;
      }
      if (peek() === ']') {
        index += 1;
        return result;
      }
      if (peek() === '}') {
        repairs.add('mismatched-brackets');
        return result;
      }
      if (peek() === ',') {
        repairs.add('extra-commas');
        index += 1;
        continue;
      }
      result.push(parseValue(depth));
      skipSpaceAndComments();
      if (peek() === ',') {
        index += 1;
        skipSpaceAndComments();
        if (peek() === ']') repairs.add('trailing-commas');
      } else if (!atEnd() && peek() !== ']' && peek() !== '}') {
        repairs.add('missing-commas');
      }
    }
  }

  const value = parseValue(0);
  skipSpaceAndComments();
  if (!atEnd()) repairs.add('trailing-text');
  return { value, repairs: [...repairs] };
}
