import assert from 'node:assert/strict';
import test from 'node:test';

import { createBm25Index } from '../../src/app/runtime/memory-notes/bm25.js';
import { isStrongTerm, jaccard, overlapCoefficient, plainWords, terms, termSet } from '../../src/app/runtime/memory-notes/tokenize.js';

const words = (text) => terms(text).filter((term) => term.startsWith('w:')).map((term) => term.slice(2));
const pieces = (text) => terms(text).filter((term) => term.startsWith('b:')).map((term) => term.slice(2));

test('Chinese is cut into words, and every run of characters also gives its two-character pieces', () => {
  assert.deepEqual(words('我搬到台中了，之前住台北'), ['搬到', '台中', '之前', '台北']);
  assert.ok(pieces('我住在台北市').includes('北市'), 'a piece inside a word is found');
  assert.ok(terms('下個月去日本').includes('w:日本'));
  // The old way (a run of letters) took the whole sentence for one word.
  assert.ok(words('幫我把這份報告整理成簡報，重點放在營收').length >= 4);
});

test('Japanese and Korean are cut too', () => {
  assert.ok(words('来月から東京に引っ越します').includes('東京'));
  assert.ok(terms('한국어를 공부합니다').some((term) => term.startsWith('w:')));
});

test('English, French, Spanish and Russian: no case, no accents, a light stem, and the little words go', () => {
  assert.deepEqual(words('The user prefers concise answers'), ['concis', 'answer']);
  assert.equal(words('Running').join(), words('run').join(), 'an ending of a verb is cut (and a doubled letter with it)');
  assert.equal(words('houses').join(), words('house').join());
  assert.equal(words('Café').join(), words('cafe').join(), 'the accent is no part of the word');
  assert.equal(words('ciudades').join(), words('ciudad').join());
  assert.equal(words('программист').join(), words('программисты').join(), 'a Russian word keeps its first letters');
  assert.equal(words('le chat et la maison').includes('le'), false);
});

test('the sets and the shares: the same sentence is the same, another fact on the same subject is near, a different subject is far', () => {
  const taipei = termSet('使用者住在台北', ['台北', '居住']);
  const taichung = termSet('使用者住在台中', ['台中', '居住']);
  const coffee = termSet('使用者喜歡喝黑咖啡', ['咖啡', '黑咖啡']);
  assert.equal(jaccard(taipei, taipei), 1);
  assert.ok(jaccard(taipei, taichung) >= 0.3, `near: ${jaccard(taipei, taichung)}`);
  assert.ok(jaccard(taipei, coffee) < 0.15, `far: ${jaccard(taipei, coffee)}`);
  assert.equal(overlapCoefficient(new Set(['a']), new Set(['a', 'b'])), 1);
  assert.equal(jaccard(new Set(), new Set(['a'])), 0);
});

test('plainWords gives the strongest words of a text, without the kind in front', () => {
  assert.deepEqual(plainWords('使用者下個月要去日本旅遊', 3), ['下個月', '日本', '旅遊']);
  assert.equal(isStrongTerm('w:日本'), true);
  assert.equal(isStrongTerm('b:日本'), false);
  assert.equal(isStrongTerm('w:the'), false);
});

test('BM25 ranks the text that shares the words first, says how much of the question it covers, and finds nothing for a question about something else', () => {
  const notes = [
    { id: 'japan', text: '使用者下個月要去日本旅遊', keywords: ['日本', '旅遊', 'Japan', 'travel'] },
    { id: 'coffee', text: '使用者喜歡喝黑咖啡', keywords: ['咖啡', 'coffee'] },
    { id: 'job', text: '使用者在台中做後端工程師', keywords: ['工程師', '後端', '台中', 'engineer'] }
  ];
  const index = createBm25Index(notes.map((note) => ({ id: note.id, terms: [note.text, ...note.keywords].flatMap((text) => terms(text)) })));
  const hits = index.search(terms('我下個月去日本要準備什麼'));
  assert.equal(hits[0].id, 'japan');
  assert.ok(hits[0].norm > 0.3 && hits[0].strong >= 2, `${JSON.stringify(hits[0])}`);
  assert.deepEqual(index.search(terms('幫我寫一首關於秋天的詩'), { minNorm: 0.3, minStrong: 2 }), []);
  assert.equal(index.search(terms('coffee')).at(0)?.id, 'coffee', 'a keyword of another language finds the note');
  assert.deepEqual(index.search([]), []);
  assert.deepEqual(createBm25Index([]).search(terms('x')), []);
});
