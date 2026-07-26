#!/usr/bin/env node
// Pakai: node scripts/build-master.mjs --xlsx "/path/file.xlsx" --racks rack1,rack2 --employees Ani,Budi [--out master.json]
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildMaster } from "../assets/js/master.js";

const XLSX = createRequire(import.meta.url)("../assets/vendor/xlsx.full.min.js");

const { values: opt } = parseArgs({
  options: {
    xlsx: { type: "string" },
    racks: { type: "string", default: "" },
    employees: { type: "string", default: "" },
    out: { type: "string", default: "master.json" },
  },
});
if (!opt.xlsx) {
  console.error("Wajib: --xlsx <path file export Olsera>");
  process.exit(1);
}

const wb = XLSX.read(readFileSync(opt.xlsx), { type: "buffer" });
const sheet = wb.Sheets["Bahan Resep (auto)"];
if (!sheet) {
  console.error(`Sheet "Bahan Resep (auto)" tidak ada. Sheet tersedia: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}
const resepRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
const tSheet = wb.Sheets["template baru (auto)"];
const templateRows = tSheet ? XLSX.utils.sheet_to_json(tSheet, { header: 1, raw: true }) : undefined;
if (!tSheet) console.warn('Peringatan: sheet "template baru (auto)" tidak ada — kolom sku akan kosong.');
const { products, warnings } = buildMaster(resepRows, templateRows);

const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const master = {
  version: new Date().toISOString().slice(0, 16),
  source: opt.xlsx.split("/").pop(),
  racks: splitList(opt.racks),
  employees: splitList(opt.employees),
  products,
};
writeFileSync(opt.out, JSON.stringify(master, null, 1));
console.log(`OK: ${products.length} produk, ${warnings.length} peringatan → ${opt.out}`);
for (const w of warnings) console.log(`  PERINGATAN: ${w.name} — ${w.problem}`);
