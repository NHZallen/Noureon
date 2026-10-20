import assert from 'node:assert/strict';
import test from 'node:test';

import { createModelRequestRuntime } from '../src/app/runtime/legacy-core/model-request-runtime.js';

function fakeEngine(log) {
  return {
    createModelRequestEngine: (dependencies) => {
      log.push(['made', dependencies.marker]);
      return {
        streamApiCall: async (...args) => ['streamed', ...args],
        callApiWithSchema: async (prompt) => ({ prompt }),
        runModelCouncil: async () => 'council'
      };
    }
  };
}

test('the engine is loaded on the first call, once, with the dependencies, and the calls are handed on', async () => {
  const log = [];
  let loads = 0;
  const runtime = createModelRequestRuntime({ marker: 'deps', loadEngine: async () => { loads += 1; return fakeEngine(log); } });
  assert.equal(loads, 0, 'nothing is loaded before a model is asked');
  assert.deepEqual(await runtime.streamApiCall('a', 2), ['streamed', 'a', 2]);
  assert.deepEqual(await runtime.callApiWithSchema('p'), { prompt: 'p' });
  assert.equal(await runtime.runModelCouncil(), 'council');
  assert.equal(loads, 1);
  assert.deepEqual(log, [['made', 'deps']]);
  for (const name of ['runMemoryModel', 'buildSingleModelTranslatedRequestParts', 'fetchTavilySearchPacket', 'streamCouncilApiCallWithRetry', 'generateTitleAndSummary', 'prepareModelRequests']) {
    assert.equal(typeof runtime[name], 'function', name);
  }
});

test('a failed load is tried again on the next call', async () => {
  const log = [];
  let loads = 0;
  const runtime = createModelRequestRuntime({
    loadEngine: async () => {
      loads += 1;
      if (loads === 1) throw new Error('offline');
      return fakeEngine(log);
    }
  });
  await assert.rejects(runtime.streamApiCall('x'), /offline/);
  assert.deepEqual(await runtime.streamApiCall('x'), ['streamed', 'x']);
  assert.equal(loads, 2);
});

test('the engine is loaded ahead when the page is idle', async () => {
  const log = [];
  let idle;
  const runtime = createModelRequestRuntime({ whenIdle: (run) => { idle = run; }, loadEngine: async () => fakeEngine(log) });
  assert.deepEqual(log, []);
  await idle();
  assert.deepEqual(log, [['made', undefined]]);
  await runtime.streamApiCall();
  assert.equal(log.length, 1, 'the engine loaded ahead is the one used');
});
