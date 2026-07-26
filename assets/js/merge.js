export function mergeResults(files, master, resolutions = {}) {
  const baseOf = new Map(master.products.map((p) => [p.name, p.baseVariant]));
  const skuOf = new Map(master.products.map((p) => [p.name, p.baseSku ?? ""]));
  const rows = new Map();
  const duplicates = [];
  const unknownProducts = [];
  const versionMismatches = [];
  const notes = [];
  const perEmployee = {};
  const perRack = {};

  for (const f of files) {
    if (f.masterVersion !== master.version) {
      versionMismatches.push({ employee: f.employee, rack: f.rack, version: f.masterVersion });
    }
    for (const n of f.notes ?? []) notes.push({ ...n, employee: f.employee, rack: f.rack });
    for (const item of f.items ?? []) {
      if (!baseOf.has(item.product)) {
        unknownProducts.push({ product: item.product, rack: f.rack, employee: f.employee });
        continue;
      }
      const key = `${item.product}|${f.rack}`;
      const row = { product: item.product, variant: baseOf.get(item.product), sku: skuOf.get(item.product), qty: item.qtyBase, rack: f.rack, expiredDate: item.expiredDate ?? "" };
      if (rows.has(key)) {
        const how = resolutions[key];
        if (how === "sum") rows.get(key).qty = Math.round((rows.get(key).qty + row.qty) * 1000) / 1000;
        else if (how === "last") rows.set(key, row);
        else if (how !== "first") duplicates.push({ key, product: item.product, rack: f.rack });
      } else {
        rows.set(key, row);
        perEmployee[f.employee] = (perEmployee[f.employee] ?? 0) + 1;
        perRack[f.rack] = (perRack[f.rack] ?? 0) + 1;
      }
    }
  }
  const out = [...rows.values()];
  const rackCoverage = (master.racks ?? []).map((rack) => ({ rack, counted: out.some((r) => r.rack === rack) }));
  return { rows: out, duplicates, unknownProducts, versionMismatches, notes, rackCoverage, perRack, perEmployee };
}
