-- Account data stays private to its owner. Apply in the Daylight project.
create table if not exists public.daylight_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entries jsonb not null default '{}'::jsonb check (jsonb_typeof(entries) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.daylight_workspaces enable row level security;
revoke all on public.daylight_workspaces from anon;
grant select, insert, update, delete on public.daylight_workspaces to authenticated;
create policy "Read own Daylight workspace" on public.daylight_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own Daylight workspace" on public.daylight_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own Daylight workspace" on public.daylight_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own Daylight workspace" on public.daylight_workspaces for delete to authenticated using ((select auth.uid()) = user_id);
