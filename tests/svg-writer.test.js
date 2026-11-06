import assert from 'node:assert/strict';
import test from 'node:test';

import { createImageGenerator, svgIsWrittenByTextModel } from '../src/app/runtime/images/image-generators.js';
import { chatWritesSvg, svgWriterModelInfo } from '../src/app/runtime/images/svg-chat-route.js';
import { SVG_WRITER_INSTRUCTION, canvasSentence, createSvgWriter, extractSvg } from '../src/app/runtime/images/svg-writer.js';
import { createOpenRouterImageGenerator } from '../src/app/runtime/images/openrouter-image-generation.js';
import { rememberDecisions, forgetDecisions } from '../src/app/runtime/decisions/decision-store.js';
import { buildDecisionRequest, parseDecisionResponse } from '../src/app/runtime/decisions/decision-client.js';

// An SVG written by a text model (images/svg-writer.js): for GPT Image 2.6 on OpenRouter, for a picture to start from, and for a text model asked in a chat.

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const PICTURE = 'data:image/png;base64,QUJD';
const decode = (image) => Buffer.from(image.b64Json, 'base64').toString('utf8');

test('the SVG is taken out of the words of the model, with or without a fence or a sentence around it', () => {
  assert.equal(extractSvg(SVG), SVG);
  assert.equal(extractSvg(`Here it is:\n\`\`\`svg\n${SVG}\n\`\`\`\nHope it helps.`), SVG);
  assert.equal(extractSvg(`<SVG viewBox="0 0 1 1"><g/></SVG>`), '<SVG viewBox="0 0 1 1"><g/></SVG>');
  assert.equal(extractSvg('no drawing here'), '');
  assert.equal(extractSvg('<svg>never closed'), '');
  assert.equal(extractSvg(null), '');
});

test('a shape is told to the model as a canvas, no shape leaves the drawing to set its own', () => {
  assert.match(canvasSentence('1:1'), /1024 by 1024/);
  assert.match(canvasSentence('16:9'), /1024 by 576/);
  assert.match(canvasSentence('9:16'), /576 by 1024/);
  assert.equal(canvasSentence('auto'), '');
  assert.equal(canvasSentence(''), '');
});

test('OpenAI is asked through the Responses API with the pictures; OpenRouter through the chat; both give back an SVG picture', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ url: String(url), body, auth: init.headers.Authorization });
    return String(url).includes('openrouter') ? json({ choices: [{ message: { content: `\`\`\`svg\n${SVG}\n\`\`\`` } }] }) : json({ output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: `Sure.\n${SVG}` }] }] });
  };
  const write = createSvgWriter({ fetchImpl, getSafetyIdentifier: async () => 'hash' });

  const openai = await write({ provider: 'openai', apiKey: 'k1', model: 'gpt-6-luna', prompt: 'redraw this', config: { aspectRatio: '1:1' }, inputReferences: [PICTURE] });
  assert.equal(sent[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(sent[0].auth, 'Bearer k1');
  assert.equal(sent[0].body.model, 'gpt-6-luna');
  assert.equal(sent[0].body.instructions, SVG_WRITER_INSTRUCTION);
  assert.equal(sent[0].body.store, false);
  assert.equal(sent[0].body.safety_identifier, 'hash');
  assert.deepEqual(sent[0].body.input[0].content[1], { type: 'input_image', image_url: PICTURE });
  assert.match(sent[0].body.input[0].content[0].text, /redraw this\n\nThe canvas is 1024 by 1024/);
  assert.deepEqual(openai.images.map((image) => [image.mediaType, decode(image)]), [['image/svg+xml', SVG]]);

  const router = await write({ provider: 'openrouter', apiKey: 'k2', model: 'openai/gpt-6-luna', prompt: 'a fox', config: { svgWriter: true, reasoningEffort: 'low' } });
  assert.equal(sent[1].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(sent[1].body.messages[0].role, 'system');
  assert.deepEqual(sent[1].body.messages[1].content, [{ type: 'text', text: 'a fox' }]);
  assert.deepEqual(sent[1].body.reasoning, { effort: 'low' }, 'the depth of thinking of the chat model goes along');
  assert.equal(decode(router.images[0]), SVG);

  await write({ provider: 'openrouter', apiKey: 'k2', model: 'm', prompt: 'p', config: { reasoningEffort: 'low' }, inputReferences: [PICTURE] });
  assert.ok(!('reasoning' in sent[2].body), 'the depth of a picture model is not the depth of the writer');
  assert.deepEqual(sent[2].body.messages[1].content[1], { type: 'image_url', image_url: { url: PICTURE } });
});

test('an answer with no drawing, or an error of the service, is an error with its words', async () => {
  const none = createSvgWriter({ fetchImpl: async () => json({ choices: [{ message: { content: 'Sorry, I cannot.' } }] }) });
  await assert.rejects(() => none({ provider: 'openrouter', apiKey: 'k', model: 'm', prompt: 'p' }), /did not write an SVG/);
  const down = createSvgWriter({ fetchImpl: async () => json({ error: { message: 'No credits' } }, 402) });
  await assert.rejects(() => down({ provider: 'openai', apiKey: 'k', model: 'm', prompt: 'p' }), /No credits/);
});

test('who writes an SVG: OpenAI makes one from words itself; OpenRouter, a picture to start from, and a chat go to a text model', async () => {
  const request = (patch) => ({ provider: 'openai', model: 'gpt-image-2.6-flare', prompt: 'p', config: { outputFormat: 'svg' }, inputReferences: [], ...patch });
  assert.equal(svgIsWrittenByTextModel(request({})), false, 'OpenAI: from words, the official way');
  assert.equal(svgIsWrittenByTextModel(request({ inputReferences: [PICTURE] })), true, 'OpenAI: from a picture');
  assert.equal(svgIsWrittenByTextModel(request({ provider: 'openrouter' })), true, 'OpenRouter takes no SVG');
  assert.equal(svgIsWrittenByTextModel(request({ config: { outputFormat: 'svg', svgWriter: true } })), true, 'a chat');
  assert.equal(svgIsWrittenByTextModel(request({ config: { outputFormat: 'png' }, provider: 'openrouter' })), false);

  const asked = [];
  const fetchImpl = async (url, init) => {
    asked.push({ url: String(url), body: JSON.parse(init.body) });
    return String(url).includes('chat/completions') ? json({ choices: [{ message: { content: SVG } }] })
      : String(url).includes('/responses') ? json({ output_text: SVG }) : json({ data: [{ b64_json: Buffer.from(SVG).toString('base64') }] });
  };
  const generate = createImageGenerator({ fetchImpl, getSafetyIdentifier: async () => '' });
  await generate(request({}));
  assert.equal(asked.at(-1).url, 'https://api.openai.com/v1/images/generations');
  assert.deepEqual(asked.at(-1).body.svg, { model: 'gpt-6-luna' });
  await generate(request({ inputReferences: [PICTURE] }));
  assert.equal(asked.at(-1).url, 'https://api.openai.com/v1/responses');
  assert.equal(asked.at(-1).body.model, 'gpt-6-luna', 'the model that writes is fixed for a picture model');
  await generate(request({ provider: 'openrouter', model: 'openai/gpt-image-2.6-flare' }));
  assert.equal(asked.at(-1).url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(asked.at(-1).body.model, 'openai/gpt-6-luna');
  await generate(request({ provider: 'openrouter', model: 'anthropic/claude-x', config: { outputFormat: 'svg', svgWriter: true } }));
  assert.equal(asked.at(-1).body.model, 'anthropic/claude-x', 'the model of the chat writes it');
});

test('OpenRouter is not asked for a GIF from a picture (it answers a PNG sheet of the frames)', async () => {
  const generate = createOpenRouterImageGenerator({ fetchImpl: async () => { throw new Error('must not be called'); } });
  await assert.rejects(() => generate({ apiKey: 'k', model: 'm', prompt: 'p', config: { outputFormat: 'gif' }, inputReferences: [PICTURE] }), /cannot make a GIF from a picture/);
});

test('the Decisions model is asked whether a vector picture is wanted, and a chat turns into an SVG only on a sure yes', () => {
  assert.ok(buildDecisionRequest({ message: 'draw a fox logo in SVG' }).questions.svg);
  assert.equal(parseDecisionResponse({ answers: { svg: { noul: 0.93 }, search: { noul: 0.1 } } }).svg, 0.93);
  const chat = (provider, text = 'draw a fox as an SVG') => chatWritesSvg({ modelInfo: { provider }, userParts: [{ text }] });
  try {
    rememberDecisions('draw a fox as an SVG', { svg: 0.93 });
    assert.equal(chat('openrouter'), true);
    assert.equal(chat('openai'), true);
    assert.equal(chat('gemini'), false, 'a provider that cannot be asked for an SVG answers in words');
    assert.equal(chat('nvidia'), false);
    rememberDecisions('draw a fox as an SVG', { svg: 0.7 });
    assert.equal(chat('openrouter'), false, 'a guess is not a yes');
    rememberDecisions('another message', { svg: 0.99 });
    assert.equal(chat('openrouter'), false, 'the answers belong to the message they were asked for');
    forgetDecisions();
    assert.equal(chat('openrouter'), false, 'no answers: the model answers in words');
  } finally {
    forgetDecisions();
  }
  const info = svgWriterModelInfo({ id: 'm', provider: 'openrouter', supportedImageAspectRatios: ['1:1'], maxImageCount: 4 });
  assert.deepEqual([info.supportedImageFormats, info.maxImageCount, info.supportedImageOptions, info.supportedImageAspectRatios], [['svg'], 10, [], undefined]);
});

test('a text model writes as many SVGs as the Count asks, one request each, each told its number', async () => {
  const prompts = [];
  const fetchImpl = async (_url, init) => { prompts.push(JSON.parse(init.body).messages[1].content[0].text); return json({ choices: [{ message: { content: SVG } }] }); };
  const writer = createSvgWriter({ fetchImpl });
  const result = await writer({ provider: 'openrouter', apiKey: 'k', model: 'm', prompt: 'a red circle', config: { svgWriter: true, n: 3 } });
  assert.equal(result.images.length, 3);
  assert.equal(prompts.length, 3);
  assert.deepEqual(prompts.map((text) => /version (\d) of 3/.exec(text)?.[1]).sort(), ['1', '2', '3']);
  prompts.length = 0;
  assert.equal((await writer({ provider: 'openrouter', apiKey: 'k', model: 'm', prompt: 'a red circle', config: { svgWriter: true } })).images.length, 1);
  assert.doesNotMatch(prompts[0], /version/);
  // some are better than none; with none, the first problem is the answer
  let calls = 0;
  const flaky = createSvgWriter({ fetchImpl: async () => (++calls === 2 ? json({ choices: [{ message: { content: SVG } }] }) : json({ error: { message: 'down' } }, 500)) });
  assert.equal((await flaky({ provider: 'openrouter', apiKey: 'k', model: 'm', prompt: 'p', config: { n: 3 } })).images.length, 1);
  const dead = createSvgWriter({ fetchImpl: async () => json({ error: { message: 'down' } }, 500) });
  await assert.rejects(() => dead({ provider: 'openrouter', apiKey: 'k', model: 'm', prompt: 'p', config: { n: 2 } }), /down/);
});

test('the Count is kept for an SVG a text model writes, and is 1 for the Images API\'s own', async () => {
  const { settleImageFormatConfig } = await import('../src/app/runtime/images/image-formats.js');
  assert.equal(settleImageFormatConfig({ outputFormat: 'svg', n: 5, svgWriter: true }).n, 5);
  assert.equal(settleImageFormatConfig({ outputFormat: 'svg', n: 5 }).n, 1);
});
