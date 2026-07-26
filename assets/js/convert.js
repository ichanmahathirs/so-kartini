export function totalBase(counts, variants) {
  const factors = new Map(variants.map((v) => [v.label, v.factor]));
  let total = 0;
  for (const [label, raw] of Object.entries(counts)) {
    if (!factors.has(label)) throw new Error(`Varian tidak dikenal: ${label}`);
    if (raw === "" || raw === null || raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Qty tidak valid untuk ${label}: ${raw}`);
    total += n * factors.get(label);
  }
  return Math.round(total * 1000) / 1000;
}
