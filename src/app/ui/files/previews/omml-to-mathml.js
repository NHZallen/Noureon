// Converts Office Math (OMML) into MathML, which every current browser draws
// natively. docx-preview's own math support skips accents and combined
// sub/superscripts and throws on brackets without properties, so previews
// replace each equation with the output of this converter instead.

export const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

// Word stores accents as combining marks; MathML wants the spacing form.
const SPACING_ACCENTS = Object.freeze({
  '\u0300': '`',
  '\u0301': '\u00B4',
  '\u0302': '^',
  '\u0303': '~',
  '\u0304': '\u00AF',
  '\u0305': '\u00AF',
  '\u0306': '\u02D8',
  '\u0307': '\u02D9',
  '\u0308': '\u00A8',
  '\u030C': '\u02C7',
  '\u20D6': '\u2190',
  '\u20D7': '\u2192',
  '\u20E1': '\u2194'
});

const INTEGRALS = new Set(['\u222B', '\u222C', '\u222D', '\u222E', '\u222F', '\u2230']);
const CJK = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/u;

const isOmml = (node, name) => node?.nodeType === 1 && node.namespaceURI === OMML_NS && (!name || node.localName === name);
const elementChildren = (node) => [...(node?.childNodes || [])].filter((child) => child.nodeType === 1);
const findChild = (node, name) => elementChildren(node).find((child) => isOmml(child, name)) || null;
const findChildren = (node, name) => elementChildren(node).filter((child) => isOmml(child, name));

function readVal(node) {
  if (!node) return null;
  const value = node.getAttributeNS?.(OMML_NS, 'val') ?? node.getAttribute?.('m:val') ?? node.getAttribute?.('val');
  return value === undefined ? null : value;
}

// A property element such as <m:degHide/> is on unless it says otherwise.
function readFlag(node) {
  if (!node) return false;
  const value = readVal(node);
  return value === null || value === '' || !/^(?:0|off|false)$/i.test(value);
}

const getProperty = (node, propertiesName, name) => findChild(findChild(node, propertiesName), name);

function createMathBuilder(document) {
  const create = (tag, children = [], attributes = {}) => {
    const element = document.createElementNS(MATHML_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => {
      if (value !== undefined && value !== null) element.setAttribute(name, String(value));
    });
    children.forEach((child) => {
      if (child === null || child === undefined) return;
      element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return element;
  };
  const row = (nodes) => (nodes.length === 1 ? nodes[0] : create('mrow', nodes));
  const operator = (text, attributes = {}) => create('mo', [text], attributes);
  return { create, row, operator };
}

function tokenizeRun(text, style, builder) {
  const { create, operator } = builder;
  const plain = style === 'p' || style === 'b';
  const bold = style === 'b' || style === 'bi';
  const tokens = [];
  const pattern = plain
    ? /(\d+(?:\.\d+)?)|(\p{L}+)|(\s+)|([\s\S])/gu
    : /(\d+(?:\.\d+)?)|(\p{L})|(\s+)|([\s\S])/gu;
  for (const match of text.matchAll(pattern)) {
    const [value, number, letters, space] = match;
    if (space) {
      // Upright runs such as "sin " end in a space that Word displays; spaces
      // in italic runs are only typing artefacts.
      if (plain && tokens.length > 0) tokens.push(create('mspace', [], { width: '0.1667em' }));
      continue;
    }
    if (number) {
      tokens.push(create('mn', [number], bold ? { style: 'font-weight:bold' } : {}));
    } else if (letters) {
      const attributes = {};
      if (plain || letters.length > 1) attributes.mathvariant = 'normal';
      if (bold) attributes.style = 'font-weight:bold';
      tokens.push(create('mi', [letters], attributes));
    } else if (value === '\u221E' || value === '\u2205') {
      tokens.push(create('mi', [value]));
    } else {
      // Word typesets a hyphen in an equation as a minus sign.
      tokens.push(operator(value === '-' ? '\u2212' : value));
    }
  }
  return tokens;
}

function convertRun(run, builder) {
  const text = findChildren(run, 't').map((node) => node.textContent || '').join('');
  if (!text) return [];
  const properties = findChild(run, 'rPr');
  if (findChild(properties, 'nor') || CJK.test(text)) return [builder.create('mtext', [text])];
  return tokenizeRun(text, readVal(findChild(properties, 'sty')) || 'i', builder);
}

function convertNodes(nodes, builder) {
  return nodes.flatMap((node) => convertNode(node, builder));
}

const convertArgument = (node, builder) => builder.row(node ? convertNodes(elementChildren(node), builder) : []);

function convertNary(node, builder) {
  const { create, row, operator } = builder;
  const symbol = readVal(getProperty(node, 'naryPr', 'chr')) || '\u222B';
  const limitLocation = readVal(getProperty(node, 'naryPr', 'limLoc'))
    || (INTEGRALS.has(symbol) ? 'subSup' : 'undOvr');
  const sub = readFlag(getProperty(node, 'naryPr', 'subHide')) ? null : findChild(node, 'sub');
  const sup = readFlag(getProperty(node, 'naryPr', 'supHide')) ? null : findChild(node, 'sup');
  const base = operator(symbol, { largeop: 'true', movablelimits: 'false' });
  const subNode = sub ? convertArgument(sub, builder) : null;
  const supNode = sup ? convertArgument(sup, builder) : null;
  const underOver = limitLocation === 'undOvr';
  let head = base;
  if (subNode && supNode) head = create(underOver ? 'munderover' : 'msubsup', [base, subNode, supNode]);
  else if (subNode) head = create(underOver ? 'munder' : 'msub', [base, subNode]);
  else if (supNode) head = create(underOver ? 'mover' : 'msup', [base, supNode]);
  return [row([head, convertArgument(findChild(node, 'e'), builder)])];
}

function convertDelimiter(node, builder) {
  const { row, operator } = builder;
  const read = (name, fallback) => {
    const value = readVal(getProperty(node, 'dPr', name));
    return value === null ? fallback : value;
  };
  const open = read('begChr', '(');
  const close = read('endChr', ')');
  const separator = read('sepChr', '|');
  const parts = [];
  if (open) parts.push(operator(open, { fence: 'true', stretchy: 'true' }));
  findChildren(node, 'e').forEach((entry, index) => {
    if (index > 0 && separator) parts.push(operator(separator, { separator: 'true', stretchy: 'true' }));
    parts.push(convertArgument(entry, builder));
  });
  if (close) parts.push(operator(close, { fence: 'true', stretchy: 'true' }));
  return [row(parts)];
}

function convertMatrix(node, builder) {
  const { create } = builder;
  const rows = findChildren(node, 'mr').map((matrixRow) => create('mtr', findChildren(matrixRow, 'e')
    .map((cell) => create('mtd', [convertArgument(cell, builder)]))));
  return [create('mtable', rows)];
}

const HANDLERS = {
  r: (node, builder) => convertRun(node, builder),
  f(node, builder) {
    const { create, row, operator } = builder;
    const type = readVal(getProperty(node, 'fPr', 'type'));
    const numerator = convertArgument(findChild(node, 'num'), builder);
    const denominator = convertArgument(findChild(node, 'den'), builder);
    if (type === 'lin') return [row([numerator, operator('/'), denominator])];
    return [create('mfrac', [numerator, denominator], type === 'noBar' ? { linethickness: '0' } : {})];
  },
  sSup: (node, builder) => [builder.create('msup', [
    convertArgument(findChild(node, 'e'), builder), convertArgument(findChild(node, 'sup'), builder)
  ])],
  sSub: (node, builder) => [builder.create('msub', [
    convertArgument(findChild(node, 'e'), builder), convertArgument(findChild(node, 'sub'), builder)
  ])],
  sSubSup: (node, builder) => [builder.create('msubsup', [
    convertArgument(findChild(node, 'e'), builder),
    convertArgument(findChild(node, 'sub'), builder),
    convertArgument(findChild(node, 'sup'), builder)
  ])],
  sPre: (node, builder) => [builder.create('mmultiscripts', [
    convertArgument(findChild(node, 'e'), builder),
    builder.create('mprescripts'),
    convertArgument(findChild(node, 'sub'), builder),
    convertArgument(findChild(node, 'sup'), builder)
  ])],
  rad(node, builder) {
    const base = convertArgument(findChild(node, 'e'), builder);
    const degree = findChild(node, 'deg');
    const hidden = readFlag(getProperty(node, 'radPr', 'degHide'));
    if (hidden || !degree || !(degree.textContent || '').trim()) return [builder.create('msqrt', [base])];
    return [builder.create('mroot', [base, convertArgument(degree, builder)])];
  },
  nary: convertNary,
  d: convertDelimiter,
  m: convertMatrix,
  eqArr: (node, builder) => [builder.create('mtable', findChildren(node, 'e')
    .map((entry) => builder.create('mtr', [builder.create('mtd', [convertArgument(entry, builder)], { columnalign: 'left' })])))],
  acc(node, builder) {
    const mark = readVal(getProperty(node, 'accPr', 'chr')) || '\u0302';
    return [builder.create('mover', [
      convertArgument(findChild(node, 'e'), builder),
      builder.operator(SPACING_ACCENTS[mark] || mark, { stretchy: 'true' })
    ], { accent: 'true' })];
  },
  bar(node, builder) {
    const top = readVal(getProperty(node, 'barPr', 'pos')) === 'top';
    return [builder.create(top ? 'mover' : 'munder', [
      convertArgument(findChild(node, 'e'), builder),
      builder.operator(top ? '\u203E' : '_', { stretchy: 'true' })
    ], top ? { accent: 'true' } : { accentunder: 'true' })];
  },
  groupChr(node, builder) {
    const symbol = readVal(getProperty(node, 'groupChrPr', 'chr')) || '\u23DF';
    const top = readVal(getProperty(node, 'groupChrPr', 'pos')) === 'top';
    return [builder.create(top ? 'mover' : 'munder', [
      convertArgument(findChild(node, 'e'), builder),
      builder.operator(symbol, { stretchy: 'true' })
    ])];
  },
  limLow: (node, builder) => [builder.create('munder', [
    convertArgument(findChild(node, 'e'), builder), convertArgument(findChild(node, 'lim'), builder)
  ])],
  limUpp: (node, builder) => [builder.create('mover', [
    convertArgument(findChild(node, 'e'), builder), convertArgument(findChild(node, 'lim'), builder)
  ])],
  func: (node, builder) => [builder.row([
    convertArgument(findChild(node, 'fName'), builder),
    builder.operator('\u2061'),
    convertArgument(findChild(node, 'e'), builder)
  ])],
  borderBox: (node, builder) => [builder.create('menclose', [convertArgument(findChild(node, 'e'), builder)], { notation: 'box' })]
};

function convertNode(node, builder) {
  if (node.nodeType !== 1) return [];
  if (node.namespaceURI === WORD_NS) {
    // Ordinary Word runs inside an equation carry plain text.
    if (node.localName !== 'r') return [];
    const text = [...node.getElementsByTagNameNS(WORD_NS, 't')].map((item) => item.textContent || '').join('');
    return text ? [builder.create('mtext', [text])] : [];
  }
  if (node.namespaceURI !== OMML_NS || /Pr$/.test(node.localName)) return [];
  const handler = HANDLERS[node.localName];
  if (handler) return handler(node, builder);
  // Containers (e, num, box, phant, ...) and anything unknown keep their
  // content rather than silently dropping it.
  return convertNodes(elementChildren(node), builder);
}

/**
 * Builds a <math> element in `document` from an m:oMath or m:oMathPara.
 */
export function convertOmmlToMathml(node, { document, display = false } = {}) {
  const builder = createMathBuilder(document);
  const equations = isOmml(node, 'oMathPara') ? findChildren(node, 'oMath') : [node];
  const rows = equations.map((equation) => builder.row(convertNodes(elementChildren(equation), builder)));
  const content = rows.length > 1
    ? builder.create('mtable', rows.map((row) => builder.create('mtr', [builder.create('mtd', [row])])))
    : (rows[0] || builder.create('mrow'));
  return builder.create('math', [content], display ? { display: 'block' } : {});
}
