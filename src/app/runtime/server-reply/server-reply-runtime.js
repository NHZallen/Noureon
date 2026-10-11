// The server-reply hand-over as the page uses it: the signed-in account's token, the message read from the cloud, the conversation
// written to the cloud first, and a word to the person when a reply is made here instead (see server-reply.js).

import { cliText } from '../cli/cli-texts.js';
import { registerServerRequest } from '../cli/cli-server-bridge.js';
import { PRODUCT_VERSION } from '../../../data/version.js';
import { createServerReply, localizeServerError, planServerCouncil, planServerImage, planServerReply } from './server-reply.js';
import { serverReplyText } from './server-reply-texts.js';

export function createBrowserServerReply({
  getApiKeyForProvider,
  getModelApiId,
  getDefaultGenConfig,
  describeRequest,
  saveAppData = async () => {},
  showNotification = () => {},
  // The settings as they are now (the choice of where replies run is read from them when a reply is planned).
  getConfig = () => ({}),
  // For the visual check the server makes: the language of the page, the open chat, what to do when a chat is locked or freed.
  getUiLanguage = () => 'zh-TW',
  getActiveConversation = () => null,
  onVisionLock = () => {},
  // For a council: the models the conversation chose, and the one that writes its attachments down.
  getCouncilSelectedModels = () => ({ participants: [], synthesizer: null, council: {} }),
  getCouncilTranslatorModel = () => null,
  document = globalThis.document,
  // The conversation sync (src/app/sync/cloud-sync-v2-shadow.js): enabled only for a signed-in cloud account.
  getSync = () => globalThis.__astraCloudSyncV2,
  // Loaded when first needed: the page's main code does not carry the account library for a reply made here.
  getClient = async () => (await import('../../auth/supabase-client.js')).getSupabaseClient(),
  fetchImpl = (...args) => globalThis.fetch(...args),
  warn = (...args) => console.warn(...args)
} = {}) {
  const hasAccount = () => getSync()?.getStatus?.()?.enabled === true;

  const getAccessToken = async () => {
    const client = await getClient();
    if (!client) return '';
    const { data, error } = await client.auth.getSession();
    return error ? '' : data?.session?.access_token || '';
  };

  const readMessage = async (messageId) => {
    const client = await getClient();
    if (!client) return null;
    const { data, error } = await client.from('workspace_messages').select('parts,status,metadata').eq('id', messageId).maybeSingle();
    if (error) throw error;
    return data || null;
  };

  // The files a reply made are in the person's cloud storage (the message holds markers); the sync's asset transport brings them here.
  const hydrateParts = async (parts) => {
    const assets = globalThis.window?.__astraCloudAssets || globalThis.__astraCloudAssets;
    if (!assets?.hydrateConversation) return parts;
    const { conversation } = await assets.hydrateConversation({ parts });
    return conversation.parts;
  };

  // The files a request would carry are kept in the cloud first, and the request names where they are.
  const externalizeParts = async (parts) => {
    const assets = globalThis.window?.__astraCloudAssets || globalThis.__astraCloudAssets;
    return assets?.externalize ? assets.externalize(parts) : parts;
  };

  const findLiveRun = async (conversationId) => {
    const client = await getClient();
    if (!client || !conversationId) return null;
    // Nobody signed in to the cloud: there is nothing of the server to look for.
    const { data: auth } = await client.auth.getSession();
    if (!auth?.session) return null;
    const { data, error } = await client.from('server_runs').select('id,message_id,kind:model->>kind,vision:model->>vision,created_at').eq('conversation_id', conversationId).in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  };

  // A run that failed lately and left no message in the chat (the server could not write one, or the page was closed at the time).
  const FAILED_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;
  const findFailedRun = async (conversationId) => {
    const client = await getClient();
    if (!client || !conversationId) return null;
    const { data: auth } = await client.auth.getSession();
    if (!auth?.session) return null;
    const since = new Date(Date.now() - FAILED_RUN_WINDOW_MS).toISOString();
    const { data, error } = await client.from('server_runs').select('id,message_id,error_code,finished_at').eq('conversation_id', conversationId).eq('status', 'failed').gte('finished_at', since).order('finished_at', { ascending: false }).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  };
  // The runs already told to the person (kept in this browser), so a message the person deletes does not come back.
  const NOTED_KEY = 'noureon:failed-runs-told';
  const readNoted = () => {
    try {
      return new Set(JSON.parse(globalThis.localStorage?.getItem(NOTED_KEY) || '[]'));
    } catch {
      return new Set();
    }
  };
  const writeNoted = (ids) => {
    try {
      globalThis.localStorage?.setItem(NOTED_KEY, JSON.stringify([...ids].slice(-50)));
    } catch {
      // Not kept: the worst is a message told again.
    }
  };
  const FAILURE_TEXT = { time_limit: 'timeLimit', server_restarted: 'serverRestarted', sandbox_unavailable: 'sandboxUnavailable', image_not_saved: 'imageNotSaved' };

  const flushSync = async () => {
    await saveAppData();
    await getSync()?.flush?.();
  };

  const serverReply = createServerReply({
    getAccessToken,
    getApiKeyForProvider,
    getModelApiId,
    getDefaultGenConfig,
    describeRequest,
    flushSync,
    readMessage,
    hydrateParts,
    externalizeParts,
    findLiveRun,
    findFailedRun,
    fetchImpl,
    clientVersion: PRODUCT_VERSION,
    paceMs: 45,
    warn
  });

  // The permissions tab (secure credentials) and the card that asks about a site talk to the server through the same connection.
  registerServerRequest((...args) => serverReply.request(...args));

  // The visual check the server makes is followed by a module loaded when the first one is (not part of every page).
  let visionFollow = null;
  const vision = () => {
    visionFollow ||= import('./server-vision.js').then((module) => module.createServerVisionFollow({ serverReply, document, getLanguage: getUiLanguage, showNotification, getActiveConversation, getSync, onLockChange: onVisionLock, warn }));
    return visionFollow;
  };
  // What the server said of a reply it made: whether it checks its presentations, and the id of the check when it began.
  const visionNotes = new Map();

  const notify = (kind, language) => {
    // A CLI tool (命令工具) that was chosen but could not be used: it needs a model that calls tools and the server.
    if (kind === 'cli-local' || kind === 'cli-tool-model') showNotification(cliText(language, kind === 'cli-local' ? 'notOnServer' : 'needToolModel'), 'warning');
    else showNotification(serverReplyText(language, kind === 'busy' ? 'fallbackBusy' : 'fallbackUnreachable'), 'info');
  };

  // A council: held by the server when it takes it (the page's own council otherwise). Its code is loaded when a council is first held.
  let councilHold = null;
  const council = (args) => {
    councilHold ||= import('./server-council.js').then((module) => module.createServerCouncil({
      plan: (context) => planServerCouncil({ config: getConfig(), ...context, hasAccount: hasAccount() }),
      start: (startArgs) => serverReply.startCouncil(startArgs),
      notify,
      getCouncilSelectedModels,
      getCouncilTranslatorModel,
      getConfig,
      getUiLanguage
    }));
    return councilHold.then((hold) => hold(args));
  };

  return {
    hasAccount,
    council,
    // The visual check of the presentations a reply wrote, when the server makes it (server-vision.js).
    noteVision: (messageId, { vision: checked = false, visionRunId = null } = {}) => {
      if (messageId && (checked || visionRunId)) visionNotes.set(messageId, { vision: checked, visionRunId });
    },
    // What the finished reply does about its check: a reply whose check the server makes has it followed and the page makes none; any other
    // reply is given to `localSchedule` (the page's own check).
    visionSchedule: (localSchedule) => (args) => {
      const note = visionNotes.get(args.message?.id);
      if (!note) return localSchedule(args);
      visionNotes.delete(args.message.id);
      return vision().then((follow) => follow.scheduleServer({ ...args, note })).catch((error) => warn('Following the visual check of the server failed.', error));
    },
    followVision: (args) => vision().then((follow) => follow.attach(args)),
    find: (conversationId) => serverReply.find(conversationId),
    // The error message of a reply the server failed while the chat was left (or that it could not write), as a message to put in the chat, or null:
    // only for a chat that ends with the person's own message, for a run that came after it, and once for each run.
    failedReply: async (conversation) => {
      const last = conversation?.messages?.at(-1);
      if (!last || last.role !== 'user') return null;
      const row = await serverReply.findFailure(conversation.id);
      if (!row || conversation.messages.some((message) => message.id === row.message_id)) return null;
      if (Date.parse(row.finished_at) < Date.parse(last.createdAt || 0)) return null;
      const noted = readNoted();
      if (noted.has(row.id)) return null;
      noted.add(row.id);
      writeNoted(noted);
      const language = getUiLanguage();
      return { id: row.message_id, role: 'model', parts: [{ text: `${serverReplyText(language, 'errorPrefix')}${serverReplyText(language, FAILURE_TEXT[row.error_code] || 'unknownError')}` }], createdAt: row.finished_at };
    },
    plan: (context) => planServerReply({ config: getConfig(), ...context, hasAccount: hasAccount() }),
    planImage: (context) => planServerImage({ config: getConfig(), ...context, hasAccount: hasAccount() }),
    start: (args) => serverReply.start({ ...args, config: args.config }),
    startResearch: (args) => serverReply.startResearch(args),
    startImage: (args) => serverReply.startImage(args),
    readMessage: (messageId) => readMessage(messageId),
    request: (...args) => serverReply.request(...args),
    watchRun: (...args) => serverReply.watchRun(...args),
    hydrateParts: (parts) => hydrateParts(parts),
    flushSync: () => flushSync(),
    notify,
    localizeError: localizeServerError
  };
}
