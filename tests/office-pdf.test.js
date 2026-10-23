import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { createDerivedPdfStore } from '../server/derived-pdf-store.js';
import { createAssetSweeper } from '../server/asset-sweeper.js';
import { createOfficePdfConverter } from '../server/office-pdf.js';
import { createStreamApiCall } from '../src/app/runtime/reply/stream-api-call.js';
import { MODELS, getModelApiId, modelSupportsUploadedFile, modelSupportsVision } from '../src/app/runtime/shell/model-registry.js';
import { opencodeModelReadsOfficeViaPdf } from '../src/app/runtime/shell/opencode-models.js';
import { createOfficeReader } from '../src/app/ui/files/office-text/office-reader.js';
import { OFFICE_KINDS } from '../src/app/ui/files/office-text/office-text.js';

const USER = '11111111-2222-3333-4444-555555555555';
const DOCX = OFFICE_KINDS.docx.mime;
const bytesOf = (kind) => readFileSync(new URL(`./fixtures/office/sample.${kind}`, import.meta.url));
const inline = (kind) => ({ mimeType: OFFICE_KINDS[kind].mime, name: `sample.${kind}`, data: bytesOf(kind).toString('base64') });
const model = (apiId) => MODELS.find((entry) => entry.id === `opencode-go/${apiId}`);

const memoryCache = () => {
  const files = new Map();
  return { files, read: async (user, key) => files.get(`${user}/${key}`) || null, write: async (user, key, bytes) => { files.set(`${user}/${key}`, bytes); return true; } };
};
const fakeHost = ({ pdf = Buffer.from('%PDF-1.4 fake'), result = null, onRun = () => {} } = {}) => {
  const calls = { mounted: [], runs: 0, disposed: 0 };
  return {
    calls,
    configured: true,
    getSandbox: () => ({
      mount: async (files) => { calls.mounted.push(files); },
      run: async (code, options) => { calls.runs += 1; onRun(code, options); return result || { files: [{ name: 'input.pdf', bytes: new Uint8Array(pdf) }], error: '' }; },
      dispose: async () => { calls.disposed += 1; }
    })
  };
};

test('the models that have their Word and PowerPoint files made into a PDF: the ones that look at the pictures of a PDF, for those two kinds only', () => {
  for (const apiId of ['hy3', 'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor', 'claude-haiku-5-5', 'minimax-m3', 'minimax-m3.1-flash', 'qwen3.8-max', 'qwen3.8-flash']) {
    assert.equal(opencodeModelReadsOfficeViaPdf(model(apiId), DOCX), true, apiId);
    assert.equal(opencodeModelReadsOfficeViaPdf(model(apiId), OFFICE_KINDS.pptx.mime), true, apiId);
    assert.equal(opencodeModelReadsOfficeViaPdf(model(apiId), OFFICE_KINDS.xlsx.mime), false, `${apiId}: a workbook is text, not a PDF`);
    assert.equal(opencodeModelReadsOfficeViaPdf(model(apiId), 'application/pdf'), false);
  }
  for (const apiId of ['hy4-preview', 'qwen3.7-plus', 'grok-4.7', 'kimi-k3', 'beam-free']) assert.equal(opencodeModelReadsOfficeViaPdf(model(apiId), DOCX), false, apiId);
});

test('the converter: the file is mounted in the sandbox, LibreOffice runs, the PDF comes back and is kept; asked again it comes from the cache with no sandbox', async () => {
  const derived = memoryCache();
  const host = fakeHost({ onRun: (code, options) => { assert.match(code, /soffice/); assert.match(code, /--convert-to/); assert.equal(options.timeoutMs, 100_000); } });
  const converter = createOfficePdfConverter({ host, derived });
  const first = await converter.convert({ userId: USER, inline: inline('docx') });
  assert.equal(first.mimeType, 'application/pdf');
  assert.equal(first.name, 'sample.pdf');
  assert.equal(Buffer.from(first.data, 'base64').toString(), '%PDF-1.4 fake');
  assert.equal(host.calls.mounted[0][0].name, 'input.docx');
  assert.equal(host.calls.disposed, 1, 'the sandbox is given back');
  assert.equal(derived.files.size, 1, 'kept for the person');
  const [path] = [...derived.files.keys()];
  assert.match(path, new RegExp(`^${USER}/[0-9a-f]{64}$`));
  const second = await converter.convert({ userId: USER, inline: inline('docx') });
  assert.equal(second.data, first.data);
  assert.equal(host.calls.runs, 1, 'no second conversion');
  // Another person's file is not the first person's cache.
  await converter.convert({ userId: '99999999-2222-3333-4444-555555555555', inline: inline('docx') });
  assert.equal(host.calls.runs, 2);
});

test('the converter gives null, and ends nothing, when the file cannot be made into a PDF', async () => {
  const bad = async (host, file = inline('docx')) => createOfficePdfConverter({ host, derived: memoryCache() }).convert({ userId: USER, inline: file });
  assert.equal(await bad(fakeHost({ result: { files: [], error: 'boom' } })), null, 'an error of the step');
  assert.equal(await bad(fakeHost({ result: { files: [], error: '', timedOut: true } })), null, 'too slow');
  assert.equal(await bad(fakeHost({ result: { files: [{ name: 'other.txt', bytes: new Uint8Array(3) }], error: '' } })), null, 'no PDF made');
  assert.equal(await bad(fakeHost({ result: { stopped: true } })), null, 'stopped');
  const throwing = { configured: true, getSandbox: () => ({ mount: async () => { throw new Error('host lost'); }, run: async () => ({}), dispose: async () => {} }) };
  assert.equal(await bad(throwing), null, 'a host that fails');
  assert.equal(await bad(fakeHost(), { mimeType: OFFICE_KINDS.xlsx.mime, name: 'a.xlsx', data: 'AAAA' }), null, 'not a kind that is made into a PDF');
  assert.equal(await bad({ configured: false }), null, 'no sandbox host');
  const calls = [];
  const limited = createOfficePdfConverter({ host: fakeHost(), derived: memoryCache(), log: (name) => calls.push(name), limits: { maxInputBytes: 10, maxPdfBytes: 50, convertMs: 1000 } });
  assert.equal(await limited.convert({ userId: USER, inline: inline('docx') }), null, 'a file over the limit');
  // The person stopping the reply is a stop, not a failure to hide.
  const controller = new AbortController();
  controller.abort();
  const aborting = { configured: true, getSandbox: () => ({ mount: async () => { throw new DOMException('Aborted', 'AbortError'); }, run: async () => ({}), dispose: async () => {} }) };
  await assert.rejects(() => createOfficePdfConverter({ host: aborting, derived: memoryCache() }).convert({ userId: USER, inline: inline('docx'), signal: controller.signal }), { name: 'AbortError' });
});

test('the reader sends a PDF for the files the model reads better so, and falls back to the text of the file when the conversion gives nothing', async () => {
  const pdf = { mimeType: 'application/pdf', name: 'sample.pdf', data: Buffer.from('%PDF').toString('base64') };
  const part = { inlineData: inline('docx') };
  const options = { canRead: () => false, viaPdf: () => true, supportsVision: true };
  const converted = await createOfficeReader({ loadDeps: async () => ({ JSZip, DOMParser }), convertToPdf: async () => pdf }).expandParts([part], options);
  assert.equal(converted.changed, true);
  assert.deepEqual(converted.parts[0].inlineData, pdf);
  assert.equal(part.inlineData.mimeType, DOCX, 'the stored part is not changed');
  const fallback = await createOfficeReader({ loadDeps: async () => ({ JSZip, DOMParser }), convertToPdf: async () => null }).expandParts([part], options);
  assert.match(fallback.parts[0].text, /^# File: sample\.docx/);
  const failing = await createOfficeReader({ loadDeps: async () => ({ JSZip, DOMParser }), convertToPdf: async () => { throw new Error('x'); } }).expandParts([part], options);
  assert.match(failing.parts[0].text, /^# File: sample\.docx/);
  const notAsked = await createOfficeReader({ loadDeps: async () => ({ JSZip, DOMParser }), convertToPdf: async () => pdf }).expandParts([part], { ...options, viaPdf: () => false });
  assert.match(notAsked.parts[0].text, /^# File: sample\.docx/, 'a model that is not in the list gets the text');
});

test('a reply to a model of the list: the Word file in the history goes to it as a PDF, in the form of its API', async () => {
  const info = model('claude-haiku-5-5');
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
    officeReader: createOfficeReader({ loadDeps: async () => ({ JSZip, DOMParser }), convertToPdf: async () => ({ mimeType: 'application/pdf', name: 'sample.pdf', data: Buffer.from('%PDF').toString('base64') }) }),
    fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, status: 200, body: new ReadableStream({ start: (c) => c.close() }), text: async () => '' }; }
  });
  await streamApiCall([{ text: 'And chapter one?' }], () => {}, undefined, false, { historyForApi: [{ role: 'user', parts: [{ text: 'Read this' }, { inlineData: inline('docx') }] }, { role: 'model', parts: [{ text: 'Done' }] }] });
  const text = JSON.stringify(requests[0]);
  assert.match(text, /"type":"document","source":\{"type":"base64","media_type":"application\/pdf"/);
  assert.doesNotMatch(text, /# File: sample/);
});

test('the store of the PDFs: a path of the person and the hash only, read and written with the service key, and only such paths removed', async () => {
  const calls = [];
  const store = createDerivedPdfStore({ url: 'https://x.supabase.co', serviceKey: 'svc', fetchImpl: async (url, options = {}) => { calls.push({ url, options }); return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }; } });
  const key = 'a'.repeat(64);
  assert.deepEqual([...await store.read(USER, key)], [1, 2]);
  assert.equal(calls[0].url, `https://x.supabase.co/storage/v1/object/user-derived/${USER}/${key}.pdf`);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer svc');
  assert.equal(await store.write(USER, key, new Uint8Array([1])), true);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers['x-upsert'], 'true');
  assert.equal(await store.read('../other', key), null, 'no path out of the folder');
  assert.equal(await store.read(USER, '../x'), null);
  assert.equal(await store.write(USER, 'short', new Uint8Array(1)), false);
  assert.equal(await store.removeAll([`${USER}/${key}.pdf`, `${USER}/../x.pdf`, 'plain', `${USER}/${key}`]), 1);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { prefixes: [`${USER}/${key}.pdf`] });
  const failing = createDerivedPdfStore({ url: 'https://x', serviceKey: 's', fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(await failing.read(USER, key), null, 'a cache that cannot be read is a cache that is empty');
  assert.equal(await failing.write(USER, key, new Uint8Array(1)), false);
});

test('the daily sweep also clears the PDFs of originals that are gone, only when the environment says delete', async () => {
  const removed = [];
  const asked = [];
  const db = { rpc: async (name) => { asked.push(name); return name === 'orphan_user_derived' ? [{ name: `${USER}/${'b'.repeat(64)}.pdf`, size: 10 }] : []; } };
  const derived = { removeAll: async (paths) => { removed.push(...paths); return paths.length; } };
  const report = createAssetSweeper({ db, files: { removeAll: async () => 0 }, derived, mode: 'report' });
  const reported = await report.sweepOnce();
  assert.equal(reported.derived.found, 1);
  assert.deepEqual(removed, []);
  const real = createAssetSweeper({ db, files: { removeAll: async () => 0 }, derived, mode: 'delete' });
  const done = await real.sweepOnce();
  assert.equal(done.derived.removed, 1);
  assert.deepEqual(removed, [`${USER}/${'b'.repeat(64)}.pdf`]);
  assert.ok(asked.includes('orphan_user_derived'));
});
