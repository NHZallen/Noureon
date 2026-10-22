import assert from 'node:assert/strict';
import test from 'node:test';

import { keepToolResult, roundImages, toolResult, withoutImages } from '../src/data/tool-result.js';
import { applyGeminiTools, applyOpenAiTools, applyResponsesTools } from '../src/app/runtime/features/tool-call-formats.js';
import { applyAnthropicTools } from '../src/app/runtime/reply/anthropic-messages-format.js';
import { makeThumbnail } from '../server/picture-thumb.js';

const IMAGE = { label: 'Picture 1 of your message, just drawn:', mimeType: 'image/jpeg', data: 'AAAA' };
const call = { id: 'c1', geminiId: 'g1', name: 'generate_image' };
const turn = (results) => ({ assistant: { text: '', toolCalls: [{ id: 'c1', name: 'generate_image', arguments: '{}', args: {} }] }, results });

test('a tool answer is words, or words with small pictures; anything else is read as words', () => {
  assert.deepEqual(toolResult('plain'), { content: 'plain', images: [] });
  assert.deepEqual(toolResult({ content: 'x', images: [IMAGE] }), { content: 'x', images: [IMAGE] });
  assert.deepEqual(toolResult({ content: 'x', images: [{ ...IMAGE, mimeType: 'text/html' }, { ...IMAGE, data: '' }, { ...IMAGE, data: 'A'.repeat(500_000) }] }).images, [], 'a picture that is not one, empty, or too large is left out');
  assert.equal(toolResult({ ok: true }).content, '{"ok":true}');
  assert.deepEqual(keepToolResult(call, 'text'), { id: 'c1', geminiId: 'g1', name: 'generate_image', content: 'text' });
  assert.equal(keepToolResult(call, { content: 'x', images: [IMAGE] }).images.length, 1);
});

test('a round kept to resume from has no pictures', () => {
  const kept = withoutImages([turn([keepToolResult(call, { content: 'x', images: [IMAGE] })])]);
  assert.equal(kept[0].results[0].images, undefined);
  assert.equal(roundImages(kept[0].results).length, 0);
});

test('Gemini gets the pictures after the answers in the same turn', () => {
  const payload = applyGeminiTools({ contents: [] }, { toolTurns: [turn([keepToolResult(call, { content: 'x', images: [IMAGE] })])] });
  const parts = payload.contents.at(-1).parts;
  assert.equal(parts[0].functionResponse.name, 'generate_image');
  assert.deepEqual(parts.slice(1), [{ text: IMAGE.label }, { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }]);
});

test('chat form: a tool message of words, then a message of the user with the pictures', () => {
  const payload = applyOpenAiTools({ messages: [] }, { toolTurns: [turn([keepToolResult(call, { content: 'x', images: [IMAGE] })])] });
  assert.deepEqual(payload.messages.map((message) => message.role), ['assistant', 'tool', 'user']);
  assert.equal(payload.messages[1].content, 'x');
  assert.deepEqual(payload.messages[2].content, [{ type: 'text', text: IMAGE.label }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }]);
});

test('Responses form: an item of the user with the pictures after the output', () => {
  const payload = applyResponsesTools({ input: [] }, { toolTurns: [turn([keepToolResult(call, { content: 'x', images: [IMAGE] })])] });
  const last = payload.input.at(-1);
  assert.equal(last.role, 'user');
  assert.deepEqual(last.content, [{ type: 'input_text', text: IMAGE.label }, { type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' }]);
});

test('Messages form: the pictures follow the tool results in the same message', () => {
  const payload = applyAnthropicTools({ messages: [] }, { toolTurns: [turn([keepToolResult(call, { content: 'x', images: [IMAGE] })])] });
  const blocks = payload.messages.at(-1).content;
  assert.equal(blocks[0].type, 'tool_result');
  assert.deepEqual(blocks.slice(1), [{ type: 'text', text: IMAGE.label }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }]);
});

test('without pictures every form is as before', () => {
  const plain = [turn([keepToolResult(call, 'x')])];
  assert.equal(applyGeminiTools({ contents: [] }, { toolTurns: plain }).contents.at(-1).parts.length, 1);
  assert.equal(applyOpenAiTools({ messages: [] }, { toolTurns: plain }).messages.length, 2);
  assert.equal(applyResponsesTools({ input: [] }, { toolTurns: plain }).input.length, 2);
  assert.equal(applyAnthropicTools({ messages: [] }, { toolTurns: plain }).messages.at(-1).content.length, 1);
});

test('a thumbnail is a small JPEG when the drawing library is there; a picture it cannot read goes as it is only when small', async () => {
  const canvas = await import('@napi-rs/canvas').catch(() => null);
  if (canvas) {
    const surface = canvas.createCanvas(2000, 1000);
    surface.getContext('2d').fillRect(0, 0, 2000, 1000);
    const big = canvas.createCanvas(3000, 1500);
    big.getContext('2d').fillRect(0, 0, 3000, 1500);
    const cut = await canvas.loadImage(Buffer.from((await makeThumbnail(big.toBuffer('image/png'), 'image/png')).data, 'base64'));
    assert.equal(cut.width, 1280, 'a large picture is cut to the side the model is shown');
    const thumb = await makeThumbnail(surface.toBuffer('image/png'), 'image/png');
    assert.equal(thumb.mimeType, 'image/jpeg');
    const small = await canvas.loadImage(Buffer.from(thumb.data, 'base64'));
    assert.equal(small.width, 1280);
    assert.equal(small.height, 640);
  }
  const garbage = Buffer.from('not a picture');
  const kept = await makeThumbnail(garbage, 'image/png');
  assert.ok(kept === null || kept.mimeType === 'image/png');
  assert.equal(await makeThumbnail(Buffer.alloc(300_000, 1), 'image/png'), null, 'too large to go as it is');
});
