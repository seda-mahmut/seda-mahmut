-- SEDA & MAHMUT - Fotoğraf silme özelliği için Supabase ayarları
-- ÖNCE (SQL'den önce) şunu aç:
--   Supabase paneli > Authentication > Sign In / Providers > "Allow anonymous sign-ins" = AÇIK > Save
-- Sonra: SQL Editor > New query > bu dosyayı yapıştır > Run.  Tekrar çalıştırmak güvenlidir.

-- 1) Her fotoğraf kaydına "kim yükledi" bilgisi eklenir (otomatik dolar)
alter table public.photos add column if not exists owner_id uuid default auth.uid();

-- 2) Kayıt silme izni: sadece kendi yüklediğini silebilir
drop policy if exists "photos delete own" on public.photos;
create policy "photos delete own" on public.photos
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- 3) Dosya silme izni: sadece kendi yüklediği dosya
drop policy if exists "engagement photos delete own" on storage.objects;
create policy "engagement photos delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'engagement-photos' and owner_id = (select auth.uid())::text);

-- NOT: Bu ayardan ÖNCE yüklenen (test) fotoğrafların sahibi boştur; onları ziyaretçiler silemez.
-- Gelin-damat olarak istediğin fotoğrafı Supabase panelinden silebilirsin:
--   Table Editor > photos > satırı sil  +  Storage > engagement-photos > dosyayı sil
