create table if not exists public.ticket_anomalies (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_ref text not null,
  anomaly_type text not null check (
    anomaly_type in ('inactive_membership', 'non_member', 'possible_duplicate', 'identity_review')
  ),
  status text not null default 'open' check (
    status in ('open', 'in_progress', 'waiting_participant', 'resolved', 'archived')
  ),
  member_id text,
  admin_note text,
  assigned_admin_email text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, ticket_ref)
);

create index if not exists ticket_anomalies_event_status_idx
  on public.ticket_anomalies (event_id, status);

create table if not exists public.ticket_anomaly_history (
  id bigint generated always as identity primary key,
  anomaly_id uuid not null references public.ticket_anomalies(id) on delete cascade,
  status text not null check (
    status in ('open', 'in_progress', 'waiting_participant', 'resolved', 'archived')
  ),
  note text,
  admin_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists ticket_anomaly_history_anomaly_created_idx
  on public.ticket_anomaly_history (anomaly_id, created_at desc);

alter table public.ticket_anomalies enable row level security;
alter table public.ticket_anomaly_history enable row level security;

comment on table public.ticket_anomalies is
  'Decisioni manuali admin sulle anomalie rilevate dal pre-controllo biglietti.';
comment on table public.ticket_anomaly_history is
  'Storico immutabile delle decisioni admin sulle anomalie dei biglietti.';
