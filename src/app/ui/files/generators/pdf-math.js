// Display formulas for PDFs: MathJax typesets the LaTeX as SVG in which every
// glyph is a path, so the formula needs no font and looks the same in every
// reader. Loaded only for documents with display formulas.

import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';

// MathJax measures in ex; with em = 16 and ex = 8 px, one ex is half an em.
const EM = 16;
const EX = 8;

let converter = null;

function createConverter() {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const input = new TeX({ packages: ['base', 'ams', 'newcommand', 'noundefined', 'boldsymbol', 'cancel'] });
  const output = new SVG({ fontCache: 'none' });
  return { adaptor, document: mathjax.document('', { InputJax: input, OutputJax: output }) };
}

const exToEm = (value) => (Number.parseFloat(value) || 0) * (EX / EM);

/**
 * Typesets `latex` as a display formula. Returns { svg, width, height,
 * depth } with sizes in em, or null when the LaTeX has errors (the caller
 * then shows its source).
 */
export function latexToSvg(latex, { color = '#000000', display = true } = {}) {
  converter ||= createConverter();
  const { adaptor, document } = converter;
  const container = document.convert(String(latex ?? ''), { display, em: EM, ex: EX, containerWidth: 80 * EM });
  const svgNode = adaptor.firstChild(container);
  if (!svgNode) return null;
  const markup = adaptor.outerHTML(svgNode);
  // Parse errors and undefined commands (drawn in red) show the source instead.
  if (/data-mjx-error|data-mml-node="merror"|(?:fill|stroke|color)="red"/.test(markup)) return null;
  const width = exToEm(adaptor.getAttribute(svgNode, 'width'));
  const height = exToEm(adaptor.getAttribute(svgNode, 'height'));
  const align = /vertical-align:\s*(-?[\d.]+)ex/.exec(adaptor.getAttribute(svgNode, 'style') || '');
  if (!width || !height) return null;
  const svg = markup
    .replace(/currentColor/g, color)
    // Explicit sizes in points replace the ex sizes, which PDF renderers
    // cannot resolve.
    .replace(/\swidth="[^"]*"/, ` width="${width * EM}"`)
    .replace(/\sheight="[^"]*"/, ` height="${height * EM}"`)
    .replace(/\sstyle="[^"]*"/, '');
  return { svg, width, height, depth: align ? -exToEm(align[1]) : 0 };
}
