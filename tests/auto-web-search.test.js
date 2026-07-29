import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldAutoEnableWebSearch } from '../src/app/runtime/features/auto-web-search.js';

test('auto web search enables only explicit current or external-data requests', () => {
  for (const prompt of [
    'What is the weather in Taipei today?',
    'Give me the latest Nvidia stock price.',
    '今天台北天氣如何？',
    '本週台北飛東京的航班時刻表',
    'últimas noticias de hoy',
    'погода сегодня'
  ]) {
    assert.equal(shouldAutoEnableWebSearch(prompt), true, prompt);
  }
});

test('auto web search leaves general and ambiguous questions offline', () => {
  for (const prompt of [
    '',
    'Explain how a transformer works.',
    '幫我解釋量子糾纏',
    'What is a good way to organize a project?',
    'Compare Rust and TypeScript for a hobby app.'
  ]) {
    assert.equal(shouldAutoEnableWebSearch(prompt), false, prompt);
  }
});
