create table if not exists public.xceed_poll_state (
  event_id uuid primary key
    references public.events(id)
    on delete cascade,

  last_polled_at timestamptz null,
  last_success_at timestamptz null,
  last_checked_in_time bigint null,
  lease_until timestamptz null,
  last_error text null,
  updated_at timestamptz not null default now()
);

alter table public.xceed_poll_state enable row level security;

insert into public.xceed_poll_state (event_id)
values ('9d49c0a1-30d9-4758-963b-fda8f30bbd0e')
on conflict (event_id) do nothing;
