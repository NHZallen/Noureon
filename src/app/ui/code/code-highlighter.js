// Syntax colouring for code: highlight.js with the languages people ask for
// most, and VS Code's colours (Dark+ on the chat's dark code blocks, Light+
// on light ones such as the file preview's source view). Loaded on first use.
//
// highlight.js escapes the text it colours and only adds <span class="hljs-…">
// elements, so the result is safe to put back into the code element.

import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES = { bash, c, cpp, csharp, css, diff, go, ini, java, javascript, json, kotlin, markdown, php, python, ruby, rust, scss, sql, swift, typescript, xml, yaml };
Object.entries(LANGUAGES).forEach(([name, language]) => hljs.registerLanguage(name, language));
hljs.registerAliases(['sh', 'shell', 'zsh', 'console'], { languageName: 'bash' });
hljs.registerAliases(['html', 'htm', 'svg', 'vue'], { languageName: 'xml' });
hljs.registerAliases(['toml', 'conf', 'env'], { languageName: 'ini' });
hljs.registerAliases(['md'], { languageName: 'markdown' });
hljs.registerAliases(['js', 'jsx', 'mjs', 'cjs'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });

// Larger code is left plain: colouring it would hold up the page.
const MAX_CHARACTERS = 200_000;

// VS Code's Dark+ and Light+ token colours.
const THEMES = {
  dark: {
    base: '#D4D4D4', keyword: '#569CD6', control: '#C586C0', type: '#4EC9B0', string: '#CE9178', number: '#B5CEA8',
    comment: '#6A9955', func: '#DCDCAA', variable: '#9CDCFE', tag: '#569CD6', attr: '#9CDCFE', regexp: '#D16969',
    selector: '#D7BA7D', meta: '#9B9B9B', section: '#569CD6', bullet: '#6796E6', addition: '#B5CEA8', deletion: '#CE9178'
  },
  light: {
    base: '#1F1F1F', keyword: '#0000FF', control: '#AF00DB', type: '#267F99', string: '#A31515', number: '#098658',
    comment: '#008000', func: '#795E26', variable: '#001080', tag: '#800000', attr: '#E50000', regexp: '#811F3F',
    selector: '#800000', meta: '#616161', section: '#800000', bullet: '#0451A5', addition: '#098658', deletion: '#A31515'
  }
};

function themeRules(scope, t) {
  const rule = (classes, declarations) => `${classes.map((name) => `${scope} .hljs-${name}`).join(', ')} { ${declarations} }`;
  return [
    rule(['keyword', 'literal'], `color: ${t.keyword};`),
    rule(['type', 'title.class_', 'title.class_.inherited__', 'built_in'], `color: ${t.type};`),
    rule(['string', 'char.escape_'], `color: ${t.string};`),
    rule(['number'], `color: ${t.number};`),
    rule(['comment', 'quote'], `color: ${t.comment}; font-style: italic;`),
    rule(['title', 'title.function_', 'function .hljs-title'], `color: ${t.func};`),
    rule(['variable', 'params', 'property', 'template-variable', 'variable.language_'], `color: ${t.variable};`),
    rule(['attr', 'attribute'], `color: ${t.variable};`),
    rule(['name'], `color: ${t.tag};`),
    rule(['tag .hljs-attr'], `color: ${t.attr};`),
    rule(['regexp', 'link'], `color: ${t.regexp};`),
    rule(['selector-tag', 'selector-class', 'selector-id', 'selector-pseudo', 'selector-attr'], `color: ${t.selector};`),
    rule(['meta', 'meta .hljs-keyword', 'doctag'], `color: ${t.meta};`),
    rule(['meta .hljs-string'], `color: ${t.string};`),
    rule(['section'], `color: ${t.section}; font-weight: 600;`),
    rule(['bullet'], `color: ${t.bullet};`),
    rule(['emphasis'], 'font-style: italic;'),
    rule(['strong'], 'font-weight: 600;'),
    rule(['addition'], `color: ${t.addition};`),
    rule(['deletion'], `color: ${t.deletion};`),
    rule(['subst', 'punctuation', 'operator'], `color: ${t.base};`)
  ].join('\n');
}

const STYLE_ID = 'noureon-code-highlight';

// Chat code blocks are dark except over a light custom wallpaper; the file
// preview's source view is light.
const STYLE = [
  themeRules('.prose pre code', THEMES.dark),
  themeRules('body.custom-wallpaper-active:not(.wallpaper-is-dark) .model-message .message-bubble .prose pre code', THEMES.light),
  // The process list's code (ledger.css) sits on the page itself, unboxed: light colours, dark ones on a dark wallpaper.
  // Saved in a reply it is also inside .prose, whose dark rules are more specific, hence the second scope.
  ...['.ledger-code code', '.sandbox-run .ledger-code code'].flatMap((scope) => [
    themeRules(scope, THEMES.light),
    `${scope} { color: ${THEMES.light.base}; }`,
    themeRules(`body.custom-wallpaper-active.wallpaper-is-dark ${scope}`, THEMES.dark),
    `body.custom-wallpaper-active.wallpaper-is-dark ${scope} { color: ${THEMES.dark.base}; }`
  ]),
  themeRules('.ac-file-preview-source code', THEMES.light),
  `.ac-file-preview-source code { color: ${THEMES.light.base}; }`
].join('\n');

export function installHighlightStyles(document) {
  if (!document?.head || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const LANGUAGE_CLASS = /(?:^|\s)(?:language|lang)-([\w#+.-]+)/i;

/** The language a code element names (class="language-js"), if known. */
export function declaredLanguage(code) {
  const name = LANGUAGE_CLASS.exec(code.className || '')?.[1]?.toLowerCase();
  if (!name) return null;
  if (name === 'text' || name === 'plaintext' || name === 'txt') return 'plaintext';
  return hljs.getLanguage(name) ? name : null;
}

/**
 * Colours one <code> element in place. `language` overrides its class;
 * without either, the language is guessed and only a confident guess is
 * used (plain text stays plain).
 */
export function highlightCode(code, { language = null } = {}) {
  if (!code || code.dataset.highlighted === 'true') return false;
  const text = code.textContent || '';
  code.dataset.highlighted = 'true';
  if (!text.trim() || text.length > MAX_CHARACTERS) return false;
  const chosen = language || declaredLanguage(code);
  if (chosen === 'plaintext') return false;
  let result;
  try {
    if (chosen && hljs.getLanguage(chosen)) {
      result = hljs.highlight(text, { language: chosen, ignoreIllegals: true });
    } else {
      result = hljs.highlightAuto(text);
      if (!result.language || result.relevance < 6) return false;
    }
  } catch {
    return false;
  }
  code.innerHTML = result.value;
  code.classList.add('hljs');
  return true;
}
