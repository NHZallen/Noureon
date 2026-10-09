// The request that starts a reply on the server (see docs/superpowers/specs/2026-10-03-server-runtime-design.md, §4). The browser puts
// together everything the reply needs; this checks its shape and size before anything is done with it. Errors name a place in the
// request and say what is wrong, and never repeat a value: a key must not end up in an error message or a log.

import { getCliTool, isCliReady } from '../src/data/cli-catalog.js';
import { NET_MAX_RULES, NET_MODES, NET_RULES, normalizeNetHost, normalizeNetMode, normalizeNetRules } from '../src/data/cli-net.js';
import { IMAGE_ASPECT_RATIOS, IMAGE_RESOLUTIONS } from '../src/app/legacy-runtime/features/image-generation-config.js';
import { SKILL_DESCRIPTION_MAX, isSkillName } from '../src/data/skill-format.js';
import { MAX_LISTED_SKILLS, listedSkills } from '../src/data/skill-tool.js';
import { LANGUAGES, LIMITS, PROTOCOL_VERSION } from './protocol.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['user', 'model', 'system'];
// 'research': the model calls search tools itself; 'grounding': the provider's own search (Gemini); 'briefing': Gemini searches first, then the
// reply with Python gets what it found (it cannot do both at once); 'packet': for a model that cannot search or call tools, the server searches
// first and puts what it found in front of the request (docs/superpowers/specs/2026-10-07-server-search-packet-design.md); 'off': no search.
const WEB_SEARCH = ['off', 'research', 'grounding', 'briefing', 'packet'];
const SEARCH_PROVIDERS = ['tavily', 'tinyfish'];
const SEARCH_DEPTHS = ['basic', 'advanced'];
const TOP_LEVEL = ['protocol', 'clientVersion', 'conversationId', 'assistantMessageId', 'sequence', 'model', 'request', 'tools', 'secrets', 'kind', 'research'];
const COUNCIL_TOP_LEVEL = ['protocol', 'clientVersion', 'conversationId', 'assistantMessageId', 'sequence', 'request', 'council', 'tools', 'secrets', 'kind'];
const COUNCIL_MODES = ['consensus', 'deliberation'];
const COUNCIL_PROVIDERS = ['gemini', 'openrouter', 'nvidia'];
const IMAGE_TOP_LEVEL = ['protocol', 'clientVersion', 'conversationId', 'assistantMessageId', 'sequence', 'model', 'request', 'image', 'secrets', 'kind'];
// What the page may ask of an image model (the fields of the request to OpenRouter's images endpoint that the app sets).
const IMAGE_CONFIG_FIELDS = ['aspectRatio', 'resolution', 'n', 'size', 'quality', 'outputFormat', 'background', 'outputCompression', 'seed', 'provider', 'reasoningEffort'];
const CLOUD_ASSET = '__astraCloudAsset';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

const isInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isDataImage = (value) => typeof value === 'string' && value.startsWith('data:image/') && value.indexOf(';base64,') > 10;
// A picture the person's cloud space already keeps (the marker the app's sync writes): the server reads it from there.
const isImageMarker = (value) => isObject(value) && isObject(value[CLOUD_ASSET]) && text(value[CLOUD_ASSET].path, 300) && String(value[CLOUD_ASSET].mimeType || '').startsWith('image/');

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
    // Image models are OpenRouter's (the images endpoint).
    if (model.provider !== 'openrouter') fail('model.provider', 'an image is made with OpenRouter');
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
  if (!isObject(image)) fail('image', 'must be an object');
  else {
    for (const name of Object.keys(image)) if (!['prompt', 'config', 'references'].includes(name)) fail(`image.${name}`, 'is not a known field');
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
      image: { prompt: image.prompt, config, references },
      secrets: { providerKey: secrets.providerKey }
    }
  };
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

  const checkModel = (model, path) => {
    if (!isObject(model)) {
      fail(path, 'must be an object');
      return null;
    }
    if (!COUNCIL_PROVIDERS.includes(model.provider)) fail(`${path}.provider`, `must be one of ${COUNCIL_PROVIDERS.join(', ')}`);
    if (!text(model.id, 200)) fail(`${path}.id`, 'must be a short text');
    if (!isObject(model.info) || JSON.stringify(model.info).length > 16_384) fail(`${path}.info`, 'must be an object of at most 16 KB');
    for (const name of Object.keys(model)) if (!['provider', 'id', 'info'].includes(name)) fail(`${path}.${name}`, 'is not a known field');
    return { provider: model.provider, id: model.id, info: model.info };
  };

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
    for (const name of Object.keys(tools)) if (!['webSearch', 'searchProvider', 'searchDepth'].includes(name)) fail(`tools.${name}`, 'is not a known field');
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
    // The search of a council is a packet (Tavily or TinyFish) unless its synthesizer is Gemini, which searches by itself.
    if (isObject(tools) && tools.webSearch === 'on' && synthesizer && synthesizer.provider !== 'gemini' && !text(secrets.searchKey, 600)) fail('secrets.searchKey', 'is needed to search for a council');
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
      tools: { webSearch: tools.webSearch, searchProvider: tools.searchProvider || 'tavily', searchDepth: tools.searchDepth === 'advanced' ? 'advanced' : 'basic', advanced: false },
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
    if (request.generation !== undefined && !isObject(request.generation)) fail('request.generation', 'must be an object');
    if (request.reasoningEffort !== undefined && request.reasoningEffort !== null && !text(request.reasoningEffort, 40)) fail('request.reasoningEffort', 'must be a short text');
    if (request.messageMetadata !== undefined && (!isObject(request.messageMetadata) || JSON.stringify(request.messageMetadata).length > 8192)) fail('request.messageMetadata', 'must be an object of at most 8 KB');
    if (!LANGUAGES.includes(request.language)) fail('request.language', `must be one of ${LANGUAGES.join(', ')}`);
  }

  const tools = input.tools;
  if (!isObject(tools)) fail('tools', 'must be an object');
  else {
    if (!WEB_SEARCH.includes(tools.webSearch)) fail('tools.webSearch', `must be one of ${WEB_SEARCH.join(', ')}`);
    if (tools.searchProvider !== undefined && !SEARCH_PROVIDERS.includes(tools.searchProvider)) fail('tools.searchProvider', `must be one of ${SEARCH_PROVIDERS.join(', ')}`);
    if (tools.searchDepth !== undefined && !SEARCH_DEPTHS.includes(tools.searchDepth)) fail('tools.searchDepth', `must be one of ${SEARCH_DEPTHS.join(', ')}`);
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
        for (const name of Object.keys(tools.net)) if (!['mode', 'rules'].includes(name)) fail(`tools.net.${name}`, 'is not a known field');
      }
    }
    // The skills the model may load by itself (the person's skills, each a name and when it applies): their text is read by the server when one is called for.
    if (tools.skills !== undefined) {
      if (!Array.isArray(tools.skills) || tools.skills.length > MAX_LISTED_SKILLS) fail('tools.skills', `must be a list of at most ${MAX_LISTED_SKILLS} skills`);
      else tools.skills.forEach((entry, index) => {
        if (!isObject(entry) || !isSkillName(entry.name) || !text(entry.description, SKILL_DESCRIPTION_MAX)) fail(`tools.skills[${index}]`, 'must have a skill name and a description');
      });
    }
    if (tools.inputs !== undefined) {
      if (!Array.isArray(tools.inputs) || tools.inputs.length > 40) fail('tools.inputs', 'must be a list of at most 40 files');
      else tools.inputs.forEach((file, index) => {
        if (!isObject(file) || !text(file.name, 300) || typeof file.data !== 'string' || (file.mimeType !== undefined && !text(file.mimeType, 120))) fail(`tools.inputs[${index}]`, 'must have a name and data');
      });
    }
  }

  // A deep research (server/research.js): the topic is what the person typed; the model searches for itself (not Gemini's own search, and
  // no Python yet), so the way it searches must be the tool one.
  if (input.kind !== undefined && input.kind !== 'research') fail('kind', 'must be "research" or left out');
  if (input.kind === 'research') {
    if (!isObject(input.research) || !text(input.research.topic, 4000)) fail('research.topic', 'must be a text of at most 4000 characters');
    if (isObject(tools)) {
      if (tools.webSearch !== 'research') fail('tools.webSearch', 'a deep research searches with tools');
      if (tools.advanced !== false) fail('tools.advanced', 'a deep research does not run Python yet');
    }
    if (isObject(model) && model.provider === 'gemini') fail('model.provider', 'a deep research is not made with Gemini yet');
    if (isObject(input.research)) for (const name of Object.keys(input.research)) if (name !== 'topic') fail(`research.${name}`, 'is not a known field');
  } else if (input.research !== undefined) fail('research', 'is only for a deep research');

  const secrets = input.secrets;
  if (!isObject(secrets)) fail('secrets', 'must be an object');
  else {
    if (!text(secrets.providerKey, 600)) fail('secrets.providerKey', 'is needed');
    if (secrets.searchKey !== undefined && !text(secrets.searchKey, 600)) fail('secrets.searchKey', 'must be a key or left out');
    // The other search source's key: when the chosen one finds nothing or fails, the search goes on with it (as the page does).
    if (secrets.searchKeyAlt !== undefined && (!text(secrets.searchKeyAlt, 600) || !text(secrets.searchKey, 600))) fail('secrets.searchKeyAlt', 'must be a key, and only with a searchKey');
    if (isObject(tools) && tools.webSearch === 'packet' && !text(secrets.searchKey, 600)) fail('secrets.searchKey', 'is needed for a search packet');
    for (const name of Object.keys(secrets)) if (!['providerKey', 'searchKey', 'searchKeyAlt'].includes(name)) fail(`secrets.${name}`, 'is not a known field');
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return {
    ok: true,
    spec: {
      protocol: input.protocol,
      ...(input.kind === 'research' ? { kind: 'research', research: { topic: input.research.topic.trim() } } : {}),
      clientVersion: input.clientVersion,
      conversationId: input.conversationId,
      assistantMessageId: input.assistantMessageId,
      sequence: input.sequence,
      model: { provider: model.provider, id: model.id, info: model.info },
      request: {
        history: request.history,
        currentMessage: request.currentMessage,
        systemInstruction: request.systemInstruction,
        ...(request.generation ? { generation: request.generation } : {}),
        ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
        ...(request.messageMetadata ? { messageMetadata: request.messageMetadata } : {}),
        language: request.language
      },
      tools: {
        webSearch: tools.webSearch,
        searchProvider: tools.searchProvider || 'tavily',
        searchDepth: tools.searchDepth === 'advanced' ? 'advanced' : 'basic',
        advanced: tools.advanced,
        ...(isObject(tools.visionCheck) ? { visionCheck: { deckDesign: tools.visionCheck.deckDesign || 'auto', advanced: tools.visionCheck.advanced === true } } : {}),
        ...(tools.designs ? { designs: { deck: tools.designs.deck || 'auto', document: tools.designs.document || 'auto' } } : {}),
        ...(Array.isArray(tools.cli) && tools.cli.length ? { cli: [...new Set(tools.cli.map((entry) => entry.id))].map((id) => ({ id, chosen: tools.cli.some((entry) => entry.id === id && entry.chosen === true) })) } : {}),
        ...(Array.isArray(tools.cli) && tools.cli.length && isObject(tools.net) ? { net: { mode: normalizeNetMode(tools.net.mode), rules: normalizeNetRules(tools.net.rules) } } : {}),
        ...(Array.isArray(tools.skills) && listedSkills(tools.skills).length ? { skills: listedSkills(tools.skills) } : {}),
        ...(tools.inputs?.length ? { inputs: tools.inputs.map((file) => ({ name: file.name, mimeType: file.mimeType || '', data: file.data })) } : {})
      },
      secrets: { providerKey: secrets.providerKey, ...(secrets.searchKey ? { searchKey: secrets.searchKey } : {}), ...(secrets.searchKeyAlt ? { searchKeyAlt: secrets.searchKeyAlt } : {}) }
    }
  };
}
