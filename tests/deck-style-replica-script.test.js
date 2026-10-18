import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// The script of the skill deck-style-replica, run with the python-pptx the sandboxes have (1.0.2). Skipped where python3 or python-pptx is missing.
const scripts = fileURLToPath(new URL('../src/data/official-skills/deck-style-replica/scripts/', import.meta.url));
const checks = fileURLToPath(new URL('./python/deckstyle_check.py', import.meta.url));
const ready = spawnSync('python3', ['-c', 'import pptx, PIL'], { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }).status === 0;

test('deck-style-replica: the style is learnt and the content is not, a deck is built and changed, and the check finds problems', { skip: !ready && 'python3 with python-pptx is not here' }, () => {
  const run = spawnSync('python3', [checks, scripts], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 120_000 });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /^OK$/m);
});
