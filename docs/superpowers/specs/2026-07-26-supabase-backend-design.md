# Desain Fase 2: Backend Supabase (login + database pusat)

Tanggal: 2026-07-26. Lanjutan dari `2026-07-26-so-webapp-design.md`.

## Alasan

Permintaan user setelah fase 1 live: (1) hasil input harus tersimpan di database pusat, bukan hanya HP + file; (2) login username+password per karyawan supaya tidak ada penipuan pencatatan. Keduanya butuh backend → dipilih **Supabase** (free tier).

## Infrastruktur (SUDAH DIPASANG)

- Project: `agpsjjddzqrnrrhswday` (akun Supabase = GitHub ichanmahathirs), region Singapore.
- Publishable key (aman publik): `sb_publishable_ddi33tia1fcqmtrmbt9MPQ_PyZ__g7v`.
- Tabel `so_items`: id, user_id (default auth.uid), employee, rack, product, counts jsonb, qty_base (≥0), expired_date, master_version, created_at/updated_at (server), **unique (user_id, rack, product)**.
- Tabel `so_notes`: id, user_id, employee, rack, note, qty, created_at.
- RLS: select = semua user login; insert/update/delete = hanya baris milik sendiri (`auth.uid() = user_id`). Timestamp server tidak bisa dipalsu klien.

## Keputusan Desain

1. **Login**: username + password di form; di belakang layar `username@so-kartini.local` untuk Supabase Auth. Akun karyawan dibuat admin lewat dashboard Supabase (Authentication → Add user), bukan self-signup. Nama tampilan = bagian sebelum `@`.
2. **Alur simpan**: "Simpan" item → tulis lokal (localStorage, tetap sumber UI) → upsert ke `so_items` (onConflict user_id,rack,product). Offline → masuk **outbox** di localStorage → auto-flush saat online/di tiap simpan berikut. Indikator: `✓ tersinkron` / `⏳ N menunggu sinyal`.
3. **Admin Gabung**: sumber utama = query `so_items`+`so_notes` rentang tanggal (default hari ini), dikelompokkan per (employee, rack) menjadi bentuk "file hasil" lalu masuk `mergeResults` yang sudah teruji — deteksi duplikat antar karyawan tetap jalan. Upload file JSON tetap ada sebagai fallback offline.
4. **Duplikat satu user** (product+rack sama): tidak mungkin dobel di DB (unique + upsert) — edit ulang menimpa milik sendiri, sama seperti perilaku lokal.
5. **"SO Baru"** di HP hanya membersihkan data lokal. Baris DB tidak dihapus (jejak audit); Gabung memfilter per tanggal.
6. **Fallback file**: export/share JSON per rak dipertahankan (internet toko mati total).

## Di Luar Cakupan

- Buat akun karyawan dari dalam app (butuh service key/edge function — bahaya di app publik). Pakai dashboard.
- Reset password self-service; dashboard juga.
- Realtime subscription (refresh manual di Gabung cukup).
