alter table public.events
  add column if not exists member_ticket_url text,
  add column if not exists member_ticket_enabled boolean not null default false;

comment on column public.events.member_ticket_url is
  'Private Xceed checkout URL for authenticated LV People members. Never expose through public event APIs.';

alter table public.xceed_tickets
  add column if not exists member_barcode text;

comment on column public.xceed_tickets.member_barcode is
  'Wallyfor barcode received from the native Xceed idNumber field.';

update public.xceed_tickets
set member_barcode = coalesce(
  nullif(raw #>> '{pass,idNumber}', ''),
  nullif(raw #>> '{ticket,idNumber}', ''),
  nullif(raw #>> '{booking,buyer,idNumber}', '')
)
where member_barcode is null
  and coalesce(
    nullif(raw #>> '{pass,idNumber}', ''),
    nullif(raw #>> '{ticket,idNumber}', ''),
    nullif(raw #>> '{booking,buyer,idNumber}', '')
  ) is not null;

create index if not exists xceed_tickets_event_member_barcode_idx
  on public.xceed_tickets (event_id, member_barcode)
  where member_barcode is not null and status <> 'cancelled';
