// The public pages (docs/superpowers/specs/2026-10-08-public-pages-design.md): noureon.com/terms, /privacy and /updates, made at build time
// as plain HTML files in dist/. They need no login and do not load the app. The words of the terms and the privacy policy are the
// ones of the settings (src/data/i18n), the update notes are src/data/update-logs/entries.js, so nothing is kept twice.
// The look and the small scripts are two files outside the page (public/pages.css, public/pages.js): the content security policy
// allows no script written in the page.

import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import i18n from '../src/data/i18n/index.js';
import updateLogEntries from '../src/data/update-logs/entries.js';
import { loadUpdateTranslations } from '../src/data/update-logs/translations.js';
import { PRODUCT_VERSION } from '../src/data/version.js';
import { parseLogBlocks } from '../src/app/ui/updates/update-log-view.js';

export const SITE = 'https://noureon.com';
export const LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
const LANGUAGE_NAMES = Object.freeze({ 'zh-TW': '繁體中文', en: 'English', fr: 'Français', ru: 'Русский', es: 'Español' });
const WORDS = Object.freeze({
  'zh-TW': { goToApp: '前往 Noureon', index: '索引', currentVersion: '目前版本', toTop: '移至最上方' },
  en: { goToApp: 'Go to Noureon', index: 'Index', currentVersion: 'Current version', toTop: 'Back to top' },
  fr: { goToApp: 'Aller sur Noureon', index: 'Sommaire', currentVersion: 'Version actuelle', toTop: 'Haut de page' },
  ru: { goToApp: 'Перейти в Noureon', index: 'Содержание', currentVersion: 'Текущая версия', toTop: 'Наверх' },
  es: { goToApp: 'Ir a Noureon', index: 'Índice', currentVersion: 'Versión actual', toTop: 'Ir arriba' }
});
const UPDATES_TITLE = Object.freeze({
  'zh-TW': '更新紀錄',
  en: 'Update History',
  fr: 'Historique des mises à jour',
  ru: 'История обновлений',
  es: 'Historial de actualizaciones'
});
const GLOBE = '<svg class="pg-globe" viewBox="0 0 256 256" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M128,24A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154,88H102a115.11,115.11,0,0,1,26-45A115.27,115.27,0,0,1,154,88Zm52.33,0H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM107.59,42.4A135.28,135.28,0,0,0,85.29,88H49.63A88.29,88.29,0,0,1,107.59,42.4ZM49.63,168H85.29a135.28,135.28,0,0,0,22.3,45.6A88.29,88.29,0,0,1,49.63,168Zm98.78,45.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z"/></svg>';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const capitalize = (text) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const trimColon = (text) => text.replace(/[：:]\s*$/, '').trim();
// Every language is written, the first is shown, the others are hidden: `render` gets the language and the attributes that say so.
const perLanguage = (render) => LANGUAGES.map((lang, index) => render(lang, `${index ? ' hidden' : ''} data-lang="${lang}" lang="${lang}"`)).join('');

export const PUBLIC_PAGES = Object.freeze({
  terms: {
    path: '/terms',
    kind: 'text',
    title: (lang) => capitalize(i18n[lang].termsOfUse),
    body: (lang) => i18n[lang].termsOfUseDesc
  },
  privacy: {
    path: '/privacy',
    kind: 'text',
    title: (lang) => capitalize(i18n[lang].privacyPolicy),
    body: (lang) => i18n[lang].privacyPolicyDesc
  },
  updates: {
    path: '/updates',
    kind: 'updates',
    title: (lang) => UPDATES_TITLE[lang]
  }
});

/** A text split into its sentences, one paragraph each (the settings keep it as one run of words; the words are not changed). */
export const sentences = (text) => String(text).split(/(?<=。)|(?<=[.!?])\s+(?=[\p{Lu}¿¡])/u).map((part) => part.trim()).filter(Boolean);

// A style written in an old note is dropped: the pages carry their look in pages.css only.
const withoutInlineStyle = (html) => html.replace(/\sstyle=(?:'[^']*'|"[^"]*")/gi, '');

// The notes of every language: Traditional Chinese is the entry itself, the others are src/data/update-logs/{en,fr,ru,es}.js.
const translations = await loadUpdateTranslations();
const contentOf = (log, lang) => (lang === 'zh-TW' ? log.content : translations[lang]?.[log.version] || log.content);

// The notes of one version in one language, as HTML. The notes are trusted HTML kept in the repository (the app shows them the same way).
const renderNotes = (log, lang) => {
  let blocks = parseLogBlocks(contentOf(log, lang).map(withoutInlineStyle));
  // A first line that only says which release this is ("Noureon 17.7.0 release notes") repeats the version above it.
  if (blocks[0]?.type === 'heading' && blocks[0].html.includes(log.version)) blocks = blocks.slice(1);
  return blocks.map((block) => {
    if (block.type === 'heading') return `<h4 class="pg-sec">${trimColon(block.html)}</h4>`;
    if (block.type === 'paragraph') return `<p>${block.html}</p>`;
    return `<ul>${block.items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
  }).join('');
};

// One version: its number, its date and its link are the same in every language; the notes are written once for each language.
const renderVersion = (log) => {
  const id = `v${escapeHtml(log.version)}`;
  return `<article class="pg-ver" id="${id}"><h3><a class="pg-v" href="#${id}">${escapeHtml(log.version)}</a><time class="pg-d">${escapeHtml(log.date)}</time></h3>`
    + perLanguage((lang, attrs) => `<div class="pg-body"${attrs}>${renderNotes(log, lang)}</div>`)
    + '</article>';
};

// The versions grouped by the month of their date, newest first (the notes are in that order already). A date is "2025-10-8" in the oldest notes.
const monthOf = (log) => {
  const [year, month] = String(log.date).split('-');
  return `${year}-${String(month).padStart(2, '0')}`;
};
export const groupByMonth = (logs) => {
  const months = [];
  for (const log of logs) {
    const key = monthOf(log);
    const last = months[months.length - 1];
    if (last && last.key === key) last.logs.push(log);
    else months.push({ key, logs: [log] });
  }
  return months;
};

const description = (page, lang) => {
  if (page.kind !== 'text') return `${page.title(lang)} · Noureon`;
  const first = sentences(page.body(lang))[0] || page.title(lang);
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
};

const renderTextBody = (page) => `<div class="pg-col">${perLanguage((lang, attrs) => `<div class="pg-text"${attrs}>${sentences(page.body(lang)).map((part) => `<p>${escapeHtml(part)}</p>`).join('')}</div>`)}</div>`;

// The index of the update notes: years, the months of a year, and the versions of a month, each level folding open and shut (pages.js does the folding and keeps
// the month in view open). It is meant to stay usable as the notes grow: only one year and one month are open at a time. At the side of the page on a wide window;
// on a narrow one the same index opens as a sheet from the bar that sticks to the top of the window (pages.js copies it into the sheet).
// The first year and the first month are written open; a reader without script gets every fold open (see pages.css).
const monthIndex = (month, open) => `<div class="pg-im${open ? ' is-open' : ''}"><div class="pg-im-row"><a class="pg-im-a" href="#m${month.key}">${month.key}</a>`
  + `<span class="pg-im-n">${month.logs.length}</span>`
  + `<button type="button" class="pg-im-t" aria-expanded="${open}" aria-label="${month.key}"><i class="pg-chev" aria-hidden="true"></i></button></div>`
  + `<div class="pg-fold"><div class="pg-fold-in"><p class="pg-iv">${month.logs.map((log) => `<a href="#v${escapeHtml(log.version)}" data-month="m${month.key}">${escapeHtml(log.version)}</a>`).join('')}</p></div></div></div>`;

const renderIndex = (months) => {
  const years = [];
  for (const month of months) {
    const year = month.key.slice(0, 4);
    const last = years[years.length - 1];
    if (last && last.key === year) last.months.push(month);
    else years.push({ key: year, months: [month] });
  }
  return '<div class="pg-idx">' + years.map((year, yearIndex) => `<section class="pg-iy${yearIndex ? '' : ' is-open'}">`
    + `<button type="button" class="pg-iy-h" aria-expanded="${!yearIndex}"><span>${year.key}</span><i class="pg-chev" aria-hidden="true"></i></button>`
    + `<div class="pg-fold"><div class="pg-fold-in">${year.months.map((month, monthIndexInYear) => monthIndex(month, !yearIndex && !monthIndexInYear)).join('')}</div></div></section>`).join('') + '</div>';
};

const renderUpdatesBody = () => {
  const months = groupByMonth(updateLogEntries);
  const index = renderIndex(months);
  const list = months.map((month) => `<section class="pg-month" id="m${month.key}"><h2>${month.key}</h2>${month.logs.map(renderVersion).join('')}</section>`).join('');
  // The bar of the index sticks to the top of the window when the page is scrolled (on a narrow window); the sheet of the index opens under it.
  const bar = `<div class="pg-stick"><span class="pg-cur" id="pg-cur">${months[0].key}</span>`
    + `<button type="button" class="pg-ix-btn" aria-expanded="false" aria-controls="pg-sheet">${perLanguage((lang, attrs) => `<span${attrs}>${escapeHtml(WORDS[lang].index)}</span>`)}</button>`
    + '<div class="pg-sheet" id="pg-sheet"></div></div>';
  const side = `<nav class="pg-toc" aria-label="Index">${perLanguage((lang, attrs) => `<p class="pg-toc-title"${attrs}>${escapeHtml(WORDS[lang].index)}</p>`)}${index}</nav>`;
  return `${bar}<div class="pg-split"><div class="pg-logs">${list}</div>${side}</div>`;
};

/** The HTML of one page. Every language is in the page (the first is shown, the others hidden) so that a reader without script and a search engine still get the words. */
export function renderPublicPage(name) {
  const page = PUBLIC_PAGES[name];
  if (!page) throw new Error(`Unknown public page: ${name}`);
  const first = LANGUAGES[0];
  const options = LANGUAGES.map((lang) => `<option value="${lang}">${LANGUAGE_NAMES[lang]}</option>`).join('');
  const header = '<header class="pg-header"><a class="pg-brand" href="/"><img class="pg-mark" src="/icon-192.png" width="26" height="26" alt=""><span class="pg-name">Noureon</span></a><div class="pg-tools">'
    + `<label class="pg-lang">${GLOBE}<select id="pg-lang" aria-label="Language">${options}</select></label>`
    + perLanguage((lang, attrs) => `<a class="pg-go" href="/"${attrs} data-title="${escapeHtml(page.title(lang))} · Noureon" data-description="${escapeHtml(description(page, lang))}">${escapeHtml(WORDS[lang].goToApp)}</a>`)
    + '</div></header>';
  const hero = `<div class="pg-hero">${perLanguage((lang, attrs) => `<h1${attrs}>${escapeHtml(page.title(lang))}</h1>`)}`
    + (page.kind === 'updates'
      ? `<p class="pg-meta">${perLanguage((lang, attrs) => `<span${attrs}>${escapeHtml(WORDS[lang].currentVersion)} <b>${escapeHtml(PRODUCT_VERSION)}</b></span>`)}</p>`
      : '')
    + '</div>';
  const footLinks = Object.entries(PUBLIC_PAGES).map(([key, other]) => perLanguage((lang, attrs) => `<a href="${other.path}"${attrs}${key === name ? ' aria-current="page"' : ''}>${escapeHtml(other.title(lang))}</a>`)).join('');
  const footer = `<footer class="pg-footer"><nav class="pg-links">${footLinks}</nav>`
    + perLanguage((lang, attrs) => `<p class="pg-support"${attrs}>${escapeHtml(i18n[lang].supportEmail)}: <a href="mailto:support@noureon.com">support@noureon.com</a></p>`)
    + '</footer>';
  return `<!doctype html>
<html lang="${first}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title(first))} · Noureon</title>
<meta name="description" content="${escapeHtml(description(page, first))}">
<link rel="canonical" href="${SITE}${page.path}">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="stylesheet" href="/pages.css">
<script src="/theme-init.js"></script>
</head>
<body class="pg-${page.kind}">
${header}
<main class="pg-main">${hero}${page.kind === 'updates' ? renderUpdatesBody() : renderTextBody(page)}</main>
${footer}
<button type="button" class="pg-up">${perLanguage((lang, attrs) => `<span class="pg-sr"${attrs}>${escapeHtml(WORDS[lang].toTop)}</span>`)}<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m6 14.5 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<script src="/pages.js" defer></script>
</body>
</html>
`;
}

export async function buildPublicPages(outDir = new URL('../dist/', import.meta.url)) {
  await mkdir(outDir, { recursive: true });
  const names = Object.keys(PUBLIC_PAGES);
  for (const name of names) await writeFile(new URL(`${name}.html`, outDir), renderPublicPage(name));
  return names;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = await buildPublicPages();
  console.log(`Public pages written: ${names.map((name) => `${name}.html`).join(', ')}`);
}
