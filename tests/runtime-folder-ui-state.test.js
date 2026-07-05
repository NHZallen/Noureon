import assert from 'node:assert/strict';
import test from 'node:test';

import { createFolderUiStatePersistence } from '../src/app/runtime/kernel/folder-ui-state.js';

test('folder expansion is stored separately and restored by id', async () => {
  const values = new Map();
  const persistence = createFolderUiStatePersistence({
    getUsername: () => 'supabase:user-1',
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value)
  });

  await persistence.save([{ id: 'f1', isOpen: true }, { id: 'f2', isOpen: false }]);
  const folders = [{ id: 'f1', isOpen: false }, { id: 'f3', isOpen: false }];
  await persistence.restore(folders);

  assert.equal(folders[0].isOpen, true);
  assert.equal(folders[1].isOpen, false);
});

