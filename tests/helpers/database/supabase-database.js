// A Postgres in memory (PGlite) with the parts of Supabase the migrations lean on, and then every file of supabase/migrations/ applied in order.
// What is stood in for: the roles (anon, authenticated, service_role), auth.users and auth.uid() (which reads the person from the setting a request
// carries, as Supabase does), the storage tables and the default grants Supabase gives the tables and functions of the public schema.
// Everything else is the real SQL, so the policies, the grants and the functions are what the project has.

import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

const SUPABASE_STAND_IN = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login;
create schema auth;
create schema storage;
create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
alter table storage.objects enable row level security;
-- As Supabase's: the folders of a name, without its last part (the file).
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create publication supabase_realtime;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** A database with all the migrations applied. `files` says which ones (all by default). */
export async function createDatabase({ upTo = null } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort().filter((name) => !upTo || name <= upTo);
  for (const file of files) {
    try {
      await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
  }

  /** The database as one role sees it: a request of that role (with that person for `authenticated`), one transaction for each call. */
  const as = (role, userId = null) => ({
    role,
    userId,
    async query(sql, params = []) {
      return db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        await tx.exec(`select set_config('request.jwt.claim.sub', ${quote(userId || '')}, true), set_config('request.jwt.claim.role', ${quote(role)}, true)`);
        return (await tx.query(sql, params)).rows;
      });
    },
    // The same, for a call that must fail: the error is returned (null when it did not fail).
    async error(sql, params = []) {
      try { await this.query(sql, params); return null; } catch (error) { return error; }
    }
  });

  const database = {
    db,
    as,
    anon: as('anon'),
    service: as('service_role'),
    asUser: (userId) => as('authenticated', userId),
    /** A person of the sign-in service. */
    async createUser(email = `${crypto.randomUUID()}@example.test`) {
      const { rows } = await db.query('insert into auth.users (email) values ($1) returning id', [email]);
      return rows[0].id;
    },
    close: () => db.close()
  };
  return database;
}

/** Calls an RPC the way the page does, with the rows as JSON. */
export const callWith = (client, name, rows) => client.query(`select public.${name}($1::jsonb)`, [JSON.stringify(rows)]);
