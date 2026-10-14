import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { createProviderRequestSupport } from '../src/app/legacy-runtime/features/provider-request-support.js';
import { createStreamApiCall } from '../src/app/legacy-runtime/features/stream-api-call.js';
import { MODELS, getModelApiId, modelSupportsUploadedFile, modelSupportsVision } from '../src/app/runtime/legacy-core/model-registry.js';
import { createOfficeReader } from '../src/app/ui/files/office-text/office-reader.js';
import { OFFICE_KINDS } from '../src/app/ui/files/office-text/office-text.js';

const model = (apiId) => MODELS.find((entry) => entry.id === `opencode-go/${apiId}`);
const officeReader = () => createOfficeReader({ loadDeps: async () => ({ JSZip, DOMParser }) });
const attachment = (kind) => ({ inlineData: { mimeType: OFFICE_KINDS[kind].mime, name: `sample.${kind}`, data: readFileSync(new URL(`./fixtures/office/sample.${kind}`, import.meta.url)).toString('base64') } });
const byteStream = (chunks) => {
  const encoder = new TextEncoder();
  return new ReadableStream({ start(controller) { chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk))); controller.close(); } });
};

const ask = async (apiId, { history = [], parts = [{ text: 'Hello' }] } = {}) => {
  const info = model(apiId);
  const requests = [];
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => ({ id: 'c', model: info.id, messages: [], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: null } }),
    normalizeConversationModel: () => info,
    getModelApiId,
    getApiKeyForProvider: () => 'oc_sk_secret',
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => ({ aiDefaultLanguage: 'en', uiLanguage: 'en', isLearningMode: false, memoryEnabled1: false }),
    getAstras: () => [],
    getPersonalMemories: () => [],
    modelSupportsUploadedFile,
    modelSupportsVision,
    officeReader: officeReader(),
    fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, status: 200, body: byteStream([]), text: async () => '' }; }
  });
  await streamApiCall(parts, () => {}, undefined, false, { historyForApi: history });
  return requests[0];
};
const textOf = (body) => JSON.stringify(body);

test('a Word file in the history goes to a model that sees pictures as its text and its pictures, so a follow-up question still has the document', async () => {
  const body = await ask('kimi-k3', { history: [{ role: 'user', parts: [{ text: 'Read this' }, attachment('docx')] }, { role: 'model', parts: [{ text: 'Done' }] }], parts: [{ text: 'And chapter one?' }] });
  const text = textOf(body);
  assert.match(text, /# File: sample\.docx \(Word document\)/);
  assert.match(text, /第一章 概述/);
  assert.match(text, /\[Image 1\] of sample\.docx:/);
  assert.match(text, /data:image\/png;base64,/, 'the picture of the file goes as a picture');
  assert.doesNotMatch(text, /Attachment omitted/);
});

test('the same file goes to a model that cannot see as its text, with the pictures told, and a model that reads Word files gets the file as it is', async () => {
  const blind = textOf(await ask('glm-5.3', { history: [{ role: 'user', parts: [{ text: 'Read this' }, attachment('pptx')] }] }));
  assert.match(blind, /## Slide 1: Quarterly review/);
  assert.match(blind, /1 image\(s\) that this model cannot look at/);
  assert.doesNotMatch(blind, /data:image\//);
  const reads = textOf(await ask('grok-4.7', { history: [{ role: 'user', parts: [{ text: 'Read this' }, attachment('docx')] }] }));
  assert.match(reads, /"type":"input_file","filename":"sample\.docx"/);
  assert.doesNotMatch(reads, /# File: sample/);
  const sheet = textOf(await ask('grok-4.7', { history: [{ role: 'user', parts: [{ text: 'Read this' }, attachment('xlsx')] }] }));
  assert.match(sheet, /## Sheet: Sales/, 'an Excel file was not tried with Grok: it goes as text');
});

test('the request support: a Word file for a model that cannot read it becomes text without the translator; a file with pictures for a model that cannot see them goes to the translator', async () => {
  const calls = [];
  const build = (translator) => createProviderRequestSupport({
    buildTavilySearchQuery: () => '', formatTavilySearchPacket: () => '', normalizeTinyfishSearch: () => [], normalizePageReads: () => [],
    getErrorMessage: () => '', readErrorBody: async () => '', getApiKeyForProvider: () => 'k', getConfig: () => ({ uiLanguage: 'en' }),
    streamApiCall: async (parts) => { calls.push(parts); return 'TRANSLATED PACKET'; },
    rewriteSearchQuery: async () => '',
    getSingleDocumentTranslatorModel: () => translator, modelUsesTavilySearch: () => false,
    modelSupportsUploadedFile, modelSupportsVision, officeReader: officeReader(), councilResponseCharLimit: 7000, councilRetryDelayMs: 0
  });
  const parts = [{ text: 'Read this' }, attachment('docx')];

  const seeing = await build({ id: 'translator', name: 'Translator' }).buildSingleModelTranslatedRequestParts(parts, model('kimi-k3'), undefined, () => {}, {});
  assert.equal(calls.length, 0, 'no translator was asked');
  assert.match(JSON.stringify(seeing), /第一章 概述/);
  assert.ok(seeing.some((part) => part.inlineData?.mimeType === 'image/png'));

  const blind = await build({ id: 'translator', name: 'Translator' }).buildSingleModelTranslatedRequestParts(parts, model('glm-5.3'), undefined, () => {}, {});
  assert.equal(calls.length, 1, 'the pictures are for the translator to describe');
  assert.match(JSON.stringify(blind), /TRANSLATED PACKET/);

  const blindNoTranslator = await build(null).buildSingleModelTranslatedRequestParts(parts, model('glm-5.3'), undefined, () => {}, {});
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(blindNoTranslator), /第一章 概述/);
  assert.match(JSON.stringify(blindNoTranslator), /cannot look at/);

  const book = await build({ id: 'translator', name: 'Translator' }).buildSingleModelTranslatedRequestParts([{ text: 'Sum it' }, attachment('xlsx')], model('glm-5.3'), undefined, () => {}, {});
  assert.equal(calls.length, 1, 'a workbook with no pictures needs no translator');
  assert.match(JSON.stringify(book), /## Sheet: Sales/);
});
