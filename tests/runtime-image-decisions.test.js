import test from 'node:test';
import assert from 'node:assert/strict';

import { buildImageDecisionRequest, describeLimits, parseImageDecisionResponse, readWrittenRatio } from '../src/app/runtime/decisions/image-decisions.js';
import { createDecisionService } from '../src/app/runtime/decisions/decision-client.js';
import { readSpokenRequest } from '../src/app/legacy-runtime/features/image-spoken-request.js';

test('the request about a picture message holds its limits and the yes-or-no questions', () => {
  const request = buildImageDecisionRequest({ message: '給我兩張9:16草原的圖片', limits: { maxCount: 6, minReferences: 0, maxReferences: 4 }, attached: 1 });
  assert.equal(request.model, 'typesafe/jev-1.14');
  assert.match(request.state[0], /給我兩張9:16草原的圖片/);
  assert.match(request.state[1], /1 to 6 pictures per request and takes 0 to 4 reference pictures/);
  assert.match(request.state[2], /attached to the latest message: 1/);
  const names = Object.keys(request.questions);
  for (const name of ['collage', 'single', 'exactly_2', 'exactly_10', 'more_than_limit', 'ratio_stated', 'portrait', 'landscape', 'square']) assert.ok(names.includes(name), name);
  assert.equal(names.includes('exactly_1'), false, 'one picture is "single": not saying a count is not a count');
  assert.ok(Object.values(request.questions).every(question => question.type === 'noul'));
  assert.match(request.questions.more_than_limit.instructions, /1 to 6 pictures/);
  assert.equal(buildImageDecisionRequest({ message: '   ' }), null);
  assert.match(describeLimits({}), /1 to 10 pictures per request and takes any number of reference pictures/);
});

test('the answers are read as one count, the yes-or-no of the rest, or nothing', () => {
  const body = { answers: { collage: { noul: 0.1 }, single: { noul: 0.02 }, exactly_2: { noul: 0.97 }, exactly_3: { noul: 0.59 }, exactly_4: { noul: 0.7 }, more_than_limit: { noul: 0.02 }, ratio_stated: { noul: 0.9 }, portrait: { noul: 0.92 } } };
  const read = parseImageDecisionResponse(body);
  assert.equal(read.count, 2, 'the surest "exactly N" that said yes');
  assert.equal(read.collage, 0.1);
  assert.equal(read.portrait, 0.92);
  assert.equal(read.landscape, null, 'a question not answered is null');
  assert.equal(parseImageDecisionResponse({ answers: { exactly_3: { noul: 0.5 } } }).count, null, 'below 0.6 is no count');
  assert.equal(parseImageDecisionResponse({ answers: {} }), null);
  assert.equal(parseImageDecisionResponse(null), null);
});

test('a shape written as numbers is read in the ways it is written', () => {
  for (const [text, ratio] of [['給我兩張9:16草原', '9:16'], ['16：9 的圖', '16:9'], ['畫一張 4比3 的風景', '4:3'], ['a 3x2 photo', '3:2'], ['21 by 9 banner', '21:9'], ['5:7', '5:7']]) assert.equal(readWrittenRatio(text), ratio, text);
  for (const text of ['畫一隻貓', 'version 1.2.3', '2026-10-17']) assert.equal(readWrittenRatio(text), '', text);
});

test('the question about a picture request has the same pause and failures as the other judgements', async () => {
  let calls = 0;
  const service = createDecisionService({
    getApiKey: () => 'key',
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ answers: { exactly_2: { noul: 0.9 }, collage: { noul: 0.1 } } }) };
    }
  });
  const got = await service.decideImage({ message: 'two pictures', limits: {}, attached: 0 });
  assert.equal(got.count, 2);
  const none = createDecisionService({ getApiKey: () => '', fetchImpl: async () => { calls += 1; return null; } });
  assert.equal(await none.decideImage({ message: 'two pictures' }), null, 'no key: no call');
  assert.equal(calls, 1);
  const failing = createDecisionService({ getApiKey: () => 'key', fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(await failing.decideImage({ message: 'x' }), null);
  assert.equal(await failing.decideImage({ message: 'x' }), null);
  assert.equal(failing.isPaused(), true, 'two failures pause the judgements, the picture ones too');
});

test('what is read from the answers for the model in use', () => {
  const model = { maxImageCount: 6, maxImageReferences: 4, supportedImageAspectRatios: ['1:1', '3:4', '16:9'] };
  const base = { collage: 0.05, single: 0.05, count: null, more: 0.02, ratioStated: 0.05, portrait: 0.05, landscape: 0.05, square: 0.05 };
  assert.deepEqual(readSpokenRequest({ decision: null, message: 'x', modelInfo: model }), { count: null, aspectRatio: '', collage: false, problem: null });
  assert.equal(readSpokenRequest({ decision: { ...base, count: 3 }, message: 'x', modelInfo: model }).count, 3);
  assert.equal(readSpokenRequest({ decision: { ...base, single: 0.9 }, message: 'x', modelInfo: model }).count, 1);
  const collage = readSpokenRequest({ decision: { ...base, collage: 0.9, count: 5 }, message: 'x', modelInfo: model });
  assert.equal(collage.count, 1);
  assert.equal(collage.collage, true);
  assert.equal(collage.problem, null, 'a collage of many parts is still one picture');
  assert.equal(readSpokenRequest({ decision: { ...base, ratioStated: 0.9, square: 0.9 }, message: 'x', modelInfo: model }).aspectRatio, '1:1');
  assert.equal(readSpokenRequest({ decision: { ...base, ratioStated: 0.9, landscape: 0.9 }, message: 'x', modelInfo: model }).aspectRatio, '16:9');
  assert.equal(readSpokenRequest({ decision: { ...base, ratioStated: 0.9, portrait: 0.9 }, message: 'x', modelInfo: model }).aspectRatio, '3:4', 'the tall shape the model has');
  assert.equal(readSpokenRequest({ decision: { ...base, ratioStated: 0.9 }, message: '來個 16:9 的', modelInfo: model }).aspectRatio, '16:9');
  assert.equal(readSpokenRequest({ decision: { ...base, ratioStated: 0.9 }, message: '比分 2:1 的看板', modelInfo: { ...model, supportedImageAspectRatios: ['1:1'] } }).problem.code, 'ratio');
  assert.equal(readSpokenRequest({ decision: { ...base, ratioStated: 0.05 }, message: '比分 2:1 的看板', modelInfo: model }).aspectRatio, '', 'numbers the judgement did not take for a shape are not one');
  assert.deepEqual(readSpokenRequest({ decision: { ...base, count: 8 }, message: 'x', modelInfo: model }).problem, { code: 'count', n: 8, max: 6 });
  assert.deepEqual(readSpokenRequest({ decision: { ...base, more: 0.9 }, message: 'x', modelInfo: model }).problem, { code: 'count-any', max: 6 });
  assert.equal(readSpokenRequest({ decision: { ...base, more: 0.9 }, message: 'x', modelInfo: model, attached: 5 }).problem, null, 'too many reference pictures are checked on their own, by number');
});

test('the readings the probe of 2026-10-17 corrected: a collage needs a sure yes, a said count beats "one picture", a word for the shape stands alone', () => {
  const model = { maxImageCount: 6, maxImageReferences: 4, supportedImageAspectRatios: ['1:1', '3:4', '9:16', '16:9'] };
  const base = { collage: 0.05, single: 0.05, count: null, more: 0.02, ratioStated: 0.05, portrait: 0.05, landscape: 0.05, square: 0.05 };
  // "four pictures in different styles, landscape": collage 0.74, one picture 0.77, four 0.93
  const four = readSpokenRequest({ decision: { ...base, collage: 0.74, single: 0.77, count: 4, ratioStated: 0.91, landscape: 0.92 }, message: '畫四張不同風格的貓，橫式', modelInfo: model });
  assert.deepEqual([four.count, four.collage, four.aspectRatio], [4, false, '16:9']);
  // "two vertical drawings" in Russian: one picture 0.63, two 0.9
  assert.equal(readSpokenRequest({ decision: { ...base, single: 0.63, count: 2 }, message: 'x', modelInfo: model }).count, 2);
  // a real collage (0.89) is one picture even when a count was read
  const comic = readSpokenRequest({ decision: { ...base, collage: 0.89, single: 0.68, count: 4 }, message: 'x', modelInfo: model });
  assert.deepEqual([comic.count, comic.collage], [1, true]);
  // "six phone wallpapers": the shape was not stated as such (0.33) but a tall picture was asked for (0.86)
  assert.equal(readSpokenRequest({ decision: { ...base, count: 6, ratioStated: 0.33, portrait: 0.86 }, message: '來六張手機桌布', modelInfo: model }).aspectRatio, '9:16');
  // a guess about the shape (0.4) is not taken
  assert.equal(readSpokenRequest({ decision: { ...base, landscape: 0.4 }, message: 'trois paysages de montagne', modelInfo: model }).aspectRatio, '');
  // only "one picture" said outright: one
  assert.equal(readSpokenRequest({ decision: { ...base, single: 0.9 }, message: 'x', modelInfo: model }).count, 1);
});
