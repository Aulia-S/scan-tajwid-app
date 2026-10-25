-- Phase 3: global monthly cap on Cloud Vision calls (no accounts, so one counter for everyone).

create table public.scan_quota (
  month date primary key,          -- first day of the month, UTC
  count integer not null default 0
);

-- Only the Edge Function (service role) touches this table: RLS with no policies,
-- and Supabase's default grants to anon/authenticated are revoked as well.
alter table public.scan_quota enable row level security;
revoke all on table public.scan_quota from anon, authenticated;
grant select, insert, update on table public.scan_quota to service_role;

-- Atomically counts one scan if the month's count is still under p_limit.
-- The conditional upsert runs as a single statement, so concurrent scans can't overshoot.
create function public.consume_scan_quota(p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
set search_path = ''
as $$
declare
  current_month date := date_trunc('month', now() at time zone 'utc')::date;
  new_count integer;
begin
  if p_limit <= 0 then
    return query select false, coalesce((select q.count from public.scan_quota q where q.month = current_month), 0);
    return;
  end if;

  insert into public.scan_quota as q (month, count)
  values (current_month, 1)
  on conflict (month) do update set count = q.count + 1
    where q.count < p_limit
  returning q.count into new_count;

  if new_count is null then
    return query select false, (select q.count from public.scan_quota q where q.month = current_month);
  else
    return query select true, new_count;
  end if;
end;
$$;

revoke execute on function public.consume_scan_quota(integer) from public, anon, authenticated;
grant execute on function public.consume_scan_quota(integer) to service_role;
