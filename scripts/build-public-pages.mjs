// The public pages (docs/superpowers/specs/2026-10-08-public-pages-design.md): noureon.com/terms, /privacy and /updates, made at build time
// as plain HTML files in dist/. They need no login and do not load the app. The words of the terms and the privacy policy are the
// ones of the settings (src/data/i18n), the update notes are src/data/update-logs/entries.js, so nothing is kept twice.
// The look and the language switch are two files outside the page (public/pages.css, public/pages.js): the content security policy
// allows no script written in the page.

import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import i18n from '../src/data/i18n/index.js';
import updateLogEntries from '../src/data/update-logs/entries.js';
import { parseLogBlocks } from '../src/app/ui/updates/update-log-view.js';

export const SITE = 'https://noureon.com';
export const LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
const LANGUAGE_NAMES = Object.freeze({ 'zh-TW': '繁體中文', en: 'English', fr: 'Français', ru: 'Русский', es: 'Español' });
const GO_TO_APP = Object.freeze({
  'zh-TW': '前往 Noureon',
  en: 'Go to Noureon',
  fr: 'Aller sur Noureon',
  ru: 'Перейти в Noureon',
  es: 'Ir a Noureon'
});
const UPDATES_TITLE = Object.freeze({
  'zh-TW': '更新紀錄',
  en: 'Update History',
  fr: 'Historique des mises à jour',
  ru: 'История обновлений',
  es: 'Historial de actualizaciones'
});

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const capitalize = (text) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const trimColon = (text) => text.replace(/[：:]\s*$/, '').trim();

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

// One version of the update notes. The notes are trusted HTML kept in the repository (the app shows them the same way). A style written
// in an old note is dropped: the pages carry their look in pages.css only.
const withoutInlineStyle = (html) => html.replace(/\sstyle=(?:'[^']*'|"[^"]*")/gi, '');
const renderVersion = (log) => {
  const blocks = parseLogBlocks(log.content.map(withoutInlineStyle)).map((block) => {
    if (block.type === 'heading') return `<h3 class="pg-sec">${trimColon(block.html)}</h3>`;
    if (block.type === 'paragraph') return `<p>${block.html}</p>`;
    return `<ul>${block.items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
  });
  return `<section class="pg-ver" id="v${escapeHtml(log.version)}">`
    + `<div class="pg-side"><a class="pg-v" href="#v${escapeHtml(log.version)}">${escapeHtml(log.version)}</a><span class="pg-d">${escapeHtml(log.date)}</span></div>`
    + `<div class="pg-body">${blocks.join('')}</div></section>`;
};

const description = (page, lang) => {
  if (page.kind !== 'text') return `${page.title(lang)} · Noureon`;
  const first = page.body(lang).split(/(?<=[.。!?])\s*/u)[0] || page.title(lang);
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
};

/** The HTML of one page. Every language is in the page (the first is shown, the others hidden) so that a reader without script and a search engine still get the words. */
export function renderPublicPage(name) {
  const page = PUBLIC_PAGES[name];
  if (!page) throw new Error(`Unknown public page: ${name}`);
  const top = LANGUAGES.map((lang, index) => `<div class="pg-top" data-lang="${lang}" lang="${lang}" data-title="${escapeHtml(page.title(lang))} · Noureon" data-description="${escapeHtml(description(page, lang))}"${index ? ' hidden' : ''}>`
    + `<a class="pg-home" href="/">${escapeHtml(GO_TO_APP[lang])}</a></div>`).join('');
  const heading = LANGUAGES.map((lang, index) => `<h1 data-lang="${lang}" lang="${lang}"${index ? ' hidden' : ''}>${escapeHtml(page.title(lang))}</h1>`).join('');
  const body = page.kind === 'updates'
    ? `<div class="pg-logs">${updateLogEntries.map(renderVersion).join('')}</div>`
    : LANGUAGES.map((lang, index) => `<p class="pg-text" data-lang="${lang}" lang="${lang}"${index ? ' hidden' : ''}>${escapeHtml(page.body(lang))}</p>`).join('');
  const foot = LANGUAGES.map((lang, index) => `<p data-lang="${lang}" lang="${lang}"${index ? ' hidden' : ''}>${escapeHtml(i18n[lang].supportEmail)}: <a href="mailto:support@noureon.com">support@noureon.com</a></p>`).join('');
  const options = LANGUAGES.map((lang) => `<option value="${lang}">${LANGUAGE_NAMES[lang]}</option>`).join('');
  const first = LANGUAGES[0];
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
</head>
<body>
<header class="pg-bar">${top}<select id="pg-lang" aria-label="Language">${options}</select></header>
<main class="pg-main">${heading}${body}</main>
<footer class="pg-foot">${foot}</footer>
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
