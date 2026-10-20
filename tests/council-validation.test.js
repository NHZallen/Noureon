import assert from 'node:assert/strict';
import test from 'node:test';

import { createCouncilValidation } from '../src/app/runtime/legacy-core/council-validation.js';
import { COUNCIL_TEXT } from '../src/app/runtime/legacy-core/model-registry.js';
import { createShellState } from '../src/app/runtime/legacy-core/shell-state.js';

const model = (id, extra = {}) => ({ id, name: id.toUpperCase(), provider: 'openrouter', ...extra });

function validation({ participants = [], synthesizer = null, keys = { openrouter: 'k' }, translator = null, files = [], vision = () => true } = {}) {
  return createCouncilValidation({
    configAccess: { getUiLanguage: () => 'en', getConfig: () => ({}) },
    registry: {
      isCouncilEnabled: (conv) => Boolean(conv?.council?.enabled),
      normalizeCouncilConfig: (council) => council,
      getCouncilSelectedModels: (conv) => ({ council: conv.council, participants, synthesizer }),
      getCouncilTranslatorModel: () => translator,
      modelUsesTavilySearch: () => false,
      modelSupportsVision: vision,
      modelSupportsDocumentUpload: () => true,
      getModelTiers: (m) => m.tiers || []
    },
    i18n: { en: { m_tier_paid: '$1 / M' } },
    getUploadedFiles: () => files,
    getApiKeyForProvider: (provider) => keys[provider]
  });
}

const council = { enabled: true, synthesizerModelId: 's' };

test('a council needs two to five members, a synthesizer and every key', () => {
  const texts = COUNCIL_TEXT.en;
  assert.deepEqual(validation().getCouncilValidation({ council: { enabled: false } }), { ok: true, message: '' });
  assert.equal(validation({ participants: [model('a')], synthesizer: model('s') }).getCouncilValidation({ council }).message, texts.tooFew);
  assert.equal(validation({ participants: 'abcdef'.split('').map((id) => model(id)), synthesizer: model('s') }).getCouncilValidation({ council }).reason, 'tooMany');
  assert.equal(validation({ participants: [model('a'), model('b')] }).getCouncilValidation({ council }).reason, 'missingSynthesizer');
  const missing = validation({ participants: [model('a'), model('b', { provider: 'gemini' })], synthesizer: model('s') }).getCouncilValidation({ council });
  assert.equal(missing.reason, 'missingApiKey');
  assert.match(missing.message, /: B$/);
  assert.deepEqual(validation({ participants: [model('a'), model('b')], synthesizer: model('s') }).getCouncilValidation({ council }), { ok: true, reason: 'ready', message: texts.ready });
});

test('pictures for a member that cannot see them need a translator model', () => {
  const picture = { type: 'image/png', base64: 'x' };
  const blind = (m) => m.id !== 'b';
  const without = validation({ participants: [model('a'), model('b')], synthesizer: model('s'), files: [picture], vision: blind });
  assert.equal(without.getCouncilValidation({ council }).reason, 'missingCouncilTranslator');
  assert.equal(without.getCouncilAttachmentTranslationNeed([model('b')]).needsVisualPacket, true);
  const withTranslator = validation({ participants: [model('a'), model('b')], synthesizer: model('s'), files: [picture], vision: blind, translator: model('t') });
  assert.equal(withTranslator.getCouncilValidation({ council }).reason, 'readyWithAttachmentTranslation');
});

test('the labels of a model and the summary of the members', () => {
  const v = validation();
  assert.equal(v.getModelPriceLabel(model('f', { tiers: ['free'] })), 'Free');
  assert.equal(v.getModelPriceLabel(model('m', { descriptionKey: 'm' })), '$1 / M');
  assert.equal(v.getModelPriceLabel(model('x', { provider: 'gemini' })), 'Google API pricing');
  assert.equal(v.getModelPriceLabel(null), '');
  assert.equal(v.getModelRetirementLabel(model('x')), '');
  assert.match(v.getModelRetirementLabel(model('x', { retirementDate: '2027-01-01' })), /2027-01-01$/);
  assert.equal(v.formatCouncilModelSummary([model('a'), model('b')]), 'A / B');
  assert.equal(v.formatCouncilModelSummary('abcde'.split('').map((id) => model(id))), 'A / B / C +2');
  assert.equal(v.getCouncilTexts(), COUNCIL_TEXT.en);
});

test('the shell state keeps its own values and reaches the stores by name', () => {
  let config = { uiLanguage: 'en' };
  let conversations = [{ id: 'a' }];
  const store = { folders: [], astras: [], personalMemories: [], memoryState: { ok: true } };
  const access = { getCurrentConversationId: () => 'a' };
  const shell = createShellState({
    configAccess: { getConfig: () => config, replaceConfig: (next) => { config = next; } },
    conversations: { getConversations: () => conversations, replaceConversations: (next) => { conversations = next; } },
    appDataStore: {
      getFolders: () => store.folders, replaceFolders: (next) => { store.folders = next; },
      getAstras: () => store.astras, replaceAstras: (next) => { store.astras = next; },
      getPersonalMemories: () => store.personalMemories, replacePersonalMemories: (next) => { store.personalMemories = next; },
      getMemoryState: () => store.memoryState
    },
    conversationStateAccess: access
  });
  assert.deepEqual(shell.uploadedFiles, []);
  assert.equal(shell.currentStoreCategory, 'all');
  shell.uploadedFiles = ['f'];
  assert.deepEqual(shell.uploadedFiles, ['f']);
  shell.config = { uiLanguage: 'fr' };
  assert.equal(config.uiLanguage, 'fr');
  shell.conversations = [];
  assert.deepEqual(conversations, []);
  shell.folders = [{ id: 'f' }];
  assert.equal(store.folders[0].id, 'f');
  assert.equal(shell.memoryState.ok, true);
  assert.equal(shell.conversationStateAccess, access);
});
