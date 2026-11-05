// The greeting of an empty chat (docs/superpowers/specs/2026-11-05-dynamic-greeting-design.md): a short line that follows the clock of the person (time of day, a night owl at night, a Monday or a Friday),
// and the well-known holidays of the language they use (greeting-texts.js). Nothing is asked of anyone: the time is the one of this device and nothing leaves it.
// This file is the engine (pure: the date, the language, the name and the zone come in); the words and the holidays of each language are in greeting-texts.js.

import { GREETING_TEXTS } from './greeting-texts.js';

const DAY_MS = 86_400_000;

// ----- the calendars -----

/** The Western Easter Sunday of a year (the Gregorian computus): { month: 1-12, day }. */
export function westernEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** The Orthodox Easter Sunday of a year, in the Gregorian calendar (the Julian computus and the 13 days between the calendars; right for 1900 to 2099). */
export function orthodoxEaster(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const shifted = new Date(Date.UTC(year, month - 1, day + 13));
  return { month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** The day of the Chinese calendar of a date ({ month, day, leap }), or null when this browser has no such calendar. */
export function lunarDate(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' }).formatToParts(date);
    const month = parts.find((part) => part.type === 'month')?.value || '';
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    const number = Number.parseInt(month, 10);
    if (!Number.isFinite(number) || !Number.isFinite(day)) return null;
    return { month: number, day, leap: /\D/.test(month) };
  } catch {
    return null;
  }
}

/** The n-th (1 to 4) or the last (-1) weekday (0 = Sunday) of a month (1-12): the day of the month. */
export function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(year, month - 1, 1).getDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(year, month, 0).getDate();
  const last = new Date(year, month - 1, lastDay).getDay();
  return lastDay - ((last - weekday + 7) % 7);
}

// ----- the holidays -----

const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
const sameDay = (date, month, day) => date.getMonth() + 1 === month && date.getDate() === day;
const sameDate = (a, b) => sameDay(a, b.getMonth() + 1, b.getDate());
const startsWithAny = (zone, prefixes) => prefixes.some((prefix) => zone.startsWith(prefix));

/** Does the rule hold on this day (a date at noon)? Every key of the rule must hold. Plain data, so a language's table can be cut by the build. */
export function ruleHolds(rule, day, zone = '') {
  if (rule.tz && !startsWithAny(zone, rule.tz)) return false;
  if (rule.notTz && startsWithAny(zone, rule.notTz)) return false;
  const year = day.getFullYear();
  if (rule.date && !sameDay(day, rule.date[0], rule.date[1])) return false;
  if (rule.nth) {
    const [month, weekday, n] = rule.nth;
    if (!sameDay(day, month, nthWeekday(year, month, weekday, n))) return false;
  }
  if (rule.easter !== undefined || rule.notEaster !== undefined) {
    const easter = westernEaster(year);
    const sunday = new Date(year, easter.month - 1, easter.day, 12);
    if (rule.easter !== undefined && !sameDate(day, addDays(sunday, rule.easter))) return false;
    if (rule.notEaster !== undefined && sameDate(day, addDays(sunday, rule.notEaster))) return false;
  }
  if (rule.orthodox !== undefined) {
    const easter = orthodoxEaster(year);
    if (!sameDate(day, addDays(new Date(year, easter.month - 1, easter.day, 12), rule.orthodox))) return false;
  }
  if (rule.lunar) {
    const lunar = lunarDate(day);
    if (!lunar || lunar.leap || lunar.month !== rule.lunar[0] || lunar.day !== rule.lunar[1]) return false;
  }
  if (rule.lunarEve) {
    const tomorrow = lunarDate(addDays(day, 1));
    if (!tomorrow || tomorrow.leap || tomorrow.month !== 1 || tomorrow.day !== 1) return false;
  }
  return true;
}

/** A holiday that lasts `span` days (default 1): does it hold on this day? */
export function holidayHolds(holiday, day, zone) {
  const span = Math.max(1, Number(holiday.span) || 1);
  for (let back = 0; back < span; back += 1) {
    if (ruleHolds(holiday.rule, addDays(day, -back), zone)) return true;
  }
  return false;
}

// ----- the choice -----

/** A small stable number from a number and a word (the same day and hour give the same line, the next hour another). */
function hash(number, word) {
  let value = number >>> 0;
  for (let index = 0; index < word.length; index += 1) value = Math.imul(value ^ word.charCodeAt(index), 16777619) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 2246822507) >>> 0;
  return (value ^ (value >>> 13)) >>> 0;
}

/** The part of the day of an hour (0-23). */
export function dayPart(hour) {
  if (hour < 5) return 'lateNight';
  if (hour < 9) return 'dawn';
  if (hour < 12) return 'morning';
  if (hour < 14) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

const WEEKDAY_POOLS = Object.freeze({ 0: 'sunday', 1: 'monday', 5: 'friday', 6: 'saturday' });

/** What a person is called in a sentence: an email address is cut at the @. */
export function friendlyName(name) {
  const value = String(name ?? '').trim();
  if (!value) return '';
  if (value.includes('@') && !/\s/.test(value)) return value.slice(0, value.indexOf('@'));
  return value;
}

/** The name goes where the line has {name}; with no name the place is taken out together with the comma before it. */
export function putName(line, name) {
  if (name) return line.replaceAll('{name}', name);
  return line.replace(/[,，、]?\s*\{name\}/g, '').replace(/^[\s,，、]+/, '');
}

/**
 * The line for a moment: { text, kind } (kind is 'holiday', 'night', 'day'), or null when the words of the language are not there.
 * deps: date, language, name, timeZone (the zone of the device: some holidays are those of a country), words (the table of the language; tests give their own).
 */
export function pickGreeting({ date = new Date(), language, name = '', timeZone = '', words = GREETING_TEXTS?.[language] } = {}) {
  if (!words?.pools) return null;
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
  const who = friendlyName(name);
  for (const holiday of words.holidays || []) {
    if (!holiday.texts?.length || !holidayHolds(holiday, noon, timeZone)) continue;
    const line = holiday.texts[hash(dayNumber, holiday.id) % holiday.texts.length];
    return { text: putName(line, who), kind: 'holiday', id: holiday.id };
  }
  const part = dayPart(date.getHours());
  // A night owl is a night owl whatever the day; at other hours the line comes from the part of the day and the day of the week when it has a line of its own (Monday, Friday, the weekend).
  const pools = part === 'lateNight' ? [words.pools.lateNight] : [words.pools[part], words.pools[WEEKDAY_POOLS[date.getDay()]]];
  const lines = pools.filter(Array.isArray).flat();
  if (!lines.length) return null;
  const line = lines[hash(dayNumber * 24 + date.getHours(), part) % lines.length];
  return { text: putName(line, who), kind: part === 'lateNight' ? 'night' : 'day' };
}

/** The zone of this device, or ''. */
export function deviceTimeZone(intl = globalThis.Intl) {
  try { return intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || ''; } catch { return ''; }
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/**
 * The greeting as it is drawn in the chat (escaped, ready for innerHTML). Without the words of the language, or if anything fails, it is the plain old line `name, fallback`.
 */
export function greetingHtml({ language, name, fallback, date = new Date(), timeZone = deviceTimeZone() } = {}) {
  let text = '';
  try { text = pickGreeting({ date, language, name, timeZone })?.text || ''; } catch { /* the old line */ }
  return escapeHtml(text || `${name}, ${fallback}`);
}
