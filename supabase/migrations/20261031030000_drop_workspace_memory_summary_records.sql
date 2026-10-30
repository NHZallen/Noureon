-- The old memory (a summary and an overview kept as sections) was replaced by the notes in workspace_memory_records (20261030010000); its data was dropped on purpose
-- (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, D5). Nothing reads or writes these any more, so the table and the function that wrote to it go.
-- Apply it to the real project only after the version with the notes is live on noureon.com: a page of the old version still writes here, and would fail to save its memory.
-- Dropping the table also drops its index, its policy and its place in any publication. This cannot be undone.
drop function if exists public.upsert_workspace_memory_summary_records(jsonb);
drop table if exists public.workspace_memory_summary_records;
