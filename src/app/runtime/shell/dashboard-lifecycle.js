// The data dashboard: the numbers (conversations, folders, the model used most), the chart of the models used, and the modal that shows them. Loaded the first time the dashboard is
// opened (workspace-features.js).

import { createModelUsageChartLifecycle } from '../features/model-usage-chart-lifecycle.js';

const REQUIRED_DEPENDENCIES = ['document', 'elements', 'getConfig', 'getConversations', 'getFolders', 'models', 'i18n'];

export function createDashboardLifecycle(dependencies = {}) {
    const missing = REQUIRED_DEPENDENCIES.filter((name) => dependencies?.[name] == null);
    if (missing.length > 0) throw new TypeError(`The dashboard lifecycle is missing dependencies: ${missing.join(', ')}.`);
    const {
        Chart,
        document,
        elements: ALL_ELEMENTS,
        getConfig,
        getConversations,
        getFolders,
        getModelPieChart = () => null,
        setModelPieChart = () => {},
        models: MODELS,
        i18n,
        toggleModal = () => {},
        setupTimeAnalysis = () => {}
    } = dependencies;
    let config;
    let conversations;
    let folders;
    const syncState = () => {
        config = getConfig();
        conversations = getConversations();
        folders = getFolders();
    };
    syncState();

    const renderDashboardStats = () => {
        syncState();
        ALL_ELEMENTS.totalConvStat.textContent = conversations.filter(c => !c.deletedAt).length;
        ALL_ELEMENTS.totalFolderStat.textContent = folders.length;
        const modelCounts = conversations.reduce((acc, conv) => {
            const modelName = MODELS.find(m => m.id === conv.model)?.name || '未知模型';
            acc[modelName] = (acc[modelName] || 0) + 1;
            return acc;
        }, {});
        const mostUsedModel = Object.keys(modelCounts).reduce((a, b) => modelCounts[a] > modelCounts[b] ? a : b, 'N/A');
        ALL_ELEMENTS.mostUsedModelStat.textContent = mostUsedModel;
    };
    const modelUsageChartLifecycle = createModelUsageChartLifecycle({
        Chart,
        document,
        getConversations: () => conversations,
        getI18n: () => i18n,
        getModelPieChart,
        getModels: () => MODELS,
        getUiLanguage: () => config.uiLanguage,
        setModelPieChart
    });
    const renderModelUsageChart = (...args) => {
        syncState();
        return modelUsageChartLifecycle.renderModelUsageChart(...args);
    };
    const openDashboard = () => {
        syncState();
        renderDashboardStats();
        renderModelUsageChart();
        setupTimeAnalysis();
        toggleModal(ALL_ELEMENTS.dataDashboardModal, true);
    };

    return { openDashboard, renderDashboardStats, renderModelUsageChart };
}
