// Maps the neutral LaTeX math tree to Office Math Markup (OMML) so equations
// arrive in Word as native, editable equations. docx's own Math classes cover
// only part of OMML (no plain-style runs, matrices, accents or custom n-ary
// operators), so the elements are emitted directly.

import { XmlComponent } from 'docx';
import { parseLatexMath } from './latex-math.js';

class OmmlElement extends XmlComponent {
  constructor(name, children = [], attributes = null) {
    super(name);
    if (attributes) this.root.push({ _attr: attributes });
    children.forEach((child) => {
      if (child !== null && child !== undefined) this.root.push(child);
    });
  }
}

const el = (name, children, attributes) => new OmmlElement(name, children, attributes);
const val = (name, value) => el(name, [], { 'm:val': value });

function run(text, style = null) {
  const properties = style ? [el('m:rPr', [val('m:sty', style)])] : [];
  return el('m:r', [...properties, el('m:t', [text], { 'xml:space': 'preserve' })]);
}

const argument = (name, nodes) => el(name, convertNodes(nodes || []));

const DELIMITER_DEFAULTS = { open: '(', close: ')' };

function delimiter(open, close, children) {
  const properties = [];
  if (open !== DELIMITER_DEFAULTS.open) properties.push(val('m:begChr', open));
  if (close !== DELIMITER_DEFAULTS.close) properties.push(val('m:endChr', close));
  return el('m:d', [properties.length ? el('m:dPr', properties) : null, el('m:e', children)]);
}

function convertNode(node) {
  switch (node.type) {
    case 'run':
      if (!node.text) return [];
      return [run(node.text, node.bold ? 'b' : node.plain ? 'p' : null)];
    case 'group':
      return convertNodes(node.children);
    case 'frac':
      return [el('m:f', [
        node.noBar ? el('m:fPr', [val('m:type', 'noBar')]) : null,
        argument('m:num', node.num),
        argument('m:den', node.den)
      ])];
    case 'sup':
      return [el('m:sSup', [argument('m:e', node.base), argument('m:sup', node.sup)])];
    case 'sub':
      return [el('m:sSub', [argument('m:e', node.base), argument('m:sub', node.sub)])];
    case 'subsup':
      return [el('m:sSubSup', [argument('m:e', node.base), argument('m:sub', node.sub), argument('m:sup', node.sup)])];
    case 'sqrt':
      return [el('m:rad', [
        node.degree?.length ? null : el('m:radPr', [val('m:degHide', '1')]),
        argument('m:deg', node.degree || []),
        argument('m:e', node.body)
      ])];
    case 'nary': {
      const isIntegral = /int$/.test(node.kind);
      const properties = [
        val('m:chr', node.op),
        val('m:limLoc', isIntegral ? 'subSup' : 'undOvr'),
        node.sub?.length ? null : val('m:subHide', '1'),
        node.sup?.length ? null : val('m:supHide', '1')
      ];
      return [el('m:nary', [
        el('m:naryPr', properties),
        argument('m:sub', node.sub || []),
        argument('m:sup', node.sup || []),
        argument('m:e', node.body || [])
      ])];
    }
    case 'brackets':
      return [delimiter(node.open, node.close, convertNodes(node.children))];
    case 'function':
      // Function names are upright; the thin space keeps "sin x" from fusing.
      return [run(`${node.name} `, 'p')];
    case 'limit':
      return [el('m:limLow', [el('m:e', [run(node.name, 'p')]), argument('m:lim', node.below)])];
    case 'accent':
      if (node.mark === '̅') {
        return [el('m:bar', [el('m:barPr', [val('m:pos', 'top')]), argument('m:e', node.body)])];
      }
      return [el('m:acc', [el('m:accPr', [val('m:chr', node.mark)]), argument('m:e', node.body)])];
    case 'matrix': {
      // Word lays a matrix out in a single row unless the column count is
      // declared, so every row is padded to the widest one.
      const columns = Math.max(1, ...node.rows.map((row) => row.length));
      const properties = el('m:mPr', [el('m:mcs', [el('m:mc', [el('m:mcPr', [
        val('m:count', String(columns)),
        val('m:mcJc', node.open === '{' && !node.close ? 'left' : 'center')
      ])])])]);
      const rows = node.rows.map((row) => el('m:mr', Array.from({ length: columns }, (_, index) => argument('m:e', row[index] || []))));
      const matrix = el('m:m', [properties, ...rows]);
      if (!node.open && !node.close) return [matrix];
      return [delimiter(node.open, node.close, [matrix])];
    }
    default:
      return [];
  }
}

function convertNodes(nodes) {
  return nodes.flatMap((node) => convertNode(node));
}

export function createInlineEquation(latex) {
  return el('m:oMath', convertNodes(parseLatexMath(latex)));
}

export function createDisplayEquation(latex) {
  return el('m:oMathPara', [createInlineEquation(latex)]);
}
