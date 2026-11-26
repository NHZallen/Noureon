// The data dashboard: the numbers (conversations, folders, the model used most), the chart of the models used, and the modal that shows them. Loaded the first time the dashboard is
// opened (workspace-features.js).

import { createModelUsageChartLifecycle } from '../features/model-usage-chart-lifecycle.js';

const REQUIRED_DEPENDENCIES = ['document', 'elements', 'getConfig', 'getConversations', 'getFolders', 'models', 'i18n'];

export function createDashboardLifecycle(dependencies = {}) {
    const missing = REQUIRED_DEPENDENCIES.filter((name) => dependencies?.[name] == null);
    if (missing.length > 0) throw new TypeError(`The dashboard lifecycle is missing dependencies: ${missing.join(', ')}.`);
    const {
        Chart,
        loadChart,
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

    // What the dashboard counts: the conversations that are not in the trash (the number of them, the models and the chart all use the same ones).
    const countedConversations = () => conversations.filter(c => !c.deletedAt);
    const renderDashboardStats = () => {
        syncState();
        const counted = countedConversations();
        const text = i18n[config.uiLanguage] || {};
        ALL_ELEMENTS.totalConvStat.textContent = counted.length;
        ALL_ELEMENTS.totalFolderStat.textContent = folders.length;
        const modelCounts = counted.reduce((acc, conv) => {
            const modelName = MODELS.find(m => m.id === conv.model)?.name || text.dashboardUnknownModel || '未知模型';
            acc[modelName] = (acc[modelName] || 0) + 1;
            return acc;
        }, {});
        // With no conversation there is no model to name.
        const names = Object.keys(modelCounts);
        ALL_ELEMENTS.mostUsedModelStat.textContent = names.length ? names.reduce((a, b) => modelCounts[a] > modelCounts[b] ? a : b) : '-';
    };
    const modelUsageChartLifecycle = createModelUsageChartLifecycle({
        Chart,
        loadChart,
        document,
        getConversations: countedConversations,
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
    // The styles come with the first opening, so the page is not seen without them. If they do not load the page is opened all the same.
    let stylesLoaded = null;
    const loadStyles = () => {
        stylesLoaded ||= import('../../../styles/dashboard.css').catch((error) => { console.warn('The styles of the dashboard did not load.', error); });
        return stylesLoaded;
    };
    const openDashboard = async () => {
        await loadStyles();
        syncState();
        renderDashboardStats();
        renderModelUsageChart();
        setupTimeAnalysis();
        toggleModal(ALL_ELEMENTS.dataDashboardModal, true);
    };

    return { openDashboard, renderDashboardStats, renderModelUsageChart };
}
