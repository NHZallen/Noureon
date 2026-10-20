import assert from 'node:assert/strict';
import test from 'node:test';

// Each case loads its own copy of the module: it remembers whether the stylesheet is there.
const freshModule = (name) => import(`../../../src/app/ui/charts/chart-styles.js?case=${name}`);

function fakeDocument() {
  const classes = new Set();
  return { documentElement: { classList: { add: (name) => classes.add(name), contains: (name) => classes.has(name) } }, classes };
}

test('the chart stylesheet loads once, and every document that drew a chart is marked ready when it is there', async () => {
  const { loadChartStyles, CHART_STYLES_READY_CLASS } = await freshModule('once');
  const page = fakeDocument();
  const draft = fakeDocument();
  let loads = 0;
  let finish;
  const load = () => { loads += 1; return new Promise((resolve) => { finish = resolve; }); };
  const first = loadChartStyles(draft, load);
  const second = loadChartStyles(page, load);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.classes.has(CHART_STYLES_READY_CLASS), false, 'the charts stay hidden until the sheet is there');
  finish();
  await Promise.all([first, second]);
  assert.equal(loads, 1);
  assert.equal(page.classes.has(CHART_STYLES_READY_CLASS), true);
  assert.equal(draft.classes.has(CHART_STYLES_READY_CLASS), true);
  const later = fakeDocument();
  await loadChartStyles(later, load);
  assert.equal(later.classes.has(CHART_STYLES_READY_CLASS), true, 'a document asking later is marked at once');
  assert.equal(loads, 1);
});

test('when the stylesheet cannot load, the charts are shown plain rather than hidden', async () => {
  const { loadChartStyles, CHART_STYLES_READY_CLASS } = await freshModule('failed');
  const page = fakeDocument();
  const warn = console.warn;
  console.warn = () => {};
  try {
    await loadChartStyles(page, async () => { throw new Error('offline'); });
  } finally {
    console.warn = warn;
  }
  assert.equal(page.classes.has(CHART_STYLES_READY_CLASS), true);
});

test('without a document there is nothing to load', async () => {
  const { loadChartStyles } = await freshModule('none');
  let loads = 0;
  await loadChartStyles(null, async () => { loads += 1; });
  assert.equal(loads, 0);
});
