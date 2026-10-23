// The messages the page is waiting for, so it can draw them in as they come (the result of the visual check, written by the server): a page
// that expects a message says its id here, and the chat takes it when it draws that message. What nobody expects is simply drawn.

const expected = new Map();
const EXPECT_MS = 60_000;

/** The page expects the message `id` within a minute: it will be typed in, not set down at once. */
export function expectArrival(id, { now = Date.now, ms = EXPECT_MS } = {}) {
  if (id) expected.set(String(id), now() + ms);
}

/** Whether `id` was expected (and still is in time); an expected message is taken once. */
export function takeArrival(id, { now = Date.now } = {}) {
  const until = expected.get(String(id));
  expected.delete(String(id));
  return Number.isFinite(until) && until >= now();
}
