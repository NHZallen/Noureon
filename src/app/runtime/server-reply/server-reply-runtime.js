// The server-reply hand-over as the page uses it: the signed-in account's token, the message read from the cloud, the conversation
// written to the cloud first, and a word to the person when a reply is made here instead (see server-reply.js).

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
    fetchImpl,
    clientVersion: PRODUCT_VERSION,
    warn
  });

  return {
    plan: (context) => planServerReply({ ...context, hasAccount: hasAccount() }),
    start: (args) => serverReply.start({ ...args, config: args.config }),
    notify: (kind, language) => showNotification(serverReplyText(language, kind === 'busy' ? 'fallbackBusy' : 'fallbackUnreachable'), 'info'),
    localizeError: localizeServerError
  };
}
