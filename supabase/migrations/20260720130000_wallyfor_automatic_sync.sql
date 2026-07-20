alter table public.wallyfor_members
  add column if not exists source text not null default 'xls',
  add column if not exists is_present boolean not null default true,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_seen_sync_id uuid,
  add column if not exists missing_since timestamptz;

create index if not exists wallyfor_members_presence_idx
  on public.wallyfor_members (source, is_present);

create table if not exists public.wallyfor_sync_state (
  id smallint primary key check (id = 1),
  status text not null default 'never',
  started_at timestamptz,
  completed_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  fetched_count integer not null default 0,
  missing_count integer not null default 0,
  pages_count integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.wallyfor_sync_state (id)
values (1)
on conflict (id) do nothing;

alter table public.wallyfor_sync_state enable row level security;

comment on column public.wallyfor_members.is_present is
  'False only after a complete successful Wallyfor snapshot no longer returns this API member.';
comment on column public.wallyfor_members.missing_since is
  'First completed snapshot in which an API member was no longer returned; the member is never deleted.';
