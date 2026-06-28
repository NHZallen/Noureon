import assert from 'node:assert/strict';
import test from 'node:test';

import { CHART_AUTHORING_GUIDANCE } from '../src/app/ui/charts/chart-authoring-guidance.js';
import { parseAndNormalizeChartSchema } from '../src/app/ui/charts/chart-schema.js';

test('chart authoring guidance covers selection, fallback, and supported output rules', () => {
  assert.match(CHART_AUTHORING_GUIDANCE, /time series/);
  assert.match(CHART_AUTHORING_GUIDANCE, /category comparisons/);
  assert.match(CHART_AUTHORING_GUIDANCE, /relationships between two numeric fields/);
  assert.match(CHART_AUTHORING_GUIDANCE, /shares, percentages, and composition/);
  assert.match(CHART_AUTHORING_GUIDANCE, /Do not use Mermaid/);
  assert.match(CHART_AUTHORING_GUIDANCE, /data is insufficient/);
  assert.match(CHART_AUTHORING_GUIDANCE, /Never expose private reasoning/);
});

test('all chart examples in the model guidance match the current schema', () => {
  const blocks = [...CHART_AUTHORING_GUIDANCE.matchAll(/```chart\n([\s\S]*?)\n```/g)];
  const results = blocks.map((match) => parseAndNormalizeChartSchema(match[1]));

  assert.equal(blocks.length, 4);
  assert.deepEqual(results.map((result) => result.ok), [true, true, true, true]);
  assert.deepEqual(results.map((result) => result.chart.type), ['line', 'bar', 'scatter', 'donut']);
});
