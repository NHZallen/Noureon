import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initializeLocalAuthBridgeInBackground,
  initializeStartupAuthBridge
} from '../src/app/auth/startup-auth-bridge.js';

test('required startup auth awaits the dynamically loaded bridge with the resolved identity', async () => {
  const window = {};
  const document = {};
  const startupIdentity = { mode: 'cloud', sessionChecked: true };
  const calls = [];

  const result = await initializeStartupAuthBridge({
    window,
    document,
    startupIdentity,
    loadAuthBridgeModule: async () => {
      calls.push('load');
      return {
        initializeSupabaseAuthBridge: async (options) => {
          calls.push(options);
          return { enabled: true, session: { user: { id: 'user-1' } } };
        }
      };
    }
  });

  assert.deepEqual(calls, [
    'load',
    { window, document, startupIdentity }
  ]);
  assert.equal(result.session.user.id, 'user-1');
});

test('local background auth isolates dynamic import and initialization failures', async () => {
  const chunkFailure = new Error('auth chunk unavailable');
  const initializationFailure = new Error('auth initialization failed');
  const scenarios = [
    {
      failure: chunkFailure,
      loadAuthBridgeModule: async () => {
        throw chunkFailure;
      }
    },
    {
      failure: initializationFailure,
      loadAuthBridgeModule: async () => ({
        initializeSupabaseAuthBridge: async () => {
          throw initializationFailure;
        }
      })
    }
  ];

  for (const scenario of scenarios) {
    const warnings = [];
    const result = await initializeLocalAuthBridgeInBackground({
      startupIdentity: { mode: 'local' },
      loadAuthBridgeModule: scenario.loadAuthBridgeModule,
      logger: {
        warn: (...args) => warnings.push(args)
      }
    });

    assert.deepEqual(result, {
      enabled: false,
      session: null,
      reason: 'background-auth-failed'
    });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][1], scenario.failure);
  }
});
