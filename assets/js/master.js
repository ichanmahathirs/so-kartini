export function buildMaster(resepRows, templateRows) {
  const [header, ...data] = resepRows;
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const need of ["product_name", "product_variant_name", "qty"]) {
    if (!(need in col)) throw new Error(`Kolom hilang di Bahan Resep: ${need}`);
  }
  const skuOf = new Map(); // "nama|varian" -> sku, dari sheet template baru (auto)
  if (templateRows?.length) {
    const [thead, ...tdata] = templateRows;
    const tcol = Object.fromEntries(thead.map((h, i) => [h, i]));
    if ("name" in tcol && "variant_names" in tcol && "sku" in tcol) {
      for (const r of tdata) {
        const n = String(r[tcol.name] ?? "").trim();
        const v = String(r[tcol.variant_names] ?? "").trim();
        const s = String(r[tcol.sku] ?? "").trim();
        if (n && s) skuOf.set(`${n}|${v}`, s);
      }
    }
  }
  const byName = new Map();
  for (const r of data) {
    const name = String(r[col.product_name] ?? "").trim();
    if (!name) continue;
    const label = String(r[col.product_variant_name] ?? "").trim();
    const factor = Number(r[col.qty]);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ label, factor, sku: skuOf.get(`${name}|${label}`) ?? "" });
  }
  const products = [];
  const warnings = [];
  for (const [name, variants] of byName) {
    if (variants.some((v) => !Number.isFinite(v.factor) || v.factor <= 0)) {
      warnings.push({ name, problem: "faktor tidak valid" });
      continue;
    }
    const bases = variants.filter((v) => v.factor === 1);
    if (bases.length !== 1) {
      warnings.push({ name, problem: bases.length === 0 ? "tidak ada varian faktor 1" : "lebih dari satu varian faktor 1" });
      continue;
    }
    variants.sort((a, b) => b.factor - a.factor);
    products.push({ name, baseVariant: bases[0].label, baseSku: bases[0].sku, variants });
  }
  products.sort((a, b) => a.name.localeCompare(b.name, "id"));
  return { products, warnings };
}
