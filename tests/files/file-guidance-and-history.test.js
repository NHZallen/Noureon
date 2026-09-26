import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamApiCall } from '../../src/app/legacy-runtime/features/stream-api-call.js';
import { NOURAS_REQUEST_PURPOSE } from '../../src/app/runtime/nouras/nouras-policy.js';
import { buildHistoryIndexTurns } from '../../src/app/runtime/memory/history-index-source.js';
import { buildTitleSummaryPrompt } from '../../src/app/runtime/legacy-core/settings-title-summary-helpers.js';
import { getFileAuthoringGuidance } from '../../src/app/ui/files/file-authoring-guidance.js';
import { compactFileHistoryForApi, summarizeFileBlocks } from '../../src/app/ui/files/file-history-compaction.js';
import { conversationHasRecentFile, mayNeedFileGuidance } from '../../src/app/ui/files/file-intent.js';
import { getFileTexts, SUPPORTED_FILE_TEXT_LANGUAGES } from '../../src/app/ui/files/file-texts.js';

test('file intent is recognised across the five UI languages and common formats', () => {
  for (const text of [
    '幫我做成 Word 檔',
    '給我一份可以下載的報表',
    '請匯出成 CSV',
    'Put this in a spreadsheet',
    'Can you export that as JSON?',
    'Crée un fichier texte',
    'Descarga el archivo',
    'Сделай файл с таблицей',
    '存成 .md 檔'
  ]) {
    assert.equal(mayNeedFileGuidance(text), true, text);
  }
  for (const text of ['今天天氣如何？', 'Explain recursion', 'What is a word for happy?', '']) {
    assert.equal(mayNeedFileGuidance(text), false, text);
  }
});

test('a follow-up edit keeps guidance while the latest reply contains a file', () => {
  const history = [
    { role: 'user', parts: [{ text: 'make notes' }] },
    { role: 'model', parts: [{ text: '````file notes.md\n# Notes\n````' }] }
  ];
  assert.equal(conversationHasRecentFile(history), true);
  assert.equal(conversationHasRecentFile([...history, { role: 'model', parts: [{ text: 'plain' }] }]), false);
});

test('guidance teaches the protocol and advertises only formats that can be generated', async () => {
  const guidance = await getFileAuthoringGuidance();
  assert.match(guidance, /````file descriptive-name\.ext/);
  assert.match(guidance, /never say you are unable to create/i);
  assert.match(guidance, /sandbox:/);
  assert.match(guidance, /\.csv/);
  assert.doesNotMatch(guidance, /## (?:Word|Excel|PowerPoint|PDF)/);
});

const createApiHarness = (conversation) => {
  const requests = [];
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => ({ id: 'm', apiId: 'or/m', name: 'M', provider: 'openrouter' }),
    getModelApiId: (model) => model.apiId,
    getApiKeyForProvider: () => 'key',
    getDefaultGenConfig: () => ({ temperature: null, topP: null, maxTokens: null }),
    getConfig: () => ({ aiDefaultLanguage: 'en', isLearningMode: false, memoryEnabled1: false }),
    getAstras: () => [],
    getPersonalMemories: () => [],
    modelSupportsUploadedFile: () => true,
    modelSupportsVision: () => true,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'));
            controller.close();
          }
        })
      };
    },
    warn: () => {}
  });
  return { streamApiCall, requests };
};

const systemText = (payload) => payload.messages.find((message) => message.role === 'system')?.content || '';

test('file guidance reaches visible answers and council synthesis only', async () => {
  const conversation = { model: 'm', messages: [{ role: 'user', parts: [{ text: '請匯出成 CSV 檔' }] }] };
  for (const [purpose, expected] of [
    [NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER, true],
    [NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS, true],
    [NOURAS_REQUEST_PURPOSE.COUNCIL_PARTICIPANT, false],
    [NOURAS_REQUEST_PURPOSE.BACKGROUND_MEMORY, false]
  ]) {
    const { streamApiCall, requests } = createApiHarness(conversation);
    await streamApiCall([{ text: '請匯出成 CSV 檔' }], () => {}, undefined, false, { requestPurpose: purpose });
    assert.equal(/Downloadable file output/.test(systemText(requests[0])), expected, purpose);
  }
});

test('superseded file versions are compacted in the request but stored messages are untouched', async () => {
  const oldReply = { role: 'model', parts: [{ text: 'v1\n````file plan.md\nOLD BODY\n````' }] };
  const newReply = { role: 'model', parts: [{ text: 'v2\n````file plan.md\nNEW BODY\n````' }] };
  const conversation = {
    model: 'm',
    messages: [
      { role: 'user', parts: [{ text: 'make a plan file' }] },
      oldReply,
      { role: 'user', parts: [{ text: 'shorter' }] },
      newReply,
      { role: 'user', parts: [{ text: 'thanks' }] }
    ]
  };
  const { streamApiCall, requests } = createApiHarness(conversation);
  await streamApiCall([{ text: 'thanks' }], () => {});

  const sent = requests[0].messages.map((message) => message.content).join('\n');
  assert.doesNotMatch(sent, /OLD BODY/);
  assert.match(sent, /Earlier version of the file "plan\.md" omitted/);
  assert.match(sent, /NEW BODY/);
  assert.match(oldReply.parts[0].text, /OLD BODY/, 'stored history keeps the original');
  assert.match(systemText(requests[0]), /Downloadable file output/, 'recent file keeps guidance on');
});

test('compaction leaves history without superseded files as the same array', () => {
  const history = [{ role: 'model', parts: [{ text: '````file a.txt\n1\n````' }] }];
  assert.equal(compactFileHistoryForApi(history), history);
});

test('memory, history index and title prompts see a file summary instead of its body', () => {
  const fence = '`'.repeat(4);
  const text = ['Here:', `${fence}file data.json`, 'x'.repeat(2000), fence, 'Done'].join('\n');
  const summary = summarizeFileBlocks(text, { excerptLength: 20 });
  assert.match(summary, /^Here:\n\[File: data\.json\] x{20}…\nDone$/);

  const turns = buildHistoryIndexTurns({ id: 'c', messages: [{ role: 'model', parts: [{ text }] }] });
  assert.ok(turns[0].text.length < 600);
  assert.match(turns[0].text, /\[File: data\.json\]/);

  const prompt = buildTitleSummaryPrompt({ messages: [{ role: 'model', parts: [{ text }, { inlineData: {} }] }] }, { language: 'en' });
  assert.ok(prompt.length < 1200);
  assert.doesNotMatch(prompt, /undefined/);
});

test('file card copy exists for every supported UI language', () => {
  assert.deepEqual(SUPPORTED_FILE_TEXT_LANGUAGES, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  const expectedKeys = Object.keys(getFileTexts('en')).sort();
  for (const language of SUPPORTED_FILE_TEXT_LANGUAGES) {
    const texts = getFileTexts(language);
    assert.deepEqual(Object.keys(texts).sort(), expectedKeys, language);
    Object.entries(texts).forEach(([key, value]) => assert.ok(String(value).trim(), `${language}.${key}`));
  }
});
