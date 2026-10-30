// The arithmetic of the search by meaning (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9): vectors are made unit length once, so the likeness of two texts is
// one dot product; the best of many by that likeness; and the way the order of the keyword search and the order of the vector search are put together (reciprocal rank fusion: a piece
// that both put high comes first, whatever the scale of their scores). Pure functions, no window, no document, no browser storage.

/** The vector as a Float32Array of length one (the same direction); an empty or all-zero vector stays zero. */
export function toUnit(values) {
  const out = Float32Array.from(values || [], (value) => (Number.isFinite(value) ? value : 0));
  let sum = 0;
  for (let index = 0; index < out.length; index += 1) sum += out[index] * out[index];
  const length = Math.sqrt(sum);
  if (length > 0) for (let index = 0; index < out.length; index += 1) out[index] /= length;
  return out;
}

/** The likeness of two unit vectors of the same length (−1 to 1); 0 when the lengths differ. */
export function dot(left, right) {
  if (!left || !right || left.length !== right.length) return 0;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index];
  return sum;
}

/** The best `limit` of `entries` ([{ id, vector }], unit vectors) for the unit vector `query`, at least `minCosine` alike, the most alike first: [{ id, cosine }]. */
export function topByCosine(query, entries, { limit = 10, minCosine = 0.5 } = {}) {
  const found = [];
  for (const entry of entries) {
    const cosine = dot(query, entry.vector);
    if (cosine >= minCosine) found.push({ id: entry.id, cosine });
  }
  return found.sort((left, right) => right.cosine - left.cosine).slice(0, limit);
}

/** Puts rankings (lists of ids, best first) together: the score of an id is the sum of 1 / (k + place) over the lists it is in. Returns the ids, best first. */
export function fuseRanks(rankings, { k = 60, limit = 10 } = {}) {
  const scores = new Map();
  for (const list of rankings) {
    list.forEach((id, place) => scores.set(id, (scores.get(id) || 0) + 1 / (k + place + 1)));
  }
  return [...scores.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit).map(([id]) => id);
}

/** A short hash of a text (to know whether a stored vector is still the vector of this text). */
export function textHash(text) {
  let hash = 0x811c9dc5;
  const value = String(text ?? '');
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + value.length.toString(36);
}
