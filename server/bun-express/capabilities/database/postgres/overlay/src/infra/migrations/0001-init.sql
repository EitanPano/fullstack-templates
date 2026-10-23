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

-- @auth-start
-- `user` is a reserved word, so the table is quoted wherever it is named.
create table "user" (
  id text primary key,
  email text not null,
  phone text,
  password_hash text,
  role text not null,
  status text not null,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- The controller lower-cases the email, so exact uniqueness is case-insensitive uniqueness.
create unique index user_email_idx on "user" (email);

-- An unverified phone is a claim anyone can type, so only a verified one is unique: it must not
-- block the real owner from verifying the number.
create unique index user_verified_phone_idx on "user" (phone) where phone_verified_at is not null;

-- The list endpoint pages by (created_at, id).
create index user_created_at_id_idx on "user" (created_at, id);

-- No foreign key to "user": modules stay independent of each other, and the session suites
-- create sessions for user ids that have no row.
create table session (
  id text primary key,
  user_id text not null,
  token_hash text not null,
  previous_token_hash text,
  rotated_at timestamptz,
  grace_token text,
  created_at timestamptz not null,
  last_used_at timestamptz not null,
  expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz
);

create index session_user_id_idx on session (user_id);
create index session_expires_at_idx on session (expires_at);
-- @auth-end
