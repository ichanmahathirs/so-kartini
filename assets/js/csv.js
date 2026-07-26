const HEADER = ["time", "product", "variant", "sku", "qty", "rack", "expired_date"];
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function buildCsv(rows, time) {
  const lines = [HEADER.map(esc).join(",")];
  for (const r of rows) {
    lines.push([time, r.product, r.variant, "", r.qty, r.rack, r.expiredDate ?? ""].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}
