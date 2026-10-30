// Splitting text into the terms the notes and the past conversations are searched by (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.4).
//
// The old memory cut words with /[\p{L}\p{N}_-]{2,}/, so a Chinese sentence with no spaces was ONE word and nothing ever matched. Here the words come from `Intl.Segmenter`
// (the page and Node 22 both have it: it cuts Chinese and Japanese into real words), and a run of Chinese, Japanese or Korean characters also gives its two-character pieces,
// so "北市" still finds "台北市". Other languages: lower case, no accents, a light stem (a plural or an ending of a verb is cut, a Russian word keeps its first letters).
// This is a match of letters only: it does not know that "car" and "automobile" are the same thing (the notes carry keywords of several languages for that, and the vectors
// of P7 do it for the history).
//
// A term is a string with a kind in front: `w:` a word, `b:` a two-character piece. Shared by the page and the server: no window, no document, no browser storage.

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const MARKS = /\p{M}+/gu;

let segmenter;
const getSegmenter = () => {
  if (segmenter === undefined) segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  return segmenter;
};

// Words that say nothing about what a note is about (a few of each language: more would only hide real words).
const STOP = new Set([
  // zh / ja
  '的', '了', '是', '我', '你', '他', '她', '它', '們', '这', '這', '那', '有', '在', '就', '都', '也', '和', '與', '或', '但', '而', '嗎', '呢', '吧', '啊', '哦', '請', '幫', '一個', '什麼', '怎麼', '可以', '想', '要', '會', '能', '把', '被', '讓', '給', '對', '從', '到', '使用者', '用戶', 'は', 'が', 'を', 'に', 'の', 'で', 'と', 'も',
  // en
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'me', 'do', 'does', 'did', 'can', 'could', 'would', 'should', 'will', 'not', 'no', 'yes', 'please', 'user', 'users', 'prefers', 'prefer',
  // fr
  'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'de', 'du', 'au', 'aux', 'dans', 'pour', 'avec', 'est', 'sont', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'mon', 'ma', 'mes', 'ne', 'pas', 'oui', 'utilisateur',
  // es
  'el', 'los', 'las', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'del', 'al', 'para', 'con', 'es', 'son', 'yo', 'tú', 'él', 'ella', 'nosotros', 'ellos', 'mi', 'su', 'sí', 'por', 'usuario',
  // ru
  'и', 'в', 'не', 'на', 'я', 'он', 'она', 'мы', 'вы', 'они', 'это', 'что', 'как', 'но', 'или', 'с', 'к', 'у', 'за', 'по', 'из', 'о', 'от', 'для', 'пользователь'
]);

const stripMarks = (word) => word.normalize('NFD').replace(MARKS, '').normalize('NFC');

// A light stem for words written with letters (English, French, Spanish and the like): the same rules are used on the note and on the question, so they only have to agree.
function stemLatin(word) {
  let stem = word;
  if (stem.length > 4 && stem.endsWith('ies')) stem = `${stem.slice(0, -3)}y`;
  else if (stem.length > 5 && /(?:ing|ed)$/.test(stem)) {
    stem = stem.replace(/(?:ing|ed)$/, '');
    if (/([^aeiou])\1$/.test(stem)) stem = stem.slice(0, -1);
  } else if (stem.length > 5 && /(?:s|x|z|ch|sh)es$/.test(stem)) stem = stem.slice(0, -2);
  else if (stem.length > 3 && stem.endsWith('s') && !stem.endsWith('ss')) stem = stem.slice(0, -1);
  if (stem.length > 4 && /[aeo]$/.test(stem)) stem = stem.slice(0, -1);
  else if (stem.length > 3 && stem.endsWith('e')) stem = stem.slice(0, -1);
  return stem;
}

// A Russian word keeps its first six letters (the endings change a lot: this takes "программист" and "программисты" for the same).
const stemCyrillic = (word) => word.replace(/ё/g, 'е').slice(0, 6);

function stemWord(word) {
  if (/^[\p{Script=Latin}\d'’-]+$/u.test(word)) return stemLatin(word.replace(/['’]s?$/u, ''));
  if (/^[\p{Script=Cyrillic}-]+$/u.test(word)) return stemCyrillic(word);
  return word;
}

/** The text without case, accents and the many shapes of one character (NFKC), as the search sees it. */
export const normalizeText = (text) => String(text ?? '').normalize('NFKC').toLowerCase();

/** Whether a term is a word that carries meaning (a word of at least two characters, not one of the little words): what "this note has something to do with it" is counted by. */
export const isStrongTerm = (term) => term.startsWith('w:') && term.length > 3 && !STOP.has(term.slice(2));

/**
 * The terms of a text, in order (a term twice if the word is twice): words (`w:`) and, for Chinese, Japanese and Korean, the two-character pieces of every run of characters (`b:`).
 */
export function terms(text) {
  const source = normalizeText(text);
  if (!source.trim()) return [];
  const out = [];
  const cut = getSegmenter();
  const words = cut
    ? [...cut.segment(source)].filter((part) => part.isWordLike).map((part) => part.segment)
    : source.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const raw of words) {
    const word = CJK.test(raw) ? raw : stripMarks(raw);
    if (!word || STOP.has(word)) continue;
    if (CJK.test(word)) {
      if (word.length >= 2) out.push(`w:${word}`);
      continue;
    }
    const stem = stemWord(word);
    if (stem.length >= 2 && !STOP.has(stem)) out.push(`w:${stem}`);
  }
  for (const run of source.match(CJK_RUN) || []) {
    const characters = [...run];
    for (let index = 0; index + 1 < characters.length; index += 1) {
      const piece = characters[index] + characters[index + 1];
      if (!STOP.has(characters[index]) || !STOP.has(characters[index + 1])) out.push(`b:${piece}`);
    }
  }
  return out;
}

/** The distinct terms of a text (or of several: the text of a note and its keywords). */
export const termSet = (...texts) => new Set(texts.flat().flatMap((text) => terms(text)));

/** How much two sets share: the shared ones over all of them (0 to 1). */
export function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const term of left) if (right.has(term)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** The shared ones over the smaller set (1 when the smaller is inside the other): used for a few keywords against a whole note. */
export function overlapCoefficient(left, right) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const term of left) if (right.has(term)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/** The words of a text, without the kind in front (for the keywords of a note that has none: its strongest words). */
export const plainWords = (text, limit = 6) => [...new Set(terms(text).filter(isStrongTerm).map((term) => term.slice(2)))].slice(0, limit);
