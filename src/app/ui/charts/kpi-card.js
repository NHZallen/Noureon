import { formatChartNumber } from './chart-utils.js';

export function renderKpiCard(document, chart, options = {}) {
  const group = document.createElement('div');
  group.className = 'ac-chart-kpi-grid';
  group.setAttribute('role', 'group');
  if (options.labelledBy) group.setAttribute('aria-labelledby', options.labelledBy);
  chart.data.forEach((row, index) => {
    const item = document.createElement('div');
    const label = document.createElement('div');
    const value = document.createElement('div');
    item.className = 'ac-chart-kpi-item';
    item.tabIndex = 0;
    item.dataset.chartInteractive = 'true';
    item.dataset.chartIndex = String(index);
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${row.label}: ${formatChartNumber(row.value)}${row.unit ? ` ${row.unit}` : ''}`);
    label.className = 'ac-chart-kpi-label';
    label.textContent = row.label;
    value.className = 'ac-chart-kpi-value';
    value.textContent = formatChartNumber(row.value);
    if (row.unit) {
      const unit = document.createElement('span');
      unit.className = 'ac-chart-kpi-unit';
      unit.textContent = row.unit;
      value.appendChild(unit);
    }
    item.append(label, value);
    if (row.delta !== undefined || row.trend) {
      const delta = document.createElement('div');
      const direction = row.trend || (row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : 'flat');
      delta.className = `ac-chart-kpi-delta is-${direction}`;
      const marker = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
      delta.textContent = `${marker}${row.delta !== undefined ? ` ${formatChartNumber(Math.abs(row.delta))}%` : ''}`;
      item.appendChild(delta);
    }
    group.appendChild(item);
  });
  return group;
}
