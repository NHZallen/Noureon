// The conversation sync of a signed-in account (Sync V2), its public face. The parts:
//   cloud-sync-v2-local-runtime.js   the browser's storage, and the sync started for an account (initializeConversationShadowSync)
//   cloud-sync-v2-controller.js      the sync object: queue, start, refresh, retry, status (createConversationShadowSync)
//   cloud-sync-v2-remote-apply.js    the cloud read and put together with this device
//   cloud-sync-v2-capture.js         an upload
//   cloud-sync-v2-permanent-delete.js  deleting forever
//   cloud-sync-v2-repository.js      the database (createConversationShadowRepository)
//   cloud-sync-v2-merge.js, -delete-match.js, -shared.js  the rules and helpers they share
// ("Shadow" is the name the sync had while it ran next to the old one; it is the only sync now.)

import { SCHEMA_VERSION, TRASH_SYNC_CAPABILITY } from './cloud-sync-v2-shared.js';

export { LocalWorkspaceDataError } from './cloud-sync-v2-shared.js';
export { createConversationShadowRepository } from './cloud-sync-v2-repository.js';
export { createConversationShadowSync } from './cloud-sync-v2-controller.js';
export { initializeConversationShadowSync } from './cloud-sync-v2-local-runtime.js';

export const conversationShadowSyncPolicy = Object.freeze({
  mode: 'refresh-merge',
  realtime: true,
  schemaVersion: SCHEMA_VERSION,
  trashSyncCapability: TRASH_SYNC_CAPABILITY
});
