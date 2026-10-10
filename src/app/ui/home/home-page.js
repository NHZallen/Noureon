// The home page shown before sign-in (docs/superpowers/specs/2026-10-10-homepage-design.md). The first screen, the sign-in form and the footer are in the
// shell (templates/fragments/00-shell.fragment.js), written in Traditional Chinese, so the form never waits for anything. This file, loaded once the
// sign-in page is shown, builds what lies between them (the three scrolling stories and the sections after them) and puts the words of the chosen
// language into everything marked data-hm. It follows the language (<html lang>) and the theme (<html data-theme>), which the sign-in page's
// own language menu and the colour scheme set.

import { HOME_BRANDS, HOME_TEXTS } from '../../../data/home-texts.js';
import { createColorScheme } from '../../runtime/features/color-scheme.js';
import { HOME_EXTENSIONS_IMAGE, HOME_STORIES, homeImagePath } from './home-frames.js';
import { installHomeScroll, installReveal } from './home-scroll.js';

const DEFAULT_LANGUAGE = 'zh-TW';

const ICONS = {
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-5-5L5 21"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  ghost: '<path d="M12 3a7 7 0 0 0-7 7v11l3-2 2 2 2-2 2 2 2-2 3 2V10a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="10" r=".6"/><circle cx="14.5" cy="10" r=".6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
};

const textAt = (texts, path) => path.split('.').reduce((node, key) => (node == null ? node : node[key]), texts);

/** A line break in the words is written \n; it is shown as a break, never as markup. */
export function setHomeText(node, value) {
  const doc = node.ownerDocument;
  node.textContent = '';
  const lines = String(value).split('\n');
  lines.forEach((line, index) => {
    // Where the break is hidden (a phone) the lines must still be apart: a space after a line that does not end in Chinese.
    const spaced = index < lines.length - 1 && /[^\u3000-\u9fff\uff00-\uffef]$/.test(line);
    node.append(doc.createTextNode(spaced ? `${line} ` : line));
    if (index < lines.length - 1) node.append(doc.createElement('br'));
  });
}

const resolveLanguage = (document) => (HOME_TEXTS[document.documentElement.lang] ? document.documentElement.lang : DEFAULT_LANGUAGE);
const resolveTheme = (document) => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

function createBuilder(document) {
  return (tag, className, attributes = {}, children = []) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.append(...[].concat(children));
    return node;
  };
}

function buildImage(h, name) {
  const img = h('img', '', { alt: '', decoding: 'async' });
  img.dataset.name = name;
  return img;
}

function buildWindow(h, { width, height, imageNames, frames }) {
  const win = h('div', 'hm-win', { style: `--ar0:${width} / ${height};--wr0:${(width / height).toFixed(4)}` }, [
    h('div', 'hm-wlab', { 'data-hm': 'window' }),
    h('div', imageNames ? 'hm-wbody' : 'hm-wbody hm-static', {}, frames)
  ]);
  return win;
}

function buildStory(h, story) {
  const captions = story.captions.map((from, index) => h('div', index === 0 ? 'hm-cap on' : 'hm-cap', { 'data-from': String(from) }, [
    h('small', '', {}, [h('span', '', { 'data-hm': `stories.${story.id}.eyebrow` }), h('b', '', {}, `${index + 1} / ${story.captions.length}`)]),
    h('h2', '', { 'data-hm': `stories.${story.id}.caps.${index}.h` }),
    h('p', '', { 'data-hm': `stories.${story.id}.caps.${index}.p` }),
    h('ul', 'hm-facts', { 'data-hm-list': `stories.${story.id}.caps.${index}.facts` })
  ]));
  const steps = h('div', 'hm-steps', {}, story.captions.map(() => h('i', '', {}, h('b'))));
  const frames = story.frames.map(([name, at]) => h('div', 'hm-fr', { 'data-at': String(at) }, buildImage(h, `${story.id}-${name}`)));
  const win = buildWindow(h, { width: story.width, height: story.height, imageNames: true, frames });
  return h('section', 'hm-story', { id: `hm-${story.id}` }, [
    h('div', 'hm-pin', {}, [h('div', 'hm-caps', {}, [...captions, steps]), h('div', 'hm-stage', {}, win)])
  ]);
}

function buildSections(h, document) {
  const rv = (className, attributes, children) => h('div', `${className} hm-rv`, attributes, children);
  const section = (id, children, className = 'hm-sec') => h('section', className, id ? { id } : {}, children);

  const brands = h('section', 'hm-brands', {}, [
    h('p', '', { 'data-hm': 'brands' }),
    h('div', 'hm-brandrow', {}, HOME_BRANDS.map((name) => h('span', '', {}, name)))
  ]);

  const extensions = section('hm-extensions', [
    rv('hm-ext', {}, [
      h('div', '', {}, [
        h('div', 'hm-eyebrow', { 'data-hm': 'ext.eyebrow' }),
        h('h2', '', { 'data-hm': 'ext.title' }),
        h('p', 'hm-lead', { 'data-hm': 'ext.lead' }),
        h('ul', 'hm-facts', { 'data-hm-list': 'ext.facts' })
      ]),
      h('div', 'hm-extshot', {}, buildWindow(h, { ...HOME_EXTENSIONS_IMAGE, imageNames: false, frames: buildImage(h, HOME_EXTENSIONS_IMAGE.name) }))
    ])
  ]);

  const stats = section('', [
    h('div', 'hm-eyebrow', { 'data-hm': 'stats.eyebrow' }),
    h('h2', '', { 'data-hm': 'stats.title' }),
    h('div', 'hm-stats', { 'data-hm-stats': 'stats.items' })
  ]);

  const server = section('', [
    h('div', 'hm-server', {}, [
      h('div', '', {}, [
        h('div', 'hm-eyebrow', { 'data-hm': 'server.eyebrow' }),
        h('h2', '', { 'data-hm': 'server.title' }),
        h('p', 'hm-lead', { 'data-hm': 'server.lead' })
      ]),
      h('div', '', { 'data-hm-rows': 'server.rows' })
    ])
  ]);

  const more = section('', [
    h('div', 'hm-eyebrow', { 'data-hm': 'more.eyebrow' }),
    h('h2', '', { 'data-hm': 'more.title' }),
    h('div', 'hm-grid', { 'data-hm-tiles': 'more.tiles' })
  ]);

  const trust = section('hm-privacy', [
    h('div', 'hm-trust', {}, [
      h('div', 'hm-eyebrow', { 'data-hm': 'trust.eyebrow' }),
      h('h2', '', { 'data-hm': 'trust.title' }),
      h('div', 'hm-trow', { 'data-hm-items': 'trust.items' }),
      h('div', 'hm-trust-links', {}, [
        h('a', 'hm-pill hm-sm', { href: 'https://github.com/NHZallen/Noureon', target: '_blank', rel: 'noopener noreferrer', 'data-hm': 'trust.source' }),
        h('a', 'hm-pill hm-sm hm-out', { href: '/privacy', target: '_blank', rel: 'noopener', 'data-hm': 'trust.policy' })
      ])
    ])
  ]);

  return [brands, ...HOME_STORIES.map((story) => buildStory(h, story)), extensions, stats, server, more, trust];
}

/** Lists whose items are made from the words (their number is the same in every language; tests/home-page.test.js checks it). */
function fillLists(h, container, texts) {
  const doc = container.ownerDocument;
  const fill = (host, items, make) => {
    if (host.childElementCount !== items.length) host.replaceChildren(...items.map((item, index) => make(item, index)));
    return [...host.children];
  };
  container.querySelectorAll('[data-hm-list]').forEach((host) => {
    const items = textAt(texts, host.dataset.hmList) || [];
    fill(host, items, () => h('li')).forEach((li, index) => { li.textContent = items[index]; });
  });
  container.querySelectorAll('[data-hm-stats]').forEach((host) => {
    const items = textAt(texts, host.dataset.hmStats) || [];
    fill(host, items, () => h('div', 'hm-stat hm-rv', {}, [h('b'), h('span')])).forEach((node, index) => {
      node.querySelector('b').textContent = items[index][0];
      node.querySelector('span').textContent = items[index][1];
    });
  });
  container.querySelectorAll('[data-hm-rows]').forEach((host) => {
    const items = textAt(texts, host.dataset.hmRows) || [];
    fill(host, items, () => h('div', 'hm-srow hm-rv', {}, [h('b'), h('span')])).forEach((node, index) => {
      node.querySelector('b').textContent = items[index][0];
      node.querySelector('span').textContent = items[index][1];
    });
  });
  container.querySelectorAll('[data-hm-tiles]').forEach((host) => {
    const items = textAt(texts, host.dataset.hmTiles) || [];
    fill(host, items, ([icon]) => {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      for (const [name, value] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(name, value);
      svg.innerHTML = ICONS[icon] || '';
      return h('div', 'hm-tile hm-rv', {}, [svg, h('b'), h('span')]);
    }).forEach((node, index) => {
      node.querySelector('b').textContent = items[index][1];
      node.querySelector('span').textContent = items[index][2];
    });
  });
  container.querySelectorAll('[data-hm-items]').forEach((host) => {
    const items = textAt(texts, host.dataset.hmItems) || [];
    fill(host, items, () => h('div', 'hm-rv', {}, [h('b'), h('span')])).forEach((node, index) => {
      node.querySelector('b').textContent = items[index][0];
      node.querySelector('span').textContent = items[index][1];
    });
  });
}

export function applyHomeTexts({ document, container, language }) {
  const h = createBuilder(document);
  const texts = HOME_TEXTS[language] || HOME_TEXTS[DEFAULT_LANGUAGE];
  container.querySelectorAll('[data-hm]').forEach((node) => {
    const value = textAt(texts, node.dataset.hm);
    if (typeof value === 'string') setHomeText(node, value);
  });
  container.querySelectorAll('[data-hm-label]').forEach((node) => {
    const value = textAt(texts, node.dataset.hmLabel);
    if (typeof value === 'string') node.setAttribute('aria-label', value);
  });
  container.querySelectorAll('[data-hm-title]').forEach((node) => {
    const value = textAt(texts, node.dataset.hmTitle);
    if (typeof value === 'string') node.setAttribute('title', value);
  });
  fillLists(h, container, texts);
}

function applyImages({ container, language, theme }) {
  container.querySelectorAll('img[data-name]').forEach((img) => {
    const story = img.closest('.hm-story');
    // Only what is near the screen is fetched; the extensions picture asks for its own turn.
    if (story ? story.dataset.near !== '1' : img.dataset.near !== '1') return;
    const source = homeImagePath(language, theme, img.dataset.name);
    if (img.getAttribute('src') !== source) img.setAttribute('src', source);
  });
}

export function mountHomePage({ document = globalThis.document, window = globalThis.window } = {}) {
  const container = document.getElementById('auth-container');
  const host = document.getElementById('hm-dynamic');
  if (!container || !host || host.dataset.mounted === '1') return null;
  host.dataset.mounted = '1';
  const h = createBuilder(document);
  host.replaceChildren(...buildSections(h, document));

  const state = { language: resolveLanguage(document), theme: resolveTheme(document) };
  const render = () => {
    applyHomeTexts({ document, container, language: state.language });
    applyImages({ container, ...state });
  };
  render();

  // What comes near the screen gets its pictures.
  const markNear = (node) => {
    if (node.dataset.near === '1') return;
    node.dataset.near = '1';
    applyImages({ container, ...state });
  };
  const stopScroll = installHomeScroll({ window, document, container, onNear: markNear });
  const ext = container.querySelector('.hm-extshot img');
  if ('IntersectionObserver' in window && ext) {
    const observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        ext.dataset.near = '1';
        applyImages({ container, ...state });
        observer.disconnect();
      }
    }, { rootMargin: '150% 0px' });
    observer.observe(ext);
  } else if (ext) {
    ext.dataset.near = '1';
    applyImages({ container, ...state });
  }
  installReveal({ window, container });

  const follow = new window.MutationObserver(() => {
    const next = { language: resolveLanguage(document), theme: resolveTheme(document) };
    if (next.language === state.language && next.theme === state.theme) return;
    const languageChanged = next.language !== state.language;
    Object.assign(state, next);
    if (languageChanged) applyHomeTexts({ document, container, language: state.language });
    applyImages({ container, ...state });
  });
  follow.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme'] });

  // The person may choose light or dark here too: it is kept for the next visit like the choice in the settings (color-scheme.js).
  const scheme = createColorScheme({ window, document });
  const themeButton = document.getElementById('hm-theme-btn');
  const toggleTheme = () => scheme.apply(resolveTheme(document) === 'dark' ? 'light' : 'dark');
  themeButton?.addEventListener('click', toggleTheme);

  return () => {
    follow.disconnect();
    themeButton?.removeEventListener('click', toggleTheme);
    scheme.dispose();
    stopScroll();
    host.dataset.mounted = '0';
  };
}
