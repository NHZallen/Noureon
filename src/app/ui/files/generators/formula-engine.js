// A small formula evaluator for the sheet preview and for the cached results
// written into the file. Excel recalculates on open (fullCalcOnLoad); the
// cached values matter for viewers that do not calculate (iOS Quick Look,
// mail previews). Anything it does not know throws Unsupported, and that
// cell is then written without a cached value.

import { parseCellAddress } from './spreadsheet-spec.js';

export class Unsupported extends Error {}
const error = (code) => ({ error: code });
const isError = (value) => Boolean(value && typeof value === 'object' && 'error' in value);

// ------------------------------------------------------------ tokens

const TOKEN = /\s+|("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[A-Za-z_À-￿][\w.À-￿]*)!)?(\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3})(?![\w(])|(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_][\w.]*)\s*(?=\()|(TRUE|FALSE)\b|(<>|<=|>=|[-+*/^&=<>%(),;])/iy;

function tokenize(formula) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < formula.length) {
    const start = TOKEN.lastIndex;
    const match = TOKEN.exec(formula);
    if (!match || TOKEN.lastIndex === start) throw new Unsupported(`cannot read "${formula.slice(start, start + 12)}"`);
    const [, string, sheet, reference, number, name, bool, operator] = match;
    if (string !== undefined) tokens.push({ type: 'string', value: string.slice(1, -1).replace(/""/g, '"') });
    else if (reference !== undefined) tokens.push({ type: 'ref', sheet: sheet ? sheet.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : null, value: reference.replace(/\$/g, '').toUpperCase() });
    else if (number !== undefined) tokens.push({ type: 'number', value: Number(number) });
    else if (name !== undefined) tokens.push({ type: 'function', value: name.toUpperCase() });
    else if (bool !== undefined) tokens.push({ type: 'boolean', value: bool.toUpperCase() === 'TRUE' });
    else if (operator !== undefined) tokens.push({ type: 'op', value: operator === ';' ? ',' : operator });
  }
  return tokens;
}

// ------------------------------------------------------------ parser

function parse(formula) {
  const tokens = tokenize(formula);
  let position = 0;
  const peek = () => tokens[position];
  const take = (value) => {
    const token = tokens[position];
    if (value !== undefined && !(token?.type === 'op' && token.value === value)) throw new Unsupported(`expected ${value}`);
    position += 1;
    return token;
  };
  const isOp = (...values) => peek()?.type === 'op' && values.includes(peek().value);

  const binary = (next, operators) => () => {
    let left = next();
    while (isOp(...operators)) {
      const operator = take().value;
      left = { type: 'binary', operator, left, right: next() };
    }
    return left;
  };
  function primary() {
    const token = take();
    if (!token) throw new Unsupported('unexpected end');
    if (token.type === 'number' || token.type === 'string' || token.type === 'boolean') return { type: 'value', value: token.value };
    if (token.type === 'ref') return { type: 'ref', sheet: token.sheet, ref: token.value };
    if (token.type === 'function') {
      take('(');
      const args = [];
      if (!isOp(')')) {
        do {
          if (isOp(',', ')')) args.push({ type: 'value', value: null });
          else args.push(comparison());
        } while (isOp(',') && take());
      }
      take(')');
      return { type: 'call', name: token.value, args };
    }
    if (token.type === 'op' && token.value === '(') {
      const inner = comparison();
      take(')');
      return inner;
    }
    throw new Unsupported(`unexpected ${token.value}`);
  }
  function postfix() {
    let node = primary();
    while (isOp('%')) { take(); node = { type: 'percent', node }; }
    return node;
  }
  function unary() {
    if (isOp('-', '+')) {
      const operator = take().value;
      return { type: 'unary', operator, node: unary() };
    }
    return postfix();
  }
  const power = binary(unary, ['^']);
  const product = binary(power, ['*', '/']);
  const sum = binary(product, ['+', '-']);
  const concat = binary(sum, ['&']);
  const comparison = binary(concat, ['=', '<>', '<', '>', '<=', '>=']);
  const tree = comparison();
  if (position < tokens.length) throw new Unsupported('trailing input');
  return tree;
}

// ------------------------------------------------------------ values

function toNumber(value) {
  if (isError(value)) throw value;
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime() / 86400000 + 25569;
  const number = Number(String(value).trim());
  if (String(value).trim() !== '' && Number.isFinite(number)) return number;
  throw error('#VALUE!');
}
const toText = (value) => {
  if (isError(value)) throw value;
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(Math.round(value * 1e10) / 1e10);
  return String(value);
};
const toBoolean = (value) => {
  if (isError(value)) throw value;
  if (typeof value === 'string') {
    if (/^true$/i.test(value)) return true;
    if (/^false$/i.test(value)) return false;
    throw error('#VALUE!');
  }
  return Boolean(toNumber(value));
};
const flatten = (value) => (Array.isArray(value) ? value.flat(Infinity) : [value]);
// Aggregates skip text and blanks inside ranges, as Excel does.
const numbersIn = (args) => args.flatMap((arg) => (Array.isArray(arg)
  ? flatten(arg).filter((value) => { if (isError(value)) throw value; return typeof value === 'number'; })
  : [toNumber(arg)]));

function criterion(raw) {
  const text = toText(raw);
  const match = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text);
  const operator = match[1] || '=';
  const operand = match[2];
  const number = operand.trim() !== '' && Number.isFinite(Number(operand)) ? Number(operand) : null;
  const pattern = new RegExp(`^${operand.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  return (value) => {
    if (number !== null && typeof value === 'number') {
      return { '=': value === number, '<>': value !== number, '<': value < number, '>': value > number, '<=': value <= number, '>=': value >= number }[operator];
    }
    const textValue = value == null ? '' : String(value);
    if (operator === '=') return pattern.test(textValue);
    if (operator === '<>') return !pattern.test(textValue);
    return false;
  };
}

const round = (value, digits, mode) => {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const rounded = mode === 'up' ? Math.sign(scaled) * Math.ceil(Math.abs(scaled) - 1e-9)
    : mode === 'down' ? Math.sign(scaled) * Math.floor(Math.abs(scaled) + 1e-9)
      : Math.sign(scaled) * Math.round(Math.abs(scaled) + 1e-9);
  return rounded / factor;
};

const FUNCTIONS = {
  SUM: (args) => numbersIn(args).reduce((sum, value) => sum + value, 0),
  AVERAGE: (args) => { const values = numbersIn(args); if (!values.length) throw error('#DIV/0!'); return values.reduce((sum, value) => sum + value, 0) / values.length; },
  MIN: (args) => { const values = numbersIn(args); return values.length ? Math.min(...values) : 0; },
  MAX: (args) => { const values = numbersIn(args); return values.length ? Math.max(...values) : 0; },
  COUNT: (args) => args.flatMap(flatten).filter((value) => typeof value === 'number').length,
  COUNTA: (args) => args.flatMap(flatten).filter((value) => value != null && value !== '').length,
  COUNTBLANK: (args) => args.flatMap(flatten).filter((value) => value == null || value === '').length,
  PRODUCT: (args) => numbersIn(args).reduce((product, value) => product * value, 1),
  MEDIAN: (args) => {
    const values = numbersIn(args).sort((a, b) => a - b);
    if (!values.length) throw error('#NUM!');
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  },
  ROUND: ([value, digits]) => round(toNumber(value), toNumber(digits ?? 0), 'nearest'),
  ROUNDUP: ([value, digits]) => round(toNumber(value), toNumber(digits ?? 0), 'up'),
  ROUNDDOWN: ([value, digits]) => round(toNumber(value), toNumber(digits ?? 0), 'down'),
  INT: ([value]) => Math.floor(toNumber(value)),
  ABS: ([value]) => Math.abs(toNumber(value)),
  SQRT: ([value]) => { const number = toNumber(value); if (number < 0) throw error('#NUM!'); return Math.sqrt(number); },
  POWER: ([base, exponent]) => toNumber(base) ** toNumber(exponent),
  MOD: ([value, divisor]) => { const d = toNumber(divisor); if (d === 0) throw error('#DIV/0!'); const n = toNumber(value); return n - d * Math.floor(n / d); },
  IF: ([condition, whenTrue, whenFalse]) => (toBoolean(condition) ? whenTrue ?? true : whenFalse ?? false),
  IFERROR: ([value, fallback]) => (isError(value) ? fallback : value),
  AND: (args) => args.flatMap(flatten).filter((value) => value != null && value !== '').every(toBoolean),
  OR: (args) => args.flatMap(flatten).filter((value) => value != null && value !== '').some(toBoolean),
  NOT: ([value]) => !toBoolean(value),
  SUMIF: ([range, test, sumRange]) => {
    const matches = criterion(test);
    const cells = flatten(range);
    const sums = sumRange ? flatten(sumRange) : cells;
    return cells.reduce((sum, value, index) => (matches(value) && typeof sums[index] === 'number' ? sum + sums[index] : sum), 0);
  },
  COUNTIF: ([range, test]) => { const matches = criterion(test); return flatten(range).filter(matches).length; },
  AVERAGEIF: ([range, test, averageRange]) => {
    const matches = criterion(test);
    const cells = flatten(range);
    const values = averageRange ? flatten(averageRange) : cells;
    const picked = cells.map((value, index) => (matches(value) ? values[index] : null)).filter((value) => typeof value === 'number');
    if (!picked.length) throw error('#DIV/0!');
    return picked.reduce((sum, value) => sum + value, 0) / picked.length;
  },
  SUMPRODUCT: (args) => {
    const arrays = args.map(flatten);
    if (arrays.some((array) => array.length !== arrays[0].length)) throw error('#VALUE!');
    return arrays[0].reduce((sum, _, index) => sum + arrays.reduce((product, array) => product * (typeof array[index] === 'number' ? array[index] : 0), 1), 0);
  },
  CONCAT: (args) => args.flatMap(flatten).map(toText).join(''),
  CONCATENATE: (args) => args.map(toText).join(''),
  LEN: ([value]) => [...toText(value)].length,
  UPPER: ([value]) => toText(value).toUpperCase(),
  LOWER: ([value]) => toText(value).toLowerCase(),
  TRIM: ([value]) => toText(value).trim().replace(/ +/g, ' '),
  LEFT: ([value, count]) => [...toText(value)].slice(0, toNumber(count ?? 1)).join(''),
  RIGHT: ([value, count]) => { const chars = [...toText(value)]; const n = toNumber(count ?? 1); return n ? chars.slice(-n).join('') : ''; },
  MID: ([value, start, count]) => [...toText(value)].slice(toNumber(start) - 1, toNumber(start) - 1 + toNumber(count)).join(''),
  VLOOKUP: ([key, table, column, approximate]) => {
    if (!Array.isArray(table)) throw error('#VALUE!');
    const index = toNumber(column) - 1;
    if (approximate !== undefined && approximate !== null && toBoolean(approximate)) throw new Unsupported('approximate VLOOKUP');
    const row = table.find((entry) => String(entry[0] ?? '').toLowerCase() === String(key ?? '').toLowerCase() || entry[0] === key);
    if (!row) throw error('#N/A');
    if (index < 0 || index >= row.length) throw error('#REF!');
    return row[index];
  },
  INDEX: ([table, row, column]) => {
    const rows = Array.isArray(table) ? table : [[table]];
    const r = toNumber(row ?? 1) - 1;
    const c = column === undefined || column === null ? 0 : toNumber(column) - 1;
    const picked = rows.length === 1 && column === undefined ? rows[0]?.[r] : rows[r]?.[c];
    if (picked === undefined) throw error('#REF!');
    return picked;
  },
  MATCH: ([key, range, type]) => {
    if (type !== undefined && type !== null && toNumber(type) !== 0) throw new Unsupported('approximate MATCH');
    const index = flatten(range).findIndex((value) => value === key || String(value ?? '').toLowerCase() === String(key ?? '').toLowerCase());
    if (index < 0) throw error('#N/A');
    return index + 1;
  }
};
// Functions that take the arguments' errors themselves.
const ERROR_AWARE = new Set(['IFERROR']);

// ------------------------------------------------------------ workbook

/**
 * Evaluates every formula of a normalised workbook. Returns a Map from
 * "sheet index:row:column" (row 0 is the header row) to the result:
 * a number, string, boolean, { error }, or undefined when unsupported.
 */
export function evaluateWorkbook(workbook) {
  const results = new Map();
  const byName = new Map(workbook.sheets.map((sheet, index) => [sheet.name.toLowerCase(), index]));
  const visiting = new Set();
  const cellAt = (sheetIndex, row, column) => {
    const sheet = workbook.sheets[sheetIndex];
    if (!sheet) throw error('#REF!');
    if (row === 0) return sheet.columns[column]?.header || null;
    const cell = sheet.rows[row - 1]?.[column];
    if (!cell || cell.type === 'empty') return null;
    if (cell.type === 'formula') return valueOf(sheetIndex, row, column);
    return cell.value;
  };
  const rangeOf = (sheetIndex, reference) => {
    const sheet = workbook.sheets[sheetIndex];
    const [fromText, toText] = reference.split(':');
    let from = parseCellAddress(fromText);
    let to = parseCellAddress(toText || fromText);
    if (!from || !to) {
      // Whole columns (A:A) cover the rows the sheet has.
      const column = (text) => [...text].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
      from = { row: 0, column: column(fromText) };
      to = { row: sheet.rows.length, column: column(toText) };
    }
    const rows = [];
    for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row += 1) {
      const values = [];
      for (let column = Math.min(from.column, to.column); column <= Math.max(from.column, to.column); column += 1) values.push(cellAt(sheetIndex, row, column));
      rows.push(values);
    }
    return rows;
  };
  function evaluate(node, sheetIndex) {
    switch (node.type) {
      case 'value': return node.value;
      case 'ref': {
        const target = node.sheet ? byName.get(node.sheet.toLowerCase()) : sheetIndex;
        if (target === undefined) throw error('#REF!');
        if (node.ref.includes(':')) return rangeOf(target, node.ref);
        const cell = parseCellAddress(node.ref);
        return cellAt(target, cell.row, cell.column);
      }
      case 'percent': return toNumber(single(evaluate(node.node, sheetIndex))) / 100;
      case 'unary': { const value = toNumber(single(evaluate(node.node, sheetIndex))); return node.operator === '-' ? -value : value; }
      case 'binary': {
        const left = single(evaluate(node.left, sheetIndex));
        const right = single(evaluate(node.right, sheetIndex));
        if (node.operator === '&') return toText(left) + toText(right);
        if (['=', '<>', '<', '>', '<=', '>='].includes(node.operator)) {
          if (isError(left)) throw left;
          if (isError(right)) throw right;
          const numeric = typeof left === 'number' && typeof right === 'number';
          const a = numeric ? left : String(left ?? '').toLowerCase();
          const b = numeric ? right : String(right ?? '').toLowerCase();
          return { '=': a === b, '<>': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[node.operator];
        }
        const a = toNumber(left);
        const b = toNumber(right);
        if (node.operator === '/' && b === 0) throw error('#DIV/0!');
        return { '+': a + b, '-': a - b, '*': a * b, '/': a / b, '^': a ** b }[node.operator];
      }
      case 'call': {
        const implementation = FUNCTIONS[node.name];
        if (!implementation) throw new Unsupported(`function ${node.name}`);
        // IF evaluates only the branch it takes: IF(B2=0, 0, A2/B2) is no error.
        if (node.name === 'IF') {
          const condition = toBoolean(single(evaluate(node.args[0], sheetIndex)));
          const taken = condition ? node.args[1] : node.args[2];
          // A missing branch gives TRUE or FALSE, like Excel.
          return taken ? single(evaluate(taken, sheetIndex)) : condition;
        }
        const args = node.args.map((arg) => {
          if (!ERROR_AWARE.has(node.name)) return evaluate(arg, sheetIndex);
          try { return evaluate(arg, sheetIndex); } catch (caught) { if (isError(caught)) return caught; throw caught; }
        });
        return implementation(args);
      }
      default: throw new Unsupported('node');
    }
  }
  const single = (value) => (Array.isArray(value) ? (value.length === 1 && value[0].length === 1 ? value[0][0] : error('#VALUE!')) : value);
  function valueOf(sheetIndex, row, column) {
    const key = `${sheetIndex}:${row}:${column}`;
    if (results.has(key)) {
      const known = results.get(key);
      if (known === undefined) throw new Unsupported('depends on an unsupported cell');
      return known;
    }
    if (visiting.has(key)) throw error('#REF!');
    visiting.add(key);
    const cell = workbook.sheets[sheetIndex].rows[row - 1][column];
    let value;
    try {
      value = single(evaluate(parse(cell.formula), sheetIndex));
      if (typeof value === 'number' && !Number.isFinite(value)) value = error('#NUM!');
      if (value == null) value = 0;
    } catch (caught) {
      if (caught instanceof Unsupported) {
        visiting.delete(key);
        results.set(key, undefined);
        throw caught;
      }
      value = isError(caught) ? caught : error('#VALUE!');
    }
    visiting.delete(key);
    results.set(key, value);
    return value;
  }
  workbook.sheets.forEach((sheet, sheetIndex) => sheet.rows.forEach((row, rowIndex) => row.forEach((cell, column) => {
    if (cell.type !== 'formula') return;
    try {
      valueOf(sheetIndex, rowIndex + 1, column);
    } catch {
      if (!results.has(`${sheetIndex}:${rowIndex + 1}:${column}`)) results.set(`${sheetIndex}:${rowIndex + 1}:${column}`, undefined);
    }
  })));
  return results;
}

export { isError };
