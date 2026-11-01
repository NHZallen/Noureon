import assert from 'node:assert/strict';
import test from 'node:test';

import { createDriveUpload } from '../src/app/runtime/features/drive-upload.js';
import { drivePickerAvailable, getDrivePicker, resetDrivePicker } from '../src/app/runtime/projects/drive-picker.js';

// "Google Drive" in the menu of the message box: the files picked go where the files of the device go, a closed window is silent, a failure and an unreadable file are said.

const I18N = { en: { pjDriveFailed: 'Picker failed.', pjDriveReadFailed: '"{name}" could not be read.' } };
const make = (picker) => {
  const notes = [];
  const selected = [];
  const upload = createDriveUpload({ document: {}, getConfig: () => ({ uiLanguage: 'en' }), i18n: I18N, showNotification: (message, type) => notes.push([message, type]), handleFileSelection: (event) => selected.push(event.target), getPicker: () => picker });
  return { upload, notes, selected };
};

test('without keys for the picker there is no Google Drive: no picker, nothing to pick', async () => {
  resetDrivePicker();
  assert.equal(drivePickerAvailable(), false);
  assert.equal(getDrivePicker({ document: {} }), null);
  const { upload, notes, selected } = make(null);
  assert.equal(upload.available(), false);
  upload.warm();
  await upload.pick();
  assert.deepEqual([notes, selected], [[], []]);
});

test('the files picked are put in the box like files of the device, and each one that could not be read is named', async () => {
  const files = [{ name: 'a.pdf' }, { name: 'b.png' }];
  let warmed = 0;
  const { upload, notes, selected } = make({ warm: () => { warmed += 1; }, pick: async () => ({ ok: true, files, failed: [{ name: 'c.zip', code: 'too_big' }] }) });
  assert.equal(upload.available(), true);
  upload.warm();
  await upload.pick();
  assert.equal(warmed, 1);
  assert.deepEqual(selected, [{ files, value: '' }]);
  assert.deepEqual(notes, [['"c.zip" could not be read.', 'error']]);
});

test('a closed window says nothing; a window that could not open says so; nothing picked puts nothing in the box', async () => {
  const closed = make({ pick: async () => ({ ok: false, code: 'cancelled' }) });
  await closed.upload.pick();
  assert.deepEqual([closed.notes, closed.selected], [[], []]);
  const broken = make({ pick: async () => ({ ok: false, code: 'blocked' }) });
  await broken.upload.pick();
  assert.deepEqual(broken.notes, [['Picker failed.', 'error']]);
  const throwing = make({ pick: async () => { throw new Error('x'); } });
  await throwing.upload.pick();
  assert.deepEqual(throwing.notes, [['Picker failed.', 'error']]);
  const empty = make({ pick: async () => ({ ok: true, files: [], failed: [] }) });
  await empty.upload.pick();
  assert.deepEqual(empty.selected, []);
});
