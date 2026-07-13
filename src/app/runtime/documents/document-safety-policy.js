export const DOCUMENT_BLOCKED_AUTOMATIC_ACTIONS = Object.freeze(new Set([
  'network-request',
  'open-url',
  'tool-call',
  'file-delete',
  'memory-write',
  'secret-access',
  'settings-change'
]));

export function authorizeDocumentDerivedAction({
  action,
  source = 'user',
  explicitlyRequestedByUser = false,
  userConfirmed = false
} = {}) {
  if (source !== 'document') return { allowed: true, reason: 'not-document-derived' };
  if (!DOCUMENT_BLOCKED_AUTOMATIC_ACTIONS.has(action)) {
    return { allowed: false, reason: 'unknown-document-action' };
  }
  if (!explicitlyRequestedByUser) return { allowed: false, reason: 'document-is-data-only' };
  if (['file-delete', 'secret-access', 'settings-change'].includes(action) && !userConfirmed) {
    return { allowed: false, reason: 'user-confirmation-required' };
  }
  return { allowed: true, reason: 'explicit-user-authorization' };
}
