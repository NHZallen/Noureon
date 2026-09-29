export const MODEL_PROVIDER_ORDER = Object.freeze(['gemini', 'openrouter', 'nvidia']);

const compareModelsForPicker = (left, right) => (
    (right.releasedAt - left.releasedAt) ||
    (right.outputPricePerMillion - left.outputPricePerMillion) ||
    (right.modelSettingOrder - left.modelSettingOrder) ||
    left.name.localeCompare(right.name)
);

export function prepareModelSwitcherModels({
    currentModelId,
    getModelApiId,
    getModelTiers,
    modelSettings = [],
    models = []
}) {
    const modelSettingOrderById = new Map(modelSettings.map(setting => [setting.id, setting.order]));
    const processedModels = models.map(model => {
        const provider = model.provider;
        let tier = [];
        let company = null;
        if (provider === 'gemini') {
            tier = getModelTiers(model);
            company = 'google';
        } else if (provider === 'openrouter') {
            tier = getModelTiers(model);
            company = model.id.split('/')[0];
        } else if (provider === 'nvidia') {
            tier = getModelTiers(model);
            company = getModelApiId(model).split('/')[0];
        }
        const modelSettingOrder = modelSettingOrderById.get(model.id) ?? -1;
        return {
            ...model,
            tier,
            company,
            modelSettingOrder,
            releasedAt: model.releasedAt ?? model.addedOrder ?? modelSettingOrder,
            outputPricePerMillion: model.outputPricePerMillion ?? -1
        };
    });
    const betaModels = processedModels.filter(model => model.isBeta);
    const standardModels = processedModels.filter(model => !model.isBeta);
    const visibleModels = modelSettings
        .filter(setting => !setting.hidden)
        .sort((a, b) => a.order - b.order)
        .map(setting => processedModels.find(model => model.id === setting.id))
        .filter(Boolean)
        .sort(compareModelsForPicker);
    const currentModel = processedModels.find(model => model.id === currentModelId) || processedModels[0];

    return { betaModels, currentModel, processedModels, standardModels, visibleModels };
}

// The header used to hold a five-step model menu. The model, the council and
// how deeply it thinks are now chosen in one panel in the composer (see
// council-controls-lifecycle.js); this keeps the old entry point, which now
// clears the header's slot and redraws that panel.
export function createModelSwitcherLifecycle({
    getModelSwitcherContainer = () => undefined,
    renderCouncilControls = () => {}
} = {}) {
    const renderModelSwitcher = () => {
        const container = getModelSwitcherContainer();
        if (container) container.innerHTML = '';
        renderCouncilControls();
    };
    return { renderModelSwitcher };
}
