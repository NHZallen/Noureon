import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { parseDocumentSpec } from '../../src/app/ui/files/design/document-spec.js';
import { serializeDeckSpec } from '../../src/app/ui/files/design/spec-serializer.js';
import { layoutPresentation } from '../../src/app/ui/files/design/slide-engine.js';
import { applyVisionEdits } from '../../src/app/ui/files/vision/vision-edits.js';
import { eligibleVisionFiles } from '../../src/app/ui/files/vision/vision-eligibility.js';
import { buildVisionPrompt, parseVisionResponse } from '../../src/app/ui/files/vision/vision-prompt.js';
import { visionText } from '../../src/app/ui/files/vision/vision-texts.js';
import { createVisionProgress } from '../../src/app/ui/files/vision/vision-progress.js';
import { buildVisionResult, buildVisionMetadata } from '../../src/app/ui/files/vision/vision-result.js';
import { groupReviewedSlides } from '../../src/app/ui/files/vision/vision-sheet-plan.js';
import { mergeAdjacentModelMessages } from '../../src/app/legacy-runtime/features/stream-api-call.js';
import { createConversationImageResolver } from '../../src/app/ui/files/conversation-images.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-deck.json', import.meta.url), 'utf8'));
const parse = (raw, language = 'en') => parseDocumentSpec(JSON.stringify(raw), { uiLanguage: language }).spec;
const sample = () => parse(fixture.en);

test('the visual check is a step list under the message it checks, in five languages, and stops on request', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    const window = new Window();
    const { document } = window;
    const stack = document.createElement('div');
    document.body.append(stack);
    const controller = new AbortController();
    const progress = createVisionProgress({ document, language, controller, host: stack });
    const list = stack.querySelector('.ledger');
    assert.ok(list, 'the list is inside the message');
    assert.equal(list.querySelector('.ledger-heading-text').textContent, visionText(language, 'ledgerTitle'));
    progress.set('preparing');
    assert.equal(list.querySelector('.ledger-row.is-running .ledger-label').textContent, visionText(language, 'preparing'));

    progress.slideRendered({ index: 0, total: 4, number: 1, url: 'data:image/jpeg;base64,AA' });
    progress.slideRendered({ index: 1, total: 4, number: 2, url: 'data:image/jpeg;base64,BB' });
    assert.equal(list.querySelectorAll('.ledger-thumb').length, 4, 'a cell for every slide');
    assert.equal(list.querySelectorAll('.ledger-thumb img').length, 2, 'drawn slides show their picture');
    assert.equal(list.querySelectorAll('.ledger-thumb.is-current').length, 1);
    assert.equal(list.querySelector('.ledger-row.is-running .ledger-label').textContent, visionText(language, 'slideProgress', { n: 2, total: 4 }));
    assert.equal(list.querySelectorAll('.ledger-row.is-done').length, 1, 'the step before is done');

    progress.sheetReady({ index: 0, total: 1, url: 'data:image/jpeg;base64,CC' });
    assert.equal(list.querySelector('.ledger-row.is-done:nth-child(2) .ledger-label').textContent, visionText(language, 'renderedSlides', { total: 4 }));
    progress.set('reviewing', { model: 'Test model' });
    assert.equal(list.querySelector('.ledger-row.is-running .ledger-label').textContent, visionText(language, 'reviewingSheets', { model: 'Test model', count: 1 }));
    progress.showIssues([{ slide: 2, category: 'text', problem: 'Too small', fix: 'Bigger' }]);
    assert.equal(list.querySelectorAll('.ledger-thumb.has-issue').length, 1);
    assert.match(list.querySelector('.ledger-issues').textContent, /Too small/);
    assert.equal(list.querySelectorAll('.ledger-row.is-running').length, 0, 'nothing is left spinning');

    const steps = (progress.set('fixing', { model: 'Test model' }), progress.python(language));
    steps.event({ type: 'round', label: 'thinking', doneLabel: 'thought' });
    assert.equal(list.querySelectorAll('.ledger .ledger-row.is-running').length, 2, 'the redoing and its own step run inside it');
    steps.remove();

    list.querySelector('.ledger-stop').click();
    assert.equal(controller.signal.aborted, true);
    assert.equal(stack.querySelector('.ledger'), null, 'stopping removes the list');
    progress.remove();
    window.happyDOM.abort();
  }
});

test('normalized decks round trip through the corrected-file JSON in five languages', () => {
  for (const [language, raw] of Object.entries(fixture)) {
    const original = parse(raw, language);
    const revised = parseDocumentSpec(serializeDeckSpec(original), { uiLanguage: language });
    assert.equal(revised.ok, true, language);
    for (const field of ['meta', 'design', 'preset', 'slides']) assert.deepEqual(revised.spec[field], original[field], `${language} ${field}`);
  }
});

test('uploaded and local asset image references survive corrected-file serialization', () => {
  const spec = parse({ title: 'Images', slides: [
    { layout: 'cover', title: 'Upload', image: { upload: 1, alt: 'Cover' } },
    { layout: 'image', title: 'Asset', image: { src: 'asset:photo.png', fit: 'contain', focus: 'top' } }
  ] });
  const revised = parseDocumentSpec(serializeDeckSpec(spec)).spec;
  assert.deepEqual(revised.slides, spec.slides);
});

test('continuation and overflow slides preserve the source spec index', () => {
  const spec = sample();
  const layout = layoutPresentation(spec);
  assert.ok(layout.slides.length >= spec.slides.length);
  assert.ok(layout.slides.every(slide => Number.isInteger(slide.sourceIndex) && slide.sourceIndex >= 0 && slide.sourceIndex < spec.slides.length));
  assert.equal(layout.slides[0].sourceIndex, 0);
});

test('vision edits apply bounded text, split and image operations while rejecting invalid changes', () => {
  const spec = parse({ ...fixture.en, slides: [
    { layout: 'cover', title: 'Original', image: { placeholder: 'Photo' } },
    { layout: 'bullets', title: 'Points', bullets: ['One', 'Two', 'Three'] }
  ] });
  const { spec: revised, applied, skipped } = applyVisionEdits(spec, [
    { op: 'setText', specSlide: 1, field: 'title', value: 'Revised' },
    { op: 'setImage', specSlide: 1, fit: 'contain', focus: 'top' },
    { op: 'splitSlide', specSlide: 2, at: 2 },
    { op: 'setItemText', specSlide: 2, list: 'bullets', item: 0, field: 'text', value: 'First point' },
    { op: 'setText', specSlide: 90, field: 'title', value: 'Invalid' },
    { op: 'setItemText', specSlide: 2, list: 'bullets', item: 42, field: 'text', value: 'Invalid' },
    { op: 'deleteSlide', specSlide: 1 }
  ]);
  assert.equal(applied.length, 4);
  assert.equal(skipped.length, 3);
  assert.equal(revised.slides.length, 3);
  assert.equal(revised.slides[0].title, 'Revised');
  assert.equal(revised.slides[0].image.fit, 'contain');
  assert.equal(revised.slides[0].image.focus, 'top');
  assert.equal(revised.slides[1].bullets[0].text, 'First point');
  assert.equal(revised.slides[2].bullets.length, 1);
});

test('layout edits keep the existing content and reject destructive conversions', () => {
  const spec = parse({ title: 'Deck', slides: [
    { layout: 'cover', title: 'Title', subtitle: 'Subtitle' },
    { layout: 'cover', title: 'Photo', image: { placeholder: 'Portrait' } }
  ] });
  const result = applyVisionEdits(spec, [
    { op: 'setLayout', specSlide: 1, layout: 'section' },
    { op: 'setLayout', specSlide: 2, layout: 'section' }
  ]);
  assert.equal(result.applied.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.spec.slides[0].layout, 'section');
  assert.equal(result.spec.slides[1].image.kind, 'placeholder');
});

test('template decks reject design edits, adaptive decks accept only permitted parameters', () => {
  const template = sample();
  const denied = applyVisionEdits(template, [{ op: 'setDesign', key: 'density', value: 'airy' }]);
  assert.equal(denied.applied.length, template.preset ? 0 : 1);
  const adaptive = parse({ ...fixture.en, design: { ...template.design }, slides: fixture.en.slides });
  const result = applyVisionEdits(adaptive, [
    { op: 'setDesign', key: 'density', value: 'airy' },
    { op: 'setDesign', key: 'accent', value: '#ff0000' },
    { op: 'setDesign', key: 'typeScale', value: 3 }
  ]);
  assert.equal(result.applied.length, 1);
  assert.equal(result.skipped.length, 2);
});

test('only complete unchecked PPTX files from supported models trigger V1', () => {
  const content = JSON.stringify({ title: 'Deck', slides: [{ layout: 'cover', title: 'Hello' }] });
  const message = { role: 'model', parts: [{ text: `\`\`\`\`file deck.pptx\n${content}\n\`\`\`\`` }] };
  const args = { conversation: { id: 'c' }, message, model: { name: 'Vision' }, config: { uiLanguage: 'en' },
    signal: { aborted: false }, responseUsesCouncil: false, modelSupportsVision: () => true };
  const files = eligibleVisionFiles(args);
  assert.equal(files.length, 1);
  assert.equal(eligibleVisionFiles({ ...args, config: { visionCheckEnabled: false } }).length, 0);
  assert.equal(eligibleVisionFiles({ ...args, modelSupportsVision: () => false }).length, 0);
  assert.equal(eligibleVisionFiles({ ...args, responseUsesCouncil: true }).length, 0);
  assert.equal(eligibleVisionFiles({ ...args, signal: { aborted: true } }).length, 0);
  assert.equal(eligibleVisionFiles({ ...args, message: { ...message, metadata: { visionCheck: {} } } }).length, 0);
  assert.equal(eligibleVisionFiles({ ...args, message: { ...message, metadata: { visionChecked: [files[0].id] } } }).length, 0);
  assert.equal(eligibleVisionFiles({ ...args, message: { ...message, parts: [{ text: `\`\`\`file deck.pptx\n${content}` }] } }).length, 0);
});

test('prompt maps rendered pages to spec pages and response parser tolerates fences and surrounding text', () => {
  const spec = sample();
  const layout = layoutPresentation(spec);
  const prompt = buildVisionPrompt(spec, layout, { uiLanguage: 'fr', checkedSlides: 2 });
  assert.match(prompt, /Rendered slide 1 comes from spec slide 1/);
  assert.match(prompt, /French/);
  const answer = parseVisionResponse('Here is the result:\n```json\n{"issues":[{"slide":1,"category":"text","problem":"Long","fix":"Short"}],"edits":[],"summary":"Done"}\n```\nThanks');
  assert.equal(answer.issues.length, 1);
  assert.equal(answer.summary, 'Done');
  assert.throws(() => parseVisionResponse('not JSON'));
});

test('vision labels exist in all five languages and consecutive model turns merge', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    assert.ok(visionText(language, 'heading', { found: 2, fixed: 1 }).includes('2'));
    assert.ok(visionText(language, 'setting'));
  }
  const merged = mergeAdjacentModelMessages([
    { role: 'user', parts: [{ text: 'Make a deck' }] },
    { role: 'model', parts: [{ text: 'Original' }] },
    { role: 'model', parts: [{ text: 'Corrected' }] }
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[1].parts.map(part => part.text), ['Original', '\n\n', 'Corrected']);
});

test('contact sheets group four slides and stop at 24', () => {
  const groups = groupReviewedSlides(Array.from({ length: 27 }, (_, index) => index + 1));
  assert.equal(groups.length, 6);
  assert.deepEqual(groups[0], [1, 2, 3, 4]);
  assert.deepEqual(groups[5], [21, 22, 23, 24]);
});

test('uploaded images are resolved from the source conversation after a chat switch', async () => {
  const original = 'data:image/png;base64,AAAA';
  const document = { querySelectorAll: () => [{ getAttribute: () => 'data:image/png;base64,BBBB' }] };
  class Image {
    naturalWidth = 100;
    naturalHeight = 60;
    set src(value) { this.value = value; queueMicrotask(() => this.onload()); }
  }
  const resolve = createConversationImageResolver({ document, window: { Image }, sources: [original] });
  assert.equal((await resolve({ kind: 'upload', index: 1 })).data, original);
});

test('result messages and metadata identify the source file in every language', () => {
  const spec = sample();
  const file = { id: 'source-id', name: 'deck.pptx' };
  const model = { name: 'Vision Model' };
  const result = { issues: [{ slide: 1, category: 'text', problem: 'Long title', fix: 'Shortened title' }], summary: 'Reviewed.' };
  const edits = { spec, applied: [{ edit: { op: 'setText', specSlide: 1 } }], skipped: [] };
  const metadata = buildVisionMetadata({ file, model, result, edits, checkedSlides: 4, totalSlides: 5 });
  assert.equal(metadata.sourceFileId, 'source-id');
  assert.equal(metadata.applied, 1);
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    const text = buildVisionResult({ result, edits, renderedSlides: [{ sourceIndex: 0 }], file, language, checkedSlides: 4, totalSlides: 5 });
    assert.match(text, /file deck\.pptx/);
    assert.ok(text.includes(visionText(language, 'slide', { number: 1 })));
    assert.ok(text.includes(visionText(language, 'partial', { count: 4 })));
    assert.equal(parseDocumentSpec(text.slice(text.indexOf('file deck.pptx') + 'file deck.pptx'.length, text.lastIndexOf('````'))).ok, true);
  }
});
