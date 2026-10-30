// A search over a few hundred notes or some tens of thousands of pieces of conversation, in memory (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.4): BM25,
// the common way to rank texts by the words they share with a question, with a weight for the kind of term (a whole word counts more than a two-character piece of Chinese).
//
// Besides the score it gives `norm` (0 to 1): the score over the most the question could have scored out of the words that the texts hold at all (a word nobody holds says
// nothing about which text fits, and the many pieces of a long question would only pull it down), which says how much of the question the text covers. The prefetch of memory
// does not attach a note because its score is the highest, but because `norm` and the number of strong words it shares are high enough, so that a question with nothing to do
// with any note brings none. Shared by the page and the server: no window, no document, no browser storage.

import { isStrongTerm } from './tokenize.js';

const K1 = 1.2;
const B = 0.75;
const BOOST = Object.freeze({ w: 1, b: 0.35 });
const boostOf = (term) => BOOST[term[0]] ?? 1;
const idf = (documents, containing) => Math.log(1 + (documents - containing + 0.5) / (containing + 0.5));

/**
 * `documents`: [{ id, terms: string[] }]. Returns { search(queryTerms, { limit, minNorm, minStrong }) -> [{ id, score, norm, strong, specific }], size }.
 * `strong` is the number of different strong words (see isStrongTerm) the text shares with the question, `specific` how many of those only this text (or at most `specificDf`
 * texts) holds: a word that names one thing in the notebook ("柴犬") is a surer sign than a word many notes have ("工作").
 */
export function createBm25Index(documents, { k1 = K1, b = B, specificDf = 1 } = {}) {
  const postings = new Map();
  const lengths = [];
  const ids = [];
  documents.forEach((entry, index) => {
    ids.push(entry.id);
    lengths.push(entry.terms.length);
    const counts = new Map();
    for (const term of entry.terms) counts.set(term, (counts.get(term) || 0) + 1);
    for (const [term, count] of counts) {
      let list = postings.get(term);
      if (!list) postings.set(term, (list = []));
      list.push([index, count]);
    }
  });
  const total = documents.length;
  const averageLength = total ? lengths.reduce((sum, length) => sum + length, 0) / total || 1 : 1;

  function search(queryTerms, { limit = 5, minNorm = 0, minStrong = 0, accept = null } = {}) {
    const query = [...new Set(queryTerms)];
    if (!query.length || !total) return [];
    let bound = 0;
    const scores = new Map();
    const strong = new Map();
    const specific = new Map();
    for (const term of query) {
      const list = postings.get(term);
      if (!list) continue;
      const weight = idf(total, list.length) * boostOf(term);
      bound += weight * (k1 + 1);
      for (const [index, count] of list) {
        const lengthPart = 1 - b + b * (lengths[index] / averageLength);
        scores.set(index, (scores.get(index) || 0) + weight * ((count * (k1 + 1)) / (count + k1 * lengthPart)));
        if (isStrongTerm(term)) {
          let found = strong.get(index);
          if (!found) strong.set(index, (found = new Set()));
          found.add(term);
          if (list.length <= specificDf) specific.set(index, (specific.get(index) || 0) + 1);
        }
      }
    }
    return [...scores]
      .map(([index, score]) => ({ id: ids[index], score, norm: bound > 0 ? Math.min(1, score / bound) : 0, strong: strong.get(index)?.size || 0, specific: specific.get(index) || 0 }))
      .filter((hit) => hit.norm >= minNorm && hit.strong >= minStrong && (!accept || accept(hit)))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(0, limit));
  }

  return { search, size: total };
}
