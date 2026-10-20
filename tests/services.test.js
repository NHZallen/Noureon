import assert from 'node:assert/strict';
import test from 'node:test';

import { SERVICES, getService, provideService, withdrawService } from '../src/app/runtime/services.js';

test('a service is provided, got, replaced, and withdrawn only by the one that provided it', () => {
  assert.equal(getService(SERVICES.memorySummarySync), null);
  const first = { name: 'first' };
  const second = { name: 'second' };
  assert.equal(provideService(SERVICES.memorySummarySync, first), first);
  assert.equal(getService(SERVICES.memorySummarySync), first);
  provideService(SERVICES.memorySummarySync, second);
  withdrawService(SERVICES.memorySummarySync, first);
  assert.equal(getService(SERVICES.memorySummarySync), second, 'a newer service is not withdrawn by the older one');
  withdrawService(SERVICES.memorySummarySync, second);
  assert.equal(getService(SERVICES.memorySummarySync), null);
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
