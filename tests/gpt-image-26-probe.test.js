import assert from 'node:assert/strict';
import test from 'node:test';

import { gifInfo, runProbe } from '../scripts/gpt-image-26-probe.mjs';

// The probe of GPT Image 2.6 (scripts/gpt-image-26-probe.mjs): the owner runs it with a real key; here it is tried against a fake service, to be sure what it asks, what it reads and that it never lets the key out.

const frame = (delayCentiseconds) => Buffer.from([0x21, 0xf9, 0x04, 0x00, delayCentiseconds, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00]);
const GIF = Buffer.concat([
  Buffer.from('GIF89a', 'latin1'), Buffer.from([1, 0, 1, 0, 0x80, 0, 0, 0xff, 0xff, 0xff, 0, 0, 0]),
  Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00]),
  frame(20), frame(5), Buffer.from([0x3b])
]);

test('the frames of a GIF are counted with the time of each and whether it loops; anything else is not one', () => {
  assert.deepEqual(gifInfo(GIF), { frames: 2, width: 1, height: 1, delaysMs: [200, 50], loops: true });
  assert.equal(gifInfo(Buffer.from('<svg/>')), null);
  assert.equal(gifInfo(Buffer.alloc(3)), null);
});

test('the probe asks as the app does, reads what comes back, and never lets the key out', async () => {
  const KEY = 'sk-secret-key-value-123';
  const sent = [];
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    sent.push({ url: String(url), body, auth: init.headers?.Authorization });
    if (String(url).includes('/models')) return Response.json({ data: [{ id: 'openai/gpt-image-2.6-flare', name: 'GPT Image 2.6 Flare', pricing: { image: '0' }, supported_parameters: ['output_format'] }, { id: 'other/model' }] });
    if (body.output_format === 'gif' && body.frame_count === 4 && body.frame_duration_ms) return Response.json({ data: [{ b64_json: GIF.toString('base64') }], usage: { cost: 0.02 } });
    if (body.output_format === 'gif') return Response.json({ error: { message: `GIF output is not enabled for this request (${KEY})` } }, { status: 400 });
    if (body.output_format === 'svg') return Response.json({ data: [{ b64_json: Buffer.from('<svg width="2" height="2"><script>x()</script><rect width="2" height="2"/></svg>').toString('base64'), media_type: 'image/svg+xml' }] });
    return Response.json({ data: [{ b64_json: Buffer.from('PNGDATA').toString('base64') }] });
  };
  const result = await runProbe({ provider: 'openrouter', key: KEY, model: 'openai/gpt-image-2.6-flare', tests: ['list', 'png', 'gif', 'svg'], fetchImpl });
  const { results } = result;
  assert.deepEqual(results.list.models.map((model) => model.id), ['openai/gpt-image-2.6-flare']);
  assert.equal(results.png.status, 200);
  assert.equal(results['gif-4-frames'].pictures[0].gif.frames, 2);
  assert.deepEqual(results['gif-4-frames'].pictures[0].gif.delaysMs, [200, 50]);
  assert.equal(results['gif-default-frames'].status, 400);
  assert.match(results['gif-default-frames'].error, /not enabled/);
  assert.ok(!results['gif-default-frames'].error.includes(KEY), 'the key is taken out of what the service says');
  const svg = results.svg.pictures[0];
  assert.equal(svg.mediaType, 'image/svg+xml');
  assert.match(svg.svg.startsWith, /^<svg/);
  assert.ok(!JSON.stringify(result).includes(KEY), 'the key is nowhere in the result');
  const gifRequest = sent.find((entry) => entry.body?.output_format === 'gif');
  assert.deepEqual([gifRequest.body.frame_count, gifRequest.body.frame_duration_ms, gifRequest.url], [4, 200, 'https://openrouter.ai/api/v1/images']);
  assert.ok(sent.every((entry) => entry.auth === `Bearer ${KEY}`));
  assert.ok(sent.filter((entry) => entry.body).every((entry) => !('output_compression' in entry.body) || entry.body.output_format !== 'gif'));

  const openai = await runProbe({ provider: 'openai', key: KEY, model: 'gpt-image-2.6-flare', tests: ['gif'], fetchImpl });
  assert.equal(openai.results['gif-4-frames'].request.size, 'auto', 'a GIF is a sheet of frames: 1024x1024 was refused by OpenAI, the size is automatic by default');
  assert.ok(sent.some((entry) => entry.url === 'https://api.openai.com/v1/images/generations'));
});

test('it stops after four 429 in a row', async () => {
  const fetchImpl = async () => Response.json({ error: { message: 'slow down' } }, { status: 429 });
  await assert.rejects(() => runProbe({ provider: 'openrouter', key: 'k', model: 'm', tests: ['frames'], fetchImpl }), /four 429/);
});
