// A message that asks for a browser in words (browser-intent.js) and the switch that follows (browser-agent-menu.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { asksForBrowser } from '../src/app/runtime/browser-agent/browser-intent.js';

test('a request for a browser in any of the five languages is one; talk about a browser is not', () => {
  for (const yes of [
    '幫我開瀏覽器查一下機票', '請打開瀏覽器去看看', '用瀏覽器幫我訂位', '开浏览器搜一下', 'Open a browser and find flights', 'please use the browser to check this', 'Launch a real browser for me',
    'Ouvre le navigateur et cherche des vols', 'Открой браузер и найди рейсы', 'Abre el navegador y busca vuelos', 'use the browser agent'
  ]) assert.equal(asksForBrowser(yes), true, yes);
  for (const no of [
    '', '這個網頁在瀏覽器裡打不開', 'which browser is faster?', 'it works in the browser', 'Pourquoi mon navigateur est lent ?', 'Какой браузер лучше?', '¿Qué navegador es mejor?', 'Open the file and summarize it'
  ]) assert.equal(asksForBrowser(no), false, no);
  assert.equal(asksForBrowser(null), false);
});
