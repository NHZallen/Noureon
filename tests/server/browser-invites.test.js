import assert from 'node:assert/strict';
import test from 'node:test';

import { createBrowserInvites, InviteError, makeCode } from '../../server/browser-invites.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

function world({ now } = {}) {
  const invites = []; const access = [];
  const match = (row, filters = {}) => Object.entries(filters).every(([c, s]) => { const [op, ...rest] = String(s).split('.'); const v = rest.join('.'); return op === 'is' && v === 'null' ? row[c] == null : String(row[c]) === v; });
  const db = {
    select: async (table, { filters } = {}) => (table === 'browser_invites' ? invites : access).filter((r) => match(r, filters)).map((r) => ({ ...r })),
    insert: async (table, row) => { if (table === 'browser_invites') { if (invites.some((r) => r.code === row.code)) { const e = new Error('dup'); e.code = '23505'; throw e; } invites.push({ owner_id: null, redeemed_by: null, redeemed_at: null, created_at: `t${invites.length}`, ...row }); } return [{}]; },
    update: async (table, filters, values) => { const hit = invites.filter((r) => match(r, filters)); hit.forEach((r) => Object.assign(r, values)); return hit.map((r) => ({ code: r.code })); },
    upsert: async (table, row) => { access.push({ ...row }); }
  };
  let n = 0;
  const codes = createBrowserInvites({ db, ...(now ? { now } : {}), makeId: () => `NRN-AAAA-${String(2222 + (n += 1)).replace(/[01]/g, '2').slice(0, 4).replace(/\d/g, (d) => 'ABCDEFGHJK'[Number(d)])}` });
  return { codes, invites, access };
}

test('a code reads out clearly: no 0, 1, I or O', () => {
  for (let i = 0; i < 200; i += 1) assert.match(makeCode(), /^NRN-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
});

test('a person with access gets two codes of their own, once, and sees which are used', async () => {
  const w = world();
  assert.deepEqual(await w.codes.codesOf(A, { hasAccess: false }), []);
  const first = await w.codes.codesOf(A, { hasAccess: true });
  assert.equal(first.length, 2); assert.ok(first.every((c) => c.used === false));
  assert.equal((await w.codes.codesOf(A, { hasAccess: true })).length, 2, 'not made again');
});

test('redeeming: access and two codes for the new person, the code is used up, and a code is for one person', async () => {
  const w = world();
  const [one] = await w.codes.codesOf(A, { hasAccess: true });
  assert.equal(await w.codes.hasAccess(B), false);
  assert.deepEqual(await w.codes.redeem(B, one.code.toLowerCase()), { ok: true });
  assert.equal(await w.codes.hasAccess(B), true);
  assert.equal((await w.codes.codesOf(B, { hasAccess: true })).length, 2);
  assert.equal((await w.codes.codesOf(A, { hasAccess: true })).find((c) => c.code === one.code).used, true);
  await assert.rejects(w.codes.redeem(C, one.code), (e) => e.code === 'invalid_code');
  await assert.rejects(w.codes.redeem(B, (await w.codes.codesOf(A, { hasAccess: true }))[1].code), (e) => e.code === 'already');
});

test('refused: not a code, an unknown code, your own code', async () => {
  const w = world();
  const [mine] = await w.codes.codesOf(A, { hasAccess: true });
  for (const bad of ['', 'hello', 'NRN-0000-0000', 'NRN-AAAA-AAAA']) await assert.rejects(w.codes.redeem(B, bad), (e) => e instanceof InviteError && e.code === 'invalid_code', bad);
  await assert.rejects(w.codes.redeem(A, mine.code), (e) => ['own_code', 'already'].includes(e.code));
  await assert.rejects(w.codes.redeem('x', mine.code), (e) => e.code === 'bad_user');
});

test('the people in charge can make loose codes, a few at a time', async () => {
  const w = world();
  assert.equal((await w.codes.mintLoose(3)).length, 3);
  assert.equal((await w.codes.mintLoose(1000)).length, 20);
  assert.ok(w.invites.filter((r) => r.owner_id === null).length >= 23);
  const [loose] = w.invites;
  assert.deepEqual(await w.codes.redeem(B, loose.code), { ok: true });
});

test('wrong codes: ten an hour for one person, then even the right code waits; another person is not stopped; an hour later it is open again', async () => {
  let clock = Date.parse('2026-11-18T00:00:00Z');
  const w = world({ now: () => new Date(clock) });
  const loose = (await w.codes.mintLoose(2));
  for (let i = 0; i < 10; i += 1) await assert.rejects(w.codes.redeem(B, `NRN-AAAA-${'ABCDEFGHJK'[i].repeat(4)}`), (e) => e.code === 'invalid_code');
  await assert.rejects(w.codes.redeem(B, loose[0]), (e) => e instanceof InviteError && e.code === 'too_many', 'the right code is not tried any more');
  assert.equal(await w.codes.hasAccess(B), false);
  assert.deepEqual(await w.codes.redeem(C, loose[0]), { ok: true }, 'someone else is not stopped');
  clock += 3_600_001;
  assert.deepEqual(await w.codes.redeem(B, loose[1]), { ok: true }, 'an hour later');
});
