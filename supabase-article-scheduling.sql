-- The Colorado Now: article drafts and scheduling
-- Run this entire file once in the Supabase SQL Editor.
-- It is safe to run again if needed.

begin;

alter table public.articles
  add column if not exists status text;

alter table public.articles
  add column if not exists publish_at timestamptz;

update public.articles
set status = 'published'
where status is null
   or status not in ('draft', 'scheduled', 'published');

update public.articles
set publish_at = coalesce(publish_at, "timestamp", now())
where publish_at is null
  and status <> 'draft';

alter table public.articles
  alter column status set default 'published',
  alter column status set not null,
  alter column publish_at set default now();

alter table public.articles
  drop constraint if exists articles_status_check;

alter table public.articles
  add constraint articles_status_check
  check (status in ('draft', 'scheduled', 'published'));

create index if not exists articles_publication_schedule_idx
  on public.articles (status, publish_at desc);

alter table public.articles enable row level security;

-- Rebuild SELECT policies so anonymous visitors can only receive released stories.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'articles'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.articles', policy_record.policyname);
  end loop;
end
$$;

create policy "Public can read released articles"
on public.articles
for select
to anon
using (
  status in ('published', 'scheduled')
  and publish_at is not null
  and publish_at <= now()
);

create policy "Approved editors can read all articles"
on public.articles
for select
to authenticated
using (
  lower(auth.jwt() ->> 'email') in (
    'julianhanes5@gmail.com',
    'julian.hanes@thecoloradonow.com'
  )
);

-- Remove the broad table-level anonymous SELECT grant, then grant every
-- readable column except views. RLS still controls which rows are visible.
revoke select on public.articles from anon;

do $$
declare
  readable_columns text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into readable_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'articles'
    and column_name <> 'views';

  if readable_columns is null then
    raise exception 'Could not find readable columns for public.articles';
  end if;

  execute 'grant select (' || readable_columns || ') on public.articles to anon';
end
$$;

grant select on public.articles to authenticated;

commit;

-- Optional verification:
-- select id, title, status, publish_at, "timestamp"
-- from public.articles
-- order by coalesce(publish_at, "timestamp") desc;
