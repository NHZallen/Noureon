import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HOME_FACTS } from '../src/data/home-texts.js';
import { LEGAL, LEGAL_DOCUMENTS, LEGAL_LANGUAGES, documentTexts } from '../src/data/legal/index.js';
import { LIMITS } from '../server/protocol.js';
import { renderPrivacyMarkdown } from '../scripts/generate-privacy-md.mjs';
import settingsFragment from '../src/templates/fragments/04-shell.fragment.js';

const shapeOf = (doc) => doc.sections.map((section) => `${section.id}:${section.blocks.map((block) => (Array.isArray(block) ? `[${block.length}]` : 'p')).join(',')}`);
const textOf = (lang, name) => documentTexts(LEGAL[lang][name]).join('\n');
const hasNumber = (text, number) => new RegExp(`(?<![\\d.,])${number}(?![\\d])`).test(text);

// The sections that must never be dropped, whatever else changes (the ids are the same in every language).
const REQUIRED_SECTIONS = {
  help: ['start', 'accounts', 'chat', 'council', 'research', 'search', 'attachments', 'files', 'images', 'advanced', 'extensions', 'server', 'memory', 'data', 'appearance', 'troubleshooting', 'contact', 'opensource'],
  terms: ['service', 'accounts', 'content', 'ai', 'providers', 'server', 'extensions', 'acceptable', 'ip', 'privacy', 'changes', 'disclaimer', 'liability', 'update', 'general', 'contact'],
  privacy: ['summary', 'controller', 'local', 'cloud', 'providers', 'sent', 'server', 'features', 'memory', 'voice', 'p2p', 'logs', 'analytics', 'retention', 'rights', 'children', 'thirdparties', 'selfhost', 'changes', 'contact']
};

// Names that are written the same in every language: if a document stops naming one of them, a feature or a service went missing.
const REQUIRED_NAMES = {
  help: ['Gemini', 'OpenRouter', 'NVIDIA', 'Tavily', 'TinyFish', 'GPT Image', 'FLUX', 'Nano Banana', 'PPTX', 'DOCX', 'XLSX', 'PDF', 'ZIP', 'Markdown', 'SKILL.md', 'Pandoc', 'FFmpeg', 'yt-dlp', 'csvkit', 'Pyodide', 'jsDelivr', 'Turnstile', 'PWA', 'QR', 'run.noureon.com', 'support@noureon.com', '@NoureonAi', 'github.com/NHZallen/Noureon', 'noureon.com/updates', 'Embedding'],
  terms: ['Gemini', 'OpenRouter', 'NVIDIA', 'Tavily', 'TinyFish', 'Supabase', 'Cloudflare', 'GitHub', 'Vercel', 'MIT', 'PWA', 'support@noureon.com', '@NoureonAi'],
  privacy: ['Supabase', 'Cloudflare Turnstile', 'Google', 'Gemini', 'OpenRouter', 'NVIDIA', 'Tavily', 'TinyFish', 'GitHub', 'Vercel', 'jsDelivr', 'PeerJS', '0.peerjs.com', 'Pyodide', 'run.noureon.com', 'AES-256-GCM', 'HTTPS', 'CSP', 'IndexedDB', 'localStorage', 'Embedding', 'Decisions', 'pypi.org', 'files.pythonhosted.org', 'registry.npmjs.org', 'github.com', '/api/google-form-submit', 'support@noureon.com', '@NoureonAi', 'noureon.com/updates', 'PRIVACY.md']
};

test('the three documents exist in the five languages, with the same sections, in the same order, with the same paragraphs and lists', () => {
  assert.deepEqual([...LEGAL_LANGUAGES], ['zh-TW', 'en', 'fr', 'ru', 'es']);
  assert.deepEqual([...LEGAL_DOCUMENTS], ['help', 'terms', 'privacy']);
  for (const name of LEGAL_DOCUMENTS) {
    const reference = shapeOf(LEGAL['zh-TW'][name]);
    for (const lang of LEGAL_LANGUAGES) {
      const doc = LEGAL[lang][name];
      assert.deepEqual(shapeOf(doc), reference, `${lang} ${name} has the structure of zh-TW`);
      assert.equal(doc.intro.length, LEGAL['zh-TW'][name].intro.length, `${lang} ${name} introduction`);
      for (const text of documentTexts(doc)) assert.ok(typeof text === 'string' && text.trim().length > 0, `${lang} ${name} has an empty text`);
      const ids = doc.sections.map((section) => section.id);
      assert.equal(new Set(ids).size, ids.length, `${lang} ${name} section ids are unique`);
    }
  }
});

test('no section that a document must have has been dropped', () => {
  for (const [name, required] of Object.entries(REQUIRED_SECTIONS)) {
    for (const lang of LEGAL_LANGUAGES) {
      const ids = LEGAL[lang][name].sections.map((section) => section.id);
      for (const id of required) assert.ok(ids.includes(id), `${lang} ${name} lacks the section ${id}`);
    }
  }
});

test('every document still names the services and features it has to, in every language', () => {
  for (const [name, names] of Object.entries(REQUIRED_NAMES)) {
    for (const lang of LEGAL_LANGUAGES) {
      const text = textOf(lang, name);
      for (const required of names) assert.ok(text.includes(required), `${lang} ${name} no longer mentions ${required}`);
    }
  }
});

test('the limits and the numbers written in the documents are the ones of the server and of the application', async () => {
  const { RESEARCH_LIMITS } = await import('../server/research.js');
  const minutes = (ms) => ms / 60000;
  const hours = (ms) => ms / 3600000;
  for (const lang of LEGAL_LANGUAGES) {
    const privacy = textOf(lang, 'privacy');
    const help = textOf(lang, 'help');
    const terms = textOf(lang, 'terms');
    const both = `${help}\n${privacy}`;
    for (const number of [hours(LIMITS.maxRunMs), hours(LIMITS.researchKeyTtlMs), minutes(LIMITS.imageKeyTtlMs), minutes(LIMITS.councilCallMs), LIMITS.maxRunsPerUser, LIMITS.createPerMinute, LIMITS.maxRequestBytes / 1048576, 500]) {
      assert.ok(hasNumber(both, number), `${lang} help and privacy should mention ${number}`);
    }
    assert.ok(/2\s*(?:h|ч|小時|hours?|horas?|heures?)\s*(?:15|y 15)/i.test(privacy) || privacy.includes('2 小時 15'), `${lang} privacy states the 2 hours 15 minutes`);
    for (const number of [hours(LIMITS.maxRunMs), hours(LIMITS.maxResearchRunMs), minutes(LIMITS.councilCallMs), LIMITS.maxRunsPerUser, LIMITS.createPerMinute, LIMITS.maxRequestBytes / 1048576, 500]) {
      assert.ok(hasNumber(terms, number), `${lang} terms should mention ${number}`);
    }
    for (const number of [RESEARCH_LIMITS.countdownMs / 1000, RESEARCH_LIMITS.holdMs / 60000, RESEARCH_LIMITS.maxCalls, RESEARCH_LIMITS.maxActiveMs / 60000, RESEARCH_LIMITS.maxPauseMs / 3600000, RESEARCH_LIMITS.maxItems, RESEARCH_LIMITS.maxRunMs / 3600000]) {
      assert.ok(hasNumber(help, number), `${lang} help should mention ${number} for deep research`);
    }
    for (const number of [HOME_FACTS.models, HOME_FACTS.vendors, HOME_FACTS.deckDesigns, HOME_FACTS.documentStyles, HOME_FACTS.skills, HOME_FACTS.cliTools, HOME_FACTS.councilMin, HOME_FACTS.councilMax]) {
      assert.ok(hasNumber(help, number), `${lang} help should mention ${number}`);
    }
  }
});

test('the documents say when they were written, and the date is the same in every language', () => {
  for (const name of LEGAL_DOCUMENTS) {
    for (const lang of LEGAL_LANGUAGES) assert.match(LEGAL[lang][name].updated, /2026/, `${lang} ${name} date`);
  }
});

test('the privacy policy of the repository (PRIVACY.md) is made from the English one and is up to date', () => {
  assert.equal(readFileSync(new URL('../PRIVACY.md', import.meta.url), 'utf8'), renderPrivacyMarkdown());
});

test('the settings open the help center page, like the terms and the privacy policy', () => {
  assert.match(settingsFragment, /<a class="pz-nav" href="\/help" target="_blank" rel="noopener"><span data-lang-key="helpCenter">/);
  assert.doesNotMatch(settingsFragment, /helpCenterDesc/, 'the help center is a page, not a line of the settings');
});
