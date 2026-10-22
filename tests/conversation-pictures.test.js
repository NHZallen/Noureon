import assert from 'node:assert/strict';
import test from 'node:test';

import { currentRound, listPictures, pictureData, pictureIndexLines, pictureRef, resolvePictureRefs } from '../src/data/conversation-pictures.js';

// The pictures of a conversation by round, source and number (nothing is stored: it is worked out from the messages).

const attached = (name, data = 'AAAA') => ({ inlineData: { mimeType: 'image/png', data, name } });
const drawn = (id, extra = {}) => ({ generatedImage: { id, mediaType: 'image/png', cloudAsset: { __astraCloudAsset: { path: `u/${id}`, mimeType: 'image/png' } }, ...extra } });

const history = [
  { role: 'user', parts: [{ text: 'a blue living room' }] },
  { role: 'model', parts: [drawn('g1'), { text: 'here' }, drawn('g2'), drawn('g3')] },
  { role: 'user', parts: [{ text: 'my kettle' }, attached('kettle.png'), { inlineData: { mimeType: 'application/pdf', data: 'P', name: 'a.pdf' } }, attached('cat.png')] },
  { role: 'model', parts: [{ text: 'nice' }] },
  { role: 'user', parts: [{ text: 'a bear' }] },
  { role: 'model', parts: [drawn('g4', { prompt: 'a brown bear' })] }
];

test('every picture has its round, its source and its number in its own message', () => {
  const pictures = listPictures({ history, current: [{ text: 'use this' }, attached('sofa.jpg')] });
  assert.deepEqual(pictures.map((p) => [p.round, p.source, p.number]), [
    [1, 'generated', 1], [1, 'generated', 2], [1, 'generated', 3],
    [2, 'user', 1], [2, 'user', 2],
    [3, 'generated', 1],
    [4, 'user', 1]
  ]);
});

test('the pictures of the reply and of the person in one round each start from 1', () => {
  const pictures = listPictures({ history: [{ role: 'user', parts: [attached('a.png'), attached('b.png')] }, { role: 'model', parts: [drawn('x'), drawn('y')] }] });
  assert.deepEqual(pictures.map((p) => `${p.source}${p.number}`), ['user1', 'user2', 'generated1', 'generated2']);
});

test('a file that is not a picture, or a picture without a name, is not counted', () => {
  const pictures = listPictures({ history: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'P', name: 'a.pdf' } }, { inlineData: { mimeType: 'image/png', data: 'X' } }, attached('c.png')] }] });
  assert.deepEqual(pictures.map((p) => [p.round, p.source, p.number, p.name]), [[1, 'user', 1, 'c.png']]);
});

test('a drawn picture says what it was asked with: its own prompt, or the message of its round', () => {
  const pictures = listPictures({ history });
  assert.equal(pictures.find((p) => p.round === 1 && p.number === 2).prompt, 'a blue living room');
  assert.equal(pictures.find((p) => p.round === 3).prompt, 'a brown bear');
});

test('a reply before any message of the person belongs to the first round; the message being answered starts the next', () => {
  const pictures = listPictures({ history: [{ role: 'model', parts: [drawn('s')] }], current: [attached('n.png')] });
  assert.deepEqual(pictures.map((p) => [p.round, p.source]), [[1, 'generated'], [2, 'user']]);
  assert.equal(currentRound([{ role: 'model', parts: [] }]), 2);
  assert.equal(currentRound(history), 4);
  assert.equal(currentRound([]), 1);
});

test('nothing at all gives an empty list', () => {
  assert.deepEqual(listPictures(), []);
  assert.deepEqual(listPictures({ history: 'x', current: 5 }), []);
});

test('references are found in the order given, each picture once, and what is not there is missing', () => {
  const pictures = listPictures({ history, current: [attached('sofa.jpg')] });
  const { found, missing } = resolvePictureRefs(pictures, [
    { round: 3, source: 'generated', number: 1 },
    { round: 1, source: 'generated', number: 2 },
    { round: 3, source: 'generated', number: 1 },
    { round: 9, source: 'generated', number: 1 },
    { round: 1, source: 'user', number: 1 },
    { round: 1.5, source: 'user', number: 1 },
    { round: 1, source: 'robot', number: 1 },
    null
  ]);
  assert.deepEqual(found.map(pictureRef), [{ round: 3, source: 'generated', number: 1 }, { round: 1, source: 'generated', number: 2 }]);
  assert.equal(missing.length, 5);
  assert.deepEqual(resolvePictureRefs(pictures, undefined), { found: [], missing: [] });
});

test('where the bytes are: the data of an attachment, or the marker of a file in the cloud space', () => {
  const pictures = listPictures({ history, current: [attached('sofa.jpg', { __astraCloudAsset: { path: 'u/sofa', mimeType: 'image/jpeg' } })] });
  assert.deepEqual(pictureData(pictures.find((p) => p.name === 'kettle.png')), { kind: 'base64', data: 'AAAA', mimeType: 'image/png' });
  assert.equal(pictureData(pictures.find((p) => p.round === 1 && p.number === 1)).kind, 'marker');
  assert.equal(pictureData(pictures.find((p) => p.name === 'sofa.jpg')).kind, 'marker');
  assert.equal(pictureData({ part: { generatedImage: { id: 'z' } } }), null, 'a picture that was never kept in the cloud');
});

test('the index tells each round and source in plain lines, with the prompt of what was drawn', () => {
  const pictures = listPictures({ history, current: [attached('sofa.jpg')] });
  assert.deepEqual(pictureIndexLines(pictures, { currentRound: 4 }), [
    'Round 1: you drew picture 1 (asked for: "a blue living room"), picture 2 (asked for: "a blue living room"), picture 3 (asked for: "a blue living room")',
    'Round 2: the user sent picture 1 "kettle.png", picture 2 "cat.png"',
    'Round 3: you drew picture 1 (asked for: "a brown bear")',
    'Round 4 (this message): the user sent picture 1 "sofa.jpg"'
  ]);
  assert.deepEqual(pictureIndexLines([]), []);
});

test('an index of a long conversation lists the newest rounds with pictures and counts the rest', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ round: i + 1, source: 'user', number: 1, name: `p${i + 1}.png`, mimeType: 'image/png', part: {} }));
  const lines = pictureIndexLines(many, { currentRound: 45 });
  assert.equal(lines.length, 41);
  assert.equal(lines[0], '(5 older rounds with pictures are not listed.)');
  assert.match(lines[1], /^Round 6: /);
  assert.match(lines.at(-1), /^Round 45 \(this message\): /);
});

test('a name or a prompt with quotes or a long text stays on one short line', () => {
  const pictures = listPictures({ history: [{ role: 'user', parts: [{ text: 'x '.repeat(300) }] }, { role: 'model', parts: [drawn('g', { prompt: 'say "hi"\nplease' })] }] });
  const [line] = pictureIndexLines(pictures);
  assert.equal(line.includes('\n'), false);
  assert.match(line, /asked for: "say 'hi' please"/);
});
