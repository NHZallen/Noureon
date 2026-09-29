import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import JSZip from 'jszip';

import { createEstimatingMeasurer } from '../../src/app/ui/files/design/text-layout.js';
import { eligibleVisionFiles, freeDecks } from '../../src/app/ui/files/vision/vision-eligibility.js';
import { parseVisionResponse } from '../../src/app/ui/files/vision/vision-prompt.js';
import { buildFixRequest, buildFreeVisionMetadata, buildFreeVisionPrompt, buildFreeVisionResult, slideOutline } from '../../src/app/ui/files/vision/vision-free.js';
import { VISION_TEXTS, visionText } from '../../src/app/ui/files/vision/vision-texts.js';
import { layoutFreePresentation } from '../../src/app/ui/sandbox/free-slide-layout.js';
import { readPresentation } from '../../src/app/ui/sandbox/pptx-reader.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const deck = new Blob([readFileSync(new URL('./fixtures/free-deck.pptx', import.meta.url))]);
const part = (name, data = 'AAAA', id = `id-${name}`) => ({ sandboxFile: { id, name, mimeType: 'application/octet-stream', size: 3, data } });
const vision = () => true;

const layout = async () => {
  const { window, cleanup } = createDom('');
  try {
    const model = await readPresentation(deck, { JSZip, DOMParser: window.DOMParser });
    return layoutFreePresentation(model, { measure: createEstimatingMeasurer() }).layout;
  } finally {
    cleanup();
  }
};

test('a saved deck Python drew is checked once, like a designed deck', () => {
  const message = { parts: [{ text: 'done' }, part('deck.pptx'), part('data.csv'), part('old.pptx', '')] };
  assert.deepEqual(freeDecks(message), [{ id: 'id-deck.pptx', name: 'deck.pptx', free: true }], 'only decks whose bytes are here');
  const base = { conversation: { id: 'c' }, message, model: { id: 'm' }, config: {}, signal: new AbortController().signal, modelSupportsVision: vision };
  assert.deepEqual(eligibleVisionFiles(base).map((file) => file.name), ['deck.pptx']);
  assert.deepEqual(eligibleVisionFiles({ ...base, message: { ...message, metadata: { visionChecked: ['id-deck.pptx'] } } }), []);
  assert.deepEqual(eligibleVisionFiles({ ...base, message: { ...message, metadata: { visionCheck: {} } } }), [], 'the redone reply is not checked again');
  assert.deepEqual(eligibleVisionFiles({ ...base, config: { visionCheckEnabled: false } }), []);
  assert.deepEqual(eligibleVisionFiles({ ...base, modelSupportsVision: () => false }), []);
});

test('the model is shown the text of every slide and asked for problems only', async () => {
  const slides = await layout();
  const outline = slideOutline(slides);
  assert.match(outline, /^Slide 1: 第一季營收報告/);
  assert.match(outline, /Slide 3: 自由排版 italic/);
  assert.equal(outline.split('\n').length, 4);
  const prompt = buildFreeVisionPrompt({ file: { name: 'deck.pptx' }, layout: slides, uiLanguage: 'fr' });
  assert.match(prompt, /approximate preview, not by PowerPoint/);
  assert.match(prompt, /in French/);
  assert.doesNotMatch(prompt, /"edits"/, 'a free deck has no operations to apply');
  assert.deepEqual(parseVisionResponse('{"issues":[{"slide":2,"category":"layout","problem":"p","fix":"f"}],"summary":"s"}', { requireEdits: false }).issues.length, 1);
  assert.throws(() => parseVisionResponse('{"issues":[]}'), /invalid vision response/, 'designed decks still need their edits');
});

test('the fix request lists the problems and names the file', () => {
  const issues = [{ slide: 2, category: 'text', problem: 'Title overflows.', fix: 'Shorten it.' }, { slide: 4, category: 'chart', problem: 'Labels overlap.', fix: 'Rotate them.' }];
  const request = buildFixRequest({ issues, file: { name: 'deck.pptx' }, uiLanguage: 'zh-TW' });
  assert.match(request, /- Slide 2 \(text\): Title overflows\. Suggested change: Shorten it\./);
  assert.match(request, /\/output\/deck\.pptx/);
  assert.match(request, /Traditional Chinese/);
});

test('the reply reports the problems, then what the model said, in every language', () => {
  const result = { issues: [{ slide: 3, category: 'layout', problem: 'Crowded.', fix: 'Split.' }], summary: 'One slide was crowded.' };
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    const text = buildFreeVisionResult({ result, language, checkedSlides: 24, totalSlides: 30, answer: 'Redone.' });
    assert.ok(text.startsWith(visionText(language, 'freeHeading', { found: 1 })), language);
    assert.ok(text.includes(`${visionText(language, 'slide', { number: 3 })}`), language);
    assert.ok(text.includes(visionText(language, 'partial', { count: 24 })), language);
    assert.ok(text.endsWith('Redone.'), language);
    for (const key of ['fixing', 'freeHeading', 'freeNoFile']) assert.ok(VISION_TEXTS[language][key], `${language} ${key}`);
  }
  const metadata = buildFreeVisionMetadata({ file: { id: 'f', name: 'deck.pptx' }, model: { name: 'M' }, result, checkedSlides: 4, totalSlides: 4 });
  assert.deepEqual([metadata.sourceFileId, metadata.model, metadata.free, metadata.issues.length], ['f', 'M', true, 1]);
});
