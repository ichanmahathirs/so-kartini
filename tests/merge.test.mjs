import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeResults } from "../assets/js/merge.js";

const MASTER = {
  version: "v1",
  racks: ["rack1", "rack2"],
  products: [
    { name: "Mentega", baseVariant: "250gr", variants: [] },
    { name: "Cup", baseVariant: "Pcs", variants: [] },
  ],
};
const file = (employee, rack, items, extra = {}) => ({ masterVersion: "v1", employee, rack, items, notes: [], ...extra });

test("gabung normal: baris pakai baseVariant, rekap per rak/karyawan", () => {
  const r = mergeResults(
    [
      file("Ani", "rack1", [{ product: "Mentega", qtyBase: 137, expiredDate: "2027-01-15" }]),
      file("Budi", "rack2", [{ product: "Cup", qtyBase: 10 }]),
    ],
    MASTER
  );
  assert.deepEqual(r.rows, [
    { product: "Mentega", variant: "250gr", qty: 137, rack: "rack1", expiredDate: "2027-01-15" },
    { product: "Cup", variant: "Pcs", qty: 10, rack: "rack2", expiredDate: "" },
  ]);
  assert.equal(r.duplicates.length, 0);
  assert.deepEqual(r.rackCoverage, [{ rack: "rack1", counted: true }, { rack: "rack2", counted: true }]);
  assert.deepEqual(r.perEmployee, { Ani: 1, Budi: 1 });
  assert.deepEqual(r.perRack, { rack1: 1, rack2: 1 });
});

test("produk tak dikenal masuk unknownProducts, tidak masuk rows", () => {
  const r = mergeResults([file("Ani", "rack1", [{ product: "Ghost", qtyBase: 1 }])], MASTER);
  assert.equal(r.rows.length, 0);
  assert.deepEqual(r.unknownProducts, [{ product: "Ghost", rack: "rack1", employee: "Ani" }]);
});

test("versi master beda tercatat", () => {
  const r = mergeResults([file("Ani", "rack1", [], { masterVersion: "v0" })], MASTER);
  assert.equal(r.versionMismatches.length, 1);
});

test("duplikat produk+rak tanpa resolusi → masuk duplicates, baris pertama dipakai", () => {
  const r = mergeResults(
    [file("Ani", "rack1", [{ product: "Cup", qtyBase: 5 }]), file("Budi", "rack1", [{ product: "Cup", qtyBase: 7 }])],
    MASTER
  );
  assert.deepEqual(r.duplicates, [{ key: "Cup|rack1", product: "Cup", rack: "rack1" }]);
  assert.equal(r.rows[0].qty, 5);
});

test("resolusi sum / last", () => {
  const files = [file("Ani", "rack1", [{ product: "Cup", qtyBase: 5 }]), file("Budi", "rack1", [{ product: "Cup", qtyBase: 7 }])];
  assert.equal(mergeResults(files, MASTER, { "Cup|rack1": "sum" }).rows[0].qty, 12);
  assert.equal(mergeResults(files, MASTER, { "Cup|rack1": "last" }).rows[0].qty, 7);
  assert.equal(mergeResults(files, MASTER, { "Cup|rack1": "sum" }).duplicates.length, 0);
});

test("notes dikumpulkan dengan identitas", () => {
  const r = mergeResults([file("Ani", "rack1", [], { notes: [{ text: "3 dus merek X", qty: 3 }] })], MASTER);
  assert.deepEqual(r.notes, [{ text: "3 dus merek X", qty: 3, employee: "Ani", rack: "rack1" }]);
});
