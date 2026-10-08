alter table public.recipes add column is_hidden boolean not null default false;
update public.recipes set cover_image=null,is_hidden=true where nullif(btrim(cover_image),'') is null or cover_image in ('/recipe-placeholder.svg','recipe-placeholder.svg');
alter policy public_read_recipes on public.recipes using (not is_hidden);
