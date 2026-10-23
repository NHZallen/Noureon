import assert from 'node:assert/strict';
import test from 'node:test';

import { createIssueStream, readIssuesSoFar } from '../src/app/ui/files/vision/vision-issue-stream.js';

const whole = '{"issues":[{"slide":4,"category":"layout","problem":"The title runs over two lines","fix":"Shorten the title"},{"slide":12,"category":"text","problem":"Small \\"text\\"","fix":"Larger"}],"summary":"Two."}';

test('the problems are read from the answer as it is written: finished ones, and the one being written with what it has', () => {
  assert.deepEqual(readIssuesSoFar('{"summary":"x"}'), []);
  assert.deepEqual(readIssuesSoFar('{"issues":['), []);
  const some = readIssuesSoFar(whole.slice(0, whole.indexOf('over two') + 2));
  assert.equal(some.length, 1);
  assert.equal(some[0].slide, 4);
  assert.equal(some[0].category, 'layout');
  assert.equal(some[0].problem, 'The title runs ov', 'the words so far');
  assert.equal(some[0].writing, 'problem');
  assert.equal(some[0].fix, undefined);
  const all = readIssuesSoFar(whole);
  assert.equal(all.length, 2);
  assert.equal(all[1].problem, 'Small "text"', 'escapes are read');
  assert.equal(all[1].slide, 12);
  assert.equal(all[0].writing, '');
});

test('a number counts once what ends it has come, and a cut in the middle of an escape waits', () => {
  assert.equal(readIssuesSoFar('{"issues":[{"slide":1').at(0)?.slide, undefined, '1 may become 12');
  assert.equal(readIssuesSoFar('{"issues":[{"slide":12,').at(0)?.slide, 12);
  assert.equal(readIssuesSoFar('{"issues":[{"slide":2,"category":"text","problem":"a\\').at(0)?.problem, 'a');
  assert.equal(readIssuesSoFar('{"issues":[{"slide":2,"category":"text","problem":"a\\u4e').at(0)?.problem, 'a');
  assert.equal(readIssuesSoFar('{"issues":[{"slide":2,"category":"text","problem":"a\\u4e2d').at(0)?.problem, 'a中');
  assert.equal(readIssuesSoFar('Here it is:\n```json\n{"issues":[{"fix":"f","slide":2,"category":"text","problem":"p"}]}').at(0)?.problem, 'p', 'in a fence, in any order');
});

test('the reply is told as the problems are written: nothing before a problem has begun, its words as they come, at most every 40 ms', () => {
  const told = [];
  let clock = 1000;
  const timers = [];
  const stream = createIssueStream({
    language: 'en', checkedSlides: 12, totalSlides: 12, send: (text) => told.push(text),
    now: () => clock, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}
  });
  stream.feed('{"issues":[{"slide":4,"category":"lay');
  assert.deepEqual(told, [], 'the kind of the problem is not known yet');
  stream.feed('{"issues":[{"slide":4,"category":"layout","problem":"The title');
  assert.equal(told.length, 1);
  assert.match(told[0], /^Visual check done/);
  assert.match(told[0], /- Slide 4 \(Layout\): The title$/, 'the line begins with what is written of it');
  clock += 10;
  stream.feed('{"issues":[{"slide":4,"category":"layout","problem":"The title runs over two lines","fix":"Short');
  assert.equal(told.length, 1, 'too soon: held back');
  assert.equal(timers.length, 1);
  assert.ok(timers[0].ms > 0 && timers[0].ms <= 40);
  stream.feed(whole);
  assert.equal(timers.length, 1, 'one wait at a time');
  stream.flush();
  assert.equal(told.length, 2);
  assert.match(told[1], /Slide 12 \(Text\)/);
  assert.match(told[1], /→ Shorten the title/);
  clock += 500;
  stream.feed(whole);
  assert.equal(told.length, 2, 'the same words are not told again');
});

test('a partial note is added when only some slides were looked at, and a line without a fix has no arrow', () => {
  const told = [];
  const stream = createIssueStream({ language: 'en', checkedSlides: 8, totalSlides: 30, send: (text) => told.push(text), every: 0 });
  stream.feed('{"issues":[{"slide":2,"category":"text","problem":"Tiny');
  assert.match(told[0], /Only the first 8 slides were checked/);
  assert.doesNotMatch(told[0], /→/);
});
