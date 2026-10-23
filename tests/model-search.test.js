import assert from 'node:assert/strict';
import test from 'node:test';

import { analyseFields, editDistance, parseQuery, rankEntries } from '../src/app/ui/model-picker/model-search.js';

// name, id, maker, tags, description
const MODELS = [
  ['Claude Haiku 5.5', 'anthropic/claude-haiku-5.5', 'Anthropic OPENCODE', 'Vision Documents', 'Fast and cheap model for everyday tasks'],
  ['GPT-5.6 Luna', 'gpt-5.6-luna', 'OpenAI OPENCODE', 'Vision', 'Writes well'],
  ['DeepSeek V4.1 Flash', 'deepseek-v4.1-flash', 'DeepSeek OPENCODE', 'free 免費', 'Quick answers'],
  ['MiniMax M3', 'minimax-m3', 'MiniMax OPENCODE', 'Vision', 'Long context, similar to Claude Haiku 5.5 in speed'],
  ['Gemini 3.8 Flash', 'gemini-3.8-flash', 'Google GEMINI', 'Vision Search', 'A pro level of thinking']
].map(analyseFields);

const names = (query) => rankEntries(query, MODELS).map((index) => ['haiku', 'luna', 'deepseek', 'minimax', 'gemini'][index]);

test('words may come in any order and with other words between', () => {
  assert.deepEqual(names('claude 5.5'), ['haiku']);
  assert.deepEqual(names('5.5 haiku'), ['haiku']);
  assert.deepEqual(names('flash deepseek'), ['deepseek']);
});

test('spaces, dashes and dots do not matter', () => {
  assert.deepEqual(names('gpt5.6'), ['luna']);
  assert.deepEqual(names('gpt 56'), ['luna']);
  assert.deepEqual(names('deep-seek'), ['deepseek']);
  assert.deepEqual(names('GPT-5.6'), ['luna']);
});

test('the name comes before the maker, the maker before the description', () => {
  assert.deepEqual(names('haiku'), ['haiku'], 'a model that only talks about Haiku in its description is left out');
  assert.deepEqual(names('flash'), ['deepseek', 'gemini']);
});

test('the description is the last resort: used only when no other field has the words', () => {
  assert.deepEqual(names('everyday'), ['haiku']);
  assert.deepEqual(names('pro'), ['gemini']);
});

test('free can be searched in any language the tag is written in', () => {
  assert.deepEqual(names('free'), ['deepseek']);
  assert.deepEqual(names('免費'), ['deepseek']);
});

test('abilities can be searched', () => {
  assert.deepEqual(names('search'), ['gemini']);
  assert.deepEqual(names('documents'), ['haiku']);
});

test('a wrong letter is forgiven in a word of four letters or more', () => {
  assert.deepEqual(names('claued'), ['haiku']);
  assert.deepEqual(names('deepsek'), ['deepseek']);
  assert.deepEqual(names('miniamx'), ['minimax']);
  assert.deepEqual(names('cat'), [], 'a short word is not guessed');
  assert.deepEqual(names('zzzz'), []);
});

test('the best fit comes first, and an empty query keeps the order', () => {
  assert.deepEqual(names('minimax m3'), ['minimax']);
  assert.deepEqual(names('m3'), ['minimax']);
  assert.deepEqual(names('luna gpt-5.6 luna')[0], 'luna');
  assert.deepEqual(rankEntries('   ', MODELS), [0, 1, 2, 3, 4]);
});

test('parseQuery and editDistance', () => {
  assert.deepEqual(parseQuery('GPT-5.6  Luna').tokens, ['gpt', '56', 'luna']);
  assert.equal(parseQuery('GPT-5.6  Luna').whole, 'gpt56luna');
  assert.equal(editDistance('claude', 'claued', 1), 1, 'two letters swapped is one edit');
  assert.equal(editDistance('abc', 'xyz', 1), 2);
});
