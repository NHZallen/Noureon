import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createModelUsageChartLifecycle } from '../src/app/legacy-runtime/features/model-usage-chart-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createHarness = (overrides = {}) => {
  const { document, cleanup } = createDom('<canvas id="model-usage-pie-chart"></canvas>');
  const charts = [];
  let currentChart = overrides.currentChart ?? null;
  class FakeChart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.destroyed = false;
      charts.push(this);
    }

    destroy() {
      this.destroyed = true;
    }
  }

  const lifecycle = createModelUsageChartLifecycle({
    Chart: FakeChart,
    document,
    getConversations: () => overrides.conversations ?? [
      { model: 'model-a' },
      { model: 'model-b' },
      { model: 'model-a' },
      { model: 'missing-model' }
    ],
    getI18n: () => ({ en: { modelUsageCount: 'Model usage count' } }),
    getModelPieChart: () => currentChart,
    getModels: () => [
      { id: 'model-a', name: 'Model A' },
      { id: 'model-b', name: 'Model B' }
    ],
    getUiLanguage: () => 'en',
    setModelPieChart: (chart) => {
      currentChart = chart;
    }
  });

  return { charts, cleanup, document, getCurrentChart: () => currentChart, lifecycle };
};

test('renders model usage chart with legacy labels, counts, and chart options', () => {
  const { charts, cleanup, lifecycle } = createHarness();
  try {
    const chart = lifecycle.renderModelUsageChart();

    assert.equal(chart, charts[0]);
    assert.equal(chart.config.type, 'pie');
    assert.deepEqual(chart.config.data.labels, ['Model A', 'Model B', '未知模型']);
    assert.deepEqual(chart.config.data.datasets[0].data, [2, 1, 1]);
    assert.equal(chart.config.data.datasets[0].label, 'Model usage count');
    assert.equal(chart.config.data.datasets[0].backgroundColor.length, 6);
    assert.equal(chart.config.data.datasets[0].borderColor, 'rgba(255, 255, 255, 0.8)');
    assert.equal(chart.config.options.responsive, true);
    assert.equal(chart.config.options.maintainAspectRatio, false);
    assert.equal(chart.config.options.plugins.legend.position, 'top');
  } finally {
    cleanup();
  }
});

test('destroys the previous chart before installing the new chart', () => {
  const previousChart = { destroyed: false, destroy() { this.destroyed = true; } };
  const { cleanup, getCurrentChart, lifecycle } = createHarness({ currentChart: previousChart });
  try {
    const chart = lifecycle.renderModelUsageChart();

    assert.equal(previousChart.destroyed, true);
    assert.equal(getCurrentChart(), chart);
  } finally {
    cleanup();
  }
});

test('empty and partial conversation data keep legacy fallback boundaries', () => {
  const { charts, cleanup, lifecycle } = createHarness({
    conversations: [{}, { model: null }]
  });
  try {
    lifecycle.renderModelUsageChart();

    assert.deepEqual(charts[0].config.data.labels, ['未知模型']);
    assert.deepEqual(charts[0].config.data.datasets[0].data, [2]);
  } finally {
    cleanup();
  }
});

test('missing chart container is a safe no-op boundary', () => {
  const lifecycle = createModelUsageChartLifecycle({
    Chart: class {},
    document: { getElementById: () => null },
    getConversations: () => [{ model: 'model-a' }],
    getI18n: () => ({ en: { modelUsageCount: 'Model usage count' } }),
    getModels: () => [{ id: 'model-a', name: 'Model A' }],
    getUiLanguage: () => 'en'
  });

  assert.equal(lifecycle.renderModelUsageChart(), null);
});

test('model usage chart lifecycle source avoids unrelated runtime systems', () => {
  const source = readSource('src/app/legacy-runtime/features/model-usage-chart-lifecycle.js');

  for (const forbidden of [
    'TextDecoder',
    'streamApiCall',
    'fetch(',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'DOMPurify',
    'marked',
    'katex',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
