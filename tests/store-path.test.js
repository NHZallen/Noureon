import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_STORE_KIND, storeKindFromPath, storePath } from '../src/app/ui/cli/store-path.js';

test('the addresses of the Extensions page: /skill for the skills and /cli for the CLI tools', () => {
  assert.equal(DEFAULT_STORE_KIND, 'skills');
  assert.equal(storePath('skills'), '/skill');
  assert.equal(storePath('cli'), '/cli');
  assert.equal(storePath('nonsense'), '/skill', 'the first part for anything else');
  assert.equal(storeKindFromPath('/skill'), 'skills');
  assert.equal(storeKindFromPath('/skill/'), 'skills');
  assert.equal(storeKindFromPath('/cli'), 'cli');
  assert.equal(storeKindFromPath('/cli/'), 'cli');
  for (const other of ['/', '', undefined, '/skills', '/store', '/store/cli', '/skill/x', '/clip', '/cli/x', '/terms', '/nouras']) assert.equal(storeKindFromPath(other), null, String(other));
});
