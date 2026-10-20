import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import { executeReply, ReplyError } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { MODELS, modelSupportsSingleTranslation } from '../../src/app/runtime/legacy-core/model-registry.js';

const KEY = 'sk-provider-secret-value';
const TRANSLATOR_KEY = 'sk-translator-secret-value';
const TAVILY = 'tavily-secret-value';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });

// A reply model that reads no file (NVIDIA's DeepSeek) and a translator of another provider (OpenRouter).
const replyModel = MODELS.find((model) => model.id === 'nvidia/deepseek-ai/deepseek-v4.1-flash');
const translatorModel = MODELS.find((model) => model.provider === 'openrouter' && modelSupportsSingleTranslation(model));
const NVIDIA_CHAT = 'https://integrate.api.nvidia.com/v1/chat/completions';

const docx = async (text) => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'report.docx', data: Buffer.from(await zip.generateAsync({ type: 'uint8array' })).toString('base64') };
};
const pdf = { mimeType: 'application/pdf', name: 'contract.pdf', data: Buffer.from('%PDF-1.4 fake').toString('base64') };

const specFor = ({ parts, documents, tools = {}, secrets = {} } = {}) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '18.12.2',
  conversationId: '123e4567-e89b-12d3-a456-426614174000',
  assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
  sequence: 1,
  model: { provider: 'nvidia', id: replyModel.apiId || replyModel.id, info: replyModel },
  request: { history: [], currentMessage: { parts }, systemInstruction: 'The page\'s instruction.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', searchDepth: 'basic', advanced: false, ...tools },
  ...(documents ? { documents } : {}),
  secrets: { providerKey: KEY, ...secrets }
});

// The services of the world: the reply model (NVIDIA), the translator (OpenRouter) and the page reader (Tavily's extract).
const fakeWorld = ({ answer = 'Done.', packet = '# Document Translation Packet\nThe contract says: payment within 30 days.' } = {}) => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const address = String(url);
    const headers = new Headers(options?.headers);
    requests.push({ url: address, key: String(headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), body: String(options?.body || '') });
    if (address === 'https://api.tavily.com/extract') {
      return new Response(JSON.stringify({ results: [{ url: 'https://example.test/article', raw_content: 'The article says the sky is blue.' }] }), { status: 200 });
    }
    if (address.includes('openrouter.ai')) return streamResponse(sse(content(packet)));
    return streamResponse(sse(content(answer)));
  };
  return { requests, fetchImpl };
};
const replyRequest = (requests) => requests.find((request) => request.url === NVIDIA_CHAT);
const translatorRequests = (requests) => requests.filter((request) => request.url.includes('openrouter.ai'));

const run = async ({ spec, secrets, world = fakeWorld() }) => {
  const live = [];
  let result;
  let error = null;
  try {
    result = await executeReply({ spec, secrets, fetchImpl: world.fetchImpl, onLive: (event) => live.push(event) });
  } catch (caught) {
    error = caught;
  }
  return { result, error, live, requests: world.requests };
};
const phases = (live) => live.filter((event) => typeof event.dp === 'string').map((event) => event.dp);

test('a Word file the reply\'s model cannot read is read into text on the server, and the pages are told the step', async () => {
  const parts = [{ text: 'Summarize the report' }, { inlineData: await docx('Quarterly revenue grew 12 percent.') }];
  const { result, requests, live } = await run({ spec: specFor({ parts, documents: { linkedPages: false } }), secrets: { providerKey: KEY } });
  assert.equal(result.status, 'done');
  const sent = replyRequest(requests).body;
  assert.match(sent, /# File: report\.docx/);
  assert.match(sent, /Quarterly revenue grew 12 percent\./);
  assert.doesNotMatch(sent, /wordprocessingml/, 'the file itself is not sent');
  assert.deepEqual(phases(live), ['reading', ''], 'the step is told, and that it is over');
  assert.equal(translatorRequests(requests).length, 0, 'no translator is asked for what the page can read');
});

test('without `documents` the message goes as before: no step is told, no translator or page reader is asked', async () => {
  const parts = [{ text: 'What does https://example.test/article say?' }, { inlineData: pdf }];
  const { requests, live } = await run({ spec: specFor({ parts }), secrets: { providerKey: KEY, searchKey: TAVILY } });
  assert.deepEqual(phases(live), []);
  assert.equal(translatorRequests(requests).length, 0);
  assert.equal(requests.some((request) => request.url === 'https://api.tavily.com/extract'), false);
});

test('a document the model cannot read is written down by the translator model, with the translator\'s own key', async () => {
  const parts = [{ text: 'What are the payment terms?' }, { inlineData: pdf }];
  const documents = { linkedPages: false, translator: { provider: translatorModel.provider, id: translatorModel.apiId || translatorModel.id, info: translatorModel } };
  const { result, requests, live } = await run({ spec: specFor({ parts, documents }), secrets: { providerKey: KEY, translatorKey: TRANSLATOR_KEY } });
  assert.equal(result.status, 'done');
  const [asked] = translatorRequests(requests);
  assert.ok(asked, 'the translator is asked');
  assert.equal(asked.key, TRANSLATOR_KEY, 'with the translator provider\'s key, not the reply\'s');
  assert.match(asked.body, /contract\.pdf/, 'it is given the document');
  const reply = replyRequest(requests);
  assert.equal(reply.key, KEY, 'the reply is made with the reply\'s key');
  assert.match(reply.body, /# Document translation packet/);
  assert.match(reply.body, /payment within 30 days/);
  assert.doesNotMatch(reply.body, /JVBERi0x/, 'the PDF itself is not sent to a model that cannot read it');
  assert.deepEqual(phases(live), ['translating', '']);
});

test('a document the model cannot read and no translator ends the reply with the page\'s own message, free of keys', async () => {
  const parts = [{ text: 'What are the payment terms?' }, { inlineData: pdf }];
  const { error, requests } = await run({ spec: specFor({ parts, documents: { linkedPages: false } }), secrets: { providerKey: KEY } });
  assert.ok(error instanceof ReplyError);
  assert.equal(error.code, 'provider_error');
  assert.match(error.message, /translator/i);
  assert.doesNotMatch(error.message, new RegExp(KEY));
  assert.equal(replyRequest(requests), undefined, 'the model is not asked');
});

test('the addresses of the message are read when the page says so, and left alone when it says not', async () => {
  const parts = [{ text: 'What does https://example.test/article say?' }];
  const read = await run({ spec: specFor({ parts, documents: { linkedPages: true } }), secrets: { providerKey: KEY, searchKey: TAVILY } });
  assert.equal(read.result.status, 'done');
  assert.match(replyRequest(read.requests).body, /the sky is blue/);
  assert.deepEqual(phases(read.live), ['links', '']);

  const left = await run({ spec: specFor({ parts, documents: { linkedPages: false } }), secrets: { providerKey: KEY, searchKey: TAVILY } });
  assert.equal(left.requests.some((request) => request.url === 'https://api.tavily.com/extract'), false);
  assert.doesNotMatch(replyRequest(left.requests).body, /the sky is blue/);
  assert.deepEqual(phases(left.live), []);
});

// ---------- the request

const validBody = (changes = {}) => ({
  ...specFor({ parts: [{ text: 'hello' }], documents: { linkedPages: true, translator: { provider: 'openrouter', id: 'x/y', info: { id: 'x/y' } } } }),
  secrets: { providerKey: KEY, translatorKey: TRANSLATOR_KEY },
  ...changes
});
const bodyWith = (documents, secrets = { providerKey: KEY, translatorKey: TRANSLATOR_KEY }, extra = {}) => ({
  ...specFor({ parts: [{ text: 'hello' }], documents }),
  secrets,
  ...extra
});

test('the request names the translator and the key of its provider, and keeps only what it knows', () => {
  const checked = validateRunSpec(validBody());
  assert.equal(checked.ok, true, JSON.stringify(checked.errors));
  assert.deepEqual(checked.spec.documents, { linkedPages: true, translator: { provider: 'openrouter', id: 'x/y', info: { id: 'x/y' } } });
  assert.equal(checked.spec.secrets.translatorKey, TRANSLATOR_KEY);
});

test('the request is refused when the documents, the translator or its key are not as they should be', () => {
  const translator = { provider: 'openrouter', id: 'x/y', info: { id: 'x/y' } };
  const refused = (body, path) => {
    const checked = validateRunSpec(body);
    assert.equal(checked.ok, false, path);
    assert.ok(checked.errors.some((error) => error.path === path), `${path}: ${JSON.stringify(checked.errors)}`);
  };
  refused(bodyWith({ linkedPages: 'yes' }, { providerKey: KEY }), 'documents.linkedPages');
  refused(bodyWith({ other: 1 }, { providerKey: KEY }), 'documents.other');
  refused(bodyWith({ translator: { provider: 'nowhere', id: 'x', info: {} } }, { providerKey: KEY, translatorKey: TRANSLATOR_KEY }), 'documents.translator.provider');
  refused(bodyWith({ linkedPages: false }, { providerKey: KEY, translatorKey: TRANSLATOR_KEY }), 'secrets.translatorKey');
  refused(bodyWith({ translator }, { providerKey: KEY }), 'secrets.translatorKey');
  // A translator of the reply's own provider needs no key of its own.
  const same = validateRunSpec(bodyWith({ translator: { provider: 'nvidia', id: 'x/y', info: { id: 'x/y' } } }, { providerKey: KEY }));
  assert.equal(same.ok, true, JSON.stringify(same.errors));
  // Not for a deep research or a visual check.
  refused(bodyWith({ linkedPages: false }, { providerKey: KEY }, { kind: 'research', research: { topic: 'x' }, tools: { webSearch: 'research', searchProvider: 'tavily', advanced: false } }), 'documents');
});

test('a Word file for a model that reads it better as a PDF is turned into one on the server, with its own step, even without a translator (NOU-68)', async () => {
  const { setOfficePdfConverter } = await import('../../server/office-pdf.js');
  const opencode = MODELS.find((model) => model.id === 'opencode-go/claude-haiku-5-5');
  const converted = [];
  setOfficePdfConverter({ available: true, convert: async ({ userId, inline }) => { converted.push([userId, inline.name]); return { mimeType: 'application/pdf', name: 'report.pdf', data: Buffer.from('%PDF-1.4 made').toString('base64') }; } });
  try {
    const requests = [];
    const anthropic = (text) => ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'].map((type) => `event: ${type}\ndata: ${JSON.stringify(type === 'content_block_delta' ? { type, index: 0, delta: { type: 'text_delta', text } } : type === 'content_block_start' ? { type, index: 0, content_block: { type: 'text', text: '' } } : type === 'message_start' ? { type, message: { id: 'm', role: 'assistant', content: [] } } : type === 'message_delta' ? { type, delta: { stop_reason: 'end_turn' } } : { type })}\n\n`).join('');
    const fetchImpl = async (url, options) => {
      requests.push({ url: String(url), body: String(options?.body || '') });
      return streamResponse(anthropic('Done.'));
    };
    const spec = { ...specFor({ parts: [{ text: 'Summarize the report' }, { inlineData: await docx('Quarterly revenue grew 12 percent.') }], documents: { linkedPages: false } }), model: { provider: 'opencode-go', id: opencode.apiId, info: opencode } };
    const live = [];
    await executeReply({ spec, secrets: { providerKey: KEY }, userId: 'user-1', fetchImpl, onLive: (event) => live.push(event) }).catch(() => null);
    assert.deepEqual(converted, [['user-1', 'report.docx']], 'converted once, for the person');
    const sent = requests.find((request) => request.url.includes('opencode.ai'))?.body || '';
    assert.match(sent, /application\/pdf/, 'the model is given the PDF');
    assert.doesNotMatch(sent, /Quarterly revenue grew/, 'not the text read out of the file');
    assert.deepEqual(phases(live).filter(Boolean), ['reading', 'pdf'], 'the step of making the PDF is told');
  } finally {
    setOfficePdfConverter(null);
  }
});
