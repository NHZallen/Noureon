export function createModelUsageChartLifecycle({
    Chart,
    document,
    getConversations = () => [],
    getI18n = () => ({}),
    getModelPieChart = () => null,
    getModels = () => [],
    getUiLanguage = () => 'zh-TW',
    setModelPieChart = () => {}
} = {}) {
    const renderModelUsageChart = () => {
        const canvas = document?.getElementById?.('model-usage-pie-chart');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const models = getModels() || [];
        const conversations = getConversations() || [];
        const modelCounts = conversations.reduce((acc, conv) => {
            const modelName = models.find((model) => model.id === conv.model)?.name || '未知模型';
            acc[modelName] = (acc[modelName] || 0) + 1;
            return acc;
        }, {});
        const labels = Object.keys(modelCounts);
        const data = Object.values(modelCounts);
        const previousChart = getModelPieChart();
        if (previousChart) {
            previousChart.destroy();
        }
        const i18n = getI18n() || {};
        const uiLanguage = getUiLanguage();
        const chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    label: i18n[uiLanguage]?.modelUsageCount || '模型使用次數',
                    data,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.7)',
                        'rgba(54, 162, 235, 0.7)',
                        'rgba(255, 206, 86, 0.7)',
                        'rgba(75, 192, 192, 0.7)',
                        'rgba(153, 102, 255, 0.7)',
                        'rgba(255, 159, 64, 0.7)'
                    ],
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
        setModelPieChart(chart);
        return chart;
    };

    return { renderModelUsageChart };
}
