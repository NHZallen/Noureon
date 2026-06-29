const CHART_TYPE_PATTERNS = [
  ['stackedBar', /\b(?:stacked\s*bar|stackedBar)\b|堆疊(?:長條|柱狀)圖/i],
  ['boxplot', /\b(?:box\s*plot|boxplot|box-and-whisker)\b|箱型圖|盒鬚圖/i],
  ['histogram', /\bhistogram\b|直方圖/i],
  ['waterfall', /\bwaterfall\b|瀑布圖/i],
  ['heatmap', /\bheat\s*map|heatmap\b|熱力圖/i],
  ['treemap', /\btreemap\b|樹狀圖/i],
  ['scatter', /\bscatter(?:\s*plot)?\b|散點圖|散佈圖/i],
  ['bubble', /\bbubble(?:\s*chart)?\b|氣泡圖/i],
  ['donut', /\b(?:donut|doughnut|pie)(?:\s*chart)?\b|環圈圖|甜甜圈圖|圓餅圖|餅圖/i],
  ['radar', /\bradar(?:\s*chart)?\b|雷達圖/i],
  ['funnel', /\bfunnel\b|漏斗圖/i],
  ['sankey', /\bsankey\b|桑基圖/i],
  ['gantt', /\bgantt\b|甘特圖/i],
  ['gauge', /\bgauge\b|儀表圖/i],
  ['area', /\barea(?:\s*chart)?\b|面積圖/i],
  ['line', /\bline(?:\s*chart)?\b|折線圖|線圖/i],
  ['bar', /\bbar(?:\s*chart)?\b|長條圖|柱狀圖/i],
  ['kpi', /\bkpi\b|KPI\s*卡片/i]
];

const COMPACT_CHART_GUIDANCE = `# Chart output rules

Use charts only when they improve clarity. If data is insufficient, explain missing fields instead of inventing values.

Output charts only as fenced JSON:
\`\`\`chart
{ "type": "...", "...": "..." }
\`\`\`
Do not use Mermaid, ASCII charts, raw HTML/SVG, or ordinary \`json\` fences for chart payloads. Use numeric JSON values for numeric fields.
Use this app's native schema at the chart root. Never use Chart.js-style \`data.labels\`, \`data.datasets\`, \`data.tasks\`, or nested \`data.nodes/links\`. Most charts use root \`data: [{ "label": "...", "value": 0 }]\`; scatter/bubble use root x/y/size rows. Sankey uses root nodes+links, gauge uses root value/min/max, and histogram uses root bins.

Selection policy: line=time trend; area=trend with volume emphasis; bar=category comparison; stackedBar=category comparison split by series; donut=simple part-to-whole with few categories; treemap=part-to-whole with many categories; scatter=x/y relationship; bubble=x/y plus size; histogram=numeric distribution; boxplot=distribution comparison with quartiles/outliers; heatmap=two categorical dimensions; radar=multi-dimensional scores; funnel=stage conversion/drop-off; waterfall=start plus positive/negative contributions plus end; sankey=flow between nodes only; gantt=tasks with start/end dates or milestones only; kpi=few headline metrics; gauge=one bounded progress/score.

Special types require their structure: sankey needs nodes+links; gantt needs start/end/date; boxplot needs quartiles or enough raw values.`;

const MINIMAL_SCHEMA_HINTS = {
  bar: `Chart type: bar
Use for category comparisons.
Required minimal schema:
\`\`\`chart
{ "type": "bar", "title": "...", "data": [{ "label": "...", "value": 0 }] }
\`\`\``,
  line: `Chart type: line
Use for time or ordered trends.
Required minimal schema:
\`\`\`chart
{ "type": "line", "title": "...", "data": [{ "label": "...", "value": 0 }] }
\`\`\``,
  scatter: `Chart type: scatter
Use for x/y numeric relationships.
Required minimal schema:
\`\`\`chart
{ "type": "scatter", "title": "...", "xLabel": "...", "yLabel": "...", "data": [{ "label": "...", "x": 0, "y": 0 }] }
\`\`\``,
  donut: `Chart type: donut
Use for simple part-to-whole with a few categories; map pie/圓餅圖 to donut.
Required minimal schema:
\`\`\`chart
{ "type": "donut", "title": "...", "data": [{ "label": "...", "value": 0 }] }
\`\`\``,
  stackedBar: `Chart type: stackedBar
Use for category comparison split by series.
Required minimal schema:
\`\`\`chart
{ "type": "stackedBar", "title": "...", "series": [{ "key": "a", "label": "A" }], "data": [{ "label": "...", "a": 0 }] }
\`\`\``,
  area: `Chart type: area
Use for trends where volume or accumulated magnitude matters.
Required minimal schema:
\`\`\`chart
{ "type": "area", "title": "...", "data": [{ "label": "...", "value": 0 }] }
\`\`\``,
  bubble: `Chart type: bubble
Use for x/y relationships with a third size value.
Required minimal schema:
\`\`\`chart
{ "type": "bubble", "title": "...", "data": [{ "label": "...", "x": 0, "y": 0, "size": 0 }] }
\`\`\``,
  histogram: `Chart type: histogram
Use for numeric distributions.
Required minimal schema:
\`\`\`chart
{ "type": "histogram", "title": "...", "bins": [{ "label": "0-10", "min": 0, "max": 10, "count": 0 }] }
\`\`\``,
  kpi: `Chart type: kpi
Use for one to four headline metrics.
Required minimal schema:
\`\`\`chart
{ "type": "kpi", "title": "...", "data": [{ "label": "...", "value": 0, "unit": "", "delta": 0, "trend": "up" }] }
\`\`\``,
  gauge: `Chart type: gauge
Use only for one bounded progress, utilization, or score.
Required minimal schema:
\`\`\`chart
{ "type": "gauge", "title": "...", "label": "...", "value": 0, "min": 0, "max": 100, "unit": "%" }
\`\`\``,
  heatmap: `Chart type: heatmap
Use for two categorical dimensions such as weekday by time.
Required minimal schema:
\`\`\`chart
{ "type": "heatmap", "title": "...", "data": [{ "x": "...", "y": "...", "value": 0 }] }
\`\`\``,
  treemap: `Chart type: treemap
Use for part-to-whole or size composition with many categories. Do not use for flowcharts.
Required minimal schema:
\`\`\`chart
{ "type": "treemap", "title": "...", "data": [{ "label": "...", "value": 0, "group": "..." }] }
\`\`\``,
  radar: `Chart type: radar
Use for multi-dimensional scores or capability comparisons.
Required minimal schema:
\`\`\`chart
{ "type": "radar", "title": "...", "min": 0, "max": 100, "data": [{ "label": "...", "value": 0 }] }
\`\`\``,
  funnel: `Chart type: funnel
Use for ordered stage conversion and drop-off.
Required minimal schema:
\`\`\`chart
{ "type": "funnel", "title": "...", "data": [{ "label": "Visit", "value": 0 }, { "label": "Signup", "value": 0 }] }
\`\`\``,
  waterfall: `Chart type: waterfall
Use for start value plus positive/negative contributions ending at a final value.
Required minimal schema:
\`\`\`chart
{ "type": "waterfall", "title": "...", "data": [{ "label": "Start", "value": 0, "kind": "start" }, { "label": "End", "value": 0, "kind": "end" }] }
\`\`\``,
  sankey: `Chart type: sankey
Use only for flow between nodes, such as source to target paths.
Required minimal schema:
\`\`\`chart
{ "type": "sankey", "title": "...", "nodes": [{ "id": "a", "label": "A" }], "links": [{ "source": "a", "target": "b", "value": 0 }] }
\`\`\``,
  boxplot: `Chart type: boxplot
Use for comparing distributions with quartiles/outliers.
Required minimal schema:
\`\`\`chart
{ "type": "boxplot", "title": "...", "data": [{ "label": "...", "min": 0, "q1": 0, "median": 0, "q3": 0, "max": 0, "outliers": [] }] }
\`\`\``,
  gantt: `Chart type: gantt
Use only when data has tasks with start/end dates or milestones.
Required minimal schema:
\`\`\`chart
{ "type": "gantt", "title": "...", "data": [{ "label": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "progress": 0 }] }
\`\`\``
};

const hasMarkdownTable = (text) => (
  /\|[^\n]*\|[^\n]*\n\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?/m.test(text)
);

const hasNumericMultilineData = (text) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let matches = 0;
  for (const line of lines) {
    if (/^[-*]?\s*[\p{L}\p{N}\s./年月日-]{1,40}[:：,\t ]+[-+]?\d[\d,]*(?:\.\d+)?\s*%?$/u.test(line)) matches += 1;
  }
  return matches >= 2;
};

const hasDatedNumericData = (text) => (
  /(?:\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?|(?:\d{1,2}|[一二三四五六七八九十]+)月)[^\n\d-]{0,16}[-+]?\d[\d,]*(?:\.\d+)?/u.test(text)
);

const hasCompactTrigger = (text) => (
  /圖表|統計圖|視覺化|趨勢|比較|分布|占比|比例|漏斗|排程|時程|儀表|用圖呈現|畫成圖|幫我分析這組數據|\b(?:chart|visuali[sz]e|trend|compare|comparison|distribution|percentage|share|schedule|timeline|funnel|KPI|gauge)\b/i.test(text)
);

export function getExplicitChartType(inputText = '') {
  const text = String(inputText);
  if (/流程圖/.test(text)) return null;
  for (const [type, pattern] of CHART_TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

export function getChartGuidanceMode(inputText = '') {
  const text = String(inputText || '');
  const type = getExplicitChartType(text);
  if (type) return { mode: 'type-specific', type };
  if (
    hasCompactTrigger(text) ||
    hasMarkdownTable(text) ||
    hasNumericMultilineData(text) ||
    hasDatedNumericData(text)
  ) {
    return { mode: 'compact', type: null };
  }
  return { mode: 'none', type: null };
}

export function getCompactChartGuidance() {
  return COMPACT_CHART_GUIDANCE;
}

export function getChartTypeSpecificGuidance(type) {
  return MINIMAL_SCHEMA_HINTS[type] || '';
}

export function getChartAuthoringGuidance(inputText = '') {
  const { mode, type } = getChartGuidanceMode(inputText);
  if (mode === 'type-specific') return getChartTypeSpecificGuidance(type);
  if (mode === 'compact') return getCompactChartGuidance();
  return '';
}

export const SUPPORTED_GUIDANCE_TYPES = Object.freeze(Object.keys(MINIMAL_SCHEMA_HINTS));
