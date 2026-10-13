// What is said to the person when OpenCode Go refuses a request: the words of the service (without its prefix) and, when the reason is one of the
// known ones, one line of what to do, in the language of the interface (the same text on the page and on the server).
//
// Shared by the page and the server: no window, no document, no browser storage.

import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';

const PREFIX = /^Upstream request failed:\s*/i;

/** The hint (a line of text) for a refusal, or '' when none of the known reasons fits. */
export function opencodeErrorHint({ status = 0, message = '', language = 'en' } = {}) {
  const words = String(message);
  const say = (key) => getRuntimeText(language, key) || '';
  if (/Global regions/i.test(words)) return say('opencodeGlobalRegion');
  if (/trains on request data/i.test(words)) return say('opencodeTrainingConsent');
  if (status === 401 || /Invalid credential|requires a credential/i.test(words)) return say('opencodeKeyInvalid');
  if (/Endpoint is unavailable/i.test(words)) return say('opencodeUnavailable');
  if (status === 429 || /budget|limit|quota/i.test(words)) return say('opencodeLimits');
  return '';
}

/** The message shown for a refusal of OpenCode Go: the hint first, then what the service said. */
export function opencodeErrorMessage({ status, message, language }) {
  const said = String(message || '').replace(PREFIX, '').trim();
  const hint = opencodeErrorHint({ status, message: said, language });
  return hint ? `${hint}${said ? ` (${said})` : ''}` : said;
}
