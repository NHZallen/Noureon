// The server-reply hand-over as the page uses it: the signed-in account's token, the message read from the cloud, the conversation
// written to the cloud first, and a word to the person when a reply is made here instead (see server-reply.js).

import { cliText } from '../cli/cli-texts.js';
import { registerServerRequest } from '../cli/cli-server-bridge.js';
import { PRODUCT_VERSION } from '../../../data/version.js';
import { createServerReply, localizeServerError, planServerReply } from './server-reply.js';
import { serverReplyText } from './server-reply-texts.js';

export function createBrowserServerReply({
  getApiKeyForProvider,
  getModelApiId,
  getDefaultGenConfig,
  describeRequest,
  saveAppData = async () => {},
  showNotification = () => {},
  // For the visual check the server makes: the language of the page, the open chat, what to do when a chat is locked or freed.
  getUiLanguage = () => 'zh-TW',
  getActiveConversation = () => null,
  onVisionLock = () => {},
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
    const { data, error } = await client.from('server_runs').select('id,message_id,kind:model->>kind,vision:model->>vision').eq('conversation_id', conversationId).in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  };

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

  return {
    hasAccount,
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
    plan: (context) => planServerReply({ ...context, hasAccount: hasAccount() }),
    start: (args) => serverReply.start({ ...args, config: args.config }),
    startResearch: (args) => serverReply.startResearch(args),
    readMessage: (messageId) => readMessage(messageId),
    request: (...args) => serverReply.request(...args),
    watchRun: (...args) => serverReply.watchRun(...args),
    hydrateParts: (parts) => hydrateParts(parts),
    flushSync: () => flushSync(),
    notify: (kind, language) => {
      // A CLI tool (命令工具) that was chosen but could not be used: it needs a model that calls tools and the server.
      if (kind === 'cli-local' || kind === 'cli-tool-model') showNotification(cliText(language, kind === 'cli-local' ? 'notOnServer' : 'needToolModel'), 'warning');
      else showNotification(serverReplyText(language, kind === 'busy' ? 'fallbackBusy' : 'fallbackUnreachable'), 'info');
    },
    localizeError: localizeServerError
  };
}
