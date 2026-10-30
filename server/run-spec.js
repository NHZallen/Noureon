// The request that starts a reply on the server (see docs/superpowers/specs/2026-10-03-server-runtime-design.md, §4). The browser puts
// together everything the reply needs; this checks its shape and size before anything is done with it. Errors name a place in the
// request and say what is wrong, and never repeat a value: a key must not end up in an error message or a log.

import { getCliTool, isCliReady } from '../src/data/cli-catalog.js';
import { NET_MAX_RULES, NET_MODES, NET_RULES, normalizeNetHost, normalizeNetMode, normalizeNetRules } from '../src/data/cli-net.js';
import { IMAGE_ASPECT_RATIOS, IMAGE_RESOLUTIONS } from '../src/app/runtime/images/image-generation-config.js';
import { SKILL_DESCRIPTION_MAX, isSkillName } from '../src/data/skill-format.js';
import { MAX_LISTED_SKILLS, listedSkills } from '../src/data/skill-tool.js';
import { IMAGE_PERMISSIONS } from '../src/data/tool-models.js';
import { LANGUAGES, LIMITS, PROTOCOL_VERSION } from './protocol.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['user', 'model', 'system'];
// 'research': the model calls search tools itself; 'grounding': the provider's own search (Gemini); 'briefing': Gemini searches first, then the
// reply with Python gets what it found (it cannot do both at once); 'packet': for a model that cannot search or call tools, the server searches
// first and puts what it found in front of the request (docs/superpowers/specs/2026-10-07-server-search-packet-design.md); 'off': no search.
const WEB_SEARCH = ['off', 'research', 'grounding', 'briefing', 'packet'];
const SEARCH_PROVIDERS = ['tavily', 'tinyfish'];
const SEARCH_DEPTHS = ['basic', 'advanced'];
// `documents`: the reading of files, the translating of documents and the reading of addresses are made here, not by the page (server/document-prep.js). It is a
// field of its own, at the top, so that a server that does not know it refuses the request (and the page makes those steps itself) instead of dropping it.
const TOP_LEVEL = ['protocol', 'clientVersion', 'conversationId', 'assistantMessageId', 'sequence', 'model', 'request', 'tools', 'secrets', 'kind', 'research', 'source', 'documents'];
const COUNCIL_TOP_LEVEL = ['protocol', 'clientVersion', 'conversationId', 'assistantMessageId', 'sequence', 'request', 'council', 'tools', 'secrets', 'kind'];
const COUNCIL_MODES = ['consensus', 'deliberation'];
const COUNCIL_PROVIDERS = ['gemini', 'openrouter', 'nvidia', 'opencode-go', 'openai'];
const IMAGE_PROVIDERS = ['openrouter', 'openai'];
// Where the models of OpenAI search the web (the page's `openaiWebSearch` setting): with OpenAI's own tool or with the search service.
const OPENAI_WEB_SEARCH = ['official', 'provider'];
const IMAGE_TOP_LEVEL = ['protocol', 'clientVersion', 'conversationId', 'assistantMessageId', 'sequence', 'model', 'request', 'image', 'secrets', 'kind'];
// What the page may ask of an image model (the fields of the request to OpenRouter's images endpoint that the app sets).
const IMAGE_CONFIG_FIELDS = ['aspectRatio', 'resolution', 'n', 'size', 'quality', 'outputFormat', 'background', 'outputCompression', 'seed', 'provider', 'reasoningEffort'];
const CLOUD_ASSET = '__astraCloudAsset';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// A model as the page gives it (the council's members, the translator of documents): the provider, the id and what the page knows about it.
function checkModelOf(model, path, fail) {
  if (!isObject(model)) {
    fail(path, 'must be an object');
    return null;
  }
  if (!COUNCIL_PROVIDERS.includes(model.provider)) fail(`${path}.provider`, `must be one of ${COUNCIL_PROVIDERS.join(', ')}`);
  if (!text(model.id, 200)) fail(`${path}.id`, 'must be a short text');
  if (!isObject(model.info) || JSON.stringify(model.info).length > 16_384) fail(`${path}.info`, 'must be an object of at most 16 KB');
  for (const name of Object.keys(model)) if (!['provider', 'id', 'info'].includes(name)) fail(`${path}.${name}`, 'is not a known field');
  return { provider: model.provider, id: model.id, info: model.info };
}
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

// A text model that draws pictures by itself (src/data/tool-models.js): the picture model (OpenRouter's images endpoint) and whether the person is asked
// before each picture. The key of the picture model is `secrets.imageKey`.
function checkImageGeneration(value, path, fail) {
  if (!isObject(value)) {
    fail(path, 'must be an object');
    return null;
  }
  for (const name of Object.keys(value)) if (!['model', 'permission'].includes(name)) fail(`${path}.${name}`, 'is not a known field');
  const model = value.model;
  let kept = null;
  if (!isObject(model)) fail(`${path}.model`, 'must be an object');
  else {
    if (!IMAGE_PROVIDERS.includes(model.provider)) fail(`${path}.model.provider`, `a picture is made with ${IMAGE_PROVIDERS.join(' or ')}`);
    if (!text(model.id, 200)) fail(`${path}.model.id`, 'must be a short text');
    if (!isObject(model.info) || JSON.stringify(model.info).length > 16_384) fail(`${path}.model.info`, 'must be an object of at most 16 KB');
    for (const name of Object.keys(model)) if (!['provider', 'id', 'info'].includes(name)) fail(`${path}.model.${name}`, 'is not a known field');
    kept = { provider: model.provider, id: model.id, info: model.info };
  }
  if (!IMAGE_PERMISSIONS.includes(value.permission)) fail(`${path}.permission`, `must be one of ${IMAGE_PERMISSIONS.join(', ')}`);
  return kept ? { model: kept, permission: value.permission } : null;
}

const isInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isDataImage = (value) => typeof value === 'string' && value.startsWith('data:image/') && value.indexOf(';base64,') > 10;
// A picture the person's cloud space already keeps (the marker the app's sync writes): the server reads it from there.
const isImageMarker = (value) => isObject(value) && isObject(value[CLOUD_ASSET]) && text(value[CLOUD_ASSET].path, 300) && String(value[CLOUD_ASSET].mimeType || '').startsWith('image/');
// A file the person's cloud space keeps (any kind): the server reads it from there.
const isFileMarker = (value) => isObject(value) && isObject(value[CLOUD_ASSET]) && text(value[CLOUD_ASSET].path, 300);

/**
 * The reply a visual check asked for again is about (`kind: 'vision'`, the button of a check that did not finish): its id, its text, the
 * presentations Python made in it, and the files to look at again.
 */
function checkVisionSource(source, fail) {
  if (!isObject(source)) return fail('source', 'must be an object');
  for (const name of Object.keys(source)) if (!['messageId', 'text', 'parts', 'fileIds'].includes(name)) fail(`source.${name}`, 'is not a known field');
  if (!text(source.messageId, 100)) fail('source.messageId', 'must be an id');
  if (typeof source.text !== 'string' || source.text.length > LIMITS.maxSystemInstructionChars) fail('source.text', `must be a text of at most ${LIMITS.maxSystemInstructionChars} characters`);
  if (!Array.isArray(source.parts) || source.parts.length > 40) fail('source.parts', 'must be a list of at most 40 files');
  else source.parts.forEach((part, index) => {
    const file = part?.sandboxFile;
    if (!isObject(file) || !text(file.id, 200) || !text(file.name, 300) || !(typeof file.data === 'string' || isFileMarker(file.data))) fail(`source.parts[${index}]`, 'must be a file Python made');
  });
  if (!Array.isArray(source.fileIds) || source.fileIds.length === 0 || source.fileIds.length > 20 || !source.fileIds.every((id) => text(id, 200))) fail('source.fileIds', 'must be a list of 1 to 20 file ids');
}

/** A request for an image (`kind: 'image'`): the prompt, the size and shape, the pictures to start from, and the key. */
function validateImageSpec(input) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  for (const name of Object.keys(input)) if (!IMAGE_TOP_LEVEL.includes(name)) fail(name, 'is not a known field');
  if (!text(input.clientVersion, 40)) fail('clientVersion', 'must be a short text');
  if (!UUID.test(String(input.conversationId || ''))) fail('conversationId', 'must be an id');
  if (!UUID.test(String(input.assistantMessageId || ''))) fail('assistantMessageId', 'must be an id');
  if (!Number.isInteger(input.sequence) || input.sequence < 0) fail('sequence', 'must be a whole number from 0');

  const model = input.model;
  if (!isObject(model)) fail('model', 'must be an object');
  else {
    // Image models are OpenRouter's (the images endpoint) or OpenAI's own.
    if (!IMAGE_PROVIDERS.includes(model.provider)) fail('model.provider', `an image is made with ${IMAGE_PROVIDERS.join(' or ')}`);
    if (!text(model.id, 200)) fail('model.id', 'must be a short text');
    if (!isObject(model.info)) fail('model.info', 'must be an object');
  }

  const request = input.request;
  if (!isObject(request)) fail('request', 'must be an object');
  else {
    if (!LANGUAGES.includes(request.language)) fail('request.language', `must be one of ${LANGUAGES.join(', ')}`);
    if (request.messageMetadata !== undefined && (!isObject(request.messageMetadata) || JSON.stringify(request.messageMetadata).length > 8192)) fail('request.messageMetadata', 'must be an object of at most 8 KB');
    for (const name of Object.keys(request)) if (!['language', 'messageMetadata'].includes(name)) fail(`request.${name}`, 'is not a known field');
  }

  const image = input.image;
  let config = {};
  let references = [];
  let groups = null;
  if (!isObject(image)) fail('image', 'must be an object');
  else {
    for (const name of Object.keys(image)) if (!['prompt', 'config', 'references', 'groups', 'safetyId'].includes(name)) fail(`image.${name}`, 'is not a known field');
    if (!text(image.prompt, LIMITS.maxImagePromptChars)) fail('image.prompt', `must be a text of at most ${LIMITS.maxImagePromptChars} characters`);
    if (!isObject(image.config)) fail('image.config', 'must be an object');
    else {
      const given = image.config;
      for (const name of Object.keys(given)) if (!IMAGE_CONFIG_FIELDS.includes(name)) fail(`image.config.${name}`, 'is not a known field');
      if (!IMAGE_ASPECT_RATIOS.includes(given.aspectRatio)) fail('image.config.aspectRatio', 'is not a ratio the app offers');
      // '' (the model sets its own size) is left out of the request to the provider.
      if (given.resolution !== undefined && given.resolution !== '' && !IMAGE_RESOLUTIONS.includes(given.resolution)) fail('image.config.resolution', 'is not a size the app offers');
      // The page offers 1 to 10 in its Count menu.
      if (given.n !== undefined && !isInteger(given.n, 1, 10)) fail('image.config.n', 'must be a whole number from 1 to 10');
      for (const [name, max] of [['size', 40], ['quality', 40], ['outputFormat', 20], ['background', 20], ['reasoningEffort', 40]]) {
        if (given[name] !== undefined && !text(given[name], max)) fail(`image.config.${name}`, `must be a short text (at most ${max} characters)`);
      }
      if (given.outputCompression !== undefined && !isInteger(given.outputCompression, 0, 100)) fail('image.config.outputCompression', 'must be a whole number from 0 to 100');
      if (given.seed !== undefined && !Number.isSafeInteger(given.seed)) fail('image.config.seed', 'must be a whole number');
      if (given.provider !== undefined && (!isObject(given.provider) || JSON.stringify(given.provider).length > 4096)) fail('image.config.provider', 'must be an object of at most 4 KB');
      config = Object.fromEntries(IMAGE_CONFIG_FIELDS.filter((name) => given[name] !== undefined && given[name] !== '').map((name) => [name, given[name]]));
    }
    if (image.references !== undefined) {
      if (!Array.isArray(image.references) || image.references.length > LIMITS.maxImageReferences) fail('image.references', `must be a list of at most ${LIMITS.maxImageReferences} pictures`);
      else {
        image.references.forEach((reference, index) => {
          if (!isDataImage(reference) && !isImageMarker(reference)) fail(`image.references[${index}]`, 'must be a picture (a data address or a file of the cloud space)');
        });
        references = image.references;
      }
    }
    // The pictures of an earlier reply, each built on by the picture at its place: one request for each group (server/image-run.js).
    if (image.groups !== undefined) {
      if (!Array.isArray(image.groups) || image.groups.length < 2 || image.groups.length > 10) fail('image.groups', 'must be a list of 2 to 10 groups');
      else {
        groups = image.groups.map((group, groupIndex) => {
          if (!isObject(group)) { fail(`image.groups[${groupIndex}]`, 'must be an object'); return null; }
          for (const name of Object.keys(group)) if (!['references', 'aspectRatio'].includes(name)) fail(`image.groups[${groupIndex}].${name}`, 'is not a known field');
          const list = group.references === undefined ? [] : group.references;
          if (!Array.isArray(list) || list.length > LIMITS.maxImageReferences) fail(`image.groups[${groupIndex}].references`, `must be a list of at most ${LIMITS.maxImageReferences} pictures`);
          else list.forEach((reference, index) => {
            if (!isDataImage(reference) && !isImageMarker(reference)) fail(`image.groups[${groupIndex}].references[${index}]`, 'must be a picture (a data address or a file of the cloud space)');
          });
          if (group.aspectRatio !== undefined && !IMAGE_ASPECT_RATIOS.includes(group.aspectRatio)) fail(`image.groups[${groupIndex}].aspectRatio`, 'is not a ratio the app offers');
          return { references: Array.isArray(list) ? list : [], ...(group.aspectRatio ? { aspectRatio: group.aspectRatio } : {}) };
        });
      }
    }
  }

  const secrets = input.secrets;
  if (!isObject(secrets)) fail('secrets', 'must be an object');
  else {
    if (!text(secrets.providerKey, 600)) fail('secrets.providerKey', 'is needed');
    for (const name of Object.keys(secrets)) if (name !== 'providerKey') fail(`secrets.${name}`, 'is not a known field');
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return {
    ok: true,
    spec: {
      protocol: input.protocol,
      kind: 'image',
      clientVersion: input.clientVersion,
      conversationId: input.conversationId,
      assistantMessageId: input.assistantMessageId,
      sequence: input.sequence,
      model: { provider: model.provider, id: model.id, info: model.info },
      // What the rest of the server reads of any reply (the language of its error, the metadata of its message); an image has no history.
      request: { history: [], currentMessage: { parts: [] }, systemInstruction: '', language: request.language, ...(request.messageMetadata ? { messageMetadata: request.messageMetadata } : {}) },
      tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false },
      image: { prompt: image.prompt, config, references, ...(groups ? { groups } : {}), ...(image.safetyId === false ? { safetyId: false } : {}) },
      secrets: { providerKey: secrets.providerKey }
    }
  };
}

function checkSkillsAndConnectors(tools, fail) {
  // The skills the model may load by itself (the person's skills, each a name and when it applies): their text is read by the server when one is called for.
  if (tools.skills !== undefined) {
    if (!Array.isArray(tools.skills) || tools.skills.length > MAX_LISTED_SKILLS) fail('tools.skills', `must be a list of at most ${MAX_LISTED_SKILLS} skills`);
    else tools.skills.forEach((entry, index) => {
      if (!isObject(entry) || !isSkillName(entry.name) || !text(entry.description, SKILL_DESCRIPTION_MAX)) fail(`tools.skills[${index}]`, 'must have a skill name and a description');
      // `files`: the skill has files the model may read; `given`: the person asked for it with "/", so its text was given whole.
      else if ((entry.files !== undefined && typeof entry.files !== 'boolean') || (entry.given !== undefined && typeof entry.given !== 'boolean')) fail(`tools.skills[${index}]`, '`files` and `given` must be true or false');
    });
  }
  // The connectors the person has logged in to may be used (not in a temporary chat): the server reads which ones from the person's own connections.
  if (tools.connectors !== undefined && typeof tools.connectors !== 'boolean') fail('tools.connectors', 'must be true or false');
}

/**
 * A request for a council (`kind: 'council'`, docs/superpowers/specs/2026-10-08-server-council-design.md): 2 to 5 models answer the same
 * message (twice, in a deliberation), and a synthesizer writes the answer. Each model comes with the information the page has about it, as for
 * any reply; the keys are one for each provider the models use.
 */
function validateCouncilSpec(input) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  for (const name of Object.keys(input)) if (!COUNCIL_TOP_LEVEL.includes(name)) fail(name, 'is not a known field');
  if (!text(input.clientVersion, 40)) fail('clientVersion', 'must be a short text');
  if (!UUID.test(String(input.conversationId || ''))) fail('conversationId', 'must be an id');
  if (!UUID.test(String(input.assistantMessageId || ''))) fail('assistantMessageId', 'must be an id');
  if (!Number.isInteger(input.sequence) || input.sequence < 0) fail('sequence', 'must be a whole number from 0');

  const checkModel = (model, path) => checkModelOf(model, path, fail);

  const council = input.council;
  let participants = [];
  let synthesizer = null;
  let translator = null;
  if (!isObject(council)) fail('council', 'must be an object');
  else {
    for (const name of Object.keys(council)) if (!['mode', 'showRawResponses', 'showComparisonTable', 'participants', 'synthesizer', 'translator'].includes(name)) fail(`council.${name}`, 'is not a known field');
    if (!COUNCIL_MODES.includes(council.mode)) fail('council.mode', `must be one of ${COUNCIL_MODES.join(', ')}`);
    for (const name of ['showRawResponses', 'showComparisonTable']) if (typeof council[name] !== 'boolean') fail(`council.${name}`, 'must be true or false');
    if (!Array.isArray(council.participants) || council.participants.length < 2 || council.participants.length > LIMITS.maxCouncilModels) fail('council.participants', `must be a list of 2 to ${LIMITS.maxCouncilModels} models`);
    else {
      participants = council.participants.map((model, index) => checkModel(model, `council.participants[${index}]`));
      if (new Set(council.participants.map((model) => model?.id)).size !== council.participants.length) fail('council.participants', 'must name each model once');
    }
    synthesizer = checkModel(council.synthesizer, 'council.synthesizer');
    if (council.translator !== undefined && council.translator !== null) translator = checkModel(council.translator, 'council.translator');
  }

  const request = input.request;
  if (!isObject(request)) fail('request', 'must be an object');
  else {
    if (!Array.isArray(request.history)) fail('request.history', 'must be a list');
    else {
      if (request.history.length > LIMITS.maxHistoryMessages) fail('request.history', `has more than ${LIMITS.maxHistoryMessages} messages`);
      request.history.slice(0, LIMITS.maxHistoryMessages).forEach((message, index) => {
        if (!isObject(message) || !ROLES.includes(message.role) || !Array.isArray(message.parts)) fail(`request.history[${index}]`, 'must have a role and parts');
      });
    }
    if (!isObject(request.currentMessage) || !Array.isArray(request.currentMessage.parts) || request.currentMessage.parts.length === 0) fail('request.currentMessage', 'must have parts');
    // What each kind of call is told (memory, the persona, the learning mode and so on, put together by the page for the three purposes).
    if (!isObject(request.systemInstructions)) fail('request.systemInstructions', 'must be an object');
    else for (const name of ['participant', 'deliberation', 'synthesis']) {
      if (typeof request.systemInstructions[name] !== 'string' || request.systemInstructions[name].length > LIMITS.maxSystemInstructionChars) fail(`request.systemInstructions.${name}`, `must be a text of at most ${LIMITS.maxSystemInstructionChars} characters`);
    }
    if (request.messageMetadata !== undefined && (!isObject(request.messageMetadata) || JSON.stringify(request.messageMetadata).length > 8192)) fail('request.messageMetadata', 'must be an object of at most 8 KB');
    if (!LANGUAGES.includes(request.language)) fail('request.language', `must be one of ${LANGUAGES.join(', ')}`);
    for (const name of Object.keys(request)) if (!['history', 'currentMessage', 'systemInstructions', 'messageMetadata', 'language'].includes(name)) fail(`request.${name}`, 'is not a known field');
  }

  const tools = input.tools;
  if (!isObject(tools)) fail('tools', 'must be an object');
  else {
    if (!['off', 'on'].includes(tools.webSearch)) fail('tools.webSearch', 'must be off or on');
    if (tools.searchProvider !== undefined && !SEARCH_PROVIDERS.includes(tools.searchProvider)) fail('tools.searchProvider', `must be one of ${SEARCH_PROVIDERS.join(', ')}`);
    if (tools.searchDepth !== undefined && !SEARCH_DEPTHS.includes(tools.searchDepth)) fail('tools.searchDepth', `must be one of ${SEARCH_DEPTHS.join(', ')}`);
    if (tools.openaiWebSearch !== undefined && !OPENAI_WEB_SEARCH.includes(tools.openaiWebSearch)) fail('tools.openaiWebSearch', `must be one of ${OPENAI_WEB_SEARCH.join(', ')}`);
    if (tools.openaiSafetyId !== undefined && typeof tools.openaiSafetyId !== 'boolean') fail('tools.openaiSafetyId', 'must be true or false');
    // What the members may read by themselves (docs/superpowers/specs/2026-10-19-council-tools-design.md): the person's skills and connectors, as for a reply.
    checkSkillsAndConnectors(tools, fail);
    for (const name of Object.keys(tools)) if (!['webSearch', 'searchProvider', 'searchDepth', 'openaiWebSearch', 'openaiSafetyId', 'skills', 'connectors', 'synthesis'].includes(name)) fail(`tools.${name}`, 'is not a known field');
  }
  // What the synthesizer may use besides (§2.2): Python with the Design menu's choices and the files of the message, and the CLI tools with their
  // sites; and the visual check of a presentation it writes. Checked as the tools of a reply are, since the synthesis is made as one.
  let synthesisTools = null;
  if (isObject(tools) && tools.synthesis !== undefined) {
    const given = tools.synthesis;
    if (!isObject(given)) fail('tools.synthesis', 'must be an object');
    else {
      for (const name of Object.keys(given)) if (!['advanced', 'designs', 'inputs', 'cli', 'net', 'visionCheck'].includes(name)) fail(`tools.synthesis.${name}`, 'is not a known field');
      const own = Object.fromEntries(['designs', 'inputs', 'cli', 'net', 'visionCheck'].filter((name) => given[name] !== undefined).map((name) => [name, given[name]]));
      const asReply = validateRunSpec({
        protocol: input.protocol,
        clientVersion: '0',
        conversationId: input.conversationId,
        assistantMessageId: input.assistantMessageId,
        sequence: 0,
        model: { provider: 'synthesis', id: 'synthesis', info: {} },
        request: { history: [], currentMessage: { parts: [{ text: 'synthesis' }] }, systemInstruction: '', language: 'en' },
        tools: { webSearch: 'off', advanced: given.advanced, ...own },
        secrets: { providerKey: 'synthesis' }
      });
      if (!asReply.ok) for (const error of asReply.errors) fail(String(error.path).replace(/^tools\./, 'tools.synthesis.'), error.message);
      else {
        const { webSearch: _off, searchProvider: _provider, searchDepth: _depth, openaiWebSearch: _openaiSearch, openaiSafetyId: _openaiId, ...checked } = asReply.spec.tools;
        synthesisTools = checked;
      }
    }
  }

  const secrets = input.secrets;
  const keys = {};
  if (!isObject(secrets)) fail('secrets', 'must be an object');
  else {
    for (const name of Object.keys(secrets)) if (!['keys', 'searchKey', 'searchKeyAlt'].includes(name)) fail(`secrets.${name}`, 'is not a known field');
    if (!isObject(secrets.keys)) fail('secrets.keys', 'must be an object');
    else {
      for (const [name, key] of Object.entries(secrets.keys)) {
        if (!COUNCIL_PROVIDERS.includes(name)) fail(`secrets.keys.${name}`, 'is not a known provider');
        else if (!text(key, 600)) fail(`secrets.keys.${name}`, 'must be a key');
        else keys[name] = key;
      }
      // Every provider a model of the council is asked at has to have its key.
      for (const model of [...participants, synthesizer, translator]) {
        if (model && COUNCIL_PROVIDERS.includes(model.provider) && !keys[model.provider]) fail(`secrets.keys.${model.provider}`, 'is needed for a model of the council');
      }
    }
    if (secrets.searchKey !== undefined && !text(secrets.searchKey, 600)) fail('secrets.searchKey', 'must be a key or left out');
    if (secrets.searchKeyAlt !== undefined && (!text(secrets.searchKeyAlt, 600) || !text(secrets.searchKey, 600))) fail('secrets.searchKeyAlt', 'must be a key, and only with a searchKey');
    // Each member searches by itself (Gemini with Google, the others with Tavily or TinyFish when a key is given; without one they answer without searching).
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return {
    ok: true,
    spec: {
      protocol: input.protocol,
      kind: 'council',
      clientVersion: input.clientVersion,
      conversationId: input.conversationId,
      assistantMessageId: input.assistantMessageId,
      sequence: input.sequence,
      // What the rest of the server reads of any reply: the model recorded with the run is the synthesizer's.
      model: synthesizer,
      council: {
        mode: council.mode,
        showRawResponses: council.showRawResponses,
        showComparisonTable: council.showComparisonTable,
        participants,
        synthesizer,
        translator
      },
      request: {
        history: request.history,
        currentMessage: request.currentMessage,
        systemInstruction: '',
        systemInstructions: { participant: request.systemInstructions.participant, deliberation: request.systemInstructions.deliberation, synthesis: request.systemInstructions.synthesis },
        language: request.language,
        ...(request.messageMetadata ? { messageMetadata: request.messageMetadata } : {})
      },
      tools: {
        webSearch: tools.webSearch,
        searchProvider: tools.searchProvider || 'tavily',
        searchDepth: tools.searchDepth === 'advanced' ? 'advanced' : 'basic',
        ...(tools.openaiWebSearch === 'provider' ? { openaiWebSearch: 'provider' } : {}),
        ...(tools.openaiSafetyId === false ? { openaiSafetyId: false } : {}),
        advanced: false,
        ...(Array.isArray(tools.skills) && listedSkills(tools.skills).length ? { skills: listedSkills(tools.skills) } : {}),
        ...(tools.connectors === true ? { connectors: true } : {}),
        ...(synthesisTools ? { synthesis: synthesisTools } : {})
      },
      secrets: { keys, ...(secrets.searchKey ? { searchKey: secrets.searchKey } : {}), ...(secrets.searchKeyAlt ? { searchKeyAlt: secrets.searchKeyAlt } : {}) }
    }
  };
}

/**
 * Checks a request body. Returns { ok: true, spec } (the checked copy, with only the known fields) or { ok: false, errors: [{ path, message }] }.
 * A request of another protocol version is told apart (`unsupportedProtocol`) so it can be answered with 426.
 */
export function validateRunSpec(input) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  if (!isObject(input)) return { ok: false, errors: [{ path: '', message: 'must be an object' }] };
  if (input.protocol !== PROTOCOL_VERSION) return { ok: false, unsupportedProtocol: true, errors: [{ path: 'protocol', message: `this server speaks protocol ${PROTOCOL_VERSION}` }] };
  if (input.kind === 'image') return validateImageSpec(input);
  if (input.kind === 'council') return validateCouncilSpec(input);
  for (const name of Object.keys(input)) if (!TOP_LEVEL.includes(name)) fail(name, 'is not a known field');

  if (!text(input.clientVersion, 40)) fail('clientVersion', 'must be a short text');
  if (!UUID.test(String(input.conversationId || ''))) fail('conversationId', 'must be an id');
  if (!UUID.test(String(input.assistantMessageId || ''))) fail('assistantMessageId', 'must be an id');
  if (!Number.isInteger(input.sequence) || input.sequence < 0) fail('sequence', 'must be a whole number from 0');

  const model = input.model;
  if (!isObject(model)) fail('model', 'must be an object');
  else {
    if (!text(model.provider, 60)) fail('model.provider', 'must be a short text');
    if (!text(model.id, 200)) fail('model.id', 'must be a short text');
    if (!isObject(model.info)) fail('model.info', 'must be an object');
  }

  const request = input.request;
  if (!isObject(request)) fail('request', 'must be an object');
  else {
    if (!Array.isArray(request.history)) fail('request.history', 'must be a list');
    else {
      if (request.history.length > LIMITS.maxHistoryMessages) fail('request.history', `has more than ${LIMITS.maxHistoryMessages} messages`);
      request.history.slice(0, LIMITS.maxHistoryMessages).forEach((message, index) => {
        if (!isObject(message) || !ROLES.includes(message.role) || !Array.isArray(message.parts)) fail(`request.history[${index}]`, 'must have a role and parts');
      });
    }
    if (!isObject(request.currentMessage) || !Array.isArray(request.currentMessage.parts) || request.currentMessage.parts.length === 0) fail('request.currentMessage', 'must have parts');
    if (typeof request.systemInstruction !== 'string' || request.systemInstruction.length > LIMITS.maxSystemInstructionChars) fail('request.systemInstruction', `must be a text of at most ${LIMITS.maxSystemInstructionChars} characters`);
    // The slip of the memory (what bears on this message): the server puts it after the message, in the copy of the request only.
    if (request.memorySlip !== undefined && (typeof request.memorySlip !== 'string' || request.memorySlip.length > LIMITS.maxMemorySlipChars)) fail('request.memorySlip', `must be a text of at most ${LIMITS.maxMemorySlipChars} characters`);
    if (request.generation !== undefined && !isObject(request.generation)) fail('request.generation', 'must be an object');
    if (request.reasoningEffort !== undefined && request.reasoningEffort !== null && !text(request.reasoningEffort, 40)) fail('request.reasoningEffort', 'must be a short text');
    if (request.messageMetadata !== undefined && (!isObject(request.messageMetadata) || JSON.stringify(request.messageMetadata).length > 8192)) fail('request.messageMetadata', 'must be an object of at most 8 KB');
    if (!LANGUAGES.includes(request.language)) fail('request.language', `must be one of ${LANGUAGES.join(', ')}`);
  }

  const tools = input.tools;
  let imageGeneration = null;
  if (!isObject(tools)) fail('tools', 'must be an object');
  else {
    if (!WEB_SEARCH.includes(tools.webSearch)) fail('tools.webSearch', `must be one of ${WEB_SEARCH.join(', ')}`);
    if (tools.searchProvider !== undefined && !SEARCH_PROVIDERS.includes(tools.searchProvider)) fail('tools.searchProvider', `must be one of ${SEARCH_PROVIDERS.join(', ')}`);
    if (tools.searchDepth !== undefined && !SEARCH_DEPTHS.includes(tools.searchDepth)) fail('tools.searchDepth', `must be one of ${SEARCH_DEPTHS.join(', ')}`);
    if (tools.openaiSafetyId !== undefined && typeof tools.openaiSafetyId !== 'boolean') fail('tools.openaiSafetyId', 'must be true or false');
    if (typeof tools.advanced !== 'boolean') fail('tools.advanced', 'must be true or false');
    if (tools.webSearch === 'packet' && tools.advanced !== false) fail('tools.webSearch', 'a search packet is for replies without Python');
    if (tools.webSearch === 'briefing' && tools.advanced !== true) fail('tools.webSearch', 'briefing is for replies with Python');
    // The Design menu's choices (a template name each, or "auto"), and the files of this message that Python is given.
    if (tools.designs !== undefined) {
      if (!isObject(tools.designs)) fail('tools.designs', 'must be an object');
      else for (const kind of ['deck', 'document']) if (tools.designs[kind] !== undefined && !text(tools.designs[kind], 80)) fail(`tools.designs.${kind}`, 'must be a short text');
    }
    // The visual check of presentations after the reply: asked for by the page (its setting is on, the model can see images, it is not a
    // council); `deckDesign` is the conversation's template choice and `advanced` whether Python may redo a deck it drew.
    if (tools.visionCheck !== undefined && tools.visionCheck !== null) {
      if (!isObject(tools.visionCheck)) fail('tools.visionCheck', 'must be an object');
      else {
        if (tools.visionCheck.deckDesign !== undefined && !text(tools.visionCheck.deckDesign, 80)) fail('tools.visionCheck.deckDesign', 'must be a short text');
        if (tools.visionCheck.advanced !== undefined && typeof tools.visionCheck.advanced !== 'boolean') fail('tools.visionCheck.advanced', 'must be true or false');
      }
    }
    // The memory of notes (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §5): the reply may look up and write notes. The server reads the notes themselves from the
    // table of the person (so it works on what is there now); the page says whether writing is allowed, and gives the person's own messages of the conversation that a write is checked against.
    if (tools.memory !== undefined) {
      if (!isObject(tools.memory)) fail('tools.memory', 'must be an object');
      else {
        if (typeof tools.memory.canWrite !== 'boolean') fail('tools.memory.canWrite', 'must be true or false');
        // `curator`: the reply's model has no memory tools (or its provider refuses them beside its own search): the server learns from the turn after the reply, with a small model (memory-curator.js).
        if (tools.memory.curator !== undefined && typeof tools.memory.curator !== 'boolean') fail('tools.memory.curator', 'must be true or false');
        // `history`: the reply may also look back through the person's past conversations in the cloud workspace (a cloud account). `vector`: and by meaning, with the key of `secrets.embeddingKey`.
        if (tools.memory.history !== undefined && typeof tools.memory.history !== 'boolean') fail('tools.memory.history', 'must be true or false');
        if (tools.memory.vector !== undefined && (!isObject(tools.memory.vector) || !['gemini', 'openrouter'].includes(tools.memory.vector.provider))) fail('tools.memory.vector', 'must name the provider of the embedding model (gemini or openrouter)');
        if (isObject(tools.memory.vector) && tools.memory.history !== true) fail('tools.memory.vector', 'is only for a reply that may look back through the past conversations');
        if (!Array.isArray(tools.memory.messages) || tools.memory.messages.length > LIMITS.maxMemoryMessages) fail('tools.memory.messages', `must be a list of at most ${LIMITS.maxMemoryMessages} messages`);
        else {
          tools.memory.messages.forEach((message, index) => {
            if (!isObject(message) || !text(message.id, 120) || typeof message.text !== 'string' || message.text.length > LIMITS.maxMemoryMessageChars || (message.at !== undefined && !text(message.at, 40))) fail(`tools.memory.messages[${index}]`, `must have an id and a text of at most ${LIMITS.maxMemoryMessageChars} characters`);
          });
        }
      }
    }
    // The CLI tools (命令工具) the person chose with "@" for this message: ids of the store's tools. They run in the sandbox, so this is a reply
    // with Python (`advanced`).
    if (tools.cli !== undefined) {
      if (!Array.isArray(tools.cli) || tools.cli.length > 8) fail('tools.cli', 'must be a list of at most 8 tools');
      else {
        tools.cli.forEach((entry, index) => {
          if (!isObject(entry) || !text(entry.id, 40) || !isCliReady(getCliTool(entry.id))) fail(`tools.cli[${index}]`, 'must name a tool of the store that can be used');
          else if (entry.chosen !== undefined && typeof entry.chosen !== 'boolean') fail(`tools.cli[${index}].chosen`, 'must be true or false');
        });
        if (tools.cli.length && tools.advanced !== true) fail('tools.cli', 'CLI tools run in the sandbox: advanced must be true');
      }
    }
    // The person's rules for the sites the tools may reach (settings: netMode, netRules); the sandbox's proxy is given them.
    if (tools.net !== undefined) {
      if (!isObject(tools.net)) fail('tools.net', 'must be an object');
      else {
        if (tools.net.mode !== undefined && !NET_MODES.includes(tools.net.mode)) fail('tools.net.mode', `must be one of ${NET_MODES.join(', ')}`);
        if (tools.net.rules !== undefined) {
          if (!isObject(tools.net.rules) || Object.keys(tools.net.rules).length > NET_MAX_RULES) fail('tools.net.rules', `must be an object of at most ${NET_MAX_RULES} sites`);
          else for (const [host, rule] of Object.entries(tools.net.rules)) if (!normalizeNetHost(host) || !NET_RULES.includes(rule)) fail('tools.net.rules', 'must name sites with the rules allow, ask or deny');
        }
        if (tools.net.enabled !== undefined && typeof tools.net.enabled !== 'boolean') fail('tools.net.enabled', 'must be true or false');
        for (const name of Object.keys(tools.net)) if (!['mode', 'rules', 'enabled'].includes(name)) fail(`tools.net.${name}`, 'is not a known field');
      }
    }
    checkSkillsAndConnectors(tools, fail);
    // A picture the text model draws by itself (src/data/tool-models.js).
    if (tools.imageGeneration !== undefined) imageGeneration = checkImageGeneration(tools.imageGeneration, 'tools.imageGeneration', fail);
    if (tools.inputs !== undefined) {
      if (!Array.isArray(tools.inputs) || tools.inputs.length > 40) fail('tools.inputs', 'must be a list of at most 40 files');
      else tools.inputs.forEach((file, index) => {
        if (!isObject(file) || !text(file.name, 300) || typeof file.data !== 'string' || (file.mimeType !== undefined && !text(file.mimeType, 120))) fail(`tools.inputs[${index}]`, 'must have a name and data');
      });
    }
  }

  // A deep research (server/research.js): the topic is what the person typed; the model searches for itself (not Gemini's own search, and
  // no Python yet), so the way it searches must be the tool one.
  if (input.kind !== undefined && input.kind !== 'research' && input.kind !== 'vision') fail('kind', 'must be "research", "vision" or left out');
  // A visual check asked for again (server/vision-check.js): no reply is made, only the check of the files named.
  if (input.kind === 'vision') {
    checkVisionSource(input.source, fail);
    if (isObject(tools)) {
      if (!isObject(tools.visionCheck)) fail('tools.visionCheck', 'is needed for a visual check');
      if (tools.webSearch !== 'off') fail('tools.webSearch', 'a visual check does not search');
      if (tools.advanced !== false) fail('tools.advanced', 'a visual check is not a reply with Python');
    }
  } else if (input.source !== undefined) fail('source', 'is only for a visual check');
  if (input.kind === 'research') {
    if (!isObject(input.research) || !text(input.research.topic, 4000)) fail('research.topic', 'must be a text of at most 4000 characters');
    if (isObject(tools)) {
      if (tools.webSearch !== 'research') fail('tools.webSearch', 'a deep research searches with tools');
      if (tools.advanced !== false) fail('tools.advanced', 'a deep research does not run Python yet');
    }
    if (isObject(model) && model.provider === 'gemini') fail('model.provider', 'a deep research is not made with Gemini yet');
    if (isObject(input.research)) for (const name of Object.keys(input.research)) if (name !== 'topic') fail(`research.${name}`, 'is not a known field');
  } else if (input.research !== undefined) fail('research', 'is only for a deep research');

  // The files, documents and addresses of the person's message, made ready here (server/document-prep.js): `translator` is the model that writes a
  // document the reply's model cannot read as text (what Settings chose), `linkedPages` whether the addresses of the message are read first (the page decides).
  let translator = null;
  if (input.documents !== undefined) {
    if (!isObject(input.documents)) fail('documents', 'must be an object');
    else {
      for (const name of Object.keys(input.documents)) if (!['linkedPages', 'translator'].includes(name)) fail(`documents.${name}`, 'is not a known field');
      if (input.documents.linkedPages !== undefined && typeof input.documents.linkedPages !== 'boolean') fail('documents.linkedPages', 'must be true or false');
      if (input.documents.translator !== undefined && input.documents.translator !== null) translator = checkModelOf(input.documents.translator, 'documents.translator', fail);
    }
    if (input.kind === 'research' || input.kind === 'vision') fail('documents', 'is for a reply to a message of the person');
  }

  // Only a reply to a message of the person may draw (not a deep research, not a visual check).
  if (isObject(tools) && tools.imageGeneration !== undefined && (input.kind === 'research' || input.kind === 'vision')) fail('tools.imageGeneration', 'is for a reply to a message of the person');

  const secrets = input.secrets;
  if (!isObject(secrets)) fail('secrets', 'must be an object');
  else {
    if (!text(secrets.providerKey, 600)) fail('secrets.providerKey', 'is needed');
    // The key of the translator model's provider, when that is not the reply's (then the reply's key serves).
    if (secrets.translatorKey !== undefined && (!text(secrets.translatorKey, 600) || !translator)) fail('secrets.translatorKey', 'must be a key, and only with a translator');
    if (translator && isObject(model) && translator.provider !== model.provider && !text(secrets.translatorKey, 600)) fail('secrets.translatorKey', 'is needed for a translator of another provider');
    if (secrets.searchKey !== undefined && !text(secrets.searchKey, 600)) fail('secrets.searchKey', 'must be a key or left out');
    // The other search source's key: when the chosen one finds nothing or fails, the search goes on with it (as the page does).
    if (secrets.searchKeyAlt !== undefined && (!text(secrets.searchKeyAlt, 600) || !text(secrets.searchKey, 600))) fail('secrets.searchKeyAlt', 'must be a key, and only with a searchKey');
    if (isObject(tools) && tools.webSearch === 'packet' && !text(secrets.searchKey, 600)) fail('secrets.searchKey', 'is needed for a search packet');
    // The key of the picture model (OpenRouter's), for a text model that draws.
    if (secrets.imageKey !== undefined && (!text(secrets.imageKey, 600) || !imageGeneration)) fail('secrets.imageKey', 'must be a key, and only with tools.imageGeneration');
    if (imageGeneration && !text(secrets.imageKey, 600)) fail('secrets.imageKey', 'is needed to draw pictures');
    // The key of the embedding model for the question of a search by meaning: kept for this run only, like the others.
    if (secrets.embeddingKey !== undefined && (!text(secrets.embeddingKey, 600) || !isObject(tools?.memory?.vector))) fail('secrets.embeddingKey', 'must be a key, and only with tools.memory.vector');
    if (isObject(tools?.memory?.vector) && !text(secrets.embeddingKey, 600)) fail('secrets.embeddingKey', 'is needed for a search by meaning');
    for (const name of Object.keys(secrets)) if (!['providerKey', 'searchKey', 'searchKeyAlt', 'translatorKey', 'imageKey', 'embeddingKey'].includes(name)) fail(`secrets.${name}`, 'is not a known field');
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return {
    ok: true,
    spec: {
      protocol: input.protocol,
      ...(input.kind === 'research' ? { kind: 'research', research: { topic: input.research.topic.trim() } } : {}),
      ...(input.kind === 'vision' ? { kind: 'vision', source: { messageId: input.source.messageId, text: input.source.text, parts: input.source.parts.map((part) => ({ sandboxFile: { id: part.sandboxFile.id, name: part.sandboxFile.name, data: part.sandboxFile.data } })), fileIds: [...new Set(input.source.fileIds)] } } : {}),
      clientVersion: input.clientVersion,
      conversationId: input.conversationId,
      assistantMessageId: input.assistantMessageId,
      sequence: input.sequence,
      model: { provider: model.provider, id: model.id, info: model.info },
      request: {
        history: request.history,
        currentMessage: request.currentMessage,
        systemInstruction: request.systemInstruction,
        ...(request.memorySlip ? { memorySlip: request.memorySlip } : {}),
        ...(request.generation ? { generation: request.generation } : {}),
        ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
        ...(request.messageMetadata ? { messageMetadata: request.messageMetadata } : {}),
        language: request.language
      },
      tools: {
        webSearch: tools.webSearch,
        searchProvider: tools.searchProvider || 'tavily',
        searchDepth: tools.searchDepth === 'advanced' ? 'advanced' : 'basic',
        ...(tools.openaiSafetyId === false ? { openaiSafetyId: false } : {}),
        advanced: tools.advanced,
        ...(isObject(tools.visionCheck) ? { visionCheck: { deckDesign: tools.visionCheck.deckDesign || 'auto', advanced: tools.visionCheck.advanced === true } } : {}),
        ...(tools.designs ? { designs: { deck: tools.designs.deck || 'auto', document: tools.designs.document || 'auto' } } : {}),
        ...(Array.isArray(tools.cli) && tools.cli.length ? { cli: [...new Set(tools.cli.map((entry) => entry.id))].map((id) => ({ id, chosen: tools.cli.some((entry) => entry.id === id && entry.chosen === true) })) } : {}),
        // The sites the sandbox may reach (Python and the command tools alike); `enabled: false` is the person's switch for no network at all.
        ...(tools.advanced === true && isObject(tools.net) ? { net: { mode: normalizeNetMode(tools.net.mode), rules: normalizeNetRules(tools.net.rules), ...(tools.net.enabled === false ? { enabled: false } : {}) } } : {}),
        ...(Array.isArray(tools.skills) && listedSkills(tools.skills).length ? { skills: listedSkills(tools.skills) } : {}),
        ...(tools.connectors === true ? { connectors: true } : {}),
        ...(isObject(tools.memory) ? { memory: { canWrite: tools.memory.canWrite === true, ...(tools.memory.curator === true ? { curator: true } : {}), ...(tools.memory.history === true ? { history: true } : {}), ...(isObject(tools.memory.vector) ? { vector: { provider: tools.memory.vector.provider } } : {}), messages: tools.memory.messages.map((message) => ({ id: message.id, text: message.text, ...(message.at ? { at: message.at } : {}) })) } } : {}),
        ...(imageGeneration ? { imageGeneration } : {}),
        ...(tools.inputs?.length ? { inputs: tools.inputs.map((file) => ({ name: file.name, mimeType: file.mimeType || '', data: file.data })) } : {})
      },
      ...(input.documents ? { documents: { linkedPages: input.documents.linkedPages === true, ...(translator ? { translator } : {}) } } : {}),
      secrets: { providerKey: secrets.providerKey, ...(secrets.searchKey ? { searchKey: secrets.searchKey } : {}), ...(secrets.searchKeyAlt ? { searchKeyAlt: secrets.searchKeyAlt } : {}), ...(secrets.translatorKey ? { translatorKey: secrets.translatorKey } : {}), ...(secrets.imageKey ? { imageKey: secrets.imageKey } : {}), ...(secrets.embeddingKey ? { embeddingKey: secrets.embeddingKey } : {}) }
    }
  };
}
