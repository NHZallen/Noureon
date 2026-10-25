// Google Calendar (https://developers.google.com/calendar/api/v3/reference): the calendars, their events, the times when people are free, and creating, changing and deleting events.

import { ToolFailure } from '../api.js';
import { enumArg, idArg, idPart, intArg, listArg, textArg } from '../inputs.js';

const BASE = 'https://www.googleapis.com/calendar/v3';
const ALL_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i;

const calendarId = (args) => idArg(args, 'calendar_id', { required: false }) || 'primary';

// A moment as the API wants it: a date for an all-day event, otherwise a date and time with an offset (or with the time zone named by `time_zone`).
function when(value, zone, key) {
  if (ALL_DAY.test(value)) return { date: value };
  if (Number.isNaN(Date.parse(value))) throw new ToolFailure(`"${key}" must be a date (2026-03-01) or a date and time (2026-03-01T09:00:00+08:00).`);
  if (!HAS_OFFSET.test(value) && !zone) throw new ToolFailure(`"${key}" has no time zone: add an offset such as +08:00, or give "time_zone" (for example Asia/Taipei).`);
  return { dateTime: value, ...(zone ? { timeZone: zone } : {}) };
}

const person = (attendee) => ({ email: attendee.email, ...(attendee.displayName ? { name: attendee.displayName } : {}), status: attendee.responseStatus, ...(attendee.self ? { self: true } : {}) });

function shapeEvent(event, { full = false } = {}) {
  return {
    id: event.id,
    summary: event.summary || '',
    start: event.start?.dateTime || event.start?.date || '',
    end: event.end?.dateTime || event.end?.date || '',
    ...(event.location ? { location: event.location } : {}),
    ...(event.status && event.status !== 'confirmed' ? { status: event.status } : {}),
    ...(event.description ? { description: full ? event.description : event.description.slice(0, 500) } : {}),
    ...(event.attendees?.length ? { attendees: event.attendees.slice(0, 50).map(person) } : {}),
    ...(event.organizer?.email ? { organizer: event.organizer.email } : {}),
    ...(event.hangoutLink ? { meet: event.hangoutLink } : {}),
    ...(event.recurringEventId ? { recurring_event_id: event.recurringEventId } : {}),
    link: event.htmlLink || ''
  };
}

const eventFields = {
  summary: { type: 'string', description: 'The title.' },
  description: { type: 'string', description: 'The notes of the event.' },
  location: { type: 'string' },
  start: { type: 'string', description: 'The start: 2026-03-01 (all day) or 2026-03-01T09:00:00+08:00.' },
  end: { type: 'string', description: 'The end, in the same form as the start (for an all-day event, the day after the last day).' },
  time_zone: { type: 'string', description: 'An IANA time zone such as Asia/Taipei; needed when start and end have no offset.' },
  attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses of the guests.' },
  send_updates: { type: 'string', enum: ['none', 'all'], description: 'Whether the guests are told by email. Default none.' }
};

function eventBody(args, { creating }) {
  const zone = textArg(args, 'time_zone', { max: 60 });
  const body = {};
  const summary = textArg(args, 'summary', { required: creating, max: 1000 });
  if (summary || (!creating && args.summary === '')) body.summary = summary;
  if (args.description !== undefined) body.description = textArg(args, 'description', { max: 8000 });
  if (args.location !== undefined) body.location = textArg(args, 'location', { max: 500 });
  const start = textArg(args, 'start', { required: creating, max: 40 });
  const end = textArg(args, 'end', { required: creating, max: 40 });
  if (start) body.start = when(start, zone, 'start');
  if (end) body.end = when(end, zone, 'end');
  const guests = listArg(args, 'attendees', { limit: 100 });
  if (args.attendees !== undefined) body.attendees = guests.map((email) => ({ email }));
  return body;
}

export const calendarTools = [
  {
    name: 'calendar_list_calendars',
    description: 'List the calendars of the user (id, name, whether it is the main one, the access the user has). The main calendar has the id "primary".',
    inputSchema: { type: 'object', properties: {} },
    async run(args, call) {
      const data = await call('GET', `${BASE}/users/me/calendarList`, { query: { maxResults: 100 } });
      return (data?.items || []).map((item) => ({ id: item.id, name: item.summaryOverride || item.summary || '', primary: Boolean(item.primary), access: item.accessRole, time_zone: item.timeZone || '' }));
    }
  },
  {
    name: 'calendar_list_events',
    description: 'List the events of one calendar between two moments, in time order (repeating events are given one by one). Without time_min it starts now.',
    inputSchema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', description: 'The calendar; default primary.' },
        time_min: { type: 'string', description: 'The start of the range, with an offset: 2026-03-01T00:00:00+08:00. Default now.' },
        time_max: { type: 'string', description: 'The end of the range, with an offset.' },
        query: { type: 'string', description: 'Words to find in the events.' },
        max_results: { type: 'integer', description: 'At most this many (1 to 100, default 25).' }
      }
    },
    async run(args, call) {
      const min = textArg(args, 'time_min', { max: 40 });
      const max = textArg(args, 'time_max', { max: 40 });
      for (const [key, value] of [['time_min', min], ['time_max', max]]) if (value && (Number.isNaN(Date.parse(value)) || !HAS_OFFSET.test(value))) throw new ToolFailure(`"${key}" must be a date and time with an offset (2026-03-01T00:00:00+08:00).`);
      const data = await call('GET', `${BASE}/calendars/${idPart(calendarId(args))}/events`, {
        query: { singleEvents: 'true', orderBy: 'startTime', timeMin: min || new Date().toISOString(), timeMax: max, q: textArg(args, 'query', { max: 300 }), maxResults: intArg(args, 'max_results', { max: 100, fallback: 25 }) }
      });
      return { time_zone: data?.timeZone || '', events: (data?.items || []).map((event) => shapeEvent(event)) };
    }
  },
  {
    name: 'calendar_get_event',
    description: 'Get one event in full (notes, guests and what they answered, the video call link).',
    inputSchema: { type: 'object', properties: { calendar_id: { type: 'string' }, event_id: { type: 'string' } }, required: ['event_id'] },
    async run(args, call) {
      return shapeEvent(await call('GET', `${BASE}/calendars/${idPart(calendarId(args))}/events/${idPart(idArg(args, 'event_id'))}`), { full: true });
    }
  },
  {
    name: 'calendar_get_free_busy',
    description: 'Tell when the given calendars are busy between two moments (to find a time that is free).',
    inputSchema: {
      type: 'object',
      properties: {
        time_min: { type: 'string', description: 'With an offset: 2026-03-01T00:00:00+08:00.' },
        time_max: { type: 'string', description: 'With an offset.' },
        calendar_ids: { type: 'array', items: { type: 'string' }, description: 'The calendars (ids or email addresses); default the main one.' }
      },
      required: ['time_min', 'time_max']
    },
    async run(args, call) {
      const min = textArg(args, 'time_min', { required: true, max: 40 });
      const max = textArg(args, 'time_max', { required: true, max: 40 });
      for (const [key, value] of [['time_min', min], ['time_max', max]]) if (Number.isNaN(Date.parse(value)) || !HAS_OFFSET.test(value)) throw new ToolFailure(`"${key}" must be a date and time with an offset (2026-03-01T00:00:00+08:00).`);
      const ids = listArg(args, 'calendar_ids', { limit: 20 });
      const data = await call('POST', `${BASE}/freeBusy`, { json: { timeMin: min, timeMax: max, items: (ids.length ? ids : ['primary']).map((id) => ({ id })) } });
      return Object.fromEntries(Object.entries(data?.calendars || {}).map(([id, value]) => [id, { busy: (value.busy || []).map((span) => ({ start: span.start, end: span.end })), ...(value.errors?.length ? { error: value.errors[0].reason } : {}) }]));
    }
  },
  {
    name: 'calendar_create_event',
    description: 'Create an event. Guests are not told unless send_updates is "all".',
    inputSchema: { type: 'object', properties: { calendar_id: { type: 'string' }, ...eventFields }, required: ['summary', 'start', 'end'] },
    async run(args, call) {
      const data = await call('POST', `${BASE}/calendars/${idPart(calendarId(args))}/events`, { json: eventBody(args, { creating: true }), query: { sendUpdates: enumArg(args, 'send_updates', ['none', 'all'], 'none') } });
      return shapeEvent(data, { full: true });
    }
  },
  {
    name: 'calendar_update_event',
    description: 'Change an event: only the fields that are given change. Guests are not told unless send_updates is "all".',
    inputSchema: { type: 'object', properties: { calendar_id: { type: 'string' }, event_id: { type: 'string' }, ...eventFields }, required: ['event_id'] },
    async run(args, call) {
      const body = eventBody(args, { creating: false });
      if (!Object.keys(body).length) throw new ToolFailure('There is nothing to change: give at least one field.');
      const data = await call('PATCH', `${BASE}/calendars/${idPart(calendarId(args))}/events/${idPart(idArg(args, 'event_id'))}`, { json: body, query: { sendUpdates: enumArg(args, 'send_updates', ['none', 'all'], 'none') } });
      return shapeEvent(data, { full: true });
    }
  },
  {
    name: 'calendar_delete_event',
    description: 'Delete an event. Guests are not told unless send_updates is "all".',
    inputSchema: { type: 'object', properties: { calendar_id: { type: 'string' }, event_id: { type: 'string' }, send_updates: eventFields.send_updates }, required: ['event_id'] },
    async run(args, call) {
      await call('DELETE', `${BASE}/calendars/${idPart(calendarId(args))}/events/${idPart(idArg(args, 'event_id'))}`, { query: { sendUpdates: enumArg(args, 'send_updates', ['none', 'all'], 'none') } });
      return { deleted: true };
    }
  }
];
