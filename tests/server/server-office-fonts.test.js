import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import { finishAdvancedReply } from '../../server/advanced-reply.js';
import { embedRunFonts } from '../../server/office-fonts.js';

const docx = async (font) => {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}"/></w:rPr><w:t>Hello 你好</w:t></w:r></w:p></w:body></w:document>`);
  zip.file('word/fontTable.xml', '<?xml version="1.0"?><w:fonts xmlns:w="w" xmlns:r="r"/>');
  zip.file('word/_rels/fontTable.xml.rels', '<?xml version="1.0"?><Relationships xmlns="x"/>');
  zip.file('word/settings.xml', '<w:settings xmlns:w="w"></w:settings>');
  zip.file('[Content_Types].xml', '<Types xmlns="t"></Types>');
  return zip.generateAsync({ type: 'uint8array' });
};
const runWith = (name, bytes) => ({ status: 'done', steps: [{ title: '', code: '', stdout: '', stderr: '', files: [{ name, size: bytes.byteLength }], outputs: [{ name, bytes }] }] });

test('a Word file Python made names the app\'s fonts: they are embedded (subset), and the size listed follows', async () => {
  const bytes = await docx('Inter');
  const run = runWith('report.docx', bytes);
  await embedRunFonts(run);
  const out = run.steps[0].outputs[0].bytes;
  assert.ok(out.byteLength > bytes.byteLength, 'the file now holds the font');
  assert.equal(run.steps[0].files[0].size, out.byteLength);
  const zip = await JSZip.loadAsync(out);
  assert.ok(Object.keys(zip.files).some((name) => /^word\/fonts\/.+\.odttf$/.test(name)), 'an obfuscated font is in the file');
  assert.match(await zip.file('word/settings.xml').async('string'), /embedTrueTypeFonts/);
});

test('fonts the app does not have, and files that are not Word or PowerPoint, are left alone', async () => {
  const bytes = await docx('Calibri');
  const run = runWith('report.docx', bytes);
  run.steps[0].outputs.push({ name: 'data.csv', bytes: new TextEncoder().encode('a,b') });
  await embedRunFonts(run);
  assert.deepEqual([...run.steps[0].outputs[0].bytes], [...bytes]);
  assert.equal(new TextDecoder().decode(run.steps[0].outputs[1].bytes), 'a,b');
});

test('a file that is not a real archive does not stop the reply', async () => {
  const run = runWith('broken.docx', new TextEncoder().encode('not a zip'));
  await embedRunFonts(run);
  assert.equal(new TextDecoder().decode(run.steps[0].outputs[0].bytes), 'not a zip');
});

test('the files of a reply are embedded before they are kept, so the stored file has the fonts', async () => {
  const run = runWith('report.docx', await docx('Inter'));
  const saved = [];
  const out = await finishAdvancedReply({ result: { text: 'Done.' }, run, userId: 'u1', files: { save: async ({ bytes }) => { saved.push(bytes); return { __astraCloudAsset: { path: 'u1/x' } }; } } });
  const zip = await JSZip.loadAsync(saved[0]);
  assert.ok(Object.keys(zip.files).some((name) => name.endsWith('.odttf')));
  assert.equal(out.parts[0].sandboxFile.size, saved[0].byteLength);
});
