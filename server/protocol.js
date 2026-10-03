// What the browser and the server agree on. A change that an older browser or server could misread raises PROTOCOL_VERSION; the server
// refuses a request of another version (426) and the browser then runs the reply itself, as it does when the server cannot be reached.

export const PROTOCOL_VERSION = 1;

/** Codes the browser turns into its messages (in all five languages). They are part of the protocol: do not rename them. */
export const ERROR_CODES = Object.freeze({
  unauthorized: 'unauthorized',
  badRequest: 'bad_request',
  invalidRunSpec: 'invalid_run_spec',
  conversationNotFound: 'conversation_not_found',
  tooManyRuns: 'too_many_runs',
  rateLimited: 'rate_limited',
  requestTooLarge: 'request_too_large',
  protocolUnsupported: 'protocol_unsupported',
  providerError: 'provider_error',
  serverRestarted: 'server_restarted',
  stopped: 'stopped',
  notFound: 'not_found',
  internal: 'internal_error'
});

export const LIMITS = Object.freeze({
  // How long one reply may run (two hours), and how long a key kept for it lives: that plus a quarter of an hour.
  maxRunMs: 2 * 60 * 60 * 1000,
  keyTtlMs: (2 * 60 + 15) * 60 * 1000,
  // How many replies one person may have running at once.
  maxRunsPerUser: 5,
  // New runs a person may start in a minute.
  createPerMinute: 10,
  maxRequestBytes: 25 * 1024 * 1024,
  maxSystemInstructionChars: 400_000,
  maxHistoryMessages: 2000,
  // Tool calls in one reply (the same number the browser uses).
  maxToolCalls: 20,
  // Resumptions of one run after a restart before it is given up.
  maxResumes: 3
});

export const LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
