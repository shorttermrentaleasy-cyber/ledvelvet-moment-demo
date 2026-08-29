-- Pin the lookup path for public functions reported by the Supabase security
-- advisor. pg_temp remains available, but only after the trusted public schema.
alter function public.touch_updated_at()
  set search_path = public, pg_temp;

alter function public.doorcheck_mark(uuid, text, text, text, text, text)
  set search_path = public, pg_temp;

alter function public.search_members_admin(text, text, integer, integer)
  set search_path = public, pg_temp;

alter function public.sync_wallyfor_to_members(integer)
  set search_path = public, pg_temp;

-- set_updated_at is a trigger function and must not be callable through the
-- exposed RPC API by anonymous or signed-in users.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
