// The chart of when messages were sent (the dashboard's time analysis): a year, a month and a day to narrow it, drawn with Chart.js.

import { collectFromMessages } from '../kernel/on-demand-loading.js';
import { buildTimeDistributionChartData } from './time-distribution-chart-data.js';
import { applyChartThemeDefaults, readThemeColor } from '../../../utils/theme-colors.js';

export function createTimeAnalysisChart({ document, elements: ALL_ELEMENTS, getConversations, runtimeConfigAccess, i18n, Chart: ChartOverride, loadChart }) {
    // The chart drawn last, destroyed before the next one is drawn.
    let timeDistChart = null;
    // When each message was sent, for all the conversations (read from the stored records a batch at a time when conversations are loaded on demand). Kept for a minute,
    // so that choosing a month and then a day does not read everything again.
    let sentCache = null;
    const sentMessages = () => {
        if (!sentCache || Date.now() - sentCache.at > 60_000) {
            sentCache = { at: Date.now(), promise: collectFromMessages(getConversations(), message => ({ createdAt: message.createdAt, role: message.role })).then(list => list || []) };
            sentCache.promise.catch(() => { sentCache = null; });
        }
        return sentCache.promise;
    };
    // The choices of the year, the month and the day are tied to their fields once: the dashboard is opened many times, and each opening only fills the fields again.
    let listening = false;
    const onYearChange = () => {
        const { timeAnalysisYearSelect, timeAnalysisMonthSelect, timeAnalysisDaySelect } = ALL_ELEMENTS;
        const year = timeAnalysisYearSelect.value;
        if (year) {
            const uiLanguage = runtimeConfigAccess.getUiLanguage();
            timeAnalysisMonthSelect.disabled = false;
            timeAnalysisMonthSelect.innerHTML = `<option value="">${i18n[uiLanguage].wholeYear || '全年'}</option>`;
            for (let i = 1; i <= 12; i++) {
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
    };
    const onMonthChange = () => {
        const { timeAnalysisYearSelect, timeAnalysisMonthSelect, timeAnalysisDaySelect } = ALL_ELEMENTS;
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
    };
    const setupTimeAnalysis = async () => {
        const { timeAnalysisYearSelect, timeAnalysisMonthSelect, timeAnalysisDaySelect } = ALL_ELEMENTS;
        // (What the chart needs of a message is when it was sent and who sent it: those are kept, not the messages.)
        const allMessages = (await sentMessages()).map(m => new Date(m.createdAt));
        const years = [...new Set(allMessages.map(d => d.getFullYear()))].sort((a,b) => b-a);
        const uiLanguage = runtimeConfigAccess.getUiLanguage();
        timeAnalysisYearSelect.innerHTML = `<option value="">${i18n[uiLanguage].all || '全部'}</option>`;
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            timeAnalysisYearSelect.appendChild(option);
        });
        // The year starts again at "all", so the month and the day start again too (they kept the choices of the last opening).
        timeAnalysisMonthSelect.disabled = true;
        timeAnalysisMonthSelect.innerHTML = '';
        timeAnalysisDaySelect.disabled = true;
        timeAnalysisDaySelect.innerHTML = '';
        if (!listening) {
            listening = true;
            timeAnalysisYearSelect.addEventListener('change', onYearChange);
            timeAnalysisMonthSelect.addEventListener('change', onMonthChange);
            timeAnalysisDaySelect.addEventListener('change', updateTimeDistributionChart);
        }
        updateTimeDistributionChart();
    };
    const updateTimeDistributionChart = () => drawTimeDistributionChart();
    async function drawTimeDistributionChart() {
        const year = ALL_ELEMENTS.timeAnalysisYearSelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisYearSelect.value) : null;
        const month = ALL_ELEMENTS.timeAnalysisMonthSelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisMonthSelect.value) : null;
        const day = ALL_ELEMENTS.timeAnalysisDaySelect.value ? parseInt(ALL_ELEMENTS.timeAnalysisDaySelect.value) : null;
        const allMessages = await sentMessages();
        const lang = runtimeConfigAccess.getUiLanguage();
        const { chartType, label, labels, data } = buildTimeDistributionChartData({ messages: allMessages, year, month, day, text: i18n[lang] });
        const Chart = ChartOverride || await loadChart();
        const ctx = document.getElementById('time-distribution-chart').getContext('2d');
        if (timeDistChart) {
            timeDistChart.destroy();
        }
        applyChartThemeDefaults(Chart);
        const ink = readThemeColor('--text-primary', 'currentColor');
        timeDistChart = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    // The bars and the line are the colour of the text: black on the light page, white on the dark one.
                    backgroundColor: ink,
                    borderColor: ink,
                    borderWidth: 1,
                    // With few bars (a year or two) they are not stretched over the whole width.
                    maxBarThickness: 40,
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
    }
    return { setupTimeAnalysis, updateTimeDistributionChart };
}
