import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeChartSchema } from '../../../src/app/ui/charts/chart-schema.js';
import { createChartFixtureAsync, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'boxplot',
  xLabel: 'Class',
  yLabel: 'Score',
  unit: 'points',
  data: [
    { label: 'Class A', min: 52, q1: 68, median: 76, q3: 88, max: 96, outliers: [42, 99] },
    { label: 'Class B', min: 48, q1: 62, median: 72, q3: 84, max: 93, outliers: [35] }
  ]
};

test('boxplot accepts summary data', () => {
  const summary = normalizeChartSchema(chart);

  assert.equal(summary.ok, true);
  assert.equal(summary.chart.data[0].median, 76);
  assert.equal(summary.chart.data[0].outliers.length, 2);
});

test('boxplot renders whiskers boxes median lines and outliers', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    assert.equal(article.querySelectorAll('.ac-chart-boxplot-group').length, 2);
    assert.equal(article.querySelectorAll('.ac-chart-boxplot-whisker').length, 2);
    assert.equal(article.querySelectorAll('.ac-chart-boxplot-box').length, 2);
    assert.equal(article.querySelectorAll('.ac-chart-boxplot-median').length, 2);
    assert.equal(article.querySelectorAll('.ac-chart-boxplot-outlier').length, 3);
  } finally { window.close(); }
});

test('boxplot group interaction exposes complete summary tooltip', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    const group = article.querySelector('.ac-chart-boxplot-group[data-chart-index="0"]');
    dispatchChartPointer(window, group, 'pointermove', { x: 180, y: 130 });
    assert.equal(group.classList.contains('is-active'), true);
    assert.equal(article.querySelector('.ac-chart-boxplot-group[data-chart-index="1"]').classList.contains('is-faded'), true);
    const text = article.querySelector('.ac-chart-tooltip').textContent;
    assert.match(text, /min52 points/);
    assert.match(text, /median76 points/);
    assert.match(text, /max96 points/);
  } finally { window.close(); }
});

test('boxplot outlier interaction exposes outlier tooltip', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    const outlier = article.querySelector('.ac-chart-boxplot-outlier[data-chart-outlier="99"]');
    dispatchChartPointer(window, outlier, 'pointermove', { x: 180, y: 40 });
    assert.equal(outlier.classList.contains('is-active'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /outlier99 points/);
  } finally { window.close(); }
});
