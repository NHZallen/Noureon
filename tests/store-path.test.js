import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_STORE_KIND, storeKindFromPath, storePath } from '../src/app/ui/cli/store-path.js';

test('the addresses of the Extensions page: /skill for the skills, /cli for the CLI tools and /connectors for the connectors', () => {
  assert.equal(DEFAULT_STORE_KIND, 'skills');
  assert.equal(storePath('skills'), '/skill');
  assert.equal(storePath('cli'), '/cli');
  assert.equal(storePath('nonsense'), '/skill', 'the first part for anything else');
  assert.equal(storeKindFromPath('/skill'), 'skills');
  assert.equal(storeKindFromPath('/skill/'), 'skills');
  assert.equal(storeKindFromPath('/cli'), 'cli');
  assert.equal(storeKindFromPath('/cli/'), 'cli');
  assert.equal(storePath('connectors'), '/connectors');
  assert.equal(storeKindFromPath('/connectors'), 'connectors');
  assert.equal(storeKindFromPath('/connectors/'), 'connectors');
  for (const other of ['/', '', undefined, '/skills', '/store', '/store/cli', '/skill/x', '/clip', '/cli/x', '/connector', '/connectors/x', '/terms', '/nouras']) assert.equal(storeKindFromPath(other), null, String(other));
});
