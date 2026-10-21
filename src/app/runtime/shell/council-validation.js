// Whether a council may start with the models and attachments chosen (the message under the council button and the check before
// sending), and the labels of a model in the pickers (its price, the day it is retired). Part of the application shell (shell.js).

import { createCouncilAttachmentNeed } from '../council/council-attachments.js';
import { getCouncilRuntimeTexts as getCouncilRuntimeTextsForLanguage } from './council-runtime-texts.js';
import { COUNCIL_MAX_MODELS, COUNCIL_MIN_MODELS, COUNCIL_TEXT } from './model-registry.js';
import { getRuntimeTexts } from '../i18n/runtime-texts.js';
import { searchSourceModel } from '../kernel/search-provider.js';

/**
 * `registry` is the model registry of shell.js; `getUploadedFiles` the files waiting to be sent; `getApiKeyForProvider` the key
 * store's lookup.
 */
export function createCouncilValidation({ configAccess, registry, i18n, getUploadedFiles, getApiKeyForProvider }) {
    const {
        isCouncilEnabled, normalizeCouncilConfig, getCouncilSelectedModels, getCouncilTranslatorModel, modelUsesTavilySearch,
        modelSupportsVision, modelSupportsDocumentUpload, getModelTiers
    } = registry;
    const getCouncilTexts = () => COUNCIL_TEXT[configAccess.getUiLanguage()] || COUNCIL_TEXT['zh-TW'];
    const getCouncilRuntimeTexts = () => getCouncilRuntimeTextsForLanguage(configAccess.getUiLanguage());
    const getModelRetirementLabel = (model) => {
        const retirementDate = model?.retirementDate || model?.deprecationDate || model?.sunsetDate;
        if (!retirementDate) return '';
        return `${getRuntimeTexts(configAccess.getUiLanguage()).retirement} ${retirementDate}`;
    };
    const getModelPriceLabel = (model) => {
        if (!model) return '';
        if (getModelTiers(model).includes('free')) return 'Free';
        const priceKey = model.descriptionKey ? `${model.descriptionKey}_tier_paid` : '';
        const localizedPrice = priceKey ? i18n[configAccess.getUiLanguage()]?.[priceKey] : '';
        if (localizedPrice) return localizedPrice;
        if (model.provider === 'gemini') return 'Google API pricing';
        if (model.provider === 'openrouter') return 'OpenRouter pricing';
        return 'Provider pricing';
    };
    const councilAttachmentNeed = createCouncilAttachmentNeed({ modelSupportsVision, modelSupportsDocumentUpload });
    const getCouncilAttachmentTranslationNeed = (models = [], files = getUploadedFiles()) => councilAttachmentNeed(models, files);
    const formatCouncilModelSummary = (models = [], limit = 3) => {
        const names = models.map(model => model?.name).filter(Boolean);
        if (names.length === 0) return '';
        if (names.length <= limit) return names.join(' / ');
        return `${names.slice(0, limit).join(' / ')} +${names.length - limit}`;
    };
    const getCouncilValidation = (conv, files = getUploadedFiles()) => {
        const texts = getCouncilTexts();
        if (!isCouncilEnabled(conv)) {
            return { ok: true, message: '' };
        }
        conv.council = normalizeCouncilConfig(conv.council);
        const { council, participants, synthesizer } = getCouncilSelectedModels(conv);
        if (participants.length < COUNCIL_MIN_MODELS) {
            return { ok: false, reason: 'tooFew', message: texts.tooFew };
        }
        if (participants.length > COUNCIL_MAX_MODELS) {
            return { ok: false, reason: 'tooMany', message: texts.tooMany };
        }
        if (!council.synthesizerModelId || !synthesizer) {
            return { ok: false, reason: 'missingSynthesizer', message: texts.missingSynthesizer };
        }
        const selectedCouncilModels = [...participants, synthesizer].filter(Boolean);
        const translationNeed = getCouncilAttachmentTranslationNeed(selectedCouncilModels, files);
        const translatorModel = translationNeed.needsAnyPacket ? getCouncilTranslatorModel() : null;
        const searchModel = conv?.isWebSearchEnabled && modelUsesTavilySearch(synthesizer) ? searchSourceModel(configAccess.getConfig()) : null;
        const missingKeyModels = [...selectedCouncilModels, ...(translatorModel ? [translatorModel] : []), ...(searchModel ? [searchModel] : [])]
            .filter((model, index, arr) => arr.findIndex(item => item.id === model.id) === index)
            .filter(model => !getApiKeyForProvider(model.provider));
        if (missingKeyModels.length > 0) {
            return {
                ok: false,
                reason: 'missingApiKey',
                message: `${texts.missingApiKey}: ${missingKeyModels.map(model => model.name).join(', ')}`
            };
        }
        if (translationNeed.needsAnyPacket && !translatorModel) {
            return {
                ok: false,
                reason: 'missingCouncilTranslator',
                message: 'Council attachments need a translator model that supports both vision and file upload. Choose one in Settings.'
            };
        }
        if (translationNeed.needsAnyPacket) {
            return {
                ok: true,
                reason: 'readyWithAttachmentTranslation',
                message: `${texts.ready} with attachment translator: ${translatorModel.name}`
            };
        }
        return { ok: true, reason: 'ready', message: texts.ready };
    };
    return {
        getCouncilTexts,
        getCouncilRuntimeTexts,
        getModelRetirementLabel,
        getModelPriceLabel,
        getCouncilAttachmentTranslationNeed,
        formatCouncilModelSummary,
        getCouncilValidation
    };
}
