import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile startup does not block app entry on cloud sync or slow auth extras', () => {
  const mainSource = readSource('src/main.js');
  const authBridgeSource = readSource('src/app/auth/supabase-auth-bridge.js');

  assert.match(mainSource, /void\s+initializeCloudWorkspaceSync\(/);
  assert.doesNotMatch(mainSource, /await\s+initializeCloudWorkspaceSync\(/);
  assert.match(authBridgeSource, /CLOUD_PROFILE_REFRESH_TIMEOUT_MS/);
  assert.match(authBridgeSource, /Promise\.race\(/);
  assert.match(authBridgeSource, /void\s+turnstile\.mount\(/);
  assert.doesNotMatch(authBridgeSource, /await\s+turnstile\.mount\(/);
});
