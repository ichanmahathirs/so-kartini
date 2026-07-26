// ARSIP — kode yang terpasang di Apps Script spreadsheet "SO Kartini - Database"
// (Drive ichanmahathirs@gmail.com, Extensions → Apps Script). Trigger: refreshAll tiap 5 menit.
// EXPORT_SECRET asli TIDAK disimpan di repo (repo publik) — nilai aslinya ada di script
// terpasang; kalau perlu rotasi: UPDATE app_secrets di Supabase + ganti di script.
// RPC so_export_items/so_export_notes dibuat via SQL (lihat memory / SQL editor history).

const SUPABASE_URL = "https://agpsjjddzqrnrrhswday.supabase.co";
const API_KEY = "sb_publishable_ddi33tia1fcqmtrmbt9MPQ_PyZ__g7v";
const EXPORT_SECRET = "GANTI-DENGAN-SECRET-DARI-app_secrets";
const MASTER_URL = "https://ichanmahathirs.github.io/so-kartini/master.json";
const JAM_SO = "20:00"; // kolom time di tab Olsera

function refreshAll() {
  const items = rpc("so_export_items");
  const notes = rpc("so_export_notes");
  const master = JSON.parse(UrlFetchApp.fetch(MASTER_URL).getContentText());
  const baseOf = {};
  const skuOf = {};
  master.products.forEach(function (p) {
    baseOf[p.name] = p.baseVariant;
    skuOf[p.name] = p.baseSku || "";
  });
  writeRaw(items, notes);
  writeOlsera(items, baseOf, skuOf);
}

function rpc(fn) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
    method: "post",
    contentType: "application/json",
    headers: { apikey: API_KEY },
    payload: JSON.stringify({ secret: EXPORT_SECRET }),
  });
  return JSON.parse(res.getContentText());
}

function writeRaw(items, notes) {
  const head = ["Waktu (server)", "Karyawan", "Rak", "Produk", "Rincian Hitungan", "Qty Dasar", "ED", "Update Terakhir"];
  const rows = items.map(function (i) {
    return [jam(i.created_at), i.employee, i.rack, i.product, rincian(i.counts), Number(i.qty_base), i.expired_date || "", jam(i.updated_at)];
  });
  notes.forEach(function (n) {
    rows.push([jam(n.created_at), n.employee, n.rack, "(catatan) " + n.note, "", n.qty || "", "", ""]);
  });
  rows.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
  tulis("Data Mentah", head, rows);
}

function writeOlsera(items, baseOf, skuOf) {
  const map = {};
  items.forEach(function (i) {
    const k = i.rack + "|" + i.product;
    if (!map[k]) map[k] = { product: i.product, rack: i.rack, qty: 0, ed: "" };
    map[k].qty += Number(i.qty_base); // 2 karyawan hitung rak+produk sama -> dijumlah
    if (!map[k].ed && i.expired_date) map[k].ed = i.expired_date;
  });
  const head = ["time", "product", "variant", "sku", "qty", "rack", "expired_date"];
  const rows = Object.keys(map).map(function (k) {
    const r = map[k];
    return [JAM_SO, r.product, baseOf[r.product] || "??", skuOf[r.product] || "", r.qty, r.rack, r.ed];
  });
  tulis("Olsera", head, rows);
}

function tulis(nama, head, rows) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(nama) || ss.insertSheet(nama);
  sh.clearContents();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
}

function rincian(counts) {
  if (!counts) return "";
  return Object.keys(counts)
    .filter(function (k) { return counts[k] !== "" && counts[k] != null && Number(counts[k]) !== 0; })
    .map(function (k) { return counts[k] + " x " + k; })
    .join(", ");
}

function jam(iso) {
  return iso ? Utilities.formatDate(new Date(iso), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") : "";
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("refreshAll").timeBased().everyMinutes(5).create();
}
