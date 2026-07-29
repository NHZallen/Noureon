import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemorySummaryRuntimeService } from '../src/app/runtime/memory/memory-summary-runtime-service.js';

test('manual memory-summary changes persist first and then request an automatic fresh reconciliation', async () => {
  let memoryState = {};
  let persisted = 0;
  let rebuilds = 0;
  const service = createMemorySummaryRuntimeService({
    getMemoryState: () => memoryState,
    replaceMemoryState: value => { memoryState = value; },
    persistMemoryState: async () => { persisted += 1; },
    rebuildHistoryIndex: async () => { rebuilds += 1; return { state: 'complete' }; },
    createMemoryOverview: async () => ({ overview: 'Visible overview.', sections: [] }),
    createId: prefix => `${prefix}:manual`
  });

  const summary = await service.updateSummary({ title: 'Deployment', content: 'Use the NUC now.', key: 'deployment' });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(summary.sections[0].authority, 'manual');
  assert.equal(memoryState.memorySummary.sections[0].content, 'Use the NUC now.');
  assert.equal(rebuilds, 1);
  assert.ok(persisted >= 1);
});

test('refreshes the user-facing overview only after the explicit request', async () => {
  let memoryState = {
    memorySummary: {
      overview: 'Complete current memory.',
      sections: [{ id: 'canonical-1', key: 'deployment', title: 'Deployment', content: 'Use the NUC.', updatedAt: '2026-07-29T04:00:00.000Z' }],
      updatedAt: '2026-07-29T04:00:00.000Z'
    },
    memoryOverview: {
      overview: 'Older visible overview.',
      sections: [{ id: 'overview-1', key: 'deployment', title: 'Deployment', content: 'Old text.', updatedAt: '2026-07-28T04:00:00.000Z' }],
      updatedAt: '2026-07-28T04:00:00.000Z',
      basedOnMemorySummaryUpdatedAt: '2026-07-28T04:00:00.000Z',
      needsRefresh: true
    }
  };
  let overviewRequests = 0;
  const service = createMemorySummaryRuntimeService({
    getMemoryState: () => memoryState,
    replaceMemoryState: value => { memoryState = value; },
    persistMemoryState: async () => {},
    rebuildHistoryIndex: async () => ({ state: 'complete' }),
    createMemoryOverview: async ({ memorySummary }) => {
      overviewRequests += 1;
      assert.equal(memorySummary.sections[0].content, 'Use the NUC.');
      return {
        overview: 'Current visible overview.',
        sections: [{ key: 'deployment', title: 'Deployment', content: 'NUC deployment.' }],
        modelId: 'memory-model'
      };
    },
    createId: prefix => `${prefix}:overview`
  });

  assert.equal(overviewRequests, 0, 'opening or reading state cannot create the display overview');
  await service.refreshOverview();

  assert.equal(overviewRequests, 1);
  assert.equal(memoryState.memoryOverview.overview, 'Current visible overview.');
  assert.equal(memoryState.memoryOverview.needsRefresh, false);
  assert.equal(memoryState.memoryOverview.basedOnMemorySummaryUpdatedAt, '2026-07-29T04:00:00.000Z');
});
