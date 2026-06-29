import assert from 'node:assert/strict';
import test from 'node:test';
import { createChartFixture, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'funnel', unit: 'people',
  data: [
    { label: 'Visits', value: 10000 },
    { label: 'Signups', value: 4200 },
    { label: 'Activated', value: 2600 },
    { label: 'Paid', value: 680 }
  ]
};

test('funnel renders ordered, progressively smaller stages', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const stages = [...article.querySelectorAll('.ac-chart-funnel-stage')];
    assert.equal(stages.length, 4);
    const width = (stage) => {
      const xs = stage.getAttribute('points').split(/\s+/).map((pair) => Number(pair.split(',')[0]));
      return Math.max(...xs) - Math.min(...xs);
    };
    assert.ok(width(stages[0]) > width(stages[3]));
  } finally { window.close(); }
});

test('funnel stage tooltip includes conversion and drop-off', () => {
  const { window, article } = createChartFixture(chart);
  try {
    const stage = article.querySelector('.ac-chart-funnel-stage[data-chart-index="1"]');
    dispatchChartPointer(window, stage, 'pointermove', { x: 320, y: 120 });
    const tooltip = article.querySelector('.ac-chart-tooltip').textContent;
    assert.equal(stage.classList.contains('is-active'), true);
    assert.equal(article.querySelector('.ac-chart-funnel-stage[data-chart-index="0"]').classList.contains('is-faded'), true);
    assert.match(tooltip, /conversion42%/);
    assert.match(tooltip, /drop-off58%/);
  } finally { window.close(); }
});
