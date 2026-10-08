-- Run in the same Supabase project as Daylight Auth.
-- Google secrets are encrypted by the Next.js server. Never put server keys here.
create table if not exists public.daylight_google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_ciphertext text not null check (length(token_ciphertext) between 1 and 16000),
  spreadsheet_id text not null check (spreadsheet_id ~ '^[a-zA-Z0-9_-]{10,200}$'),
  managed_tabs jsonb check (managed_tabs is null or jsonb_typeof(managed_tabs) = 'object'),
  backup_file_id text check (backup_file_id is null or backup_file_id ~ '^[a-zA-Z0-9_-]{10,200}$'),
  auto_sync boolean not null default true,
  last_synced_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 1000),
  sync_lock uuid,
  lock_expires_at timestamptz,
  sync_revision bigint not null default 0 check (sync_revision between 0 and 9007199254740991),
  snapshot_hash text check (snapshot_hash is null or snapshot_hash ~ '^[a-f0-9]{64}$'),
  constraint google_sync_lease_consistent check ((sync_lock is null) = (lock_expires_at is null))
);

alter table public.daylight_google_connections enable row level security;
revoke all on public.daylight_google_connections from anon;
revoke all on public.daylight_google_connections from public;
grant select, insert, update, delete on public.daylight_google_connections to authenticated;

drop policy if exists "Read own Google connection" on public.daylight_google_connections;
create policy "Read own Google connection" on public.daylight_google_connections for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Create own Google connection" on public.daylight_google_connections;
create policy "Create own Google connection" on public.daylight_google_connections for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Update own Google connection" on public.daylight_google_connections;
create policy "Update own Google connection" on public.daylight_google_connections for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own Google connection" on public.daylight_google_connections;
create policy "Delete own Google connection" on public.daylight_google_connections for delete to authenticated
  using ((select auth.uid()) = user_id);
