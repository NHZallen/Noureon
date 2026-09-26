// A small LaTeX math parser covering what chat models actually write:
// fractions, scripts, roots, n-ary operators, delimiters, functions, text and
// the common symbol set. It produces a neutral tree that document generators
// map to native equations (Word OMML) or to readable fallback text.

const SYMBOLS = Object.freeze({
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ',
  varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '⋅', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '∙',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅',
  propto: '∝', ll: '≪', gg: '≫', prec: '≺', succ: '≻', mid: '∣', perp: '⊥', parallel: '∥',
  infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬',
  land: '∧', wedge: '∧', lor: '∨', vee: '∨', oplus: '⊕', otimes: '⊗',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩',
  emptyset: '∅', varnothing: '∅', setminus: '∖',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
  Leftrightarrow: '⇔', iff: '⇔', implies: '⇒', mapsto: '↦', uparrow: '↑', downarrow: '↓',
  ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', ddots: '⋱', prime: '′', degree: '°', angle: '∠',
  triangle: '△', square: '□', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ',
  lbrace: '{', rbrace: '}', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  vert: '|', Vert: '‖', backslash: '\\', '%': '%', '$': '$', '#': '#', '&': '&', _: '_', '{': '{', '}': '}'
});

const SPACES = Object.freeze({ ',': ' ', ':': ' ', ';': ' ', '!': '', quad: '  ', qquad: '    ', ' ': ' ' });

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'gcd', 'deg', 'arg', 'ker', 'Pr'
]);

const NARY = Object.freeze({ sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂' });

const TEXT_COMMANDS = new Set(['text', 'textrm', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'mathbb', 'operatorname', 'boldsymbol', 'mbox']);

const ACCENTS = Object.freeze({ hat: '̂', bar: '̄', overline: '̅', vec: '⃗', dot: '̇', ddot: '̈', tilde: '̃', widehat: '̂', widetilde: '̃' });

const DELIMITERS = Object.freeze({
  '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '.': '', '\\{': '{', '\\}': '}', '\\lbrace': '{', '\\rbrace': '}',
  '\\langle': '⟨', '\\rangle': '⟩', '\\|': '‖', '\\lvert': '|', '\\rvert': '|', '\\lVert': '‖', '\\rVert': '‖',
  '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉'
});

const MATRIX_BRACKETS = Object.freeze({
  matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'],
  cases: ['{', ''], aligned: ['', ''], align: ['', ''], 'align*': ['', ''], array: ['', ''], smallmatrix: ['', ''], gathered: ['', '']
});

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      const word = /^\\([A-Za-z]+\*?)/.exec(source.slice(index));
      if (word) {
        tokens.push({ type: 'command', value: word[1] });
        index += word[0].length;
      } else {
        tokens.push({ type: 'command', value: source[index + 1] ?? '' });
        index += 2;
      }
    } else if (char === '{' || char === '}' || char === '^' || char === '_' || char === '&') {
      tokens.push({ type: char });
      index += 1;
    } else if (/\s/.test(char)) {
      // Spaces are insignificant in math mode but must survive inside 	ext{}.
      if (tokens.at(-1)?.type !== 'space') tokens.push({ type: 'space' });
      index += 1;
    } else {
      tokens.push({ type: 'char', value: char });
      index += 1;
    }
  }
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  skipSpaces() {
    while (this.tokens[this.position]?.type === 'space') this.position += 1;
  }

  peek() {
    this.skipSpaces();
    return this.tokens[this.position];
  }

  next() {
    this.skipSpaces();
    return this.tokens[this.position++];
  }

  parseSequence(stop = () => false) {
    const nodes = [];
    while (this.peek()) {
      const token = this.peek();
      if (token.type === '}' || stop(token)) break;
      const atom = this.parseAtom();
      if (!atom) continue;
      nodes.push(this.parseScripts(atom));
    }
    return mergeRuns(nodes);
  }

  parseGroup() {
    const token = this.peek();
    if (!token) return [];
    if (token.type === '{') {
      this.next();
      const nodes = this.parseSequence();
      if (this.peek()?.type === '}') this.next();
      return nodes;
    }
    const atom = this.parseAtom();
    return atom ? [atom] : [];
  }

  parseOptionalArgument() {
    if (this.peek()?.type === 'char' && this.peek().value === '[') {
      this.next();
      const nodes = this.parseSequence((token) => token.type === 'char' && token.value === ']');
      if (this.peek()?.value === ']') this.next();
      return nodes;
    }
    return null;
  }

  readRawGroup() {
    if (this.peek()?.type !== '{') return '';
    this.next();
    let depth = 1;
    let text = '';
    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position++];
      if (token.type === 'space') {
        text += ' ';
        continue;
      }
      if (token.type === '{') depth += 1;
      if (token.type === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      text += token.type === 'char' ? token.value : token.type === 'command' ? (SYMBOLS[token.value] ?? SPACES[token.value] ?? token.value) : ['{', '}'].includes(token.type) ? '' : token.type;
    }
    return text;
  }

  parseScripts(base) {
    let sub = null;
    let sup = null;
    while (this.peek() && (this.peek().type === '^' || this.peek().type === '_')) {
      const kind = this.next().type;
      const value = this.parseGroup();
      if (kind === '^') sup = value;
      else sub = value;
    }
    if (base.type === 'nary') return { ...base, sub: sub || base.sub, sup: sup || base.sup, body: this.parseNaryBody() };
    if (sub && sup) return { type: 'subsup', base: [base], sub, sup };
    if (sup) return { type: 'sup', base: [base], sup };
    if (sub) return { type: 'sub', base: [base], sub };
    return base;
  }

  parseNaryBody() {
    // The operand of \sum or \int is the next atom (with its scripts).
    const token = this.peek();
    if (!token || token.type === '}' || token.type === '&' || (token.type === 'command' && token.value === '\\')) return [];
    const atom = this.parseAtom();
    return atom ? [this.parseScripts(atom)] : [];
  }

  parseDelimiter() {
    const token = this.next();
    if (!token) return '';
    const key = token.type === 'command' ? `\\${token.value}` : token.value;
    return DELIMITERS[key] ?? key ?? '';
  }

  parseEnvironment(name) {
    const [open, close] = MATRIX_BRACKETS[name] || ['', ''];
    if (name === 'array') this.readRawGroup();
    const rows = [[[]]];
    while (this.peek()) {
      const token = this.peek();
      if (token.type === 'command' && token.value === 'end') {
        this.next();
        this.readRawGroup();
        break;
      }
      if (token.type === '&') {
        this.next();
        rows.at(-1).push([]);
        continue;
      }
      if (token.type === 'command' && token.value === '\\') {
        this.next();
        rows.push([[]]);
        continue;
      }
      const cells = rows.at(-1);
      const atom = this.parseAtom();
      if (atom) cells[cells.length - 1].push(this.parseScripts(atom));
    }
    const cleanRows = rows
      .map((cells) => cells.map((cell) => mergeRuns(cell)))
      .filter((cells) => cells.some((cell) => cell.length > 0));
    return { type: 'matrix', open, close, rows: cleanRows };
  }

  parseAtom() {
    const token = this.next();
    if (!token) return null;
    if (token.type === 'char') return { type: 'run', text: token.value };
    if (token.type === '{') {
      const nodes = this.parseSequence();
      if (this.peek()?.type === '}') this.next();
      return nodes.length === 1 ? nodes[0] : { type: 'group', children: nodes };
    }
    if (token.type === '^' || token.type === '_') {
      // A script with no base ("^2") attaches to an empty run.
      this.position -= 1;
      return { type: 'run', text: '' };
    }
    if (token.type === '&') return { type: 'run', text: ' ' };
    if (token.type !== 'command') return null;

    const name = token.value;
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      return { type: 'frac', num: this.parseGroup(), den: this.parseGroup() };
    }
    if (name === 'binom' || name === 'dbinom' || name === 'tbinom') {
      return { type: 'brackets', open: '(', close: ')', children: [{ type: 'frac', num: this.parseGroup(), den: this.parseGroup(), noBar: true }] };
    }
    if (name === 'sqrt') {
      const degree = this.parseOptionalArgument();
      return { type: 'sqrt', degree, body: this.parseGroup() };
    }
    if (NARY[name]) return { type: 'nary', op: NARY[name], kind: name, sub: null, sup: null, body: [] };
    if (name === 'left') {
      const open = this.parseDelimiter();
      const children = this.parseSequence((next) => next.type === 'command' && next.value === 'right');
      if (this.peek()?.value === 'right') this.next();
      const close = this.parseDelimiter();
      return { type: 'brackets', open, close, children };
    }
    if (name === 'right') return null;
    if (name === 'begin') return this.parseEnvironment(this.readRawGroup());
    if (TEXT_COMMANDS.has(name)) {
      return { type: 'run', text: this.readRawGroup(), plain: name !== 'mathbf' && name !== 'boldsymbol' && name !== 'textbf' ? true : undefined, bold: name === 'mathbf' || name === 'boldsymbol' || name === 'textbf' ? true : undefined };
    }
    if (ACCENTS[name]) {
      const body = this.parseGroup();
      return { type: 'accent', mark: ACCENTS[name], body };
    }
    if (FUNCTIONS.has(name)) {
      if (name === 'lim' && this.peek()?.type === '_') {
        this.next();
        return { type: 'limit', name, below: this.parseGroup() };
      }
      return { type: 'function', name };
    }
    if (name === 'mathrm' || name === 'rm') return { type: 'run', text: this.readRawGroup(), plain: true };
    if (/^(?:displaystyle|textstyle|scriptstyle|limits|nolimits|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr|left\.|right\.)$/.test(name)) return null;
    if (SPACES[name] !== undefined) return { type: 'run', text: SPACES[name] };
    if (name === '\\') return { type: 'run', text: ' ' };
    if (SYMBOLS[name] !== undefined) return { type: 'run', text: SYMBOLS[name] };
    return { type: 'run', text: name, plain: true };
  }
}

function mergeRuns(nodes) {
  const merged = [];
  nodes.forEach((node) => {
    const previous = merged.at(-1);
    if (node.type === 'run' && previous?.type === 'run' && Boolean(previous.plain) === Boolean(node.plain) && Boolean(previous.bold) === Boolean(node.bold)) {
      previous.text += node.text;
    } else if (!(node.type === 'run' && node.text === '' && !node.keep)) {
      merged.push(node.type === 'run' ? { ...node } : node);
    }
  });
  return merged;
}

export function parseLatexMath(latex = '') {
  const source = String(latex || '').replace(/\\(?:label|tag)\{[^}]*\}/g, '');
  try {
    return new Parser(tokenize(source)).parseSequence();
  } catch {
    return [{ type: 'run', text: source, plain: true }];
  }
}

const SUPERSCRIPT_DIGITS = Object.freeze({ 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ' });
const SUBSCRIPT_DIGITS = Object.freeze({ 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' });

const toScript = (text, table, marker) => (
  [...text].every((char) => table[char]) ? [...text].map((char) => table[char]).join('') : `${marker}(${text})`
);

/**
 * Linear Unicode rendering used where native equations are unavailable, such
 * as the preview or the plain-text fallback of a chart caption.
 */
export function mathToLinearText(nodes = []) {
  const wrap = (text) => (text.length > 1 ? `(${text})` : text);
  return nodes.map((node) => {
    switch (node.type) {
      case 'run': return node.text;
      case 'group': return mathToLinearText(node.children);
      case 'frac': return `${wrap(mathToLinearText(node.num))}/${wrap(mathToLinearText(node.den))}`;
      case 'sqrt': return `${node.degree ? toScript(mathToLinearText(node.degree), SUPERSCRIPT_DIGITS, '^') : ''}√${wrap(mathToLinearText(node.body))}`;
      case 'sup': return `${mathToLinearText(node.base)}${toScript(mathToLinearText(node.sup), SUPERSCRIPT_DIGITS, '^')}`;
      case 'sub': return `${mathToLinearText(node.base)}${toScript(mathToLinearText(node.sub), SUBSCRIPT_DIGITS, '_')}`;
      case 'subsup': return `${mathToLinearText(node.base)}${toScript(mathToLinearText(node.sub), SUBSCRIPT_DIGITS, '_')}${toScript(mathToLinearText(node.sup), SUPERSCRIPT_DIGITS, '^')}`;
      case 'nary': return `${node.op}${node.sub ? toScript(mathToLinearText(node.sub), SUBSCRIPT_DIGITS, '_') : ''}${node.sup ? toScript(mathToLinearText(node.sup), SUPERSCRIPT_DIGITS, '^') : ''} ${mathToLinearText(node.body)}`;
      case 'brackets': return `${node.open}${mathToLinearText(node.children)}${node.close}`;
      case 'function': return `${node.name} `;
      case 'limit': return `lim_(${mathToLinearText(node.below)}) `;
      case 'accent': return `${mathToLinearText(node.body)}${node.mark}`;
      case 'matrix': return `${node.open}${node.rows.map((row) => row.map((cell) => mathToLinearText(cell)).join(', ')).join('; ')}${node.close}`;
      default: return '';
    }
  }).join('');
}
