# SO Kartini

Web app stok opname Toko Kartini → CSV import Olsera.
- `index.html` — karyawan (hitung per rak di HP)
- `admin.html` — admin (olah master xlsx, gabung hasil, download CSV)
- Test: `node --test tests/`
- Update master: `node scripts/build-master.mjs --xlsx <file> ...` lalu deploy ulang.

JANGAN commit file xlsx (berisi harga modal).
