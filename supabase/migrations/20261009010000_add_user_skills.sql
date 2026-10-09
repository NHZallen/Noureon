-- The skills (技能) a person added themselves, as the text of a SKILL.md (docs/superpowers/specs/2026-10-09-skills-design.md). The text is what a model is
-- given when the skill is used, so the limits here are the same as the ones the app and the server check (src/data/skill-format.js): a name of
-- lower-case words joined by hyphens up to 64 characters, a description up to 1024, a text up to 20000, and at most 50 skills for a person.
-- A person reads and changes only their own rows (the browser uses the signed-in session); the server reads them with its service role.

create table if not exists public.user_skills (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 64 and name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null check (char_length(description) between 1 and 1024),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

alter table public.user_skills enable row level security;
revoke all on table public.user_skills from anon, authenticated;
grant select, insert, update, delete on table public.user_skills to authenticated;
grant select, insert, update, delete on table public.user_skills to service_role;

drop policy if exists "Users read their own skills" on public.user_skills;
create policy "Users read their own skills" on public.user_skills
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users add their own skills" on public.user_skills;
create policy "Users add their own skills" on public.user_skills
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users change their own skills" on public.user_skills;
create policy "Users change their own skills" on public.user_skills
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users remove their own skills" on public.user_skills;
create policy "Users remove their own skills" on public.user_skills
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- At most 50 skills for a person (a backstop: the app says so before it asks).
create or replace function public.limit_user_skills()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.user_skills where user_id = new.user_id) >= 50 then
    raise exception 'skill_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_user_skills on public.user_skills;
create trigger limit_user_skills
  before insert on public.user_skills
  for each row execute function public.limit_user_skills();

comment on table public.user_skills is 'Skills (SKILL.md text) a person added: name, description, text. Each person reads and changes only their own.';
