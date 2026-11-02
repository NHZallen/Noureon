// The categories the notes are sorted into. A memory starts with five (the kinds a note was always made with: preference, fact, project, relationship, routine); the person may rename any
// of them, remove any of them and add their own, so the list is kept with the settings of the memory (`meta:settings`, `categories`) and goes with the account. A note keeps the id of its category in
// `kind`; a note whose category is gone is "uncategorized" (kind `none`, not a category of the list: it only shows while a note is in it). Shared by the page and the server: no window, no
// document, no browser storage.

import { NOTE_KINDS, UNCATEGORIZED, isKindId } from './notes.js';

export const MAX_CATEGORIES = 12;
export const MAX_CATEGORY_NAME = 20;

const cleanName = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_NAME);

/** The list as kept, from whatever was read: `null` when nothing was chosen (the five that a memory starts with), else valid ones only (a name for each of the new ones; a built-in one with no name has its own). */
export function normalizeCategories(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const id = entry && typeof entry === 'object' ? entry.id : null;
    if (!isKindId(id) || id === UNCATEGORIZED || seen.has(id)) continue;
    const name = cleanName(entry.name);
    if (!name && !NOTE_KINDS.includes(id)) continue;
    seen.add(id);
    out.push({ id, name });
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

/** The categories in use: the list of the settings, or the five that a memory starts with. */
export const categoriesOf = (settings) => normalizeCategories(settings?.categories) || NOTE_KINDS.map((id) => ({ id, name: '' }));

export const categoryIds = (categories) => categories.map((category) => category.id);

/** The category a note belongs to now: its own, or `none` when that one is gone. */
export const kindFor = (note, categories) => (categories.some((category) => category.id === note?.kind) ? note.kind : UNCATEGORIZED);

/** The kind for a note that is made: the one asked for when it is a category, else "fact" when there is one, else uncategorized. */
export function resolveKind(kind, categories) {
  const ids = categoryIds(categories);
  if (ids.includes(kind)) return kind;
  return ids.includes('fact') ? 'fact' : UNCATEGORIZED;
}

/** The name shown for a category: the one the person gave, or the words of the built-in one (`builtinName(id)`). */
export const categoryName = (category, builtinName = () => '') => category.name || (NOTE_KINDS.includes(category.id) ? builtinName(category.id) : '') || category.id;

/** The list with a new category, or { ok: false, code }. `nameOf(category)` gives the shown names (to refuse one that is already there). */
export function addCategory(categories, name, { createId = () => globalThis.crypto.randomUUID().slice(0, 8), nameOf = (category) => categoryName(category) } = {}) {
  const clean = cleanName(name);
  if (!clean) return { ok: false, code: 'empty' };
  if (categories.length >= MAX_CATEGORIES) return { ok: false, code: 'full' };
  if (categories.some((category) => nameOf(category).toLowerCase() === clean.toLowerCase())) return { ok: false, code: 'duplicate' };
  let id = `c-${String(createId()).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'x'}`;
  while (categories.some((category) => category.id === id)) id += 'x';
  const category = { id, name: clean };
  return { ok: true, categories: [...categories, category], category };
}

/** The list with one category renamed, or { ok: false, code }. */
export function renameCategory(categories, id, name, { nameOf = (category) => categoryName(category) } = {}) {
  const clean = cleanName(name);
  if (!clean) return { ok: false, code: 'empty' };
  if (!categories.some((category) => category.id === id)) return { ok: false, code: 'missing' };
  if (categories.some((category) => category.id !== id && nameOf(category).toLowerCase() === clean.toLowerCase())) return { ok: false, code: 'duplicate' };
  return { ok: true, categories: categories.map((category) => (category.id === id ? { ...category, name: clean } : category)) };
}

/** The list without one category, and the notes it held (they become uncategorized): { ok, categories, notes }. */
export function removeCategory(categories, id, notes, { now = () => new Date().toISOString() } = {}) {
  if (!categories.some((category) => category.id === id)) return { ok: false, code: 'missing' };
  const at = now();
  return {
    ok: true,
    categories: categories.filter((category) => category.id !== id),
    notes: notes.map((note) => (note.kind === id && note.status !== 'deleted' ? { ...note, kind: UNCATEGORIZED, updatedAt: at } : note))
  };
}
