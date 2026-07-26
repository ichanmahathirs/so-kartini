import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMaster } from "../assets/js/master.js";

const HDR = ["to_all_store_id", "to_store_url_id", "product_name", "product_variant_name", "material_product_name", "material_variant_name", "qty", "uom", "uom_conversion"];
const row = (name, label, qty) => ["", "", name, label, `STOK ${name}`, "", qty, "x", "1"];

test("kelompokkan varian per produk, baseVariant = faktor 1, urut faktor desc", () => {
  const { products, warnings } = buildMaster([
    HDR,
    row("Mentega Amanda Kuning 15kg", "250gr", "1"),
    row("Mentega Amanda Kuning 15kg", "Kg (4 250gr)", "4"),
    row("Mentega Amanda Kuning 15kg", "Krtn (15 Kg)", "60"),
    row("Alu Cup 212/57", "Pack", "1"),
  ]);
  assert.equal(warnings.length, 0);
  assert.equal(products.length, 2);
  assert.equal(products[0].name, "Alu Cup 212/57");
  const m = products[1];
  assert.equal(m.baseVariant, "250gr");
  assert.deepEqual(m.variants.map((v) => v.factor), [60, 4, 1]);
});

const THDR = ["name", "variant_names", "sku"];
const trow = (name, label, sku) => [name, label, sku];

test("templateRows mengisi sku per varian + baseSku produk", () => {
  const { products } = buildMaster(
    [
      HDR,
      row("Mentega Amanda Kuning 15kg", "250gr", "1"),
      row("Mentega Amanda Kuning 15kg", "Krtn (15 Kg)", "60"),
    ],
    [
      THDR,
      trow("Mentega Amanda Kuning 15kg", "250gr", "BHK-0111-3"),
      trow("Mentega Amanda Kuning 15kg", "Krtn (15 Kg)", "BHK-0111-G"),
      trow("STOK Mentega Amanda Kuning 15kg", "", ""),
    ]
  );
  const m = products[0];
  assert.equal(m.baseSku, "BHK-0111-3");
  assert.equal(m.variants.find((v) => v.label === "Krtn (15 Kg)").sku, "BHK-0111-G");
});

test("tanpa templateRows: sku kosong, tetap jalan", () => {
  const { products } = buildMaster([HDR, row("Ok", "Pcs", "1")]);
  assert.equal(products[0].baseSku, "");
  assert.equal(products[0].variants[0].sku, "");
});

test("produk tanpa varian faktor 1 → warning, tidak masuk products", () => {
  const { products, warnings } = buildMaster([HDR, row("Aneh", "Krtn", "12")]);
  assert.equal(products.length, 0);
  assert.equal(warnings[0].name, "Aneh");
});

test("dua varian faktor 1 → warning", () => {
  const { warnings } = buildMaster([HDR, row("Dobel", "Pcs", "1"), row("Dobel", "Pack", "1")]);
  assert.match(warnings[0].problem, /lebih dari satu/);
});

test("faktor invalid (0/negatif/teks) → warning", () => {
  const { products, warnings } = buildMaster([HDR, row("Rusak", "Pcs", "1"), row("Rusak", "Krtn", "0")]);
  assert.equal(products.length, 0);
  assert.equal(warnings.length, 1);
});

test("kolom wajib hilang → error", () => {
  assert.throws(() => buildMaster([["a", "b"], ["", ""]]), /product_name/);
});

test("baris tanpa nama produk dilewati", () => {
  const { products } = buildMaster([HDR, row("", "Pcs", "1"), row("Ok", "Pcs", "1")]);
  assert.equal(products.length, 1);
});
