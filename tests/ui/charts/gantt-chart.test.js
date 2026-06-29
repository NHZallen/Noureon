import assert from 'node:assert/strict';
import test from 'node:test';

import { getTaskDurationDays } from '../../../src/app/ui/charts/gantt-chart.js';
import { normalizeChartSchema } from '../../../src/app/ui/charts/chart-schema.js';
import { createChartFixtureAsync, dispatchChartPointer } from './chart-test-helpers.js';

const chart = {
  type: 'gantt',
  xLabel: 'Date',
  yLabel: 'Task',
  data: [
    { label: 'Requirements', start: '2026-07-01', end: '2026-07-05', progress: 100, group: 'Planning', kind: 'task' },
    { label: 'UI design', start: '2026-07-04', end: '2026-07-12', progress: 65, group: 'Design', kind: 'task' },
    { label: 'Beta release', date: '2026-07-18', kind: 'milestone' }
  ]
};

test('gantt validates tasks and milestones', () => {
  const result = normalizeChartSchema({
    type: 'gantt',
    data: [
      { label: 'Build', start: '2026-07-01', end: '2026-07-05', progress: 80 },
      { label: 'Launch', date: '2026-07-08', kind: 'milestone' }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.chart.data[0].kind, 'task');
  assert.equal(result.chart.data[1].kind, 'milestone');
});

test('gantt renders task bars milestones and bounded progress fill', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    assert.equal(article.querySelectorAll('.ac-chart-gantt-task').length, 2);
    assert.equal(article.querySelectorAll('.ac-chart-gantt-milestone').length, 1);
    const tracks = [...article.querySelectorAll('.ac-chart-gantt-track')];
    const fills = [...article.querySelectorAll('.ac-chart-gantt-progress')];
    assert.equal(fills.length, 2);
    fills.forEach((fill, index) => {
      assert.ok(Number(fill.getAttribute('width')) <= Number(tracks[index].getAttribute('width')));
      assert.equal(fill.dataset.chartProgressBounded, 'true');
    });
  } finally { window.close(); }
});

test('gantt task interaction exposes duration progress and group', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    const task = article.querySelector('.ac-chart-gantt-task[data-chart-index="1"]');
    dispatchChartPointer(window, task, 'pointermove', { x: 260, y: 120 });
    assert.equal(task.classList.contains('is-active'), true);
    assert.equal(getTaskDurationDays(chart.data[1]), 9);
    const text = article.querySelector('.ac-chart-tooltip').textContent;
    assert.match(text, /duration9 days/);
    assert.match(text, /progress65%/);
    assert.match(text, /groupDesign/);
  } finally { window.close(); }
});

test('gantt milestone interaction exposes date tooltip', async () => {
  const { window, article } = await createChartFixtureAsync(chart);
  try {
    const milestone = article.querySelector('.ac-chart-gantt-milestone');
    dispatchChartPointer(window, milestone, 'pointermove', { x: 520, y: 180 });
    assert.equal(milestone.classList.contains('is-active'), true);
    assert.match(article.querySelector('.ac-chart-tooltip').textContent, /date2026-07-18/);
  } finally { window.close(); }
});
