import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { mediaPieceHash } from '../../src/data/project-media.js';
import { makeScanPdf } from '../helpers/scan-pdf.js';

// The model on the server looks into the videos, recordings and scans of a project (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R6 to R8).

const USER = '22222222-2222-4222-8222-222222222222';
const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const has = spawnSync('ffmpeg', ['-version']).status === 0;
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
const spec = (projectFiles) => ({
  protocol: PROTOCOL_VERSION, clientVersion: '19.1.0', conversationId: ID_A, assistantMessageId: ID_B, sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: 'What happens in the video?' }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, projectFiles },
  secrets: { providerKey: 'sk-provider-secret-value', embeddingKey: 'g-key' }
});

const video = () => {
  const folder = mkdtempSync(join(tmpdir(), 'noureon-media-test-'));
  const file = join(folder, 'talk.mp4');
  const done = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=70:size=160x120:rate=5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  assert.equal(done.status, 0, String(done.stderr));
  const bytes = new Uint8Array(readFileSync(file));
  rmSync(folder, { recursive: true, force: true });
  return bytes;
};

const HASH_V = 'a'.repeat(64);
const HASH_S = 'b'.repeat(64);
const HASH_R = 'c'.repeat(64);
const MEDIA = [
  { id: 'v1', name: 'talk.mp4', kind: 'video', size: 5000, fileHash: HASH_V, mimeType: 'video/mp4', duration: 70, attached: false },
  { id: 'p1', name: 'scan.pdf', kind: 'scan', size: 3000, fileHash: HASH_S, mimeType: 'application/pdf', pages: 3, attached: false },
  { id: 'r1', name: 'memo.mp3', kind: 'audio', size: 3000, fileHash: HASH_R, mimeType: 'audio/mpeg', duration: 130, attached: false }
];

async function run(projectFiles, calls, bytesOf) {
  const files = { load: async ({ marker }) => bytesOf(marker.__astraCloudAsset.path.split('/')[1]) };
  const requests = [];
  let round = 0;
  const result = await executeReply({
    spec: spec(projectFiles), secrets: { providerKey: 'sk-provider-secret-value', embeddingKey: 'g-key' }, userId: USER, files,
    memory: { projectVectors: { forReply: () => async () => [
      { id: 'src:v1:v25', hash: mediaPieceHash(HASH_V, 'v25'), cosine: 0.9 },
      { id: 'src:r1:a50', hash: mediaPieceHash(HASH_R, 'a50'), cosine: 0.8 },
      { id: 'src:p1:p2', hash: mediaPieceHash(HASH_S, 'p2'), cosine: 0.7 },
      { id: 'src:v1:v0', hash: mediaPieceHash('stale', 'v0'), cosine: 0.6 }
    ] } },
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      const call = calls[round];
      round += 1;
      return streamResponse(sse(call ? toolCall(`c${round}`, call.name, call.args) : content('Done.')));
    }
  });
  return { result, requests };
}
const toolAnswers = (requests, index) => requests[index].messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n');

test('the request names videos, recordings and scans with their kind, length and pages; a kind that does not exist is refused', () => {
  const projectFiles = { vector: { provider: 'gemini' }, entries: [], media: MEDIA, canView: true };
  const ok = validateRunSpec(spec(projectFiles));
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.spec.tools.projectFiles.media.map((entry) => [entry.kind, entry.duration, entry.pages]), [['video', 70, undefined], ['scan', undefined, 3], ['audio', 130, undefined]]);
  assert.equal(validateRunSpec(spec({ ...projectFiles, media: [{ ...MEDIA[0], kind: 'film' }] })).ok, false);
});

test('the search names where in a video, a recording and a scan the match is (only a vector of the very part of the very file counts), and a recording is only located', async () => {
  const { requests } = await run({ vector: { provider: 'gemini' }, entries: [], media: MEDIA, canView: true }, [{ name: 'search_project_files', args: { query: 'the speaker' } }], () => null);
  const found = JSON.parse(toolAnswers(requests, 1));
  assert.deepEqual(found.media.map((entry) => [entry.file, entry.kind, JSON.stringify(entry.where)]), [
    ['talk.mp4', 'video', JSON.stringify([{ at: 25, time: '0:25–0:55' }])],
    ['memo.mp3', 'audio', JSON.stringify([{ at: 50, time: '0:50–1:50' }])],
    ['scan.pdf', 'scan', JSON.stringify([{ page: 2 }])]
  ], 'the stale vector of the video is not believed');
  assert.match(found.media_note, /A recording cannot be listened to/);
  assert.match(found.media_note, /"at" for a video/);
  const names = requests[0].tools.map((tool) => tool.function?.name || tool.name).filter((name) => /project_file/.test(name));
  assert.deepEqual(names, ['search_project_files', 'view_project_file']);
});

test('the model looks at a video: four frames from the second it names, taken with ffmpeg from the file of the person', { skip: !has }, async () => {
  const bytes = video();
  const loaded = [];
  const { result, requests } = await run({ entries: [], media: MEDIA, canView: true }, [{ name: 'view_project_file', args: { file: 'talk.mp4', at: 25 } }], (hash) => { loaded.push(hash); return bytes; });
  assert.equal(result.status, 'done');
  assert.deepEqual(loaded, [HASH_V]);
  const shown = JSON.stringify(requests[1].messages);
  assert.equal((shown.match(/data:image\/jpeg;base64,/g) || []).length, 4);
  assert.match(shown, /talk\.mp4 @0:29/);
});

test('the model looks at a page of a scan, and is told to name the page; a recording gives no picture', async () => {
  const pdf = makeScanPdf(3);
  const { requests } = await run({ entries: [], media: MEDIA, canView: true }, [{ name: 'view_project_file', args: { file: 'scan.pdf', page: 2 } }, { name: 'view_project_file', args: { file: 'scan.pdf' } }, { name: 'view_project_file', args: { file: 'memo.mp3' } }], () => pdf);
  assert.match(JSON.stringify(requests[1].messages), /data:image\/jpeg;base64,/);
  assert.match(JSON.stringify(requests[1].messages), /scan\.pdf p\.2/);
  assert.match(toolAnswers(requests, 2), /say which page/);
  assert.match(toolAnswers(requests, 3), /you cannot listen to it/);
});
