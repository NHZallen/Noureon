// Inline LaTeX as text runs, for formulas inside a line of a PDF (pdfmake
// cannot place a picture inside a line): Greek letters and operators become
// their Unicode characters, ^ and _ become superscript and subscript runs,
// \frac becomes a slash and \sqrt a radical sign. Letters are italic, as in
// typeset mathematics. Display formulas are typeset properly (pdf-math.js).

const SYMBOLS = Object.freeze({
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
  sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '•',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝',
  ll: '≪', gg: '≫', infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫', oint: '∮', iint: '∬',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅',
  forall: '∀', exists: '∃', neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨', oplus: '⊕', otimes: '⊗',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⇒', iff: '⇔', mapsto: '↦',
  uparrow: '↑', downarrow: '↓', angle: '∠', perp: '⊥', parallel: '∥', degree: '°', prime: '′', ldots: '…', cdots: '⋯', dots: '…',
  hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', therefore: '∴', because: '∵', mid: '∣', vert: '|', Vert: '‖',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', lbrace: '{', rbrace: '}', backslash: '\\',
  percent: '%', '%': '%', '$': '$', '&': '&', '#': '#', _: '_', '{': '{', '}': '}'
});
const SPACES = Object.freeze({ ',': ' ', ':': ' ', ';': ' ', '!': '', ' ': ' ', quad: ' ', qquad: '  ', enspace: ' ', thinspace: ' ' });
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'gcd', 'deg', 'arg', 'Pr', 'mod']);
const UPRIGHT = new Set(['text', 'mathrm', 'textrm', 'operatorname', 'mbox', 'textup', 'mathsf', 'textsf', 'mathtt', 'texttt']);
const BOLD = new Set(['mathbf', 'textbf', 'boldsymbol', 'bm']);
const IGNORED = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'displaystyle', 'textstyle', 'limits', 'nolimits', 'mathit', 'mathcal', 'mathbb', 'mathfrak']);

/** Reads one argument: a {group}, a \command or a single character. */
function readArgument(source, index) {
  let position = index;
  while (source[position] === ' ') position += 1;
  if (source[position] === '{') {
    let depth = 0;
    for (let end = position; end < source.length; end += 1) {
      if (source[end] === '\\') { end += 1; continue; }
      if (source[end] === '{') depth += 1;
      if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) return { text: source.slice(position + 1, end), end: end + 1 };
      }
    }
    return { text: source.slice(position + 1), end: source.length };
  }
  if (source[position] === '\\') {
    const command = /^\\([A-Za-z]+|.)/.exec(source.slice(position));
    return { text: command[0], end: position + command[0].length };
  }
  return { text: source[position] ?? '', end: position + 1 };
}

// Parenthesised when a fraction's part is more than one symbol.
const wrap = (runs) => {
  const text = runs.map((run) => run.text).join('');
  return [...text.trim()].length > 1 && !/^\(.*\)$/.test(text.trim()) ? [{ text: '(' }, ...runs, { text: ')' }] : runs;
};

function parse(source, style = {}) {
  const runs = [];
  const push = (text, extra = {}) => { if (text) runs.push({ text, ...style, ...extra }); };
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (char === '\\') {
      const match = /^\\([A-Za-z]+|.)/.exec(source.slice(index));
      const name = match ? match[1] : '';
      index += match ? match[0].length : 1;
      if (SPACES[name] !== undefined) push(SPACES[name]);
      else if (SYMBOLS[name]) push(SYMBOLS[name]);
      else if (FUNCTIONS.has(name)) push(name, { italic: false });
      else if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const numerator = readArgument(source, index);
        const denominator = readArgument(source, numerator.end);
        index = denominator.end;
        runs.push(...wrap(parse(numerator.text, style)), { text: '/', ...style, italic: false }, ...wrap(parse(denominator.text, style)));
      } else if (name === 'sqrt') {
        let degree = null;
        if (source[index] === '[') {
          const close = source.indexOf(']', index);
          degree = source.slice(index + 1, close);
          index = close + 1;
        }
        const argument = readArgument(source, index);
        index = argument.end;
        if (degree) runs.push(...parse(degree, { ...style, superscript: true }));
        push('√', { italic: false });
        runs.push(...wrap(parse(argument.text, style)));
      } else if (UPRIGHT.has(name) || BOLD.has(name) || IGNORED.has(name)) {
        if (IGNORED.has(name) && !['mathit', 'mathcal', 'mathbb', 'mathfrak'].includes(name)) continue;
        const argument = readArgument(source, index);
        index = argument.end;
        const inner = UPRIGHT.has(name) ? { italic: false, upright: true } : BOLD.has(name) ? { bold: true } : {};
        runs.push(...parse(argument.text, { ...style, ...inner }));
      } else {
        push(name);
      }
      continue;
    }
    if (char === '^' || char === '_') {
      const argument = readArgument(source, index + 1);
      index = argument.end;
      const position = char === '^' ? { superscript: true } : { subscript: true };
      runs.push(...parse(argument.text, { ...style, ...position }));
      continue;
    }
    if (char === '{' || char === '}') {
      index += 1;
      continue;
    }
    if (char === '~') {
      push(' ');
      index += 1;
      continue;
    }
    // Letters are italic in formulas; digits, operators and text are not.
    // A hyphen between terms is a minus sign.
    if (char === '-' && !style.upright) {
      push('−', { italic: false });
      index += 1;
      continue;
    }
    push(char, { italic: !style.upright && /[A-Za-z]/.test(char) ? style.italic !== false : false });
    index += 1;
  }
  return runs;
}

/**
 * Runs for an inline formula: [{ text, italic, bold, superscript, subscript }],
 * with neighbours of the same style merged.
 */
export function latexToInlineRuns(latex) {
  const runs = parse(String(latex ?? '').replace(/\s+/g, ' ').trim());
  const merged = [];
  for (const run of runs) {
    const previous = merged.at(-1);
    const same = previous && ['italic', 'bold', 'superscript', 'subscript'].every((key) => Boolean(previous[key]) === Boolean(run[key]));
    if (same) previous.text += run.text;
    else merged.push({ text: run.text, italic: Boolean(run.italic), bold: Boolean(run.bold), superscript: Boolean(run.superscript), subscript: Boolean(run.subscript) });
  }
  // Spaces the formula did not ask for are dropped, as TeX does.
  return merged.map((run) => ({ ...run, text: run.text.replace(/ {2,}/g, ' ') })).filter((run) => run.text);
}
