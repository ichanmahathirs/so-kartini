# Desain: Web App Stok Opname Toko Kartini

Tanggal: 2026-07-26
Status: menunggu review user

## Latar Belakang

Toko Kartini (grosir bahan kue + packaging) memakai Olsera POS. Stok sering selisih, terutama karena salah hitung konversi multi-satuan (Carton/Pack/Pcs). Olsera back office menerima import hasil stok opname (SO) lewat CSV dengan format persis:

```csv
"time","product","variant","sku","qty","rack","expired_date"
"20:00","My product 3","yellow,xl","","10","rack1","2026-07-26"
```

Tujuan: web app statis yang dipakai semua karyawan **bersamaan** saat SO, masing-masing di HP sendiri, menghasilkan satu CSV final format di atas yang siap diimport ke Olsera.

## Fakta Master Data (dari `7 Juli 2026.xlsx`)

- Sheet `template baru (auto)`: 3.715 baris = 1.136 barang `STOK ...` (`track_inventory=1`, satuan dasar: Pcs/Pack/250gr/dll) + 2.579 varian jual (`Pcs`, `Krtn (12 Pcs)`, `Kg (4 250gr)`, ...).
- Sheet `Bahan Resep (auto)`: 2.579 baris pemetaan varian jual → barang STOK, kolom `qty` = **faktor konversi ke satuan dasar**. Contoh Mentega Amanda Kuning 15kg: `250gr`=1, `Kg (4 250gr)`=4, `Krtn (15 Kg)`=60.
- Format baris SO yang benar (sudah dikonfirmasi user, contoh sheet `hahahhaa`): `product` = nama jual (tanpa awalan "STOK"), `variant` = varian satuan dasar (faktor 1, mis. `250gr`/`Pcs`), `qty` = jumlah dalam satuan dasar, `sku` kosong.

## Keputusan Desain (sudah disetujui user)

1. **Concurrent = bagi rak.** Tiap karyawan pakai HP sendiri, menghitung rak berbeda. Tidak ada sinkronisasi real-time; hasil digabung di akhir.
2. **Master produk** dari upload file export Olsera (xlsx seperti `7 Juli 2026.xlsx`), bukan ketik bebas.
3. **Hosting: GitHub Pages** (repo ini).
4. **Gabung hasil** lewat halaman admin di app yang sama.
5. **App menghitung konversi.** Karyawan mengisi qty per varian (2 Krtn + 3 Kg + 5 ×250gr), app menjumlahkan ke satuan dasar (137).
6. **Format output** mengikuti contoh sheet `hahahhaa`.
7. **Rak dipilih dari daftar** yang admin tentukan (bukan ketik bebas).
8. **expired_date opsional** per item.

## Arsitektur

- Web app statis: HTML + CSS + JavaScript murni, tanpa framework, tanpa server/backend.
- SheetJS (dibundel lokal, bukan CDN) untuk membaca xlsx — hanya dipakai halaman admin.
- PWA: manifest + service worker → app tetap jalan offline setelah pertama kali dibuka (wifi toko putus tidak masalah).
- Data hitungan tersimpan di `localStorage` HP masing-masing — tahan browser ditutup / HP mati.
- `master.json` ringkas ikut ter-deploy bersama app; hasil olahan xlsx di halaman admin.

### Struktur file (rencana)

```
index.html        # halaman karyawan
admin.html        # halaman admin (Master + Gabung)
assets/           # css, js, SheetJS, ikon
master.json       # data produk hasil olahan (ikut deploy)
manifest.json     # PWA
sw.js             # service worker
docs/superpowers/specs/   # dokumen desain
```

### Skema `master.json`

```json
{
  "version": "2026-07-26T10:00",
  "source": "7 Juli 2026.xlsx",
  "racks": ["rack1", "rack2", "gudang", "etalase"],
  "employees": ["Kristian", "..."],
  "products": [
    {
      "name": "Mentega Amanda Kuning 15kg",
      "baseVariant": "250gr",
      "variants": [
        { "label": "250gr", "factor": 1 },
        { "label": "Kg (4 250gr)", "factor": 4 },
        { "label": "Krtn (15 Kg)", "factor": 60 }
      ]
    }
  ]
}
```

- `products` dibangun dari varian jual di `Bahan Resep (auto)` yang dikelompokkan per nama produk; `factor` = kolom `qty`.
- `baseVariant` = varian dengan faktor 1. Jika satu produk punya lebih dari satu varian berfaktor 1, atau tidak punya sama sekali, produk masuk daftar peringatan di halaman admin (harus dibereskan di Olsera dulu).
- `racks` dan `employees` dikelola admin di halaman admin (bukan dari xlsx), tersimpan dalam `master.json`.

## Alur Karyawan (`index.html`)

1. **Mulai:** pilih nama sendiri + rak yang mau dihitung (keduanya dropdown dari master.json).
2. **Cari produk:** ketik sebagian nama (substring, case-insensitive) → daftar hasil, tap untuk pilih. Target sentuh besar, layar HP.
3. **Isi qty per varian:** form menampilkan semua varian produk, satu baris input per varian. Total satuan dasar terhitung live, ditampilkan besar. Input tanggal ED opsional.
4. **Simpan** → item masuk daftar rak berjalan; kembali ke pencarian.
5. **Daftar hasil** rak berjalan: tap item untuk edit/hapus; counter jumlah item.
6. **Selesai rak** → export file hasil `SO_<rak>_<nama>_<tanggal>.json` → Web Share API (langsung ke WA) dengan fallback download biasa.
7. Boleh ganti rak dan menghitung rak lain di HP yang sama; satu rak = satu file hasil.

Guard: produk yang sama diinput dua kali di rak yang sama → dialog pilihan **timpa / jumlahkan / batal**.

Produk tidak ditemukan di pencarian → tombol "Catat manual": nama bebas + qty + catatan, masuk bagian `notes` di file hasil (TIDAK masuk CSV final; ditampilkan ke admin di halaman Gabung untuk ditindaklanjuti).

### Format file hasil per HP

```json
{
  "masterVersion": "2026-07-26T10:00",
  "employee": "Kristian",
  "rack": "rack1",
  "exportedAt": "2026-07-26T21:30",
  "items": [
    {
      "product": "Mentega Amanda Kuning 15kg",
      "counts": { "Krtn (15 Kg)": 2, "Kg (4 250gr)": 3, "250gr": 5 },
      "qtyBase": 137,
      "expiredDate": "2027-01-15"
    }
  ],
  "notes": [ { "text": "ada 3 dus merek X gak ada di daftar", "qty": 3 } ]
}
```

`counts` (rincian per satuan) disimpan sebagai jejak audit; `qtyBase` yang dipakai untuk CSV.

## Alur Admin (`admin.html`)

**Tab Master:**
- Upload xlsx → parse sheet `template baru (auto)` + `Bahan Resep (auto)` → bangun `master.json`.
- Kelola daftar rak dan daftar karyawan (tambah/hapus).
- Rekap hasil olah: jumlah produk, varian, daftar produk bermasalah (baseVariant ambigu/hilang), timestamp versi.
- Download `master.json` (untuk deploy) + otomatis tersimpan di localStorage untuk dipakai langsung di device itu.

**Tab Gabung:**
- Upload banyak file hasil sekaligus.
- Validasi: `masterVersion` sama antar file (beda → peringatan, boleh lanjut); produk dikenal di master; duplikat produk+rak antar file → peringatan dengan pilihan **jumlahkan / timpa / batal**.
- Rekap sebelum download: total item per rak, per karyawan; daftar rak di master yang belum ada file hasilnya; daftar catatan manual dari semua file.
- Input jam SO (kolom `time`, satu nilai untuk semua baris, contoh `20:00`).
- **Download CSV final.**

### Aturan CSV final

- Header dan gaya persis template: semua nilai di-quote ganda, pemisah koma.
- Kolom: `time` = jam SO dari admin; `product` = nama jual; `variant` = baseVariant; `sku` = kosong; `qty` = qtyBase; `rack` = rak; `expired_date` = ED atau kosong.
- Encoding UTF-8. Line ending mengikuti file template asli (diverifikasi byte-nya saat implementasi).
- Nama file: `SO_Olsera_<tanggal>.csv`.

## Error Handling & Data

- Simpan ke localStorage pada setiap perubahan (bukan hanya saat tombol simpan).
- Qty: angka ≥ 0, desimal diperbolehkan, input kosong = 0. Total 0 valid dan boleh disimpan (stok fisik memang habis — penting untuk koreksi stok minus).
- Karyawan belum pilih nama/rak → tidak bisa mulai input.
- Tombol "SO Baru" (karyawan & admin) → hapus data SO lama setelah konfirmasi dua langkah.
- File hasil rusak/bukan format app → halaman Gabung menolak dengan pesan jelas, file lain tetap diproses.
- master.json gagal dimuat dari hosting → app memakai salinan terakhir di localStorage; jika tidak ada, tampil instruksi hubungi admin.

## Testing

1. **Tes unit logika inti** (dijalankan via Node, tanpa browser): fungsi konversi qty (2 Krtn + 3 Kg + 5 = 137; desimal; qty 0) dan fungsi penulis CSV (cocok gaya template byte-per-byte).
2. **Tes olah master asli:** parse `7 Juli 2026.xlsx` sungguhan, verifikasi 1.136 STOK / 2.579 varian / sampel faktor (Mentega Amanda 1-4-60).
3. **Tes alur manual di HP:** hitung → tutup browser → buka lagi (data utuh) → export → gabung → CSV.
4. **Uji import kecil ke Olsera** sebelum SO sungguhan: CSV 3 baris, pastikan stok berubah sesuai harapan.

## Di Luar Cakupan (YAGNI)

- Sinkronisasi real-time antar HP.
- Login/akun; identitas cukup pilih nama.
- Scan barcode (bisa jadi fase 2; struktur data tidak menghalangi).
- Perbandingan stok fisik vs stok sistem (selisih dihitung Olsera setelah import).
- Backend/database apa pun.
