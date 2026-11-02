-- SEDA & MAHMUT - Mesaj panosu için silme ayarları
-- (Anonymous sign-ins zaten açık olmalı; fotoğraf silme ayarını yaptıysan hazırsın.)
-- Supabase > SQL Editor > New query > yapıştır > Run.  Tekrar çalıştırmak güvenlidir.

-- 1) Her mesaja "kim yazdı" bilgisi eklenir (otomatik dolar)
alter table public.wishes add column if not exists owner_id uuid default auth.uid();

-- 2) Sadece kendi yazdığı mesajı silebilsin
drop policy if exists "wishes delete own" on public.wishes;
create policy "wishes delete own" on public.wishes
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- NOT: Bu ayardan ÖNCE yazılan mesajların sahibi boştur; ziyaretçiler silemez.
-- Test mesajlarını temizlemek için (HEPSİNİ siler):
--   delete from public.wishes;
