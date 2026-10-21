// What is said to the person when OpenCode Go refuses a request: the words of the service (without its prefix) and, when the reason is one of the
// known ones, one line of what to do, in the language of the interface (the same text on the page and on the server). The lines are in a file of
// their own, loaded only when a refusal comes: the page does not carry them otherwise.
//
// Shared by the page and the server: no window, no document, no browser storage.

const PREFIX = /^Upstream request failed:\s*/i;

/** The hint (a line of text) for a refusal, or '' when none of the known reasons fits. */
export async function opencodeErrorHint({ status = 0, message = '', language = 'en' } = {}) {
  const words = String(message);
  const key = /Global regions/i.test(words) ? 'opencodeGlobalRegion'
    : /trains on request data/i.test(words) ? 'opencodeTrainingConsent'
      : (status === 401 || /Invalid credential|requires a credential/i.test(words)) ? 'opencodeKeyInvalid'
        : /Endpoint is unavailable/i.test(words) ? 'opencodeUnavailable'
          : (status === 429 || /budget|limit|quota/i.test(words)) ? 'opencodeLimits'
            : '';
  if (!key) return '';
  const { OPENCODE_ERROR_TEXTS } = await import('../../../data/opencode-error-texts.js');
  return (OPENCODE_ERROR_TEXTS[language] || OPENCODE_ERROR_TEXTS.en)[key] || '';
}

/** The message shown for a refusal of OpenCode Go: the hint first, then what the service said. */
export async function opencodeErrorMessage({ status, message, language }) {
  const said = String(message || '').replace(PREFIX, '').trim();
  const hint = await opencodeErrorHint({ status, message: said, language });
  return hint ? `${hint}${said ? ` (${said})` : ''}` : said;
}
