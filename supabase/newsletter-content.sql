alter table public.newsletter_campaigns
  add column if not exists content_details jsonb not null default '{}'::jsonb;
