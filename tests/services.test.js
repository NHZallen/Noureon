import assert from 'node:assert/strict';
import test from 'node:test';

import { SERVICES, getService, provideService, withdrawService } from '../src/app/runtime/services.js';

test('a service is provided, got, replaced, and withdrawn only by the one that provided it', () => {
  assert.equal(getService(SERVICES.cloudAssets), null);
  const first = { name: 'first' };
  const second = { name: 'second' };
  assert.equal(provideService(SERVICES.cloudAssets, first), first);
  assert.equal(getService(SERVICES.cloudAssets), first);
  provideService(SERVICES.cloudAssets, second);
  withdrawService(SERVICES.cloudAssets, first);
  assert.equal(getService(SERVICES.cloudAssets), second, 'a newer service is not withdrawn by the older one');
  withdrawService(SERVICES.cloudAssets, second);
  assert.equal(getService(SERVICES.cloudAssets), null);
});

test('an unknown service name is a mistake, not a silent null', () => {
  assert.throws(() => getService('cloudsync'), TypeError);
  assert.throws(() => provideService('not-a-service', {}), TypeError);
});

test('the services are listed for a support session in the console, read only', () => {
  const sync = { diagnose: () => 'ok' };
  provideService(SERVICES.cloudSync, sync);
  assert.equal(globalThis.noureonDebug.service('cloud-sync'), sync);
  assert.ok(globalThis.noureonDebug.names().includes('cloud-sync'));
  assert.throws(() => { 'use strict'; globalThis.noureonDebug.service = null; }, TypeError);
  withdrawService(SERVICES.cloudSync, sync);
});
