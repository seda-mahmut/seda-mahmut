-- SEDA & MAHMUT - Fotoğraf yükleme için Supabase ayarları
-- Nasıl çalıştırılır: Supabase paneli > SQL Editor > New query > bu dosyayı yapıştır > Run
-- Birden fazla kez çalıştırmak güvenlidir.

-- 1) Bucket: herkese açık okuma, 10 MB sınır, izinli dosya türleri
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('engagement-photos', 'engagement-photos', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'];

-- 2) Storage izinleri: ziyaretçiler yükleyebilsin, herkes görebilsin
drop policy if exists "engagement photos upload" on storage.objects;
create policy "engagement photos upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'engagement-photos');

drop policy if exists "engagement photos read" on storage.objects;
create policy "engagement photos read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'engagement-photos');

-- 3) photos tablosu izinleri (tablo zaten varsa dokunulmaz)
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  guest_name text,
  created_at timestamptz not null default now()
);
alter table public.photos enable row level security;

drop policy if exists "photos insert" on public.photos;
create policy "photos insert" on public.photos
  for insert to anon, authenticated with check (true);

drop policy if exists "photos read" on public.photos;
create policy "photos read" on public.photos
  for select to anon, authenticated using (true);
