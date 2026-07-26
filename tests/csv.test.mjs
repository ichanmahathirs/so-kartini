import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsv } from "../assets/js/csv.js";

test("format persis template Olsera (quote semua, LF, trailing newline)", () => {
  const out = buildCsv(
    [
      { product: "My product 3", variant: "yellow,xl", qty: 10, rack: "rack1", expiredDate: "2026-07-26" },
      { product: "My iPad Case", variant: "Merah", qty: 1, rack: "rack3", expiredDate: "" },
    ],
    "20:00"
  );
  assert.equal(
    out,
    '"time","product","variant","sku","qty","rack","expired_date"\n' +
      '"20:00","My product 3","yellow,xl","","10","rack1","2026-07-26"\n' +
      '"20:00","My iPad Case","Merah","","1","rack3",""\n'
  );
});

test("kutip ganda di nilai di-escape jadi dua kutip", () => {
  const out = buildCsv([{ product: 'Cup 12" Besar', variant: "Pcs", qty: 2, rack: "r1" }], "08:00");
  assert.ok(out.includes('"Cup 12"" Besar"'));
});

test("rows kosong tetap keluarkan header", () => {
  assert.equal(buildCsv([], "08:00"), '"time","product","variant","sku","qty","rack","expired_date"\n');
});
