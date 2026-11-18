// A person who says not to search the web is not given a search, and a task for the browser agent turns no search on (src/app/runtime/features/no-web-search-request.js and its use when a message is sent).
import assert from 'node:assert/strict';
import test from 'node:test';

import { forbidsWebSearch, searchHeldBack } from '../src/app/runtime/features/no-web-search-request.js';
import { buildDecisionRequest } from '../src/app/runtime/decisions/decision-client.js';
import { createSubmitInputPreparationLifecycle } from '../src/app/runtime/features/submit-input-preparation-lifecycle.js';
import { setBrowserOn } from '../src/app/runtime/server-reply/browser-switch.js';

test('"do not search the web" in the five languages is a refusal; asking for a search, "no problem, search the web" and "don\'t hesitate" are not', () => {
  for (const text of [
    '用瀏覽器代理（不要用連網搜尋）打開 https://duckduckgo.com/?q=Noureon', '不要上網，直接告訴我', '別用網路查', '不用搜尋，直接回答', '请勿联网，直接回答',
    'Don\'t search the web. Who is X?', 'Without searching the internet, tell me', 'Please do not use web search', 'no web search please', 'Never look anything up online',
    'Sans chercher sur le web, dis-moi', 'Ne cherche pas sur internet', 'Pas de recherche web',
    'Не ищи в интернете, объясни', 'без поиска в интернете',
    'No busques en internet, cuéntame', 'sin buscar en la web, dime',
    'Use the browser agent (do not use web search) to open the page'
  ]) assert.equal(forbidsWebSearch(text), true, text);
  for (const text of [
    '請幫我搜尋今天的新聞', '今天台北的天氣如何？', 'Search the web for the latest news', 'No problem, search the web', 'Don\'t hesitate to search the web', 'Do not forget to search the web',
    'What is a web search engine?', 'Cherche sur le web les horaires', 'Найди в интернете расписание', 'Busca en internet vuelos', '這個網路用語是什麼意思', '', null, undefined
  ]) assert.equal(forbidsWebSearch(text), false, String(text));
});

test('what holds the search back: a refusal; a task for the browser agent only when the agent is on for this conversation', () => {
  const on = () => true; const off = () => false;
  assert.deepEqual(searchHeldBack('不要用連網搜尋，只用你知道的', 'c1', null, { isOn: off }), { refused: true, browserDoesIt: false });
  assert.deepEqual(searchHeldBack('打開瀏覽器去看 https://x.example', 'c1', true, { isOn: on }), { refused: false, browserDoesIt: true }, 'the judgement says it is a task for the browser');
  assert.equal(searchHeldBack('hello', 'c1', true, { isOn: off }).browserDoesIt, false, 'the agent is not on: nothing opens the page, so the search is not held back');
  assert.equal(searchHeldBack('hello', 'c1', false, { isOn: on }).browserDoesIt, false, 'judged not a task for the browser');
  assert.equal(searchHeldBack('幫我開瀏覽器查機票', 'c1', null, { isOn: on, asks: () => true }).browserDoesIt, true, 'no judgement: the short list of phrases decides');
  assert.equal(searchHeldBack('hello', 'c1', null, { isOn: on, asks: () => false }).browserDoesIt, false);
});

test('the questions tell the judging model about refusals and browser tasks, and ask about the address only when there is one', () => {
  const request = buildDecisionRequest({ message: '用瀏覽器代理（不要用連網搜尋）打開 https://duckduckgo.com/?q=Noureon', browserCandidate: true });
  assert.match(request.questions.search.instructions, /says not to search the web/);
  assert.match(request.questions.search.instructions, /real web browser to be used/);
  assert.match(request.questions.url.instructions, /opened in a real web browser/);
  assert.ok(!buildDecisionRequest({ message: 'no address here', browserCandidate: true }).questions.url);
});

const harness = ({ message, conversation, decisions, autoWebSearch = true }) => createSubmitInputPreparationLifecycle({
  elements: { messageInput: { value: message } },
  getAbortController: () => null, setAbortController: () => {}, createAbortController: () => ({ signal: { aborted: false } }),
  getUploadedFiles: () => [], setUploadedFiles: () => {}, getActiveConversation: () => conversation, updateSubmitButtonState: () => {},
  getCouncilValidation: () => ({ ok: true }), showNotification: () => {}, renderCouncilControls: () => {}, isCouncilEnabled: () => false, getCouncilRuntimeTexts: () => ({}),
  addMessageToUI: (m) => { if (m.role === 'model') return { querySelector: () => ({}), scrollIntoView() {} }; conversation.messages.push(m); return { scrollIntoView() {} }; },
  renderHistorySidebar: () => {}, getAutoNaming: () => false, generateTitleAndSummary: () => {}, saveAppData: async () => {},
  getAutoWebSearchEnabled: () => autoWebSearch, canAutoEnableWebSearch: () => true, getAutoSearchNotice: () => 'auto search on', renderInputIndicators: () => {}, beginFirstSubmit: () => {},
  adjustTextareaHeight: () => {}, renderFilePreviews: () => {}, requestFrame: (callback) => callback(), requestDecisions: async () => decisions
});
const fresh = (id) => ({ id, archived: false, isTemporary: false, isWebSearchEnabled: false, messages: [], provider: 'openrouter', unsentMessage: '' });

test('sending: "do not search the web" keeps the search off although the judgement says the web is needed; the same message without it turns the search on', async () => {
  const needsWeb = { search: 0.95, file: 0, chart: 0, tool: null };
  const refused = harness({ message: '不要連網搜尋，只用你知道的告訴我 2024 年諾貝爾物理學獎是誰？', conversation: fresh('c-refuse'), decisions: needsWeb });
  assert.equal((await refused.prepareSubmitResponse()).webSearchEnabled, false);
  const allowed = harness({ message: '請上網查 2024 年諾貝爾物理學獎是誰？', conversation: fresh('c-allow'), decisions: needsWeb });
  assert.equal((await allowed.prepareSubmitResponse()).webSearchEnabled, true);
});

test('sending: a task for the browser agent that holds an address turns no search on when the agent is on; when it is off, the address is read as before', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } };
  try {
    const message = '用瀏覽器代理打開 https://news.ycombinator.com ，點進第一則新聞';
    const decisions = { search: 0.9, file: 0, chart: 0, tool: null, url: 0.8, browser: 0.9 };
    assert.equal((await harness({ message, conversation: fresh('c-off'), decisions }).prepareSubmitResponse()).webSearchEnabled, true, 'the agent is off: an address is read');
    setBrowserOn('c-on', true);
    assert.equal((await harness({ message, conversation: fresh('c-on'), decisions }).prepareSubmitResponse()).webSearchEnabled, false, 'the agent is on: it opens the page itself');
    assert.equal((await harness({ message: 'Summarise https://news.ycombinator.com', conversation: fresh('c-on'), decisions: { ...decisions, browser: 0.1 } }).prepareSubmitResponse()).webSearchEnabled, true, 'not a task for the browser: the address is read');
  } finally { delete globalThis.localStorage; }
});
