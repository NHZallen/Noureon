import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHART_AUTHORING_GUIDANCE,
  getChartAuthoringGuidance,
  getChartTypeSpecificGuidance,
  getCompactChartGuidance
} from '../src/app/ui/charts/chart-authoring-guidance.js';
import { SUPPORTED_GUIDANCE_TYPES } from '../src/app/ui/charts/chart-selection-policy.js';

test('compact chart authoring guidance keeps output rules and selection policy short', () => {
  const guidance = getCompactChartGuidance();

  assert.equal(CHART_AUTHORING_GUIDANCE, guidance);
  assert.ok(guidance.length <= 2200, `compact guidance is ${guidance.length} chars`);
  assert.match(guidance, /Use charts only when they improve clarity/);
  assert.match(guidance, /```chart/);
  assert.match(guidance, /Do not use Mermaid/);
  assert.match(guidance, /ordinary `json` fences/);
  assert.match(guidance, /line=time trend/);
  assert.match(guidance, /sankey=flow between nodes only/);
  assert.match(guidance, /gantt=tasks with start\/end dates/);
  assert.match(guidance, /boxplot=distribution comparison/);
  assert.doesNotMatch(guidance, /"type": "bar"[\s\S]*"type": "line"[\s\S]*"type": "scatter"/);
});

test('none guidance is an empty string for non-chartable text', () => {
  assert.equal(getChartAuthoringGuidance('請幫我把這段話改寫得更自然。'), '');
});

test('type-specific guidance stays compact for every supported chart type', () => {
  let maxLength = 0;
  for (const type of SUPPORTED_GUIDANCE_TYPES) {
    const guidance = getChartTypeSpecificGuidance(type);
    maxLength = Math.max(maxLength, guidance.length);
    assert.ok(guidance.length > 0, `${type} has guidance`);
    assert.ok(guidance.length <= 900, `${type} guidance is ${guidance.length} chars`);
    assert.match(guidance, new RegExp(`Chart type: ${type}`));
    assert.match(guidance, /```chart/);
  }
  assert.ok(maxLength <= 900);
});

test('complex chart type-specific guidance names required structured fields only for that type', () => {
  assert.match(getChartTypeSpecificGuidance('sankey'), /nodes/);
  assert.match(getChartTypeSpecificGuidance('sankey'), /links/);
  assert.doesNotMatch(getChartTypeSpecificGuidance('sankey'), /start\/end dates/);
  assert.match(getChartTypeSpecificGuidance('boxplot'), /min/);
  assert.match(getChartTypeSpecificGuidance('boxplot'), /q1/);
  assert.match(getChartTypeSpecificGuidance('gantt'), /start/);
  assert.match(getChartTypeSpecificGuidance('gantt'), /end/);
});
