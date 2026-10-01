// What a model reads of a web page it opened (web-research-reply.js). A page reader gives the whole page as Markdown; nothing
// of it is cut (a site's menu can be what the person is after). Its links are made absolute so the model can open the ones it
// wants, and the page is read a window at a time, or jumped to by a word (find_in_page), so a long menu at the top does not
// hide the rest.

const LINK = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Links in the text written as full addresses, so the model can open one as it stands. */
export function absoluteLinks(text, baseUrl) {
  return String(text || '').replace(LINK, (whole, label, target) => {
    if (/^(#|mailto:|javascript:|tel:)/i.test(target)) return label;
    try {
      return `[${label}](${new URL(target, baseUrl).href})`;
    } catch {
      return label;
    }
  });
}

/** A window of the text: from `start`, up to `size` characters, cut at a line end when one is near. */
export function pageWindow(text, start = 0, size = 10_000) {
  const total = text.length;
  const from = Math.max(0, Math.min(total, Math.floor(Number(start) || 0)));
  let to = Math.min(total, from + size);
  if (to < total) {
    const lineEnd = text.lastIndexOf('\n', to);
    if (lineEnd > from + size * 0.6) to = lineEnd;
  }
  return { text: text.slice(from, to), from, to, total };
}

const PASSAGE_CHARS = 700;
const MAX_PASSAGES = 5;

/**
 * Where a word or phrase is in the text: up to five passages around it, best first (the whole phrase, then the passages
 * with the most of its words), each with where it starts so the page can be read from there.
 */
export function findPassages(text, query) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const phrase = String(query || '').trim().toLowerCase();
  if (!phrase) return [];
  const hits = [];
  for (let at = lower.indexOf(phrase); at !== -1 && hits.length < 60; at = lower.indexOf(phrase, at + phrase.length)) hits.push({ at, score: 10 });
  if (hits.length === 0) {
    const words = [...new Set(phrase.split(/[\s,，、]+/).filter((word) => word.length > 1))];
    for (const word of words) {
      for (let at = lower.indexOf(word); at !== -1 && hits.length < 200; at = lower.indexOf(word, at + word.length)) hits.push({ at, score: 1 });
    }
    // A place where several of the words are close together is worth more.
    for (const hit of hits) {
      const near = lower.slice(Math.max(0, hit.at - 300), hit.at + 300);
      hit.score = words.filter((word) => near.includes(word)).length;
    }
  }
  const chosen = [];
  for (const hit of hits.sort((a, b) => b.score - a.score || a.at - b.at)) {
    if (chosen.every((other) => Math.abs(other.at - hit.at) > PASSAGE_CHARS)) chosen.push(hit);
    if (chosen.length >= MAX_PASSAGES) break;
  }
  return chosen.sort((a, b) => a.at - b.at).map(({ at }) => {
    const from = Math.max(0, at - PASSAGE_CHARS / 2);
    return { from, text: source.slice(from, from + PASSAGE_CHARS) };
  });
}
