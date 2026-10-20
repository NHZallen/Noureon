// What the model picker's panel shows (council-controls-lifecycle.js): from the conversation and the settings, the state its markup is
// drawn from (model-picker-markup.js), with each model described by what it can do. It also settles the panel's page in `ui` (back to
// the main page when the panel was closed or the council is off, no group being edited once it is gone).

import { buildModelGroups, getModelCompany } from '../../ui/model-picker/model-picker-groups.js';
import { GROUP_LIMIT, GROUP_NAME_LIMIT, councilMatchesGroup, pickRecentModels } from '../../ui/model-picker/model-groups.js';
import { modelPickerText } from '../../ui/model-picker/model-picker-texts.js';
import { prepareModelSwitcherModels } from './model-switcher-lifecycle.js';
import { opencodeModelReadsPdf } from '../../runtime/legacy-core/opencode-models.js';

export function createPickerViewState({
  ui, models, councilMaxModels, getI18n, getCouncilTexts, getCouncilRuntimeTexts, getIsCouncilRunning, isImageConversation,
  getModelApiId, getModelTiers, groupsOf, modelName, getCouncilValidation, getModelsByIds, hasCouncilWebSearchAccess,
  normalizeConversationModel, getCouncilModelList, getModelReasoningConfig, normalizeReasoningEffort, getReasoningEffortLabel,
  getProviderLabel, modelSupportsVision, modelSupportsDocumentUpload, getSingleDocumentTranslatorModel, modelSupportsWebSearch,
  getModelRetirementLabel
}) {
  // What a picture model does and how much of it, as its registry says (a number that is not known is not shown): "Image generation · 1–6 per
  // request · References 0–4".
  const imageAbilities = (model, t) => [
    ...(model.minImageReferences > 0 ? [t('imageEdit'), t('imageNeedsPicture')] : [t('imageGeneration')]),
    ...(model.maxImageCount > 0 ? [t('imageCountRange').replace('{n}', model.maxImageCount === 1 ? '1' : `1–${model.maxImageCount}`)] : []),
    ...(model.maxImageReferences > 0 ? [t('imageReferenceRange').replace('{n}', `${model.minImageReferences || 0}–${model.maxImageReferences}`)] : [])
  ];

  const describe = (model, { translations, t, selected = false, disabled = false }) => {
    const tiers = getModelTiers(model) || [];
    const base = model.descriptionKey;
    const description = translations[base] || (tiers[0] ? translations[`${base}_tier_${tiers[0]}`] : '') || '';
    return {
      id: model.id,
      name: model.name,
      apiId: getModelApiId(model),
      company: model.company || getModelCompany(model, getModelApiId(model)),
      provider: model.provider,
      providerLabel: getProviderLabel(model.provider),
      // A picture-making model is told by what it does (a model that needs a picture to start from edits, the others generate), not by the words
      // of the text models: it reads no documents and searches nothing.
      abilities: model.outputModality === 'image' ? imageAbilities(model, t) : [
        modelSupportsVision(model) ? t('vision') : '',
        // A model of OpenCode Go that reads a PDF as it is counts as reading documents (the others of its files are translated for it).
        (modelSupportsDocumentUpload(model) || opencodeModelReadsPdf(model)) ? t('documents') : (getSingleDocumentTranslatorModel() ? t('translatedDocuments') : ''),
        modelSupportsWebSearch(model) ? t('search') : ''
      ].filter(Boolean),
      free: tiers.includes('free'),
      hidden: Boolean(model.hiddenModel),
      retirement: getModelRetirementLabel(model) || '',
      description,
      selected,
      disabled
    };
  };

  /** The state of the panel for `conversation`; `wasOpen` and `target` say whether the panel stays or opens (renderCouncilControls). */
  const buildPickerState = ({ conversation, config, language, wasOpen, target }) => {
    const i18n = getI18n();
    const translations = i18n[language] || i18n['zh-TW'] || {};
    const t = (key, values) => modelPickerText(language, key, values);
    const texts = getCouncilTexts();
    const runtimeTexts = getCouncilRuntimeTexts();
    const locked = getIsCouncilRunning() && conversation.council.enabled;
    const image = isImageConversation(conversation);
    const temporary = conversation.retentionMode === 'ephemeral';
    const councilActive = conversation.council.enabled && !image && !temporary;
    if (!wasOpen && target !== 'model') ui.view = 'main';
    if (!councilActive && ui.view !== 'main') ui.view = 'main';
    const showTabs = !image && !temporary && !(config.isLearningMode && !conversation.council.enabled);
    const archived = Boolean(conversation.archived);

    const { betaModels, currentModel, visibleModels } = prepareModelSwitcherModels({
      currentModelId: conversation.model,
      getModelApiId,
      getModelTiers,
      modelSettings: config.modelSettings,
      models
    });
    const context = { translations, t };
    const groupList = groupsOf(config);
    if (ui.pickGroupId && !groupList.some((group) => group.id === ui.pickGroupId)) ui.pickGroupId = null;
    const pickTarget = ui.pickGroupId ? groupList.find((group) => group.id === ui.pickGroupId) : null;
    const groupLabel = (group, index) => group.name || t('groupDefaultName', { n: index + 1 });
    const groupSummary = (group) => [
      group.participantModelIds.length ? group.participantModelIds.map(modelName).filter(Boolean).join(', ') : t('groupNoMembers'),
      group.synthesizerModelId ? t('groupCombinerIs', { name: modelName(group.synthesizerModelId) }) : t('groupNoCombiner')
    ].join(' · ');
    const state = {
      open: wasOpen,
      depthOpen: false,
      view: ui.view,
      query: ui.query,
      locked,
      showTabs,
      disabled: archived,
      council: null,
      councilBlocked: false,
      groups: [],
      pickGroups: [],
      pickTitle: '',
      groupsPage: null,
      depth: null,
      modelName: currentModel?.name || '',
      title: currentModel?.name || t('modelPicker')
    };

    if (councilActive) {
      const validation = getCouncilValidation(conversation);
      const participants = getModelsByIds(conversation.council.participantModelIds);
      const synthesizer = models.find((model) => model.id === conversation.council.synthesizerModelId);
      const atMax = participants.length >= councilMaxModels;
      state.council = {
        count: participants.length,
        members: participants.map((model) => ({ id: model.id, name: model.name })),
        max: councilMaxModels,
        canAdd: !atMax,
        groupLimit: GROUP_LIMIT,
        canSaveGroup: groupList.length < GROUP_LIMIT && participants.length > 0,
        groups: groupList.map((group, index) => ({
          id: group.id,
          label: groupLabel(group, index),
          summary: groupSummary(group),
          active: councilMatchesGroup(group, conversation.council)
        })),
        combinerName: synthesizer?.name || '',
        combinerPlaceholder: texts.selectSynthesizer,
        mode: conversation.council.mode,
        moreOpen: ui.moreOpen,
        showRaw: Boolean(conversation.council.showRawResponses),
        showComparison: Boolean(conversation.council.showComparisonTable),
        searchAvailable: hasCouncilWebSearchAccess(synthesizer || normalizeConversationModel(conversation)) && !archived,
        searchOn: Boolean(conversation.isWebSearchEnabled),
        ok: validation.ok,
        message: validation.ok ? `${texts.ready} · ${participants.length} · ${synthesizer?.name || ''}` : validation.message,
        labels: {
          consensus: texts.consensus,
          deliberation: texts.deliberation,
          rawNotes: texts.rawNotes,
          comparison: runtimeTexts.comparisonToggle
        }
      };
      state.title = `${texts.title} · ${participants.length}`;
      if (ui.view === 'groups') {
        state.groupsPage = {
          limit: GROUP_LIMIT,
          nameLimit: GROUP_NAME_LIMIT,
          canAdd: groupList.length < GROUP_LIMIT,
          groups: groupList.map((group, index) => ({
            id: group.id,
            name: group.name,
            label: groupLabel(group, index),
            summary: groupSummary(group),
            canApply: group.participantModelIds.length > 0
          }))
        };
      } else if (ui.view !== 'main') {
        const list = getCouncilModelList(conversation);
        const pickMembers = ui.view === 'members';
        const memberIds = pickTarget ? pickTarget.participantModelIds : conversation.council.participantModelIds;
        const combinerId = pickTarget ? pickTarget.synthesizerModelId : conversation.council.synthesizerModelId;
        const full = memberIds.length >= councilMaxModels;
        const targetLabel = pickTarget ? groupLabel(pickTarget, groupList.indexOf(pickTarget)) : '';
        state.pickTitle = pickMembers
        ? (pickTarget ? t('groupPickMembers', { name: targetLabel }) : `${t('pickMembers')} (${memberIds.length}/${councilMaxModels})`)
        : (pickTarget ? t('groupPickCombiner', { name: targetLabel }) : t('pickCombiner'));
        state.pickGroups = buildModelGroups(list, {
          decorate: (model) => describe(model, {
            ...context,
            selected: pickMembers ? memberIds.includes(model.id) : combinerId === model.id,
            disabled: (!pickTarget && locked) || (pickMembers && full && !memberIds.includes(model.id))
          }),
          recentIds: pickRecentModels(config.recentModelIds, list.map((model) => model.id)),
          recentLabel: t('recent')
        });
      }
    } else {
      const listed = [...visibleModels.filter((model) => !model.isBeta), ...betaModels];
      state.groups = buildModelGroups(listed, {
        decorate: (model) => describe(model, { ...context, selected: model.id === currentModel?.id, disabled: archived }),
        recentIds: pickRecentModels(config.recentModelIds, listed.map((model) => model.id), { current: currentModel?.id }),
        recentLabel: t('recent'),
        betaLabel: t('beta')
      });
      const reasoning = currentModel ? getModelReasoningConfig(currentModel) : null;
      if (reasoning?.options?.length > 1) {
        const effort = normalizeReasoningEffort(currentModel, conversation.reasoningEffort);
        const levels = reasoning.options.map((option) => ({ value: option, label: getReasoningEffortLabel(option, language) }));
        const index = Math.max(0, levels.findIndex((level) => level.value === effort));
        state.depth = { levels, index, defaultIndex: levels.findIndex((level) => level.value === reasoning.defaultEffort), disabled: archived };
      }
    }
    return { state, t, councilActive };
  };

  return { buildPickerState };
}
