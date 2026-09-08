-- Adds an optional caption for the full-size thumbnail on article pages.
-- Inline Word-document image captions are stored inside articles.body and
-- do not require additional database columns.

begin;

alter table public.articles
  add column if not exists image_caption text;

grant select (image_caption) on table public.articles
  to anon, authenticated;

grant insert (image_caption), update (image_caption) on table public.articles
  to authenticated;

commit;

