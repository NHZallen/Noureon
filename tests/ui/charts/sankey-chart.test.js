import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateSankeyLayout } from '../../../src/app/ui/charts/sankey-chart.js';
import { createChartFixtureAsync, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'sankey',
  unit: 'people',
  nodes: [
    { id: 'search', label: 'Search' },
    { id: 'social', label: 'Social' },
    { id: 'signup', label: 'Signup' },
    { id: 'paid', label: 'Paid' }
  ],
  links: [
    { source: 'search', target: 'signup', value: 1200 },
    { source: 'social', target: 'signup', value: 800 },
    { source: 'signup', target: 'paid', value: 420 }
  ]
};

test('sankey layout creates nodes and proportional links', () => {
  const layout = calculateSankeyLayout(chart);
  assert.equal(layout.nodes.length, 4);
  assert.equal(layout.links.length, 3);
  assert.ok(layout.links[0].width > layout.links[2].width);
  assert.ok(layout.nodes.find((node) => node.id === 'paid').x > layout.nodes.find((node) => node.id === 'search').x);
});

test('sankey renders nodes and link paths', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    assert.equal(article.querySelectorAll('.ac-chart-sankey-node').length, 4);
    assert.equal(article.querySelectorAll('.ac-chart-sankey-link').length, 3);
    assert.ok(article.querySelector('.ac-chart-sankey-link[data-chart-source="search"][data-chart-target="signup"]'));
  } finally { window.close(); }
});

test('sankey node interaction highlights connected links', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    const node = article.querySelector('.ac-chart-sankey-node[data-chart-node-id="signup"]');
    dispatchChartPointer(window, node, 'pointermove', { x: 320, y: 150 });
    assert.equal(node.classList.contains('is-active'), true);
    assert.equal(article.querySelectorAll('.ac-chart-sankey-link.is-active').length, 3);
  } finally { window.close(); }
});

test('sankey link interaction exposes source target and value tooltip', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    const link = article.querySelector('.ac-chart-sankey-link[data-chart-source="search"]');
    dispatchChartPointer(window, link, 'pointermove', { x: 180, y: 110 });
    assert.equal(link.classList.contains('is-active'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /sourceSearch/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /targetSignup/);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /1200 people/);
  } finally { window.close(); }
});
