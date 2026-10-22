-- Migrations are plain SQL files in this directory, applied in name order by
-- `bun run db:migrate` (src/infra/scripts/migrate.ts). Each file runs once, with its record in
-- `schema_migration`, in one transaction; a file that has been applied is never edited, a
-- change is a new file with the next number.
create table module (
  id text primary key,
  name text not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- The list endpoint pages by (created_at, id).
create index module_created_at_id_idx on module (created_at, id);
