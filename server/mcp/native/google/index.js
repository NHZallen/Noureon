// The Google provider of the native connectors: Calendar, Sheets, Docs, Slides, Drive and Gmail through their own REST APIs (one login, one token). Google's remote MCP servers are
// not used (they are in a developer preview and do not cover all of these), so what a tool does is written here (docs/superpowers/specs/2026-10-25-google-connector-design.md).

import { calendarTools } from './calendar.js';
import { docsTools } from './docs.js';
import { driveTools } from './drive.js';
import { gmailTools } from './gmail.js';
import { sheetsTools } from './sheets.js';
import { slidesTools } from './slides.js';

const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']);
const DISABLED_REASONS = new Set(['accessNotConfigured', 'SERVICE_DISABLED']);
const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'RATE_LIMIT_EXCEEDED']);

/** In a few plain words, why Google refused a call (its own shape of error; what the model reads, so no more than it needs). */
export function explain(status, text) {
  let error = null;
  try {
    error = JSON.parse(text)?.error || null;
  } catch {
    error = null;
  }
  const message = String(error?.message || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const reasons = [error?.errors?.[0]?.reason, ...(Array.isArray(error?.details) ? error.details.map((detail) => detail?.reason) : [])].filter(Boolean);
  if (reasons.some((reason) => SCOPE_REASONS.has(reason)) || /insufficient (?:authentication scopes|permission)/i.test(message)) {
    return 'The login does not allow this (it may be a read-only login): the user can log in again with permission to change, in the settings of the Google connector.';
  }
  if (reasons.some((reason) => DISABLED_REASONS.has(reason)) || /has not been used in project|is disabled/i.test(message)) return 'This Google service is not turned on for Noureon: its owner has to enable the API.';
  if (status === 429 || reasons.some((reason) => RATE_REASONS.has(reason))) return 'Google says there are too many requests: try again in a moment.';
  if (status === 404) return `Not found${message ? `: ${message}` : ''}. Check the id.`;
  return `Google answered ${status}${message ? `: ${message}` : ''}.`;
}

export const googleProvider = Object.freeze({
  hosts: Object.freeze(['www.googleapis.com', 'sheets.googleapis.com', 'docs.googleapis.com', 'slides.googleapis.com', 'gmail.googleapis.com']),
  explain,
  tools: Object.freeze([...calendarTools, ...sheetsTools, ...docsTools, ...slidesTools, ...driveTools, ...gmailTools])
});
