import assert from 'node:assert/strict';
import test from 'node:test';

import { chatVideoNote, lookableVideoParts, prepareChatVideos, withChatVideoNotes } from '../src/app/runtime/messages/chat-video.js';
import { createProjectFilesAccess } from '../src/app/runtime/projects/project-files-access.js';
import { createMediaViewer } from '../src/app/runtime/projects/project-media-view.js';
import { MODELS } from '../src/app/runtime/shell/model-registry.js';

// A video attached to a message is looked at with view_project_file by a model that sees pictures but cannot take a video whole (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §2).

const MODEL = (id) => JSON.parse(JSON.stringify(MODELS.find((model) => model.id === id)));
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const video = (name, bytes = [1, 2, 3, 4]) => ({ inlineData: { mimeType: 'video/mp4', name, data: b64(bytes), attachmentLabel: `Video 1 of 1 in this message: ${name}` } });
const toolbox = (log, found = { duration: 130, hasVideo: true, hasAudio: true }) => async () => ({ open: async ({ name }) => { log.opened.push(name); return { probe: async () => found, frame: async (at) => ({ mimeType: 'image/jpeg', data: new Uint8Array([at]) }), close: async () => { log.closed += 1; } }; } });

test('only a video that the model cannot take itself is looked at with the tool, and only when the model can look (sees pictures, calls tools)', () => {
  const blind = MODEL('nvidia/deepseek-ai/deepseek-v4.1-flash');
  const hearing = MODEL('gemini-3.8-flash');
  const parts = [{ text: 'hi' }, video('a.mp4'), { inlineData: { mimeType: 'image/png', name: 'p.png', data: 'AAAA' } }];
  assert.equal(lookableVideoParts(parts, blind, true).length, 1);
  assert.equal(lookableVideoParts(parts, blind, false).length, 0, 'a model that cannot look: no');
  assert.equal(lookableVideoParts(parts, hearing, true).length, 0, 'a model that takes the video itself is given the video');
});

test('a video learns its hash and length once (kept with the part), becomes an entry for the tool, and a file with no picture in it is left alone', async () => {
  const log = { opened: [], closed: 0 };
  const part = video('talk.mp4', [9, 9]);
  const crypto = { subtle: { digest: async () => new Uint8Array(32).fill(171).buffer } };
  const prepared = await prepareChatVideos([{ text: 'hi' }, part], MODEL('nvidia/deepseek-ai/deepseek-v4.1-flash'), true, { getToolbox: toolbox(log), cryptoProvider: crypto });
  assert.equal(prepared.entries.length, 1);
  assert.deepEqual(part.mediaInfo, { hash: 'ab'.repeat(32), duration: 130 });
  const [entry] = prepared.entries;
  assert.equal(entry.id, `att-${'ab'.repeat(8)}`);
  assert.equal(entry.name, 'talk.mp4');
  assert.equal(entry.kind, 'video');
  assert.equal(entry.fileHash, 'ab'.repeat(32));
  assert.deepEqual(await entry.bytes(), { mimeType: 'video/mp4', data: part.inlineData.data });
  assert.equal(log.closed, 1);
  await prepareChatVideos([part], MODEL('nvidia/deepseek-ai/deepseek-v4.1-flash'), true, { getToolbox: toolbox(log), cryptoProvider: crypto });
  assert.equal(log.opened.length, 1, 'learned once: not opened again');
  const silent = video('s.mp4');
  const none = await prepareChatVideos([silent], MODEL('nvidia/deepseek-ai/deepseek-v4.1-flash'), true, { getToolbox: toolbox({ opened: [], closed: 0 }, { duration: 5, hasVideo: false, hasAudio: true }), cryptoProvider: crypto });
  assert.equal(none.entries.length, 0);
  assert.equal(silent.mediaInfo, undefined);
  // Two videos with the same name are told apart.
  const twin = await prepareChatVideos([video('x.mp4', [1]), video('x.mp4', [2])], MODEL('nvidia/deepseek-ai/deepseek-v4.1-flash'), true, { getToolbox: toolbox({ opened: [], closed: 0 }), cryptoProvider: { subtle: { digest: async (_name, bytes) => new Uint8Array(32).fill(bytes[0]).buffer } } });
  assert.deepEqual(twin.entries.map((item) => item.name), ['x.mp4', 'x (2).mp4']);
});

test('the request has a note in place of the video (what it is, how long, how to look at it, and the words said in it when there are), and the message keeps the video', async () => {
  const log = { opened: [], closed: 0 };
  const part = video('talk.mp4');
  part.transcript = { text: '[0:00] hello\n[1:00] bye', model: 'openai/whisper-large-v3' };
  const picture = { inlineData: { mimeType: 'image/png', name: 'p.png', data: 'AAAA' } };
  const message = [{ text: 'What happens?' }, part, picture];
  const prepared = await prepareChatVideos(message, MODEL('nvidia/deepseek-ai/deepseek-v4.1-flash'), true, { getToolbox: toolbox(log), cryptoProvider: { subtle: { digest: async () => new Uint8Array(32).fill(1).buffer } } });
  const request = withChatVideoNotes(message, prepared);
  assert.equal(request[0], message[0]);
  assert.equal(request[2], picture);
  assert.match(request[1].text, /^\[Video 1 of 1 in this message: talk\.mp4\] A video of 2:10\. You cannot watch it whole: look at it with the tool view_project_file \(file: "talk\.mp4"\)\./);
  assert.match(request[1].text, /\[0:00\] hello\n\[1:00\] bye$/);
  assert.equal(message[1], part, 'the message itself still has the video');
  assert.equal(withChatVideoNotes(message, { entries: [] }), message);
  assert.match(chatVideoNote(video('v.mp4'), { name: 'v.mp4', duration: 61 }).text, /No transcript of what is said in it is given\.$/);
});

test('a chat that is not in a project has the tools for the videos of the message: the tool looks at one from the second it is told, the server is told only the facts of the file, and a model that cannot see gets nothing', async () => {
  const log = { opened: [], closed: 0 };
  const part = video('talk.mp4');
  const prepared = await prepareChatVideos([part], MODEL('nvidia/deepseek-ai/deepseek-v4.1-flash'), true, { getToolbox: toolbox(log), cryptoProvider: { subtle: { digest: async () => new Uint8Array(32).fill(2).buffer } } });
  const asked = [];
  const viewer = async (source, entry, place) => { asked.push([source, entry.name, place]); return [{ mimeType: 'image/jpeg', data: 'QUJD', at: place.at }]; };
  const access = await createProjectFilesAccess({ conversation: { id: 'c' }, canViewPictures: true, attachments: prepared.entries, viewer });
  assert.ok(access);
  const loader = access.make('en');
  assert.deepEqual(loader.tools.map((tool) => tool.name), ['search_project_files', 'view_project_file']);
  const shown = await loader.run({ name: 'view_project_file', args: { file: 'talk.mp4', at: 40 } });
  assert.deepEqual(asked, [[null, 'talk.mp4', { at: 40, page: null }]]);
  assert.equal(shown.images.length, 1);
  assert.equal(shown.images[0].label, 'talk.mp4 @0:40');
  const snapshot = access.snapshot();
  assert.deepEqual(snapshot.media, [{ id: `att-${'02'.repeat(8)}`, name: 'talk.mp4', kind: 'video', size: snapshot.media[0].size, fileHash: '02'.repeat(32), mimeType: 'video/mp4', duration: 130, attached: false }]);
  assert.equal(snapshot.canView, true);
  assert.deepEqual(snapshot.entries, []);
  assert.equal(await createProjectFilesAccess({ conversation: { id: 'c' }, canViewPictures: true, attachments: [] }), null, 'no project and no video: nothing');
});

test('the frames of a video of a message are taken from its own bytes (no source of a project), four from the second named', async () => {
  const log = { opened: [], closed: 0 };
  const view = createMediaViewer({ getToolbox: toolbox(log) });
  const entry = { name: 'talk.mp4', kind: 'video', duration: 130, bytes: async () => ({ mimeType: 'video/mp4', data: b64([1, 2, 3]) }) };
  const frames = await view(null, entry, { at: 40, page: null });
  assert.deepEqual(frames.map((frame) => frame.at), [43.8, 51.3, 58.8, 66.3]);
  assert.deepEqual(log.opened, ['talk.mp4']);
  assert.equal(log.closed, 1);
});
