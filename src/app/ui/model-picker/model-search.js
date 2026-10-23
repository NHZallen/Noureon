// The search box of the model picker. A row carries what can be searched in `data-mp-search-fields`
// (a JSON list: name, id, maker, tags, description); a query is cut into words, every word has to be
// found, and the rows are put in the order of how well they fit. Pure functions and one function that
// shows the result on the panel; no window, document or storage here.

// How much a word found in each field is worth, in the order of the fields.
const FIELD_WEIGHTS = Object.freeze([100, 60, 45, 40, 12]);
const DESCRIPTION_FIELD = 4;

const plain = (text) => String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compact = (text) => plain(text).replace(/[^\p{L}\p{N}]+/gu, '');
const wordsOf = (text) => plain(text).split(/[^\p{L}\p{N}.]+/u).map((word) => word.replace(/^\.+|\.+$/g, '')).filter(Boolean);

/** The query as the words to find, and as one run of letters and digits. */
export function parseQuery(query) {
  const tokens = wordsOf(query).map(compact).filter(Boolean);
  return { tokens, whole: compact(query) };
}

/** What a field offers to the search: its letters and digits in one run, and its words. */
export function analyseFields(fields) {
  return fields.map((field) => ({ compact: compact(field), words: wordsOf(field).map(compact).filter(Boolean) }));
}

/** Edits (an added, missing or changed letter, or two letters swapped) between two short words, or `limit + 1` when more than `limit`. */
export function editDistance(left, right, limit) {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let beforePrevious = [];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let least = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      let value = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) value = Math.min(value, beforePrevious[column - 2] + 1);
      current[column] = value;
      least = Math.min(least, value);
    }
    if (least > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[right.length];
}

/** The score of one word in one field: 0 when it is not there. */
function scoreWord(token, field, weight, fuzzy) {
  if (field.words.some((word) => word.startsWith(token))) return weight;
  if (token.length >= 2 && field.compact.includes(token)) return weight * 0.6;
  if (!fuzzy || token.length < 4) return 0;
  const limit = token.length >= 8 ? 2 : 1;
  const close = field.words.some((word) => word.length >= token.length - 1 && (editDistance(token, word, limit) <= limit || editDistance(token, word.slice(0, token.length), limit) <= limit));
  return close ? weight * 0.35 : 0;
}

/**
 * How well analysed `fields` fit the query: `{ score, descriptionOnly }`, a score of 0 when a word is not found.
 * `descriptionOnly` says a word was found only in the description.
 */
export function scoreFields(parsed, analysed) {
  let score = 0;
  let descriptionOnly = false;
  for (const token of parsed.tokens) {
    let best = 0;
    let bestOutsideDescription = 0;
    analysed.forEach((field, index) => {
      const value = scoreWord(token, field, FIELD_WEIGHTS[index] ?? 10, index !== DESCRIPTION_FIELD);
      best = Math.max(best, value);
      if (index !== DESCRIPTION_FIELD) bestOutsideDescription = Math.max(bestOutsideDescription, value);
    });
    if (!best) return { score: 0, descriptionOnly: false };
    if (!bestOutsideDescription) descriptionOnly = true;
    score += best;
  }
  const { whole } = parsed;
  const name = analysed[0]?.compact || '';
  const id = analysed[1]?.compact || '';
  if (whole && name === whole) score += 300;
  else if (whole && name.startsWith(whole)) score += 150;
  else if (whole && name.includes(whole)) score += 60;
  if (whole && id.includes(whole)) score += 30;
  return { score, descriptionOnly };
}

/** The indexes of the entries that match, best first (the order they came in decides a tie). A description counts only when no other field has the words. */
export function rankEntries(query, entries) {
  const parsed = parseQuery(query);
  if (!parsed.tokens.length) return entries.map((_, index) => index);
  const scored = entries.map((analysed, index) => ({ index, ...scoreFields(parsed, analysed) })).filter((item) => item.score > 0);
  const keepDescriptions = !scored.some((item) => !item.descriptionOnly);
  return scored
    .filter((item) => keepDescriptions || !item.descriptionOnly)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.index);
}

const analysedRows = new WeakMap();
const analysedOf = (row) => {
  if (!analysedRows.has(row)) {
    let fields = [];
    try { fields = JSON.parse(row.dataset.mpSearchFields || '[]'); } catch { fields = []; }
    analysedRows.set(row, analyseFields(fields));
  }
  return analysedRows.get(row);
};

/**
 * Shows the result of `query` on the panel. With nothing typed the list is the groups as they were. With
 * something typed, the groups lose their titles and the rows that fit stand in one list, best first
 * (the `order` of each row; the elements stay where they are, so their events keep working). A model
 * that is in two groups (recent and its company) shows once.
 */
export function applyModelSearch(panel, query) {
  if (!panel) return;
  const scroller = panel.querySelector('[data-mp-scroll]');
  const rows = [...panel.querySelectorAll('[data-mp-search-fields]')];
  const searching = parseQuery(query).tokens.length > 0;
  let visible = new Set(rows);
  const order = new Map();
  if (searching) {
    const seen = new Set();
    const candidates = rows.filter((row) => {
      const key = row.dataset.mpKey || '';
      if (key && seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const ranked = rankEntries(query, candidates.map(analysedOf));
    visible = new Set(ranked.map((index) => candidates[index]));
    ranked.forEach((index, place) => order.set(candidates[index], place + 1));
  }
  rows.forEach((row) => {
    row.hidden = !visible.has(row);
    row.style.order = order.has(row) ? String(order.get(row)) : '';
  });
  let shown = 0;
  panel.querySelectorAll('[data-mp-group]').forEach((group) => {
    const any = [...group.querySelectorAll('[data-mp-search-fields]')].some((row) => !row.hidden);
    group.hidden = !any;
    if (any) shown += 1;
  });
  if (scroller) {
    scroller.classList.toggle('is-searching', searching);
    const text = searching ? String(query) : '';
    if (scroller.dataset.mpQuery !== text) {
      scroller.dataset.mpQuery = text;
      scroller.scrollTop = 0;
    }
  }
  const empty = panel.querySelector('[data-mp-empty]');
  if (empty) empty.hidden = shown > 0;
}
