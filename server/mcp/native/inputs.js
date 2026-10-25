// What a tool of a native connector takes from the model: each value is checked here, so that a call that is not right is told so in plain words (a `ToolFailure`) and
// never reaches the service. Ids go into addresses only through `encodeURIComponent` (see `idPart`).

import { ToolFailure } from './api.js';

// A control character (a line break, a tab...) has no place in an id, an address or a header.
const hasControl = (text) => [...String(text)].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

const present = (args, key) => args?.[key] !== undefined && args[key] !== null && args[key] !== '';

/** A text input. `required`: it must be there; `max`: the most characters (more is refused, never cut). */
export function textArg(args, key, { required = false, max = 20_000, fallback = '' } = {}) {
  if (!present(args, key)) {
    if (required) throw new ToolFailure(`"${key}" is needed.`);
    return fallback;
  }
  if (typeof args[key] !== 'string') throw new ToolFailure(`"${key}" must be text.`);
  if (args[key].length > max) throw new ToolFailure(`"${key}" is too long (at most ${max} characters).`);
  return args[key];
}

/** An id of the service (a file, a calendar, a message...): any text that is one line, as it was given by the service. */
export function idArg(args, key, { required = true } = {}) {
  const value = textArg(args, key, { required, max: 300 });
  if (value && hasControl(value)) throw new ToolFailure(`"${key}" is not an id.`);
  return value;
}

/** An id as a part of an address. */
export const idPart = (value) => encodeURIComponent(value);

export function intArg(args, key, { min = 1, max = 100, fallback } = {}) {
  if (!present(args, key)) return fallback;
  const value = Number(args[key]);
  if (!Number.isInteger(value) || value < min || value > max) throw new ToolFailure(`"${key}" must be a whole number from ${min} to ${max}.`);
  return value;
}

export function boolArg(args, key, fallback = false) {
  if (!present(args, key)) return fallback;
  if (typeof args[key] !== 'boolean') throw new ToolFailure(`"${key}" must be true or false.`);
  return args[key];
}

export function enumArg(args, key, values, fallback) {
  if (!present(args, key)) return fallback;
  if (!values.includes(args[key])) throw new ToolFailure(`"${key}" must be one of: ${values.join(', ')}.`);
  return args[key];
}

/** A list of texts (at most `limit`, each at most `max` characters). */
export function listArg(args, key, { limit = 50, max = 300 } = {}) {
  if (!present(args, key)) return [];
  if (!Array.isArray(args[key]) || args[key].length > limit || args[key].some((item) => typeof item !== 'string' || !item || item.length > max || hasControl(item))) {
    throw new ToolFailure(`"${key}" must be a list of at most ${limit} short texts.`);
  }
  return args[key];
}

/** Rows of cells for a sheet: a list of lists of text, numbers, true/false or null. */
export function rowsArg(args, key, { maxRows = 1000, maxCells = 20_000 } = {}) {
  const value = args?.[key];
  if (!Array.isArray(value) || !value.length || value.length > maxRows || value.some((row) => !Array.isArray(row))) throw new ToolFailure(`"${key}" must be a list of rows, each a list of cells.`);
  let cells = 0;
  for (const row of value) {
    cells += row.length;
    if (row.some((cell) => cell !== null && !['string', 'number', 'boolean'].includes(typeof cell) )) throw new ToolFailure('A cell must be text, a number, true/false or null.');
  }
  if (cells > maxCells) throw new ToolFailure(`Too many cells at once (at most ${maxCells}).`);
  return value;
}

/** The text of a result, cut to a size (with a note when it was cut, so that the model asks for less). */
export function fit(value, limit = 40_000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}\n[cut: the result is longer than ${limit} characters; ask for less]` : text;
}
