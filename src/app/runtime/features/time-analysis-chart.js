// The chart of when messages were sent (the dashboard's time analysis): a year, a month and a day to narrow it, drawn with Chart.js.

import { buildTimeDistributionChartData } from './time-distribution-chart-data.js';
import { applyChartThemeDefaults } from '../../../utils/theme-colors.js';

export function createTimeAnalysisChart({ document, elements: ALL_ELEMENTS, getConversations, runtimeConfigAccess, i18n, Chart }) {
    // The chart drawn last, destroyed before the next one is drawn.
    let timeDistChart = null;
    const setupTimeAnalysis = () => {
        const { timeAnalysisYearSelect, timeAnalysisMonthSelect, timeAnalysisDaySelect } = ALL_ELEMENTS;
        const allMessages = getConversations().flatMap(c => c.messages.map(m => new Date(m.createdAt)));
        const years = [...new Set(allMessages.map(d => d.getFullYear()))].sort((a,b) => b-a);
        const uiLanguage = runtimeConfigAccess.getUiLanguage();
        timeAnalysisYearSelect.innerHTML = `<option value="">${i18n[uiLanguage].all || '全部'}</option>`;
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            timeAnalysisYearSelect.appendChild(option);
        });
        timeAnalysisYearSelect.addEventListener('change', () => {
            const year = timeAnalysisYearSelect.value;
            if (year) {
                const uiLanguage = runtimeConfigAccess.getUiLanguage();
                timeAnalysisMonthSelect.disabled = false;
                timeAnalysisMonthSelect.innerHTML = `<option value="">${i18n[uiLanguage].wholeYear || '全年'}</option>`;
                for(let i=1; i<=12; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `${i}${i18n[uiLanguage].monthSuffix || '月'}`;
                    timeAnalysisMonthSelect.appendChild(option);
                }
            } else {
                timeAnalysisMonthSelect.disabled = true;
                timeAnalysisMonthSelect.innerHTML = '';
            }
            timeAnalysisDaySelect.disabled = true;
            timeAnalysisDaySelect.innerHTML = '';
            updateTimeDistributionChart();
        });
        timeAnalysisMonthSelect.addEventListener('change', () => {
            const year = parseInt(timeAnalysisYearSelect.value);
            const month = parseInt(timeAnalysisMonthSelect.value);
            if (year && month) {
                const uiLanguage = runtimeConfigAccess.getUiLanguage();
                timeAnalysisDaySelect.disabled = false;
                const daysInMonth = new Date(year, month, 0).getDate();
                timeAnalysisDaySelect.innerHTML = `<option value="">${i18n[uiLanguage].wholeMonth || '全月'}</option>`;
                for (let i = 1; i <= daysInMonth; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `${i}${i18n[uiLanguage].daySuffix || '日'}`;
                    timeAnalysisDaySelect.appendChild(option);
                }
            } else {
                timeAnalysisDaySelect.disabled = true;
                timeAnalysisDaySelect.innerHTML = '';
            }
            updateTimeDistributionChart();
        });
        timeAnalysisDaySelect.addEventListener('change', updateTimeDistributionChart);
        updateTimeDistributionChart();
    };
    const updateTimeDistributionChart = () => {
        const year = ALL_ELEMENTS.timeAnalysisYearSelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisYearSelect.value) : null;
        const month = ALL_ELEMENTS.timeAnalysisMonthSelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisMonthSelect.value) : null;
        const day = ALL_ELEMENTS.timeAnalysisDaySelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisDaySelect.value) : null;
        const allMessages = getConversations().flatMap(c => c.messages);
        const lang = runtimeConfigAccess.getUiLanguage();
        const { chartType, label, labels, data } = buildTimeDistributionChartData({ messages: allMessages, year, month, day, text: i18n[lang] });
        const ctx = document.getElementById('time-distribution-chart').getContext('2d');
        if (timeDistChart) {
            timeDistChart.destroy();
        }
        applyChartThemeDefaults(Chart);
        timeDistChart = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    };
    return { setupTimeAnalysis, updateTimeDistributionChart };
}
