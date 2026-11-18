#!/usr/bin/env node
// Tries OpenRouter's Decisions API with the very request the page makes (src/app/runtime/decisions/decision-client.js), for a few messages, and says
// what came back: the status, how long it took, the raw answer, and the yes/no the page would take from it. Also asks the CORS question a browser asks.
// The key is read from the environment and is never printed.
//
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-probe.mjs
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-probe.mjs --wording all     (old, v1 of 2026-11-18 morning, and the words now)
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-probe.mjs --wording both     (2026-11-18: the questions `search` and `url` before and after they were told about "don't search the web" and browser tasks)
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-probe.mjs --model typesafe/jev-1.14 --compare openai/gpt-6-luna-decisions
//   OPENROUTER_API_KEY=sk-or-... node scripts/decisions-probe.mjs --model google/gemini-decision-1 --compare typesafe/jev-1.14     (2026-11-13: the new Google one, against the one the app has)
//   OPENROUTER_API_KEY=sk-or-... GEMINI_API_KEY=... node scripts/decisions-probe.mjs --model gemini-decision-1 --compare google/gemini-decision-1     (Google's own address, with the Gemini key, as the settings offer it)
// A model of the list of the settings (decisions/decision-model-list.js) is asked at its own provider, with the key of that provider (OPENROUTER_API_KEY or GEMINI_API_KEY).
// Before the questions it asks OpenRouter which decision models it lists (GET /api/v1/models?output_modalities=decisions) and says whether each model asked about is among them.

import { DECISION_MODEL, DECISION_THRESHOLD, DECISION_TIMEOUT_MS, buildDecisionRequest, parseDecisionResponse, verdictOf } from '../src/app/runtime/decisions/decision-client.js';
import { DECISION_PROVIDERS, decisionModelOf } from '../src/app/runtime/decisions/decision-model-list.js';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
const key = String(process.env.OPENROUTER_API_KEY || '').trim();
const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
const models = [option('--model') || DECISION_MODEL, option('--compare')].filter(Boolean);
const providerOf = (model) => decisionModelOf(model).provider;
const keyOf = (model) => (providerOf(model) === 'gemini' ? geminiKey : key);
if (!key || (models.some((model) => providerOf(model) === 'gemini') && !geminiKey)) {
  console.error('Set OPENROUTER_API_KEY (and GEMINI_API_KEY for a model of Google Gemini) first:  OPENROUTER_API_KEY=sk-or-... GEMINI_API_KEY=... node scripts/decisions-probe.mjs');
  process.exit(1);
}
// How the questions `search` and `url` were worded before 2026-11-18 (--wording old), to put the new words beside them (--wording both). The new ones are those of decision-client.js.
const WORDING_OLD = {
  browser: 'The person asks for a real web browser to be used for them: to open websites and work them, step by step, the way a person would (search a shop or a booking site, compare offers, fill in a form, log in, book, buy, collect results from several sites). It does not if they only mention or ask about a browser, ask something that needs no website, or just want a page at an address in the message read, summarised, translated or checked (that page is read for them without a browser).',
  search: 'The latest message needs up-to-date facts from the web: news, today\'s weather, prices, scores, recent events, anything that may have changed after a language model was trained. It does not if the model\'s own knowledge or the conversation is enough.',
  url: 'What the person asks needs the page at a web address in the message to be opened and read: to summarise it, answer from it, check it, translate it or compare it. It does not if the address is only an example, part of code or of a text being discussed, or something to copy, format or fix.'
};
// ... and as they were in a050d66c (2026-11-18, the first version that knew about refusals and browser tasks; the question `browser` was still the old one).
const WORDING_V1 = {
  browser: 'The person asks for a real web browser to be used for them: to open websites and work them, step by step, the way a person would (search a shop or a booking site, compare offers, fill in a form, log in, book, buy, collect results from several sites). It does not if they only mention or ask about a browser, ask something that needs no website, or just want a page at an address in the message read, summarised, translated or checked (that page is read for them without a browser).',
  search: 'The latest message needs up-to-date facts from the web: news, today\'s weather, prices, scores, recent events, anything that may have changed after a language model was trained. It does not if the model\'s own knowledge or the conversation is enough, if the person says not to search the web or the internet (in any language: 不要用連網搜尋, don\'t search the web, sans chercher sur le web), or if the person asks for a real web browser to be used (the browser does the looking).',
  url: 'What the person asks needs the page at a web address in the message to be opened and read: to summarise it, answer from it, check it, translate it or compare it. It does not if the address is only an example, part of code or of a text being discussed, or something to copy, format or fix, or if the person asks for the address to be opened in a real web browser (the browser opens it).'
};
// ... and as they were in fae208d0 (the wording that Hark measured on 2026-11-18 in the evening: search and url as now, `browser` with the address sentence only).
const WORDING_V2 = {
  browser: 'The person asks for a real web browser to be used for them: to open websites and work them, step by step, the way a person would (search a shop or a booking site, compare offers, fill in a form, log in, book, buy, collect results from several sites). It does not if they only mention or ask about a browser, ask something that needs no website, or just want a page at an address in the message read, summarised, translated or checked (that page is read for them without a browser). It does when they say to use a browser or the browser agent, even if the message holds an address to open: "use the browser agent to open https://… and click the first result" is a task for the browser.',
  search: 'The latest message needs up-to-date facts from the web: news, today\'s weather, prices, scores, recent events, anything that may have changed after a language model was trained. It does not if the model\'s own knowledge or the conversation is enough, if the person says not to search the web or the internet (in any language: 不要用連網搜尋, don\'t search the web, sans chercher sur le web), or if the person asks for a real web browser to be used (the browser does the looking).',
  url: 'What the person asks needs the page at a web address in the message to be opened and read: to summarise it, answer from it, check it, translate it or compare it. It does not if the address is only an example, part of code or of a text being discussed, or something to copy, format or fix, or if the person says to use a browser or the browser agent (the browser opens the address and works the page itself, whatever else the message asks it to do there).'
};
const WORDINGS_BY_NAME = { old: WORDING_OLD, v1: WORDING_V1, v2: WORDING_V2 };
const wordingOption = option('--wording') || 'new';
const WORDINGS = wordingOption === 'all' ? ['old', 'v1', 'v2', 'new'] : wordingOption === 'both' ? ['old', 'new'] : [WORDINGS_BY_NAME[wordingOption] ? wordingOption : 'new'];
const tools = [{ name: 'yt-dlp', description: 'download video or audio from a web page' }, { name: 'ffmpeg', description: 'convert audio and video files' }];

// message, and what the page should conclude (search, file, chart, tool, url, exact, verbatim, browser): true / false
const CASES = [
  { message: '今天台北的天氣如何？', expect: { search: true, file: false, chart: false, tool: false } },
  { message: '幫我寫一份 3 頁的簡報，主題是 2026 電動車市場，做成 pptx 給我下載', expect: { search: false, file: true, chart: false, tool: false } },
  { message: '這是我們三季的營收：Q1 120、Q2 150、Q3 210，幫我畫成圖表', expect: { search: false, file: false, chart: true, tool: false } },
  { message: '把這個網址的影片下載成 mp3：https://example.com/watch?v=abc', expect: { search: false, file: false, chart: false, tool: true } },
  { message: '請用三句話解釋什麼是遞迴', expect: { search: false, file: false, chart: false, tool: false } },
  { message: 'Who won the Nobel Prize in Physics this year?', expect: { search: true, file: false, chart: false, tool: false } },
  // The address question (only asked when the message has an address) and the two about earlier conversations (asked when the recall is on).
  { message: '幫我摘要這篇文章：https://example.com/blog/2026-ev-market', expect: { url: true, exact: false, verbatim: false, browser: false } },
  { message: '請把這個網址的內容翻成英文：https://example.com/about', expect: { url: true, browser: false } },
  { message: '為什麼這行 curl https://api.example.com/v1/users -H "X: 1" 會回 401？', expect: { url: false, exact: false, verbatim: false } },
  { message: '把上次那份巧克力派的食譜再給我一次，一樣的就好', expect: { exact: true, verbatim: false } },
  { message: '請把我們之前聊的那份合約條款，一字不改地貼回來', expect: { exact: true, verbatim: true } },
  { message: '再給我一份新的巧克力派食譜，這次想要健康一點', expect: { exact: false, verbatim: false } },
  // The browser question (asked only where the browser agent could still be switched on): a request for a real browser is yes; talk about a browser, or work that needs no site, is no.
  { message: '幫我開瀏覽器，去查桃園飛東京 12/3 到 12/8 的機票，早上去晚上回來，找三家給我', expect: { browser: true } },
  { message: '去 booking 幫我看看板橋這週末有沒有五星飯店，列出價錢', expect: { browser: true } },
  { message: 'Open a browser and check whether the new phone is in stock at the Apple Store', expect: { browser: true } },
  { message: 'Ouvre le navigateur et réserve-moi une table pour deux ce soir', expect: { browser: true } },
  { message: 'Открой браузер и найди мне дешёвые билеты в Токио', expect: { browser: true } },
  { message: 'Abre el navegador y busca vuelos baratos a Tokio', expect: { browser: true } },
  { message: 'Chrome 和 Safari 哪個比較省電？', expect: { browser: false } },
  { message: '這個網頁在瀏覽器裡打不開，可能是什麼原因？', expect: { browser: false } },
  { message: 'How do I clear the cache in my browser?', expect: { browser: false } },
  { message: '用 JavaScript 寫一個在瀏覽器裡顯示時鐘的網頁', expect: { browser: false } },
  { message: '請用三句話解釋什麼是遞迴', expect: { browser: false } },
  { message: '幫我查三家從台北到大阪的便宜機票，比一下價錢和時間', expect: { browser: true } },
  // 2026-11-18: a person who says not to search the web, in the five languages, about something that would otherwise be searched
  { message: '不要連網搜尋，只用你知道的告訴我：2024 年諾貝爾物理學獎是誰？', expect: { search: false } },
  { message: '不要上網查，直接告訴我今天台北的天氣通常怎麼判斷', expect: { search: false } },
  { message: 'Don\'t search the web. Who won the Nobel Prize in Physics in 2024? Just tell me what you remember.', expect: { search: false } },
  { message: 'Without looking anything up online, what is the latest version of Python you know about?', expect: { search: false } },
  { message: 'Sans chercher sur le web, dis-moi qui a gagné la Coupe du monde en 2018.', expect: { search: false } },
  { message: 'Не ищи в интернете: назови последнюю версию Python, которую ты знаешь.', expect: { search: false } },
  { message: 'No busques en internet; dime lo que recuerdes sobre el último iPhone que conoces.', expect: { search: false } },
  // the same asks without the refusal still search
  { message: '請上網查一下 2024 年諾貝爾物理學獎是誰', expect: { search: true } },
  { message: 'Look up the latest stable version of Python online and tell me.', expect: { search: true } },
  // a task for the browser agent that holds an address: the browser opens it and does the looking, so nothing is to be searched or read beforehand
  { message: '用瀏覽器代理（不要用連網搜尋）打開 https://duckduckgo.com/?q=Noureon ，在瀏覽器裡依序點開前三個搜尋結果，各回報一句頁面標題', expect: { search: false, url: false, browser: true } },
  { message: '用瀏覽器代理打開 https://news.ycombinator.com ，點進第一則新聞，告訴我標題和前兩段', expect: { url: false, browser: true } },
  { message: 'Use the browser agent (do not use web search) to open https://news.ycombinator.com and tell me the top 3 titles.', expect: { search: false, url: false, browser: true } },
  { message: 'Ouvre le navigateur, va sur https://www.lemonde.fr et donne-moi les trois premiers titres.', expect: { url: false, browser: true } },
  { message: '打開瀏覽器去 https://www.apple.com/tw/ 看 iPhone 現在多少錢', expect: { url: false, browser: true } },
  { message: 'Open https://example.com in the browser agent and click "More information".', expect: { url: false, browser: true } },
  { message: 'Go to https://github.com/NHZallen/Noureon in a real browser and tell me how many stars it has.', expect: { url: false, browser: true } },
  { message: 'Используй браузерного агента: открой https://www.wikipedia.org и выбери русский язык.', expect: { url: false, browser: true } },
  { message: 'Usa el navegador para abrir https://www.wikipedia.org y elegir el idioma español.', expect: { url: false, browser: true } },
  // the page itself is what is asked about: the address is read (a control)
  { message: 'What does https://github.com/NHZallen/Noureon say in its README? Summarise it.', expect: { url: true, browser: false } },
  { message: 'Summarise this page for me: https://news.ycombinator.com', expect: { url: true, browser: false } },
  // the words of the browser asks that were mistaken for a search (printed, no expectation)
  { message: '搜尋 Noureon，打開前三個結果，各回報一句標題', expect: {} }
];
const QUESTIONS = ['search', 'file', 'chart', 'tool', 'url', 'exact', 'verbatim', 'browser'];

const redact = (text) => [key, geminiKey].filter(Boolean).reduce((value, secret) => value.split(secret).join('***'), String(text));
const show = (value) => (value === null || value === undefined ? '-' : value.toFixed(2));

async function ask(model, testCase, wording = 'new') {
  const request = buildDecisionRequest({ message: testCase.message, tools, model, historyRecall: true, browserCandidate: true });
  const set = WORDINGS_BY_NAME[wording];
  if (set) for (const name of Object.keys(set)) if (request.questions[name]) request.questions[name].instructions = set[name];
  const provider = DECISION_PROVIDERS[providerOf(model)];
  const started = Date.now();
  let response;
  try {
    response = await fetch(provider.url, {
      method: 'POST',
      headers: { ...provider.headers(keyOf(model)), 'Content-Type': 'application/json' },
      body: JSON.stringify(provider.body(request))
    });
  } catch (error) {
    return { ok: false, ms: Date.now() - started, detail: String(error?.message || error) };
  }
  const ms = Date.now() - started;
  const text = redact(await response.text());
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  const decisions = body ? parseDecisionResponse(body) : null;
  return { ok: response.ok && Boolean(decisions), status: response.status, ms, decisions, raw: text.slice(0, 600) };
}

// The decision models OpenRouter lists now (what the settings of the app may offer).
try {
  const listing = await fetch('https://openrouter.ai/api/v1/models?output_modalities=decisions', { headers: { Authorization: `Bearer ${key}` } });
  const json = await listing.json().catch(() => null);
  const entries = json?.data || [];
  console.log(`OpenRouter lists ${entries.length} decision models (HTTP ${listing.status}): ${entries.map((entry) => entry.id).join(', ') || '(none)'}`);
  for (const model of models) {
    const entry = entries.find((item) => item.id === model);
    console.log(entry
      ? `  ${model}: listed  context ${entry.context_length ?? '?'}  in ${(entry.architecture?.input_modalities || []).join('+') || '?'}  price ${JSON.stringify(entry.pricing || {})}`
      : `  ${model}: NOT in that list${entries.length ? `; close ids: ${entries.filter((item) => /gemini|google|decision/i.test(item.id)).map((item) => item.id).join(', ') || '(none)'}` : ''}`);
  }
} catch (error) {
  console.log(`The list of decision models could not be read (${error?.message || error}).`);
}

for (const model of models) for (const wording of WORDINGS) {
  console.log(`\n=== ${model} (${providerOf(model)}) wording: ${wording} ===  (the page waits ${DECISION_TIMEOUT_MS} ms at most; a probability of ${DECISION_THRESHOLD} or more is "yes")`);
  let right = 0;
  let total = 0;
  let slow = 0;
  for (const testCase of CASES) {
    const result = await ask(model, testCase, wording);
    if (!result.ok) {
      console.log(`✗ ${testCase.message.slice(0, 40)}…  HTTP ${result.status ?? '-'}  ${result.ms} ms  ${result.detail || result.raw}`);
      continue;
    }
    if (result.ms > DECISION_TIMEOUT_MS) slow += 1;
    const verdicts = Object.fromEntries(QUESTIONS.map((name) => [name, verdictOf(result.decisions, name)]));
    const wrong = Object.entries(testCase.expect).filter(([name, want]) => verdicts[name] !== null && verdicts[name] !== want).map(([name]) => name);
    Object.entries(testCase.expect).forEach(([name, want]) => { if (verdicts[name] !== null) { total += 1; if (verdicts[name] === want) right += 1; } });
    const numbers = QUESTIONS.filter((name) => result.decisions[name] !== null && result.decisions[name] !== undefined).map((name) => `${name}=${show(result.decisions[name])}`).join(' ');
    console.log(`${wrong.length ? '≠' : '✓'} ${testCase.message.slice(0, 30).padEnd(30)}  ${String(result.ms).padStart(4)} ms${result.ms > DECISION_TIMEOUT_MS ? ' (TOO SLOW for the page)' : ''}  ${numbers}${wrong.length ? `   unexpected: ${wrong.join(',')}` : ''}`);
  }
  console.log(`agreed with my guess on ${right}/${total} answers; ${slow} of ${CASES.length} calls slower than the page's limit`);
}

// The question a browser asks before it lets a page call another site (the page is at these addresses), for each provider asked about.
for (const name of new Set(models.map(providerOf))) {
  const provider = DECISION_PROVIDERS[name];
  const asked = name === 'gemini' ? 'x-goog-api-key,content-type' : 'authorization,content-type';
  for (const origin of ['https://noureon.com', 'https://staging.noureon.com']) {
    try {
      const response = await fetch(provider.url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': asked } });
      console.log(`\nCORS preflight (${name}) from ${origin}: HTTP ${response.status}  allow-origin=${response.headers.get('access-control-allow-origin') ?? '(none)'}  allow-headers=${response.headers.get('access-control-allow-headers') ?? '(none)'}`);
    } catch (error) {
      console.log(`\nCORS preflight (${name}) from ${origin}: failed (${error?.message || error})`);
    }
  }
}
console.log('\nAnswers marked ✗ failed; the page silently goes back to its word lists for those. "≠" only means the model disagreed with my guess, which is for you to judge.');
