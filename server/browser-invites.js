// The invite codes of the browser agent (design doc §9): each person with access has two codes to give away; whoever redeems one gets access and two codes. Used once, no end date.
// The accounts of BROWSER_ADMINS can make as many as they like (for the first people). Nothing of the tables goes to the pages but the person's own codes and whether they have access.

import { randomInt } from 'node:crypto';

export const CODES_PER_PERSON = 2;
// No 0, 1, I, O: a code is read out and typed.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHAPE = /^NRN-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const USER_ID = /^[0-9a-f-]{36}$/i;

export class InviteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InviteError';
    this.code = code;
  }
}

export const makeCode = (pick = (n) => randomInt(n)) => {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[pick(ALPHABET.length)]).join('');
  return `NRN-${part()}-${part()}`;
};

export function createBrowserInvites({ db, now = () => new Date(), makeId = makeCode }) {
  const checkUser = (userId) => { if (!USER_ID.test(String(userId || ''))) throw new InviteError('bad_user', 'That is not a person.'); };
  const mine = async (userId) => {
    const rows = await db.select('browser_invites', { filters: { owner_id: `eq.${userId}` }, select: 'code,redeemed_by,redeemed_at,created_at', order: 'created_at.asc', limit: 200 });
    return Array.isArray(rows) ? rows : [];
  };
  async function mint(userId, count) {
    const made = [];
    for (let i = 0; i < count; i += 1) {
      // A code that is already taken is only a collision: another is drawn.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = makeId();
        try {
          await db.insert('browser_invites', { code, owner_id: userId }, { returning: 'code' });
          made.push(code);
          break;
        } catch (error) {
          if (error?.code !== '23505' && error?.status !== 409) throw error;
        }
      }
    }
    return made;
  }
  return {
    /** Whether this person was let in by a code. */
    async hasAccess(userId) {
      checkUser(userId);
      const rows = await db.select('browser_access', { filters: { user_id: `eq.${userId}` }, select: 'user_id', limit: 1 });
      return Array.isArray(rows) && rows.length > 0;
    },
    /** The person's own codes (two are made the first time they are asked for, for a person with access), and which are used. */
    async codesOf(userId, { hasAccess }) {
      checkUser(userId);
      let rows = await mine(userId);
      if (hasAccess && rows.length === 0) { await mint(userId, CODES_PER_PERSON); rows = await mine(userId); }
      return rows.map((row) => ({ code: row.code, used: Boolean(row.redeemed_by), usedAt: row.redeemed_at || null }));
    },
    /** A code is redeemed: access for this person and two codes of their own. */
    async redeem(userId, text) {
      checkUser(userId);
      const code = String(text || '').trim().toUpperCase();
      if (!SHAPE.test(code)) throw new InviteError('invalid_code', 'That is not an invite code.');
      if (await this.hasAccess(userId)) throw new InviteError('already', 'You already have access.');
      const rows = await db.select('browser_invites', { filters: { code: `eq.${code}` }, select: 'code,owner_id,redeemed_by', limit: 1 });
      const found = rows?.[0];
      if (!found || found.redeemed_by) throw new InviteError('invalid_code', 'That code cannot be used.');
      if (found.owner_id === userId) throw new InviteError('own_code', 'You cannot use your own code.');
      // Taken only if it is still free: two people with the same code, only one gets it.
      const taken = await db.update('browser_invites', { code: `eq.${code}`, redeemed_by: 'is.null' }, { redeemed_by: userId, redeemed_at: now().toISOString() }, { returning: 'code' });
      if (!Array.isArray(taken) || taken.length === 0) throw new InviteError('invalid_code', 'That code cannot be used.');
      await db.upsert('browser_access', { user_id: userId, via_code: code }, { onConflict: 'user_id' });
      await mint(userId, CODES_PER_PERSON);
      return { ok: true };
    },
    /** For the people in charge: codes that belong to nobody (to give to the first people). */
    async mintLoose(count) {
      const wanted = Math.min(20, Math.max(1, Math.floor(Number(count)) || 1));
      const made = [];
      for (let i = 0; i < wanted; i += 1) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const code = makeId();
          try {
            await db.insert('browser_invites', { code }, { returning: 'code' });
            made.push(code);
            break;
          } catch (error) {
            if (error?.code !== '23505' && error?.status !== 409) throw error;
          }
        }
      }
      return made;
    }
  };
}
