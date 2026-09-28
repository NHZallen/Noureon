// Document-language rules. The UI language decides how the app talks to the
// user; the document language decides what goes into the file: fonts,
// punctuation spacing, quote marks, number and date formats, and the few
// strings the generator adds on its own (continued slides, default titles).

export const DOCUMENT_LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);

const LANGUAGE_ALIASES = Object.freeze({
  zh: 'zh-TW', 'zh-tw': 'zh-TW', 'zh-hant': 'zh-TW', 'zh-hk': 'zh-TW', 'zh-mo': 'zh-TW',
  'zh-cn': 'zh-CN', 'zh-hans': 'zh-CN', 'zh-sg': 'zh-CN',
  en: 'en', 'en-us': 'en', 'en-gb': 'en', fr: 'fr', 'fr-fr': 'fr', 'fr-ca': 'fr',
  ru: 'ru', 'ru-ru': 'ru', es: 'es', 'es-es': 'es', 'es-mx': 'es', 'es-419': 'es',
  ja: 'ja', 'ja-jp': 'ja', ko: 'ko', 'ko-kr': 'ko'
});

/**
 * Accepts a BCP 47 tag or a language name the model may write. Languages
 * outside the five UI languages are kept (fonts still cover them) but their
 * generated strings fall back to English.
 */
export function normalizeLanguage(value) {
  const tag = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!tag) return null;
  if (LANGUAGE_ALIASES[tag]) return LANGUAGE_ALIASES[tag];
  const primary = tag.split('-')[0];
  if (LANGUAGE_ALIASES[primary]) return LANGUAGE_ALIASES[primary];
  const byName = {
    chinese: 'zh-TW', 繁體中文: 'zh-TW', 中文: 'zh-TW', 简体中文: 'zh-CN', english: 'en', français: 'fr', french: 'fr',
    русский: 'ru', russian: 'ru', español: 'es', spanish: 'es', japanese: 'ja', 日本語: 'ja', korean: 'ko', 한국어: 'ko'
  }[tag];
  if (byName) return byName;
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag) ? primary : null;
}

const HAN = /[\u3400-\u9FFF\uF900-\uFAFF]/g;
const KANA = /[\u3040-\u30FF]/g;
const HANGUL = /[\uAC00-\uD7AF]/g;
const CYRILLIC = /[\u0400-\u04FF]/g;
const LATIN = /[A-Za-z\u00C0-\u024F]/g;
const count = (text, pattern) => (text.match(pattern) || []).length;
// Frequent characters that differ between Simplified and Traditional Chinese
// (the two strings are pairwise equivalents).
const SIMPLIFIED_ONLY = new Set('\u8FD9\u4EEC\u4E3A\u53D1\u7ECF\u8BF4\u65F6\u5BF9\u4F1A\u8FC7\u8FD8\u8FDB\u73B0\u5E94\u5F00\u5173\u95E8\u95EE\u9898\u5B9E\u70B9\u4E48\u6837\u4E1C\u8F66\u957F\u9A6C\u9E1F\u9C7C');
const TRADITIONAL_ONLY = new Set('\u9019\u5011\u70BA\u767C\u7D93\u8AAA\u6642\u5C0D\u6703\u904E\u9084\u9032\u73FE\u61C9\u958B\u95DC\u9580\u554F\u984C\u5BE6\u9EDE\u9EBC\u6A23\u6771\u8ECA\u9577\u99AC\u9CE5\u9B5A');
const countIn = (text, set) => [...text].filter((char) => set.has(char)).length;

/** Guesses the language of document text; `fallback` wins for Latin script. */
export function detectDocumentLanguage(text, fallback = 'zh-TW') {
  const source = String(text ?? '');
  const han = count(source, HAN);
  const kana = count(source, KANA);
  const hangul = count(source, HANGUL);
  const cyrillic = count(source, CYRILLIC);
  const latin = count(source, LATIN);
  // Japanese text is full of kana; a Chinese document quoting a Japanese
  // phrase is still Chinese.
  if (kana > 0 && kana >= han * 0.3 && kana + han >= latin / 4) return 'ja';
  if (hangul > 0 && hangul >= latin / 4) return 'ko';
  if (han > 0 && han >= latin / 4) {
    return countIn(source, SIMPLIFIED_ONLY) > countIn(source, TRADITIONAL_ONLY) ? 'zh-CN' : 'zh-TW';
  }
  if (cyrillic > latin) return 'ru';
  const normalizedFallback = normalizeLanguage(fallback) || 'en';
  // A Latin-script document written while the UI is in Chinese or Russian is
  // most likely English.
  return ['fr', 'es', 'en'].includes(normalizedFallback) ? normalizedFallback : 'en';
}

export const isCjkLanguage = (language) => /^(?:zh|ja|ko)\b/i.test(String(language || ''));

const intlLocale = (language) => (language === 'zh-TW' ? 'zh-Hant-TW' : language === 'zh-CN' ? 'zh-Hans-CN' : language || 'en');

const QUOTES = Object.freeze({
  'zh-TW': ['\u300C', '\u300D'], 'zh-CN': ['\u201C', '\u201D'], ja: ['\u300C', '\u300D'], ko: ['\u201C', '\u201D'],
  en: ['\u201C', '\u201D'], fr: ['\u00AB', '\u00BB'], ru: ['\u00AB', '\u00BB'], es: ['\u00AB', '\u00BB']
});
export const quoteMarks = (language) => QUOTES[language] || QUOTES.en;

const NARROW_NO_BREAK_SPACE = '\u202F';

/**
 * Typographic conventions that the model rarely gets right and that change
 * how text wraps. French sets a narrow no-break space before : ; ! ? % and
 * inside guillemets, so the sign never starts a new line.
 */
export function applyTypography(text, language) {
  const value = String(text ?? '');
  if (language !== 'fr') return value;
  return value
    .replace(/[ \u00A0]+([:;!?%\u00BB])/g, `${NARROW_NO_BREAK_SPACE}$1`)
    .replace(/([^\s\d])([;!?\u00BB])/g, (match, before, sign) => (/[\u00AB\u202F(]/.test(before) ? match : `${before}${NARROW_NO_BREAK_SPACE}${sign}`))
    .replace(/\u00AB[ \u00A0]*/g, `\u00AB${NARROW_NO_BREAK_SPACE}`);
}

export function formatPercent(value, language, { signed = false } = {}) {
  try {
    return new Intl.NumberFormat(intlLocale(language), {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: signed ? 'exceptZero' : 'auto'
    }).format(Number(value) / 100);
  } catch {
    return `${signed && value > 0 ? '+' : ''}${value}%`;
  }
}

export function formatNumber(value, language, options = {}) {
  try {
    return new Intl.NumberFormat(intlLocale(language), options).format(Number(value));
  } catch {
    return String(value);
  }
}

/** Formats ISO dates (YYYY-MM-DD); any other text is returned as written. */
export function formatDocumentDate(value, language) {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return text;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return text;
  try {
    return new Intl.DateTimeFormat(intlLocale(language), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return text;
  }
}

const GENERATED_TEXT = Object.freeze({
  'zh-TW': { continued: '（續）', agenda: '目錄', closing: '謝謝', imagePlaceholder: '圖片', source: '資料來源', pageOf: '{page} / {total}' },
  'zh-CN': { continued: '（续）', agenda: '目录', closing: '谢谢', imagePlaceholder: '图片', source: '资料来源', pageOf: '{page} / {total}' },
  en: { continued: ' (cont.)', agenda: 'Agenda', closing: 'Thank you', imagePlaceholder: 'Image', source: 'Source', pageOf: '{page} / {total}' },
  fr: { continued: ' (suite)', agenda: 'Sommaire', closing: 'Merci', imagePlaceholder: 'Image', source: 'Source', pageOf: '{page} / {total}' },
  ru: { continued: ' (продолжение)', agenda: 'Содержание', closing: 'Спасибо', imagePlaceholder: 'Изображение', source: 'Источник', pageOf: '{page} / {total}' },
  es: { continued: ' (cont.)', agenda: 'Índice', closing: 'Gracias', imagePlaceholder: 'Imagen', source: 'Fuente', pageOf: '{page} / {total}' }
});

/** Strings the generator writes into the file itself, in the document language. */
export function generatedText(language, key, replacements = {}) {
  const table = GENERATED_TEXT[language] || GENERATED_TEXT.en;
  let value = table[key] ?? GENERATED_TEXT.en[key] ?? key;
  Object.entries(replacements).forEach(([name, replacement]) => {
    value = value.replaceAll(`{${name}}`, String(replacement));
  });
  return value;
}

export const GENERATED_TEXT_KEYS = Object.freeze(Object.keys(GENERATED_TEXT.en));
export const GENERATED_TEXT_LANGUAGES = Object.freeze(Object.keys(GENERATED_TEXT));

/**
 * How much longer the same content runs than Chinese, in characters. Layout
 * budgets are written for Chinese and multiplied by this factor.
 */
export function characterBudgetFactor(language) {
  if (isCjkLanguage(language)) return 1;
  if (language === 'en') return 2.1;
  return 2.4;
}
