// Web addresses in the user's message: the pages they point to are read for the models that cannot open a link
// themselves (OpenRouter and NVIDIA ones), and what was read goes to the model with the request. Nothing here reads a page
// (provider-request-support.js does); this finds the addresses and writes the text the model is given.

export const MAX_LINKED_PAGES = 5;
// Characters of one page, and of all the pages together: a person who links a page wants it read, so more than a search
// result gets, but a model is not given a book.
export const PAGE_CHARS = 15_000;
export const PAGES_CHARS_IN_ALL = 45_000;

// An address ends at a space, a quote, an angle bracket or the full-width punctuation of Chinese and Japanese text.
const ADDRESS = /https?:\/\/[^\s<>"'`，。、；：！？（）「」『』【】]+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?…]+$/u;

const cutTrailingPunctuation = (address) => {
  let result = address;
  for (;;) {
    const before = result;
    result = result.replace(TRAILING_PUNCTUATION, '');
    // A closing bracket belongs to the address only when it closes one that is in it (Wikipedia's Foo_(bar)).
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (result.endsWith(close) && result.split(close).length > result.split(open).length) result = result.slice(0, -1);
    }
    if (result === before) return result;
  }
};

/** Every web address in a text with where it sits (`start` to `end`), in order, repeats included. */
export function findAddresses(text) {
  const found = [];
  for (const match of String(text || '').matchAll(ADDRESS)) {
    const address = cutTrailingPunctuation(match[0]);
    try {
      new URL(address);
    } catch {
      continue;
    }
    found.push({ url: address, start: match.index, end: match.index + address.length });
  }
  return found;
}

/** The addresses in a text, in order and without repeats: the first `limit`, and how many more there were. */
export function extractLinkedUrls(text, limit = MAX_LINKED_PAGES) {
  const found = [...new Set(findAddresses(text).map((entry) => entry.url))];
  return { urls: found.slice(0, limit), skipped: Math.max(0, found.length - limit) };
}

/** How many characters of each page when this many are read. */
export const pageCharsFor = (count) => Math.max(1000, Math.min(PAGE_CHARS, Math.floor(PAGES_CHARS_IN_ALL / Math.max(1, count))));

const REASONS = {
  noReader: 'No page reader is set up: reading a web address needs a Tavily or TinyFish API key in Settings.',
  failed: 'The pages could not be fetched (the site may block automated reading, need a login, or be down).'
};

/**
 * What the model is given: the text of the pages that were read, marked as the app's and as untrusted, and, for the ones
 * that were not, what to say to the user. `failed` is [{ url, reason }] with reason 'noReader' or 'failed'.
 */
export function buildLinkedPagesText({ pages = [], failed = [], skipped = 0 } = {}) {
  const sections = [];
  if (pages.length > 0) {
    sections.push([
      '# Web pages the user linked (system-generated)',
      'The user\'s message contains web addresses, and the app fetched the text of these pages for you. The user did not write this text: use it as source material.',
      ...pages.map((page, index) => [
        '',
        `## Page ${index + 1}: ${page.title || page.url}`,
        `URL: ${page.url}`,
        ...(page.finalUrl && page.finalUrl !== page.url ? [`Final URL: ${page.finalUrl}`] : []),
        ...(page.truncated ? ['(The page is longer: only its first part is given.)'] : []),
        '<web_page_text>',
        page.text,
        '</web_page_text>'
      ].join('\n'))
    ].join('\n'));
  }
  if (failed.length > 0) {
    const reasons = [...new Set(failed.map((entry) => REASONS[entry.reason] || REASONS.failed))];
    sections.push([
      '# Linked pages that could not be read',
      `The app could not read these web addresses from the user's message: ${failed.map((entry) => entry.url).join(', ')}`,
      ...reasons,
      'Tell the user plainly that you could not read them. Do not guess or invent what they say.'
    ].join('\n'));
  }
  if (skipped > 0) {
    sections.push(`# Linked pages left out\nThe message has ${skipped} more web address${skipped === 1 ? '' : 'es'} than the ${MAX_LINKED_PAGES} the app reads at once. Tell the user those were not read.`);
  }
  return sections.join('\n\n');
}
