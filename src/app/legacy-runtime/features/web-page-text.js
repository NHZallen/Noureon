// What a model reads of a web page it opened (web-research-reply.js). A page reader gives the whole page as Markdown, and
// most of what comes first is the site's own menu (GitHub's page starts with "Skip to content, Navigation Menu, Platform,
// Copilot…"), which would use up the window the model reads. So the menu is cut, links are made absolute so the model can
// open the ones it wants, and the rest is read a window at a time, or jumped to by a word (find_in_page).

const MENU_MIN_CHARS = 200;
// How far into a page the menu may reach: a page that is nothing but links is left as it is.
const MENU_MAX_SHARE = 0.9;
const LINK = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const withoutLinks = (line) => line.replace(LINK, '$1');

/** A line of a menu: nothing, only links, or a few short words that make no sentence. */
const isMenuLine = (line) => {
  const text = line.trim();
  if (!text) return true;
  if (/^#{1,6}\s/.test(text) && text.length > 40) return false;
  const bare = withoutLinks(text).replace(/^[\s>*+\-•·|]+/, '').trim();
  if (LINK.test(text)) {
    LINK.lastIndex = 0;
    if (bare.length <= text.length * 0.5 && bare.length < 60) return true;
  }
  LINK.lastIndex = 0;
  return bare.length < 45 && !/[.。!?！？]$/.test(bare) && !/^#{1,6}\s/.test(text);
};

/** The page without its menu at the top and without a line repeated over and over (menus are drawn twice). */
export function stripMenu(text) {
  const lines = String(text || '').split('\n');
  let first = 0;
  while (first < lines.length && isMenuLine(lines[first])) first += 1;
  const menuChars = lines.slice(0, first).join('\n').length;
  const body = menuChars >= MENU_MIN_CHARS && menuChars <= text.length * MENU_MAX_SHARE ? lines.slice(first) : lines;
  const seen = new Set();
  return body.filter((line) => {
    const key = line.trim();
    if (key.length < 3 || key.length > 80) return true;
    if (!seen.has(key)) {
      seen.add(key);
      return true;
    }
    return !/^\s*([*+\-]|\d+\.)?\s*\[/.test(line);
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

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

/** What a model is given of a page it opens: no menu, full-address links. */
export const readablePage = (text, baseUrl) => absoluteLinks(stripMenu(text), baseUrl);

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
