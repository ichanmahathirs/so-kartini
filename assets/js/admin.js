import { buildMaster } from "./master.js";
import { mergeResults } from "./merge.js";
import { buildCsv } from "./csv.js";

const $ = (id) => document.getElementById(id);
let master = null; // master aktif (dari hosting atau hasil olah baru)
let mergedFiles = []; // file hasil yang sudah diparse
let resolutions = {};

const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const download = (name, text, type) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
};

async function init() {
  try {
    master = await (await fetch("master.json", { cache: "no-cache" })).json();
    $("racksInput").value = master.racks.join(", ");
    $("employeesInput").value = master.employees.join(", ");
    $("masterSummary").textContent = `Master aktif: versi ${master.version}, ${master.products.length} produk (sumber ${master.source}).`;
  } catch {
    $("masterSummary").textContent = "master.json belum ada di hosting — olah xlsx dulu.";
  }
}

$("tabMasterBtn").onclick = () => setTab(true);
$("tabGabungBtn").onclick = () => setTab(false);
function setTab(m) {
  $("masterTab").classList.toggle("hidden", !m);
  $("gabungTab").classList.toggle("hidden", m);
  $("tabMasterBtn").className = m ? "" : "secondary";
  $("tabGabungBtn").className = m ? "secondary" : "";
}

$("xlsxInput").onchange = async () => {
  const f = $("xlsxInput").files[0];
  if (!f) return;
  const wb = XLSX.read(await f.arrayBuffer());
  const sheet = wb.Sheets["Bahan Resep (auto)"];
  if (!sheet) {
    alert(`Sheet "Bahan Resep (auto)" tidak ada di file ini. Sheet tersedia: ${wb.SheetNames.join(", ")}`);
    return;
  }
  const { products, warnings } = buildMaster(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }));
  master = {
    version: new Date().toISOString().slice(0, 16),
    source: f.name,
    racks: splitList($("racksInput").value),
    employees: splitList($("employeesInput").value),
    products,
  };
  $("masterSummary").innerHTML =
    `Berhasil: <b>${products.length} produk</b>, ${warnings.length} peringatan.` +
    (warnings.length
      ? `<br>Produk bermasalah (perbaiki di Olsera):<br>` + warnings.map((w) => `• ${w.name} — ${w.problem}`).join("<br>")
      : "");
};

$("downloadMasterBtn").onclick = () => {
  if (!master) {
    alert("Olah xlsx dulu atau tunggu master dari hosting termuat.");
    return;
  }
  master.racks = splitList($("racksInput").value);
  master.employees = splitList($("employeesInput").value);
  download("master.json", JSON.stringify(master, null, 1), "application/json");
};

$("resultsInput").onchange = async () => {
  mergedFiles = [];
  resolutions = {};
  for (const f of $("resultsInput").files) {
    try {
      const data = JSON.parse(await f.text());
      if (!data.rack || !Array.isArray(data.items)) throw new Error("bukan file hasil SO");
      mergedFiles.push(data);
    } catch (e) {
      alert(`File ${f.name} dilewati: ${e.message}`);
    }
  }
  renderMerge();
};

function renderMerge() {
  if (!master) {
    $("mergeReport").textContent = "Master belum termuat.";
    return;
  }
  const r = mergeResults(mergedFiles, master, resolutions);
  const cov = r.rackCoverage.filter((x) => !x.counted).map((x) => x.rack);
  let html = `<p><b>${r.rows.length} baris</b> dari ${mergedFiles.length} file.</p>`;
  html += `<p>Per rak: ${Object.entries(r.perRack).map(([k, v]) => `${k}=${v}`).join(", ") || "-"}<br>`;
  html += `Per karyawan: ${Object.entries(r.perEmployee).map(([k, v]) => `${k}=${v}`).join(", ") || "-"}</p>`;
  if (cov.length) html += `<p>⚠️ Rak belum ada hasil: <b>${cov.join(", ")}</b></p>`;
  if (r.versionMismatches.length)
    html += `<p>⚠️ Versi master beda: ${r.versionMismatches.map((v) => `${v.employee}/${v.rack} (${v.version})`).join(", ")}</p>`;
  if (r.unknownProducts.length)
    html += `<p>⚠️ Produk tak dikenal (TIDAK masuk CSV): ${r.unknownProducts.map((u) => `${u.product} [${u.rack}]`).join(", ")}</p>`;
  if (r.notes.length) html += `<p>📝 Catatan manual:<br>${r.notes.map((n) => `• [${n.rack}/${n.employee}] ${n.text} (±${n.qty})`).join("<br>")}</p>`;
  for (const d of r.duplicates) {
    html += `<p>⚠️ Duplikat <b>${d.product}</b> di ${d.rack}: ` +
      `<button data-key="${encodeURIComponent(d.key)}" data-how="sum" class="secondary">Jumlahkan</button> ` +
      `<button data-key="${encodeURIComponent(d.key)}" data-how="last" class="secondary">Pakai terakhir</button></p>`;
  }
  $("mergeReport").innerHTML = html;
  for (const b of $("mergeReport").querySelectorAll("button[data-key]")) {
    b.onclick = () => {
      resolutions[decodeURIComponent(b.dataset.key)] = b.dataset.how;
      renderMerge();
    };
  }
  $("downloadCsvBtn").disabled = r.rows.length === 0 || r.duplicates.length > 0;
  $("downloadCsvBtn").onclick = () =>
    download(`SO_Olsera_${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(r.rows, $("soTime").value), "text/csv");
}

init();
