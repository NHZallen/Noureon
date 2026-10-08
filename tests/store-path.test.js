import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_STORE_KIND, storeKindFromPath, storePath } from '../src/app/ui/cli/store-path.js';

test('the addresses of the Extensions page: /store/skills and /store/cli, /store alone is the first, the old /cli is the CLI tools', () => {
  assert.equal(DEFAULT_STORE_KIND, 'skills');
  assert.equal(storePath('cli'), '/store/cli');
  assert.equal(storePath('skills'), '/store/skills');
  assert.equal(storePath('nonsense'), '/store/skills', 'the first part for anything else');
  assert.equal(storeKindFromPath('/store'), 'skills');
  assert.equal(storeKindFromPath('/store/'), 'skills');
  assert.equal(storeKindFromPath('/store/skills'), 'skills');
  assert.equal(storeKindFromPath('/store/cli/'), 'cli');
  assert.equal(storeKindFromPath('/cli'), 'cli');
  for (const other of ['/', '', undefined, '/store/other', '/store/cli/x', '/stores', '/clip', '/terms', '/nouras']) assert.equal(storeKindFromPath(other), null, String(other));
});
