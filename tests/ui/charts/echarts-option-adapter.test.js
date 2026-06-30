import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAndNormalizeEChartsOption,
  parseEChartsOption
} from '../../../src/app/ui/charts/echarts-option-adapter.js';

const samples = [
  ['line', `option={title:{text:'Revenue'},xAxis:{type:'category',data:['Q1','Q2']},yAxis:{type:'value',name:'營收（萬元）'},series:[{type:'line',data:[1200,1350],smooth:true}]};`],
  ['area', `option={title:{text:'Active users'},xAxis:{type:'category',data:['1月','2月']},yAxis:{type:'value'},series:[{name:'自然搜索',type:'line',stack:'總量',areaStyle:{},data:[1200,1300]},{name:'付費廣告',type:'line',stack:'總量',areaStyle:{},data:[800,850]}]};`],
  ['bar', `option={title:{text:'Sales'},xAxis:{type:'category',data:['A','B']},yAxis:{type:'value'},series:[{type:'bar',data:[3200,1800]}]};`],
  ['stackedBar', `option={title:{text:'Sales mix'},xAxis:{type:'category',data:['A','B']},yAxis:{type:'value'},series:[{name:'硬件',type:'bar',stack:'total',data:[2,3]},{name:'服務',type:'bar',stack:'total',data:[1,2]}]};`],
  ['donut', `option={title:{text:'Share'},series:[{type:'pie',radius:['40%','70%'],data:[{value:45,name:'中國大陸'},{value:20,name:'北美'}]}]};`],
  ['treemap', `option={title:{text:'Budget'},series:[{type:'treemap',data:[{name:'研發部',value:3000,children:[{name:'AI研發',value:800},{name:'產品研發',value:1200}]},{name:'IT部',value:1100}]}]};`],
  ['scatter', `option={title:{text:'Ads vs revenue'},tooltip:{formatter:function(params){return \`x:\${params.data[0]}\`; }},xAxis:{type:'value'},yAxis:{type:'value'},series:[{type:'scatter',data:[[50,800],[80,1100]]}]};`],
  ['bubble', `option={title:{text:'Bubble'},xAxis:{type:'value'},yAxis:{type:'value'},series:[{type:'scatter',symbolSize:function(data){return data[2]*1.5;},data:[[50,800,15],[80,1100,18]]}]};`],
  ['histogram', `option={title:{text:'Age'},xAxis:{type:'category',data:['18-25歲','26-30歲','51歲以上']},yAxis:{type:'value'},series:[{type:'bar',data:[200,350,10]}]};`],
  ['boxplot', `option={title:{text:'House price'},xAxis:{type:'category',data:['北京','上海']},yAxis:{type:'value'},series:[{type:'boxplot',data:[[75000,85000,92000,98000,105000,112000,125000],[70000,80000,88000,95000,102000,110000,120000]]}]};`],
  ['heatmap', `option={title:{text:'Heat'},xAxis:{type:'category',data:['週一']},yAxis:{type:'category',data:['9點']},series:[{type:'heatmap',data:[['週一','9點',1500]],label:{show:true}}]};`],
  ['radar', `option={title:{text:'Phones'},radar:{indicator:[{name:'性能',max:100},{name:'拍照',max:100}]},series:[{type:'radar',data:[{value:[95,90],name:'A手機'},{value:[80,85],name:'B手機'}]}]};`],
  ['funnel', `option={title:{text:'Funnel'},series:[{type:'funnel',data:[{value:10000,name:'訪問商品頁'},{value:2500,name:'支付成功'}]}]};`],
  ['waterfall', `option={title:{text:'Profit'},xAxis:{type:'category',data:['年初利潤','營收','成本','年末利潤']},yAxis:{type:'value'},series:[{type:'bar',data:[1000,5000,-3000,3000]}]};`],
  ['sankey', `option={title:{text:'Path'},series:[{type:'sankey',data:[{name:'首頁'},{name:'支付成功'}],links:[{source:'首頁',target:'支付成功',value:2500}],lineStyle:{color:'source'}}]};`],
  ['gantt', `option={title:{text:'Project'},xAxis:{type:'time'},yAxis:{type:'category',data:['需求分析']},series:[{type:'bar',data:[{value:['2024-01-01',2592000000],name:'需求分析'}]}]};`],
  ['kpi', `option={title:{text:'KPI'},graphic:[{type:'group',children:[{type:'text',style:{text:'月度營收'}},{type:'text',style:{text:'1280萬元'}},{type:'text',style:{text:'環比 +12.3% ↑'}}]}]};`],
  ['gauge', `option={title:{text:'CPU'},series:[{name:'CPU使用率',type:'gauge',data:[{value:72,name:'CPU使用率'}]}]};`]
];

test('ECharts option samples normalize to all supported message chart types', () => {
  const results = samples.map(([expectedType, source]) => [expectedType, parseAndNormalizeEChartsOption(source)]);

  assert.deepEqual(results.map(([expectedType, result]) => [expectedType, result.ok && result.chart.type]), samples.map(([type]) => [type, type]));
  assert.equal(results.find(([type]) => type === 'area')[1].chart.data[0].value, 2000);
  assert.equal(results.find(([type]) => type === 'stackedBar')[1].chart.series.length, 2);
  assert.equal(results.find(([type]) => type === 'bubble')[1].chart.data[0].size, 15);
  assert.equal(results.find(([type]) => type === 'kpi')[1].chart.data[0].unit, '萬元');
});

test('ECharts parser strips comments and formatter functions without evaluating code', () => {
  const parsed = parseEChartsOption(`
    option = {
      // callback must not execute
      tooltip: { formatter: function(params) { throw new Error('should not run'); } },
      xAxis: { type: 'category', data: ['A'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [1] }]
    };
  `);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.option.tooltip.formatter, null);
  assert.equal(parsed.option.series[0].data[0], 1);
});
