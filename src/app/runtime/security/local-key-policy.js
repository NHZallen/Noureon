// What the person chose for the protection of the keys on their devices (settings: "Protect the keys on this device"), as it is kept in the settings and so follows the account:
// { on, days } (the days an unlock lasts, 0 at every visit), or null while nothing was chosen yet. It holds no secret. What a device really does is kept on the device itself
// (security/local-key-rules.js: the keys are sealed one way or the other there); security/local-key-policy-sync.js makes each device do what the settings say.
// No imports: the normalization of the settings loads this.

/** The days an unlock lasts, as the settings offer them (0: it is asked for at every visit). */
export const REAUTH_DAYS = Object.freeze([0, 1, 3, 7, 14, 30]);
export const DEFAULT_REAUTH_DAYS = 7;

export function normalizeLocalKeyPolicy(value) {
  if (!value || typeof value !== 'object') return null;
  const days = Number(value.days);
  return { on: value.on === true, days: REAUTH_DAYS.includes(days) ? days : DEFAULT_REAUTH_DAYS };
}
