import assert from 'node:assert/strict';
import test from 'node:test';

import { attachmentKind, attachmentLabelText, expandAttachmentLabels, expandMessageLabels, stampAttachmentLabels, stampMessageLabels } from '../src/app/legacy-runtime/features/attachment-labels.js';
import { officeRequestParts } from '../src/app/ui/files/office-text/office-reader.js';

const png = (name) => ({ inlineData: { mimeType: 'image/png', data: 'AA', name } });
const pdf = (name) => ({ inlineData: { mimeType: 'application/pdf', data: 'BB', name } });
const mp4 = (name) => ({ inlineData: { mimeType: 'video/mp4', data: 'CC', name } });

test('the kinds: pictures, videos, and any other file', () => {
  assert.equal(attachmentKind({ mimeType: 'image/jpeg' }), 'image');
  assert.equal(attachmentKind({ mimeType: 'video/quicktime' }), 'video');
  assert.equal(attachmentKind({ mimeType: 'application/pdf' }), 'file');
  assert.equal(attachmentKind({ mimeType: 'audio/mpeg' }), 'file');
  assert.equal(attachmentKind({}), 'file');
});

test('each kind is numbered from 1 within its message, in the order of the message', () => {
  const stamped = stampAttachmentLabels([{ text: 'Look' }, png('a.png'), pdf('contract.pdf'), png('b.png'), mp4('clip.mp4'), pdf('annex.pdf'), png('c.png')]);
  assert.deepEqual(stamped.filter((part) => part.inlineData).map((part) => part.inlineData.attachmentLabel), [
    'Image 1 of 3 in this message: a.png',
    'File 1 of 2 in this message: contract.pdf',
    'Image 2 of 3 in this message: b.png',
    'Video 1 of 1 in this message: clip.mp4',
    'File 2 of 2 in this message: annex.pdf',
    'Image 3 of 3 in this message: c.png'
  ]);
  assert.equal(stamped[0].text, 'Look');
});

test('the parts are copied, a label that is there stays, an attachment without a name is left alone and not counted', () => {
  const parts = [png('a.png'), { inlineData: { mimeType: 'image/jpeg', data: 'ZZ' } }, png('b.png')];
  const stamped = stampAttachmentLabels(parts);
  assert.equal(parts[0].inlineData.attachmentLabel, undefined, 'the message is not changed');
  assert.equal(stamped[1].inlineData.attachmentLabel, undefined);
  assert.equal(stamped[2].inlineData.attachmentLabel, 'Image 2 of 2 in this message: b.png');
  const again = stampAttachmentLabels(stamped);
  assert.equal(again[0].inlineData.attachmentLabel, 'Image 1 of 2 in this message: a.png');
  assert.equal(stampAttachmentLabels([{ text: 'no attachment' }])[0].text, 'no attachment');
});

test('a name is kept on one line without brackets, and short', () => {
  assert.equal(attachmentLabelText('file', 1, 1, 'my [secret]\nplan.pdf'), 'File 1 of 1 in this message: my (secret) plan.pdf');
  assert.ok(attachmentLabelText('file', 1, 1, 'x'.repeat(500)).length < 160);
});

test('only what the person sent is stamped, in a history', () => {
  const messages = [{ role: 'user', parts: [png('a.png')] }, { role: 'model', parts: [png('made.png')] }];
  const out = stampMessageLabels(messages);
  assert.equal(out[0].parts[0].inlineData.attachmentLabel, 'Image 1 of 1 in this message: a.png');
  assert.equal(out[1], messages[1]);
});

test('the label is put in front of its attachment as a line of text, and taken off the attachment', () => {
  const out = expandAttachmentLabels(stampAttachmentLabels([{ text: 'Look' }, png('a.png'), pdf('r.pdf')]));
  assert.deepEqual(out, [
    { text: 'Look' },
    { text: '[Image 1 of 1 in this message: a.png]' },
    { inlineData: { mimeType: 'image/png', data: 'AA', name: 'a.png' } },
    { text: '[File 1 of 1 in this message: r.pdf]' },
    { inlineData: { mimeType: 'application/pdf', data: 'BB', name: 'r.pdf' } }
  ]);
  const history = expandMessageLabels(stampMessageLabels([{ role: 'user', parts: [png('a.png')] }]));
  assert.equal(history[0].parts[0].text, '[Image 1 of 1 in this message: a.png]');
});

test('a Word file read into text keeps its number and name at the top of its text', () => {
  const [part] = officeRequestParts({ name: 'report.docx', label: 'Word document', text: 'Hello', images: [], imageTotal: 0, omitted: 0, kind: 'docx' }, { sendImages: false, label: 'File 2 of 3 in this message: report.docx' });
  assert.equal(part.text.split('\n')[0], '[File 2 of 3 in this message: report.docx]');
  assert.match(part.text, /# File: report\.docx \(Word document\)/);
});
