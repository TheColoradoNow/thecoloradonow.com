-- Run this entire file once in the Supabase SQL Editor. It is safe to run again.
begin;
create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (length(subject) between 1 and 150),
  preheader text not null default '' check (length(preheader) <= 160),
  introduction text not null default '' check (length(introduction) <= 6000),
  article_ids text[] not null default '{}',
  html text not null,
  revision integer not null default 1,
  tested_revision integer,
  provider_fingerprint text,
  brevo_id bigint,
  status text not null default 'draft' check (status in ('draft','preparing','submitting','submitted','scheduled','sent','review_required')),
  scheduled_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.newsletter_campaigns add column if not exists provider_fingerprint text;
alter table public.newsletter_campaigns enable row level security;
revoke all on public.newsletter_campaigns from public, anon, authenticated;
grant select, insert, update on public.newsletter_campaigns to service_role;
-- No browser-side policies: every editor action is authorized by the Edge Function.

create table if not exists public.newsletter_rate_limits (
  key text primary key check (length(key) = 64),
  window_started_at timestamptz not null default now(),
  hits integer not null default 1
);
create index if not exists newsletter_rate_limits_window_idx on public.newsletter_rate_limits(window_started_at);
alter table public.newsletter_rate_limits enable row level security;
revoke all on public.newsletter_rate_limits from public, anon, authenticated;
grant all on public.newsletter_rate_limits to service_role;

create or replace function public.newsletter_take_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if length(p_key) <> 64 or p_limit < 1 or p_limit > 1000 or p_seconds < 1 or p_seconds > 86400 then
    raise exception 'Invalid rate limit';
  end if;
  delete from public.newsletter_rate_limits where window_started_at < now() - interval '2 days';
  insert into public.newsletter_rate_limits as limits (key,window_started_at,hits)
    values (p_key,now(),1)
  on conflict (key) do update set
    hits = case when limits.window_started_at < now() - make_interval(secs => p_seconds)
      then 1 else least(limits.hits + 1, p_limit + 1) end,
    window_started_at = case when limits.window_started_at < now() - make_interval(secs => p_seconds)
      then now() else limits.window_started_at end
  returning hits <= p_limit into allowed;
  return allowed;
end;
$$;
revoke all on function public.newsletter_take_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.newsletter_take_rate_limit(text,integer,integer) to service_role;
commit;
