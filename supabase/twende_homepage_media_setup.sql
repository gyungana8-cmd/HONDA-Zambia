-- TWENDE Admin-managed passenger homepage imagery
-- Apply once in Supabase SQL Editor. Uses the existing twende_admins access list.

create table if not exists public.twende_homepage_settings (
  id text primary key check (id = 'passenger'),
  hero_background_path text,
  hero_car_path text,
  hero_motorcycle_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.twende_homepage_settings enable row level security;

drop policy if exists "Public can read TWENDE homepage settings" on public.twende_homepage_settings;
create policy "Public can read TWENDE homepage settings"
on public.twende_homepage_settings for select to anon, authenticated
using (true);

drop policy if exists "TWENDE admins can insert homepage settings" on public.twende_homepage_settings;
create policy "TWENDE admins can insert homepage settings"
on public.twende_homepage_settings for insert to authenticated
with check (exists(select 1 from public.twende_admins a where a.user_id=auth.uid()));

drop policy if exists "TWENDE admins can update homepage settings" on public.twende_homepage_settings;
create policy "TWENDE admins can update homepage settings"
on public.twende_homepage_settings for update to authenticated
using (exists(select 1 from public.twende_admins a where a.user_id=auth.uid()))
with check (exists(select 1 from public.twende_admins a where a.user_id=auth.uid()));

drop policy if exists "TWENDE admins can delete homepage settings" on public.twende_homepage_settings;
create policy "TWENDE admins can delete homepage settings"
on public.twende_homepage_settings for delete to authenticated
using (exists(select 1 from public.twende_admins a where a.user_id=auth.uid()));

grant select on public.twende_homepage_settings to anon, authenticated;
grant insert, update, delete on public.twende_homepage_settings to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'twende-homepage-assets',
  'twende-homepage-assets',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=true,
  file_size_limit=8388608,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view TWENDE homepage images" on storage.objects;
create policy "Public can view TWENDE homepage images"
on storage.objects for select to public
using (bucket_id='twende-homepage-assets');

drop policy if exists "TWENDE admins can upload homepage images" on storage.objects;
create policy "TWENDE admins can upload homepage images"
on storage.objects for insert to authenticated
with check (
  bucket_id='twende-homepage-assets'
  and exists(select 1 from public.twende_admins a where a.user_id=auth.uid())
);

drop policy if exists "TWENDE admins can update homepage images" on storage.objects;
create policy "TWENDE admins can update homepage images"
on storage.objects for update to authenticated
using (
  bucket_id='twende-homepage-assets'
  and exists(select 1 from public.twende_admins a where a.user_id=auth.uid())
)
with check (
  bucket_id='twende-homepage-assets'
  and exists(select 1 from public.twende_admins a where a.user_id=auth.uid())
);

drop policy if exists "TWENDE admins can delete homepage images" on storage.objects;
create policy "TWENDE admins can delete homepage images"
on storage.objects for delete to authenticated
using (
  bucket_id='twende-homepage-assets'
  and exists(select 1 from public.twende_admins a where a.user_id=auth.uid())
);

-- Seed the three images already uploaded to twende-homepage-assets.
-- Re-running this script safely refreshes these initial paths.
insert into public.twende_homepage_settings
  (id, hero_background_path, hero_car_path, hero_motorcycle_path)
values
  (
    'passenger',
    'hero_background_path/1795327351067-wllpwv.png',
    'hero_car_path/1795328399747-jdp0be.png',
    'hero_motorcycle_path/1795327718085-lix8e8.png'
  )
on conflict (id) do update set
  hero_background_path = excluded.hero_background_path,
  hero_car_path = excluded.hero_car_path,
  hero_motorcycle_path = excluded.hero_motorcycle_path,
  updated_at = now();

-- Admins can later replace each image independently from the Admin Portal.
