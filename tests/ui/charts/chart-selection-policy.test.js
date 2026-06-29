import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getChartAuthoringGuidance,
  getChartGuidanceMode,
  getChartTypeSpecificGuidance,
  getCompactChartGuidance,
  SUPPORTED_GUIDANCE_TYPES
} from '../../../src/app/ui/charts/chart-selection-policy.js';

test('no chartable text returns none guidance', () => {
  assert.deepEqual(getChartGuidanceMode('請翻譯這句話：hello world'), { mode: 'none', type: null });
  assert.equal(getChartAuthoringGuidance('請翻譯這句話：hello world'), '');
});

test('markdown table returns compact guidance', () => {
  const text = `| 月份 | 營收 |
| --- | ---: |
| Jan | 120 |
| Feb | 180 |`;
  assert.deepEqual(getChartGuidanceMode(text), { mode: 'compact', type: null });
  assert.equal(getChartAuthoringGuidance(text), getCompactChartGuidance());
});

test('numeric multi-line data returns compact guidance', () => {
  const text = `A: 120
B: 85
C: 160`;
  assert.deepEqual(getChartGuidanceMode(text), { mode: 'compact', type: null });
});

test('dated numeric data returns compact guidance', () => {
  assert.deepEqual(getChartGuidanceMode('2026-01 revenue 120\n2026-02 revenue 180'), { mode: 'compact', type: null });
});

test('explicit chart names return type-specific guidance', () => {
  assert.deepEqual(getChartGuidanceMode('請用折線圖呈現每月營收'), { mode: 'type-specific', type: 'line' });
  assert.match(getChartAuthoringGuidance('請用折線圖呈現每月營收'), /Chart type: line/);
  assert.deepEqual(getChartGuidanceMode('請做甘特圖'), { mode: 'type-specific', type: 'gantt' });
  assert.match(getChartAuthoringGuidance('請做甘特圖'), /start/);
  assert.deepEqual(getChartGuidanceMode('請做桑基圖'), { mode: 'type-specific', type: 'sankey' });
  assert.match(getChartAuthoringGuidance('請做桑基圖'), /nodes/);
});

test('alias mappings use project chart types', () => {
  assert.deepEqual(getChartGuidanceMode('做圓餅圖'), { mode: 'type-specific', type: 'donut' });
  assert.match(getChartAuthoringGuidance('做圓餅圖'), /Chart type: donut/);
  assert.deepEqual(getChartGuidanceMode('做樹狀圖'), { mode: 'type-specific', type: 'treemap' });
  assert.match(getChartAuthoringGuidance('做樹狀圖'), /Chart type: treemap/);
});

test('flowchart and relationship wording do not over-map to special chart types', () => {
  assert.notEqual(getChartGuidanceMode('請畫流程圖').type, 'treemap');
  assert.notEqual(getChartGuidanceMode('請畫關係圖').type, 'sankey');
});

test('compact guidance includes selection policy but not full examples', () => {
  const guidance = getCompactChartGuidance();
  assert.match(guidance, /Selection policy/);
  assert.match(guidance, /Use charts only when they improve clarity/);
  assert.match(guidance, /sankey=flow between nodes only/);
  assert.ok(guidance.length <= 2200, `compact guidance is ${guidance.length} chars`);
  assert.doesNotMatch(guidance, /"type": "gantt"[\s\S]*"type": "sankey"[\s\S]*"type": "boxplot"/);
});

test('each type-specific guidance stays under the runtime prompt budget', () => {
  for (const type of SUPPORTED_GUIDANCE_TYPES) {
    const guidance = getChartTypeSpecificGuidance(type);
    assert.ok(guidance.length <= 900, `${type} guidance is ${guidance.length} chars`);
  }
});
