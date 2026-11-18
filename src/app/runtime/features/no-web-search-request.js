// Whether the person says, in words, that the web is not to be searched ("不要用連網搜尋", "don't search the web", "sans chercher sur le web"): then the search is not turned on for them
// (not by the words of the Decisions model's `search` answer, not by the word list), whatever the message is about. A short list in the five languages, kept to a "not" that stands near
// the web; "no problem, search the web" and "don't hesitate to search the web" are not refusals. Pure. The messages that ask for a browser are handled apart (a browser does the looking).

import { isBrowserOn } from '../server-reply/browser-switch.js';
import { asksForBrowser } from '../browser-agent/browser-intent.js';

const NOT_ZH = '(?:不要|不用|別|别|請勿|勿|不需要|不必|無需|无需|禁止)';
const REFUSALS = [
  // zh-TW / zh-CN: "不要用連網搜尋", "不要上網", "別用網路查", "不用搜尋"
  new RegExp(`${NOT_ZH}[^，,。.！!？?\\n]{0,6}(?:連網|联网|聯網|上網|上网|網路|网络|網上|网上|網絡|互聯網|互联网|在線|線上)`),
  new RegExp(`${NOT_ZH}(?:去|再|幫我|帮我|要)?(?:搜尋|搜索)`),
  // English: "don't search the web", "without searching the internet", "do not use web search", "no web search"
  /\b(?:don'?t|do not|never|avoid|stop|without|no need to)(?!\s+(?:hesitate|forget|be\s+afraid|be\s+shy|worry))\b[^.!?\n]{0,24}\b(?:search(?:ing)?|brows(?:e|ing)|look(?:ing)?\s+(?:\w+\s+){0,2}up|google|googling)\b[^.!?\n]{0,16}\b(?:web|internet|online)\b/i,
  /\b(?:no|without|don'?t|do not|never|avoid)\s+(?:(?:use|using|do|a|any|the)\s+)*(?:web|internet|online)\s+(?:search|searching|browsing|lookup|look-up)/i,
  // French: "sans chercher sur le web", "ne cherche pas sur internet", "pas de recherche web"
  /\b(?:ne\s+(?:cherche|recherche|fais|va)\s+pas|sans|pas\s+de|[ée]vite)\b[^.!?\n]{0,24}\b(?:web|internet|en\s+ligne)\b/i,
  // Russian: "не ищи в интернете", "без поиска в интернете"
  /(?:не\s+(?:ищи|искать|гугли|используй)|без\s+поиска|не\s+нужно\s+искать)[^.!?\n]{0,24}(?:интернет|сет[иь]|веб)/i,
  // Spanish: "no busques en internet", "sin buscar en la web"
  /\b(?:no\s+(?:busques|busque|googlees)|sin\s+(?:buscar|b[uú]squeda)|no\s+uses\s+(?:la\s+)?b[uú]squeda)\b[^.!?\n]{0,24}\b(?:web|internet|en\s+l[ií]nea|online)\b/i
];

/** True when the text says the web is not to be searched. */
export const forbidsWebSearch = (text) => {
  const value = String(text ?? '').slice(0, 2000);
  return value.length > 0 && REFUSALS.some((pattern) => pattern.test(value));
};

/**
 * What keeps the search from being turned on for a message: { refused } the person said not to search the web; { browserDoesIt } the browser agent is on for this conversation and the message is
 * a task for it (the Decisions model's `browser` answer, the short list of phrases when there is none): it opens the addresses and does the looking itself.
 */
export function searchHeldBack(text, conversationId, browserVerdict, { isOn = isBrowserOn, asks = asksForBrowser } = {}) {
  return { refused: forbidsWebSearch(text), browserDoesIt: Boolean(isOn(conversationId)) && (browserVerdict ?? asks(text)) };
}
